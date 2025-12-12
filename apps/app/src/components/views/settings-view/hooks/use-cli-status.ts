import { useState, useEffect, useCallback } from "react";
import { useSetupStore } from "@/store/setup-store";
import { getElectronAPI } from "@/lib/electron";

interface CliStatusResult {
  success: boolean;
  status?: string;
  method?: string;
  version?: string;
  path?: string;
  recommendation?: string;
  installCommands?: {
    macos?: string;
    windows?: string;
    linux?: string;
    npm?: string;
  };
  error?: string;
}

interface CodexCliStatusResult extends CliStatusResult {
  hasApiKey?: boolean;
}

/**
 * Custom hook for managing Claude and Codex CLI status
 * Handles checking CLI installation, authentication, and refresh functionality
 */
export function useCliStatus() {
  const { setClaudeAuthStatus, setCodexAuthStatus } = useSetupStore();

  const [claudeCliStatus, setClaudeCliStatus] =
    useState<CliStatusResult | null>(null);

  const [codexCliStatus, setCodexCliStatus] =
    useState<CodexCliStatusResult | null>(null);

  const [isCheckingClaudeCli, setIsCheckingClaudeCli] = useState(false);
  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(false);

  // Check CLI status on mount
  useEffect(() => {
    const checkCliStatus = async () => {
      const api = getElectronAPI();

      // Check Claude CLI
      if (api?.checkClaudeCli) {
        try {
          const status = await api.checkClaudeCli();
          setClaudeCliStatus(status);
        } catch (error) {
          console.error("Failed to check Claude CLI status:", error);
        }
      }

      // Check Codex CLI
      if (api?.checkCodexCli) {
        try {
          const status = await api.checkCodexCli();
          setCodexCliStatus(status);
        } catch (error) {
          console.error("Failed to check Codex CLI status:", error);
        }
      }

      // Check Claude auth status (re-fetch on mount to ensure persistence)
      if (api?.setup?.getClaudeStatus) {
        try {
          const result = await api.setup.getClaudeStatus();
          if (result.success && result.auth) {
            // Cast to extended type that includes server-added fields
            const auth = result.auth as typeof result.auth & {
              oauthTokenValid?: boolean;
              apiKeyValid?: boolean;
            };
            // Map server method names to client method types
            // Server returns: oauth_token_env, oauth_token, api_key_env, api_key, credentials_file, cli_authenticated, none
            const validMethods = ["oauth_token_env", "oauth_token", "api_key", "api_key_env", "credentials_file", "cli_authenticated", "none"] as const;
            type AuthMethod = typeof validMethods[number];
            const method: AuthMethod = validMethods.includes(auth.method as AuthMethod)
              ? (auth.method as AuthMethod)
              : auth.authenticated ? "api_key" : "none"; // Default authenticated to api_key, not none
            const authStatus = {
              authenticated: auth.authenticated,
              method,
              hasCredentialsFile: auth.hasCredentialsFile ?? false,
              oauthTokenValid: auth.oauthTokenValid || auth.hasStoredOAuthToken || auth.hasEnvOAuthToken,
              apiKeyValid: auth.apiKeyValid || auth.hasStoredApiKey || auth.hasEnvApiKey,
              hasEnvOAuthToken: auth.hasEnvOAuthToken,
              hasEnvApiKey: auth.hasEnvApiKey,
            };
            setClaudeAuthStatus(authStatus);
          }
        } catch (error) {
          console.error("Failed to check Claude auth status:", error);
        }
      }

      // Check Codex auth status (re-fetch on mount to ensure persistence)
      if (api?.setup?.getCodexStatus) {
        try {
          const result = await api.setup.getCodexStatus();
          if (result.success && result.auth) {
            // Cast to extended type that includes server-added fields
            const auth = result.auth as typeof result.auth & {
              hasSubscription?: boolean;
              cliLoggedIn?: boolean;
              hasEnvApiKey?: boolean;
            };
            // Map server method names to client method types
            // Server returns: subscription, cli_verified, cli_tokens, api_key, env, none
            const validMethods = ["subscription", "cli_verified", "cli_tokens", "api_key", "env", "none"] as const;
            type CodexMethod = typeof validMethods[number];
            const method: CodexMethod = validMethods.includes(auth.method as CodexMethod)
              ? (auth.method as CodexMethod)
              : auth.authenticated ? "api_key" : "none"; // Default authenticated to api_key

            const authStatus = {
              authenticated: auth.authenticated,
              method,
              // Only set apiKeyValid for actual API key methods, not CLI login or subscription
              apiKeyValid:
                method === "cli_verified" || method === "cli_tokens" || method === "subscription"
                  ? undefined
                  : auth.hasAuthFile || auth.hasEnvKey || auth.hasEnvApiKey,
              hasSubscription: auth.hasSubscription,
              cliLoggedIn: auth.cliLoggedIn,
            };
            setCodexAuthStatus(authStatus);
          }
        } catch (error) {
          console.error("Failed to check Codex auth status:", error);
        }
      }
    };

    checkCliStatus();
  }, [setClaudeAuthStatus, setCodexAuthStatus]);

  // Refresh Claude CLI status
  const handleRefreshClaudeCli = useCallback(async () => {
    setIsCheckingClaudeCli(true);
    try {
      const api = getElectronAPI();
      if (api?.checkClaudeCli) {
        const status = await api.checkClaudeCli();
        setClaudeCliStatus(status);
      }
    } catch (error) {
      console.error("Failed to refresh Claude CLI status:", error);
    } finally {
      setIsCheckingClaudeCli(false);
    }
  }, []);

  // Refresh Codex CLI status
  const handleRefreshCodexCli = useCallback(async () => {
    setIsCheckingCodexCli(true);
    try {
      const api = getElectronAPI();
      if (api?.checkCodexCli) {
        const status = await api.checkCodexCli();
        setCodexCliStatus(status);
      }
    } catch (error) {
      console.error("Failed to refresh Codex CLI status:", error);
    } finally {
      setIsCheckingCodexCli(false);
    }
  }, []);

  return {
    claudeCliStatus,
    codexCliStatus,
    isCheckingClaudeCli,
    isCheckingCodexCli,
    handleRefreshClaudeCli,
    handleRefreshCodexCli,
  };
}
