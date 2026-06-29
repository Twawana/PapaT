import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findCommandOnPath } from "./providers/cli-utils";
import { AgentProviderId } from "./providers/types";
import { ensureDataDir, getDataDir } from "../data-dir";

const INSTALL_PATHS_FILE = "agent-install-paths.json";

interface InstallPathsFile {
  paths?: Partial<Record<AgentProviderId, string>>;
}

const PROVIDER_CLI_NAMES: Record<AgentProviderId, string[]> = {
  cursor: [
    "agent",
    "cursor-agent",
    "agent.exe",
    "cursor-agent.exe",
    "agent.cmd",
    "cursor-agent.cmd",
  ],
  claude: ["claude", "claude.exe"],
  copilot: ["copilot", "copilot.exe"],
  augment: ["auggie", "auggie.exe"],
  openai: [],
};

const CLI_INSTALL_PROVIDERS = new Set<AgentProviderId>([
  "cursor",
  "claude",
  "copilot",
  "augment",
]);

function storePath(): string {
  return path.join(getDataDir(), INSTALL_PATHS_FILE);
}

function readFile(): InstallPathsFile {
  ensureDataDir();
  const filePath = storePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as InstallPathsFile;
  } catch {
    return {};
  }
}

function writeFile(data: InstallPathsFile): void {
  ensureDataDir();
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), "utf8");
}

export function supportsInstallPath(providerId: AgentProviderId): boolean {
  return CLI_INSTALL_PROVIDERS.has(providerId);
}

export function getProviderInstallPath(providerId: AgentProviderId): string | null {
  const stored = readFile().paths?.[providerId]?.trim();
  return stored || null;
}

export function resolveCliFromUserPath(
  userPath: string,
  commandNames: string[]
): string | null {
  const trimmed = userPath.trim();
  if (!trimmed || !fs.existsSync(trimmed)) {
    return null;
  }

  const stat = fs.statSync(trimmed);
  if (stat.isFile()) {
    return trimmed;
  }

  if (stat.isDirectory()) {
    for (const name of commandNames) {
      const candidate = path.join(trimmed, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function builtInCliCandidates(names: string[]): string[] {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const dirs = [
      path.join(home, ".local", "bin"),
      path.join(home, "AppData", "Roaming", "npm"),
      path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "cursor-agent"),
    ];

    for (const dir of dirs) {
      for (const name of names) {
        if (/\.(exe|cmd|bat)$/i.test(name)) {
          candidates.push(path.join(dir, name));
          continue;
        }
        // Prefer .cmd shims on Windows before extensionless npm scripts.
        candidates.push(path.join(dir, `${name}.cmd`));
        candidates.push(path.join(dir, `${name}.exe`));
        candidates.push(path.join(dir, name));
      }
    }
  } else {
    const localBin = path.join(home, ".local", "bin");
    for (const name of names) {
      candidates.push(path.join(localBin, name));
    }
  }

  return candidates;
}

export function resolveProviderCliCommand(providerId: AgentProviderId): string | null {
  const names = PROVIDER_CLI_NAMES[providerId];
  if (!names.length) {
    return null;
  }

  const custom = getProviderInstallPath(providerId);
  if (custom) {
    const resolved = resolveCliFromUserPath(custom, names);
    if (resolved) {
      return normalizeWindowsCliCommand(resolved);
    }
  }

  for (const candidate of builtInCliCandidates(names)) {
    if (fs.existsSync(candidate)) {
      return normalizeWindowsCliCommand(candidate);
    }
  }

  const fromPath = findCommandOnPath(names);
  return fromPath ? normalizeWindowsCliCommand(fromPath) : null;
}

function normalizeWindowsCliCommand(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }
  if (/\.(exe|cmd|bat|com)$/i.test(command)) {
    return command;
  }

  const dir = path.dirname(command);
  const base = path.basename(command, path.extname(command));
  const cmdShim = path.join(dir, `${base}.cmd`);
  if (fs.existsSync(cmdShim)) {
    return cmdShim;
  }

  if (!path.extname(command)) {
    const siblingCmd = `${command}.cmd`;
    if (fs.existsSync(siblingCmd)) {
      return siblingCmd;
    }
  }

  return command;
}

export function setProviderInstallPath(
  providerId: AgentProviderId,
  installPath: string | null
): string {
  if (!supportsInstallPath(providerId)) {
    throw new Error(`${providerId} does not use a CLI install path`);
  }

  const data = readFile();
  const paths = { ...(data.paths ?? {}) };
  const trimmed = installPath?.trim() ?? "";

  if (!trimmed) {
    delete paths[providerId];
  } else {
    if (!fs.existsSync(trimmed)) {
      throw new Error("Path does not exist on your PC");
    }
    paths[providerId] = trimmed;
  }

  data.paths = paths;
  writeFile(data);

  if (!trimmed) {
    return "Cleared custom install path — using auto-detect";
  }

  const resolved = resolveProviderCliCommand(providerId);
  if (resolved) {
    return `Using CLI at ${resolved}`;
  }

  return `Saved install path. Could not find the CLI binary at "${trimmed}" yet.`;
}

export function installPathStatusSuffix(providerId: AgentProviderId): string | null {
  const stored = getProviderInstallPath(providerId);
  if (!stored) {
    return null;
  }

  const resolved = resolveProviderCliCommand(providerId);
  if (resolved) {
    return ` · CLI: ${resolved}`;
  }

  return ` · Path: ${stored} (CLI not found)`;
}
