import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getWorkspaceRoot } from "./workspace-state";
import { config } from "./config";

export interface ExecutionCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onDone: (exitCode: number | null, signal: string | null) => void;
  onError: (message: string) => void;
}

export interface ActiveExecution {
  kill: () => void;
}

export type ExecuteLanguage = "javascript" | "python" | "typescript" | "shell";

function spawnCodeExecution(
  command: string,
  args: string[],
  callbacks: ExecutionCallbacks
): ActiveExecution {
  const child = spawn(command, args, {
    cwd: getWorkspaceRoot(),
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  let killed = false;
  const timeout = setTimeout(() => {
    if (!killed) {
      killed = true;
      child.kill("SIGTERM");
      callbacks.onStderr("\n[Execution timed out]\n");
    }
  }, config.executionTimeoutMs);

  child.stdout?.on("data", (chunk: Buffer) => {
    callbacks.onStdout(chunk.toString("utf-8"));
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    callbacks.onStderr(chunk.toString("utf-8"));
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

/**
 * Executes JavaScript code on the host PC inside a temporary file.
 * Output is streamed in real time via callbacks.
 */
export function executeJavaScript(
  code: string,
  callbacks: ExecutionCallbacks
): ActiveExecution {
  const tmpDir = path.join(os.tmpdir(), "pap-at-exec");
  fs.mkdirSync(tmpDir, { recursive: true });

  const filePath = path.join(tmpDir, `exec-${Date.now()}.js`);
  fs.writeFileSync(filePath, code, "utf-8");

  return spawnCodeExecution(process.execPath, [filePath], {
    ...callbacks,
    onDone: (exitCode, signal) => {
      fs.unlink(filePath, () => {});
      callbacks.onDone(exitCode, signal);
    },
  });
}

export function executeCode(
  code: string,
  language: ExecuteLanguage,
  callbacks: ExecutionCallbacks
): ActiveExecution {
  const tmpDir = path.join(os.tmpdir(), "pap-at-exec");
  fs.mkdirSync(tmpDir, { recursive: true });
  const stamp = Date.now();

  if (language === "javascript") {
    return executeJavaScript(code, callbacks);
  }

  if (language === "python") {
    const filePath = path.join(tmpDir, `exec-${stamp}.py`);
    fs.writeFileSync(filePath, code, "utf-8");
    const py = process.platform === "win32" ? "python" : "python3";
    return spawnCodeExecution(py, [filePath], {
      ...callbacks,
      onDone: (exitCode, signal) => {
        fs.unlink(filePath, () => {});
        callbacks.onDone(exitCode, signal);
      },
    });
  }

  if (language === "typescript") {
    const filePath = path.join(tmpDir, `exec-${stamp}.ts`);
    fs.writeFileSync(filePath, code, "utf-8");
    return spawnCodeExecution("npx", ["tsx", filePath], {
      ...callbacks,
      onDone: (exitCode, signal) => {
        fs.unlink(filePath, () => {});
        callbacks.onDone(exitCode, signal);
      },
    });
  }

  if (language === "shell") {
    if (process.platform === "win32") {
      return spawnCodeExecution("cmd.exe", ["/c", code], callbacks);
    }
    return spawnCodeExecution("/bin/sh", ["-c", code], callbacks);
  }

  callbacks.onError(`Unsupported language: ${language}`);
  return { kill: () => {} };
}

export interface JavaScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function executeJavaScriptAsync(
  code: string,
  signal?: AbortSignal
): Promise<JavaScriptResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const onAbort = () => {
      active.kill();
      reject(new Error("JavaScript execution cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const active = executeJavaScript(code, {
      onStdout: (data) => {
        stdout += data;
      },
      onStderr: (data) => {
        stderr += data;
      },
      onError: (message) => {
        signal?.removeEventListener("abort", onAbort);
        reject(new Error(message));
      },
      onDone: (exitCode) => {
        signal?.removeEventListener("abort", onAbort);
        resolve({ stdout, stderr, exitCode });
      },
    });
  });
}
