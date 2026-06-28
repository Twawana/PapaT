import { spawn } from "child_process";
import {
  defaultShellKind,
  resolveShellSpawn,
  shellLabel,
  ShellKind,
} from "./shell-types";
import { config } from "./config";
import { getWorkspaceRoot } from "./workspace-state";
import type { ActiveExecution } from "./executor";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ShellExecutionCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onDone: (exitCode: number | null, signal: string | null) => void;
  onError: (message: string) => void;
}

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sf]\s+[a-z]:\\/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
];

export function runShellCommand(
  command: string,
  signal?: AbortSignal,
  shell: ShellKind = defaultShellKind()
): Promise<CommandResult> {
  const trimmed = command.trim();
  if (!trimmed) {
    return Promise.reject(new Error("Command must not be empty"));
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return Promise.reject(new Error("Command is not allowed"));
    }
  }

  const cwd = getWorkspaceRoot();
  const { executable, args } = resolveShellSpawn(shell, trimmed);

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Command timed out after ${config.commandTimeoutMs}ms`));
      }
    }, config.commandTimeoutMs);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        child.kill("SIGTERM");
        reject(new Error("Command cancelled"));
      }
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > config.maxCommandOutputBytes) {
        stdout = stdout.slice(0, config.maxCommandOutputBytes) + "\n[output truncated]";
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > config.maxCommandOutputBytes) {
        stderr = stderr.slice(0, config.maxCommandOutputBytes) + "\n[output truncated]";
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

export function getDefaultShellHint(): string {
  return shellLabel("cmd");
}

export function runShellCommandStreaming(
  command: string,
  cwd: string,
  callbacks: ShellExecutionCallbacks,
  shell: ShellKind = defaultShellKind()
): ActiveExecution {
  const trimmed = command.trim();
  if (!trimmed) {
    callbacks.onError("Command must not be empty");
    return { kill: () => {} };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      callbacks.onError("Command is not allowed");
      return { kill: () => {} };
    }
  }

  const { executable, args } = resolveShellSpawn(shell, trimmed);

  const child = spawn(executable, args, {
    cwd,
    env: process.env,
    windowsHide: true,
  });

  let killed = false;
  let stdoutBytes = 0;
  let stderrBytes = 0;

  const timeout = setTimeout(() => {
    if (!killed) {
      killed = true;
      child.kill("SIGTERM");
      callbacks.onStderr(
        `\n[Command timed out after ${config.commandTimeoutMs}ms]\n`
      );
    }
  }, config.commandTimeoutMs);

  const appendChunk = (
    chunk: string,
    stream: "stdout" | "stderr",
    onChunk: (data: string) => void
  ) => {
    const max = config.maxCommandOutputBytes;
    const current = stream === "stdout" ? stdoutBytes : stderrBytes;
    if (current >= max) return;

    const allowed = max - current;
    const slice = chunk.length > allowed ? chunk.slice(0, allowed) : chunk;
    if (stream === "stdout") {
      stdoutBytes += slice.length;
    } else {
      stderrBytes += slice.length;
    }
    onChunk(slice);
    if (chunk.length > allowed) {
      onChunk("\n[output truncated]\n");
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    appendChunk(chunk.toString("utf-8"), "stdout", callbacks.onStdout);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    appendChunk(chunk.toString("utf-8"), "stderr", callbacks.onStderr);
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    callbacks.onError(err.message);
  });

  child.on("close", (exitCode, signal) => {
    clearTimeout(timeout);
    callbacks.onDone(exitCode, signal);
  });

  return {
    kill: () => {
      if (!killed) {
        killed = true;
        clearTimeout(timeout);
        child.kill("SIGTERM");
      }
    },
  };
}
