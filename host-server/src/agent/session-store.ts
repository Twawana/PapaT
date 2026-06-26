import { ChildProcess } from "child_process";
import { AgentChatMessage } from "../protocol";

interface SessionState {
  messages: AgentChatMessage[];
  abortController: AbortController | null;
  activeChild: ChildProcess | null;
  running: boolean;
  cursorChatId: string | null;
}

const sessions = new Map<string, SessionState>();

function createSession(): SessionState {
  return {
    messages: [],
    abortController: null,
    activeChild: null,
    running: false,
    cursorChatId: null,
  };
}

export function getSession(sessionId: string): SessionState {
  let session = sessions.get(sessionId);
  if (!session) {
    session = createSession();
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
}

export function setSessionChild(
  sessionId: string,
  child: ChildProcess | null
): void {
  getSession(sessionId).activeChild = child;
}

export function getCursorChatId(sessionId: string): string | null {
  return sessions.get(sessionId)?.cursorChatId ?? null;
}

export function setCursorChatId(sessionId: string, chatId: string): void {
  getSession(sessionId).cursorChatId = chatId;
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
