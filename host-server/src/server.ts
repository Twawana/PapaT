import * as os from "os";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { config } from "./config";
import {
  authenticateToken,
  initAuth,
  isAuthRequired,
  pairWithCode,
} from "./auth";
import {
  clearClientAuth,
  isClientAuthenticated,
  isLocalConnection,
  markClientAuthenticated,
} from "./client-auth";
import { executeCode, type ActiveExecution, type ExecuteLanguage } from "./executor";
import { runShellCommandStreaming } from "./command-executor";
import {
  clearShellSession,
  getShellSession,
  setShellSessionKind,
  tryHandleCd,
} from "./shell-session";
import { availableShells, defaultShellKind, isShellKind } from "./shell-types";
import {
  deletePath,
  listDirectory,
  mkdir,
  movePath,
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
import { runDiagnostics } from "./diagnostics";
import {
  gitAdd,
  gitCheckout,
  gitCommit,
  gitDiff,
  gitLog,
  gitMerge,
  gitPull,
  gitPush,
  gitStash,
  gitStatus,
} from "./git";
import { listPackageScripts } from "./scripts";
import { grepWorkspace, searchFiles } from "./search";
import { initWorkspace, getWorkspaceRoot } from "./workspace-state";
import { resolveFsPath, toClientPath } from "./path-utils";
import {
  cancelAgent,
  clearAgentSession,
  getAgentHistory,
  listAgentSessions,
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

const SERVER_VERSION = "0.6.0";
const SERVER_ID = randomUUID();

const UNAUTHENTICATED_TYPES = new Set(["ping", "auth", "pair"]);
const activeShellRuns = new WeakMap<WebSocket, Map<string, ActiveExecution>>();

function buildConnectedMessage(deviceName?: string): Extract<
  import("./protocol").ServerMessage,
  { type: "connected" }
> {
  return {
    type: "connected",
    serverId: SERVER_ID,
    version: SERVER_VERSION,
    hostname: os.hostname(),
    workspace: getWorkspaceRoot(),
    authenticated: true,
    deviceName,
    vscode: getVscodeStatus(),
    shellOptions: availableShells(),
    defaultShell: defaultShellKind(),
  };
}

function buildAuthOkMessage(
  deviceId: string,
  deviceName: string,
  token?: string
): Extract<import("./protocol").ServerMessage, { type: "auth_ok" }> {
  return {
    type: "auth_ok",
    serverId: SERVER_ID,
    version: SERVER_VERSION,
    hostname: os.hostname(),
    workspace: getWorkspaceRoot(),
    deviceId,
    deviceName,
    token,
    vscode: getVscodeStatus(),
    shellOptions: availableShells(),
    defaultShell: defaultShellKind(),
  };
}

export function createServer(): WebSocketServer {
  initWorkspace();
  initAuth();

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
    `[Titus Host] Listening on ws://${config.host}:${config.port} (workspace: ${getWorkspaceRoot()})`
  );

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientId = randomUUID().slice(0, 8);
    console.log(`[Titus Host] Client connected: ${clientId}`);

    if (isAuthRequired()) {
      send(ws, {
        type: "auth_required",
        serverId: SERVER_ID,
        version: SERVER_VERSION,
        hostname: os.hostname(),
      });
    } else {
      markClientAuthenticated(ws, {
        deviceId: clientId,
        deviceName: "Guest",
      });
      send(ws, buildConnectedMessage("Guest"));
    }

    ws.on("message", (data) => {
      const raw = data.toString("utf-8");
      const message = parseClientMessage(raw);

      if (!message) {
        send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      handleMessage(ws, message, req);
    });

    ws.on("close", () => {
      cancelAllShellRuns(ws);
      clearShellSession(ws);
      unregisterVscodeClient(ws);
      clearClientAuth(ws);
      console.log(`[Titus Host] Client disconnected: ${clientId}`);
    });

    ws.on("error", (err) => {
      console.error(`[Titus Host] WebSocket error (${clientId}):`, err.message);
    });
  });

  return wss;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(serializeServerMessage(message));
  }
}

