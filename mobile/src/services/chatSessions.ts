import * as SecureStore from "expo-secure-store";
import { AgentSessionSummary } from "../types/protocol";

const SESSIONS_KEY = "papat.agent.sessions";
const ACTIVE_SESSION_KEY = "papat.agent.activeSessionId";

export function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadSavedSessions(): Promise<AgentSessionSummary[]> {
  try {
    const raw = await SecureStore.getItemAsync(SESSIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AgentSessionSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: AgentSessionSummary[]): Promise<void> {
  await SecureStore.setItemAsync(SESSIONS_KEY, JSON.stringify(sessions));
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

  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertSession(
  sessions: AgentSessionSummary[],
  session: AgentSessionSummary
): AgentSessionSummary[] {
  const next = sessions.filter((item) => item.sessionId !== session.sessionId);
  next.unshift(session);
  return next;
}

export function removeSession(
  sessions: AgentSessionSummary[],
  sessionId: string
): AgentSessionSummary[] {
  return sessions.filter((item) => item.sessionId !== sessionId);
}

export function sessionTitleFromMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "New chat";
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}
