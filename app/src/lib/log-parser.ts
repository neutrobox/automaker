/**
 * Log Parser Utility
 * Parses agent output into structured sections for display
 */

export type LogEntryType =
  | "prompt"
  | "tool_call"
  | "tool_result"
  | "phase"
  | "error"
  | "success"
  | "info"
  | "debug"
  | "warning"
  | "thinking";

export interface LogEntry {
  id: string;
  type: LogEntryType;
  title: string;
  content: string;
  timestamp?: string;
  collapsed?: boolean;
  metadata?: {
    toolName?: string;
    phase?: string;
    [key: string]: string | undefined;
  };
}

const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * Detects the type of log entry based on content patterns
 */
function detectEntryType(content: string): LogEntryType {
  const trimmed = content.trim();

  // Tool calls
  if (trimmed.startsWith("🔧 Tool:") || trimmed.match(/^Tool:\s*/)) {
    return "tool_call";
  }

  // Tool results / Input
  if (trimmed.startsWith("Input:") || trimmed.startsWith("Result:") || trimmed.startsWith("Output:")) {
    return "tool_result";
  }

  // Phase changes
  if (
    trimmed.startsWith("📋") ||
    trimmed.startsWith("⚡") ||
    trimmed.startsWith("✅") ||
    trimmed.match(/^(Planning|Action|Verification)/i)
  ) {
    return "phase";
  }

  // Errors
  if (trimmed.startsWith("❌") || trimmed.toLowerCase().includes("error:")) {
    return "error";
  }

  // Success messages
  if (
    trimmed.startsWith("✅") ||
    trimmed.toLowerCase().includes("success") ||
    trimmed.toLowerCase().includes("completed")
  ) {
    return "success";
  }

  // Warnings
  if (trimmed.startsWith("⚠️") || trimmed.toLowerCase().includes("warning:")) {
    return "warning";
  }

  // Thinking/Preparation info
  if (
    trimmed.toLowerCase().includes("ultrathink") ||
    trimmed.toLowerCase().includes("thinking level") ||
    trimmed.toLowerCase().includes("estimated cost") ||
    trimmed.toLowerCase().includes("estimated time") ||
    trimmed.toLowerCase().includes("budget tokens") ||
    trimmed.match(/thinking.*preparation/i)
  ) {
    return "thinking";
  }

  // Debug info (JSON, stack traces, etc.)
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.includes("at ") ||
    trimmed.match(/^\s*\d+\s*\|/)
  ) {
    return "debug";
  }

  // Default to info
  return "info";
}

/**
 * Extracts tool name from a tool call entry
 */
function extractToolName(content: string): string | undefined {
  const match = content.match(/🔧\s*Tool:\s*(\S+)/);
  return match?.[1];
}

/**
 * Extracts phase name from a phase entry
 */
function extractPhase(content: string): string | undefined {
  if (content.includes("📋")) return "planning";
  if (content.includes("⚡")) return "action";
  if (content.includes("✅")) return "verification";

  const match = content.match(/^(Planning|Action|Verification)/i);
  return match?.[1]?.toLowerCase();
}

/**
 * Generates a title for a log entry
 */
function generateTitle(type: LogEntryType, content: string): string {
  switch (type) {
    case "tool_call": {
      const toolName = extractToolName(content);
      return toolName ? `Tool Call: ${toolName}` : "Tool Call";
    }
    case "tool_result":
      return "Tool Input/Result";
    case "phase": {
      const phase = extractPhase(content);
      return phase ? `Phase: ${phase.charAt(0).toUpperCase() + phase.slice(1)}` : "Phase Change";
    }
    case "error":
      return "Error";
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "thinking":
      return "Thinking Level";
    case "debug":
      return "Debug Info";
    case "prompt":
      return "Prompt";
    default:
      return "Info";
  }
}

/**
 * Parses raw log output into structured entries
 */
