import * as fs from "fs";
import * as path from "path";
import { FileEntry } from "./protocol";
import {
  assertInsideWorkspace,
  resolveSafePath,
  toRelativePath,
} from "./path-utils";
import { getWorkspaceRoot } from "./workspace-state";

const MAX_FILE_BYTES = Number(process.env.PAPAT_MAX_FILE_SIZE) || 512_000;

export async function listDirectory(relativePath: string): Promise<FileEntry[]> {
  const absolutePath = resolveSafePath(relativePath);
  await assertInsideWorkspace(absolutePath);

  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }

  const names = await fs.promises.readdir(absolutePath);
  const entries: FileEntry[] = [];

  for (const name of names) {
    const entryPath = path.join(absolutePath, name);
    const entryStat = await fs.promises.lstat(entryPath);
    const isDirectory = entryStat.isDirectory();

    entries.push({
      name,
      path: toRelativePath(entryPath),
      entryType: isDirectory ? "directory" : "file",
      size: isDirectory ? undefined : entryStat.size,
      mtime: entryStat.mtimeMs,
    });
  }

  entries.sort((a, b) => {
    if (a.entryType !== b.entryType) {
      return a.entryType === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function readFile(relativePath: string): Promise<{
  path: string;
  content: string;
  size: number;
  mtime: number;
}> {
  const absolutePath = resolveSafePath(relativePath);
  await assertInsideWorkspace(absolutePath);

  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES} byte limit`);
  }

  const content = await fs.promises.readFile(absolutePath, "utf-8");

  return {
    path: toRelativePath(absolutePath),
    content,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export async function writeFile(
  relativePath: string,
  content: string,
  create = true
): Promise<{ path: string; size: number; mtime: number }> {
  if (typeof content !== "string") {
    throw new Error("Content must be a string");
  }
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
    throw new Error(`Content exceeds ${MAX_FILE_BYTES} byte limit`);
  }

  const absolutePath = resolveSafePath(relativePath);
  await assertInsideWorkspace(absolutePath);

  const exists = await fs.promises
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);

  if (!exists && !create) {
    throw new Error("File does not exist");
  }
  if (exists) {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error("Path is not a file");
    }
  } else {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  }

  await fs.promises.writeFile(absolutePath, content, "utf-8");
  const stat = await fs.promises.stat(absolutePath);

  return {
    path: toRelativePath(absolutePath),
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export async function deletePath(relativePath: string): Promise<{ path: string }> {
  const absolutePath = resolveSafePath(relativePath);
  await assertInsideWorkspace(absolutePath);

  if (absolutePath === getWorkspaceRoot()) {
    throw new Error("Cannot delete workspace root");
  }

  const stat = await fs.promises.lstat(absolutePath);
  if (stat.isDirectory()) {
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  } else {
    await fs.promises.unlink(absolutePath);
  }

  return { path: toRelativePath(absolutePath) };
}

export async function mkdir(relativePath: string): Promise<{ path: string }> {
  const absolutePath = resolveSafePath(relativePath);
  await assertInsideWorkspace(absolutePath);

  await fs.promises.mkdir(absolutePath, { recursive: true });

  return { path: toRelativePath(absolutePath) };
}
