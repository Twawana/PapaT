import { config } from "../config";
import { TOOL_DEFINITIONS } from "./tools";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmResponse {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OpenAiContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export async function callLlm(
  messages: OpenAiMessage[],
  signal?: AbortSignal
): Promise<LlmResponse> {
  if (!config.llmApiKey) {
    throw new Error(
      "No API key configured. Set OPENAI_API_KEY on the host server."
    );
  }

  if (config.llmProvider !== "openai") {
    throw new Error(`Unsupported LLM provider: ${config.llmProvider}`);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llmModel,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const message = data.choices[0]?.message;
  if (!message) {
    throw new Error("LLM returned no message");
  }

  const toolCalls: LlmToolCall[] = (message.tool_calls ?? []).map((call) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return {
      id: call.id,
      name: call.function.name,
      arguments: parsed,
    };
  });

  return {
    content: message.content,
    toolCalls,
  };
}