export function parseLogOutput(rawOutput: string): LogEntry[] {
  if (!rawOutput || !rawOutput.trim()) {
    return [];
  }

  const entries: LogEntry[] = [];
  const lines = rawOutput.split("\n");

  let currentEntry: LogEntry | null = null;
  let currentContent: string[] = [];

  const finalizeEntry = () => {
    if (currentEntry && currentContent.length > 0) {
      currentEntry.content = currentContent.join("\n").trim();
      if (currentEntry.content) {
        entries.push(currentEntry);
      }
    }
    currentContent = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines at the beginning
    if (!trimmedLine && !currentEntry) {
      continue;
    }

    // Detect if this line starts a new entry
    const lineType = detectEntryType(trimmedLine);
    const isNewEntry =
      trimmedLine.startsWith("🔧") ||
      trimmedLine.startsWith("📋") ||
      trimmedLine.startsWith("⚡") ||
      trimmedLine.startsWith("✅") ||
      trimmedLine.startsWith("❌") ||
      trimmedLine.startsWith("⚠️") ||
      trimmedLine.startsWith("🧠") ||
      trimmedLine.toLowerCase().includes("ultrathink preparation") ||
      trimmedLine.toLowerCase().includes("thinking level") ||
      (trimmedLine.startsWith("Input:") && currentEntry?.type === "tool_call");

    if (isNewEntry) {
      // Finalize previous entry
      finalizeEntry();

      // Start new entry
      currentEntry = {
        id: generateId(),
        type: lineType,
        title: generateTitle(lineType, trimmedLine),
        content: "",
        metadata: {
          toolName: extractToolName(trimmedLine),
          phase: extractPhase(trimmedLine),
        },
      };
      currentContent.push(trimmedLine);
    } else if (currentEntry) {
      // Continue current entry
      currentContent.push(line);
    } else {
      // No current entry, create a default info entry
      currentEntry = {
        id: generateId(),
        type: "info",
        title: "Info",
        content: "",
      };
      currentContent.push(line);
    }
  }

  // Finalize last entry
  finalizeEntry();

  // Merge consecutive entries of the same type if they're both debug or info
  const mergedEntries = mergeConsecutiveEntries(entries);

  return mergedEntries;
}

/**
 * Merges consecutive entries of the same type for cleaner display
 */
function mergeConsecutiveEntries(entries: LogEntry[]): LogEntry[] {
  if (entries.length <= 1) return entries;

  const merged: LogEntry[] = [];
  let current: LogEntry | null = null;

  for (const entry of entries) {
    if (
      current &&
      (current.type === "debug" || current.type === "info") &&
      current.type === entry.type
    ) {
      // Merge into current
      current.content += "\n\n" + entry.content;
    } else {
      if (current) {
        merged.push(current);
      }
      current = { ...entry };
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Gets the color classes for a log entry type
 */
export function getLogTypeColors(type: LogEntryType): {
  bg: string;
  border: string;
  text: string;
  icon: string;
  badge: string;
} {
  switch (type) {
    case "prompt":
      return {
        bg: "bg-blue-500/10",
        border: "border-l-blue-500",
        text: "text-blue-300",
        icon: "text-blue-400",
        badge: "bg-blue-500/20 text-blue-300",
      };
    case "tool_call":
      return {
        bg: "bg-amber-500/10",
        border: "border-l-amber-500",
        text: "text-amber-300",
        icon: "text-amber-400",
        badge: "bg-amber-500/20 text-amber-300",
      };
    case "tool_result":
      return {
        bg: "bg-slate-500/10",
        border: "border-l-slate-400",
        text: "text-slate-300",
        icon: "text-slate-400",
        badge: "bg-slate-500/20 text-slate-300",
      };
    case "phase":
      return {
        bg: "bg-cyan-500/10",
        border: "border-l-cyan-500",
        text: "text-cyan-300",
        icon: "text-cyan-400",
        badge: "bg-cyan-500/20 text-cyan-300",
      };
    case "error":
      return {
        bg: "bg-red-500/10",
        border: "border-l-red-500",
        text: "text-red-300",
        icon: "text-red-400",
        badge: "bg-red-500/20 text-red-300",
      };
    case "success":
      return {
        bg: "bg-emerald-500/10",
        border: "border-l-emerald-500",
        text: "text-emerald-300",
        icon: "text-emerald-400",
        badge: "bg-emerald-500/20 text-emerald-300",
      };
    case "warning":
      return {
        bg: "bg-orange-500/10",
        border: "border-l-orange-500",
        text: "text-orange-300",
        icon: "text-orange-400",
        badge: "bg-orange-500/20 text-orange-300",
      };
    case "thinking":
      return {
        bg: "bg-indigo-500/10",
        border: "border-l-indigo-500",
        text: "text-indigo-300",
        icon: "text-indigo-400",
        badge: "bg-indigo-500/20 text-indigo-300",
      };
    case "debug":
      return {
        bg: "bg-purple-500/10",
        border: "border-l-purple-500",
        text: "text-purple-300",
        icon: "text-purple-400",
        badge: "bg-purple-500/20 text-purple-300",
      };
    default:
      return {
        bg: "bg-zinc-500/10",
        border: "border-l-zinc-500",
        text: "text-zinc-300",
        icon: "text-zinc-400",
        badge: "bg-zinc-500/20 text-zinc-300",
      };
  }
}
