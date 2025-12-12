import { create } from "zustand";
import { persist } from "zustand/middleware";

// CLI Installation Status
export interface CliStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  method: string;
  error?: string;
}

// Claude Auth Method - all possible authentication sources
export type ClaudeAuthMethod =
  | "oauth_token_env"    // CLAUDE_CODE_OAUTH_TOKEN environment variable
  | "oauth_token"        // Stored OAuth token from claude login
  | "api_key_env"        // ANTHROPIC_API_KEY environment variable
  | "api_key"            // Manually stored API key
  | "credentials_file"   // Generic credentials file detection
  | "cli_authenticated"  // Claude CLI is installed and has active sessions/activity
  | "none";

// Claude Auth Status
export interface ClaudeAuthStatus {
  authenticated: boolean;
  method: ClaudeAuthMethod;
  hasCredentialsFile?: boolean;
  oauthTokenValid?: boolean;
  apiKeyValid?: boolean;
  hasEnvOAuthToken?: boolean;
  hasEnvApiKey?: boolean;
  error?: string;
}

// Codex Auth Method - all possible authentication sources
export type CodexAuthMethod =
  | "subscription"       // Codex/OpenAI Plus or Team subscription
  | "cli_verified"       // CLI logged in with OpenAI account
  | "cli_tokens"         // CLI with stored access tokens
  | "api_key"            // Manually stored API key
  | "env"                // OPENAI_API_KEY environment variable
  | "none";

// Codex Auth Status
export interface CodexAuthStatus {
  authenticated: boolean;
  method: CodexAuthMethod;
  apiKeyValid?: boolean;
  mcpConfigured?: boolean;
  hasSubscription?: boolean;
  cliLoggedIn?: boolean;
  error?: string;
}

// Installation Progress
export interface InstallProgress {
  isInstalling: boolean;
  currentStep: string;
  progress: number; // 0-100
  output: string[];
  error?: string;
}

export type SetupStep =
  | "welcome"
  | "claude_detect"
  | "claude_auth"
  | "codex_detect"
  | "codex_auth"
  | "complete";

export interface SetupState {
  // Setup wizard state
  isFirstRun: boolean;
  setupComplete: boolean;
  currentStep: SetupStep;

  // Claude CLI state
  claudeCliStatus: CliStatus | null;
  claudeAuthStatus: ClaudeAuthStatus | null;
  claudeInstallProgress: InstallProgress;

  // Codex CLI state
  codexCliStatus: CliStatus | null;
  codexAuthStatus: CodexAuthStatus | null;
  codexInstallProgress: InstallProgress;

  // Setup preferences
  skipClaudeSetup: boolean;
  skipCodexSetup: boolean;
}

export interface SetupActions {
  // Setup flow
  setCurrentStep: (step: SetupStep) => void;
  completeSetup: () => void;
  resetSetup: () => void;
  setIsFirstRun: (isFirstRun: boolean) => void;

  // Claude CLI
  setClaudeCliStatus: (status: CliStatus | null) => void;
  setClaudeAuthStatus: (status: ClaudeAuthStatus | null) => void;
  setClaudeInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetClaudeInstallProgress: () => void;

  // Codex CLI
  setCodexCliStatus: (status: CliStatus | null) => void;
  setCodexAuthStatus: (status: CodexAuthStatus | null) => void;
  setCodexInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetCodexInstallProgress: () => void;

  // Preferences
  setSkipClaudeSetup: (skip: boolean) => void;
  setSkipCodexSetup: (skip: boolean) => void;
}

const initialInstallProgress: InstallProgress = {
  isInstalling: false,
  currentStep: "",
  progress: 0,
  output: [],
};

const initialState: SetupState = {
  isFirstRun: true,
  setupComplete: false,
  currentStep: "welcome",

  claudeCliStatus: null,
  claudeAuthStatus: null,
  claudeInstallProgress: { ...initialInstallProgress },

  codexCliStatus: null,
  codexAuthStatus: null,
  codexInstallProgress: { ...initialInstallProgress },

  skipClaudeSetup: false,
  skipCodexSetup: false,
};

export const useSetupStore = create<SetupState & SetupActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Setup flow
      setCurrentStep: (step) => set({ currentStep: step }),

      completeSetup: () => set({ setupComplete: true, currentStep: "complete" }),

      resetSetup: () => set({
        ...initialState,
        isFirstRun: false, // Don't reset first run flag
      }),

      setIsFirstRun: (isFirstRun) => set({ isFirstRun }),

      // Claude CLI
      setClaudeCliStatus: (status) => set({ claudeCliStatus: status }),

      setClaudeAuthStatus: (status) => set({ claudeAuthStatus: status }),

      setClaudeInstallProgress: (progress) => set({
        claudeInstallProgress: {
          ...get().claudeInstallProgress,
          ...progress,
        },
      }),

      resetClaudeInstallProgress: () => set({
        claudeInstallProgress: { ...initialInstallProgress },
      }),

      // Codex CLI
      setCodexCliStatus: (status) => set({ codexCliStatus: status }),

      setCodexAuthStatus: (status) => set({ codexAuthStatus: status }),

      setCodexInstallProgress: (progress) => set({
        codexInstallProgress: {
          ...get().codexInstallProgress,
          ...progress,
        },
      }),

      resetCodexInstallProgress: () => set({
        codexInstallProgress: { ...initialInstallProgress },
      }),

      // Preferences
      setSkipClaudeSetup: (skip) => set({ skipClaudeSetup: skip }),

      setSkipCodexSetup: (skip) => set({ skipCodexSetup: skip }),
    }),
    {
      name: "automaker-setup",
      partialize: (state) => ({
        isFirstRun: state.isFirstRun,
        setupComplete: state.setupComplete,
        skipClaudeSetup: state.skipClaudeSetup,
        skipCodexSetup: state.skipCodexSetup,
      }),
    }
  )
);
