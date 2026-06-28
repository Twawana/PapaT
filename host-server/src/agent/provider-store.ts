import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { ensureDataDir, getDataDir } from "../data-dir";
import { AgentProviderId } from "./providers/types";

const PROVIDER_FILE = "agent-provider.json";

interface ProviderStoreFile {
  activeProviderId: AgentProviderId;
}

const VALID_IDS = new Set<AgentProviderId>([
  "cursor",
  "claude",
  "copilot",
  "augment",
  "openai",
]);

function storePath(): string {
  return path.join(getDataDir(), PROVIDER_FILE);
}

function defaultProviderId(): AgentProviderId {
  const fromEnv = config.llmProvider;
  if (VALID_IDS.has(fromEnv as AgentProviderId)) {
    return fromEnv as AgentProviderId;
  }
  return "cursor";
}

function readStore(): ProviderStoreFile {
  ensureDataDir();
  const filePath = storePath();

  if (!fs.existsSync(filePath)) {
    return { activeProviderId: defaultProviderId() };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ProviderStoreFile;
    if (parsed?.activeProviderId && VALID_IDS.has(parsed.activeProviderId)) {
      return parsed;
    }
  } catch {
    // fall through
  }

  return { activeProviderId: defaultProviderId() };
}

let activeProviderId = readStore().activeProviderId;

export function getActiveAgentProviderId(): AgentProviderId {
  return activeProviderId;
}

export function setActiveAgentProviderId(providerId: AgentProviderId): void {
  activeProviderId = providerId;
  ensureDataDir();
  fs.writeFileSync(
    storePath(),
    JSON.stringify({ activeProviderId: providerId } satisfies ProviderStoreFile, null, 2),
    "utf8"
  );
}
