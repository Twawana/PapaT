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
