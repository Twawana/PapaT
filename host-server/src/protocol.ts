/** Shared WebSocket message types between mobile client and PC host. */

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

export type ExecuteLanguage = "javascript" | "python" | "typescript" | "shell";

export type ShellKind = "cmd" | "powershell";

export interface FileSearchHit {
  path: string;
  name: string;
}

export interface GrepHit {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface GitFileStatus {
  path: string;
  index: string;
  working: string;
}

export interface GitStatusResult {
  branch: string;
  isRepo: boolean;
  clean: boolean;
  files: GitFileStatus[];
  ahead?: number;
  behind?: number;
}

export interface DiagnosticItem {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
}

export interface PackageScript {
  name: string;
  command: string;
}

export type ClientMessage =
  | { type: "ping" }
  | { type: "execute"; id: string; code: string; language: ExecuteLanguage }
  | { type: "shell_run"; id: string; command: string; shell?: ShellKind }
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
  | { type: "fs_search"; id: string; query: string; limit?: number }
  | { type: "fs_grep"; id: string; query: string; limit?: number }
  | { type: "git_status"; id: string }
  | { type: "git_diff"; id: string; path?: string }
  | { type: "git_add"; id: string; paths?: string[] }
  | { type: "git_commit"; id: string; message: string }
  | { type: "git_pull"; id: string }
  | { type: "git_push"; id: string }
  | { type: "git_checkout"; id: string; branch: string; create?: boolean }
  | { type: "git_log"; id: string; limit?: number }
  | { type: "git_stash"; id: string; message?: string }
  | { type: "git_merge"; id: string; branch: string }
  | { type: "diagnostics_run"; id: string }
  | { type: "scripts_list"; id: string }
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
  | { type: "vscode_register"; workspaceFolders: string[]; extensionVersion?: string }
  | { type: "vscode_status"; activeFile?: string | null; workspaceFolders?: string[] }
  | { type: "vscode_get_status"; id: string }
  | { type: "vscode_open_file"; id: string; path: string }
  | { type: "auth"; token: string }
  | { type: "pair"; code: string; deviceName?: string };

export type VscodeCommand = "open_file" | "open_folder" | "reveal";

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
      shellOptions?: ShellKind[];
      defaultShell?: ShellKind;
    }
  | { type: "pong" }
  | {
      type: "output";
      id: string;
      stream: "stdout" | "stderr";
      data: string;
    }
  | {
      type: "done";
      id: string;
      exitCode: number | null;
      signal: string | null;
      cwd?: string;
      shell?: ShellKind;
    }
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
  | { type: "fs_search_result"; id: string; hits: FileSearchHit[] }
  | { type: "fs_grep_result"; id: string; hits: GrepHit[] }
  | { type: "git_status_result"; id: string; status: GitStatusResult }
  | { type: "git_diff_result"; id: string; diff: string }
  | { type: "git_add_result"; id: string; ok: true }
  | { type: "git_commit_result"; id: string; output: string }
  | { type: "git_action_result"; id: string; output: string }
  | { type: "diagnostics_result"; id: string; items: DiagnosticItem[] }
  | { type: "scripts_list_result"; id: string; scripts: PackageScript[] }
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
      type: "vscode_command";
      command: VscodeCommand;
      path: string;
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
      shellOptions?: ShellKind[];
      defaultShell?: ShellKind;
    }
  | { type: "auth_error"; message: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as ClientMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
