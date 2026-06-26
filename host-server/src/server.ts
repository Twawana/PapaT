import * as os from "os";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "./config";
import { executeJavaScript } from "./executor";
import {
  deletePath,
  listDirectory,
  mkdir,
  readFile,
  writeFile,
} from "./filesystem";
import {
  getBrowseRoots,
  getWorkspaceInfo,
  getWorkspaceRecent,
  listBrowseDirectory,
  openProject,
} from "./projects";
import {
  ClientMessage,
  parseClientMessage,
  serializeServerMessage,
  ServerMessage,
} from "./protocol";
import { initWorkspace, getWorkspaceRoot } from "./workspace-state";
import {
  cancelAgent,
  clearAgentSession,
  getAgentHistory,
  runAgentTurn,
} from "./agent/loop";
import {
  getVscodeStatus,
  initVscodeBridge,
  isVscodeClient,
  isVscodeConnected,
  openInVscode,
  registerVscodeClient,
  unregisterVscodeClient,
  updateVscodeClientStatus,
} from "./vscode-bridge";

const SERVER_VERSION = "0.5.0";
const SERVER_ID = randomUUID();

export function createServer(): WebSocketServer {
  initWorkspace();

  const wss = new WebSocketServer({
    host: config.host,
    port: config.port,
  });

  initVscodeBridge((message, except) => {
    for (const client of wss.clients) {
      if (client === except || isVscodeClient(client)) {
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(serializeServerMessage(message));
      }
    }
  });

  console.log(
    `[PapaT Host] Listening on ws://${config.host}:${config.port} (workspace: ${getWorkspaceRoot()})`
  );

  wss.on("connection", (ws: WebSocket) => {
    const clientId = randomUUID().slice(0, 8);
    console.log(`[PapaT Host] Client connected: ${clientId}`);

    send(ws, {
      type: "connected",
      serverId: SERVER_ID,
      version: SERVER_VERSION,
      hostname: os.hostname(),
      workspace: getWorkspaceRoot(),
      vscode: getVscodeStatus(),
    });

    ws.on("message", (data) => {
      const raw = data.toString("utf-8");
      const message = parseClientMessage(raw);

      if (!message) {
        send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      handleMessage(ws, message);
    });

    ws.on("close", () => {
      unregisterVscodeClient(ws);
      console.log(`[PapaT Host] Client disconnected: ${clientId}`);
    });

    ws.on("error", (err) => {
      console.error(`[PapaT Host] WebSocket error (${clientId}):`, err.message);
    });
  });

  return wss;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(serializeServerMessage(message));
  }
}

function handleMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case "ping":
      send(ws, { type: "pong" });
      break;

    case "execute":
      handleExecute(ws, message.id, message.code, message.language);
      break;

    case "fs_list":
      handleFsList(ws, message.id, message.path);
      break;

    case "fs_read":
      handleFsRead(ws, message.id, message.path);
      break;

    case "fs_write":
      handleFsWrite(ws, message.id, message.path, message.content, message.create);
      break;

    case "fs_delete":
      handleFsDelete(ws, message.id, message.path);
      break;

    case "fs_mkdir":
      handleFsMkdir(ws, message.id, message.path);
      break;

    case "workspace_recent":
      handleWorkspaceRecent(ws, message.id);
      break;

    case "workspace_get":
      handleWorkspaceGet(ws, message.id);
      break;

    case "browse_roots":
      handleBrowseRoots(ws, message.id);
      break;

    case "browse_list":
      handleBrowseList(ws, message.id, message.path);
      break;

    case "project_open":
      handleProjectOpen(ws, message.id, message.path, message.editor);
      break;

    case "agent_send":
      handleAgentSend(ws, message.id, message.sessionId, message.message);
      break;

    case "agent_cancel":
      handleAgentCancel(ws, message.sessionId);
      break;

    case "agent_history":
      handleAgentHistory(ws, message.id, message.sessionId);
      break;

    case "agent_clear":
      handleAgentClear(ws, message.id, message.sessionId);
      break;

    case "vscode_register":
      handleVscodeRegister(ws, message.workspaceFolders);
      break;

    case "vscode_status":
      handleVscodeStatusUpdate(message.activeFile, message.workspaceFolders);
      break;

    case "vscode_get_status":
      handleVscodeGetStatus(ws, message.id);
      break;

    case "vscode_open_file":
      handleVscodeOpenFile(ws, message.id, message.path);
      break;

    default:
      send(ws, { type: "error", message: "Unknown message type" });
  }
}

