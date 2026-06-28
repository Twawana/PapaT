export type VscodeCommand = "open_file" | "open_folder" | "reveal";

export type ServerMessage =
  | {
      type: "connected";
      serverId: string;
      version: string;
      hostname: string;
      workspace: string;
    }
  | {
      type: "auth_required";
      serverId: string;
      version: string;
      hostname: string;
    }
  | { type: "pong" }
  | { type: "error"; message: string }
  | {
      type: "vscode_command";
      command: VscodeCommand;
      path: string;
    }
  | {
      type: "vscode_status";
      connected: boolean;
      workspaceFolders?: string[];
      activeFile?: string | null;
    };

export type ClientMessage =
  | { type: "ping" }
  | { type: "vscode_register"; workspaceFolders: string[]; extensionVersion?: string }
  | { type: "vscode_status"; activeFile?: string | null; workspaceFolders?: string[] };

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as ServerMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}
