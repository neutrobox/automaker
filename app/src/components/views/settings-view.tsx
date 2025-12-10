"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { useCliStatus } from "./settings-view/hooks/use-cli-status";
import { useScrollTracking } from "./settings-view/hooks/use-scroll-tracking";
import { NAV_ITEMS } from "./settings-view/config/navigation";
import { KeyboardMapDialog } from "./settings-view/components/keyboard-map-dialog";
import { DeleteProjectDialog } from "./settings-view/components/delete-project-dialog";
import { ApiKeysSection } from "./settings-view/api-keys/api-keys-section";
import { ClaudeCliStatus } from "./settings-view/cli-status/claude-cli-status";
import { CodexCliStatus } from "./settings-view/cli-status/codex-cli-status";
import { AppearanceSection } from "./settings-view/appearance/appearance-section";
import { KanbanDisplaySection } from "./settings-view/kanban-display/kanban-display-section";
import { KeyboardShortcutsSection } from "./settings-view/keyboard-shortcuts/keyboard-shortcuts-section";
import { FeatureDefaultsSection } from "./settings-view/feature-defaults/feature-defaults-section";
import { DangerZoneSection } from "./settings-view/danger-zone/danger-zone-section";

export function SettingsView() {
  const {
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

  // Use CLI status hook
  const {
    claudeCliStatus,
    codexCliStatus,
    isCheckingClaudeCli,
    isCheckingCodexCli,
    handleRefreshClaudeCli,
    handleRefreshCodexCli,
  } = useCliStatus();

  // Use scroll tracking hook
  const { activeSection, scrollToSection, scrollContainerRef } =
    useScrollTracking(NAV_ITEMS, currentProject);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKeyboardMapDialog, setShowKeyboardMapDialog] = useState(false);

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
            <ApiKeysSection />

            {/* Claude CLI Status Section */}
            {claudeCliStatus && (
              <ClaudeCliStatus
                status={claudeCliStatus}
                isChecking={isCheckingClaudeCli}
                onRefresh={handleRefreshClaudeCli}
              />
            )}

            {/* Codex CLI Status Section */}
            {codexCliStatus && (
              <CodexCliStatus
                status={codexCliStatus}
                isChecking={isCheckingCodexCli}
                onRefresh={handleRefreshCodexCli}
              />
            )}

            {/* Appearance Section */}
            <AppearanceSection
              effectiveTheme={effectiveTheme}
              currentProject={currentProject}
              onThemeChange={handleSetTheme}
            />

            {/* Kanban Card Display Section */}
            <KanbanDisplaySection
              detailLevel={kanbanCardDetailLevel}
              onChange={setKanbanCardDetailLevel}
            />

            {/* Keyboard Shortcuts Section */}
            <KeyboardShortcutsSection
              onOpenKeyboardMap={() => setShowKeyboardMapDialog(true)}
            />

            {/* Feature Defaults Section */}
            <FeatureDefaultsSection
              showProfilesOnly={showProfilesOnly}
              defaultSkipTests={defaultSkipTests}
              useWorktrees={useWorktrees}
              onShowProfilesOnlyChange={setShowProfilesOnly}
              onDefaultSkipTestsChange={setDefaultSkipTests}
              onUseWorktreesChange={setUseWorktrees}
            />

            {/* Danger Zone Section - Only show when a project is selected */}
            <DangerZoneSection
              project={currentProject}
              onDeleteClick={() => setShowDeleteDialog(true)}
            />

            {/* Save Button */}
            <div className="flex items-center gap-4">
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
      <KeyboardMapDialog
        open={showKeyboardMapDialog}
        onOpenChange={setShowKeyboardMapDialog}
      />

      {/* Delete Project Confirmation Dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />
    </div>
  );
}
