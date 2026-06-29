import * as fs from "fs";
import * as path from "path";
import { AgentChatMessage } from "../protocol";
import { ensureDataDir, getDataDir } from "../data-dir";

export interface PersistedSession {
  sessionId: string;
  messages: AgentChatMessage[];
  cursorChatId: string | null;
  lastError?: string;
  lastRequestId?: string;
}

const SESSIONS_DIR = "agent-sessions";
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function sessionsDir(): string {
  ensureDataDir();
  const dir = path.join(getDataDir(), SESSIONS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionFilePath(sessionId: string): string {
  const safe = sessionId.replace(/[^\w-]+/g, "_");
  return path.join(sessionsDir(), `${safe}.json`);
}

export function loadPersistedSession(sessionId: string): PersistedSession | null {
  const filePath = sessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as PersistedSession;
    return { ...data, sessionId: data.sessionId || sessionId };
  } catch {
    return null;
  }
}

export function loadAllPersistedSessions(): Map<string, PersistedSession> {
  const dir = sessionsDir();
  const result = new Map<string, PersistedSession>();

  if (!fs.existsSync(dir)) {
    return result;
  }

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf8")
      ) as PersistedSession;
      const sessionId = data.sessionId || file.replace(/\.json$/, "");
      result.set(sessionId, { ...data, sessionId });
    } catch {
      // skip corrupt files
    }
  }

  return result;
}

export function persistSessionNow(sessionId: string, data: PersistedSession): void {
  fs.writeFileSync(sessionFilePath(sessionId), JSON.stringify(data, null, 2), "utf8");
}

export function schedulePersistSession(
  sessionId: string,
  data: PersistedSession
): void {
  const existing = saveTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
  }

  saveTimers.set(
    sessionId,
    setTimeout(() => {
      saveTimers.delete(sessionId);
      try {
        persistSessionNow(sessionId, data);
      } catch (err) {
        console.error(`[Titus Host] Failed to persist session ${sessionId}`, err);
      }
    }, 400)
  );
}

export function deletePersistedSession(sessionId: string): void {
  const filePath = sessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
