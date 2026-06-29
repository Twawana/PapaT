import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { titusClient } from "../services/websocket";
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
  MAX_ATTACHMENTS,
  PendingAgentAttachment,
  showAttachmentPicker,
  toWirePayload,
} from "../services/agentAttachments";
import {
  AgentChatMessage,
  AgentSessionSummary,
  AgentUiMessage,
  ServerMessage,
} from "../types/protocol";
import { errorMessage, runSyncSafely } from "../utils/errors";

function createUiId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function historyToUi(messages: AgentChatMessage[]): AgentUiMessage[] {
  const items: AgentUiMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;

    if (message.role === "user") {
      items.push({
        id: `hist-user-${i}`,
        kind: "user",
        content: message.content,
        attachments: message.attachments,
      });
    } else if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        for (const call of message.toolCalls) {
          const toolMsg = messages.find(
            (m) => m.role === "tool" && m.toolCallId === call.id
          );
          items.push({
            id: call.id || `hist-tool-${i}-${call.name}`,
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
          id: `hist-assistant-${i}`,
          kind: "assistant",
          content: message.content,
        });
      }
    } else if (message.role === "tool" && message.toolCallId) {
      const already = items.some(
        (item) => item.kind === "tool" && item.id === message.toolCallId
      );
      if (!already) {
        items.push({
          id: message.toolCallId,
          kind: "tool",
          name: message.name ?? "tool",
          result: message.content,
          isError: message.isError,
          status: "done",
        });
      }
    }
  }

  return items;
}

function safeHistoryToUi(messages: AgentChatMessage[]): AgentUiMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return runSyncSafely(() => historyToUi(messages), []);
}

