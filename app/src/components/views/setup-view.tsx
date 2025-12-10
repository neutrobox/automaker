"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSetupStore, type CodexAuthStatus } from "@/store/setup-store";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Key,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  AlertCircle,
  RefreshCw,
  Download,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

// Step indicator component
function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={`h-2 rounded-full transition-all duration-300 ${
            index <= currentStep
              ? "w-8 bg-brand-500"
              : "w-2 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// CLI Status Badge
function StatusBadge({
  status,
  label,
}: {
  status: "installed" | "not_installed" | "checking" | "authenticated" | "not_authenticated";
  label: string;
}) {
  const getStatusConfig = () => {
    switch (status) {
      case "installed":
      case "authenticated":
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          className: "bg-green-500/10 text-green-500 border-green-500/20",
        };
      case "not_installed":
      case "not_authenticated":
        return {
          icon: <XCircle className="w-4 h-4" />,
          className: "bg-red-500/10 text-red-500 border-red-500/20",
        };
      case "checking":
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.icon}
      {label}
    </div>
  );
}

// Terminal Output Component
function TerminalOutput({ lines }: { lines: string[] }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm max-h-48 overflow-y-auto">
      {lines.map((line, index) => (
        <div key={index} className="text-zinc-400">
          <span className="text-green-500">$</span> {line}
        </div>
      ))}
      {lines.length === 0 && (
        <div className="text-zinc-500 italic">Waiting for output...</div>
      )}
    </div>
  );
}

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="flex items-center justify-center mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Automaker Logo" className="w-24 h-24" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">
          Welcome to Automaker
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Let&apos;s set up your development environment. We&apos;ll check for required
          CLI tools and help you configure them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="bg-card/50 border-border hover:border-brand-500/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-5 h-5 text-brand-500" />
              Claude CLI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Anthropic&apos;s powerful AI assistant for code generation and analysis
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border hover:border-brand-500/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-5 h-5 text-green-500" />
              Codex CLI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              OpenAI&apos;s GPT-5.1 Codex for advanced code generation tasks
            </p>
          </CardContent>
        </Card>
      </div>

      <Button
        size="lg"
        className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
        onClick={onNext}
        data-testid="setup-start-button"
      >
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

// Claude Setup Step - 2 Authentication Options:
// 1. OAuth Token (Subscription): User runs `claude setup-token` and provides the token
// 2. API Key (Pay-per-use): User provides their Anthropic API key directly
function ClaudeSetupStep({
  onNext,
  onBack,
  onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const {
    claudeCliStatus,
    claudeAuthStatus,
    claudeInstallProgress,
    setClaudeCliStatus,
    setClaudeAuthStatus,
    setClaudeInstallProgress,
  } = useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();

  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [authMethod, setAuthMethod] = useState<"token" | "api_key" | null>(null);
  const [oauthToken, setOAuthToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const checkStatus = useCallback(async () => {
    console.log("[Claude Setup] Starting status check...");
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      // Debug: Check what's available
      console.log("[Claude Setup] isElectron:", typeof window !== "undefined" && (window as any).isElectron);
      console.log("[Claude Setup] electronAPI exists:", typeof window !== "undefined" && !!(window as any).electronAPI);
      console.log("[Claude Setup] electronAPI.setup exists:", typeof window !== "undefined" && !!(window as any).electronAPI?.setup);
      console.log("[Claude Setup] Setup API available:", !!setupApi);

      if (setupApi?.getClaudeStatus) {
        const result = await setupApi.getClaudeStatus();
        console.log("[Claude Setup] Raw status result:", result);

        if (result.success) {
          const cliStatus = {
            installed: result.installed || result.status === "installed",
            path: result.path || null,
            version: result.version || null,
            method: result.method || "none",
          };
          console.log("[Claude Setup] CLI Status:", cliStatus);
          setClaudeCliStatus(cliStatus);

          if (result.auth) {
            const authStatus = {
              authenticated: result.auth.authenticated,
              method: result.auth.method === "oauth_token"
                ? "oauth"
                : result.auth.method?.includes("api_key")
                ? "api_key"
                : "none",
              hasCredentialsFile: false,
              oauthTokenValid: result.auth.hasStoredOAuthToken,
              apiKeyValid: result.auth.hasStoredApiKey || result.auth.hasEnvApiKey,
            };
            console.log("[Claude Setup] Auth Status:", authStatus);
            setClaudeAuthStatus(authStatus as any);
          }
        }
      }
    } catch (error) {
      console.error("[Claude Setup] Failed to check Claude status:", error);
    } finally {
      setIsChecking(false);
    }
  }, [setClaudeCliStatus, setClaudeAuthStatus]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setClaudeInstallProgress({
      isInstalling: true,
      currentStep: "Downloading Claude CLI...",
      progress: 0,
      output: [],
    });

    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      if (setupApi?.installClaude) {
        const unsubscribe = setupApi.onInstallProgress?.((progress: { cli?: string; data?: string; type?: string }) => {
          if (progress.cli === "claude") {
            setClaudeInstallProgress({
              output: [...claudeInstallProgress.output, progress.data || progress.type || ""],
            });
          }
        });

        const result = await setupApi.installClaude();
        unsubscribe?.();

        if (result.success) {
          // Installation script completed, but CLI might not be immediately detectable
          // Wait a bit for installation to complete and PATH to update, then retry status check
          let retries = 5;
          let detected = false;
          
          // Initial delay to let the installation script finish setting up
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          for (let i = 0; i < retries; i++) {
            // Check status
            await checkStatus();
            
            // Small delay to let state update
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Check if CLI is now detected by re-reading from store
            const currentStatus = useSetupStore.getState().claudeCliStatus;
            if (currentStatus?.installed) {
              detected = true;
              toast.success("Claude CLI installed and detected successfully");
              break;
            }
            
            // Wait before next retry (longer delays for later retries)
            if (i < retries - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000 + (i * 500)));
            }
          }
          
          // Show appropriate message based on detection
          if (!detected) {
            // Installation completed but CLI not detected - this is common if PATH wasn't updated in current process
            toast.success("Claude CLI installation completed", {
              description: "The CLI was installed but may need a terminal restart to be detected. You can continue with authentication if you have a token.",
              duration: 7000,
            });
          }
        } else {
          toast.error("Installation failed", { description: result.error });
        }
      }
    } catch (error) {
      console.error("Failed to install Claude:", error);
      toast.error("Installation failed");
    } finally {
      setIsInstalling(false);
      setClaudeInstallProgress({ isInstalling: false });
    }
  };

  const handleSaveOAuthToken = async () => {
    console.log("[Claude Setup] Saving OAuth token...");
    if (!oauthToken.trim()) {
      toast.error("Please enter the token from claude setup-token");
      return;
    }

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      if (setupApi?.storeApiKey) {
        const result = await setupApi.storeApiKey("anthropic_oauth_token", oauthToken);
        console.log("[Claude Setup] Store OAuth token result:", result);

        if (result.success) {
          setClaudeAuthStatus({
            authenticated: true,
            method: "oauth",
            hasCredentialsFile: false,
            oauthTokenValid: true,
          });
          toast.success("Claude subscription token saved");
          setAuthMethod(null);
          await checkStatus();
        } else {
          toast.error("Failed to save token", { description: result.error });
        }
      }
    } catch (error) {
      console.error("[Claude Setup] Failed to save OAuth token:", error);
      toast.error("Failed to save token");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    console.log("[Claude Setup] Saving API key...");
    if (!apiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      if (setupApi?.storeApiKey) {
        const result = await setupApi.storeApiKey("anthropic", apiKey);
        console.log("[Claude Setup] Store API key result:", result);

        if (result.success) {
          setApiKeys({ ...apiKeys, anthropic: apiKey });
          setClaudeAuthStatus({
            authenticated: true,
            method: "api_key",
            hasCredentialsFile: false,
            apiKeyValid: true,
          });
          toast.success("Anthropic API key saved");
          setAuthMethod(null);
          await checkStatus();
        } else {
          toast.error("Failed to save API key", { description: result.error });
        }
      } else {
        // Web mode fallback
        setApiKeys({ ...apiKeys, anthropic: apiKey });
        setClaudeAuthStatus({
          authenticated: true,
          method: "api_key",
          hasCredentialsFile: false,
          apiKeyValid: true,
        });
        toast.success("Anthropic API key saved");
        setAuthMethod(null);
      }
    } catch (error) {
      console.error("[Claude Setup] Failed to save API key:", error);
      toast.error("Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  const isAuthenticated = claudeAuthStatus?.authenticated || apiKeys.anthropic;

  const getAuthMethodLabel = () => {
    if (!isAuthenticated) return null;
    if (claudeAuthStatus?.method === "oauth") return "Subscription Token";
    if (apiKeys.anthropic || claudeAuthStatus?.method === "api_key") return "API Key";
    return "Authenticated";
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
          <Terminal className="w-8 h-8 text-brand-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Claude Setup
        </h2>
        <p className="text-muted-foreground">
          Configure Claude for code generation
        </p>
      </div>

      {/* Status Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Status</CardTitle>
            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">CLI Installation</span>
            {isChecking ? (
              <StatusBadge status="checking" label="Checking..." />
            ) : claudeCliStatus?.installed ? (
              <StatusBadge status="installed" label="Installed" />
            ) : (
              <StatusBadge status="not_installed" label="Not Installed" />
            )}
          </div>

          {claudeCliStatus?.version && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-mono text-foreground">{claudeCliStatus.version}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Authentication</span>
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <StatusBadge status="authenticated" label="Authenticated" />
                {getAuthMethodLabel() && (
                  <span className="text-xs text-muted-foreground">({getAuthMethodLabel()})</span>
                )}
              </div>
            ) : (
              <StatusBadge status="not_authenticated" label="Not Authenticated" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installation Section */}
      {!claudeCliStatus?.installed && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5" />
              Install Claude CLI
            </CardTitle>
            <CardDescription>Required for subscription-based authentication</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">macOS / Linux</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  curl -fsSL https://claude.ai/install.sh | bash
                </code>
                <Button variant="ghost" size="icon" onClick={() => copyCommand("curl -fsSL https://claude.ai/install.sh | bash")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Windows</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  irm https://claude.ai/install.ps1 | iex
                </code>
                <Button variant="ghost" size="icon" onClick={() => copyCommand("irm https://claude.ai/install.ps1 | iex")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {claudeInstallProgress.isInstalling && <TerminalOutput lines={claudeInstallProgress.output} />}

            <Button
              onClick={handleInstall}
              disabled={isInstalling}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white"
              data-testid="install-claude-button"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Auto Install
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Authentication Section */}
      {!isAuthenticated && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" />
              Authentication
            </CardTitle>
            <CardDescription>Choose your authentication method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Option 1: Subscription Token */}
            {authMethod === "token" ? (
              <div className="p-4 rounded-lg bg-brand-500/5 border border-brand-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-brand-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Subscription Token</p>
                    <p className="text-sm text-muted-foreground mb-3">Use your Claude subscription (no API charges)</p>

                    {claudeCliStatus?.installed ? (
                      <>
                        <div className="mb-3">
                          <p className="text-sm text-muted-foreground mb-2">1. Run this command in your terminal:</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                              claude setup-token
                            </code>
                            <Button variant="ghost" size="icon" onClick={() => copyCommand("claude setup-token")}>
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-foreground">2. Paste the token here:</Label>
                          <Input
                            type="password"
                            placeholder="Paste token from claude setup-token..."
                            value={oauthToken}
                            onChange={(e) => setOAuthToken(e.target.value)}
                            className="bg-input border-border text-foreground"
                            data-testid="oauth-token-input"
                          />
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button variant="outline" onClick={() => setAuthMethod(null)} className="border-border">
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveOAuthToken}
                            disabled={isSaving || !oauthToken.trim()}
                            className="flex-1 bg-brand-500 hover:bg-brand-600 text-white"
                            data-testid="save-oauth-token-button"
                          >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Token"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                        <p className="text-sm text-yellow-600">
                          <AlertCircle className="w-4 h-4 inline mr-1" />
                          Install Claude CLI first to use subscription authentication
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : authMethod === "api_key" ? (
              /* Option 2: API Key */
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">API Key</p>
                    <p className="text-sm text-muted-foreground mb-3">Pay-per-use with your Anthropic API key</p>

                    <div className="space-y-2">
                      <Label htmlFor="anthropic-key" className="text-foreground">Anthropic API Key</Label>
                      <Input
                        id="anthropic-key"
                        type="password"
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="bg-input border-border text-foreground"
                        data-testid="anthropic-api-key-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        Get your API key from{" "}
                        <a
                          href="https://console.anthropic.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-500 hover:underline"
                        >
                          console.anthropic.com
                          <ExternalLink className="w-3 h-3 inline ml-1" />
                        </a>
                      </p>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" onClick={() => setAuthMethod(null)} className="border-border">
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveApiKey}
                        disabled={isSaving || !apiKey.trim()}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                        data-testid="save-anthropic-key-button"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save API Key"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Auth Method Selection */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setAuthMethod("token")}
                  className="p-4 rounded-lg border border-border hover:border-brand-500/50 bg-card hover:bg-brand-500/5 transition-all text-left"
                  data-testid="select-subscription-auth"
                >
                  <div className="flex items-start gap-3">
                    <Shield className="w-6 h-6 text-brand-500" />
                    <div>
                      <p className="font-medium text-foreground">Subscription</p>
                      <p className="text-sm text-muted-foreground mt-1">Use your Claude subscription</p>
                      <p className="text-xs text-brand-500 mt-2">No API charges</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setAuthMethod("api_key")}
                  className="p-4 rounded-lg border border-border hover:border-green-500/50 bg-card hover:bg-green-500/5 transition-all text-left"
                  data-testid="select-api-key-auth"
                >
                  <div className="flex items-start gap-3">
                    <Key className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground">API Key</p>
                      <p className="text-sm text-muted-foreground mt-1">Use Anthropic API key</p>
                      <p className="text-xs text-green-500 mt-2">Pay-per-use</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {isAuthenticated && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Claude is ready to use!</p>
                <p className="text-sm text-muted-foreground">
                  {getAuthMethodLabel() && `Using ${getAuthMethodLabel()}. `}You can proceed to the next step
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button onClick={onNext} className="bg-brand-500 hover:bg-brand-600 text-white" data-testid="claude-next-button">
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Codex Setup Step
function CodexSetupStep({
  onNext,
  onBack,
  onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const {
    codexCliStatus,
    codexAuthStatus,
    codexInstallProgress,
    setCodexCliStatus,
    setCodexAuthStatus,
    setCodexInstallProgress,
  } = useSetupStore();
  const { setApiKeys, apiKeys } = useAppStore();

  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);

  const checkStatus = useCallback(async () => {
    console.log("[Codex Setup] Starting status check...");
    setIsChecking(true);
    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      console.log("[Codex Setup] Setup API available:", !!setupApi);
      console.log("[Codex Setup] getCodexStatus available:", !!setupApi?.getCodexStatus);

      if (setupApi?.getCodexStatus) {
        const result = await setupApi.getCodexStatus();
        console.log("[Codex Setup] Raw status result:", result);

        if (result.success) {
          const cliStatus = {
            installed: result.status === "installed",
            path: result.path || null,
            version: result.version || null,
            method: result.method || "none",
          };
          console.log("[Codex Setup] CLI Status:", cliStatus);
          setCodexCliStatus(cliStatus);

          if (result.auth) {
            const method = result.auth.method === "cli_verified" || result.auth.method === "cli_tokens"
              ? (result.auth.method === "cli_verified" ? "cli_verified" : "cli_tokens")
              : result.auth.method === "auth_file" 
              ? "api_key" 
              : result.auth.method === "env_var" 
              ? "env" 
              : "none";
            
            const authStatus: CodexAuthStatus = {
              authenticated: result.auth.authenticated,
              method,
              // Only set apiKeyValid for actual API key methods, not CLI login
              apiKeyValid: method === "cli_verified" || method === "cli_tokens" ? undefined : result.auth.authenticated,
            };
            console.log("[Codex Setup] Auth Status:", authStatus);
            setCodexAuthStatus(authStatus);
          } else {
            console.log("[Codex Setup] No auth info in result");
          }
        } else {
          console.log("[Codex Setup] Status check failed:", result.error);
        }
      } else {
        console.log("[Codex Setup] Setup API not available (web mode?)");
      }
    } catch (error) {
      console.error("[Codex Setup] Failed to check Codex status:", error);
    } finally {
      setIsChecking(false);
      console.log("[Codex Setup] Status check complete");
    }
  }, [setCodexCliStatus, setCodexAuthStatus]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setCodexInstallProgress({
      isInstalling: true,
      currentStep: "Installing Codex CLI via npm...",
      progress: 0,
      output: [],
    });

    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      if (setupApi?.installCodex) {
        const unsubscribe = setupApi.onInstallProgress?.((progress: { cli?: string; data?: string; type?: string }) => {
          if (progress.cli === "codex") {
            setCodexInstallProgress({
              output: [
                ...codexInstallProgress.output,
                progress.data || progress.type || "",
              ],
            });
          }
        });

        const result = await setupApi.installCodex();

        unsubscribe?.();

        if (result.success) {
          toast.success("Codex CLI installed successfully");
          await checkStatus();
        } else {
          toast.error("Installation failed", {
            description: result.error,
          });
        }
      }
    } catch (error) {
      console.error("Failed to install Codex:", error);
      toast.error("Installation failed");
    } finally {
      setIsInstalling(false);
      setCodexInstallProgress({ isInstalling: false });
    }
  };

  const handleSaveApiKey = async () => {
    console.log("[Codex Setup] Saving API key...");
    if (!apiKey.trim()) {
      console.log("[Codex Setup] API key is empty");
      toast.error("Please enter an API key");
      return;
    }

    setIsSavingKey(true);
    try {
      const api = getElectronAPI();
      const setupApi = api.setup;

      console.log("[Codex Setup] storeApiKey available:", !!setupApi?.storeApiKey);

      if (setupApi?.storeApiKey) {
        console.log("[Codex Setup] Calling storeApiKey for openai...");
        const result = await setupApi.storeApiKey("openai", apiKey);
        console.log("[Codex Setup] storeApiKey result:", result);

        if (result.success) {
          console.log("[Codex Setup] API key stored successfully, updating state...");
          setApiKeys({ ...apiKeys, openai: apiKey });
          setCodexAuthStatus({
            authenticated: true,
            method: "api_key",
            apiKeyValid: true,
          });
          toast.success("OpenAI API key saved");
          setShowApiKeyInput(false);
        } else {
          console.log("[Codex Setup] Failed to store API key:", result.error);
        }
      } else {
        console.log("[Codex Setup] Web mode - storing API key in app state only");
        setApiKeys({ ...apiKeys, openai: apiKey });
        setCodexAuthStatus({
          authenticated: true,
          method: "api_key",
          apiKeyValid: true,
        });
        toast.success("OpenAI API key saved");
        setShowApiKeyInput(false);
      }
    } catch (error) {
      console.error("[Codex Setup] Failed to save API key:", error);
      toast.error("Failed to save API key");
    } finally {
      setIsSavingKey(false);
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  const isAuthenticated = codexAuthStatus?.authenticated || apiKeys.openai;
  
  const getAuthMethodLabel = () => {
    if (!isAuthenticated) return null;
    if (apiKeys.openai) return "API Key (Manual)";
    if (codexAuthStatus?.method === "api_key") return "API Key (Auth File)";
    if (codexAuthStatus?.method === "env") return "API Key (Environment)";
    if (codexAuthStatus?.method === "cli_verified") return "CLI Login (ChatGPT)";
    return "Authenticated";
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Terminal className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Codex CLI Setup
        </h2>
        <p className="text-muted-foreground">
          OpenAI&apos;s GPT-5.1 Codex for advanced code generation
        </p>
      </div>

      {/* Status Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Installation Status</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkStatus}
              disabled={isChecking}
            >
              <RefreshCw
                className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">CLI Installation</span>
            {isChecking ? (
              <StatusBadge status="checking" label="Checking..." />
            ) : codexCliStatus?.installed ? (
              <StatusBadge status="installed" label="Installed" />
            ) : (
              <StatusBadge status="not_installed" label="Not Installed" />
            )}
          </div>

          {codexCliStatus?.version && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-mono text-foreground">
                {codexCliStatus.version}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Authentication</span>
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <StatusBadge status="authenticated" label="Authenticated" />
                {getAuthMethodLabel() && (
                  <span className="text-xs text-muted-foreground">
                    ({getAuthMethodLabel()})
                  </span>
                )}
              </div>
            ) : (
              <StatusBadge status="not_authenticated" label="Not Authenticated" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installation Section */}
      {!codexCliStatus?.installed && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5" />
              Install Codex CLI
            </CardTitle>
            <CardDescription>
              Install via npm (Node.js required)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                npm (Global installation)
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
                  npm install -g @openai/codex
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyCommand("npm install -g @openai/codex")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {codexInstallProgress.isInstalling && (
              <TerminalOutput lines={codexInstallProgress.output} />
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                data-testid="install-codex-button"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Auto Install
                  </>
                )}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Requires Node.js to be installed. If the auto-install fails,
                  try running the command manually in your terminal.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Authentication Section */}
      {!isAuthenticated && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5" />
              Authentication
            </CardTitle>
            <CardDescription>
              Codex requires an OpenAI API key
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {codexCliStatus?.installed && (
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-start gap-3">
                  <Terminal className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">
                      Authenticate via CLI
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Run this command in your terminal:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-3 py-1 rounded text-sm font-mono text-foreground">
                        codex auth login
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCommand("codex auth login")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  or enter API key
                </span>
              </div>
            </div>

            {showApiKeyInput ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="openai-key" className="text-foreground">
                    OpenAI API Key
                  </Label>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-input border-border text-foreground"
                    data-testid="openai-api-key-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-500 hover:underline"
                    >
                      platform.openai.com
                      <ExternalLink className="w-3 h-3 inline ml-1" />
                    </a>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowApiKeyInput(false)}
                    className="border-border"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={isSavingKey || !apiKey.trim()}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                    data-testid="save-openai-key-button"
                  >
                    {isSavingKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Save API Key"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowApiKeyInput(true)}
                className="w-full border-border"
                data-testid="use-openai-key-button"
              >
                <Key className="w-4 h-4 mr-2" />
                Enter OpenAI API Key
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {isAuthenticated && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Codex is ready to use!
                </p>
                <p className="text-sm text-muted-foreground">
                  {getAuthMethodLabel() && `Authenticated via ${getAuthMethodLabel()}. `}
                  You can proceed to complete setup
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          <Button
            onClick={onNext}
            className="bg-green-500 hover:bg-green-600 text-white"
            data-testid="codex-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Complete Step
function CompleteStep({ onFinish }: { onFinish: () => void }) {
  const { claudeCliStatus, claudeAuthStatus, codexCliStatus, codexAuthStatus } =
    useSetupStore();
  const { apiKeys } = useAppStore();

  const claudeReady =
    (claudeCliStatus?.installed && claudeAuthStatus?.authenticated) ||
    apiKeys.anthropic;
  const codexReady =
    (codexCliStatus?.installed && codexAuthStatus?.authenticated) ||
    apiKeys.openai;

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-white" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">
          Setup Complete!
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your development environment is configured. You&apos;re ready to start
          building with AI-powered assistance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card
          className={`bg-card/50 border ${
            claudeReady ? "border-green-500/50" : "border-yellow-500/50"
          }`}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {claudeReady ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-yellow-500" />
              )}
              <div className="text-left">
                <p className="font-medium text-foreground">Claude</p>
                <p className="text-sm text-muted-foreground">
                  {claudeReady ? "Ready to use" : "Configure later in settings"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`bg-card/50 border ${
            codexReady ? "border-green-500/50" : "border-yellow-500/50"
          }`}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {codexReady ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-yellow-500" />
              )}
              <div className="text-left">
                <p className="font-medium text-foreground">Codex</p>
                <p className="text-sm text-muted-foreground">
                  {codexReady ? "Ready to use" : "Configure later in settings"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border border-border max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-500 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              Your credentials are secure
            </p>
            <p className="text-xs text-muted-foreground">
              API keys are stored locally and never sent to our servers
            </p>
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
        onClick={onFinish}
        data-testid="setup-finish-button"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Start Building
      </Button>
    </div>
  );
}

// Main Setup View
export function SetupView() {
  const { currentStep, setCurrentStep, completeSetup, setSkipClaudeSetup, setSkipCodexSetup } =
    useSetupStore();
  const { setCurrentView } = useAppStore();

  const steps = ["welcome", "claude", "codex", "complete"] as const;
  type StepName = typeof steps[number];
  const getStepName = (): StepName => {
    if (currentStep === "claude_detect" || currentStep === "claude_auth") return "claude";
    if (currentStep === "codex_detect" || currentStep === "codex_auth") return "codex";
    if (currentStep === "welcome") return "welcome";
    return "complete";
  };
  const currentIndex = steps.indexOf(getStepName());

  const handleNext = (from: string) => {
    console.log("[Setup Flow] handleNext called from:", from, "currentStep:", currentStep);
    switch (from) {
      case "welcome":
        console.log("[Setup Flow] Moving to claude_detect step");
        setCurrentStep("claude_detect");
        break;
      case "claude":
        console.log("[Setup Flow] Moving to codex_detect step");
        setCurrentStep("codex_detect");
        break;
      case "codex":
        console.log("[Setup Flow] Moving to complete step");
        setCurrentStep("complete");
        break;
    }
  };

  const handleBack = (from: string) => {
    console.log("[Setup Flow] handleBack called from:", from);
    switch (from) {
      case "claude":
        setCurrentStep("welcome");
        break;
      case "codex":
        setCurrentStep("claude_detect");
        break;
    }
  };

  const handleSkipClaude = () => {
    console.log("[Setup Flow] Skipping Claude setup");
    setSkipClaudeSetup(true);
    setCurrentStep("codex_detect");
  };

  const handleSkipCodex = () => {
    console.log("[Setup Flow] Skipping Codex setup");
    setSkipCodexSetup(true);
    setCurrentStep("complete");
  };

  const handleFinish = () => {
    console.log("[Setup Flow] handleFinish called - completing setup");
    completeSetup();
    console.log("[Setup Flow] Setup completed, redirecting to welcome view");
    setCurrentView("welcome");
  };

  return (
    <div
      className="h-full flex flex-col content-bg"
      data-testid="setup-view"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-glass backdrop-blur-md titlebar-drag-region">
        <div className="px-8 py-4">
          <div className="flex items-center gap-3 titlebar-no-drag">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Automaker" className="w-8 h-8" />
            <span className="text-lg font-semibold text-foreground">
              Automaker Setup
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-8">
          <div className="w-full max-w-2xl mx-auto">
            <div className="mb-8">
              <StepIndicator currentStep={currentIndex} totalSteps={steps.length} />
            </div>

            <div className="py-8">
              {currentStep === "welcome" && (
                <WelcomeStep onNext={() => handleNext("welcome")} />
              )}

              {(currentStep === "claude_detect" ||
                currentStep === "claude_auth") && (
                <ClaudeSetupStep
                  onNext={() => handleNext("claude")}
                  onBack={() => handleBack("claude")}
                  onSkip={handleSkipClaude}
                />
              )}

              {(currentStep === "codex_detect" ||
                currentStep === "codex_auth") && (
                <CodexSetupStep
                  onNext={() => handleNext("codex")}
                  onBack={() => handleBack("codex")}
                  onSkip={handleSkipCodex}
                />
              )}

              {currentStep === "complete" && (
                <CompleteStep onFinish={handleFinish} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
