import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { ensureDataDir, getDataDir } from "../data-dir";
import { AgentProviderId } from "./providers/types";

const CREDENTIALS_FILE = "agent-credentials.json";

interface CredentialsFile {
  cursorApiKey?: string;
  openaiApiKey?: string;
}

function storePath(): string {
  return path.join(getDataDir(), CREDENTIALS_FILE);
}

function readFile(): CredentialsFile {
  ensureDataDir();
  const filePath = storePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CredentialsFile;
  } catch {
    return {};
  }
}

function writeFile(data: CredentialsFile): void {
  ensureDataDir();
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), "utf8");
}

export function getCursorApiKey(): string {
  const stored = readFile().cursorApiKey?.trim();
  if (stored) return stored;
  return config.cursorApiKey.trim();
}

export function getOpenAiApiKey(): string {
  const stored = readFile().openaiApiKey?.trim();
  if (stored) return stored;
  return config.llmApiKey.trim();
}

export function setProviderApiKey(providerId: AgentProviderId, apiKey: string | null): void {
  const data = readFile();
  const trimmed = apiKey?.trim() ?? "";

  if (providerId === "cursor") {
    if (trimmed) {
      data.cursorApiKey = trimmed;
    } else {
      delete data.cursorApiKey;
    }
  } else if (providerId === "openai") {
    if (trimmed) {
      data.openaiApiKey = trimmed;
    } else {
      delete data.openaiApiKey;
    }
  } else {
    throw new Error(`API key configuration is not supported for ${providerId}`);
  }

  writeFile(data);
}

export function clearProviderApiKey(providerId: AgentProviderId): void {
  setProviderApiKey(providerId, null);
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function credentialHint(providerId: AgentProviderId): string | null {
  if (providerId === "cursor") {
    const key = readFile().cursorApiKey?.trim();
    return key ? `API key ${maskApiKey(key)}` : null;
  }
  if (providerId === "openai") {
    const key = readFile().openaiApiKey?.trim();
    return key ? `API key ${maskApiKey(key)}` : null;
  }
  return null;
}
