/**
 * Setup routes - HTTP API for CLI detection, API keys, and platform info
 */

import { Router, type Request, type Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

// Storage for API keys (in-memory cache)
const apiKeys: Record<string, string> = {};

// Helper to persist API keys to .env file
async function persistApiKeyToEnv(key: string, value: string): Promise<void> {
  const envPath = path.join(process.cwd(), ".env");

  try {
    let envContent = "";
    try {
      envContent = await fs.readFile(envPath, "utf-8");
    } catch {
      // .env file doesn't exist, we'll create it
    }

    // Parse existing env content
    const lines = envContent.split("\n");
    const keyRegex = new RegExp(`^${key}=`);
    let found = false;
    const newLines = lines.map((line) => {
      if (keyRegex.test(line)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!found) {
      // Add the key at the end
      newLines.push(`${key}=${value}`);
    }

    await fs.writeFile(envPath, newLines.join("\n"));
    console.log(`[Setup] Persisted ${key} to .env file`);
  } catch (error) {
    console.error(`[Setup] Failed to persist ${key} to .env:`, error);
    throw error;
  }
}

export function createSetupRoutes(): Router {
  const router = Router();

  // Get Claude CLI status
  router.get("/claude-status", async (_req: Request, res: Response) => {
    try {
      let installed = false;
      let version = "";
      let cliPath = "";
      let method = "none";

      // Try to find Claude CLI
      try {
        const { stdout } = await execAsync("which claude || where claude 2>/dev/null");
        cliPath = stdout.trim();
        installed = true;
        method = "path";

        // Get version
        try {
          const { stdout: versionOut } = await execAsync("claude --version");
          version = versionOut.trim();
        } catch {
          // Version command might not be available
        }
      } catch {
        // Not in PATH, try common locations
        const commonPaths = [
          path.join(os.homedir(), ".local", "bin", "claude"),
          path.join(os.homedir(), ".claude", "local", "claude"),
          "/usr/local/bin/claude",
          path.join(os.homedir(), ".npm-global", "bin", "claude"),
        ];

        for (const p of commonPaths) {
          try {
            await fs.access(p);
            cliPath = p;
            installed = true;
            method = "local";

            // Get version from this path
            try {
              const { stdout: versionOut } = await execAsync(`"${p}" --version`);
              version = versionOut.trim();
            } catch {
              // Version command might not be available
            }
            break;
          } catch {
            // Not found at this path
          }
        }
      }

      // Check authentication - detect all possible auth methods
      // Note: apiKeys.anthropic_oauth_token stores OAuth tokens from subscription auth
      //       apiKeys.anthropic stores direct API keys for pay-per-use
      let auth = {
        authenticated: false,
        method: "none" as string,
        hasCredentialsFile: false,
        hasToken: false,
        hasStoredOAuthToken: !!apiKeys.anthropic_oauth_token,
        hasStoredApiKey: !!apiKeys.anthropic,
        hasEnvApiKey: !!process.env.ANTHROPIC_API_KEY,
        hasEnvOAuthToken: !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
        // Additional fields for detailed status
        oauthTokenValid: false,
        apiKeyValid: false,
        hasCliAuth: false,
        hasRecentActivity: false,
      };

      const claudeDir = path.join(os.homedir(), ".claude");

      // Check for recent Claude CLI activity - indicates working authentication
      // The stats-cache.json file is only populated when the CLI is working properly
      const statsCachePath = path.join(claudeDir, "stats-cache.json");
      try {
        const statsContent = await fs.readFile(statsCachePath, "utf-8");
        const stats = JSON.parse(statsContent);

        // Check if there's any activity (which means the CLI is authenticated and working)
        if (stats.dailyActivity && stats.dailyActivity.length > 0) {
          auth.hasRecentActivity = true;
          auth.hasCliAuth = true;
          auth.authenticated = true;
          auth.method = "cli_authenticated";
        }
      } catch {
        // Stats file doesn't exist or is invalid
      }

      // Check for settings.json - indicates CLI has been set up
      const settingsPath = path.join(claudeDir, "settings.json");
      try {
        await fs.access(settingsPath);
        // If settings exist but no activity, CLI might be set up but not authenticated
        if (!auth.hasCliAuth) {
          // Try to check for other indicators of auth
          const sessionsDir = path.join(claudeDir, "projects");
          try {
            const sessions = await fs.readdir(sessionsDir);
            if (sessions.length > 0) {
              auth.hasCliAuth = true;
              auth.authenticated = true;
              auth.method = "cli_authenticated";
            }
          } catch {
            // Sessions directory doesn't exist
          }
        }
      } catch {
        // Settings file doesn't exist
      }

      // Check for credentials file (OAuth tokens from claude login) - legacy/alternative auth
      const credentialsPath = path.join(claudeDir, "credentials.json");
      try {
        const credentialsContent = await fs.readFile(credentialsPath, "utf-8");
        const credentials = JSON.parse(credentialsContent);
        auth.hasCredentialsFile = true;

        // Check what type of token is in credentials
        if (credentials.oauth_token || credentials.access_token) {
          auth.hasStoredOAuthToken = true;
          auth.oauthTokenValid = true;
          auth.authenticated = true;
          auth.method = "oauth_token"; // Stored OAuth token from credentials file
        } else if (credentials.api_key) {
          auth.apiKeyValid = true;
          auth.authenticated = true;
          auth.method = "api_key"; // Stored API key in credentials file
        }
      } catch {
        // No credentials file or invalid format
      }

      // Environment variables override stored credentials (higher priority)
      if (auth.hasEnvOAuthToken) {
        auth.authenticated = true;
        auth.oauthTokenValid = true;
        auth.method = "oauth_token_env"; // OAuth token from CLAUDE_CODE_OAUTH_TOKEN env var
      } else if (auth.hasEnvApiKey) {
        auth.authenticated = true;
        auth.apiKeyValid = true;
        auth.method = "api_key_env"; // API key from ANTHROPIC_API_KEY env var
      }

      // In-memory stored OAuth token (from setup wizard - subscription auth)
      if (!auth.authenticated && apiKeys.anthropic_oauth_token) {
        auth.authenticated = true;
        auth.oauthTokenValid = true;
        auth.method = "oauth_token"; // Stored OAuth token from setup wizard
      }

      // In-memory stored API key (from settings UI - pay-per-use)
      if (!auth.authenticated && apiKeys.anthropic) {
        auth.authenticated = true;
        auth.apiKeyValid = true;
        auth.method = "api_key"; // Manually stored API key
      }

      res.json({
        success: true,
        status: installed ? "installed" : "not_installed",
        installed,
        method,
        version,
        path: cliPath,
        auth,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get Codex CLI status
  router.get("/codex-status", async (_req: Request, res: Response) => {
    try {
      let installed = false;
      let version = "";
      let cliPath = "";
      let method = "none";

      // Try to find Codex CLI
      try {
        const { stdout } = await execAsync("which codex || where codex 2>/dev/null");
        cliPath = stdout.trim();
        installed = true;
        method = "path";

        try {
          const { stdout: versionOut } = await execAsync("codex --version");
          version = versionOut.trim();
        } catch {
          // Version command might not be available
        }
      } catch {
        // Not found
      }

      // Check for OpenAI/Codex authentication
      let auth = {
        authenticated: false,
        method: "none" as string,
        hasAuthFile: false,
        hasEnvKey: !!process.env.OPENAI_API_KEY,
        hasStoredApiKey: !!apiKeys.openai,
        hasEnvApiKey: !!process.env.OPENAI_API_KEY,
        // Additional fields for subscription/account detection
        hasSubscription: false,
        cliLoggedIn: false,
      };

      // Check for OpenAI CLI auth file (~/.codex/auth.json or similar)
      const codexAuthPaths = [
        path.join(os.homedir(), ".codex", "auth.json"),
        path.join(os.homedir(), ".openai", "credentials"),
        path.join(os.homedir(), ".config", "openai", "credentials.json"),
      ];

      for (const authPath of codexAuthPaths) {
        try {
          const authContent = await fs.readFile(authPath, "utf-8");
          const authData = JSON.parse(authContent);
          auth.hasAuthFile = true;

          // Check for subscription/tokens
          if (authData.subscription || authData.plan || authData.account_type) {
            auth.hasSubscription = true;
            auth.authenticated = true;
            auth.method = "subscription"; // Codex subscription (Plus/Team)
          } else if (authData.access_token || authData.api_key) {
            auth.cliLoggedIn = true;
            auth.authenticated = true;
            auth.method = "cli_verified"; // CLI logged in with account
          }
          break;
        } catch {
          // Auth file not found at this path
        }
      }

      // Environment variable has highest priority
      if (auth.hasEnvApiKey) {
        auth.authenticated = true;
        auth.method = "env"; // OPENAI_API_KEY environment variable
      }

      // In-memory stored API key (from settings UI)
      if (!auth.authenticated && apiKeys.openai) {
        auth.authenticated = true;
        auth.method = "api_key"; // Manually stored API key
      }

      res.json({
        success: true,
        status: installed ? "installed" : "not_installed",
        method,
        version,
        path: cliPath,
        auth,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Install Claude CLI
  router.post("/install-claude", async (_req: Request, res: Response) => {
    try {
      // In web mode, we can't install CLIs directly
      // Return instructions instead
      res.json({
        success: false,
        error:
          "CLI installation requires terminal access. Please install manually using: npm install -g @anthropic-ai/claude-code",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Install Codex CLI
  router.post("/install-codex", async (_req: Request, res: Response) => {
    try {
      res.json({
        success: false,
        error:
          "CLI installation requires terminal access. Please install manually using: npm install -g @openai/codex",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Auth Claude
  router.post("/auth-claude", async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        requiresManualAuth: true,
        command: "claude login",
        message: "Please run 'claude login' in your terminal to authenticate",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Auth Codex
  router.post("/auth-codex", async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body as { apiKey?: string };

      if (apiKey) {
        apiKeys.openai = apiKey;
        process.env.OPENAI_API_KEY = apiKey;
        res.json({ success: true });
      } else {
        res.json({
          success: true,
          requiresManualAuth: true,
          command: "codex auth login",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Store API key
  router.post("/store-api-key", async (req: Request, res: Response) => {
    try {
      const { provider, apiKey } = req.body as { provider: string; apiKey: string };

      if (!provider || !apiKey) {
        res.status(400).json({ success: false, error: "provider and apiKey required" });
        return;
      }

      apiKeys[provider] = apiKey;

      // Also set as environment variable and persist to .env
      // IMPORTANT: OAuth tokens and API keys must be stored separately
      // - OAuth tokens (subscription auth) -> CLAUDE_CODE_OAUTH_TOKEN
      // - API keys (pay-per-use) -> ANTHROPIC_API_KEY
      if (provider === "anthropic_oauth_token") {
        // OAuth token from claude setup-token (subscription-based auth)
        process.env.CLAUDE_CODE_OAUTH_TOKEN = apiKey;
        await persistApiKeyToEnv("CLAUDE_CODE_OAUTH_TOKEN", apiKey);
        console.log("[Setup] Stored OAuth token as CLAUDE_CODE_OAUTH_TOKEN");
      } else if (provider === "anthropic") {
        // Direct API key (pay-per-use)
        process.env.ANTHROPIC_API_KEY = apiKey;
        await persistApiKeyToEnv("ANTHROPIC_API_KEY", apiKey);
        console.log("[Setup] Stored API key as ANTHROPIC_API_KEY");
      } else if (provider === "openai") {
        process.env.OPENAI_API_KEY = apiKey;
        await persistApiKeyToEnv("OPENAI_API_KEY", apiKey);
      } else if (provider === "google") {
        process.env.GOOGLE_API_KEY = apiKey;
        await persistApiKeyToEnv("GOOGLE_API_KEY", apiKey);
      }

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get API keys status
  router.get("/api-keys", async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        hasAnthropicKey: !!apiKeys.anthropic || !!process.env.ANTHROPIC_API_KEY,
        hasOpenAIKey: !!apiKeys.openai || !!process.env.OPENAI_API_KEY,
        hasGoogleKey: !!apiKeys.google || !!process.env.GOOGLE_API_KEY,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Configure Codex MCP
  router.post("/configure-codex-mcp", async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: "projectPath required" });
        return;
      }

      // Create .codex directory and config
      const codexDir = path.join(projectPath, ".codex");
      await fs.mkdir(codexDir, { recursive: true });

      const configPath = path.join(codexDir, "config.toml");
      const config = `# Codex configuration
[mcp]
enabled = true
`;
      await fs.writeFile(configPath, config);

      res.json({ success: true, configPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get platform info
  router.get("/platform", async (_req: Request, res: Response) => {
    try {
      const platform = os.platform();
      res.json({
        success: true,
        platform,
        arch: os.arch(),
        homeDir: os.homedir(),
        isWindows: platform === "win32",
        isMac: platform === "darwin",
        isLinux: platform === "linux",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Test OpenAI connection
  router.post("/test-openai", async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body as { apiKey?: string };
      const key = apiKey || apiKeys.openai || process.env.OPENAI_API_KEY;

      if (!key) {
        res.json({ success: false, error: "No OpenAI API key provided" });
        return;
      }

      // Simple test - just verify the key format
      if (!key.startsWith("sk-")) {
        res.json({ success: false, error: "Invalid OpenAI API key format" });
        return;
      }

      res.json({ success: true, message: "API key format is valid" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
