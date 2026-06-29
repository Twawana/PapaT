import { spawn, ChildProcess, execFileSync } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { config } from "../config";
import { getCursorApiKey } from "./agent-credentials";
import {
  getProviderInstallPath,
  resolveCliFromUserPath,
} from "./agent-install-paths";

export interface CursorStreamEvent {
  kind: "text" | "tool_call" | "tool_result";
  text?: string;
  toolCallId?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

function agentCandidates(): string[] {
  const home = os.homedir();
  const localBin = path.join(home, ".local", "bin");

  const candidates = ["agent", "cursor-agent"];

  if (process.platform === "win32") {
    candidates.push(
      path.join(localBin, "agent.exe"),
      path.join(localBin, "agent.cmd"),
      path.join(localBin, "cursor-agent.exe"),
      path.join(localBin, "cursor-agent.cmd")
    );

    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const cursorAgentDir = path.join(localAppData, "cursor-agent");
    candidates.push(
      path.join(cursorAgentDir, "agent.cmd"),
      path.join(cursorAgentDir, "agent.exe"),
      path.join(cursorAgentDir, "cursor-agent.cmd"),
      path.join(cursorAgentDir, "cursor-agent.exe")
    );
  } else {
    candidates.push(
      path.join(localBin, "agent"),
      path.join(localBin, "cursor-agent")
    );
  }

  return candidates;
}

export function findAgentCommand(): string | null {
  const custom = getProviderInstallPath("cursor");
  if (custom) {
    const resolved = resolveCliFromUserPath(custom, [
      "agent",
      "cursor-agent",
      "agent.exe",
      "cursor-agent.exe",
      "agent.cmd",
      "cursor-agent.cmd",
    ]);
    if (resolved) {
      return resolved;
    }
  }

  for (const candidate of agentCandidates()) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === "win32") {
    for (const name of ["agent", "cursor-agent"]) {
      try {
        const found = execFileSync("where.exe", [name], {
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        })
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
        if (found && fs.existsSync(found)) {
          return found;
        }
      } catch {
        // not on PATH
      }
    }
  }

  return null;
}

export function isAgentInstalled(): boolean {
  return findAgentCommand() !== null;
}

export function resolveAgentCommand(): string {
  const command = findAgentCommand();
  if (!command) {
    throw new Error(
      "Cursor CLI not found. Install: irm 'https://cursor.com/install?win32=true' | iex"
    );
  }
  return command;
}

let streamToolSeq = 0;

function resetStreamToolIds(): void {
  streamToolSeq = 0;
}

function nextStreamToolId(): string {
  streamToolSeq += 1;
  return `tool-${streamToolSeq}-${randomUUID().slice(0, 8)}`;
}

export function appendStreamText(current: string, chunk: string): string {
  if (!chunk) return current;
  if (!current) return chunk;
  if (chunk === current) return current;
  if (chunk.length >= current.length && chunk.startsWith(current)) {
    return chunk;
  }
  return current + chunk;
}

const AUTH_CACHE_TTL_MS = 10 * 60 * 1000;

let authCache: { ok: boolean; message: string; expiresAt: number } | null = null;

export function clearCursorAuthCache(): void {
  authCache = null;
}

export async function logoutCursorCli(signal?: AbortSignal): Promise<void> {
  const command = findAgentCommand();
  if (!command) {
    return;
  }

  await runCommand(command, ["logout"], {
    signal,
    timeoutMs: 30_000,
  });
}

function cacheAuthResult(ok: boolean, message: string): void {
  if (ok) {
    authCache = {
      ok: true,
      message,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    };
    return;
  }
  authCache = null;
}

function spawnEnv(apiKey?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const key = apiKey || getCursorApiKey();
  if (key) {
    env.CURSOR_API_KEY = key;
  }
  return env;
}

interface RunCommandOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cwd?: string;
  apiKey?: string;
  onStdout?: (chunk: string) => void;
  registerChild?: (child: ChildProcess) => void;
}

interface AgentSpawnTarget {
  command: string;
  argsPrefix: string[];
}

