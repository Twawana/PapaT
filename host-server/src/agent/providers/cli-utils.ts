import { spawn, ChildProcess, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { config } from "../../config";
import { CursorStreamEvent, appendStreamText } from "../cursor-cli";

export interface RunCliOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  registerChild?: (child: ChildProcess) => void;
  onStdout?: (chunk: string) => void;
}

export function findCommandOnPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === "win32") {
    for (const name of candidates.filter((item) => !item.includes(path.sep))) {
      try {
        const found = execFileSync("where.exe", [name], {
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        })
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && fs.existsSync(line));
        if (found.length) {
          return pickBestWindowsCliMatch(found);
        }
      } catch {
        // not on PATH
      }
    }
  } else {
    for (const name of candidates.filter((item) => !item.includes(path.sep))) {
      try {
        const found = execFileSync("which", [name], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (found) {
          return found;
        }
      } catch {
        // not on PATH
      }
    }
  }

  return null;
}

function pickBestWindowsCliMatch(candidates: string[]): string {
  const rank = (command: string): number => {
    if (/\.cmd$/i.test(command)) return 0;
    if (/\.exe$/i.test(command)) return 1;
    if (/\.bat$/i.test(command)) return 2;
    if (!/\.[^\\/]+$/i.test(command)) return 3;
    if (/\.ps1$/i.test(command)) return 4;
    return 5;
  };

  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
}

/** On Windows, npm/global CLIs are often extensionless shims; run the .cmd via cmd.exe. */
export function resolveWindowsSpawnTarget(command: string): {
  executable: string;
  argsPrefix: string[];
} {
  if (process.platform !== "win32") {
    return { executable: command, argsPrefix: [] };
  }

  const comspec = process.env.ComSpec || "cmd.exe";

  if (/\.(cmd|bat)$/i.test(command)) {
    return {
      executable: comspec,
      argsPrefix: ["/d", "/s", "/c", command],
    };
  }

  if (/\.ps1$/i.test(command)) {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    return {
      executable: path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      argsPrefix: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command],
    };
  }

  if (!/\.(exe|com|cmd|bat|ps1)$/i.test(command)) {
    const cmdShim = `${command}.cmd`;
    if (fs.existsSync(cmdShim)) {
      return {
        executable: comspec,
        argsPrefix: ["/d", "/s", "/c", cmdShim],
      };
    }
  }

  return { executable: command, argsPrefix: [] };
}

export function runCli(
  command: string,
  args: string[],
  options: RunCliOptions = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: { stdout: string; stderr: string; code: number | null }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    };

    let child: ChildProcess;
    try {
      const { executable, argsPrefix } = resolveWindowsSpawnTarget(command);
      child = spawn(executable, [...argsPrefix, ...args], {
        cwd: options.cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      fail(err instanceof Error ? err : new Error("Failed to start CLI"));
      return;
    }

    options.registerChild?.(child);

    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      fail(new Error(`CLI timed out after ${options.timeoutMs ?? config.agentTimeoutMs}ms`));
    }, options.timeoutMs ?? config.agentTimeoutMs);

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
        fail(new Error(`Command not found: ${command}`));
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

export function looksUnauthenticated(output: string, code: number | null): boolean {
  const lower = output.toLowerCase();
  return (
    code !== 0 ||
    lower.includes("not logged in") ||
    lower.includes("not authenticated") ||
    lower.includes("please log in") ||
    lower.includes("please login") ||
    lower.includes("run login") ||
    lower.includes("authentication required") ||
    lower.includes('"loggedin": false') ||
    lower.includes('"loggedin":false') ||
    (lower.includes("sign in") && !lower.includes('"loggedin": true'))
  );
}

export function parseClaudeAuthStatus(
  output: string,
  code: number | null = 0
): {
  authenticated: boolean;
  message: string;
} {
  const trimmed = output.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      loggedIn?: boolean;
      email?: string;
      subscriptionType?: string;
    };

    if (parsed.loggedIn === true) {
      const parts = [parsed.email, parsed.subscriptionType].filter(Boolean);
      return {
        authenticated: true,
        message: parts.length ? parts.join(" · ") : "Signed in to Claude",
      };
    }

    return {
      authenticated: false,
      message: "Not signed in — run `claude login` on your PC",
    };
  } catch {
    const authenticated = !looksUnauthenticated(trimmed, code);
    return {
      authenticated,
      message: trimmed || "Could not read Claude auth status",
    };
  }
}

export async function runStreamingTextAgent(options: {
  command: string;
  args: string[];
  workspace: string;
  signal?: AbortSignal;
  registerChild?: (child: ChildProcess) => void;
  onStreamEvent?: (event: CursorStreamEvent) => void;
}): Promise<string> {
  let streamedText = "";

  const { stdout, stderr, code } = await runCli(options.command, options.args, {
    cwd: options.workspace,
    signal: options.signal,
    timeoutMs: config.agentTimeoutMs,
    registerChild: options.registerChild,
    onStdout: (chunk) => {
      streamedText = appendStreamText(streamedText, chunk);
      options.onStreamEvent?.({ kind: "text", text: streamedText });
    },
  });

  const combined = `${stdout}\n${stderr}`.trim();

  if (code !== 0) {
    if (options.signal?.aborted) {
      throw new Error("Agent cancelled");
    }
    throw new Error(combined || `Agent exited with code ${code ?? "unknown"}`);
  }

  return (streamedText || stdout).trim();
}
