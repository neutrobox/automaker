/**
 * Electron API type definitions
 */

export interface ImageAttachment {
  id: string;
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size: number; // file size in bytes
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isError?: boolean;
  images?: ImageAttachment[];
}

export interface ToolUse {
  name: string;
  input: unknown;
}

export type StreamEvent =
  | {
      type: "message";
      sessionId: string;
      message: Message;
    }
  | {
      type: "stream";
      sessionId: string;
      messageId: string;
      content: string;
      isComplete: boolean;
    }
  | {
      type: "tool_use";
      sessionId: string;
      tool: ToolUse;
    }
  | {
      type: "complete";
      sessionId: string;
      messageId?: string;
      content: string;
      toolUses: ToolUse[];
    }
  | {
      type: "error";
      sessionId: string;
      error: string;
      message?: Message;
    };

export interface SessionListItem {
  id: string;
  name: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isArchived: boolean;
  isDirty?: boolean; // Indicates session has completed work that needs review
  tags: string[];
  preview: string;
}

export interface AgentAPI {
  start: (
    sessionId: string,
    workingDirectory?: string
  ) => Promise<{
    success: boolean;
    messages?: Message[];
    sessionId?: string;
    error?: string;
  }>;

  send: (
    sessionId: string,
    message: string,
    workingDirectory?: string,
    imagePaths?: string[]
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  getHistory: (sessionId: string) => Promise<{
    success: boolean;
    messages?: Message[];
    isRunning?: boolean;
    error?: string;
  }>;

  stop: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  clear: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onStream: (callback: (event: StreamEvent) => void) => () => void;
}

export interface SessionsAPI {
  list: (includeArchived?: boolean) => Promise<{
    success: boolean;
    sessions?: SessionListItem[];
    error?: string;
  }>;

  create: (
    name: string,
    projectPath: string,
    workingDirectory?: string
  ) => Promise<{
    success: boolean;
    sessionId?: string;
    session?: unknown;
    error?: string;
  }>;

  update: (
    sessionId: string,
    name?: string,
    tags?: string[]
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  archive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  unarchive: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  delete: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  markClean: (sessionId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export type AutoModeEvent =
  | {
      type: "auto_mode_feature_start";
      featureId: string;
      feature: unknown;
    }
  | {
      type: "auto_mode_progress";
      featureId: string;
      content: string;
    }
  | {
      type: "auto_mode_tool";
      featureId: string;
      tool: string;
      input: unknown;
    }
  | {
      type: "auto_mode_feature_complete";
      featureId: string;
      passes: boolean;
      message: string;
    }
  | {
      type: "auto_mode_error";
      error: string;
      featureId?: string;
    }
  | {
      type: "auto_mode_complete";
      message: string;
    }
  | {
      type: "auto_mode_phase";
      featureId: string;
      phase: "planning" | "action" | "verification";
      message: string;
    }
  | {
      type: "auto_mode_ultrathink_preparation";
      featureId: string;
      warnings: string[];
      recommendations: string[];
      estimatedCost?: number;
      estimatedTime?: string;
    };

export interface AutoModeAPI {
  start: (projectPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  stop: () => Promise<{
    success: boolean;
    error?: string;
  }>;

  stopFeature: (featureId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  status: () => Promise<{
    success: boolean;
    isRunning?: boolean;
    currentFeatureId?: string | null;
    runningFeatures?: string[];
    error?: string;
  }>;

  runFeature: (projectPath: string, featureId: string) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  verifyFeature: (projectPath: string, featureId: string) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  followUpFeature: (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => Promise<{
    success: boolean;
    passes?: boolean;
    error?: string;
  }>;

  commitFeature: (projectPath: string, featureId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface ElectronAPI {
  ping: () => Promise<string>;

  // Dialog APIs
  openDirectory: () => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  openFile: (options?: unknown) => Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;

  // File system APIs
  readFile: (filePath: string) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;
  writeFile: (filePath: string, content: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  mkdir: (dirPath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  readdir: (dirPath: string) => Promise<{
    success: boolean;
    entries?: Array<{
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }>;
    error?: string;
  }>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<{
    success: boolean;
    stats?: {
      isDirectory: boolean;
      isFile: boolean;
      size: number;
      mtime: Date;
    };
    error?: string;
  }>;

  // App APIs
  getPath: (name: string) => Promise<string>;
  saveImageToTemp: (
    data: string,
    filename: string,
    mimeType: string
  ) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Agent APIs
  agent: AgentAPI;

  // Session Management APIs
  sessions: SessionsAPI;

  // Auto Mode APIs
  autoMode: AutoModeAPI;

  // Claude CLI Detection API
  checkClaudeCli: () => Promise<{
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
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    isElectron: boolean;
  }
}

export {};