function handleMessage(
  ws: WebSocket,
  message: ClientMessage,
  req?: IncomingMessage
): void {
  if (
    isAuthRequired() &&
    !isClientAuthenticated(ws) &&
    !UNAUTHENTICATED_TYPES.has(message.type)
  ) {
    if (message.type === "vscode_register" && isLocalConnection(req)) {
      markClientAuthenticated(ws, {
        deviceId: "vscode-local",
        deviceName: "VS Code",
        isVscode: true,
      });
    } else {
      send(ws, { type: "auth_error", message: "Authentication required" });
      return;
    }
  }

  switch (message.type) {
    case "auth":
      handleAuth(ws, message.token);
      break;

    case "pair":
      handlePair(ws, message.code, message.deviceName);
      break;

    case "ping":
      send(ws, { type: "pong" });
      break;

    case "execute":
      handleExecute(ws, message.id, message.code, message.language);
      break;

    case "shell_run":
      handleShellRun(ws, message.id, message.command, message.shell);
      break;

    case "shell_cancel":
      handleShellCancel(ws, message.id);
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

    case "fs_move":
      handleFsMove(ws, message.id, message.from, message.to);
      break;

    case "fs_search":
      handleFsSearch(ws, message.id, message.query, message.limit);
      break;

    case "fs_grep":
      handleFsGrep(ws, message.id, message.query, message.limit);
      break;

    case "git_status":
      handleGitStatus(ws, message.id);
      break;

    case "git_diff":
      handleGitDiff(ws, message.id, message.path);
      break;

    case "git_add":
      handleGitAdd(ws, message.id, message.paths);
      break;

    case "git_commit":
      handleGitCommit(ws, message.id, message.message);
      break;

    case "git_pull":
      handleGitPull(ws, message.id);
      break;

    case "git_push":
      handleGitPush(ws, message.id);
      break;

    case "git_checkout":
      handleGitCheckout(ws, message.id, message.branch, message.create);
      break;

    case "git_log":
      handleGitLog(ws, message.id, message.limit);
      break;

    case "git_stash":
      handleGitStash(ws, message.id, message.message);
      break;

    case "git_merge":
      handleGitMerge(ws, message.id, message.branch);
      break;

    case "diagnostics_run":
      handleDiagnosticsRun(ws, message.id);
      break;

    case "scripts_list":
      handleScriptsList(ws, message.id);
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

    case "agent_sessions":
      handleAgentSessions(ws, message.id);
      break;

    case "vscode_register":
      handleVscodeRegister(ws, message.workspaceFolders, req);
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

  const allowed: ExecuteLanguage[] = ["javascript", "python", "typescript", "shell"];
  if (!allowed.includes(language as ExecuteLanguage)) {
    send(ws, {
      type: "error",
      id,
      message: `Unsupported language: ${language}. Supported: ${allowed.join(", ")}`,
    });
    return;
  }

  console.log(`[Titus Host] Executing ${id} (${language}, ${code.length} chars)`);

  executeCode(code, language as ExecuteLanguage, {
    onStdout: (data) => send(ws, { type: "output", id, stream: "stdout", data }),
    onStderr: (data) => send(ws, { type: "output", id, stream: "stderr", data }),
    onError: (message) => send(ws, { type: "error", id, message }),
    onDone: (exitCode, signal) =>
      send(ws, { type: "done", id, exitCode, signal }),
  });
}

function getShellRunMap(ws: WebSocket): Map<string, ActiveExecution> {
  let map = activeShellRuns.get(ws);
  if (!map) {
    map = new Map();
    activeShellRuns.set(ws, map);
  }
  return map;
}

function cancelAllShellRuns(ws: WebSocket): void {
  const map = activeShellRuns.get(ws);
  if (!map) return;
  for (const active of map.values()) {
    active.kill();
  }
  map.clear();
}

function handleShellRun(
  ws: WebSocket,
  id: string,
  command: string,
  shellArg?: string
): void {
  if (!id || typeof id !== "string") {
    send(ws, { type: "error", message: "Missing shell run id" });
    return;
  }

  if (!command || typeof command !== "string") {
    send(ws, { type: "error", id, message: "Command must be a non-empty string" });
    return;
  }

  if (command.length > 8_000) {
    send(ws, { type: "error", id, message: "Command exceeds 8KB limit" });
    return;
  }

  const session = getShellSession(ws);
  if (shellArg && isShellKind(shellArg)) {
    setShellSessionKind(ws, shellArg);
  }

  const cdResult = tryHandleCd(command, session);

  if (cdResult.handled) {
    if (cdResult.output) {
      send(ws, {
        type: "output",
        id,
        stream: "stdout",
        data: cdResult.output,
      });
    }
    send(ws, {
      type: "done",
      id,
      exitCode: cdResult.exitCode ?? 0,
      signal: null,
      cwd: session.cwd,
      shell: session.shell,
    });
    return;
  }

  console.log(`[Titus Host] Shell ${id} (${session.shell}): ${command.trim().slice(0, 80)}`);

  const active = runShellCommandStreaming(command, session.cwd, {
    onStdout: (data) => send(ws, { type: "output", id, stream: "stdout", data }),
    onStderr: (data) => send(ws, { type: "output", id, stream: "stderr", data }),
    onError: (message) => send(ws, { type: "error", id, message }),
    onDone: (exitCode, signal) => {
      getShellRunMap(ws).delete(id);
      send(ws, { type: "done", id, exitCode, signal, cwd: session.cwd, shell: session.shell });
    },
  }, session.shell);

  getShellRunMap(ws).set(id, active);
}

function handleShellCancel(ws: WebSocket, id: string): void {
  if (!id || typeof id !== "string") {
    send(ws, { type: "error", message: "Missing shell cancel id" });
    return;
  }

  const active = getShellRunMap(ws).get(id);
  if (!active) {
    send(ws, { type: "error", id, message: "No active shell command for this id" });
    return;
  }

  active.kill();
  getShellRunMap(ws).delete(id);
  const session = getShellSession(ws);
  send(ws, {
    type: "done",
    id,
    exitCode: null,
    signal: "SIGTERM",
    cwd: session.cwd,
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
    const canonicalPath = toClientPath(resolveFsPath(filePath));
    send(ws, { type: "fs_list_result", id, path: canonicalPath, entries });
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

async function handleFsMove(
  ws: WebSocket,
  id: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  if (!requireRequestId(ws, id)) return;
  if (!requirePath(ws, id, fromPath) || !requirePath(ws, id, toPath)) return;

  try {
    const result = await movePath(fromPath, toPath);
    send(ws, { type: "fs_move_result", id, ...result });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to move path",
    });
  }
}

function handleFsSearch(
  ws: WebSocket,
  id: string,
  query: unknown,
  limit?: number
): void {
  if (!requireRequestId(ws, id)) return;
  if (typeof query !== "string") {
    send(ws, { type: "error", id, message: "Query must be a string" });
    return;
  }

  try {
    const hits = searchFiles(query, typeof limit === "number" ? limit : 50);
    send(ws, { type: "fs_search_result", id, hits });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Search failed",
    });
  }
}

