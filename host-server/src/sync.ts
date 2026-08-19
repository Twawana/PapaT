import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  SyncApplied,
  SyncConflict,
  SyncManifestEntry,
  SyncPullFile,
  SyncPushChange,
} from "./protocol";
import { readFile, writeFile, deletePath, mkdir, movePath } from "./filesystem";
import { resolveFsPath } from "./path-utils";
import { getWorkspaceRoot } from "./workspace-state";
import { shouldSkipSyncDir, shouldSkipSyncFile } from "./sync-exclusions";
import { config } from "./config";

const MAX_SYNC_FILE_BYTES = config.maxFileBytes;

function contentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

async function statMtime(clientPath: string): Promise<number | null> {
  try {
    const stat = await fs.promises.stat(resolveFsPath(clientPath));
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

export async function buildSyncManifest(): Promise<SyncManifestEntry[]> {
  const root = getWorkspaceRoot();
  const entries: SyncManifestEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      return;
    }

    for (const name of names) {
      const full = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = await fs.promises.lstat(full);
      } catch {
        continue;
      }

      const rel = path.relative(root, full).replace(/\\/g, "/");

      if (stat.isDirectory()) {
        if (shouldSkipSyncDir(name)) continue;
        entries.push({
          path: rel,
          entryType: "directory",
          mtime: stat.mtimeMs,
          size: 0,
        });
        await walk(full);
        continue;
      }

      if (!stat.isFile() || shouldSkipSyncFile(name)) continue;
      if (stat.size > MAX_SYNC_FILE_BYTES) continue;

      entries.push({
        path: rel,
        entryType: "file",
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  await walk(root);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

export async function pullSyncFiles(paths: string[]): Promise<SyncPullFile[]> {
  const results: SyncPullFile[] = [];

  for (const filePath of paths) {
    try {
      const data = await readFile(filePath);
      const hash =
        data.encoding === "utf-8" ? contentHash(data.content) : undefined;
      results.push({
        path: data.path,
        content: data.content,
        mtime: data.mtime,
        size: data.size,
        encoding: data.encoding,
        mimeType: data.mimeType,
        hash,
      });
    } catch {
      // Skip unreadable paths
    }
  }

  return results;
}

export async function applySyncPush(
  changes: SyncPushChange[]
): Promise<{ applied: SyncApplied[]; conflicts: SyncConflict[] }> {
  const applied: SyncApplied[] = [];
  const conflicts: SyncConflict[] = [];

  for (const change of changes) {
    try {
      if (change.op === "write") {
        const currentMtime = await statMtime(change.path);
        if (
          change.baseMtime != null &&
          currentMtime != null &&
          currentMtime !== change.baseMtime
        ) {
          let pcContent = "";
          try {
            const existing = await readFile(change.path);
            pcContent = existing.content;
          } catch {
            /* file may have changed form */
          }
          if (pcContent !== change.content) {
            conflicts.push({
              path: change.path,
              pcContent,
              pcMtime: currentMtime,
              reason: "mtime_mismatch",
            });
            continue;
          }
        }

        const result = await writeFile(change.path, change.content, change.create !== false);
        applied.push({ path: result.path, mtime: result.mtime, op: "write" });
        continue;
      }

      if (change.op === "delete") {
        const currentMtime = await statMtime(change.path);
        if (
          change.baseMtime != null &&
          currentMtime != null &&
          currentMtime !== change.baseMtime
        ) {
          let pcContent = "";
          try {
            const existing = await readFile(change.path);
            pcContent = existing.content;
          } catch {
            /* ok */
          }
          conflicts.push({
            path: change.path,
            pcContent,
            pcMtime: currentMtime,
            reason: "delete_conflict",
          });
          continue;
        }

        const result = await deletePath(change.path);
        applied.push({ path: result.path, mtime: Date.now(), op: "delete" });
        continue;
      }

      if (change.op === "mkdir") {
        const result = await mkdir(change.path);
        applied.push({ path: result.path, mtime: Date.now(), op: "mkdir" });
        continue;
      }

      if (change.op === "move") {
        const fromMtime = await statMtime(change.from);
        if (
          change.baseMtime != null &&
          fromMtime != null &&
          fromMtime !== change.baseMtime
        ) {
          conflicts.push({
            path: change.from,
            pcContent: "",
            pcMtime: fromMtime,
            reason: "move_conflict",
          });
          continue;
        }

        const result = await movePath(change.from, change.to);
        applied.push({ path: result.to, mtime: Date.now(), op: "move" });
      }
    } catch (err) {
      conflicts.push({
        path: "path" in change ? change.path : change.from,
        pcContent: "",
        pcMtime: 0,
        reason: err instanceof Error ? err.message : "apply_failed",
      });
    }
  }

  return { applied, conflicts };
}
