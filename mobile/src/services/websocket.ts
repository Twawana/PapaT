import { AgentProviderId, ClientMessage, EditorId, ExecuteLanguage, ServerMessage, ShellKind } from "../types/protocol";
import { errorMessage } from "../utils/errors";

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
 * Thin WebSocket wrapper for Titus host communication.
 * Supports multiple message/status listeners and request/response pairs.
 */
export class TitusClient {
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

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.emitStatus("error", errorMessage(err, "Failed to connect to host"));
      return;
    }

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
        this.emitMessage(message);
      } catch (err) {
        this.emitStatus("error", errorMessage(err, "Failed to parse server message"));
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

  execute(id: string, code: string, language: ExecuteLanguage = "javascript"): void {
    this.send({ type: "execute", id, code, language });
  }

  shellRun(id: string, command: string, shell?: ShellKind): void {
    this.send({ type: "shell_run", id, command, shell });
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

  sendAgentMessage(
    sessionId: string,
    message: string,
    attachments?: import("../types/protocol").AgentAttachmentPayload[]
  ): string {
    const id = createRequestId("agent-send");
    this.send({ type: "agent_send", id, sessionId, message, attachments });
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

  listAgentProviders(force = false): Promise<
    Extract<ServerMessage, { type: "agent_providers_result" }>
  > {
    const id = createRequestId("agent-providers");
    return this.request(id, { type: "agent_providers", id, force }, [
      "agent_providers_result",
    ]);
  }

  setAgentProvider(
    providerId: AgentProviderId
  ): Promise<Extract<ServerMessage, { type: "agent_providers_result" }>> {
    const id = createRequestId("agent-set-provider");
    return this.request(id, { type: "agent_set_provider", id, providerId }, [
      "agent_providers_result",
    ]);
  }

  setAgentCredentials(
    providerId: AgentProviderId,
    apiKey: string | null
  ): Promise<Extract<ServerMessage, { type: "agent_credentials_result" }>> {
    const id = createRequestId("agent-set-credentials");
    return this.request(
      id,
      { type: "agent_set_credentials", id, providerId, apiKey },
      ["agent_credentials_result"]
    );
  }

  setAgentInstallPath(
    providerId: AgentProviderId,
    installPath: string | null
  ): Promise<Extract<ServerMessage, { type: "agent_credentials_result" }>> {
    const id = createRequestId("agent-set-install-path");
    return this.request(
      id,
      { type: "agent_set_install_path", id, providerId, installPath },
      ["agent_credentials_result"]
    );
  }

  logoutAgentProvider(
    providerId: AgentProviderId
  ): Promise<Extract<ServerMessage, { type: "agent_credentials_result" }>> {
    const id = createRequestId("agent-logout");
    return this.request(id, { type: "agent_logout", id, providerId }, [
      "agent_credentials_result",
    ]);
  }

  startAgentLogin(
    providerId: AgentProviderId
  ): Promise<Extract<ServerMessage, { type: "agent_login_result" }>> {
    const id = createRequestId("agent-login-start");
    return this.request(id, { type: "agent_login_start", id, providerId }, [
      "agent_login_result",
    ]);
  }

  cancelAgentLogin(providerId: AgentProviderId): void {
    const id = createRequestId("agent-login-cancel");
    this.send({ type: "agent_login_cancel", id, providerId });
  }

  getAgentStatus(
    sessionId?: string
  ): Promise<Extract<ServerMessage, { type: "agent_status_result" }>> {
    const id = createRequestId("agent-status");
    return this.request(id, { type: "agent_status", id, sessionId }, [
      "agent_status_result",
    ]);
  }

  retryAgent(
    sessionId: string
  ): Promise<Extract<ServerMessage, { type: "agent_ack" }>> {
    const id = createRequestId("agent-retry");
    return this.request(id, { type: "agent_retry", id, sessionId }, ["agent_ack"]);
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

  searchFiles(
    query: string,
    limit = 50
  ): Promise<Extract<ServerMessage, { type: "fs_search_result" }>> {
    const id = createRequestId("fs-search");
    return this.request(id, { type: "fs_search", id, query, limit }, [
      "fs_search_result",
    ]);
  }

  grepWorkspace(
    query: string,
    limit = 80
  ): Promise<Extract<ServerMessage, { type: "fs_grep_result" }>> {
    const id = createRequestId("fs-grep");
    return this.request(id, { type: "fs_grep", id, query, limit }, [
      "fs_grep_result",
    ]);
  }

  gitStatus(): Promise<Extract<ServerMessage, { type: "git_status_result" }>> {
    const id = createRequestId("git-status");
    return this.request(id, { type: "git_status", id }, ["git_status_result"]);
  }

  gitDiff(path?: string): Promise<Extract<ServerMessage, { type: "git_diff_result" }>> {
    const id = createRequestId("git-diff");
    return this.request(id, { type: "git_diff", id, path }, ["git_diff_result"]);
  }

  gitAdd(paths?: string[]): Promise<Extract<ServerMessage, { type: "git_add_result" }>> {
    const id = createRequestId("git-add");
    return this.request(id, { type: "git_add", id, paths }, ["git_add_result"]);
  }

  gitCommit(message: string): Promise<Extract<ServerMessage, { type: "git_commit_result" }>> {
    const id = createRequestId("git-commit");
    return this.request(id, { type: "git_commit", id, message }, [
      "git_commit_result",
    ]);
  }

  gitPull(): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-pull");
    return this.request(id, { type: "git_pull", id }, ["git_action_result"], 120_000);
  }

  gitPush(): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-push");
    return this.request(id, { type: "git_push", id }, ["git_action_result"], 120_000);
  }

  gitCheckout(
    branch: string,
    create = false
  ): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-checkout");
    return this.request(
      id,
      { type: "git_checkout", id, branch, create },
      ["git_action_result"]
    );
  }

  gitLog(limit = 10): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-log");
    return this.request(id, { type: "git_log", id, limit }, ["git_action_result"]);
  }

  gitStash(message?: string): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-stash");
    return this.request(id, { type: "git_stash", id, message }, ["git_action_result"]);
  }

  gitMerge(branch: string): Promise<Extract<ServerMessage, { type: "git_action_result" }>> {
    const id = createRequestId("git-merge");
    return this.request(id, { type: "git_merge", id, branch }, ["git_action_result"], 120_000);
  }

  runDiagnostics(): Promise<Extract<ServerMessage, { type: "diagnostics_result" }>> {
    const id = createRequestId("diagnostics");
    return this.request(id, { type: "diagnostics_run", id }, ["diagnostics_result"], 120_000);
  }

  listScripts(): Promise<Extract<ServerMessage, { type: "scripts_list_result" }>> {
    const id = createRequestId("scripts-list");
    return this.request(id, { type: "scripts_list", id }, ["scripts_list_result"]);
  }

  private emitStatus(status: "open" | "close" | "error", detail?: string): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, detail);
      } catch (err) {
        console.error("[Titus] Status listener failed", err);
      }
    }
  }

  private emitMessage(message: ServerMessage): void {
    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (err) {
        console.error("[Titus] Message listener failed", err);
      }
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

export const titusClient = new TitusClient();