function handleExecute(
  ws: WebSocket,
  id: string,
  code: string,
  language: string
): void {
  if (!id || typeof id !== "string") {
    send(ws, { type: "error", message: "Missing execution id" });
    return;
  }

  if (!code || typeof code !== "string") {
    send(ws, { type: "error", id, message: "Code must be a non-empty string" });
    return;
  }

  if (code.length > 100_000) {
    send(ws, { type: "error", id, message: "Code exceeds 100KB limit" });
    return;
  }

  if (language !== "javascript") {
    send(ws, {
      type: "error",
      id,
      message: `Unsupported language: ${language}. MVP 1 supports javascript only.`,
    });
    return;
  }

  console.log(`[PapaT Host] Executing ${id} (${code.length} chars)`);

  executeJavaScript(code, {
    onStdout: (data) => send(ws, { type: "output", id, stream: "stdout", data }),
    onStderr: (data) => send(ws, { type: "output", id, stream: "stderr", data }),
    onError: (message) => send(ws, { type: "error", id, message }),
    onDone: (exitCode, signal) =>
      send(ws, { type: "done", id, exitCode, signal }),
  });
}

function requireRequestId(ws: WebSocket, id: unknown): id is string {
  if (!id || typeof id !== "string") {
    send(ws, { type: "error", message: "Missing request id" });
    return false;
  }
  return true;
}

function requirePath(ws: WebSocket, id: string, filePath: unknown): filePath is string {
  if (typeof filePath !== "string") {
    send(ws, { type: "error", id, message: "Path must be a string" });
    return false;
  }
  return true;
}

async function handleFsList(ws: WebSocket, id: string, filePath: string): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  try {
    const entries = await listDirectory(filePath);
    send(ws, { type: "fs_list_result", id, path: filePath || ".", entries });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to list directory",
    });
  }
}

async function handleFsRead(ws: WebSocket, id: string, filePath: string): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  try {
    const result = await readFile(filePath);
    send(ws, { type: "fs_read_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to read file",
    });
  }
}

async function handleFsWrite(
  ws: WebSocket,
  id: string,
  filePath: string,
  content: string,
  create?: boolean
): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  try {
    const result = await writeFile(filePath, content, create !== false);
    send(ws, { type: "fs_write_result", id, ...result });

    if (isVscodeConnected()) {
      openInVscode(filePath, "open_file");
    }
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to write file",
    });
  }
}

async function handleFsDelete(ws: WebSocket, id: string, filePath: string): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  try {
    const result = await deletePath(filePath);
    send(ws, { type: "fs_delete_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to delete path",
    });
  }
}

async function handleFsMkdir(ws: WebSocket, id: string, filePath: string): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  try {
    const result = await mkdir(filePath);
    send(ws, { type: "fs_mkdir_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to create directory",
    });
  }
}

function handleWorkspaceRecent(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  const { current, recent } = getWorkspaceRecent();
  send(ws, { type: "workspace_recent_result", id, current, recent });
}

function handleWorkspaceGet(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  const info = getWorkspaceInfo();
  send(ws, { type: "workspace_get_result", id, ...info });
}

function handleBrowseRoots(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  send(ws, { type: "browse_roots_result", id, roots: getBrowseRoots() });
}

async function handleBrowseList(
  ws: WebSocket,
  id: string,
  browsePath: string
): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, browsePath)) return;

  try {
    const result = await listBrowseDirectory(browsePath);
    send(ws, { type: "browse_list_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to browse folder",
    });
  }
}

