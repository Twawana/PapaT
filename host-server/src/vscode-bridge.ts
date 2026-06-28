import * as path from "path";
import { WebSocket } from "ws";
import { getWorkspaceRoot } from "./workspace-state";
import { ServerMessage, serializeServerMessage } from "./protocol";

export interface VscodeStatus {
  connected: boolean;
  workspaceFolders: string[];
  activeFile: string | null;
}

let vscodeSocket: WebSocket | null = null;
let vscodeStatus: VscodeStatus = {
  connected: false,
  workspaceFolders: [],
  activeFile: null,
};

type BroadcastFn = (message: ServerMessage, except?: WebSocket) => void;

let broadcast: BroadcastFn = () => {};

export function initVscodeBridge(broadcastFn: BroadcastFn): void {
  broadcast = broadcastFn;
}

export function getVscodeStatus(): VscodeStatus {
  return {
    connected: vscodeStatus.connected,
    workspaceFolders: [...vscodeStatus.workspaceFolders],
    activeFile: vscodeStatus.activeFile,
  };
}

export function isVscodeConnected(): boolean {
  return vscodeSocket?.readyState === WebSocket.OPEN;
}

export function isVscodeClient(ws: WebSocket): boolean {
  return ws === vscodeSocket;
}

export function registerVscodeClient(
  ws: WebSocket,
  workspaceFolders: string[]
): void {
  vscodeSocket = ws;
  vscodeStatus = {
    connected: true,
    workspaceFolders: workspaceFolders.map((folder) => path.resolve(folder)),
    activeFile: null,
  };
  console.log(
    `[Titus Host] VS Code connected (${vscodeStatus.workspaceFolders.length} folder(s))`
  );
  broadcastVscodeStatus();
}

export function unregisterVscodeClient(ws: WebSocket): void {
  if (vscodeSocket !== ws) {
    return;
  }

  vscodeSocket = null;
  vscodeStatus = {
    connected: false,
    workspaceFolders: [],
    activeFile: null,
  };
  console.log("[Titus Host] VS Code disconnected");
  broadcastVscodeStatus();
}

export function updateVscodeClientStatus(
  activeFile?: string | null,
  workspaceFolders?: string[]
): void {
  if (!isVscodeConnected()) {
    return;
  }

  if (activeFile !== undefined) {
    vscodeStatus.activeFile = activeFile;
  }

  if (workspaceFolders) {
    vscodeStatus.workspaceFolders = workspaceFolders.map((folder) =>
      path.resolve(folder)
    );
  }

  broadcastVscodeStatus();
}

function broadcastVscodeStatus(): void {
  broadcast({
    type: "vscode_status",
    connected: vscodeStatus.connected,
    workspaceFolders: vscodeStatus.workspaceFolders,
    activeFile: vscodeStatus.activeFile,
  });
}

import { resolveFsPath } from "./path-utils";

export function toAbsoluteWorkspacePath(clientPath: string): string {
  return resolveFsPath(clientPath);
}

export function sendVscodeCommand(
  command: "open_file" | "open_folder" | "reveal",
  relativePath: string
): boolean {
  if (!isVscodeConnected() || !vscodeSocket) {
    return false;
  }

  const absolutePath = toAbsoluteWorkspacePath(relativePath);
  vscodeSocket.send(
    serializeServerMessage({
      type: "vscode_command",
      command,
      path: absolutePath,
    })
  );
  return true;
}

export function openInVscode(
  relativePath: string,
  command: "open_file" | "open_folder" | "reveal" = "open_file"
): boolean {
  return sendVscodeCommand(command, relativePath);
}
