import { config } from "../../config";
import { getOpenAiApiKey, credentialHint } from "../agent-credentials";
import { getSession, setSessionRunning, touchSessionMessages } from "../session-store";
import { callLlm, OpenAiContentPart, OpenAiMessage } from "../llm";
import { buildSystemPrompt, executeTool } from "../tools";
import { readImageDataUri } from "../attachments";
import { AgentChatMessage } from "../../protocol";
import { AgentProviderDefinition, AgentProviderRunContext } from "./types";

function buildOpenAiUserContent(
  message: AgentChatMessage,
  images: Array<{ mimeType: string; dataUri: string }>
): string | OpenAiContentPart[] {
  const text = message.content.trim();
  const attachmentNote = message.attachments?.length
    ? `\n\n[Attached files on PC: ${message.attachments
        .map((item) => `${item.name} (${item.kind}) @ ${item.path}`)
        .join("; ")}]`
    : "";

  if (images.length === 0) {
    return `${text}${attachmentNote}`;
  }

  const parts: OpenAiContentPart[] = [{ type: "text", text: `${text}${attachmentNote}` }];
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.dataUri } });
  }
  return parts;
}

function toLlmMessages(messages: AgentChatMessage[]): OpenAiMessage[] {
  const llmMessages: OpenAiMessage[] = [{ role: "system", content: buildSystemPrompt() }];

  for (const message of messages) {
    if (message.role === "user") {
      const images =
        message.attachments
          ?.filter((item) => item.kind === "image")
          .map((item) => {
            const dataUri = readImageDataUri(item.path, item.mimeType);
            return dataUri ? { mimeType: item.mimeType, dataUri } : null;
          })
          .filter((item): item is { mimeType: string; dataUri: string } => item !== null) ??
        [];

      llmMessages.push({
        role: "user",
        content: buildOpenAiUserContent(message, images),
      });
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

async function runOpenAiTurn(ctx: AgentProviderRunContext): Promise<void> {
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

  if (!config.llmApiKey) {
    emit({
      type: "agent_error",
      id: requestId,
      sessionId,
      message: "No API key configured. Set OPENAI_API_KEY on the host server.",
    });
    return;
  }

  const abortController = new AbortController();
  setSessionRunning(sessionId, true, abortController);

  const session = getSession(sessionId);
  if (!ctx.skipUserMessage) {
    session.messages.push({
      role: "user",
      content: prepared.displayText,
      attachments: prepared.attachmentRefs.length ? prepared.attachmentRefs : undefined,
      timestamp: Date.now(),
    });
    touchSessionMessages(sessionId);
  }

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
        touchSessionMessages(sessionId);
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

export const openaiProvider: AgentProviderDefinition = {
  id: "openai",
  label: "OpenAI",
  description: "OpenAI API with Titus tools",
  async probe() {
    const installed = true;
    const apiKey = getOpenAiApiKey();
    const authenticated = !!apiKey;
    const hint = credentialHint("openai");
    const baseMessage = authenticated
      ? `Model: ${config.llmModel}`
      : "Set an OpenAI API key on your phone or OPENAI_API_KEY on the host";
    return {
      id: "openai",
      label: "OpenAI",
      description: "OpenAI API with Titus tools",
      installed,
      authenticated,
      statusMessage: hint ? `${baseMessage} · ${hint}` : baseMessage,
    };
  },
  runTurn: runOpenAiTurn,
};
