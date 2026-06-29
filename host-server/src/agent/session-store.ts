import { ChildProcess } from "child_process";
import { AgentChatMessage, AgentRunStatus, AgentSessionSummary } from "../protocol";
import {
  deletePersistedSession,
  loadAllPersistedSessions,
  loadPersistedSession,
  schedulePersistSession,
} from "./session-persistence";

interface SessionState {
  messages: AgentChatMessage[];
  abortController: AbortController | null;
  activeChild: ChildProcess | null;
  running: boolean;
  cursorChatId: string | null;
  lastError?: string;
  lastRequestId?: string;
}

const sessions = new Map<string, SessionState>();
let initialized = false;

function createSession(): SessionState {
  return {
    messages: [],
    abortController: null,
    activeChild: null,
    running: false,
    cursorChatId: null,
  };
}

function snapshotForPersist(sessionId: string, session: SessionState): {
  sessionId: string;
  messages: AgentChatMessage[];
  cursorChatId: string | null;
  lastError?: string;
  lastRequestId?: string;
} {
  return {
    sessionId,
    messages: session.messages,
    cursorChatId: session.cursorChatId,
    lastError: session.lastError,
    lastRequestId: session.lastRequestId,
  };
}

export function scheduleSessionPersist(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  schedulePersistSession(sessionId, snapshotForPersist(sessionId, session));
}

export function initSessionStore(): void {
  if (initialized) return;
  initialized = true;

  const dir = loadAllPersistedSessions();
  for (const [sessionId, data] of dir) {
    sessions.set(sessionId, {
      messages: data.messages,
      cursorChatId: data.cursorChatId,
      lastError: data.lastError,
      lastRequestId: data.lastRequestId,
      running: false,
      abortController: null,
      activeChild: null,
    });
  }
}

export function getSession(sessionId: string): SessionState {
  let session = sessions.get(sessionId);
  if (!session) {
    const persisted = loadPersistedSession(sessionId);
    if (persisted) {
      session = {
        messages: persisted.messages,
        cursorChatId: persisted.cursorChatId,
        lastError: persisted.lastError,
        lastRequestId: persisted.lastRequestId,
        running: false,
        abortController: null,
        activeChild: null,
      };
    } else {
      session = createSession();
    }
    sessions.set(sessionId, session);
  }
  return session;
}

export function getSessionHistory(sessionId: string): AgentChatMessage[] {
  return [...getSession(sessionId).messages];
}

export function clearSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session?.activeChild) {
    try {
      session.activeChild.kill();
    } catch {
      // ignore
    }
  }
  if (session?.abortController) {
    session.abortController.abort();
  }
  sessions.delete(sessionId);
  deletePersistedSession(sessionId);
}

export function setSessionChild(sessionId: string, child: ChildProcess | null): void {
  getSession(sessionId).activeChild = child;
}

export function getCursorChatId(sessionId: string): string | null {
  return sessions.get(sessionId)?.cursorChatId ?? null;
}

export function setCursorChatId(sessionId: string, chatId: string): void {
  getSession(sessionId).cursorChatId = chatId;
  scheduleSessionPersist(sessionId);
}

export function setSessionRunning(
  sessionId: string,
  running: boolean,
  abortController?: AbortController | null
): void {
  const session = getSession(sessionId);
  session.running = running;
  session.abortController = abortController ?? null;
}

export function isSessionRunning(sessionId: string): boolean {
  return sessions.get(sessionId)?.running ?? false;
}

export function setSessionLastError(
  sessionId: string,
  error: string | undefined,
  requestId?: string
): void {
  const session = getSession(sessionId);
  session.lastError = error;
  if (requestId) {
    session.lastRequestId = requestId;
  }
  scheduleSessionPersist(sessionId);
}

export function canRetrySession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session || session.running) {
    return false;
  }

  const visible = session.messages.filter((m) => m.role !== "system");
  const last = visible[visible.length - 1];
  return !!last && last.role === "user";
}

export function getSessionRunStatus(sessionId: string): AgentRunStatus {
  const session = getSession(sessionId);
  const visible = session.messages.filter((m) => m.role !== "system");
  const last = visible[visible.length - 1];

  return {
    sessionId,
    running: session.running,
    canRetry: canRetrySession(sessionId),
    lastError: session.lastError,
    lastRequestId: session.lastRequestId,
    updatedAt: last?.timestamp ?? Date.now(),
  };
}

export function listSessionRunStatuses(): AgentRunStatus[] {
  const statuses: AgentRunStatus[] = [];

  for (const sessionId of sessions.keys()) {
    const status = getSessionRunStatus(sessionId);
    if (status.running || status.canRetry || status.lastError) {
      statuses.push(status);
    }
  }

  return statuses.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listSessions(): AgentSessionSummary[] {
  const summaries: AgentSessionSummary[] = [];

  for (const [sessionId, session] of sessions) {
    const visible = session.messages.filter((m) => m.role !== "system");
    if (visible.length === 0) {
      continue;
    }

    const firstUser = visible.find((m) => m.role === "user");
    const lastMessage = visible[visible.length - 1];

    summaries.push({
      sessionId,
      title: (firstUser?.content.trim() || "Chat").slice(0, 60),
      updatedAt: lastMessage.timestamp ?? Date.now(),
      messageCount: visible.length,
      running: session.running,
    });
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function cancelSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  if (session.activeChild) {
    try {
      session.activeChild.kill();
    } catch {
      // ignore
    }
    session.activeChild = null;
  }

  if (!session.abortController) {
    return session.running;
  }

  session.abortController.abort();
  return true;
}

export function touchSessionMessages(sessionId: string): void {
  scheduleSessionPersist(sessionId);
}
