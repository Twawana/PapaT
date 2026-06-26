import { spawn } from "child_process";
import * as os from "os";
import { config } from "./config";
import { getWorkspaceRoot } from "./workspace-state";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
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
  signal?: AbortSignal
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
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs =
    process.platform === "win32" ? ["/c", trimmed] : ["-c", trimmed];

  return new Promise((resolve, reject) => {
    const child = spawn(shell, shellArgs, {
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
  return process.platform === "win32" ? "cmd.exe" : os.userInfo().shell || "sh";
}
