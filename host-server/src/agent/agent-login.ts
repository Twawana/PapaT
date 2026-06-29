import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { findAgentCommand } from "./cursor-cli";
import { resolveProviderCliCommand } from "./agent-install-paths";
import { resolveWindowsSpawnTarget } from "./providers/cli-utils";
import { AgentProviderId } from "./providers/types";

const LOGIN_URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/;

export type AgentLoginCompleteHandler = (
  providerId: AgentProviderId,
  success: boolean
) => void;

interface LoginSession {
  child: ChildProcess;
  loginUrl: string;
}

interface ProviderLoginConfig {
  label: string;
  getCommand: () => string | null;
  args: string[];
  env?: NodeJS.ProcessEnv;
  useCursorSpawn?: boolean;
}

const activeLogins = new Map<AgentProviderId, LoginSession>();
let loginCompleteHandler: AgentLoginCompleteHandler | null = null;

export function setAgentLoginCompleteHandler(
  handler: AgentLoginCompleteHandler | null
): void {
  loginCompleteHandler = handler;
}

function extractLoginUrl(text: string): string | null {
  const match = text.match(LOGIN_URL_REGEX);
  return match?.[0] ?? null;
}

function providerLoginConfig(providerId: AgentProviderId): ProviderLoginConfig | null {
  switch (providerId) {
    case "cursor":
      return {
        label: "Cursor",
        getCommand: () => findAgentCommand(),
        args: ["login"],
        env: { ...process.env, NO_OPEN_BROWSER: "1" },
        useCursorSpawn: true,
      };
    case "claude":
      return {
        label: "Claude Code",
        getCommand: () => resolveProviderCliCommand("claude"),
        args: ["login"],
      };
    case "copilot":
      return {
        label: "GitHub Copilot",
        getCommand: () => resolveProviderCliCommand("copilot"),
        args: ["login"],
        env: { ...process.env, NO_OPEN_BROWSER: "1" },
      };
    case "augment":
      return {
        label: "Augment",
        getCommand: () => resolveProviderCliCommand("augment"),
        args: ["login"],
      };
    default:
      return null;
  }
}

export function supportsEmailLogin(providerId: AgentProviderId): boolean {
  return providerLoginConfig(providerId) !== null;
}

function spawnCursorLoginProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): ChildProcess {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    const scriptDir = path.dirname(command);
    const ps1 = path.join(scriptDir, "cursor-agent.ps1");
    if (fs.existsSync(ps1)) {
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      return spawn(
        path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, ...args],
        { env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
    }
  }

  return spawn(command, args, {
    env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function spawnLoginProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  useCursorSpawn: boolean
): ChildProcess {
  if (useCursorSpawn) {
    return spawnCursorLoginProcess(command, args, env);
  }

  const { executable, argsPrefix } = resolveWindowsSpawnTarget(command);
  return spawn(executable, [...argsPrefix, ...args], {
    env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForLoginUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let combined = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (err?: Error, url?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      resolve(url ?? "");
    };

    const append = (chunk: Buffer | string) => {
      combined += chunk.toString();
      const url = extractLoginUrl(combined);
      if (url) {
        finish(undefined, url);
      }
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    child.on("error", (err) => {
      finish(err instanceof Error ? err : new Error("Failed to start login"));
    });

    child.on("close", (code) => {
      if (settled) return;
      const url = extractLoginUrl(combined);
      if (url) {
        finish(undefined, url);
        return;
      }
      finish(
        new Error(
          combined.trim() ||
            `Sign-in exited before a login page was ready (code ${code ?? "unknown"})`
        )
      );
    });

    timer = setTimeout(() => {
      const url = extractLoginUrl(combined);
      if (url) {
        finish(undefined, url);
        return;
      }
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(new Error("Timed out waiting for sign-in page URL"));
    }, timeoutMs);
  });
}

export function cancelAgentProviderLogin(providerId: AgentProviderId): void {
  const session = activeLogins.get(providerId);
  if (!session) return;

  try {
    session.child.kill();
  } catch {
    // ignore
  }
  activeLogins.delete(providerId);
}

export async function startAgentProviderLogin(
  providerId: AgentProviderId
): Promise<{ loginUrl: string; label: string }> {
  const config = providerLoginConfig(providerId);
  if (!config) {
    throw new Error(`${providerId} does not support email sign-in`);
  }

  const command = config.getCommand();
  if (!command) {
    throw new Error(`${config.label} CLI is not installed on your PC`);
  }

  cancelAgentProviderLogin(providerId);

  const env = config.env ?? process.env;
  const child = spawnLoginProcess(command, config.args, env, config.useCursorSpawn ?? false);
  const loginUrl = await waitForLoginUrl(child, 60_000);

  activeLogins.set(providerId, { child, loginUrl });

  child.on("close", (code) => {
    activeLogins.delete(providerId);
    loginCompleteHandler?.(providerId, code === 0);
  });

  return { loginUrl, label: config.label };
}