/** Run Cursor CLI without shell so paths with spaces stay intact on Windows. */
function resolveAgentSpawnTarget(command: string): AgentSpawnTarget {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const scriptDir = path.dirname(command);
    const ps1 = path.join(scriptDir, "cursor-agent.ps1");
    if (fs.existsSync(ps1)) {
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      return {
        command: path.join(
          systemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe"
        ),
        argsPrefix: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      };
    }
  }

  return { command, argsPrefix: [] };
}

function spawnAgentProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    windowsHide?: boolean;
  }
): ChildProcess {
  const { command: executable, argsPrefix } = resolveAgentSpawnTarget(command);

  return spawn(executable, [...argsPrefix, ...args], {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    windowsHide: options.windowsHide ?? true,
  });
}

function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnAgentProcess(command, args, {
        cwd: options.cwd,
        env: spawnEnv(options.apiKey),
        windowsHide: true,
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to start Cursor CLI"));
      return;
    }

    options.registerChild?.(child);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: { stdout: string; stderr: string; code: number | null }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            try {
              child.kill();
            } catch {
              // ignore
            }
            fail(new Error(`Cursor CLI timed out after ${options.timeoutMs}ms`));
          }, options.timeoutMs)
        : undefined;

    const onAbort = () => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      fail(new Error("Agent cancelled"));
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      options.signal?.removeEventListener("abort", onAbort);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        fail(
          new Error(
            "Cursor CLI not found. Install it on your PC: irm 'https://cursor.com/install?win32=true' | iex"
          )
        );
        return;
      }
      fail(err);
    });

    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", onAbort);
      finish({ stdout, stderr, code });
    });
  });
}

export async function checkCursorAuth(
  signal?: AbortSignal,
  options?: { force?: boolean }
): Promise<{
  ok: boolean;
  message: string;
}> {
  if (
    !options?.force &&
    authCache &&
    authCache.ok &&
    Date.now() < authCache.expiresAt
  ) {
    return { ok: authCache.ok, message: authCache.message };
  }

  const command = findAgentCommand();
  if (!command) {
    return {
      ok: false,
      message:
        "Cursor CLI not installed (only needed for the Agent tab). VS Code bridge works without it.",
    };
  }

  try {
    const apiKey = getCursorApiKey();
    const { stdout, stderr, code } = await runCommand(command, ["status"], {
      signal,
      timeoutMs: 90_000,
      apiKey: apiKey || undefined,
    });

    const output = `${stdout}\n${stderr}`.trim();
    const lower = output.toLowerCase();

    if (
      code !== 0 ||
      lower.includes("not logged in") ||
      lower.includes("not authenticated")
    ) {
      const installHint =
        process.platform === "win32"
          ? "Install: irm 'https://cursor.com/install?win32=true' | iex. Then run: agent login"
          : "Install: curl https://cursor.com/install -fsS | bash. Then run: agent login";

      const message = `Cursor CLI is not authenticated. Run "agent login" on your PC. ${installHint}`;
      cacheAuthResult(false, message);
      return { ok: false, message };
    }

    const message = output || "Authenticated with Cursor";
    cacheAuthResult(true, message);
    return { ok: true, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cursor CLI unavailable";
    cacheAuthResult(false, message);
    return { ok: false, message };
  }
}

export async function createCursorChat(signal?: AbortSignal): Promise<string> {
  const command = resolveAgentCommand();
  const { stdout, stderr, code } = await runCommand(command, ["create-chat"], {
    signal,
    timeoutMs: 90_000,
  });

  if (code !== 0) {
    throw new Error(
      `Failed to create Cursor chat session: ${(stderr || stdout).trim() || "unknown error"}`
    );
  }

  const chatId = stdout.trim().split(/\s+/).pop()?.trim();
  if (!chatId) {
    throw new Error("Cursor CLI returned an empty chat id");
  }

  return chatId;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      const record = asRecord(block);
      if (!record) return "";
      if (record.type === "text" && typeof record.text === "string") {
        return record.text;
      }
      return "";
    })
    .join("");
}

