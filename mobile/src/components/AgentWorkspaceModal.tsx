import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";
import { titusClient } from "../services/websocket";
import { dismissKeyboard } from "../utils/keyboard";

interface Props {
  visible: boolean;
  currentPath: string | null;
  isConnected: boolean;
  onClose: () => void;
  onApplied: (path: string, name: string) => void;
  onError: (message: string | null) => void;
}

export function AgentWorkspaceModal({
  visible,
  currentPath,
  isConnected,
  onClose,
  onApplied,
  onError,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pathInput, setPathInput] = useState(currentPath ?? "");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (visible) {
      setPathInput(currentPath ?? "");
    }
  }, [visible, currentPath]);

  const handleApply = async () => {
    const trimmed = pathInput.trim();
    if (!trimmed) {
      onError("Enter a folder path on your PC");
      return;
    }
    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }

    dismissKeyboard();
    setApplying(true);
    onError(null);

    try {
      const result = await titusClient.openProject(trimmed);
      onApplied(result.path, result.name);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to set workspace path");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.container} onPress={Keyboard.dismiss}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Agent workspace path</Text>
            <Text style={styles.subtitle}>
              Enter the full folder path on your PC. The agent will use this project
              for files and commands.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} disabled={applying}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>PC folder path</Text>
        <TextInput
          style={styles.input}
          value={pathInput}
          onChangeText={setPathInput}
          placeholder="C:\Users\you\Projects\my-app"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          editable={!applying}
          selectTextOnFocus
          multiline
        />
        <Text style={styles.example}>
          Examples: C:\Users\you\Projects\my-app or /home/you/projects/my-app
        </Text>

        <Pressable
          style={[styles.applyBtn, (!isConnected || applying) && styles.btnDisabled]}
          onPress={() => void handleApply()}
          disabled={!isConnected || applying}
        >
          {applying ? (
            <ActivityIndicator color={colors.spinnerOnAccent} size="small" />
          ) : (
            <Text style={styles.applyBtnText}>Use this path</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: 48,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "flex-start" as const,
      gap: 12,
      marginBottom: 20,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700" as const,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    close: {
      color: colors.link,
      fontWeight: "600" as const,
      fontSize: 14,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "600" as const,
      marginBottom: 8,
    },
    input: {
      minHeight: 88,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlignVertical: "top" as const,
    },
    example: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
      marginBottom: 20,
    },
    applyBtn: {
      backgroundColor: colors.buttonPrimary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
    },
    applyBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 15,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  };
}
