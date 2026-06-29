import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { TerminalOutput } from "../components/TerminalOutput";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { titusClient } from "../services/websocket";
import {
  ExecutionState,
  ServerMessage,
} from "../types/protocol";

const DEFAULT_CODE = `// Write JavaScript and press Run
console.log("Hello from Titus!");
console.log("2 + 2 =", 2 + 2);
`;

interface Props {
  isConnected: boolean;
  onError: (message: string | null) => void;
}

function createExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomeScreen({ isConnected, onError }: Props) {
  const styles = useThemedStyles((c) => ({
    flex: {
      flex: 1,
    },
    editorSection: {
      flex: 1,
      minHeight: 160,
      marginBottom: 12,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    sectionTitle: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 14,
    },
    runBtn: {
      backgroundColor: c.buttonPrimary,
      borderRadius: 8,
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    runText: {
      color: c.onPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    codeEditor: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
      color: c.textSecondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: 13,
      lineHeight: 20,
    },
    terminalSection: {
      flex: 1,
      minHeight: 140,
      marginBottom: 8,
    },
  }));
  const [code, setCode] = useState(DEFAULT_CODE);
  const [execution, setExecution] = useState<ExecutionState>({
    id: null,
    output: "",
    isRunning: false,
    exitCode: null,
  });

  const activeExecutionId = useRef<string | null>(null);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "connected":
        case "pong":
          break;

        case "output":
          if (message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              output: prev.output + message.data,
            }));
          }
          break;

        case "done":
          if (message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              isRunning: false,
              exitCode: message.exitCode,
            }));
            activeExecutionId.current = null;
          }
          break;

        case "error":
          if (!message.id || message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              output: prev.output + `\n[Error] ${message.message}\n`,
              isRunning: false,
            }));
            if (!message.id) {
              onError(message.message);
            }
            activeExecutionId.current = null;
          }
          break;
      }
    },
    [onError]
  );

  useEffect(() => {
    return titusClient.addMessageListener(handleServerMessage);
  }, [handleServerMessage]);

  const handleRun = () => {
    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }

    const id = createExecutionId();
    activeExecutionId.current = id;
    setExecution({ id, output: "", isRunning: true, exitCode: null });
    onError(null);

    try {
      titusClient.execute(id, code);
    } catch (err) {
      setExecution((prev) => ({ ...prev, isRunning: false }));
      onError(err instanceof Error ? err.message : "Failed to execute");
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.editorSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Code (JavaScript)</Text>
          <Pressable
            style={[
              styles.runBtn,
              (!isConnected || execution.isRunning) && styles.btnDisabled,
            ]}
            onPress={handleRun}
            disabled={!isConnected || execution.isRunning}
          >
            <Text style={styles.runText}>
              {execution.isRunning ? "Running..." : "Run"}
            </Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.codeEditor}
          value={code}
          onChangeText={setCode}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.terminalSection}>
        <TerminalOutput
          output={execution.output}
          isRunning={execution.isRunning}
          exitCode={execution.exitCode}
        />
      </View>
    </View>
  );
}
