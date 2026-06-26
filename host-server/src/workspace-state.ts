import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

let activeWorkspaceRoot = path.resolve(config.workspaceDir);

export function getWorkspaceRoot(): string {
  return activeWorkspaceRoot;
}

export function setWorkspaceRoot(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);

  if (!fs.existsSync(resolved)) {
    throw new Error("Folder does not exist");
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }

  activeWorkspaceRoot = resolved;
  return activeWorkspaceRoot;
}

export function initWorkspace(): void {
  fs.mkdirSync(activeWorkspaceRoot, { recursive: true });
}

export function workspaceFolderName(): string {
  return path.basename(activeWorkspaceRoot) || activeWorkspaceRoot;
}
