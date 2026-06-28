import { AgentAttachmentPayload, AgentChatMessage, AgentSessionSummary, ServerMessage } from "../protocol";
import { getWorkspaceRoot } from "../workspace-state";
import {
  prepareAgentUserMessage,
  saveAttachments,
  validateAttachments,
} from "./attachments";
import {
  cancelSession,
  getSession,
  getSessionHistory,
  listSessions,
} from "./session-store";
import { runActiveAgentTurn } from "./providers/registry";
import { AgentProviderRunContext } from "./providers/types";

export type AgentEmit = (message: ServerMessage) => void;

function toUiMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((m) => m.role !== "system");
}

export async function runAgentTurn(
  sessionId: string,
  userMessage: string,
  requestId: string,
  emit: AgentEmit,
  attachments?: AgentAttachmentPayload[]
): Promise<void> {
  let prepared: ReturnType<typeof prepareAgentUserMessage>;

  try {
    validateAttachments(attachments);
    const processed = saveAttachments(
      sessionId,
      getWorkspaceRoot(),
      attachments ?? []
    );
    prepared = prepareAgentUserMessage(userMessage, processed);
  } catch (err) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: err instanceof Error ? err.message : "Failed to process attachments",
    });
    return;
  }

  const ctx: AgentProviderRunContext = {
    sessionId,
    prepared,
    requestId,
    emit,
  };

  await runActiveAgentTurn(ctx);
}

export function getAgentHistory(sessionId: string): AgentChatMessage[] {
  return toUiMessages(getSessionHistory(sessionId));
}

export function listAgentSessions(): AgentSessionSummary[] {
  return listSessions();
}

export function cancelAgent(sessionId: string): boolean {
  return cancelSession(sessionId);
}

export function clearAgentSession(sessionId: string): void {
  cancelSession(sessionId);
  getSession(sessionId).messages.length = 0;
}
