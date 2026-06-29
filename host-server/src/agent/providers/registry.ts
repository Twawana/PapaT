import { getActiveAgentProviderId, setActiveAgentProviderId } from "../provider-store";
import { clearCursorAuthCache } from "../cursor-cli";
import { clearCliAuthCache } from "./cli-providers";
import {
  augmentProvider,
  claudeProvider,
  copilotProvider,
  cursorProvider,
} from "./cli-providers";
import { openaiProvider } from "./openai-provider";
import {
  AgentProviderDefinition,
  AgentProviderId,
  AgentProviderRunContext,
  AgentProviderStatus,
} from "./types";

const PROVIDERS: AgentProviderDefinition[] = [
  cursorProvider,
  claudeProvider,
  copilotProvider,
  augmentProvider,
  openaiProvider,
];

const providerMap = new Map<AgentProviderId, AgentProviderDefinition>(
  PROVIDERS.map((provider) => [provider.id, provider])
);

export function listAgentProviderDefinitions(): AgentProviderDefinition[] {
  return PROVIDERS;
}

export function getAgentProvider(id: AgentProviderId): AgentProviderDefinition | undefined {
  return providerMap.get(id);
}

export async function probeAgentProviders(options?: {
  force?: boolean;
}): Promise<AgentProviderStatus[]> {
  const activeId = getActiveAgentProviderId();
  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const status = await provider.probe(options);
      return {
        ...status,
        isActive: provider.id === activeId,
      };
    })
  );
  return results;
}

export async function runActiveAgentTurn(ctx: AgentProviderRunContext): Promise<void> {
  const provider = getAgentProvider(getActiveAgentProviderId());
  if (!provider) {
    ctx.emit({
      type: "agent_error",
      id: ctx.requestId,
      sessionId: ctx.sessionId,
      message: "No agent provider selected",
    });
    return;
  }

  const status = await provider.probe();
  if (!status.installed) {
    ctx.emit({
      type: "agent_error",
      id: ctx.requestId,
      sessionId: ctx.sessionId,
      message: `${provider.label} is not installed on your PC`,
    });
    return;
  }

  if (!status.authenticated) {
    ctx.emit({
      type: "agent_error",
      id: ctx.requestId,
      sessionId: ctx.sessionId,
      message: status.statusMessage || `${provider.label} is not signed in on your PC`,
    });
    return;
  }

  await provider.runTurn(ctx);
}

export async function selectAgentProvider(providerId: AgentProviderId): Promise<{
  providers: AgentProviderStatus[];
  activeProviderId: AgentProviderId;
} | null> {
  if (!providerMap.has(providerId)) {
    return null;
  }
  setActiveAgentProviderId(providerId);
  const providers = await probeAgentProviders();
  return { providers, activeProviderId: providerId };
}

export async function refreshAgentProviders(options?: {
  force?: boolean;
}): Promise<{
  providers: AgentProviderStatus[];
  activeProviderId: AgentProviderId;
}> {
  clearCursorAuthCache();
  clearCliAuthCache();
  return {
    providers: await probeAgentProviders(options),
    activeProviderId: getActiveAgentProviderId(),
  };
}

export { getActiveAgentProviderId, setActiveAgentProviderId };