export function useAgentChat(isConnected: boolean, onError?: (message: string | null) => void) {
  const sessionIdRef = useRef<string>(createSessionId());
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(sessionIdRef.current);
  const [messages, setMessages] = useState<AgentUiMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAgentAttachment[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningOnPc, setRunningOnPc] = useState(false);
  const [tryAgainPrompt, setTryAgainPrompt] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const sessionsLoadedRef = useRef(false);
  const wasRunningOnDisconnectRef = useRef(false);

  const persistSessions = useCallback(async (nextSessions: AgentSessionSummary[]) => {
    setSessions(nextSessions);
    try {
      await saveSessions(nextSessions);
    } catch (err) {
      console.error("[Titus] Failed to persist chat sessions", err);
    }
  }, []);

  const loadHistory = useCallback(async (sessionId = sessionIdRef.current) => {
    if (!isConnected) return;

    try {
      const result = await titusClient.getAgentHistory(sessionId);
      if (sessionId === sessionIdRef.current) {
        setMessages(safeHistoryToUi(result.messages));
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
      const result = await titusClient.listAgentSessions();
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
      try {
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
      } catch (err) {
        console.error("[Titus] Failed to load chat sessions", err);
        if (!cancelled) {
          sessionsLoadedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const syncAfterReconnect = useCallback(async () => {
    const sessionId = sessionIdRef.current;

    try {
      const status = await titusClient.getAgentStatus(sessionId);
      const current = status.sessions.find((item) => item.sessionId === sessionId);
      await loadHistory(sessionId);

      if (current?.running) {
        setIsRunning(true);
        setRunningOnPc(true);
        wasRunningOnDisconnectRef.current = false;
        return;
      }

      setIsRunning(false);
      setRunningOnPc(false);

      if (current?.canRetry) {
        setTryAgainPrompt({
          title: wasRunningOnDisconnectRef.current
            ? "Connection lost"
            : "Task incomplete",
          message:
            current.lastError ??
            "Something went wrong. You can retry and pick up where you left off.",
        });
      }

      wasRunningOnDisconnectRef.current = false;
    } catch {
      if (wasRunningOnDisconnectRef.current) {
        setTryAgainPrompt({
          title: "Connection lost",
          message:
            "Your phone disconnected. Reconnect to check status, or try again when back online.",
        });
      }
      wasRunningOnDisconnectRef.current = false;
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!isConnected || !sessionsLoadedRef.current) {
      if (!isConnected && (isRunning || runningOnPc)) {
        wasRunningOnDisconnectRef.current = true;
      }
      return;
    }

    void (async () => {
      await refreshSessions();
      await syncAfterReconnect();
    })();
  }, [isConnected, refreshSessions, syncAfterReconnect]);

  useEffect(() => {
    if (!isConnected || !runningOnPc || !isRunning) {
      return;
    }

    const timer = setInterval(() => {
      void titusClient
        .getAgentStatus(sessionIdRef.current)
        .then((status) => {
          const current = status.sessions.find(
            (item) => item.sessionId === sessionIdRef.current
          );
          if (!current?.running) {
            setIsRunning(false);
            setRunningOnPc(false);
            void loadHistory();
            void refreshSessions();
            if (current?.canRetry) {
              setTryAgainPrompt({
                title: "Task incomplete",
                message:
                  current.lastError ??
                  "The agent stopped before finishing. Try again to resume.",
              });
            }
          }
        })
        .catch(() => {
          // ignore polling errors
        });
    }, 4000);

    return () => clearInterval(timer);
  }, [isConnected, isRunning, loadHistory, refreshSessions, runningOnPc]);

  const handleAgentMessage = useCallback(
    (message: ServerMessage) => {
      const sessionId = sessionIdRef.current;
      if ("sessionId" in message && message.sessionId !== sessionId) {
        return;
      }

      switch (message.type) {
        case "agent_ack":
          if (message.sessionId === sessionId) {
            setRunningOnPc(true);
            setIsRunning(true);
            onError?.(null);
          }
          break;

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
          setRunningOnPc(false);
          assistantIdRef.current = null;
          setTryAgainPrompt(null);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => {}
          );
          setMessages((prev) =>
            prev.map((item) =>
              item.kind === "assistant" ? { ...item, streaming: false } : item
            )
          );
          void refreshSessions();
          break;

        case "agent_error":
          setIsRunning(false);
          setRunningOnPc(false);
          assistantIdRef.current = null;
          onError?.(message.message);
          setTryAgainPrompt({
            title: "Agent failed",
            message: message.message,
          });
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
    },
    [onError, refreshSessions]
  );

  useEffect(() => {
    const removeListener = titusClient.addMessageListener((message) => {
      runSyncSafely(
        () => handleAgentMessage(message),
        undefined,
        (msg) => onError?.(msg)
      );
    });

    return removeListener;
  }, [handleAgentMessage, onError]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current || isRunning) {
        return;
      }

      sessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      setInput("");
      setAttachments([]);
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
    setAttachments([]);
    assistantIdRef.current = null;
    await saveActiveSessionId(sessionId);
  }, [isRunning]);

  const addAttachment = useCallback(
    (attachment: PendingAgentAttachment) => {
      setAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) {
          onError?.(`You can attach up to ${MAX_ATTACHMENTS} files`);
          return prev;
        }
        if (prev.some((item) => item.name === attachment.name && item.size === attachment.size)) {
          return prev;
        }
        onError?.(null);
        return [...prev, attachment];
      });
    },
    [onError]
  );

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  }, []);

  const pickAttachment = useCallback(() => {
    showAttachmentPicker((attachment) => addAttachment(attachment));
  }, [addAttachment]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || !isConnected || isRunning) return;

    const sessionId = sessionIdRef.current;
    const now = Date.now();
    const titleSource = text || attachments[0]?.name || "Attachment";
    const summary: AgentSessionSummary = {
      sessionId,
      title: sessionTitleFromMessage(titleSource),
      updatedAt: now,
      messageCount: messages.filter((item) => item.kind === "user").length + 1,
    };

    void persistSessions(upsertSession(sessions, summary));

    const wireAttachments = toWirePayload(attachments);

    setMessages((prev) => [
      ...prev,
      {
        id: createUiId("user"),
        kind: "user",
        content: text,
        localAttachmentPreviews: attachments.map((item) => ({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          previewUri: item.previewUri,
        })),
      },
    ]);
    setInput("");
    setAttachments([]);

    try {
      titusClient.sendAgentMessage(sessionId, text, wireAttachments);
      setIsRunning(true);
      setRunningOnPc(false);
      setTryAgainPrompt(null);
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
      setTryAgainPrompt({
        title: "Could not send",
        message: err instanceof Error ? err.message : "Failed to send",
      });
    }
  }, [attachments, input, isConnected, isRunning, messages, persistSessions, sessions]);

  const tryAgain = useCallback(async () => {
    if (!isConnected) {
      onError?.("Connect to your PC to try again");
      return;
    }

    setTryAgainPrompt(null);
    onError?.(null);

    try {
      await titusClient.retryAgent(sessionIdRef.current);
      setIsRunning(true);
      setRunningOnPc(true);
    } catch (err) {
      onError?.(errorMessage(err, "Failed to retry agent"));
      setTryAgainPrompt({
        title: "Retry failed",
        message: errorMessage(err, "Failed to retry agent"),
      });
    }
  }, [isConnected, onError]);

  const dismissTryAgain = useCallback(() => {
    setTryAgainPrompt(null);
  }, []);

  const cancel = useCallback(() => {
    try {
      titusClient.cancelAgent(sessionIdRef.current);
    } catch (err) {
      onError?.(errorMessage(err, "Failed to cancel agent"));
    }
    setIsRunning(false);
    setRunningOnPc(false);
  }, [onError]);

  const clearChat = useCallback(async () => {
    if (!isConnected || isRunning) return;

    const sessionId = sessionIdRef.current;

    try {
      await titusClient.clearAgentHistory(sessionId);
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
    setAttachments([]);
    await saveActiveSessionId(nextId);
  }, [isConnected, isRunning, persistSessions, sessions]);

  return {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    attachments,
    pickAttachment,
    removeAttachment,
    isRunning,
    runningOnPc,
    tryAgainPrompt,
    sendMessage,
    tryAgain,
    dismissTryAgain,
    cancel,
    clearChat,
    newChat,
    selectSession,
  };
}
