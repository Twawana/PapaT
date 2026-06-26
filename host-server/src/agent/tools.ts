import {
  deletePath,
  listDirectory,
  mkdir,
  readFile,
  writeFile,
} from "../filesystem";
import { executeJavaScriptAsync } from "../executor";
import { runShellCommand } from "../command-executor";
import { getWorkspaceRoot } from "../workspace-state";

export interface ToolCallInput {
  name: string;
  arguments: Record<string, unknown>;
}

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description: "List files and folders in a workspace-relative directory",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: 'Relative path, use "." for workspace root',
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a text file from the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create or overwrite a file in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_path",
      description: "Delete a file or directory in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mkdir",
      description: "Create a directory in the workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_javascript",
      description:
        "Run JavaScript with Node.js in the workspace directory. Use to test code or debug.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript source code" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        "Run a shell command in the workspace (e.g. npm test, npm install, git status)",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
];

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

export async function executeTool(
  call: ToolCallInput,
  signal?: AbortSignal
): Promise<string> {
  const args = call.arguments ?? {};

  switch (call.name) {
    case "list_directory": {
      const entries = await listDirectory(asString(args.path ?? ".", "path"));
      if (entries.length === 0) {
        return "Directory is empty.";
      }
      return entries
        .map(
          (e) =>
            `${e.entryType === "directory" ? "[dir]" : "[file]"} ${e.path}${
              e.size !== undefined ? ` (${e.size} bytes)` : ""
            }`
        )
        .join("\n");
    }

    case "read_file": {
      const result = await readFile(asString(args.path, "path"));
      return result.content;
    }

    case "write_file": {
      const result = await writeFile(
        asString(args.path, "path"),
        asString(args.content, "content"),
        true
      );
      return `Wrote ${result.path} (${result.size} bytes)`;
    }

    case "delete_path": {
      const result = await deletePath(asString(args.path, "path"));
      return `Deleted ${result.path}`;
    }

    case "mkdir": {
      const result = await mkdir(asString(args.path, "path"));
      return `Created directory ${result.path}`;
    }

    case "run_javascript": {
      const result = await executeJavaScriptAsync(
        asString(args.code, "code"),
        signal
      );
      return formatCommandOutput(result.stdout, result.stderr, result.exitCode);
    }

    case "run_command": {
      const result = await runShellCommand(asString(args.command, "command"), signal);
      return formatCommandOutput(result.stdout, result.stderr, result.exitCode);
    }

    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

function formatCommandOutput(
  stdout: string,
  stderr: string,
  exitCode: number | null
): string {
  const parts: string[] = [];
  if (stdout.trim()) {
    parts.push(`stdout:\n${stdout.trimEnd()}`);
  }
  if (stderr.trim()) {
    parts.push(`stderr:\n${stderr.trimEnd()}`);
  }
  parts.push(`exit code: ${exitCode ?? "null"}`);
  return parts.join("\n\n");
}

export function buildSystemPrompt(): string {
  return [
    "You are PapaT, an AI coding agent running on the user's PC.",
    `Workspace root: ${getWorkspaceRoot()}`,
    "You can create and modify files, run shell commands, and execute JavaScript to debug issues.",
    "Always use relative paths from the workspace root for file tools.",
    "When debugging, read relevant files first, make focused changes, then run tests or scripts to verify.",
    "Explain what you did briefly after completing the task.",
  ].join("\n");
}
