import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BrowseEntry, BrowseRoot } from "./protocol";

function existsDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function getBrowseRoots(): BrowseRoot[] {
  const home = os.homedir();
  const candidates: BrowseRoot[] = [
    { name: "Home", path: home },
    { name: "Desktop", path: path.join(home, "Desktop") },
    { name: "Documents", path: path.join(home, "Documents") },
    { name: "Downloads", path: path.join(home, "Downloads") },
  ];

  if (process.platform === "win32") {
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drive = `${letter}:\\`;
      if (existsDir(drive)) {
        candidates.push({ name: `${letter}:`, path: drive });
      }
    }
  }

  const seen = new Set<string>();
  const roots: BrowseRoot[] = [];

  for (const root of candidates) {
    const resolved = path.resolve(root.path);
    if (!seen.has(resolved) && existsDir(resolved)) {
      seen.add(resolved);
      roots.push({ name: root.name, path: resolved });
    }
  }

  return roots;
}

export async function listBrowseDirectory(absolutePath: string): Promise<{
  path: string;
  entries: BrowseEntry[];
}> {
  const resolved = path.resolve(absolutePath);

  if (!isAllowedBrowsePath(resolved)) {
    throw new Error("Path is not allowed");
  }

  const stat = await fs.promises.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }

  const names = await fs.promises.readdir(resolved);
  const entries: BrowseEntry[] = [];

  for (const name of names) {
    if (name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(resolved, name);
    try {
      const entryStat = await fs.promises.lstat(entryPath);
      if (entryStat.isDirectory()) {
        entries.push({ name, path: entryPath });
      }
    } catch {
      // Skip inaccessible entries
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  return { path: resolved, entries };
}

export function isAllowedBrowsePath(absolutePath: string): boolean {
  const resolved = path.resolve(absolutePath);
  const home = path.resolve(os.homedir());

  if (resolved === home || resolved.startsWith(home + path.sep)) {
    return true;
  }

  if (process.platform === "win32") {
    const driveMatch = /^([A-Za-z]):[\\/]?/.exec(resolved);
    if (driveMatch) {
      const driveRoot = `${driveMatch[1].toUpperCase()}:\\`;
      return existsDir(driveRoot);
    }
  }

  return false;
}

export function validateProjectPath(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);

  if (!isAllowedBrowsePath(resolved)) {
    throw new Error("Path is not allowed");
  }

  if (!existsDir(resolved)) {
    throw new Error("Folder does not exist");
  }

  return resolved;
}
