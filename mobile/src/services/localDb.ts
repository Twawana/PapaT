import * as SQLite from "expo-sqlite";

export type FileSyncState =
  | "synced"
  | "pending_upload"
  | "pending_download"
  | "conflict"
  | "deleted_pending";

export type ProjectSyncStatus =
  | "unknown"
  | "synced"
  | "pending"
  | "syncing"
  | "conflict"
  | "offline";

export interface LocalProject {
  id: string;
  name: string;
  pcPath: string;
  offlineEnabled: boolean;
  lastSyncedAt: number | null;
  syncStatus: ProjectSyncStatus;
  createdAt: number;
}

export interface LocalProjectFile {
  projectId: string;
  path: string;
  entryType: "file" | "directory";
  content: string | null;
  encoding: "utf-8" | "base64";
  mimeType: string | null;
  localMtime: number;
  pcMtime: number | null;
  contentHash: string | null;
  syncState: FileSyncState;
  deletedLocally: boolean;
}

export interface SyncQueueItem {
  id: string;
  projectId: string;
  operation: "write" | "delete" | "mkdir" | "move";
  path: string;
  content: string | null;
  fromPath: string | null;
  toPath: string | null;
  basePcMtime: number | null;
  createdAt: number;
  status: "pending" | "processing" | "failed";
}

export interface SyncConflictRecord {
  id: string;
  projectId: string;
  path: string;
  localContent: string | null;
  pcContent: string | null;
  localMtime: number;
  pcMtime: number;
  createdAt: number;
  resolved: boolean;
}

const DB_NAME = "titus-offline.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          pc_path TEXT NOT NULL UNIQUE,
          offline_enabled INTEGER NOT NULL DEFAULT 0,
          last_synced_at INTEGER,
          sync_status TEXT NOT NULL DEFAULT 'unknown',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_files (
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          entry_type TEXT NOT NULL,
          content TEXT,
          encoding TEXT NOT NULL DEFAULT 'utf-8',
          mime_type TEXT,
          local_mtime INTEGER NOT NULL,
          pc_mtime INTEGER,
          content_hash TEXT,
          sync_state TEXT NOT NULL DEFAULT 'synced',
          deleted_locally INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (project_id, path),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT,
          from_path TEXT,
          to_path TEXT,
          base_pc_mtime INTEGER,
          created_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          local_content TEXT,
          pc_content TEXT,
          local_mtime INTEGER NOT NULL,
          pc_mtime INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          resolved INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_project ON sync_queue(project_id, status);
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_project ON sync_conflicts(project_id, resolved);
      `);
      return db;
    })();
  }
  return dbPromise;
}

function rowToProject(row: Record<string, unknown>): LocalProject {
  return {
    id: String(row.id),
    name: String(row.name),
    pcPath: String(row.pc_path),
    offlineEnabled: Boolean(row.offline_enabled),
    lastSyncedAt: row.last_synced_at != null ? Number(row.last_synced_at) : null,
    syncStatus: String(row.sync_status) as ProjectSyncStatus,
    createdAt: Number(row.created_at),
  };
}

function rowToFile(row: Record<string, unknown>): LocalProjectFile {
  return {
    projectId: String(row.project_id),
    path: String(row.path),
    entryType: String(row.entry_type) as "file" | "directory",
    content: row.content != null ? String(row.content) : null,
    encoding: (String(row.encoding) as "utf-8" | "base64") || "utf-8",
    mimeType: row.mime_type != null ? String(row.mime_type) : null,
    localMtime: Number(row.local_mtime),
    pcMtime: row.pc_mtime != null ? Number(row.pc_mtime) : null,
    contentHash: row.content_hash != null ? String(row.content_hash) : null,
    syncState: String(row.sync_state) as FileSyncState,
    deletedLocally: Boolean(row.deleted_locally),
  };
}

export async function upsertProject(project: LocalProject): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO projects (id, name, pc_path, offline_enabled, last_synced_at, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       pc_path = excluded.pc_path,
       offline_enabled = excluded.offline_enabled,
       last_synced_at = excluded.last_synced_at,
       sync_status = excluded.sync_status`,
    [
      project.id,
      project.name,
      project.pcPath,
      project.offlineEnabled ? 1 : 0,
      project.lastSyncedAt,
      project.syncStatus,
      project.createdAt,
    ]
  );
}

export async function getProject(id: string): Promise<LocalProject | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM projects WHERE id = ?",
    [id]
  );
  return row ? rowToProject(row) : null;
}

