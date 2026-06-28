import * as vscode from "vscode";
import WebSocket from "ws";
import {
  ClientMessage,
  parseServerMessage,
  serializeClientMessage,
  ServerMessage,
} from "./protocol";

const EXTENSION_VERSION = "0.5.0";
const RECONNECT_MS = 3000;

export class PapaTConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalClose = false;
  private connected = false;

  constructor(
    private readonly statusBar: vscode.StatusBarItem,
    private readonly onCommand: (command: ServerMessage & { type: "vscode_command" }) => void
  ) {}

  connect(): void {
    const config = vscode.workspace.getConfiguration("papat");
    const host = config.get<string>("host", "127.0.0.1");
    const port = config.get<number>("port", 3847);
    const url = `ws://${host}:${port}`;

    this.intentionalClose = false;
    this.updateStatus("connecting", `Connecting to ${url}`);

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on("open", () => {
      this.connected = true;
      this.updateStatus("connecting", `PapaT: connecting (${host}:${port})`);
    });

    socket.on("message", (data) => {
      const message = parseServerMessage(data.toString("utf-8"));
      if (!message) {
        return;
      }

      if (message.type === "auth_required") {
        this.register();
        this.updateStatus("connected", `PapaT: connected (${host}:${port})`);
        return;
      }

      if (message.type === "connected") {
        this.register();
        this.updateStatus("connected", `PapaT: connected (${host}:${port})`);
        return;
      }

      if (message.type === "vscode_command") {
        this.onCommand(message);
      }
    });

    socket.on("close", () => {
      this.connected = false;
      this.socket = null;
      if (this.intentionalClose) {
        this.updateStatus("disconnected", "PapaT: disconnected");
        return;
      }

      this.updateStatus("connecting", "PapaT: reconnecting...");
      this.scheduleReconnect();
    });

    socket.on("error", () => {
      this.updateStatus("error", "PapaT: host unreachable");
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.connected = false;
    this.updateStatus("disconnected", "PapaT: disconnected");
  }

  isConnected(): boolean {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  sendStatus(activeFile?: string | null): void {
    this.send({
      type: "vscode_status",
      activeFile: activeFile ?? null,
      workspaceFolders: this.getWorkspaceFolders(),
    });
  }

  private register(): void {
    this.send({
      type: "vscode_register",
      workspaceFolders: this.getWorkspaceFolders(),
      extensionVersion: EXTENSION_VERSION,
    });
    this.sendStatus(vscode.window.activeTextEditor?.document.uri.fsPath ?? null);
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(serializeClientMessage(message));
  }

  private getWorkspaceFolders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalClose) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  private updateStatus(
    state: "connected" | "connecting" | "disconnected" | "error",
    text: string
  ): void {
    this.statusBar.text = text;
    this.statusBar.tooltip = "PapaT phone bridge";
    this.statusBar.command = "papat.showStatus";

    if (state === "connected") {
      this.statusBar.backgroundColor = undefined;
      this.statusBar.color = undefined;
    } else if (state === "error") {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
    } else {
      this.statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }

    this.statusBar.show();
  }
}

export async function handleVscodeCommand(
  message: ServerMessage & { type: "vscode_command" }
): Promise<void> {
  const uri = vscode.Uri.file(message.path);

  switch (message.command) {
    case "open_file": {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
      break;
    }
    case "open_folder": {
      let isDirectory = false;
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        isDirectory = stat.type === vscode.FileType.Directory;
      } catch {
        return;
      }

      if (!isDirectory) {
        return;
      }

      const alreadyOpen = (vscode.workspace.workspaceFolders ?? []).some(
        (folder) => folder.uri.fsPath.toLowerCase() === uri.fsPath.toLowerCase()
      );

      if (alreadyOpen) {
        await vscode.commands.executeCommand("revealInExplorer", uri);
        return;
      }

      await vscode.commands.executeCommand("vscode.openFolder", uri, false);
      break;
    }
    case "reveal":
      await vscode.commands.executeCommand("revealInExplorer", uri);
      break;
  }
}
