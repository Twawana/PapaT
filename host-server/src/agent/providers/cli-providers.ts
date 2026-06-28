import { config } from "../../config";
import { getWorkspaceRoot } from "../../workspace-state";
import {
  checkCursorAuth,
  createCursorChat,
  isAgentInstalled,
  resolveAgentCommand,
  runCursorAgent,
} from "../cursor-cli";
import {
  cancelSession,
  getCursorChatId,
  getSession,
  setCursorChatId,
  setSessionChild,
  setSessionRunning,
} from "../session-store";
import { findCommandOnPath, looksUnauthenticated, runCli } from "./cli-utils";
import { AgentProviderDefinition, AgentProviderRunContext } from "./types";

const AUTH_CACHE_TTL_MS = 10 * 60 * 1000;
let authCache: { ok: boolean; message: string; expiresAt: number } | null = null;

function cacheAuth(ok: boolean, message: string): void {
  authCache = ok
    ? { ok: true, message, expiresAt: Date.now() + AUTH_CACHE_TTL_MS }
    : null;
}

async function runCursorTurn(ctx: AgentProviderRunContext): Promise<void> {
  const { sessionId, prepared, requestId, emit } = ctx;

  if (getSession(sessionId).running) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "Agent is already running for this session",
    });
    return;
  }

  const abortController = new AbortController();
  setSessionRunning(sessionId, true, abortController);

  const session = getSession(sessionId);
  session.messages.push({
    role: "user",
    content: prepared.displayText,
    attachments: prepared.attachmentRefs.length ? prepared.attachmentRefs : undefined,
    timestamp: Date.now(),
  });

  emit({ type: "agent_started", id: requestId, sessionId });

  let fullText = "";

  try {
    const auth = await checkCursorAuth(abortController.signal);
    if (!auth.ok) {
      throw new Error(auth.message);
    }

    let chatId = getCursorChatId(sessionId);
    if (!chatId) {
      chatId = await createCursorChat(abortController.signal);
      setCursorChatId(sessionId, chatId);
    }

    const content = await runCursorAgent({
      prompt: prepared.cursorPrompt,
      workspace: getWorkspaceRoot(),
      chatId,
      signal: abortController.signal,
      registerChild: (child) => setSessionChild(sessionId, child),
      onStreamEvent: (event) => {
        if (event.kind === "text" && event.text) {
          fullText = event.text;
          emit({ type: "agent_delta", sessionId, content: fullText });
          return;
        }

        if (event.kind === "tool_call" && event.toolCallId && event.name) {
          emit({
            type: "agent_tool_call",
            sessionId,
            toolCallId: event.toolCallId,
            name: event.name,
            args: event.args ?? {},
          });
          return;
        }

        if (event.kind === "tool_result" && event.toolCallId && event.name) {
          emit({
            type: "agent_tool_result",
            sessionId,
            toolCallId: event.toolCallId,
            name: event.name,
            result: event.result ?? "",
            isError: event.isError ?? false,
          });
        }
      },
    });

    const finalContent = content.trim() || fullText.trim() || "Done.";
    session.messages.push({
      role: "assistant",
      content: finalContent,
      timestamp: Date.now(),
    });

    if (!fullText.trim()) {
      emit({ type: "agent_delta", sessionId, content: finalContent });
    }

    emit({ type: "agent_done", id: requestId, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent failed";
    emit({ type: "agent_error", id: requestId, sessionId, message });
  } finally {
    setSessionChild(sessionId, null);
    setSessionRunning(sessionId, false, null);
  }
}

export const cursorProvider: AgentProviderDefinition = {
  id: "cursor",
  label: "Cursor",
  description: "Cursor Agent CLI logged in on this PC",
  async probe(options) {
    if (!options?.force && authCache && authCache.ok && Date.now() < authCache.expiresAt) {
      return {
        id: "cursor",
        label: "Cursor",
        description: "Cursor Agent CLI logged in on this PC",
        installed: true,
        authenticated: true,
        statusMessage: authCache.message,
      };
    }

    if (!isAgentInstalled()) {
      return {
        id: "cursor",
        label: "Cursor",
        description: "Cursor Agent CLI logged in on this PC",
        installed: false,
        authenticated: false,
        statusMessage: "Cursor CLI not installed",
      };
    }

    const auth = await checkCursorAuth(undefined, { force: options?.force });
    cacheAuth(auth.ok, auth.message);
    return {
      id: "cursor",
      label: "Cursor",
      description: "Cursor Agent CLI logged in on this PC",
      installed: true,
      authenticated: auth.ok,
      statusMessage: auth.message,
    };
  },
  runTurn: runCursorTurn,
};

export const claudeProvider: AgentProviderDefinition = {
  id: "claude",
  label: "Claude Code",
  description: "Anthropic Claude Code CLI",
  async probe() {
    const command = findCommandOnPath(["claude"]);
    if (!command) {
      return {
        id: "claude",
        label: "Claude Code",
        description: "Anthropic Claude Code CLI",
        installed: false,
        authenticated: false,
        statusMessage: "Claude Code CLI not installed",
      };
    }

    try {
      const { stdout, stderr, code } = await runCli(command, ["--version"], {
        timeoutMs: 15_000,
      });
      const version = `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] || "installed";

      const authCheck = await runCli(
        command,
        [
          "-p",
          "Reply with exactly: ok",
          "--bare",
          "--output-format",
          "text",
          "--max-turns",
          "1",
          "--allowedTools",
          "",
        ],
        { timeoutMs: 45_000 }
      );
      const authOutput = `${authCheck.stdout}\n${authCheck.stderr}`.trim();
      const authenticated = !looksUnauthenticated(authOutput, authCheck.code);

      return {
        id: "claude",
        label: "Claude Code",
        description: "Anthropic Claude Code CLI",
        installed: true,
        authenticated,
        statusMessage: authenticated
          ? version
          : authOutput || "Run `claude login` on your PC",
      };
    } catch (err) {
      return {
        id: "claude",
        label: "Claude Code",
        description: "Anthropic Claude Code CLI",
        installed: true,
        authenticated: false,
        statusMessage: err instanceof Error ? err.message : "Claude CLI unavailable",
      };
    }
  },
  runTurn: async (ctx) => {
    const command = findCommandOnPath(["claude"]);
    if (!command) {
      ctx.emit({
        type: "agent_error",
        id: ctx.requestId,
        sessionId: ctx.sessionId,
        message: "Claude Code CLI not installed",
      });
      return;
    }

    await runGenericCliTurn(ctx, command, (prompt) => [
      "-p",
      prompt,
      "--bare",
      "--output-format",
      "text",
      "--allowedTools",
      "Read,Edit,Bash",
      "--permission-mode",
      "acceptEdits",
    ]);
  },
};

export const copilotProvider: AgentProviderDefinition = {
  id: "copilot",
  label: "GitHub Copilot",
  description: "GitHub Copilot CLI",
  async probe() {
    const command = findCommandOnPath(["copilot"]);
    if (!command) {
      return {
        id: "copilot",
        label: "GitHub Copilot",
        description: "GitHub Copilot CLI",
        installed: false,
        authenticated: false,
        statusMessage: "Copilot CLI not installed. Install from GitHub Copilot CLI docs.",
      };
    }

    try {
      const { stdout, stderr, code } = await runCli(command, ["--version"], {
        timeoutMs: 15_000,
      });
      const version = `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] || "installed";
      const authCheck = await runCli(
        command,
        ["-p", "Reply with exactly: ok", "-s", "--no-ask-user"],
        { timeoutMs: 45_000 }
      );
      const authOutput = `${authCheck.stdout}\n${authCheck.stderr}`.trim();
      const authenticated = !looksUnauthenticated(authOutput, authCheck.code);

      return {
        id: "copilot",
        label: "GitHub Copilot",
        description: "GitHub Copilot CLI",
        installed: true,
        authenticated,
        statusMessage: authenticated
          ? version
          : authOutput || "Sign in to GitHub Copilot CLI on your PC",
      };
    } catch (err) {
      return {
        id: "copilot",
        label: "GitHub Copilot",
        description: "GitHub Copilot CLI",
        installed: true,
        authenticated: false,
        statusMessage: err instanceof Error ? err.message : "Copilot CLI unavailable",
      };
    }
  },
  runTurn: async (ctx) => {
    const command = findCommandOnPath(["copilot"]);
    if (!command) {
      ctx.emit({
        type: "agent_error",
        id: ctx.requestId,
        sessionId: ctx.sessionId,
        message: "GitHub Copilot CLI not installed",
      });
      return;
    }

    await runGenericCliTurn(ctx, command, (prompt) => [
      "-p",
      prompt,
      "-s",
      "--no-ask-user",
      "--allow-all-tools",
    ]);
  },
};