async function handleProjectOpen(
  ws: WebSocket,
  id: string,
  folderPath: string,
  editor?: string
): Promise<void> {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, folderPath)) return;

  if (editor && editor !== "cursor" && editor !== "vscode") {
    send(ws, { type: "error", id, message: "Editor must be cursor or vscode" });
    return;
  }

  try {
    const result = await openProject(folderPath, editor as "cursor" | "vscode" | undefined);
    console.log(
      `[PapaT Host] Project opened: ${result.path}${editor ? ` (${editor})` : ""}`
    );
    send(ws, { type: "project_open_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to open project",
    });
  }
}

function handleAgentSend(
  ws: WebSocket,
  id: string,
  sessionId: string,
  userMessage: string
): void {
  if (!requireRequestId(ws, id)) return;

  if (!sessionId || typeof sessionId !== "string") {
    send(ws, { type: "agent_error", id, message: "Missing session id" });
    return;
  }

  if (!userMessage?.trim()) {
    send(ws, { type: "agent_error", id, sessionId, message: "Message is empty" });
    return;
  }

  if (userMessage.length > 20_000) {
    send(ws, { type: "agent_error", id, sessionId, message: "Message too long" });
    return;
  }

  console.log(`[PapaT Host] Agent message (${sessionId.slice(0, 8)}): ${userMessage.slice(0, 80)}`);

  void runAgentTurn(sessionId, userMessage.trim(), id, (message) => send(ws, message));
}

function handleAgentCancel(ws: WebSocket, sessionId: string): void {
  if (!sessionId || typeof sessionId !== "string") {
    send(ws, { type: "agent_error", message: "Missing session id" });
    return;
  }

  const cancelled = cancelAgent(sessionId);
  if (!cancelled) {
    send(ws, { type: "agent_error", sessionId, message: "No active agent run" });
  }
}

function handleAgentHistory(ws: WebSocket, id: string, sessionId: string): void {
  if (!requireRequestId(ws, id)) return;

  if (!sessionId || typeof sessionId !== "string") {
    send(ws, { type: "agent_error", id, message: "Missing session id" });
    return;
  }

  send(ws, {
    type: "agent_history_result",
    id,
    sessionId,
    messages: getAgentHistory(sessionId),
  });
}

function handleAgentClear(ws: WebSocket, id: string, sessionId: string): void {
  if (!requireRequestId(ws, id)) return;

  if (!sessionId || typeof sessionId !== "string") {
    send(ws, { type: "agent_error", id, message: "Missing session id" });
    return;
  }

  clearAgentSession(sessionId);
  send(ws, { type: "agent_history_result", id, sessionId, messages: [] });
}

function handleVscodeRegister(ws: WebSocket, workspaceFolders: string[]): void {
  if (!Array.isArray(workspaceFolders)) {
    send(ws, { type: "error", message: "workspaceFolders must be an array" });
    return;
  }

  registerVscodeClient(ws, workspaceFolders);
  send(ws, {
    type: "vscode_status",
    connected: true,
    workspaceFolders: getVscodeStatus().workspaceFolders,
    activeFile: null,
  });
}

function handleVscodeStatusUpdate(
  activeFile?: string | null,
  workspaceFolders?: string[]
): void {
  updateVscodeClientStatus(activeFile, workspaceFolders);
}

function handleVscodeGetStatus(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  const status = getVscodeStatus();
  send(ws, {
    type: "vscode_get_status_result",
    id,
    connected: status.connected,
    workspaceFolders: status.workspaceFolders,
    activeFile: status.activeFile,
  });
}

function handleVscodeOpenFile(ws: WebSocket, id: string, filePath: string): void {
  if (!requireRequestId(ws, id) || !requirePath(ws, id, filePath)) return;

  if (!isVscodeConnected()) {
    send(ws, {
      type: "vscode_open_file_result",
      id,
      ok: false,
      message: "VS Code is not connected. Install the PapaT extension and open VS Code.",
    });
    return;
  }

  const ok = openInVscode(filePath, "open_file");
  send(ws, {
    type: "vscode_open_file_result",
    id,
    ok,
    message: ok ? undefined : "Failed to send open command to VS Code",
  });
}
