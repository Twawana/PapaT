import * as fs from "fs";
import * as path from "path";
import { RecentFolder } from "./protocol";
import { ensureDataDir, getDataDir } from "./data-dir";

const MAX_RECENT = 12;

function recentFile(): string {
  return path.join(getDataDir(), "recent-folders.json");
}

function loadAll(): RecentFolder[] {
  try {
    ensureDataDir();
    const file = recentFile();
    if (!fs.existsSync(file)) {
      return [];
    }
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as RecentFolder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(entries: RecentFolder[]): void {
  ensureDataDir();
  fs.writeFileSync(recentFile(), JSON.stringify(entries, null, 2), "utf-8");
}

export function getRecentFolders(): RecentFolder[] {
  return loadAll().filter((entry) => fs.existsSync(entry.path));
}

export function addRecentFolder(folderPath: string): RecentFolder[] {
  const resolved = path.resolve(folderPath);
  const name = path.basename(resolved) || resolved;
  const now = Date.now();

  const without = loadAll().filter((entry) => path.resolve(entry.path) !== resolved);
  const updated: RecentFolder[] = [{ path: resolved, name, lastOpened: now }, ...without].slice(
    0,
    MAX_RECENT
  );

  saveAll(updated);
  return updated;
}
