import { ExecuteLanguage } from "../types/protocol";

export type EditorMode =
  | "javascript"
  | "typescript"
  | "python"
  | "shell"
  | "json"
  | "markdown"
  | "html"
  | "css"
  | "plaintext";

export function editorModeFromPath(path: string): EditorMode {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".jsx") || name.endsWith(".js") || name.endsWith(".mjs")) {
    return "javascript";
  }
  if (name.endsWith(".py")) return "python";
  if (name.endsWith(".sh") || name.endsWith(".bash") || name.endsWith(".ps1")) {
    return "shell";
  }
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".css")) return "css";
  return "plaintext";
}

export function executeLanguageFromPath(path: string): ExecuteLanguage {
  const mode = editorModeFromPath(path);
  if (mode === "typescript") return "typescript";
  if (mode === "python") return "python";
  if (mode === "shell") return "shell";
  return "javascript";
}

export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
    lower.endsWith(ext)
  );
}

export function imageMimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

/** Build a data URI for phone image preview from fs_read content. */
export function imageDataUri(
  path: string,
  content: string,
  encoding?: "utf-8" | "base64"
): string {
  const mime = imageMimeFromPath(path);
  if (mime === "image/svg+xml" && encoding !== "base64") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  }
  const base64 = content.replace(/\s+/g, "");
  return `data:${mime};base64,${base64}`;
}

/** HTTP preview URL served by the PapaT host (preferred for phone Image). */
export function imagePreviewHttpUrl(
  host: string,
  port: number,
  filePath: string,
  token: string | null
): string | null {
  if (!host || !filePath) return null;
  const params = new URLSearchParams({ path: filePath });
  if (token) {
    params.set("token", token);
  }
  return `http://${host}:${port}/api/fs/preview?${params.toString()}`;
}

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export function codemirrorMode(mode: EditorMode): string {
  switch (mode) {
    case "typescript":
      return "javascript";
    case "markdown":
      return "gfm";
    default:
      return mode;
  }
}
