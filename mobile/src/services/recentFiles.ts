import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "papat_recent_files";
const MAX_RECENT = 20;

export interface RecentFile {
  path: string;
  openedAt: number;
}

let cache: RecentFile[] | null = null;

export async function loadRecentFiles(): Promise<RecentFile[]> {
  if (cache) return cache;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed = JSON.parse(raw) as RecentFile[];
    cache = Array.isArray(parsed) ? parsed : [];
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

export async function touchRecentFile(path: string): Promise<RecentFile[]> {
  const list = await loadRecentFiles();
  const next = [
    { path, openedAt: Date.now() },
    ...list.filter((item) => item.path !== path),
  ].slice(0, MAX_RECENT);
  cache = next;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // keep in-memory only
  }
  return next;
}

export async function removeRecentFile(path: string): Promise<RecentFile[]> {
  const list = await loadRecentFiles();
  const next = list.filter((item) => item.path !== path);
  cache = next;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
