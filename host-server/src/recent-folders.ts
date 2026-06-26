import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RecentFolder } from "./protocol";

const DATA_DIR = path.join(os.homedir(), ".papat");
const RECENT_FILE = path.join(DATA_DIR, "recent-folders.json");
const MAX_RECENT = 12;

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll(): RecentFolder[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(RECENT_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(RECENT_FILE, "utf-8");
    const parsed = JSON.parse(raw) as RecentFolder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(entries: RecentFolder[]): void {
  ensureDataDir();
  fs.writeFileSync(RECENT_FILE, JSON.stringify(entries, null, 2), "utf-8");
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