export async function getProjectByPcPath(pcPath: string): Promise<LocalProject | null> {
  const db = await getDb();
  const normalized = pcPath.replace(/\\/g, "/");
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM projects WHERE pc_path = ? OR pc_path = ?",
    [pcPath, normalized]
  );
  return row ? rowToProject(row) : null;
}

export async function listOfflineProjects(): Promise<LocalProject[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM projects WHERE offline_enabled = 1 ORDER BY name ASC"
  );
  return rows.map(rowToProject);
}

export async function setProjectSyncStatus(
  projectId: string,
  status: ProjectSyncStatus,
  lastSyncedAt?: number
): Promise<void> {
  const db = await getDb();
  if (lastSyncedAt != null) {
    await db.runAsync(
      "UPDATE projects SET sync_status = ?, last_synced_at = ? WHERE id = ?",
      [status, lastSyncedAt, projectId]
    );
  } else {
    await db.runAsync("UPDATE projects SET sync_status = ? WHERE id = ?", [
      status,
      projectId,
    ]);
  }
}

export async function setProjectOfflineEnabled(
  projectId: string,
  enabled: boolean
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE projects SET offline_enabled = ? WHERE id = ?", [
    enabled ? 1 : 0,
    projectId,
  ]);
}

export async function upsertProjectFile(file: LocalProjectFile): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO project_files
      (project_id, path, entry_type, content, encoding, mime_type, local_mtime, pc_mtime, content_hash, sync_state, deleted_locally)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET
       entry_type = excluded.entry_type,
       content = excluded.content,
       encoding = excluded.encoding,
       mime_type = excluded.mime_type,
       local_mtime = excluded.local_mtime,
       pc_mtime = excluded.pc_mtime,
       content_hash = excluded.content_hash,
       sync_state = excluded.sync_state,
       deleted_locally = excluded.deleted_locally`,
    [
      file.projectId,
      file.path,
      file.entryType,
      file.content,
      file.encoding,
      file.mimeType,
      file.localMtime,
      file.pcMtime,
      file.contentHash,
      file.syncState,
      file.deletedLocally ? 1 : 0,
    ]
  );
}

export async function getProjectFile(
  projectId: string,
  filePath: string
): Promise<LocalProjectFile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM project_files WHERE project_id = ? AND path = ? AND deleted_locally = 0",
    [projectId, filePath]
  );
  return row ? rowToFile(row) : null;
}

export async function listProjectFiles(projectId: string): Promise<LocalProjectFile[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM project_files WHERE project_id = ? AND deleted_locally = 0 ORDER BY path ASC",
    [projectId]
  );
  return rows.map(rowToFile);
}

export async function listProjectDirectory(
  projectId: string,
  dirPath: string
): Promise<LocalProjectFile[]> {
  const normalized =
    dirPath === "." || dirPath === "" || dirPath === "/"
      ? ""
      : dirPath.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = normalized ? `${normalized}/` : "";
  const all = await listProjectFiles(projectId);

  const entries = new Map<string, LocalProjectFile>();

  for (const file of all) {
    const rel = file.path.replace(/\\/g, "/");
    if (normalized && !rel.startsWith(prefix)) continue;
    const remainder = normalized ? rel.slice(prefix.length) : rel;
    if (!remainder) continue;
    const parts = remainder.split("/");
    const name = parts[0]!;
    const childPath = normalized ? `${normalized}/${name}` : name;

    if (parts.length === 1) {
      entries.set(childPath, { ...file, path: childPath });
      continue;
    }

    if (!entries.has(childPath)) {
      entries.set(childPath, {
        projectId,
        path: childPath,
        entryType: "directory",
        content: null,
        encoding: "utf-8",
        mimeType: null,
        localMtime: file.localMtime,
        pcMtime: file.pcMtime,
        contentHash: null,
        syncState: "synced",
        deletedLocally: false,
      });
    }
  }

  return [...entries.values()].sort((a, b) => {
    if (a.entryType !== b.entryType) {
      return a.entryType === "directory" ? -1 : 1;
    }
    const aName = a.path.split("/").pop() ?? a.path;
    const bName = b.path.split("/").pop() ?? b.path;
    return aName.localeCompare(bName);
  });
}

export async function markFileDeleted(projectId: string, filePath: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE project_files SET deleted_locally = 1, sync_state = 'deleted_pending', local_mtime = ?
     WHERE project_id = ? AND path = ?`,
    [Date.now(), projectId, filePath]
  );
}

