"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Settings,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Sun,
  Moon,
  Palette,
  Terminal,
  Ghost,
  Snowflake,
  Flame,
  Sparkles,
  Eclipse,
  Trees,
  Cat,
  Atom,
  Radio,
  LayoutGrid,
  Minimize2,
  Square,
  Maximize2,
  FlaskConical,
  Trash2,
  Folder,
  GitBranch,
  TestTube,
  Settings2,
  RefreshCw,
  Info,
  Keyboard,
} from "lucide-react";
import { getElectronAPI } from "@/lib/electron";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSetupStore, type ClaudeAuthStatus, type CodexAuthStatus } from "@/store/setup-store";
import { KeyboardMap, ShortcutReferencePanel } from "@/components/ui/keyboard-map";
import { Checkbox } from "../ui/checkbox";

// Navigation items for the side panel
const NAV_ITEMS = [
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "claude", label: "Claude", icon: Terminal },
  { id: "codex", label: "Codex", icon: Atom },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "kanban", label: "Kanban Display", icon: LayoutGrid },
  { id: "keyboard", label: "Keyboard Shortcuts", icon: Settings2 },
  { id: "defaults", label: "Feature Defaults", icon: FlaskConical },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];

export function SettingsView() {
  const {
    apiKeys,
    setApiKeys,
    setCurrentView,
    theme,
    setTheme,
    setProjectTheme,
    kanbanCardDetailLevel,
    setKanbanCardDetailLevel,
    defaultSkipTests,
    setDefaultSkipTests,
    useWorktrees,
    setUseWorktrees,
    showProfilesOnly,
    setShowProfilesOnly,
    currentProject,
    moveProjectToTrash,
  } = useAppStore();

  // Compute the effective theme for the current project
  const effectiveTheme = currentProject?.theme || theme;

  // Handler to set theme - saves to project if one is selected, otherwise to global
  const handleSetTheme = (newTheme: typeof theme) => {
    if (currentProject) {
      setProjectTheme(currentProject.id, newTheme);
    } else {
      setTheme(newTheme);
    }
  };
  const [anthropicKey, setAnthropicKey] = useState(apiKeys.anthropic);
  const [googleKey, setGoogleKey] = useState(apiKeys.google);
  const [openaiKey, setOpenaiKey] = useState(apiKeys.openai);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testingGeminiConnection, setTestingGeminiConnection] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [claudeCliStatus, setClaudeCliStatus] = useState<{
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
  } | null>(null);
  const [codexCliStatus, setCodexCliStatus] = useState<{
    success: boolean;
    status?: string;
    method?: string;
    version?: string;
    path?: string;
    hasApiKey?: boolean;
    recommendation?: string;
    installCommands?: {
      macos?: string;
      windows?: string;
      linux?: string;
      npm?: string;
    };
    error?: string;
  } | null>(null);
  const [testingOpenaiConnection, setTestingOpenaiConnection] = useState(false);
  const [openaiTestResult, setOpenaiTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [activeSection, setActiveSection] = useState("api-keys");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);
  const [isCheckingClaudeCli, setIsCheckingClaudeCli] = useState(false);
  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{
    hasAnthropicKey: boolean;
    hasOpenAIKey: boolean;
    hasGoogleKey: boolean;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Get authentication status from setup store
  const { claudeAuthStatus, codexAuthStatus, setClaudeAuthStatus, setCodexAuthStatus } = useSetupStore();

  useEffect(() => {
    setAnthropicKey(apiKeys.anthropic);
    setGoogleKey(apiKeys.google);
    setOpenaiKey(apiKeys.openai);
  }, [apiKeys]);

  useEffect(() => {
    const checkCliStatus = async () => {
      const api = getElectronAPI();
      if (api?.checkClaudeCli) {
        try {
          const status = await api.checkClaudeCli();
          setClaudeCliStatus(status);
        } catch (error) {
          console.error("Failed to check Claude CLI status:", error);
        }
      }
      if (api?.checkCodexCli) {
        try {
          const status = await api.checkCodexCli();
          setCodexCliStatus(status);
        } catch (error) {
          console.error("Failed to check Codex CLI status:", error);
        }
      }
      // Check API key status from environment
      if (api?.setup?.getApiKeys) {
        try {
          const status = await api.setup.getApiKeys();
          if (status.success) {
            setApiKeyStatus({
              hasAnthropicKey: status.hasAnthropicKey,
              hasOpenAIKey: status.hasOpenAIKey,
              hasGoogleKey: status.hasGoogleKey,
            });
          }
        } catch (error) {
          console.error("Failed to check API key status:", error);
        }
      }

      // Check Claude auth status (re-fetch on mount to ensure persistence)
      if (api?.setup?.getClaudeStatus) {
        try {
          const result = await api.setup.getClaudeStatus();
          if (result.success && result.auth) {
            const auth = result.auth;
            const authStatus: ClaudeAuthStatus = {
              authenticated: auth.authenticated,
              method: auth.method === "oauth_token"
                ? "oauth"
                : auth.method?.includes("api_key")
                ? "api_key"
                : "none",
              hasCredentialsFile: auth.hasCredentialsFile ?? false,
              oauthTokenValid: auth.hasStoredOAuthToken,
              apiKeyValid: auth.hasStoredApiKey || auth.hasEnvApiKey,
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
            const auth = result.auth;
            // Determine method - prioritize cli_verified and cli_tokens over auth_file
            const method = auth.method === "cli_verified" || auth.method === "cli_tokens"
              ? auth.method === "cli_verified" ? "cli_verified" : "cli_tokens"
              : auth.method === "auth_file" 
              ? "api_key" 
              : auth.method === "env_var" 
              ? "env" 
              : "none";
            
            const authStatus: CodexAuthStatus = {
              authenticated: auth.authenticated,
              method,
              // Only set apiKeyValid for actual API key methods, not CLI login
              apiKeyValid: method === "cli_verified" || method === "cli_tokens" ? undefined : (auth.hasAuthFile || auth.hasEnvKey),
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

  // Track scroll position to highlight active nav item
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sections = NAV_ITEMS.filter(
        (item) => item.id !== "danger" || currentProject
      )
        .map((item) => ({
          id: item.id,
          element: document.getElementById(item.id),
        }))
        .filter((s) => s.element);

      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Check if scrolled to bottom (within a small threshold)
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom && sections.length > 0) {
        // If at bottom, highlight the last visible section
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.element) {
          const rect = section.element.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top + scrollTop;
          if (scrollTop >= relativeTop - 100) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [currentProject]);

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const relativeTop =
        elementRect.top - containerRect.top + container.scrollTop;

      container.scrollTo({
        top: relativeTop - 24,
        behavior: "smooth",
      });
    }
  }, []);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/claude/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: anthropicKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || "Connection successful! Claude responded.",
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Failed to connect to Claude API.",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestGeminiConnection = async () => {
    setTestingGeminiConnection(true);
    setGeminiTestResult(null);

    try {
      const response = await fetch("/api/gemini/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: googleKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setGeminiTestResult({
          success: true,
          message: data.message || "Connection successful! Gemini responded.",
        });
      } else {
        setGeminiTestResult({
          success: false,
          message: data.error || "Failed to connect to Gemini API.",
        });
      }
    } catch {
      setGeminiTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingGeminiConnection(false);
    }
  };

  const handleTestOpenaiConnection = async () => {
    setTestingOpenaiConnection(true);
    setOpenaiTestResult(null);

    try {
      const api = getElectronAPI();
      if (api?.testOpenAIConnection) {
        const result = await api.testOpenAIConnection(openaiKey);
        if (result.success) {
          setOpenaiTestResult({
            success: true,
            message:
              result.message || "Connection successful! OpenAI API responded.",
          });
        } else {
          setOpenaiTestResult({
            success: false,
            message: result.error || "Failed to connect to OpenAI API.",
          });
        }
      } else {
        // Fallback to web API test
        const response = await fetch("/api/openai/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ apiKey: openaiKey }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setOpenaiTestResult({
            success: true,
            message:
              data.message || "Connection successful! OpenAI API responded.",
          });
        } else {
          setOpenaiTestResult({
            success: false,
            message: data.error || "Failed to connect to OpenAI API.",
          });
        }
      }
    } catch {
      setOpenaiTestResult({
        success: false,
        message: "Network error. Please check your connection.",
      });
    } finally {
      setTestingOpenaiConnection(false);
    }
  };

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

  const handleSave = () => {
    setApiKeys({
      anthropic: anthropicKey,
      google: googleKey,
      openai: openaiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="settings-view"
    >
      {/* Header Section */}
      <div className="shrink-0 border-b border-border bg-glass backdrop-blur-md">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure your API keys and preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sticky Side Navigation */}
        <nav className="hidden lg:block w-48 shrink-0 border-r border-border bg-card/50 backdrop-blur-sm">
          <div className="sticky top-0 p-4 space-y-1">
            {NAV_ITEMS.filter(
              (item) => item.id !== "danger" || currentProject
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
                    isActive
                      ? "bg-brand-500/10 text-brand-500 border border-brand-500/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0",
                      isActive ? "text-brand-500" : ""
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6 pb-96">
            {/* API Keys Section */}
            <div
              id="api-keys"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    API Keys
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure your AI provider API keys. Keys are stored locally
                  in your browser.
                </p>
              </div>
              <div className="p-6 space-y-6">
                {/* Claude/Anthropic API Key */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="anthropic-key" className="text-foreground">
                      Anthropic API Key (Claude)
                    </Label>
                    {apiKeys.anthropic && (
                      <CheckCircle2 className="w-4 h-4 text-brand-500" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="anthropic-key"
                        type={showAnthropicKey ? "text" : "password"}
                        value={anthropicKey}
                        onChange={(e) => setAnthropicKey(e.target.value)}
                        placeholder="sk-ant-..."
                        className="pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                        data-testid="anthropic-api-key-input"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                        onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                        data-testid="toggle-anthropic-visibility"
                      >
                        {showAnthropicKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTestConnection}
                      disabled={!anthropicKey || testingConnection}
                      className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
                      data-testid="test-claude-connection"
                    >
                      {testingConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Test
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for Claude AI features. Get your key at{" "}
                    <a
                      href="https://console.anthropic.com/account/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-400 hover:underline"
                    >
                      console.anthropic.com
                    </a>
                    . Alternatively, the CLAUDE_CODE_OAUTH_TOKEN environment
                    variable can be used.
                  </p>
                  {testResult && (
                    <div
                      className={`flex items-center gap-2 p-3 rounded-lg ${
                        testResult.success
                          ? "bg-green-500/10 border border-green-500/20 text-green-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}
                      data-testid="test-connection-result"
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span
                        className="text-sm"
                        data-testid="test-connection-message"
                      >
                        {testResult.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Google API Key */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="google-key" className="text-foreground">
                      Google API Key (Gemini)
                    </Label>
                    {apiKeys.google && (
                      <CheckCircle2 className="w-4 h-4 text-brand-500" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="google-key"
                        type={showGoogleKey ? "text" : "password"}
                        value={googleKey}
                        onChange={(e) => setGoogleKey(e.target.value)}
                        placeholder="AIza..."
                        className="pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                        data-testid="google-api-key-input"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                        onClick={() => setShowGoogleKey(!showGoogleKey)}
                        data-testid="toggle-google-visibility"
                      >
                        {showGoogleKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTestGeminiConnection}
                      disabled={!googleKey || testingGeminiConnection}
                      className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
                      data-testid="test-gemini-connection"
                    >
                      {testingGeminiConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Test
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for Gemini AI features (including image/design
                    prompts). Get your key at{" "}
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-400 hover:underline"
                    >
                      makersuite.google.com
                    </a>
                  </p>
                  {geminiTestResult && (
                    <div
                      className={`flex items-center gap-2 p-3 rounded-lg ${
                        geminiTestResult.success
                          ? "bg-green-500/10 border border-green-500/20 text-green-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}
                      data-testid="gemini-test-connection-result"
                    >
                      {geminiTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span
                        className="text-sm"
                        data-testid="gemini-test-connection-message"
                      >
                        {geminiTestResult.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* OpenAI API Key */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="openai-key" className="text-foreground">
                      OpenAI API Key (Codex/GPT)
                    </Label>
                    {apiKeys.openai && (
                      <CheckCircle2 className="w-4 h-4 text-brand-500" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="openai-key"
                        type={showOpenaiKey ? "text" : "password"}
                        value={openaiKey}
                        onChange={(e) => setOpenaiKey(e.target.value)}
                        placeholder="sk-..."
                        className="pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                        data-testid="openai-api-key-input"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                        data-testid="toggle-openai-visibility"
                      >
                        {showOpenaiKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTestOpenaiConnection}
                      disabled={!openaiKey || testingOpenaiConnection}
                      className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
                      data-testid="test-openai-connection"
                    >
                      {testingOpenaiConnection ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Test
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for OpenAI Codex CLI and GPT models. Get your key at{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-400 hover:underline"
                    >
                      platform.openai.com
                    </a>
                  </p>
                  {openaiTestResult && (
                    <div
                      className={`flex items-center gap-2 p-3 rounded-lg ${
                        openaiTestResult.success
                          ? "bg-green-500/10 border border-green-500/20 text-green-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      }`}
                      data-testid="openai-test-connection-result"
                    >
                      {openaiTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span
                        className="text-sm"
                        data-testid="openai-test-connection-message"
                      >
                        {openaiTestResult.message}
                      </span>
                    </div>
                  )}
                </div>

                {/* Authentication Status Display */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-brand-500" />
                    <Label className="text-foreground font-semibold">
                      Current Authentication Configuration
                    </Label>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Claude Authentication Status */}
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Terminal className="w-4 h-4 text-brand-500" />
                        <span className="text-sm font-medium text-foreground">
                          Claude (Anthropic)
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs min-h-[3rem]">
                        {claudeAuthStatus?.authenticated ? (
                          <>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              <span className="text-muted-foreground">
                                Method:{" "}
                                <span className="font-mono text-foreground">
                                  {claudeAuthStatus.method === "oauth"
                                    ? "OAuth Token"
                                    : claudeAuthStatus.method === "api_key"
                                    ? "API Key"
                                    : "Unknown"}
                                </span>
                              </span>
                            </div>
                            {claudeAuthStatus.oauthTokenValid && (
                              <div className="flex items-center gap-2 text-green-400">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>OAuth token configured</span>
                              </div>
                            )}
                            {claudeAuthStatus.apiKeyValid && (
                              <div className="flex items-center gap-2 text-green-400">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>API key configured</span>
                              </div>
                            )}
                            {apiKeyStatus?.hasAnthropicKey && (
                              <div className="flex items-center gap-2 text-blue-400">
                                <Info className="w-3 h-3 shrink-0" />
                                <span>Environment variable detected</span>
                              </div>
                            )}
                            {apiKeys.anthropic && (
                              <div className="flex items-center gap-2 text-blue-400">
                                <Info className="w-3 h-3 shrink-0" />
                                <span>Manual API key in settings</span>
                              </div>
                            )}
                          </>
                        ) : apiKeyStatus?.hasAnthropicKey ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using environment variable (ANTHROPIC_API_KEY)</span>
                          </div>
                        ) : apiKeys.anthropic ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using manual API key from settings</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground py-0.5">
                            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-xs">Not Setup</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Codex/OpenAI Authentication Status */}
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Atom className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium text-foreground">
                          Codex (OpenAI)
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs min-h-[3rem]">
                        {codexAuthStatus?.authenticated ? (
                          <>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              <span className="text-muted-foreground">
                                Method:{" "}
                                <span className="font-mono text-foreground">
                                  {codexAuthStatus.method === "cli_verified" || codexAuthStatus.method === "cli_tokens"
                                    ? "CLI Login (OpenAI Account)"
                                    : codexAuthStatus.method === "api_key"
                                    ? "API Key (Auth File)"
                                    : codexAuthStatus.method === "env"
                                    ? "API Key (Environment)"
                                    : "Unknown"}
                                </span>
                              </span>
                            </div>
                            {codexAuthStatus.method === "cli_verified" || codexAuthStatus.method === "cli_tokens" ? (
                              <div className="flex items-center gap-2 text-green-400">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Account authenticated</span>
                              </div>
                            ) : codexAuthStatus.apiKeyValid ? (
                              <div className="flex items-center gap-2 text-green-400">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>API key configured</span>
                              </div>
                            ) : null}
                            {apiKeyStatus?.hasOpenAIKey && (
                              <div className="flex items-center gap-2 text-blue-400">
                                <Info className="w-3 h-3 shrink-0" />
                                <span>Environment variable detected</span>
                              </div>
                            )}
                            {apiKeys.openai && (
                              <div className="flex items-center gap-2 text-blue-400">
                                <Info className="w-3 h-3 shrink-0" />
                                <span>Manual API key in settings</span>
                              </div>
                            )}
                          </>
                        ) : apiKeyStatus?.hasOpenAIKey ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using environment variable (OPENAI_API_KEY)</span>
                          </div>
                        ) : apiKeys.openai ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using manual API key from settings</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground py-0.5">
                            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-xs">Not Setup</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Google/Gemini Authentication Status */}
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium text-foreground">
                          Gemini (Google)
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs min-h-[3rem]">
                        {apiKeyStatus?.hasGoogleKey ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using environment variable (GOOGLE_API_KEY)</span>
                          </div>
                        ) : apiKeys.google ? (
                          <div className="flex items-center gap-2 text-blue-400">
                            <Info className="w-3 h-3 shrink-0" />
                            <span>Using manual API key from settings</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground py-0.5">
                            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                            <span className="text-xs">Not Setup</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Notice */}
                <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-500">
                      Security Notice
                    </p>
                    <p className="text-yellow-500/80 text-xs mt-1">
                      API keys are stored in your browser&apos;s local storage.
                      Never share your API keys or commit them to version
                      control.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Claude CLI Status Section */}
            {claudeCliStatus && (
              <div
                id="claude"
                className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
              >
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-brand-500" />
                      <h2 className="text-lg font-semibold text-foreground">
                        Claude Code CLI
                      </h2>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRefreshClaudeCli}
                      disabled={isCheckingClaudeCli}
                      data-testid="refresh-claude-cli"
                      title="Refresh Claude CLI detection"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${
                          isCheckingClaudeCli ? "animate-spin" : ""
                        }`}
                      />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Claude Code CLI provides better performance for long-running
                    tasks, especially with ultrathink.
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {claudeCliStatus.success &&
                  claudeCliStatus.status === "installed" ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-400">
                            Claude Code CLI Installed
                          </p>
                          <div className="text-xs text-green-400/80 mt-1 space-y-1">
                            {claudeCliStatus.method && (
                              <p>
                                Method:{" "}
                                <span className="font-mono">
                                  {claudeCliStatus.method}
                                </span>
                              </p>
                            )}
                            {claudeCliStatus.version && (
                              <p>
                                Version:{" "}
                                <span className="font-mono">
                                  {claudeCliStatus.version}
                                </span>
                              </p>
                            )}
                            {claudeCliStatus.path && (
                              <p
                                className="truncate"
                                title={claudeCliStatus.path}
                              >
                                Path:{" "}
                                <span className="font-mono text-[10px]">
                                  {claudeCliStatus.path}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {claudeCliStatus.recommendation && (
                        <p className="text-xs text-muted-foreground">
                          {claudeCliStatus.recommendation}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-400">
                            Claude Code CLI Not Detected
                          </p>
                          <p className="text-xs text-yellow-400/80 mt-1">
                            {claudeCliStatus.recommendation ||
                              "Consider installing Claude Code CLI for optimal performance with ultrathink."}
                          </p>
                        </div>
                      </div>
                      {claudeCliStatus.installCommands && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-foreground-secondary">
                            Installation Commands:
                          </p>
                          <div className="space-y-1">
                            {claudeCliStatus.installCommands.npm && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  npm:
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {claudeCliStatus.installCommands.npm}
                                </code>
                              </div>
                            )}
                            {claudeCliStatus.installCommands.macos && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  macOS/Linux:
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {claudeCliStatus.installCommands.macos}
                                </code>
                              </div>
                            )}
                            {claudeCliStatus.installCommands.windows && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  Windows (PowerShell):
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {claudeCliStatus.installCommands.windows}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Codex CLI Status Section */}
            {codexCliStatus && (
              <div
                id="codex"
                className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
              >
                <div className="p-6 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-5 h-5 text-green-500" />
                      <h2 className="text-lg font-semibold text-foreground">
                        OpenAI Codex CLI
                      </h2>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRefreshCodexCli}
                      disabled={isCheckingCodexCli}
                      data-testid="refresh-codex-cli"
                      title="Refresh Codex CLI detection"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${
                          isCheckingCodexCli ? "animate-spin" : ""
                        }`}
                      />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Codex CLI enables GPT-5.1 Codex models for autonomous coding
                    tasks.
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {codexCliStatus.success &&
                  codexCliStatus.status === "installed" ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-400">
                            Codex CLI Installed
                          </p>
                          <div className="text-xs text-green-400/80 mt-1 space-y-1">
                            {codexCliStatus.method && (
                              <p>
                                Method:{" "}
                                <span className="font-mono">
                                  {codexCliStatus.method}
                                </span>
                              </p>
                            )}
                            {codexCliStatus.version && (
                              <p>
                                Version:{" "}
                                <span className="font-mono">
                                  {codexCliStatus.version}
                                </span>
                              </p>
                            )}
                            {codexCliStatus.path && (
                              <p
                                className="truncate"
                                title={codexCliStatus.path}
                              >
                                Path:{" "}
                                <span className="font-mono text-[10px]">
                                  {codexCliStatus.path}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {codexCliStatus.recommendation && (
                        <p className="text-xs text-muted-foreground">
                          {codexCliStatus.recommendation}
                        </p>
                      )}
                    </div>
                  ) : codexCliStatus.status === "api_key_only" ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-400">
                            API Key Detected - CLI Not Installed
                          </p>
                          <p className="text-xs text-blue-400/80 mt-1">
                            {codexCliStatus.recommendation ||
                              "OPENAI_API_KEY found but Codex CLI not installed. Install the CLI for full agentic capabilities."}
                          </p>
                        </div>
                      </div>
                      {codexCliStatus.installCommands && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-foreground-secondary">
                            Installation Commands:
                          </p>
                          <div className="space-y-1">
                            {codexCliStatus.installCommands.npm && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  npm:
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {codexCliStatus.installCommands.npm}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-400">
                            Codex CLI Not Detected
                          </p>
                          <p className="text-xs text-yellow-400/80 mt-1">
                            {codexCliStatus.recommendation ||
                              "Install OpenAI Codex CLI to use GPT-5.1 Codex models for autonomous coding."}
                          </p>
                        </div>
                      </div>
                      {codexCliStatus.installCommands && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-foreground-secondary">
                            Installation Commands:
                          </p>
                          <div className="space-y-1">
                            {codexCliStatus.installCommands.npm && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  npm:
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {codexCliStatus.installCommands.npm}
                                </code>
                              </div>
                            )}
                            {codexCliStatus.installCommands.macos && (
                              <div className="p-2 rounded bg-background border border-border-glass">
                                <p className="text-xs text-muted-foreground mb-1">
                                  macOS (Homebrew):
                                </p>
                                <code className="text-xs text-foreground-secondary font-mono break-all">
                                  {codexCliStatus.installCommands.macos}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Appearance Section */}
            <div
              id="appearance"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Appearance
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Customize the look and feel of your application.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <Label className="text-foreground">
                    Theme{" "}
                    {currentProject
                      ? `(for ${currentProject.name})`
                      : "(Global)"}
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Button
                      variant={
                        effectiveTheme === "dark" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("dark")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "dark"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="dark-mode-button"
                    >
                      <Moon className="w-4 h-4" />
                      <span className="font-medium text-sm">Dark</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "light" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("light")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "light"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="light-mode-button"
                    >
                      <Sun className="w-4 h-4" />
                      <span className="font-medium text-sm">Light</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "retro" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("retro")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "retro"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="retro-mode-button"
                    >
                      <Terminal className="w-4 h-4" />
                      <span className="font-medium text-sm">Retro</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "dracula" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("dracula")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "dracula"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="dracula-mode-button"
                    >
                      <Ghost className="w-4 h-4" />
                      <span className="font-medium text-sm">Dracula</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "nord" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("nord")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "nord"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="nord-mode-button"
                    >
                      <Snowflake className="w-4 h-4" />
                      <span className="font-medium text-sm">Nord</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "monokai" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("monokai")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "monokai"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="monokai-mode-button"
                    >
                      <Flame className="w-4 h-4" />
                      <span className="font-medium text-sm">Monokai</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "tokyonight"
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => handleSetTheme("tokyonight")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "tokyonight"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="tokyonight-mode-button"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="font-medium text-sm">Tokyo Night</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "solarized" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("solarized")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "solarized"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="solarized-mode-button"
                    >
                      <Eclipse className="w-4 h-4" />
                      <span className="font-medium text-sm">Solarized</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "gruvbox" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("gruvbox")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "gruvbox"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="gruvbox-mode-button"
                    >
                      <Trees className="w-4 h-4" />
                      <span className="font-medium text-sm">Gruvbox</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "catppuccin"
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => handleSetTheme("catppuccin")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "catppuccin"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="catppuccin-mode-button"
                    >
                      <Cat className="w-4 h-4" />
                      <span className="font-medium text-sm">Catppuccin</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "onedark" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("onedark")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "onedark"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="onedark-mode-button"
                    >
                      <Atom className="w-4 h-4" />
                      <span className="font-medium text-sm">One Dark</span>
                    </Button>
                    <Button
                      variant={
                        effectiveTheme === "synthwave" ? "secondary" : "outline"
                      }
                      onClick={() => handleSetTheme("synthwave")}
                      className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                        effectiveTheme === "synthwave"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="synthwave-mode-button"
                    >
                      <Radio className="w-4 h-4" />
                      <span className="font-medium text-sm">Synthwave</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Kanban Card Display Section */}
            <div
              id="kanban"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <LayoutGrid className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Kanban Card Display
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Control how much information is displayed on Kanban cards.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <Label className="text-foreground">Detail Level</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      variant={
                        kanbanCardDetailLevel === "minimal"
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => setKanbanCardDetailLevel("minimal")}
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                        kanbanCardDetailLevel === "minimal"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="kanban-detail-minimal"
                    >
                      <Minimize2 className="w-5 h-5" />
                      <span className="font-medium text-sm">Minimal</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Title & category only
                      </span>
                    </Button>
                    <Button
                      variant={
                        kanbanCardDetailLevel === "standard"
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => setKanbanCardDetailLevel("standard")}
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                        kanbanCardDetailLevel === "standard"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="kanban-detail-standard"
                    >
                      <Square className="w-5 h-5" />
                      <span className="font-medium text-sm">Standard</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Steps & progress
                      </span>
                    </Button>
                    <Button
                      variant={
                        kanbanCardDetailLevel === "detailed"
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => setKanbanCardDetailLevel("detailed")}
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-4 h-auto ${
                        kanbanCardDetailLevel === "detailed"
                          ? "border-brand-500 ring-1 ring-brand-500/50"
                          : ""
                      }`}
                      data-testid="kanban-detail-detailed"
                    >
                      <Maximize2 className="w-5 h-5" />
                      <span className="font-medium text-sm">Detailed</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Model, tools & tasks
                      </span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>Minimal:</strong> Shows only title and category
                    <br />
                    <strong>Standard:</strong> Adds steps preview and progress
                    bar
                    <br />
                    <strong>Detailed:</strong> Shows all info including model,
                    tool calls, task list, and summaries
                  </p>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Section */}
            <div
              id="keyboard"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Keyboard Shortcuts
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Customize keyboard shortcuts for navigation and actions using the visual keyboard map.
                </p>
              </div>
              <div className="p-6">
                {/* Centered message directing to keyboard map */}
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                  <div className="relative">
                    <Keyboard className="w-16 h-16 text-brand-500/30" />
                    <div className="absolute inset-0 bg-brand-500/10 blur-xl rounded-full" />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <h3 className="text-lg font-semibold text-foreground">
                      Use the Visual Keyboard Map
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Click the &quot;View Keyboard Map&quot; button above to customize your keyboard shortcuts.
                      The visual interface shows all available keys and lets you easily edit shortcuts with
                      single-modifier restrictions.
                    </p>
                  </div>
                  <Button
                    variant="default"
                    size="lg"
                    onClick={() => setShowKeyboardMapDialog(true)}
                    className="gap-2 mt-4"
                  >
                    <Keyboard className="w-5 h-5" />
                    Open Keyboard Map
                  </Button>
                </div>
              </div>
            </div>

            {/* Feature Defaults Section */}
            <div
              id="defaults"
              className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
            >
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <FlaskConical className="w-5 h-5 text-brand-500" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Feature Defaults
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure default settings for new features.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Profiles Only Setting */}
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="show-profiles-only"
                      checked={showProfilesOnly}
                      onCheckedChange={(checked) =>
                        setShowProfilesOnly(checked === true)
                      }
                      className="mt-0.5"
                      data-testid="show-profiles-only-checkbox"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="show-profiles-only"
                        className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                      >
                        <Settings2 className="w-4 h-4 text-brand-500" />
                        Show profiles only by default
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, the Add Feature dialog will show only AI
                        profiles and hide advanced model tweaking options
                        (Claude SDK, thinking levels, and OpenAI Codex CLI).
                        This creates a cleaner, less overwhelming UI. You can
                        always disable this to access advanced settings.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t border-border" />

                {/* Skip Tests Setting */}
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="default-skip-tests"
                      checked={defaultSkipTests}
                      onCheckedChange={(checked) =>
                        setDefaultSkipTests(checked === true)
                      }
                      className="mt-0.5"
                      data-testid="default-skip-tests-checkbox"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="default-skip-tests"
                        className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                      >
                        <TestTube className="w-4 h-4 text-brand-500" />
                        Skip automated testing by default
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, new features will default to manual
                        verification instead of TDD (test-driven development).
                        You can still override this for individual features.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Worktree Isolation Setting */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="use-worktrees"
                      checked={useWorktrees}
                      onCheckedChange={(checked) =>
                        setUseWorktrees(checked === true)
                      }
                      className="mt-0.5"
                      data-testid="use-worktrees-checkbox"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="use-worktrees"
                        className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                      >
                        <GitBranch className="w-4 h-4 text-brand-500" />
                        Enable Git Worktree Isolation (experimental)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Creates isolated git branches for each feature. When
                        disabled, agents work directly in the main project
                        directory. This feature is experimental and may require
                        additional setup like branch selection and merge
                        configuration.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Delete Project Section - Only show when a project is selected */}
            {currentProject && (
              <div
                id="danger"
                className="rounded-xl border border-destructive/30 bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
              >
                <div className="p-6 border-b border-destructive/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Trash2 className="w-5 h-5 text-destructive" />
                    <h2 className="text-lg font-semibold text-foreground">
                      Danger Zone
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Permanently remove this project from Automaker.
                  </p>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-sidebar-accent/20 border border-sidebar-border flex items-center justify-center shrink-0">
                        <Folder className="w-5 h-5 text-brand-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {currentProject.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {currentProject.path}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      data-testid="delete-project-button"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Project
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center gap-4">
              <Button
                onClick={handleSave}
                data-testid="save-settings"
                className="min-w-[120px] bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-primary-foreground border-0"
              >
                {saved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Saved!
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCurrentView("welcome")}
                className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
                data-testid="back-to-home"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Map Dialog */}
      <Dialog open={showKeyboardMapDialog} onOpenChange={setShowKeyboardMapDialog}>
        <DialogContent className="bg-popover border-border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-brand-500" />
              Keyboard Shortcut Map
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Visual overview of all keyboard shortcuts. Keys in color are bound to shortcuts.
              Click on any shortcut below to edit it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4 pl-3 pr-6 pb-6">
            {/* Visual Keyboard Map */}
            <KeyboardMap />

            {/* Shortcut Reference - Editable */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                All Shortcuts Reference (Click to Edit)
              </h3>
              <ShortcutReferencePanel editable />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Project
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to move this project to Trash?
            </DialogDescription>
          </DialogHeader>

          {currentProject && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-sidebar-accent/10 border border-sidebar-border">
              <div className="w-10 h-10 rounded-lg bg-sidebar-accent/20 border border-sidebar-border flex items-center justify-center shrink-0">
                <Folder className="w-5 h-5 text-brand-500" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {currentProject.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {currentProject.path}
                </p>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            The folder will remain on disk until you permanently delete it from
            Trash.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (currentProject) {
                  moveProjectToTrash(currentProject.id);
                  setShowDeleteDialog(false);
                }
              }}
              data-testid="confirm-delete-project"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Move to Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