function handleFsGrep(
  ws: WebSocket,
  id: string,
  query: unknown,
  limit?: number
): void {
  if (!requireRequestId(ws, id)) return;
  if (typeof query !== "string") {
    send(ws, { type: "error", id, message: "Query must be a string" });
    return;
  }

  try {
    const hits = grepWorkspace(query, typeof limit === "number" ? limit : 80);
    send(ws, { type: "fs_grep_result", id, hits });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Grep failed",
    });
  }
}

function handleGitStatus(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  try {
    const status = gitStatus();
    send(ws, { type: "git_status_result", id, status });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git status failed",
    });
  }
}

function handleGitDiff(ws: WebSocket, id: string, pathArg?: string): void {
  if (!requireRequestId(ws, id)) return;

  try {
    const diff = gitDiff(pathArg);
    send(ws, { type: "git_diff_result", id, diff });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git diff failed",
    });
  }
}

function handleGitAdd(ws: WebSocket, id: string, paths?: string[]): void {
  if (!requireRequestId(ws, id)) return;

  try {
    gitAdd(paths ?? []);
    send(ws, { type: "git_add_result", id, ok: true });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git add failed",
    });
  }
}

function handleGitCommit(ws: WebSocket, id: string, message: unknown): void {
  if (!requireRequestId(ws, id)) return;
  if (typeof message !== "string") {
    send(ws, { type: "error", id, message: "Commit message must be a string" });
    return;
  }

  try {
    const output = gitCommit(message);
    send(ws, { type: "git_commit_result", id, output });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git commit failed",
    });
  }
}

function handleGitPull(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;
  try {
    send(ws, { type: "git_action_result", id, output: gitPull() });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git pull failed",
    });
  }
}

function handleGitPush(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;
  try {
    send(ws, { type: "git_action_result", id, output: gitPush() });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git push failed",
    });
  }
}

