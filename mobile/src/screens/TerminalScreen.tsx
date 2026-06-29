import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { titusClient } from "../services/websocket";
import { ServerMessage, ShellKind } from "../types/protocol";
import { useTheme } from "../context/ThemeContext";
import { dismissKeyboard, keyboardPersistTaps } from "../utils/keyboard";
import { useTabBarInset } from "../hooks/useTabBarInset";
import { useThemedStyles } from "../hooks/useThemedStyles";

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

function getPromptPrefix(cwd: string, shell: ShellKind): string {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const tail = parts.slice(-2).join("/") || cwd;
  return shell === "powershell" ? `PS ${tail}> ` : `${tail}> `;
}

function shellHint(shell: ShellKind): string {
  return shell === "powershell" ? "PowerShell" : "CMD";
}

export default function TerminalScreen({ isConnected, onError }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    shellToggle: {
      flexDirection: "row",
      gap: 6,
    },
    shellChip: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    shellChipActive: {
      borderColor: c.buttonPrimary,
      backgroundColor: c.surface,
    },
    shellChipText: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    shellChipTextActive: {
      color: c.link,
    },
    shellBadge: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "600",
      backgroundColor: c.buttonSecondary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    headerTitle: {
      color: c.textSecondary,
      fontWeight: "700",
      fontSize: 14,
    },
    cwd: {
      flex: 1,
      color: c.textMuted,
      fontSize: 11,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    status: {
      fontSize: 12,
      fontWeight: "600",
    },
    output: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      marginBottom: 10,
    },
    outputScroll: {
      flex: 1,
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
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    prompt: {
      color: c.success,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: 16,
      fontWeight: "700",
      marginRight: 8,
    },
    input: {
      flex: 1,
      color: c.textSecondary,
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
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    historyText: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 13,
    },
    runBtn: {
      flex: 1,
      backgroundColor: c.buttonPrimary,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: c.error,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
    },
    runText: {
      color: c.onPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  }));
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [shell, setShell] = useState<ShellKind>("cmd");
  const [shellOptions, setShellOptions] = useState<ShellKind[]>(["cmd", "powershell"]);
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: "welcome",
      kind: "system",
      text: "Remote shell on your PC. Use CMD or PowerShell — pick below.\n",
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const activeShellId = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const promptCwd = useRef("");
  const tabBarInset = useTabBarInset();

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
          if (message.shellOptions?.length) {
            setShellOptions(message.shellOptions);
          }
          if (message.defaultShell) {
            setShell(message.defaultShell);
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
            if (message.shell) {
              setShell(message.shell);
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
    return titusClient.addMessageListener(handleServerMessage);
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

    const prefix = getPromptPrefix(promptCwd.current || cwd || "~", shell);
    appendLine("prompt", `${prefix}${trimmed}\n`);

    setHistory((prev) => {
      if (prev[0] === trimmed) return prev;
      return [trimmed, ...prev].slice(0, 50);
    });
    setHistoryIndex(-1);
    setCommand("");

    try {
      titusClient.shellRun(id, trimmed, shell);
      dismissKeyboard();
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
      titusClient.shellCancel(id);
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
        return colors.link;
      case "stderr":
        return colors.error;
      case "system":
        return colors.textMuted;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shell</Text>
        {shellOptions.length > 1 ? (
          <View style={styles.shellToggle}>
            {shellOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.shellChip, shell === option && styles.shellChipActive]}
                onPress={() => {
                  setShell(option);
                  appendLine(
                    "system",
                    `Switched to ${shellHint(option)}.\n`
                  );
                }}
                disabled={isRunning}
              >
                <Text
                  style={[
                    styles.shellChipText,
                    shell === option && styles.shellChipTextActive,
                  ]}
                >
                  {shellHint(option)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.shellBadge}>{shellHint(shell)}</Text>
        )}
        <Text style={styles.cwd} numberOfLines={1}>
          {cwd || "Not connected"}
        </Text>
        <Text style={[styles.status, { color: isRunning ? colors.success : colors.textMuted }]}>
          {isRunning ? "Running..." : "Ready"}
        </Text>
      </View>

      <Pressable style={styles.output} onPress={dismissKeyboard}>
      <ScrollView
        ref={scrollRef}
        style={styles.outputScroll}
        contentContainerStyle={styles.outputContent}
        keyboardShouldPersistTaps={keyboardPersistTaps}
        keyboardDismissMode="on-drag"
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
      </Pressable>

      <View style={styles.inputRow}>
        <Text style={styles.prompt}>{shell === "powershell" ? "PS>" : ">"}</Text>
        <TextInput
          style={styles.input}
          value={command}
          onChangeText={setCommand}
          placeholder={
            shell === "powershell"
              ? "Enter PowerShell command..."
              : "Enter CMD command (dir, cd, npm)..."
          }
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="send"
          onSubmitEditing={handleSubmitEditing}
          editable={!isRunning}
        />
      </View>

      <View style={[styles.actions, { marginBottom: tabBarInset }]}>
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
