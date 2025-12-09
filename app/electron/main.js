const path = require("path");

// Load environment variables from .env file
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs/promises");
const os = require("os");
const agentService = require("./agent-service");
const autoModeService = require("./auto-mode-service");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
  });

  // Load Next.js dev server in development or production build
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:3007");
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../.next/server/app/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize agent service
  const appDataPath = app.getPath("userData");
  await agentService.initialize(appDataPath);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handlers

// Dialog handlers
ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result;
});

ipcMain.handle("dialog:openFile", async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    ...options,
  });
  return result;
});

// File system handlers
ipcMain.handle("fs:readFile", async (_, filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:writeFile", async (_, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:mkdir", async (_, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:readdir", async (_, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
    return { success: true, entries: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:exists", async (_, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:stat", async (_, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      success: true,
      stats: {
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        mtime: stats.mtime,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("fs:deleteFile", async (_, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App data path
ipcMain.handle("app:getPath", (_, name) => {
  return app.getPath(name);
});

// Save image to temp directory
ipcMain.handle("app:saveImageToTemp", async (_, { data, filename, mimeType }) => {
  try {
    // Create temp directory for images if it doesn't exist
    const tempDir = path.join(os.tmpdir(), "automaker-images");
    await fs.mkdir(tempDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const ext = mimeType.split("/")[1] || "png";
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempFilePath = path.join(tempDir, `${timestamp}_${safeName}`);

    // Remove data URL prefix if present (data:image/png;base64,...)
    const base64Data = data.includes(",") ? data.split(",")[1] : data;

    // Write image to temp file
    await fs.writeFile(tempFilePath, base64Data, "base64");

    console.log("[IPC] Saved image to temp:", tempFilePath);
    return { success: true, path: tempFilePath };
  } catch (error) {
    console.error("[IPC] Failed to save image to temp:", error);
    return { success: false, error: error.message };
  }
});

// IPC ping for testing communication
ipcMain.handle("ping", () => {
  return "pong";
});

// ============================================================================
// Agent IPC Handlers
// ============================================================================

/**
 * Start or resume a conversation session
 */
ipcMain.handle("agent:start", async (_, { sessionId, workingDirectory }) => {
  try {
    return await agentService.startConversation({ sessionId, workingDirectory });
  } catch (error) {
    console.error("[IPC] agent:start error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Send a message to the agent - returns immediately, streams via events
 */
ipcMain.handle("agent:send", async (event, { sessionId, message, workingDirectory, imagePaths }) => {
  try {
    // Create a function to send updates to the renderer
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("agent:stream", {
          sessionId,
          ...data,
        });
      }
    };

    // Start processing (runs in background)
    agentService
      .sendMessage({
        sessionId,
        message,
        workingDirectory,
        imagePaths,
        sendToRenderer,
      })
      .catch((error) => {
        console.error("[IPC] agent:send background error:", error);
        sendToRenderer({
          type: "error",
          error: error.message,
        });
      });

    // Return immediately
    return { success: true };
  } catch (error) {
    console.error("[IPC] agent:send error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get conversation history
 */
ipcMain.handle("agent:getHistory", (_, { sessionId }) => {
  try {
    return agentService.getHistory(sessionId);
  } catch (error) {
    console.error("[IPC] agent:getHistory error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Stop current agent execution
 */
ipcMain.handle("agent:stop", async (_, { sessionId }) => {
  try {
    return await agentService.stopExecution(sessionId);
  } catch (error) {
    console.error("[IPC] agent:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Clear conversation history
 */
ipcMain.handle("agent:clear", async (_, { sessionId }) => {
  try {
    return await agentService.clearSession(sessionId);
  } catch (error) {
    console.error("[IPC] agent:clear error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Session Management IPC Handlers
// ============================================================================

/**
 * List all sessions
 */
ipcMain.handle("sessions:list", async (_, { includeArchived }) => {
  try {
    const sessions = await agentService.listSessions({ includeArchived });
    return { success: true, sessions };
  } catch (error) {
    console.error("[IPC] sessions:list error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Create a new session
 */
ipcMain.handle("sessions:create", async (_, { name, projectPath, workingDirectory }) => {
  try {
    return await agentService.createSession({ name, projectPath, workingDirectory });
  } catch (error) {
    console.error("[IPC] sessions:create error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Update session metadata
 */
ipcMain.handle("sessions:update", async (_, { sessionId, name, tags }) => {
  try {
    return await agentService.updateSession({ sessionId, name, tags });
  } catch (error) {
    console.error("[IPC] sessions:update error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Archive a session
 */
ipcMain.handle("sessions:archive", async (_, { sessionId }) => {
  try {
    return await agentService.archiveSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:archive error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Unarchive a session
 */
ipcMain.handle("sessions:unarchive", async (_, { sessionId }) => {
  try {
    return await agentService.unarchiveSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:unarchive error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Delete a session permanently
 */
ipcMain.handle("sessions:delete", async (_, { sessionId }) => {
  try {
    return await agentService.deleteSession(sessionId);
  } catch (error) {
    console.error("[IPC] sessions:delete error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Auto Mode IPC Handlers
// ============================================================================

/**
 * Start auto mode - autonomous feature implementation
 */
ipcMain.handle("auto-mode:start", async (_, { projectPath }) => {
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.start({ projectPath, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:start error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Stop auto mode
 */
ipcMain.handle("auto-mode:stop", async () => {
  try {
    return await autoModeService.stop();
  } catch (error) {
    console.error("[IPC] auto-mode:stop error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Get auto mode status
 */
ipcMain.handle("auto-mode:status", () => {
  try {
    return { success: true, ...autoModeService.getStatus() };
  } catch (error) {
    console.error("[IPC] auto-mode:status error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Run a specific feature
 */
ipcMain.handle("auto-mode:run-feature", async (_, { projectPath, featureId }) => {
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.runFeature({ projectPath, featureId, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:run-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Verify a specific feature by running its tests
 */
ipcMain.handle("auto-mode:verify-feature", async (_, { projectPath, featureId }) => {
  console.log("[IPC] auto-mode:verify-feature called with:", { projectPath, featureId });
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.verifyFeature({ projectPath, featureId, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:verify-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Resume a specific feature with previous context
 */
ipcMain.handle("auto-mode:resume-feature", async (_, { projectPath, featureId }) => {
  console.log("[IPC] auto-mode:resume-feature called with:", { projectPath, featureId });
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.resumeFeature({ projectPath, featureId, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:resume-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Check if a context file exists for a feature
 */
ipcMain.handle("auto-mode:context-exists", async (_, { projectPath, featureId }) => {
  try {
    const contextPath = path.join(projectPath, ".automaker", "context", `${featureId}.md`);
    try {
      await fs.access(contextPath);
      return { success: true, exists: true };
    } catch {
      return { success: true, exists: false };
    }
  } catch (error) {
    console.error("[IPC] auto-mode:context-exists error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Analyze a new project - kicks off an agent to analyze the codebase
 * and update the app_spec.txt with tech stack and implemented features
 */
ipcMain.handle("auto-mode:analyze-project", async (_, { projectPath }) => {
  console.log("[IPC] auto-mode:analyze-project called with:", { projectPath });
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.analyzeProject({ projectPath, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:analyze-project error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Stop a specific feature
 */
ipcMain.handle("auto-mode:stop-feature", async (_, { featureId }) => {
  console.log("[IPC] auto-mode:stop-feature called with:", { featureId });
  try {
    return await autoModeService.stopFeature({ featureId });
  } catch (error) {
    console.error("[IPC] auto-mode:stop-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Follow-up on a feature with additional prompt
 */
ipcMain.handle("auto-mode:follow-up-feature", async (_, { projectPath, featureId, prompt, imagePaths }) => {
  console.log("[IPC] auto-mode:follow-up-feature called with:", { projectPath, featureId, prompt, imagePaths });
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.followUpFeature({ projectPath, featureId, prompt, imagePaths, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:follow-up-feature error:", error);
    return { success: false, error: error.message };
  }
});

/**
 * Commit changes for a feature (no further work, just commit)
 */
ipcMain.handle("auto-mode:commit-feature", async (_, { projectPath, featureId }) => {
  console.log("[IPC] auto-mode:commit-feature called with:", { projectPath, featureId });
  try {
    const sendToRenderer = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-mode:event", data);
      }
    };

    return await autoModeService.commitFeature({ projectPath, featureId, sendToRenderer });
  } catch (error) {
    console.error("[IPC] auto-mode:commit-feature error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Claude CLI Detection IPC Handlers
// ============================================================================

/**
 * Check Claude Code CLI installation status
 */
ipcMain.handle("claude:check-cli", async () => {
  try {
    const claudeCliDetector = require("./services/claude-cli-detector");
    const info = claudeCliDetector.getInstallationInfo();
    return { success: true, ...info };
  } catch (error) {
    console.error("[IPC] claude:check-cli error:", error);
    return { success: false, error: error.message };
  }
});