function handleGitCheckout(
  ws: WebSocket,
  id: string,
  branch: unknown,
  create?: boolean
): void {
  if (!requireRequestId(ws, id)) return;
  if (typeof branch !== "string") {
    send(ws, { type: "error", id, message: "Branch name must be a string" });
    return;
  }

  try {
    send(ws, { type: "git_action_result", id, output: gitCheckout(branch, create === true) });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git checkout failed",
    });
  }
}

function handleGitLog(ws: WebSocket, id: string, limit?: number): void {
  if (!requireRequestId(ws, id)) return;

  try {
    send(ws, {
      type: "git_action_result",
      id,
      output: gitLog(typeof limit === "number" ? limit : 10),
    });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git log failed",
    });
  }
}

function handleGitStash(ws: WebSocket, id: string, message?: string): void {
  if (!requireRequestId(ws, id)) return;

  try {
    send(ws, { type: "git_action_result", id, output: gitStash(message) });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git stash failed",
    });
  }
}

function handleGitMerge(ws: WebSocket, id: string, branch: unknown): void {
  if (!requireRequestId(ws, id)) return;
  if (typeof branch !== "string") {
    send(ws, { type: "error", id, message: "Branch name must be a string" });
    return;
  }

  try {
    send(ws, { type: "git_action_result", id, output: gitMerge(branch) });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Git merge failed",
    });
  }
}

function handleDiagnosticsRun(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  try {
    const items = runDiagnostics();
    send(ws, { type: "diagnostics_result", id, items });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Diagnostics failed",
    });
  }
}

function handleScriptsList(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  try {
    const scripts = listPackageScripts();
    send(ws, { type: "scripts_list_result", id, scripts });
  } catch (err) {
    send(ws, {
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Failed to list scripts",
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
      `[Titus Host] Project opened: ${result.path}${editor ? ` (${editor})` : ""}`
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

  console.log(`[Titus Host] Agent message (${sessionId.slice(0, 8)}): ${userMessage.slice(0, 80)}`);

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

function handleAgentSessions(ws: WebSocket, id: string): void {
  if (!requireRequestId(ws, id)) return;

  send(ws, {
    type: "agent_sessions_result",
    id,
    sessions: listAgentSessions(),
  });
}

function handleAuth(ws: WebSocket, token: string): void {
  if (!token || typeof token !== "string") {
    send(ws, { type: "auth_error", message: "Missing token" });
    return;
  }

  const result = authenticateToken(token);
  if (!result) {
    send(ws, { type: "auth_error", message: "Invalid or revoked token" });
    return;
  }

  markClientAuthenticated(ws, {
    deviceId: result.deviceId,
    deviceName: result.deviceName,
  });

  console.log(`[Titus Host] Authenticated: ${result.deviceName}`);
  send(ws, buildAuthOkMessage(result.deviceId, result.deviceName));
}

function handlePair(ws: WebSocket, code: string, deviceName?: string): void {
  if (!code || typeof code !== "string") {
    send(ws, { type: "auth_error", message: "Missing pairing code" });
    return;
  }

  try {
    const result = pairWithCode(code, deviceName);
    markClientAuthenticated(ws, {
      deviceId: result.deviceId,
      deviceName: result.deviceName,
    });

    console.log(`[Titus Host] Paired new device: ${result.deviceName}`);
    send(
      ws,
      buildAuthOkMessage(
        result.deviceId,
        result.deviceName,
        result.token
      )
    );
  } catch (err) {
    send(ws, {
      type: "auth_error",
      message: err instanceof Error ? err.message : "Pairing failed",
    });
  }
}

function handleVscodeRegister(
  ws: WebSocket,
  workspaceFolders: string[],
  req?: IncomingMessage
): void {
  if (!Array.isArray(workspaceFolders)) {
    send(ws, { type: "error", message: "workspaceFolders must be an array" });
    return;
  }

  if (isAuthRequired() && !isClientAuthenticated(ws)) {
    if (isLocalConnection(req)) {
      markClientAuthenticated(ws, {
        deviceId: "vscode-local",
        deviceName: "VS Code",
        isVscode: true,
      });
    } else {
      send(ws, { type: "auth_error", message: "Authentication required" });
      return;
    }
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
      message: "VS Code is not connected. Install the Titus extension and open VS Code.",
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
