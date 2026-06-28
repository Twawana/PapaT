import * as fs from "fs";
import * as path from "path";
import { WebSocket } from "ws";
import { getWorkspaceRoot } from "./workspace-state";
import { defaultShellKind, ShellKind } from "./shell-types";

export interface ShellSession {
  cwd: string;
  shell: ShellKind;
}

const sessions = new WeakMap<WebSocket, ShellSession>();

export function getShellSession(ws: WebSocket): ShellSession {
  let session = sessions.get(ws);
  if (!session) {
    session = { cwd: getWorkspaceRoot(), shell: defaultShellKind() };
    sessions.set(ws, session);
  }
  return session;
}

export function setShellSessionKind(ws: WebSocket, shell: ShellKind): ShellKind {
  const session = getShellSession(ws);
  session.shell = shell;
  return session.shell;
}

export function clearShellSession(ws: WebSocket): void {
  sessions.delete(ws);
}

export interface CdResult {
  handled: boolean;
  output?: string;
  exitCode?: number;
}

/**
 * Handles `cd` locally so directory changes persist across shell commands.
 */
export function tryHandleCd(command: string, session: ShellSession): CdResult {
  const trimmed = command.trim();
  const cdMatch = /^cd(?:\s+(.*))?$/i.exec(trimmed);
  if (!cdMatch) {
    return { handled: false };
  }

  const arg = cdMatch[1]?.trim();
  if (!arg) {
    return { handled: true, output: session.cwd + "\n", exitCode: 0 };
  }

  let target = arg;
  if (process.platform === "win32" && /^\/d\s+/i.test(arg)) {
    target = arg.replace(/^\/d\s+/i, "").trim();
  }

  let nextCwd: string;
  if (process.platform === "win32" && /^[a-zA-Z]:\\?$/.test(target)) {
    nextCwd = target.endsWith("\\") ? target : `${target}\\`;
  } else if (path.isAbsolute(target)) {
    nextCwd = path.normalize(target);
  } else {
    nextCwd = path.normalize(path.join(session.cwd, target));
  }

  try {
    const stat = fs.statSync(nextCwd);
    if (!stat.isDirectory()) {
      return {
        handled: true,
        output: `The system cannot find the path specified.\n`,
        exitCode: 1,
      };
    }
    session.cwd = nextCwd;
    return { handled: true, output: "", exitCode: 0 };
  } catch {
    return {
      handled: true,
      output: `The system cannot find the path specified.\n`,
      exitCode: 1,
    };
  }
}
