import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { getWorkspaceRoot } from "./workspace-state";
import { resolveFsPath } from "./path-utils";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".expo",
  ".next",
  "coverage",
  "__pycache__",
]);

export interface FileSearchHit {
  path: string;
  name: string;
}

export interface GrepHit {
  path: string;
  line: number;
  column: number;
  text: string;
}

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".");
}

export function searchFiles(query: string, limit = 50): FileSearchHit[] {
  const root = getWorkspaceRoot();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const hits: FileSearchHit[] = [];

  function walk(dir: string): void {
    if (hits.length >= limit) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (hits.length >= limit) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) {
          walk(full);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const rel = path.relative(root, full).replace(/\\/g, "/");
      const nameLower = entry.name.toLowerCase();
      const relLower = rel.toLowerCase();
      if (nameLower.includes(normalized) || relLower.includes(normalized)) {
        hits.push({ path: rel, name: entry.name });
      }
    }
  }

  walk(root);
  hits.sort((a, b) => {
    const aExact = a.name.toLowerCase() === normalized ? 0 : 1;
    const bExact = b.name.toLowerCase() === normalized ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.path.length - b.path.length;
  });
  return hits.slice(0, limit);
}

export function grepWorkspace(query: string, limit = 80): GrepHit[] {
  const root = getWorkspaceRoot();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const rg = spawnSync("rg", ["--json", "-i", "--max-count", "1", trimmed, root], {
    encoding: "utf-8",
    maxBuffer: 2_000_000,
    windowsHide: true,
  });

  if (rg.status === 0 && rg.stdout) {
    return parseRgJson(rg.stdout, root, limit);
  }

  return grepFallback(root, trimmed, limit);
}

function parseRgJson(output: string, root: string, limit: number): GrepHit[] {
  const hits: GrepHit[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as {
        type?: string;
        data?: {
          path?: { text?: string };
          line_number?: number;
          lines?: { text?: string };
          submatches?: { start?: number }[];
        };
      };
      if (obj.type !== "match" || !obj.data?.path?.text) continue;
      const abs = obj.data.path.text;
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      hits.push({
        path: rel,
        line: obj.data.line_number ?? 1,
        column: (obj.data.submatches?.[0]?.start ?? 0) + 1,
        text: (obj.data.lines?.text ?? "").trimEnd(),
      });
      if (hits.length >= limit) break;
    } catch {
      // skip bad line
    }
  }
  return hits;
}

function grepFallback(root: string, query: string, limit: number): GrepHit[] {
  const hits: GrepHit[] = [];
  const lower = query.toLowerCase();

  function walk(dir: string): void {
    if (hits.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (hits.length >= limit) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.length > 120) continue;

      let content: string;
      try {
        const stat = fs.statSync(full);
        if (stat.size > 256_000) continue;
        content = fs.readFileSync(full, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i]!;
        if (text.toLowerCase().includes(lower)) {
          hits.push({
            path: path.relative(root, full).replace(/\\/g, "/"),
            line: i + 1,
            column: Math.max(1, text.toLowerCase().indexOf(lower) + 1),
            text,
          });
          break;
        }
      }
    }
  }

  walk(root);
  return hits;
}

export function resolveWorkspaceRelative(clientPath: string): string {
  return resolveFsPath(clientPath);
}
