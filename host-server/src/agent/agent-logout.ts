import {
  setProviderInstallPath,
} from "./agent-install-paths";
import {
  clearProviderApiKey,
  setProviderApiKey,
} from "./agent-credentials";
import { clearCursorAuthCache, logoutCursorCli } from "./cursor-cli";
import { clearCliAuthCache } from "./providers/cli-providers";
import { AgentProviderId } from "./providers/types";

export async function setAgentProviderCredentials(
  providerId: AgentProviderId,
  apiKey: string | null
): Promise<string> {
  if (providerId !== "cursor" && providerId !== "openai") {
    throw new Error(`API keys can only be set for Cursor or OpenAI`);
  }

  setProviderApiKey(providerId, apiKey);
  clearCursorAuthCache();
  clearCliAuthCache();

  if (!apiKey?.trim()) {
    return providerId === "cursor"
      ? "Cleared Cursor API key — using PC login if available"
      : "Cleared OpenAI API key";
  }

  return providerId === "cursor"
    ? "Saved Cursor API key for this PC"
    : "Saved OpenAI API key for this PC";
}

export async function setAgentProviderInstallPath(
  providerId: AgentProviderId,
  installPath: string | null
): Promise<string> {
  const message = setProviderInstallPath(providerId, installPath);
  clearCursorAuthCache();
  clearCliAuthCache();
  return message;
}

export async function logoutAgentProvider(providerId: AgentProviderId): Promise<string> {
  if (providerId === "cursor") {
    clearProviderApiKey("cursor");
    clearCursorAuthCache();
    clearCliAuthCache();
    try {
      await logoutCursorCli();
      return "Signed out of Cursor on this PC";
    } catch {
      return "Cleared Cursor API key. Run agent logout on your PC if needed.";
    }
  }

  if (providerId === "openai") {
    clearProviderApiKey("openai");
    return "Cleared OpenAI API key";
  }

  throw new Error(`${providerId} must be signed out from the CLI on your PC`);
}
