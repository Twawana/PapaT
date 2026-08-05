import * as SecureStore from "expo-secure-store";
import { AgentSessionSummary } from "../types/protocol";

const SESSIONS_KEY = "titus.agent.sessions";
const ACTIVE_SESSION_KEY = "titus.agent.activeSessionId";
const MAX_STORED_SESSIONS = 40;

export function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimSessions(sessions: AgentSessionSummary[]): AgentSessionSummary[] {
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_SESSIONS)
    .map((session) => ({
      ...session,
      title: session.title.slice(0, 60),
    }));
}

export async function loadSavedSessions(): Promise<AgentSessionSummary[]> {
  try {
    const raw = await SecureStore.getItemAsync(SESSIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AgentSessionSummary[];
    return Array.isArray(parsed) ? trimSessions(parsed) : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: AgentSessionSummary[]): Promise<void> {
  const trimmed = trimSessions(sessions);
  try {
    await SecureStore.setItemAsync(SESSIONS_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // SecureStore can reject oversized values — keep trying with fewer entries.
    console.error("[Titus] Failed to save chat sessions", err);
    try {
      await SecureStore.setItemAsync(
        SESSIONS_KEY,
        JSON.stringify(trimmed.slice(0, 15))
      );
    } catch {
      // ignore
    }
  }
}

export async function loadActiveSessionId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export async function saveActiveSessionId(sessionId: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_SESSION_KEY, sessionId);
}

export function mergeSessionLists(
  local: AgentSessionSummary[],
  remote: AgentSessionSummary[]
): AgentSessionSummary[] {
  const merged = new Map<string, AgentSessionSummary>();

  for (const session of local) {
    merged.set(session.sessionId, session);
  }

  for (const session of remote) {
    const existing = merged.get(session.sessionId);
    if (!existing || session.updatedAt >= existing.updatedAt) {
      merged.set(session.sessionId, session);
    }
  }

  return trimSessions([...merged.values()]);
}

export function upsertSession(
  sessions: AgentSessionSummary[],
  session: AgentSessionSummary
): AgentSessionSummary[] {
  const next = sessions.filter((item) => item.sessionId !== session.sessionId);
  next.unshift(session);
  return trimSessions(next);
}

export function removeSession(
  sessions: AgentSessionSummary[],
  sessionId: string
): AgentSessionSummary[] {
  return sessions.filter((item) => item.sessionId !== sessionId);
}

export function sessionTitleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "New chat";
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