export const augmentProvider: AgentProviderDefinition = {
  id: "augment",
  label: "Augment",
  description: "Augment Auggie CLI",
  async probe() {
    const command = findCommandOnPath(["auggie"]);
    if (!command) {
      return {
        id: "augment",
        label: "Augment",
        description: "Augment Auggie CLI",
        installed: false,
        authenticated: false,
        statusMessage: "Auggie CLI not installed",
      };
    }

    try {
      const { stdout, stderr } = await runCli(command, ["--version"], {
        timeoutMs: 15_000,
      });
      const version = `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] || "installed";
      const authCheck = await runCli(
        command,
        ["--print", "--quiet", "Reply with exactly: ok"],
        { timeoutMs: 45_000 }
      );
      const authOutput = `${authCheck.stdout}\n${authCheck.stderr}`.trim();
      const authenticated = !looksUnauthenticated(authOutput, authCheck.code);

      return {
        id: "augment",
        label: "Augment",
        description: "Augment Auggie CLI",
        installed: true,
        authenticated,
        statusMessage: authenticated
          ? version
          : authOutput || "Run `auggie login` on your PC",
      };
    } catch (err) {
      return {
        id: "augment",
        label: "Augment",
        description: "Augment Auggie CLI",
        installed: true,
        authenticated: false,
        statusMessage: err instanceof Error ? err.message : "Auggie CLI unavailable",
      };
    }
  },
  runTurn: async (ctx) => {
    const command = findCommandOnPath(["auggie"]);
    if (!command) {
      ctx.emit({
        type: "agent_error",
        id: ctx.requestId,
        sessionId: ctx.sessionId,
        message: "Auggie CLI not installed",
      });
      return;
    }

    await runGenericCliTurn(ctx, command, (prompt) => ["--print", prompt]);
  },
};

async function runGenericCliTurn(
  ctx: AgentProviderRunContext,
  command: string,
  buildArgs: (prompt: string) => string[]
): Promise<void> {
  const { sessionId, prepared, requestId, emit } = ctx;

  if (getSession(sessionId).running) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "Agent is already running for this session",
    });
    return;
  }

  const abortController = new AbortController();
  setSessionRunning(sessionId, true, abortController);

  const session = getSession(sessionId);
  session.messages.push({
    role: "user",
    content: prepared.displayText,
    attachments: prepared.attachmentRefs.length ? prepared.attachmentRefs : undefined,
    timestamp: Date.now(),
  });

  emit({ type: "agent_started", id: requestId, sessionId });

  let fullText = "";

  try {
    const { runStreamingTextAgent } = await import("./cli-utils");
    const content = await runStreamingTextAgent({
      command,
      args: buildArgs(prepared.cursorPrompt),
      workspace: getWorkspaceRoot(),
      signal: abortController.signal,
      registerChild: (child) => setSessionChild(sessionId, child),
      onStreamEvent: (event) => {
        if (event.kind === "text" && event.text) {
          fullText = event.text;
          emit({ type: "agent_delta", sessionId, content: fullText });
        }
      },
    });

    const finalContent = content.trim() || fullText.trim() || "Done.";
    session.messages.push({
      role: "assistant",
      content: finalContent,
      timestamp: Date.now(),
    });

    if (!fullText.trim()) {
      emit({ type: "agent_delta", sessionId, content: finalContent });
    }

    emit({ type: "agent_done", id: requestId, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent failed";
    emit({ type: "agent_error", id: requestId, sessionId, message });
  } finally {
    setSessionChild(sessionId, null);
    setSessionRunning(sessionId, false, null);
  }
}