export function parseCursorStreamLine(line: string): CursorStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const obj = asRecord(JSON.parse(trimmed));
    if (!obj) return null;

    const type = typeof obj.type === "string" ? obj.type : "";

    if (typeof obj.text === "string") {
      return { kind: "text", text: obj.text };
    }

    if (typeof obj.delta === "string") {
      return { kind: "text", text: obj.delta };
    }

    if (type === "text" && typeof obj.content === "string") {
      return { kind: "text", text: obj.content };
    }

    if (type === "assistant") {
      const message = asRecord(obj.message);
      const text = extractTextBlocks(message?.content);
      if (text) {
        return { kind: "text", text };
      }
    }

    if (type === "result" && typeof obj.result === "string" && obj.result.trim()) {
      return { kind: "text", text: obj.result };
    }

    if (type === "tool_call" || type === "tool_use") {
      const toolCallId =
        (typeof obj.id === "string" && obj.id) ||
        (typeof obj.call_id === "string" && obj.call_id) ||
        (typeof obj.tool_call_id === "string" && obj.tool_call_id) ||
        nextStreamToolId();
      const name =
        (typeof obj.name === "string" && obj.name) ||
        (typeof obj.tool === "string" && obj.tool) ||
        "tool";
      const args = asRecord(obj.args) || asRecord(obj.input) || {};
      return { kind: "tool_call", toolCallId, name, args };
    }

    if (type === "tool_result" || type === "tool_output") {
      const toolCallId =
        (typeof obj.tool_call_id === "string" && obj.tool_call_id) ||
        (typeof obj.call_id === "string" && obj.call_id) ||
        (typeof obj.id === "string" && obj.id) ||
        nextStreamToolId();
      const name = typeof obj.name === "string" ? obj.name : "tool";
      const result =
        typeof obj.result === "string"
          ? obj.result
          : typeof obj.output === "string"
            ? obj.output
            : JSON.stringify(obj.result ?? obj.output ?? obj);
      const isError = obj.is_error === true || obj.isError === true;
      return { kind: "tool_result", toolCallId, name, result, isError };
    }
  } catch {
    return null;
  }

  return null;
}

export interface RunCursorAgentOptions {
  prompt: string;
  workspace: string;
  chatId?: string | null;
  signal?: AbortSignal;
  registerChild?: (child: ChildProcess) => void;
  onStreamEvent?: (event: CursorStreamEvent) => void;
}

export async function runCursorAgent(
  options: RunCursorAgentOptions
): Promise<string> {
  const command = resolveAgentCommand();
  const args = [
    "--print",
    "--force",
    "--trust",
    `--workspace=${options.workspace}`,
    "--output-format",
    "stream-json",
    "--stream-partial-output",
  ];

  if (options.chatId) {
    args.push(`--resume=${options.chatId}`);
  }

  if (config.cursorModel && config.cursorModel !== "auto") {
    args.push("--model", config.cursorModel);
  }

  args.push(options.prompt);

  resetStreamToolIds();
  let buffer = "";
  let streamedText = "";

  const { stdout, stderr, code } = await runCommand(command, args, {
    signal: options.signal,
    cwd: options.workspace,
    timeoutMs: config.agentTimeoutMs,
    registerChild: options.registerChild,
    onStdout: (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseCursorStreamLine(line);
        if (!event) continue;

        if (event.kind === "text" && event.text) {
          streamedText = appendStreamText(streamedText, event.text);
        }

        options.onStreamEvent?.(event);
      }
    },
  });

  if (buffer.trim()) {
    const event = parseCursorStreamLine(buffer);
    if (event?.kind === "text" && event.text) {
      streamedText = appendStreamText(streamedText, event.text);
      options.onStreamEvent?.(event);
    }
  }

  const combined = `${stdout}\n${stderr}`.trim();

  if (code !== 0) {
    if (options.signal?.aborted) {
      throw new Error("Agent cancelled");
    }

    throw new Error(
      combined || `Cursor agent exited with code ${code ?? "unknown"}`
    );
  }

  if (streamedText.trim()) {
    return streamedText.trim();
  }

  const textResult = combined
    .split(/\r?\n/)
    .map((line) => parseCursorStreamLine(line))
    .filter((event): event is CursorStreamEvent => event?.kind === "text")
    .map((event) => event.text ?? "")
    .join("");

  return (textResult || stdout).trim();
}
