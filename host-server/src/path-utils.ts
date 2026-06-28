import * as fs from "fs";
import * as path from "path";
import { isAllowedBrowsePath } from "./browse";
import { getWorkspaceRoot } from "./workspace-state";

/** True if the client path is an absolute PC path (e.g. C:/Users/...). */
export function isAbsoluteClientPath(clientPath: string): boolean {
  const trimmed = clientPath.trim().replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(trimmed) || trimmed.startsWith("//");
}

/** Resolve workspace-relative or absolute PC path to an absolute path. */
export function resolveFsPath(clientPath: string): string {
  const trimmed = (clientPath || ".").trim();
  if (trimmed.includes("\0")) {
    throw new Error("Invalid path");
  }

  if (isAbsoluteClientPath(trimmed)) {
    const absolute = path.resolve(trimmed.replace(/\//g, path.sep));
    if (!isAllowedBrowsePath(absolute)) {
      throw new Error("Path is not allowed");
    }
    return absolute;
  }

  return resolveWorkspaceRelativePath(trimmed);
}

function resolveWorkspaceRelativePath(relativePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const normalized = path.normalize(relativePath.replace(/\\/g, "/"));

  if (path.isAbsolute(normalized)) {
    throw new Error("Absolute paths must use drive letter form (e.g. C:/Users)");
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

/** Convert absolute path to client form (relative inside workspace, else absolute). */
export function toClientPath(absolutePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(absolutePath);

  if (
    resolved === workspaceRoot ||
    resolved.startsWith(workspaceRoot + path.sep)
  ) {
    const relative = path.relative(workspaceRoot, resolved);
    return relative === "" ? "." : relative.replace(/\\/g, "/");
  }

  return resolved.replace(/\\/g, "/");
}

export async function assertPathAllowed(absolutePath: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  const realPath = await fs.promises
    .realpath(absolutePath)
    .catch(() => path.resolve(absolutePath));

  if (
    realPath === workspaceRoot ||
    realPath.startsWith(workspaceRoot + path.sep)
  ) {
    return;
  }

  if (!isAllowedBrowsePath(realPath)) {
    throw new Error("Path is not allowed");
  }
}

/** @deprecated Use resolveFsPath */
export function resolveSafePath(relativePath: string): string {
  return resolveWorkspaceRelativePath(relativePath);
}

/** @deprecated Use toClientPath */
export function toRelativePath(absolutePath: string): string {
  return toClientPath(absolutePath);
}

/** @deprecated Use assertPathAllowed */
export async function assertInsideWorkspace(absolutePath: string): Promise<void> {
  await assertPathAllowed(absolutePath);
}
