import { useCallback, useEffect, useRef, useState } from "react";
import { papatClient } from "../services/websocket";
import {
  createSessionId,
  loadActiveSessionId,
  loadSavedSessions,
  mergeSessionLists,
  removeSession,
  saveActiveSessionId,
  saveSessions,
  sessionTitleFromMessage,
  upsertSession,
} from "../services/chatSessions";
import {
  AgentChatMessage,
  AgentSessionSummary,
  AgentUiMessage,
  ServerMessage,
} from "../types/protocol";

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

export function useAgentChat(isConnected: boolean, onError?: (message: string | null) => void) {
  const sessionIdRef = useRef<string>(createSessionId());
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(sessionIdRef.current);
  const [messages, setMessages] = useState<AgentUiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const assistantIdRef = useRef<string | null>(null);
  const sessionsLoadedRef = useRef(false);

  const persistSessions = useCallback(async (nextSessions: AgentSessionSummary[]) => {
    setSessions(nextSessions);
    await saveSessions(nextSessions);
  }, []);

  const loadHistory = useCallback(async (sessionId = sessionIdRef.current) => {
    if (!isConnected) return;

    try {
      const result = await papatClient.getAgentHistory(sessionId);
      if (sessionId === sessionIdRef.current) {
        setMessages(historyToUi(result.messages));
      }
    } catch {
      if (sessionId === sessionIdRef.current) {
        setMessages([]);
      }
    }
  }, [isConnected]);

  const refreshSessions = useCallback(async () => {
    const local = await loadSavedSessions();

    if (!isConnected) {
      await persistSessions(local);
      return local;
    }

    try {
      const result = await papatClient.listAgentSessions();
      const merged = mergeSessionLists(local, result.sessions);
      await persistSessions(merged);
      return merged;
    } catch {
      await persistSessions(local);
      return local;
    }
  }, [isConnected, persistSessions]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const savedSessions = await loadSavedSessions();
      const savedActiveId = await loadActiveSessionId();
      const initialId =
        savedActiveId && savedSessions.some((s) => s.sessionId === savedActiveId)
          ? savedActiveId
          : savedSessions[0]?.sessionId ?? createSessionId();

      if (cancelled) return;

      sessionIdRef.current = initialId;
      setActiveSessionId(initialId);
      setSessions(savedSessions);
      sessionsLoadedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !sessionsLoadedRef.current) {
      if (!isConnected) {
        setIsRunning(false);
      }
      return;
    }

    void (async () => {
      await refreshSessions();
      await loadHistory();
    })();
  }, [isConnected, loadHistory, refreshSessions]);

  useEffect(() => {
    const removeListener = papatClient.addMessageListener((message: ServerMessage) => {
      const sessionId = sessionIdRef.current;
      if ("sessionId" in message && message.sessionId !== sessionId) {
        return;
      }

      switch (message.type) {
        case "agent_started":
          setIsRunning(true);
          assistantIdRef.current = null;
          setMessages((prev) => {
            if (prev.some((item) => item.kind === "assistant" && item.streaming)) {
              return prev;
            }
            const id = createUiId("assistant");
            assistantIdRef.current = id;
            return [
              ...prev,
              { id, kind: "assistant", content: "", streaming: true },
            ];
          });
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
          setMessages((prev) => {
            const toolId = message.toolCallId || createUiId("tool");
            const existing = prev.findIndex(
              (item) => item.id === toolId && item.kind === "tool"
            );
            if (existing >= 0) {
              return prev.map((item, index) =>
                index === existing && item.kind === "tool"
                  ? {
                      ...item,
                      name: message.name,
                      args: message.args,
                      status: "running" as const,
                    }
                  : item
              );
            }
            return [
              ...prev,
              {
                id: toolId,
                kind: "tool",
                name: message.name,
                args: message.args,
                status: "running" as const,
              },
            ];
          });
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
          void loadHistory();
          void refreshSessions();
          break;

        case "agent_error":
          setIsRunning(false);
          assistantIdRef.current = null;
          onError?.(message.message);
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
  }, [loadHistory, onError, refreshSessions]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current || isRunning) {
        return;
      }

      sessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      setInput("");
      setIsRunning(false);
      assistantIdRef.current = null;
      await saveActiveSessionId(sessionId);
      await loadHistory(sessionId);
    },
    [isRunning, loadHistory]
  );

  const newChat = useCallback(async () => {
    if (isRunning) return;

    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    setMessages([]);
    setInput("");
    assistantIdRef.current = null;
    await saveActiveSessionId(sessionId);
  }, [isRunning]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !isConnected || isRunning) return;

    const sessionId = sessionIdRef.current;
    const now = Date.now();
    const summary: AgentSessionSummary = {
      sessionId,
      title: sessionTitleFromMessage(text),
      updatedAt: now,
      messageCount: messages.filter((item) => item.kind === "user").length + 1,
    };

    void persistSessions(upsertSession(sessions, summary));

    setMessages((prev) => [
      ...prev,
      { id: createUiId("user"), kind: "user", content: text },
    ]);
    setInput("");

    try {
      papatClient.sendAgentMessage(sessionId, text);
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
  }, [input, isConnected, isRunning, messages, persistSessions, sessions]);

  const cancel = useCallback(() => {
    papatClient.cancelAgent(sessionIdRef.current);
    setIsRunning(false);
  }, []);

  const clearChat = useCallback(async () => {
    if (!isConnected || isRunning) return;

    const sessionId = sessionIdRef.current;

    try {
      await papatClient.clearAgentHistory(sessionId);
    } catch {
      // Local reset still applies
    }

    const nextSessions = removeSession(sessions, sessionId);
    await persistSessions(nextSessions);

    const nextId = createSessionId();
    sessionIdRef.current = nextId;
    setActiveSessionId(nextId);
    setMessages([]);
    setInput("");
    await saveActiveSessionId(nextId);
  }, [isConnected, isRunning, persistSessions, sessions]);

  return {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    isRunning,
    sendMessage,
    cancel,
    clearChat,
    newChat,
    selectSession,
  };
}
