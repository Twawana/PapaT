import { ClientMessage, EditorId, ServerMessage } from "../types/protocol";

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: "open" | "close" | "error", detail?: string) => void;

export interface ConnectOptions {
  token?: string;
  pairingCode?: string;
  deviceName?: string;
}

interface PendingRequest {
  expectedTypes: string[];
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Thin WebSocket wrapper for PapaT host communication.
 * Supports multiple message/status listeners and request/response pairs.
 */
export class PapaTClient {
  private ws: WebSocket | null = null;
  private url = "";
  private authenticated = false;
  private pendingConnect: ConnectOptions | null = null;
  private lastConnectHost = "";
  private lastConnectPort = 0;
  private messageListeners = new Set<MessageHandler>();
  private statusListeners = new Set<StatusHandler>();
  private pendingRequests = new Map<string, PendingRequest>();

  addMessageListener(listener: MessageHandler): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  addStatusListener(listener: StatusHandler): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** @deprecated Use addMessageListener / addStatusListener */
  setHandlers(handlers: {
    onMessage: MessageHandler;
    onStatus: StatusHandler;
  }): void {
    const removeMessage = this.addMessageListener(handlers.onMessage);
    const removeStatus = this.addStatusListener(handlers.onStatus);
    this._legacyCleanup = () => {
      removeMessage();
      removeStatus();
    };
  }

  private _legacyCleanup: (() => void) | null = null;

  connect(host: string, port: number, options: ConnectOptions = {}): void {
    this.disconnect();

    const trimmed = host.trim().replace(/^ws:\/\//, "");
    this.lastConnectHost = trimmed;
    this.lastConnectPort = port;
    this.url = `ws://${trimmed}:${port}`;
    this.authenticated = false;
    this.pendingConnect = options;

    this.emitStatus("open", "connecting");

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.emitStatus("open", "authenticating");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;

        if (message.type === "auth_required") {
          this.handleAuthRequired();
          return;
        }

        if (message.type === "auth_ok") {
          this.authenticated = true;
          this.pendingConnect = null;
        }

        if (message.type === "connected" && message.authenticated !== false) {
          this.authenticated = true;
        }

        if (message.type === "auth_error") {
          this.emitStatus("error", message.message);
        }

        if (this.tryResolvePending(message)) {
          return;
        }
        for (const listener of this.messageListeners) {
          listener(message);
        }
      } catch {
        this.emitStatus("error", "Failed to parse server message");
      }
    };

    ws.onerror = () => {
      this.emitStatus("error", `Cannot reach ${this.url}`);
    };

    ws.onclose = () => {
      this.ws = null;
      this.rejectAllPending("Connection closed");
      this.emitStatus("close");
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
    this.pendingConnect = null;
    this.rejectAllPending("Disconnected");
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }

  isSocketOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectTarget(): { host: string; port: number } {
    return { host: this.lastConnectHost, port: this.lastConnectPort };
  }

  private handleAuthRequired(): void {
    const options = this.pendingConnect ?? {};

    if (options.pairingCode) {
      this.send({
        type: "pair",
        code: options.pairingCode.trim().toUpperCase(),
        deviceName: options.deviceName,
      });
      return;
    }

    if (options.token) {
      this.send({ type: "auth", token: options.token });
      return;
    }

    this.emitStatus("error", "Pairing required — scan the QR code on your PC");
    this.disconnect();
  }

  send(message: ClientMessage): void {
    if (!this.isSocketOpen()) {
      throw new Error("Not connected to host");
    }
    this.ws!.send(JSON.stringify(message));
  }

  ping(): void {
    this.send({ type: "ping" });
  }

  execute(id: string, code: string): void {
    this.send({ type: "execute", id, code, language: "javascript" });
  }

  shellRun(id: string, command: string): void {
    this.send({ type: "shell_run", id, command });
  }

  shellCancel(id: string): void {
    this.send({ type: "shell_cancel", id });
  }

  listDir(path: string): Promise<Extract<ServerMessage, { type: "fs_list_result" }>> {
    const id = createRequestId("fs-list");
    return this.request(id, { type: "fs_list", id, path }, ["fs_list_result"]);
  }

  readFile(path: string): Promise<Extract<ServerMessage, { type: "fs_read_result" }>> {
    const id = createRequestId("fs-read");
    return this.request(id, { type: "fs_read", id, path }, ["fs_read_result"]);
  }

  writeFile(
    path: string,
    content: string,
    create = true
  ): Promise<Extract<ServerMessage, { type: "fs_write_result" }>> {
    const id = createRequestId("fs-write");
    return this.request(
      id,
      { type: "fs_write", id, path, content, create },
      ["fs_write_result"]
    );
  }