export async function deleteProjectFileRecord(
  projectId: string,
  filePath: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM project_files WHERE project_id = ? AND path = ?", [
    projectId,
    filePath,
  ]);
}

export async function countPendingFiles(projectId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM project_files
     WHERE project_id = ? AND sync_state IN ('pending_upload', 'deleted_pending', 'conflict')`,
    [projectId]
  );
  return row?.count ?? 0;
}

export async function enqueueSyncOperation(item: SyncQueueItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_queue (id, project_id, operation, path, content, from_path, to_path, base_pc_mtime, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       status = 'pending'`,
    [
      item.id,
      item.projectId,
      item.operation,
      item.path,
      item.content,
      item.fromPath,
      item.toPath,
      item.basePcMtime,
      item.createdAt,
      item.status,
    ]
  );
}

export async function listPendingSyncQueue(projectId: string): Promise<SyncQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM sync_queue WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC",
    [projectId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    operation: String(row.operation) as SyncQueueItem["operation"],
    path: String(row.path),
    content: row.content != null ? String(row.content) : null,
    fromPath: row.from_path != null ? String(row.from_path) : null,
    toPath: row.to_path != null ? String(row.to_path) : null,
    basePcMtime: row.base_pc_mtime != null ? Number(row.base_pc_mtime) : null,
    createdAt: Number(row.created_at),
    status: String(row.status) as SyncQueueItem["status"],
  }));
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
}

export async function addConflict(record: SyncConflictRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_conflicts (id, project_id, path, local_content, pc_content, local_mtime, pc_mtime, created_at, resolved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       local_content = excluded.local_content,
       pc_content = excluded.pc_content,
       local_mtime = excluded.local_mtime,
       pc_mtime = excluded.pc_mtime,
       resolved = 0`,
    [
      record.id,
      record.projectId,
      record.path,
      record.localContent,
      record.pcContent,
      record.localMtime,
      record.pcMtime,
      record.createdAt,
    ]
  );
}

export async function listUnresolvedConflicts(
  projectId: string
): Promise<SyncConflictRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM sync_conflicts WHERE project_id = ? AND resolved = 0 ORDER BY created_at ASC",
    [projectId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    projectId: String(row.project_id),
    path: String(row.path),
    localContent: row.local_content != null ? String(row.local_content) : null,
    pcContent: row.pc_content != null ? String(row.pc_content) : null,
    localMtime: Number(row.local_mtime),
    pcMtime: Number(row.pc_mtime),
    createdAt: Number(row.created_at),
    resolved: Boolean(row.resolved),
  }));
}

export async function resolveConflict(
  conflictId: string,
  resolution: "keep_local" | "keep_pc"
): Promise<SyncConflictRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM sync_conflicts WHERE id = ?",
    [conflictId]
  );
  if (!row) return null;

  const conflict: SyncConflictRecord = {
    id: String(row.id),
    projectId: String(row.project_id),
    path: String(row.path),
    localContent: row.local_content != null ? String(row.local_content) : null,
    pcContent: row.pc_content != null ? String(row.pc_content) : null,
    localMtime: Number(row.local_mtime),
    pcMtime: Number(row.pc_mtime),
    createdAt: Number(row.created_at),
    resolved: false,
  };

  await db.runAsync("UPDATE sync_conflicts SET resolved = 1 WHERE id = ?", [conflictId]);

  if (resolution === "keep_local") {
    await upsertProjectFile({
      projectId: conflict.projectId,
      path: conflict.path,
      entryType: "file",
      content: conflict.localContent,
      encoding: "utf-8",
      mimeType: null,
      localMtime: Date.now(),
      pcMtime: conflict.pcMtime,
      contentHash: conflict.localContent ? contentHashSimple(conflict.localContent) : null,
      syncState: "pending_upload",
      deletedLocally: false,
    });
  } else {
    await upsertProjectFile({
      projectId: conflict.projectId,
      path: conflict.path,
      entryType: "file",
      content: conflict.pcContent,
      encoding: "utf-8",
      mimeType: null,
      localMtime: Date.now(),
      pcMtime: conflict.pcMtime,
      contentHash: conflict.pcContent ? contentHashSimple(conflict.pcContent) : null,
      syncState: "synced",
      deletedLocally: false,
    });
  }

  return conflict;
}

function contentHashSimple(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (Math.imul(31, hash) + content.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Test helper — reset database (tests only). */
export async function resetDatabaseForTests(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM sync_conflicts;
    DELETE FROM sync_queue;
    DELETE FROM project_files;
    DELETE FROM projects;
  `);
}
