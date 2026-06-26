import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type EditorId = "cursor" | "vscode";

const WINDOWS_CANDIDATES: Record<EditorId, string[]> = {
  cursor: [
    "cursor",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "cursor", "Cursor.exe"),
  ],
  vscode: [
    "code",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
  ],
};

function resolveEditorCommand(editor: EditorId): string {
  const candidates = WINDOWS_CANDIDATES[editor];

  if (process.platform === "win32") {
    for (const candidate of candidates) {
      if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return candidates[0];
}

export function launchEditor(editor: EditorId, folderPath: string): void {
  const resolved = path.resolve(folderPath);
  const command = resolveEditorCommand(editor);

  const child = spawn(command, [resolved], {
    detached: true,
    stdio: "ignore",
    shell: true,
    cwd: resolved,
    windowsHide: true,
  });

  child.on("error", () => {
    throw new Error(
      `Failed to launch ${editor}. Install the "${command}" command or desktop app.`
    );
  });

  child.unref();
}
