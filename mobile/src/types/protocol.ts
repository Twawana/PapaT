/** Shared WebSocket message types — mirrors host-server/src/protocol.ts */

export interface FileEntry {
  name: string;
  path: string;
  entryType: "file" | "directory";
  size?: number;
  mtime?: number;
}

export interface RecentFolder {
  path: string;
  name: string;
  lastOpened: number;
}

export interface BrowseRoot {
  name: string;
  path: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export type EditorId = "cursor" | "vscode";

export interface AgentToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentChatMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCallId?: string;
  name?: string;
  isError?: boolean;
  toolCalls?: AgentToolCallInfo[];
  timestamp?: number;
}

export interface AgentSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

export type ClientMessage =
  | { type: "ping" }
  | { type: "execute"; id: string; code: string; language: "javascript" }
  | { type: "shell_run"; id: string; command: string }
  | { type: "shell_cancel"; id: string }
  | { type: "fs_list"; id: string; path: string }
  | { type: "fs_read"; id: string; path: string }
  | {
      type: "fs_write";
      id: string;
      path: string;
      content: string;
      create?: boolean;
    }
  | { type: "fs_delete"; id: string; path: string }
  | { type: "fs_mkdir"; id: string; path: string }
  | { type: "fs_move"; id: string; from: string; to: string }
  | { type: "workspace_recent"; id: string }
  | { type: "workspace_get"; id: string }
  | { type: "browse_roots"; id: string }
  | { type: "browse_list"; id: string; path: string }
  | {
      type: "project_open";
      id: string;
      path: string;
      editor?: EditorId;
    }
  | { type: "agent_send"; id: string; sessionId: string; message: string }
  | { type: "agent_cancel"; sessionId: string }
  | { type: "agent_history"; id: string; sessionId: string }
  | { type: "agent_clear"; id: string; sessionId: string }
  | { type: "agent_sessions"; id: string }
  | { type: "vscode_get_status"; id: string }
  | { type: "vscode_open_file"; id: string; path: string }
  | { type: "auth"; token: string }
  | { type: "pair"; code: string; deviceName?: string };

export type ServerMessage =
  | {
      type: "connected";
      serverId: string;
      version: string;
      hostname: string;
      workspace: string;
      authenticated?: boolean;
      deviceName?: string;
      vscode?: {
        connected: boolean;
        workspaceFolders?: string[];
        activeFile?: string | null;
      };
    }
  | { type: "pong" }
  | {
      type: "output";
      id: string;
      stream: "stdout" | "stderr";
      data: string;
    }
  | { type: "done"; id: string; exitCode: number | null; signal: string | null; cwd?: string }
  | { type: "error"; id?: string; message: string }
  | { type: "fs_list_result"; id: string; path: string; entries: FileEntry[] }
  | {
      type: "fs_read_result";
      id: string;
      path: string;
      content: string;
      size: number;
      mtime: number;
    }
  | {
      type: "fs_write_result";
      id: string;
      path: string;
      size: number;
      mtime: number;
    }
  | { type: "fs_delete_result"; id: string; path: string }
  | { type: "fs_mkdir_result"; id: string; path: string }
  | { type: "fs_move_result"; id: string; from: string; to: string }
  | {
      type: "workspace_recent_result";
      id: string;
      current: string;
      recent: RecentFolder[];
    }
  | { type: "workspace_get_result"; id: string; path: string; name: string }
  | { type: "browse_roots_result"; id: string; roots: BrowseRoot[] }
  | {
      type: "browse_list_result";
      id: string;
      path: string;
      entries: BrowseEntry[];
    }
  | {
      type: "project_open_result";
      id: string;
      path: string;
      name: string;
      editor?: EditorId;
    }
  | { type: "agent_started"; id: string; sessionId: string }
  | { type: "agent_delta"; sessionId: string; content: string }
  | {
      type: "agent_tool_call";
      sessionId: string;
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "agent_tool_result";
      sessionId: string;
      toolCallId: string;
      name: string;
      result: string;
      isError?: boolean;
    }
  | { type: "agent_done"; id: string; sessionId: string }
  | {
      type: "agent_history_result";
      id: string;
      sessionId: string;
      messages: AgentChatMessage[];
    }
  | {
      type: "agent_sessions_result";
      id: string;
      sessions: AgentSessionSummary[];
    }
  | {
      type: "agent_error";
      id?: string;
      sessionId?: string;
      message: string;
    }
  | {
      type: "vscode_status";
      connected: boolean;
      workspaceFolders?: string[];
      activeFile?: string | null;
    }
  | {
      type: "vscode_get_status_result";
      id: string;
      connected: boolean;
      workspaceFolders?: string[];
      activeFile?: string | null;
    }
  | { type: "vscode_open_file_result"; id: string; ok: boolean; message?: string }
  | {
      type: "auth_required";
      serverId: string;
      version: string;
      hostname: string;
    }
  | {
      type: "auth_ok";
      serverId: string;
      version: string;
      hostname: string;
      workspace: string;
      deviceId: string;
      deviceName: string;
      token?: string;
      vscode?: {
        connected: boolean;
        workspaceFolders?: string[];
        activeFile?: string | null;
      };
    }
  | { type: "auth_error"; message: string };

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "error";

export interface ExecutionState {
  id: string | null;
  output: string;
  isRunning: boolean;
  exitCode: number | null;
  cwd?: string;
}

export type AgentUiMessage =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "assistant"; content: string; streaming?: boolean }
  | {
      id: string;
      kind: "tool";
      name: string;
      args?: Record<string, unknown>;
      result?: string;
      isError?: boolean;
      status: "running" | "done";
    }
  | { id: string; kind: "error"; content: string };
