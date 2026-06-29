import { AgentAttachmentPayload, AgentChatMessage, AgentRunStatus, AgentSessionSummary, ServerMessage } from "../protocol";
import { getWorkspaceRoot } from "../workspace-state";
import {
  prepareAgentUserMessage,
  preparedFromStoredUserMessage,
  saveAttachments,
  validateAttachments,
} from "./attachments";
import {
  cancelSession,
  canRetrySession,
  getSession,
  getSessionHistory,
  getSessionRunStatus,
  initSessionStore,
  listSessionRunStatuses,
  listSessions,
  setSessionLastError,
  touchSessionMessages,
} from "./session-store";
import { runActiveAgentTurn } from "./providers/registry";
import { AgentProviderRunContext } from "./providers/types";

export type AgentEmit = (message: ServerMessage) => void;

function toUiMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((m) => m.role !== "system");
}

function wrapEmit(sessionId: string, requestId: string, emit: AgentEmit): AgentEmit {
  return (message) => {
    if (message.type === "agent_error" && message.sessionId === sessionId) {
      setSessionLastError(sessionId, message.message, message.id ?? requestId);
    }
    if (message.type === "agent_done" && message.sessionId === sessionId) {
      setSessionLastError(sessionId, undefined, requestId);
    }
    emit(message);
  };
}

export function bootstrapAgentSessions(): void {
  initSessionStore();
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
    emit: wrapEmit(sessionId, requestId, emit),
  };

  await runActiveAgentTurn(ctx);
}

export async function retryAgentTurn(
  sessionId: string,
  requestId: string,
  emit: AgentEmit
): Promise<void> {
  if (getSession(sessionId).running) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "Agent is already running for this session",
    });
    return;
  }

  if (!canRetrySession(sessionId)) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "Nothing to retry for this session",
    });
    return;
  }

  const visible = getSessionHistory(sessionId).filter((m) => m.role !== "system");
  const lastUser = [...visible].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "No user message found to retry",
    });
    return;
  }

  const prepared = preparedFromStoredUserMessage(lastUser);
  const ctx: AgentProviderRunContext = {
    sessionId,
    prepared,
    requestId,
    emit: wrapEmit(sessionId, requestId, emit),
    skipUserMessage: true,
  };

  setSessionLastError(sessionId, undefined, requestId);
  await runActiveAgentTurn(ctx);
}

export function getAgentHistory(sessionId: string): AgentChatMessage[] {
  return toUiMessages(getSessionHistory(sessionId));
}

export function listAgentSessions(): AgentSessionSummary[] {
  return listSessions();
}

export function getAgentStatus(sessionId?: string): AgentRunStatus[] {
  if (sessionId) {
    getSession(sessionId);
    return [getSessionRunStatus(sessionId)];
  }
  return listSessionRunStatuses();
}

export function cancelAgent(sessionId: string): boolean {
  return cancelSession(sessionId);
}

export function clearAgentSession(sessionId: string): void {
  cancelSession(sessionId);
  getSession(sessionId).messages.length = 0;
  touchSessionMessages(sessionId);
}
