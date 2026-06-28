import * as fs from "fs";
import * as path from "path";
import { FileEntry } from "./protocol";
import {
  assertPathAllowed,
  resolveFsPath,
  toClientPath,
} from "./path-utils";
import { getWorkspaceRoot } from "./workspace-state";

const MAX_FILE_BYTES = Number(process.env.PAPAT_MAX_FILE_SIZE) || 512_000;

export async function listDirectory(clientPath: string): Promise<FileEntry[]> {
  const absolutePath = resolveFsPath(clientPath);
  await assertPathAllowed(absolutePath);

  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }

  const names = await fs.promises.readdir(absolutePath);
  const entries: FileEntry[] = [];

  for (const name of names) {
    const entryPath = path.join(absolutePath, name);
    try {
      const entryStat = await fs.promises.lstat(entryPath);
      const isDirectory = entryStat.isDirectory();

      entries.push({
        name,
        path: toClientPath(entryPath),
        entryType: isDirectory ? "directory" : "file",
        size: isDirectory ? undefined : entryStat.size,
        mtime: entryStat.mtimeMs,
      });
    } catch {
      // Skip inaccessible entries
    }
  }

  entries.sort((a, b) => {
    if (a.entryType !== b.entryType) {
      return a.entryType === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function readFile(clientPath: string): Promise<{
  path: string;
  content: string;
  size: number;
  mtime: number;
}> {
  const absolutePath = resolveFsPath(clientPath);
  await assertPathAllowed(absolutePath);

  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES} byte limit`);
  }

  const content = await fs.promises.readFile(absolutePath, "utf-8");

  return {
    path: toClientPath(absolutePath),
    content,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export async function writeFile(
  clientPath: string,
  content: string,
  create = true
): Promise<{ path: string; size: number; mtime: number }> {
  if (typeof content !== "string") {
    throw new Error("Content must be a string");
  }
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
    throw new Error(`Content exceeds ${MAX_FILE_BYTES} byte limit`);
  }

  const absolutePath = resolveFsPath(clientPath);
  await assertPathAllowed(absolutePath);

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
    path: toClientPath(absolutePath),
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export async function deletePath(clientPath: string): Promise<{ path: string }> {
  const absolutePath = resolveFsPath(clientPath);
  await assertPathAllowed(absolutePath);

  if (absolutePath === getWorkspaceRoot()) {
    throw new Error("Cannot delete workspace root");
  }

  const stat = await fs.promises.lstat(absolutePath);
  if (stat.isDirectory()) {
    await fs.promises.rm(absolutePath, { recursive: true, force: true });
  } else {
    await fs.promises.unlink(absolutePath);
  }

  return { path: toClientPath(absolutePath) };
}

export async function mkdir(clientPath: string): Promise<{ path: string }> {
  const absolutePath = resolveFsPath(clientPath);
  await assertPathAllowed(absolutePath);

  await fs.promises.mkdir(absolutePath, { recursive: true });

  return { path: toClientPath(absolutePath) };
}

export async function movePath(
  fromPath: string,
  toPath: string
): Promise<{ from: string; to: string }> {
  const fromAbs = resolveFsPath(fromPath);
  const toAbs = resolveFsPath(toPath);

  await assertPathAllowed(fromAbs);
  await assertPathAllowed(toAbs);

  if (fromAbs === getWorkspaceRoot()) {
    throw new Error("Cannot move workspace root");
  }

  const fromReal = await fs.promises.realpath(fromAbs).catch(() => fromAbs);
  const toParent = path.dirname(toAbs);
  const toParentReal = await fs.promises.realpath(toParent).catch(() => toParent);

  if (toAbs === fromAbs || toParentReal.startsWith(fromReal + path.sep)) {
    throw new Error("Cannot move a folder into itself");
  }

  try {
    await fs.promises.access(toAbs);
    throw new Error("Destination already exists");
  } catch (err) {
    if (err instanceof Error && err.message === "Destination already exists") {
      throw err;
    }
  }

  await fs.promises.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.promises.rename(fromAbs, toAbs);

  return {
    from: toClientPath(fromAbs),
    to: toClientPath(toAbs),
  };
}
