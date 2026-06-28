import { spawnSync } from "child_process";
import { getWorkspaceRoot } from "./workspace-state";

export interface GitFileStatus {
  path: string;
  index: string;
  working: string;
}

export interface GitStatusResult {
  branch: string;
  isRepo: boolean;
  clean: boolean;
  files: GitFileStatus[];
  ahead?: number;
  behind?: number;
}

function runGit(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 4_000_000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export function gitStatus(): GitStatusResult {
  const cwd = getWorkspaceRoot();
  const inside = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || inside.stdout !== "true") {
    return { branch: "", isRepo: false, clean: true, files: [] };
  }

  const branchResult = runGit(["branch", "--show-current"], cwd);
  const branch = branchResult.stdout || "HEAD";

  const porcelain = runGit(["status", "--porcelain=1", "-b"], cwd);
  const files: GitFileStatus[] = [];
  let ahead = 0;
  let behind = 0;

  for (const line of porcelain.stdout.split(/\r?\n/)) {
    if (line.startsWith("##")) {
      const match = line.match(/\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)(?:, ahead (\d+))?\]/);
      if (match) {
        ahead = Number(match[1] ?? match[4] ?? 0);
        behind = Number(match[2] ?? match[3] ?? 0);
      }
      continue;
    }
    if (line.length < 4) continue;
    files.push({
      index: line[0] ?? " ",
      working: line[1] ?? " ",
      path: line.slice(3).trim().replace(/^"(.*)"$/, "$1"),
    });
  }

  return {
    branch,
    isRepo: true,
    clean: files.length === 0,
    files,
    ahead,
    behind,
  };
}

export function gitDiff(pathArg?: string): string {
  const cwd = getWorkspaceRoot();
  const args = pathArg ? ["diff", "--", pathArg] : ["diff"];
  const result = runGit(args, cwd);
  if (!result.ok && result.stderr) {
    throw new Error(result.stderr);
  }
  return result.stdout || "(no changes)";
}

export function gitAdd(paths: string[]): void {
  const cwd = getWorkspaceRoot();
  const args = paths.length === 0 ? ["add", "-A"] : ["add", ...paths];
  const result = runGit(args, cwd);
  if (!result.ok) {
    throw new Error(result.stderr || "git add failed");
  }
}

export function gitCommit(message: string): string {
  const cwd = getWorkspaceRoot();
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Commit message is required");
  }
  const result = runGit(["commit", "-m", trimmed], cwd);
  if (!result.ok) {
    throw new Error(result.stderr || "git commit failed");
  }
  return result.stdout || "Committed";
}

function formatGitOutput(result: { ok: boolean; stdout: string; stderr: string }, fallback: string): string {
  const text = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (!result.ok) {
    throw new Error(text || fallback);
  }
  return text || fallback;
}

const BRANCH_RE = /^[a-zA-Z0-9/._-]+$/;

function assertBranchName(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed) {
    throw new Error("Branch name is required");
  }
  if (!BRANCH_RE.test(trimmed)) {
    throw new Error("Invalid branch name");
  }
  return trimmed;
}

export function gitPull(): string {
  const cwd = getWorkspaceRoot();
  return formatGitOutput(runGit(["pull"], cwd), "Pull complete");
}

export function gitPush(): string {
  const cwd = getWorkspaceRoot();
  return formatGitOutput(runGit(["push"], cwd), "Push complete");
}

export function gitCheckout(branch: string, create = false): string {
  const cwd = getWorkspaceRoot();
  const name = assertBranchName(branch);
  const args = create ? ["checkout", "-b", name] : ["checkout", name];
  return formatGitOutput(runGit(args, cwd), `Checked out ${name}`);
}

export function gitLog(limit = 10): string {
  const cwd = getWorkspaceRoot();
  const count = Math.min(Math.max(Math.floor(limit), 1), 100);
  const result = runGit(["log", "--oneline", `-n`, String(count)], cwd);
  return formatGitOutput(result, "(no commits)");
}

export function gitStash(message?: string): string {
  const cwd = getWorkspaceRoot();
  const trimmed = message?.trim();
  const args = trimmed ? ["stash", "push", "-m", trimmed] : ["stash", "push"];
  return formatGitOutput(runGit(args, cwd), "Stash saved");
}

export function gitMerge(branch: string): string {
  const cwd = getWorkspaceRoot();
  const name = assertBranchName(branch);
  return formatGitOutput(runGit(["merge", name], cwd), `Merged ${name}`);
}
