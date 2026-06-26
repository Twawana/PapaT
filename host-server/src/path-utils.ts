import * as fs from "fs";
import * as path from "path";
import { getWorkspaceRoot, setWorkspaceRoot } from "./workspace-state";

/** Resolve a client-relative path to an absolute path inside the workspace. */
export function resolveSafePath(relativePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const trimmed = (relativePath || ".").trim().replace(/\\/g, "/");
  if (trimmed.includes("\0")) {
    throw new Error("Invalid path");
  }

  const normalized = path.normalize(trimmed);
  if (path.isAbsolute(normalized)) {
    throw new Error("Absolute paths are not allowed");
  }

  const resolved = path.resolve(workspaceRoot, normalized);

  if (
    resolved !== workspaceRoot &&
    !resolved.startsWith(workspaceRoot + path.sep)
  ) {
    throw new Error("Path escapes workspace");
  }

  return resolved;
}

/** Convert absolute path back to a workspace-relative path for clients. */
export function toRelativePath(absolutePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const relative = path.relative(workspaceRoot, absolutePath);
  return relative === "" ? "." : relative.replace(/\\/g, "/");
}

/** Follow symlinks only if the final target stays inside the workspace. */
export async function assertInsideWorkspace(absolutePath: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  const realPath = await fs.promises.realpath(absolutePath).catch(() => absolutePath);
  if (
    realPath !== workspaceRoot &&
    !realPath.startsWith(workspaceRoot + path.sep)
  ) {
    throw new Error("Path escapes workspace");
  }
}
