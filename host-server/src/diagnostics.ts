import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getWorkspaceRoot } from "./workspace-state";

export interface DiagnosticItem {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
}

export function runDiagnostics(): DiagnosticItem[] {
  const root = getWorkspaceRoot();
  const items: DiagnosticItem[] = [];

  const tsconfig = path.join(root, "tsconfig.json");
  if (fs.existsSync(tsconfig)) {
    items.push(...runTsc(root));
  }

  const eslintConfig = ["eslint.config.js", "eslint.config.mjs", ".eslintrc.json", ".eslintrc.js"]
    .map((name) => path.join(root, name))
    .find((p) => fs.existsSync(p));

  if (eslintConfig) {
    items.push(...runEslint(root));
  }

  return items;
}

function runTsc(root: string): DiagnosticItem[] {
  const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const cmd = fs.existsSync(tscBin) ? process.execPath : "npx";
  const args = fs.existsSync(tscBin)
    ? [tscBin, "--noEmit", "--pretty", "false"]
    : ["tsc", "--noEmit", "--pretty", "false"];

  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 4_000_000,
    windowsHide: true,
  });

  return parseTscOutput(result.stdout + "\n" + result.stderr, root);
}

function parseTscOutput(output: string, root: string): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  const re = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.*)$/;

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(re);
    if (!match) continue;
    const abs = match[1]!;
    const rel = path.isAbsolute(abs)
      ? path.relative(root, abs).replace(/\\/g, "/")
      : abs.replace(/\\/g, "/");
    items.push({
      file: rel,
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4] as "error" | "warning",
      message: match[5]!,
      source: "typescript",
    });
  }
  return items;
}

function runEslint(root: string): DiagnosticItem[] {
  const result = spawnSync("npx", ["eslint", ".", "-f", "json"], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 4_000_000,
    windowsHide: true,
    shell: process.platform === "win32",
  });

  if (!result.stdout) return [];

  try {
    const reports = JSON.parse(result.stdout) as Array<{
      filePath: string;
      messages: Array<{
        line: number;
        column: number;
        severity: number;
        message: string;
      }>;
    }>;

    const items: DiagnosticItem[] = [];
    for (const report of reports) {
      const rel = path.relative(root, report.filePath).replace(/\\/g, "/");
      for (const msg of report.messages) {
        items.push({
          file: rel,
          line: msg.line,
          column: msg.column,
          severity: msg.severity === 2 ? "error" : "warning",
          message: msg.message,
          source: "eslint",
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}
