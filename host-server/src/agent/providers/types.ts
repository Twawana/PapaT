import { PreparedAgentUserMessage } from "../attachments";
import { ServerMessage } from "../../protocol";

export type AgentEmit = (message: ServerMessage) => void;

export type AgentProviderId = "cursor" | "claude" | "copilot" | "augment" | "openai";

export interface AgentProviderStatus {
  id: AgentProviderId;
  label: string;
  description: string;
  installed: boolean;
  authenticated: boolean;
  statusMessage: string;
  isActive: boolean;
}

export interface AgentProviderRunContext {
  sessionId: string;
  prepared: PreparedAgentUserMessage;
  requestId: string;
  emit: AgentEmit;
}

export interface AgentProviderDefinition {
  id: AgentProviderId;
  label: string;
  description: string;
  probe: (options?: { force?: boolean }) => Promise<Omit<AgentProviderStatus, "isActive">>;
  runTurn: (ctx: AgentProviderRunContext) => Promise<void>;
}
