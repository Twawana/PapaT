/** Directories excluded from offline project sync. */
export const SYNC_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".expo",
  ".next",
  "coverage",
  "__pycache__",
  ".cache",
  ".turbo",
  "out",
  ".gradle",
  ".idea",
  ".vscode",
  "vendor",
  "tmp",
  "temp",
]);

const SKIP_FILE_SUFFIXES = [
  ".log",
  ".tmp",
  ".swp",
  ".DS_Store",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".apk",
  ".ipa",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".pdf",
];

export function shouldSkipSyncDir(name: string): boolean {
  if (SYNC_SKIP_DIRS.has(name)) return true;
  if (name.startsWith(".") && name !== ".env" && name !== ".env.example") {
    return true;
  }
  return false;
}

export function shouldSkipSyncFile(name: string): boolean {
  const lower = name.toLowerCase();
  for (const suffix of SKIP_FILE_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  if (lower.endsWith(".min.js") || lower.endsWith(".min.css")) return true;
  if (lower.endsWith(".map")) return true;
  return false;
}

export function projectIdFromPath(pcPath: string): string {
  const normalized = pcPath.replace(/\\/g, "/").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (Math.imul(31, hash) + normalized.charCodeAt(i)) | 0;
  }
  return `proj-${Math.abs(hash).toString(36)}`;
}

export function contentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (Math.imul(31, hash) + content.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
