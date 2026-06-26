import { AgentChatMessage, ServerMessage } from "../protocol";
import { config } from "../config";
import { getWorkspaceRoot } from "../workspace-state";
import {
  checkCursorAuth,
  createCursorChat,
  runCursorAgent,
} from "./cursor-cli";
import { callLlm, OpenAiMessage } from "./llm";
import {
  cancelSession,
  getCursorChatId,
  getSession,
  getSessionHistory,
  setCursorChatId,
  setSessionChild,
  setSessionRunning,
} from "./session-store";
import { buildSystemPrompt, executeTool } from "./tools";

export type AgentEmit = (message: ServerMessage) => void;

function toUiMessages(sessionId: string, messages: AgentChatMessage[]): AgentChatMessage[] {
  return messages.filter((m) => m.role !== "system");
}

function toLlmMessages(messages: AgentChatMessage[]): OpenAiMessage[] {
  const llmMessages: OpenAiMessage[] = [
    { role: "system", content: buildSystemPrompt() },
  ];

  for (const message of messages) {
    if (message.role === "user") {
      llmMessages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        llmMessages.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        });
      } else {
        llmMessages.push({ role: "assistant", content: message.content });
      }
    } else if (message.role === "tool") {
      if (!message.toolCallId) continue;
      llmMessages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }

  return llmMessages;
}

export async function runAgentTurn(
  sessionId: string,
  userMessage: string,
  requestId: string,
  emit: AgentEmit
): Promise<void> {
  if (config.llmProvider === "cursor") {
    return runCursorAgentTurn(sessionId, userMessage, requestId, emit);
  }

  return runOpenAiAgentTurn(sessionId, userMessage, requestId, emit);
}

async function runCursorAgentTurn(
  sessionId: string,
  userMessage: string,
  requestId: string,
  emit: AgentEmit
): Promise<void> {
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
    content: userMessage,
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
      prompt: userMessage,
      workspace: getWorkspaceRoot(),
      chatId,
      signal: abortController.signal,
      registerChild: (child) => setSessionChild(sessionId, child),
      onStreamEvent: (event) => {
        if (event.kind === "text" && event.text) {
          fullText += event.text;
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

async function runOpenAiAgentTurn(
  sessionId: string,
  userMessage: string,
  requestId: string,
  emit: AgentEmit
): Promise<void> {
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
    content: userMessage,
    timestamp: Date.now(),
  });

  emit({ type: "agent_started", id: requestId, sessionId });

  try {
    for (let turn = 0; turn < config.agentMaxTurns; turn++) {
      if (abortController.signal.aborted) {
        throw new Error("Agent cancelled");
      }

      const response = await callLlm(toLlmMessages(session.messages), abortController.signal);

      if (response.toolCalls.length === 0) {
        const content = response.content?.trim() || "Done.";
        session.messages.push({
          role: "assistant",
          content,
          timestamp: Date.now(),
        });
        emit({ type: "agent_delta", sessionId, content });
        emit({ type: "agent_done", id: requestId, sessionId });
        return;
      }

      session.messages.push({
        role: "assistant",
        content: response.content || "",
        toolCalls: response.toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        })),
        timestamp: Date.now(),
      });

      if (response.content?.trim()) {
        emit({ type: "agent_delta", sessionId, content: response.content });
      }

      for (const toolCall of response.toolCalls) {
        emit({
          type: "agent_tool_call",
          sessionId,
          toolCallId: toolCall.id,
          name: toolCall.name,
          args: toolCall.arguments,
        });

        let result: string;
        let isError = false;

        try {
          result = await executeTool(
            { name: toolCall.name, arguments: toolCall.arguments },
            abortController.signal
          );
        } catch (err) {
          isError = true;
          result = err instanceof Error ? err.message : "Tool execution failed";
        }

        session.messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: result,
          isError,
          timestamp: Date.now(),
        });

        emit({
          type: "agent_tool_result",
          sessionId,
          toolCallId: toolCall.id,
          name: toolCall.name,
          result,
          isError,
        });
      }
    }

    throw new Error(`Agent exceeded ${config.agentMaxTurns} turns`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent failed";
    emit({ type: "agent_error", id: requestId, sessionId, message });
  } finally {
    setSessionRunning(sessionId, false, null);
  }
}

export function getAgentHistory(sessionId: string): AgentChatMessage[] {
  return toUiMessages(sessionId, getSessionHistory(sessionId));
}

export function cancelAgent(sessionId: string): boolean {
  return cancelSession(sessionId);
}

export function clearAgentSession(sessionId: string): void {
  cancelSession(sessionId);
  getSession(sessionId).messages.length = 0;
}
