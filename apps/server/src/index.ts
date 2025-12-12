/**
 * Automaker Backend Server
 *
 * Provides HTTP/WebSocket API for both web and Electron modes.
 * In Electron mode, this server runs locally.
 * In web mode, this server runs on a remote host.
 */

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import dotenv from "dotenv";

import { createEventEmitter, type EventEmitter } from "./lib/events.js";
import { initAllowedPaths } from "./lib/security.js";
import { authMiddleware, getAuthStatus } from "./lib/auth.js";
import { createFsRoutes } from "./routes/fs.js";
import { createHealthRoutes } from "./routes/health.js";
import { createAgentRoutes } from "./routes/agent.js";
import { createSessionsRoutes } from "./routes/sessions.js";
import { createFeaturesRoutes } from "./routes/features.js";
import { createAutoModeRoutes } from "./routes/auto-mode.js";
import { createWorktreeRoutes } from "./routes/worktree.js";
import { createGitRoutes } from "./routes/git.js";
import { createSetupRoutes } from "./routes/setup.js";
import { createSuggestionsRoutes } from "./routes/suggestions.js";
import { createModelsRoutes } from "./routes/models.js";
import { createSpecRegenerationRoutes } from "./routes/spec-regeneration.js";
import { createRunningAgentsRoutes } from "./routes/running-agents.js";
import { createWorkspaceRoutes } from "./routes/workspace.js";
import { AgentService } from "./services/agent-service.js";
import { FeatureLoader } from "./services/feature-loader.js";

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || "3008", 10);
const DATA_DIR = process.env.DATA_DIR || "./data";

// Check for required environment variables
// Claude Agent SDK supports EITHER OAuth token (subscription) OR API key (pay-per-use)
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

if (!hasAnthropicKey && !hasOAuthToken) {
  console.warn(`
╔═══════════════════════════════════════════════════════════════════════╗
║  ⚠️  WARNING: No Claude authentication configured                      ║
║                                                                       ║
║  The Claude Agent SDK requires authentication to function.            ║
║                                                                       ║
║  Option 1 - Subscription (OAuth Token):                               ║
║    export CLAUDE_CODE_OAUTH_TOKEN="your-oauth-token"                  ║
║                                                                       ║
║  Option 2 - Pay-per-use (API Key):                                    ║
║    export ANTHROPIC_API_KEY="sk-ant-..."                              ║
║                                                                       ║
║  Or use the setup wizard in Settings to configure authentication.     ║
╚═══════════════════════════════════════════════════════════════════════╝
`);
} else if (hasOAuthToken) {
  console.log("[Server] ✓ CLAUDE_CODE_OAUTH_TOKEN detected (subscription auth)");
} else {
  console.log("[Server] ✓ ANTHROPIC_API_KEY detected (API key auth)");
}

// Initialize security
initAllowedPaths();

// Create Express app
const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));

// Create shared event emitter for streaming
const events: EventEmitter = createEventEmitter();

// Create services
const agentService = new AgentService(DATA_DIR, events);
const featureLoader = new FeatureLoader();

// Initialize services
(async () => {
  await agentService.initialize();
  console.log("[Server] Agent service initialized");
})();

// Mount API routes - health is unauthenticated for monitoring
app.use("/api/health", createHealthRoutes());

// Apply authentication to all other routes
app.use("/api", authMiddleware);

app.use("/api/fs", createFsRoutes(events));
app.use("/api/agent", createAgentRoutes(agentService, events));
app.use("/api/sessions", createSessionsRoutes(agentService));
app.use("/api/features", createFeaturesRoutes(featureLoader));
app.use("/api/auto-mode", createAutoModeRoutes(events));
app.use("/api/worktree", createWorktreeRoutes());
app.use("/api/git", createGitRoutes());
app.use("/api/setup", createSetupRoutes());
app.use("/api/suggestions", createSuggestionsRoutes(events));
app.use("/api/models", createModelsRoutes());
app.use("/api/spec-regeneration", createSpecRegenerationRoutes(events));
app.use("/api/running-agents", createRunningAgentsRoutes());
app.use("/api/workspace", createWorkspaceRoutes());

// Create HTTP server
const server = createServer(app);

// WebSocket server for streaming events
const wss = new WebSocketServer({ server, path: "/api/events" });

wss.on("connection", (ws: WebSocket) => {
  console.log("[WebSocket] Client connected");

  // Subscribe to all events and forward to this client
  const unsubscribe = events.subscribe((type, payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  });

  ws.on("close", () => {
    console.log("[WebSocket] Client disconnected");
    unsubscribe();
  });

  ws.on("error", (error) => {
    console.error("[WebSocket] Error:", error);
    unsubscribe();
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║           Automaker Backend Server                    ║
╠═══════════════════════════════════════════════════════╣
║  HTTP API:    http://localhost:${PORT}                  ║
║  WebSocket:   ws://localhost:${PORT}/api/events         ║
║  Health:      http://localhost:${PORT}/api/health       ║
╚═══════════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
