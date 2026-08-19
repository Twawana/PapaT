import {
  addConflict,
  countPendingFiles,
  deleteProjectFileRecord,
  enqueueSyncOperation,
  getProject,
  listPendingSyncQueue,
  listProjectFiles,
  listUnresolvedConflicts,
  LocalProject,
  removeSyncQueueItem,
  setProjectSyncStatus,
  SyncQueueItem,
  upsertProject,
  upsertProjectFile,
} from "../localDb";
import { contentHash, projectIdFromPath } from "./exclusions";
import { titusClient } from "../websocket";
import {
  SyncManifestEntry,
  SyncPushChange,
} from "../../types/protocol";

export interface SyncProgress {
  phase: "idle" | "downloading" | "uploading" | "comparing" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

function createQueueId(): string {
  return `sq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureLocalProject(
  pcPath: string,
  name: string
): Promise<LocalProject> {
  const id = projectIdFromPath(pcPath);
  const existing = await getProject(id);
  if (existing) {
    await upsertProject({ ...existing, name, pcPath });
    return { ...existing, name, pcPath };
  }

  const project: LocalProject = {
    id,
    name,
    pcPath,
    offlineEnabled: false,
    lastSyncedAt: null,
    syncStatus: "unknown",
    createdAt: Date.now(),
  };
  await upsertProject(project);
  return project;
}

export async function enableOfflineForProject(
  pcPath: string,
  name: string,
  onProgress?: ProgressCallback
): Promise<LocalProject> {
  if (!titusClient.isConnected()) {
    throw new Error("Connect to your PC to download the project for offline use.");
  }

  const project = await ensureLocalProject(pcPath, name);
  await upsertProject({ ...project, offlineEnabled: true, syncStatus: "syncing" });
  onProgress?.({ phase: "downloading", message: "Fetching project manifest…" });

  const manifestResult = await titusClient.syncManifest();
  const files = manifestResult.files.filter((f) => f.entryType === "file");
  const dirs = manifestResult.files.filter((f) => f.entryType === "directory");

  for (const dir of dirs) {
    await upsertProjectFile({
      projectId: project.id,
      path: dir.path,
      entryType: "directory",
      content: null,
      encoding: "utf-8",
      mimeType: null,
      localMtime: dir.mtime,
      pcMtime: dir.mtime,
      contentHash: null,
      syncState: "synced",
      deletedLocally: false,
    });
  }

  const batchSize = 20;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    onProgress?.({
      phase: "downloading",
      message: `Downloading files… (${Math.min(i + batchSize, files.length)}/${files.length})`,
      current: Math.min(i + batchSize, files.length),
      total: files.length,
    });

    const pulled = await titusClient.syncPull(batch.map((f) => f.path));
    for (const file of pulled.files) {
      const hash = file.hash ?? (file.encoding === "utf-8" ? contentHash(file.content) : null);
      await upsertProjectFile({
        projectId: project.id,
        path: file.path,
        entryType: "file",
        content: file.content,
        encoding: file.encoding ?? "utf-8",
        mimeType: file.mimeType ?? null,
        localMtime: file.mtime,
        pcMtime: file.mtime,
        contentHash: hash,
        syncState: "synced",
        deletedLocally: false,
      });
    }
  }

  const updated: LocalProject = {
    ...project,
    offlineEnabled: true,
    syncStatus: "synced",
    lastSyncedAt: Date.now(),
  };
  await upsertProject(updated);
  onProgress?.({ phase: "done", message: "Project available offline" });
  return updated;
}

export async function saveLocalFileEdit(
  projectId: string,
  filePath: string,
  content: string,
  encoding: "utf-8" | "base64" = "utf-8",
  mimeType?: string | null
): Promise<void> {
  const now = Date.now();
  const existing = await listProjectFiles(projectId);
  const prev = existing.find((f) => f.path === filePath);

  await upsertProjectFile({
    projectId,
    path: filePath,
    entryType: "file",
    content,
    encoding,
    mimeType: mimeType ?? null,
    localMtime: now,
    pcMtime: prev?.pcMtime ?? null,
    contentHash: encoding === "utf-8" ? contentHash(content) : prev?.contentHash ?? null,
    syncState: titusClient.isConnected() ? "pending_upload" : "pending_upload",
    deletedLocally: false,
  });

  await enqueueSyncOperation({
    id: createQueueId(),
    projectId,
    operation: "write",
    path: filePath,
    content,
    fromPath: null,
    toPath: null,
    basePcMtime: prev?.pcMtime ?? null,
    createdAt: now,
    status: "pending",
  });

  await setProjectSyncStatus(projectId, "pending");
}

export async function queueLocalDelete(
  projectId: string,
  filePath: string
): Promise<void> {
  const files = await listProjectFiles(projectId);
  const prev = files.find((f) => f.path === filePath);
  const now = Date.now();

  await upsertProjectFile({
    projectId,
    path: filePath,
    entryType: prev?.entryType ?? "file",
    content: prev?.content ?? null,
    encoding: prev?.encoding ?? "utf-8",
    mimeType: prev?.mimeType ?? null,
    localMtime: now,
    pcMtime: prev?.pcMtime ?? null,
    contentHash: prev?.contentHash ?? null,
    syncState: "deleted_pending",
    deletedLocally: true,
  });

  await enqueueSyncOperation({
    id: createQueueId(),
    projectId,
    operation: "delete",
    path: filePath,
    content: null,
    fromPath: null,
    toPath: null,
    basePcMtime: prev?.pcMtime ?? null,
    createdAt: now,
    status: "pending",
  });

  await setProjectSyncStatus(projectId, "pending");
}

export async function queueLocalMkdir(
  projectId: string,
  dirPath: string
): Promise<void> {
  const now = Date.now();
  await upsertProjectFile({
    projectId,
    path: dirPath,
    entryType: "directory",
    content: null,
    encoding: "utf-8",
    mimeType: null,
    localMtime: now,
    pcMtime: null,
    contentHash: null,
    syncState: "pending_upload",
    deletedLocally: false,
  });

  await enqueueSyncOperation({
    id: createQueueId(),
    projectId,
    operation: "mkdir",
    path: dirPath,
    content: null,
    fromPath: null,
    toPath: null,
    basePcMtime: null,
    createdAt: now,
    status: "pending",
  });

  await setProjectSyncStatus(projectId, "pending");
}

export async function queueLocalMove(
  projectId: string,
  from: string,
  to: string
): Promise<void> {
  const files = await listProjectFiles(projectId);
  const prev = files.find((f) => f.path === from);
  const now = Date.now();

  if (prev) {
    await deleteProjectFileRecord(projectId, from);
    await upsertProjectFile({
      ...prev,
      path: to,
      localMtime: now,
      syncState: "pending_upload",
    });
  }

  await enqueueSyncOperation({
    id: createQueueId(),
    projectId,
    operation: "move",
    path: from,
    content: null,
    fromPath: from,
    toPath: to,
    basePcMtime: prev?.pcMtime ?? null,
    createdAt: now,
    status: "pending",
  });

  await setProjectSyncStatus(projectId, "pending");
}

function queueItemToPushChange(item: SyncQueueItem): SyncPushChange | null {
  if (item.operation === "write" && item.content != null) {
    return {
      op: "write",
      path: item.path,
      content: item.content,
      baseMtime: item.basePcMtime ?? undefined,
      create: true,
    };
  }
  if (item.operation === "delete") {
    return {
      op: "delete",
      path: item.path,
      baseMtime: item.basePcMtime ?? undefined,
    };
  }
  if (item.operation === "mkdir") {
    return { op: "mkdir", path: item.path };
  }
  if (item.operation === "move" && item.fromPath && item.toPath) {
    return {
      op: "move",
      from: item.fromPath,
      to: item.toPath,
      baseMtime: item.basePcMtime ?? undefined,
    };
  }
  return null;
}

export async function syncProjectWithPc(
  projectId: string,
  onProgress?: ProgressCallback
): Promise<{ conflicts: number; uploaded: number; downloaded: number }> {
  if (!titusClient.isConnected()) {
    throw new Error("PC is not reachable");
  }

  const project = await getProject(projectId);
  if (!project?.offlineEnabled) {
    throw new Error("Project is not enabled for offline sync");
  }

  await setProjectSyncStatus(projectId, "syncing");
  onProgress?.({ phase: "uploading", message: "Uploading local changes…" });

  const queue = await listPendingSyncQueue(projectId);
  const changes: SyncPushChange[] = [];
  const queueByPath = new Map<string, SyncQueueItem>();

  for (const item of queue) {
    const change = queueItemToPushChange(item);
    if (change) {
      changes.push(change);
      queueByPath.set(item.path, item);
    }
  }

  let uploaded = 0;
  if (changes.length > 0) {
    const pushResult = await titusClient.syncPush(changes);
    uploaded = pushResult.applied.length;

    for (const applied of pushResult.applied) {
      const item = [...queueByPath.values()].find(
        (q) => q.path === applied.path || q.toPath === applied.path
      );
      if (item) {
        await removeSyncQueueItem(item.id);
      }
      const localFiles = await listProjectFiles(projectId);
      const local = localFiles.find((f) => f.path === applied.path);
      if (local) {
        await upsertProjectFile({
          ...local,
          pcMtime: applied.mtime,
          syncState: "synced",
        });
      }
    }

    for (const conflict of pushResult.conflicts) {
      const item = queueByPath.get(conflict.path);
      const localFiles = await listProjectFiles(projectId);
      const local = localFiles.find((f) => f.path === conflict.path);
      await addConflict({
        id: `conflict-${projectId}-${conflict.path}-${Date.now()}`,
        projectId,
        path: conflict.path,
        localContent: local?.content ?? item?.content ?? null,
        pcContent: conflict.pcContent,
        localMtime: local?.localMtime ?? Date.now(),
        pcMtime: conflict.pcMtime,
        createdAt: Date.now(),
        resolved: false,
      });
      if (local) {
        await upsertProjectFile({ ...local, syncState: "conflict" });
      }
    }
  }

  onProgress?.({ phase: "comparing", message: "Checking for PC changes…" });

  const manifestResult = await titusClient.syncManifest();
  const localFiles = await listProjectFiles(projectId);
  const localByPath = new Map(localFiles.map((f) => [f.path, f]));
  const pcFiles = manifestResult.files.filter((f) => f.entryType === "file");

  const toDownload: SyncManifestEntry[] = [];
  for (const pcFile of pcFiles) {
    const local = localByPath.get(pcFile.path);
    if (!local) {
      toDownload.push(pcFile);
      continue;
    }
    if (
      local.syncState === "synced" &&
      local.pcMtime != null &&
      pcFile.mtime > local.pcMtime
    ) {
      toDownload.push(pcFile);
    }
  }

  let downloaded = 0;
  const batchSize = 20;
  for (let i = 0; i < toDownload.length; i += batchSize) {
    const batch = toDownload.slice(i, i + batchSize);
    onProgress?.({
      phase: "downloading",
      message: `Downloading PC changes… (${Math.min(i + batchSize, toDownload.length)}/${toDownload.length})`,
      current: Math.min(i + batchSize, toDownload.length),
      total: toDownload.length,
    });

    const pulled = await titusClient.syncPull(batch.map((f) => f.path));
    for (const file of pulled.files) {
      const local = localByPath.get(file.path);
      if (
        local &&
        local.syncState === "pending_upload" &&
        local.content !== file.content
      ) {
        await addConflict({
          id: `conflict-${projectId}-${file.path}-${Date.now()}`,
          projectId,
          path: file.path,
          localContent: local.content,
          pcContent: file.content,
          localMtime: local.localMtime,
          pcMtime: file.mtime,
          createdAt: Date.now(),
          resolved: false,
        });
        await upsertProjectFile({ ...local, syncState: "conflict" });
        continue;
      }

      await upsertProjectFile({
        projectId,
        path: file.path,
        entryType: "file",
        content: file.content,
        encoding: file.encoding ?? "utf-8",
        mimeType: file.mimeType ?? null,
        localMtime: file.mtime,
        pcMtime: file.mtime,
        contentHash: file.hash ?? contentHash(file.content),
        syncState: "synced",
        deletedLocally: false,
      });
      downloaded += 1;
    }
  }

  const conflicts = (await listUnresolvedConflicts(projectId)).length;
  const pending = await countPendingFiles(projectId);

  if (conflicts > 0) {
    await setProjectSyncStatus(projectId, "conflict");
  } else if (pending > 0) {
    await setProjectSyncStatus(projectId, "pending");
  } else {
    await setProjectSyncStatus(projectId, "synced", Date.now());
  }

  onProgress?.({ phase: "done", message: "Sync complete" });
  return { conflicts, uploaded, downloaded };
}

export async function readLocalFileContent(
  projectId: string,
  filePath: string
): Promise<{
  content: string;
  encoding: "utf-8" | "base64";
  mimeType?: string | null;
  mtime: number;
} | null> {
  const files = await listProjectFiles(projectId);
  const file = files.find((f) => f.path === filePath && f.entryType === "file");
  if (!file || file.content == null) return null;
  return {
    content: file.content,
    encoding: file.encoding,
    mimeType: file.mimeType,
    mtime: file.localMtime,
  };
}
