import { useCallback, useEffect, useRef, useState } from "react";
import { papatClient } from "../services/websocket";
import { AgentChatMessage, AgentUiMessage, ServerMessage } from "../types/protocol";

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUiId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function historyToUi(messages: AgentChatMessage[]): AgentUiMessage[] {
  const items: AgentUiMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      items.push({
        id: createUiId("user"),
        kind: "user",
        content: message.content,
      });
    } else if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        for (const call of message.toolCalls) {
          const toolMsg = messages.find(
            (m) => m.role === "tool" && m.toolCallId === call.id
          );
          items.push({
            id: call.id,
            kind: "tool",
            name: call.name,
            args: call.arguments,
            result: toolMsg?.content,
            isError: toolMsg?.isError,
            status: "done",
          });
        }
      }
      if (message.content.trim()) {
        items.push({
          id: createUiId("assistant"),
          kind: "assistant",
          content: message.content,
        });
      }
    }
  }

  return items;
}

export function useAgentChat(isConnected: boolean) {
  const sessionIdRef = useRef(createSessionId());
  const [messages, setMessages] = useState<AgentUiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const assistantIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!isConnected) return;

    try {
      const result = await papatClient.getAgentHistory(sessionIdRef.current);
      setMessages(historyToUi(result.messages));
    } catch {
      // Fresh session is fine
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected) {
      loadHistory();
    } else {
      setMessages([]);
      setIsRunning(false);
    }
  }, [isConnected, loadHistory]);

  useEffect(() => {
    const sessionId = sessionIdRef.current;

    const removeListener = papatClient.addMessageListener((message: ServerMessage) => {
      if ("sessionId" in message && message.sessionId !== sessionId) {
        return;
      }

      switch (message.type) {
        case "agent_started":
          setIsRunning(true);
          assistantIdRef.current = null;
          break;

        case "agent_delta": {
          const assistantId = assistantIdRef.current;
          if (!assistantId) {
            const id = createUiId("assistant");
            assistantIdRef.current = id;
            setMessages((prev) => [
              ...prev,
              { id, kind: "assistant", content: message.content, streaming: true },
            ]);
          } else {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantId && item.kind === "assistant"
                  ? { ...item, content: message.content, streaming: true }
                  : item
              )
            );
          }
          break;
        }

        case "agent_tool_call":
          assistantIdRef.current = null;
          setMessages((prev) => [
            ...prev,
            {
              id: message.toolCallId,
              kind: "tool",
              name: message.name,
              args: message.args,
              status: "running",
            },
          ]);
          break;

        case "agent_tool_result":
          setMessages((prev) =>
            prev.map((item) =>
              item.id === message.toolCallId && item.kind === "tool"
                ? {
                    ...item,
                    result: message.result,
                    isError: message.isError,
                    status: "done",
                  }
                : item
            )
          );
          break;

        case "agent_done":
          setIsRunning(false);
          assistantIdRef.current = null;
          setMessages((prev) =>
            prev.map((item) =>
              item.kind === "assistant" ? { ...item, streaming: false } : item
            )
          );
          break;

        case "agent_error":
          setIsRunning(false);
          assistantIdRef.current = null;
          setMessages((prev) => [
            ...prev.map((item) =>
              item.kind === "assistant" ? { ...item, streaming: false } : item
            ),
            {
              id: createUiId("error"),
              kind: "error",
              content: message.message,
            },
          ]);
          break;
      }
    });

    return removeListener;
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !isConnected || isRunning) return;

    setMessages((prev) => [
      ...prev,
      { id: createUiId("user"), kind: "user", content: text },
    ]);
    setInput("");

    try {
      papatClient.sendAgentMessage(sessionIdRef.current, text);
      setIsRunning(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: createUiId("error"),
          kind: "error",
          content: err instanceof Error ? err.message : "Failed to send",
        },
      ]);
      setIsRunning(false);
    }
  }, [input, isConnected, isRunning]);

  const cancel = useCallback(() => {
    papatClient.cancelAgent(sessionIdRef.current);
    setIsRunning(false);
  }, []);

  const clearChat = useCallback(async () => {
    if (!isConnected) return;

    try {
      await papatClient.clearAgentHistory(sessionIdRef.current);
      setMessages([]);
      sessionIdRef.current = createSessionId();
    } catch {
      setMessages([]);
      sessionIdRef.current = createSessionId();
    }
  }, [isConnected]);

  return {
    messages,
    input,
    setInput,
    isRunning,
    sendMessage,
    cancel,
    clearChat,
  };
}