  deletePath(path: string): Promise<Extract<ServerMessage, { type: "fs_delete_result" }>> {
    const id = createRequestId("fs-delete");
    return this.request(id, { type: "fs_delete", id, path }, ["fs_delete_result"]);
  }

  mkdir(path: string): Promise<Extract<ServerMessage, { type: "fs_mkdir_result" }>> {
    const id = createRequestId("fs-mkdir");
    return this.request(id, { type: "fs_mkdir", id, path }, ["fs_mkdir_result"]);
  }

  movePath(
    from: string,
    to: string
  ): Promise<Extract<ServerMessage, { type: "fs_move_result" }>> {
    const id = createRequestId("fs-move");
    return this.request(id, { type: "fs_move", id, from, to }, ["fs_move_result"]);
  }

  getWorkspaceRecent(): Promise<
    Extract<ServerMessage, { type: "workspace_recent_result" }>
  > {
    const id = createRequestId("ws-recent");
    return this.request(id, { type: "workspace_recent", id }, [
      "workspace_recent_result",
    ]);
  }

  getWorkspace(): Promise<Extract<ServerMessage, { type: "workspace_get_result" }>> {
    const id = createRequestId("ws-get");
    return this.request(id, { type: "workspace_get", id }, ["workspace_get_result"]);
  }

  getBrowseRoots(): Promise<Extract<ServerMessage, { type: "browse_roots_result" }>> {
    const id = createRequestId("browse-roots");
    return this.request(id, { type: "browse_roots", id }, ["browse_roots_result"]);
  }

  browseList(path: string): Promise<Extract<ServerMessage, { type: "browse_list_result" }>> {
    const id = createRequestId("browse-list");
    return this.request(id, { type: "browse_list", id, path }, ["browse_list_result"]);
  }

  openProject(
    path: string,
    editor?: EditorId
  ): Promise<Extract<ServerMessage, { type: "project_open_result" }>> {
    const id = createRequestId("project-open");
    return this.request(
      id,
      { type: "project_open", id, path, editor },
      ["project_open_result"]
    );
  }

  sendAgentMessage(sessionId: string, message: string): string {
    const id = createRequestId("agent-send");
    this.send({ type: "agent_send", id, sessionId, message });
    return id;
  }

  cancelAgent(sessionId: string): void {
    this.send({ type: "agent_cancel", sessionId });
  }

  getAgentHistory(
    sessionId: string
  ): Promise<Extract<ServerMessage, { type: "agent_history_result" }>> {
    const id = createRequestId("agent-history");
    return this.request(
      id,
      { type: "agent_history", id, sessionId },
      ["agent_history_result"]
    );
  }

  clearAgentHistory(
    sessionId: string
  ): Promise<Extract<ServerMessage, { type: "agent_history_result" }>> {
    const id = createRequestId("agent-clear");
    return this.request(
      id,
      { type: "agent_clear", id, sessionId },
      ["agent_history_result"]
    );
  }

  listAgentSessions(): Promise<
    Extract<ServerMessage, { type: "agent_sessions_result" }>
  > {
    const id = createRequestId("agent-sessions");
    return this.request(id, { type: "agent_sessions", id }, [
      "agent_sessions_result",
    ]);
  }

  getVscodeStatus(): Promise<
    Extract<ServerMessage, { type: "vscode_get_status_result" }>
  > {
    const id = createRequestId("vscode-status");
    return this.request(id, { type: "vscode_get_status", id }, [
      "vscode_get_status_result",
    ]);
  }

  openInVscode(
    path: string
  ): Promise<Extract<ServerMessage, { type: "vscode_open_file_result" }>> {
    const id = createRequestId("vscode-open");
    return this.request(id, { type: "vscode_open_file", id, path }, [
      "vscode_open_file_result",
    ]);
  }

  private emitStatus(status: "open" | "close" | "error", detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  private request<T extends ServerMessage>(
    id: string,
    message: ClientMessage & { id: string },
    expectedTypes: string[],
    timeoutMs = 30_000
  ): Promise<T> {
    if (!this.isSocketOpen()) {
      return Promise.reject(new Error("Not connected to host"));
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timed out"));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        expectedTypes,
        resolve: (msg) => resolve(msg as T),
        reject,
        timer,
      });

      try {
        this.send(message);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error("Failed to send request"));
      }
    });
  }

  private tryResolvePending(message: ServerMessage): boolean {
    if (message.type === "error" && message.id) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        pending.reject(new Error(message.message));
        return true;
      }
      return false;
    }

    if (message.type === "agent_error" && message.id) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        pending.reject(new Error(message.message));
      }
      return false;
    }

    if (!("id" in message) || typeof message.id !== "string") {
      return false;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending || !pending.expectedTypes.includes(message.type)) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(message.id);
    pending.resolve(message);
    return true;
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }
}

export const papatClient = new PapaTClient();
