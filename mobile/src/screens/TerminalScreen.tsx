import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { papatClient } from "../services/websocket";
import { ServerMessage } from "../types/protocol";

interface Props {
  isConnected: boolean;
  onError: (message: string | null) => void;
}

interface TerminalLine {
  id: string;
  kind: "prompt" | "stdout" | "stderr" | "system";
  text: string;
}

function createShellId(): string {
  return `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPromptPrefix(cwd: string): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-2).join("/") || cwd;
  return `${tail} $ `;
}

export default function TerminalScreen({ isConnected, onError }: Props) {
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: "welcome",
      kind: "system",
      text: "Remote shell on your PC. Type a command and press Run.\n",
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const activeShellId = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const promptCwd = useRef("");

  const appendLine = useCallback((kind: TerminalLine["kind"], text: string) => {
    setLines((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, kind, text },
    ]);
  }, []);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "connected":
        case "auth_ok":
          if (message.workspace) {
            setCwd(message.workspace);
            promptCwd.current = message.workspace;
          }
          break;

        case "output":
          if (message.id === activeShellId.current) {
            appendLine(message.stream, message.data);
          }
          break;

        case "done":
          if (message.id === activeShellId.current) {
            if (message.cwd) {
              setCwd(message.cwd);
              promptCwd.current = message.cwd;
            }
            if (message.signal) {
              appendLine("system", "\n[Command cancelled]\n");
            }
            setIsRunning(false);
            activeShellId.current = null;
          }
          break;

        case "error":
          if (message.id === activeShellId.current) {
            appendLine("stderr", `\n[Error] ${message.message}\n`);
            setIsRunning(false);
            activeShellId.current = null;
          }
          break;
      }
    },
    [appendLine]
  );

  useEffect(() => {
    return papatClient.addMessageListener(handleServerMessage);
  }, [handleServerMessage]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [lines, isRunning]);

  const runCommand = (rawCommand: string) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;

    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }

    if (isRunning) {
      onError("A command is already running");
      return;
    }

    const id = createShellId();
    activeShellId.current = id;
    setIsRunning(true);
    onError(null);

    const prefix = getPromptPrefix(promptCwd.current || cwd || "~");
    appendLine("prompt", `${prefix}${trimmed}\n`);

    setHistory((prev) => {
      if (prev[0] === trimmed) return prev;
      return [trimmed, ...prev].slice(0, 50);
    });
    setHistoryIndex(-1);
    setCommand("");

    try {
      papatClient.shellRun(id, trimmed);
    } catch (err) {
      setIsRunning(false);
      activeShellId.current = null;
      onError(err instanceof Error ? err.message : "Failed to run command");
    }
  };

  const handleRun = () => runCommand(command);

  const handleCancel = () => {
    const id = activeShellId.current;
    if (!id || !isRunning) return;
    try {
      papatClient.shellCancel(id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  const handleSubmitEditing = () => {
    handleRun();
  };

  const recallHistory = (direction: "up" | "down") => {
    if (history.length === 0) return;

    if (direction === "up") {
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
      return;
    }

    const nextIndex = historyIndex - 1;
    if (nextIndex < 0) {
      setHistoryIndex(-1);
      setCommand("");
      return;
    }
    setHistoryIndex(nextIndex);
    setCommand(history[nextIndex] ?? "");
  };

  const lineColor = (kind: TerminalLine["kind"]) => {
    switch (kind) {
      case "prompt":
        return "#58a6ff";
      case "stderr":
        return "#f85149";
      case "system":
        return "#8b949e";
      default:
        return "#c9d1d9";
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shell</Text>
        <Text style={styles.cwd} numberOfLines={1}>
          {cwd || "Not connected"}
        </Text>
        <Text style={[styles.status, { color: isRunning ? "#3fb950" : "#8b949e" }]}>
          {isRunning ? "Running..." : "Ready"}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
      >
        {lines.map((line) => (
          <Text
            key={line.id}
            style={[styles.line, { color: lineColor(line.kind) }]}
            selectable
          >
            {line.text}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <Text style={styles.prompt}>{">"}</Text>
        <TextInput
          style={styles.input}
          value={command}
          onChangeText={setCommand}
          placeholder="Enter command..."
          placeholderTextColor="#484f58"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="send"
          onSubmitEditing={handleSubmitEditing}
          editable={!isRunning}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.historyBtn, history.length === 0 && styles.btnDisabled]}
          onPress={() => recallHistory("up")}
          disabled={history.length === 0}
        >
          <Text style={styles.historyText}>Prev</Text>
        </Pressable>
        <Pressable
          style={[styles.historyBtn, history.length === 0 && styles.btnDisabled]}
          onPress={() => recallHistory("down")}
          disabled={history.length === 0}
        >
          <Text style={styles.historyText}>Next</Text>
        </Pressable>
        {isRunning ? (
          <Pressable style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.runText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.runBtn, !isConnected && styles.btnDisabled]}
            onPress={handleRun}
            disabled={!isConnected}
          >
            <Text style={styles.runText}>Run</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  headerTitle: {
    color: "#c9d1d9",
    fontWeight: "700",
    fontSize: 14,
  },
  cwd: {
    flex: 1,
    color: "#8b949e",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  status: {
    fontSize: 12,
    fontWeight: "600",
  },
  output: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    marginBottom: 10,
  },
  outputContent: {
    padding: 12,
    flexGrow: 1,
  },
  line: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  prompt: {
    color: "#3fb950",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: "#c9d1d9",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  historyBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  historyText: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 13,
  },
  runBtn: {
    flex: 1,
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#da3633",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  runText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
