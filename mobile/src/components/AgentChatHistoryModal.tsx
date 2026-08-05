import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { formatSessionTime } from "../services/chatSessions";
import { AgentSessionSummary } from "../types/protocol";
import { ThemeColors } from "../theme/colors";

interface Props {
  visible: boolean;
  sessions: AgentSessionSummary[];
  activeSessionId: string;
  isRunning: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNewChat: () => void;
}

export function AgentChatHistoryModal({
  visible,
  sessions,
  activeSessionId,
  isRunning,
  onClose,
  onSelect,
  onDelete,
  onNewChat,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Chats</Text>
            <Text style={styles.subtitle}>
              Open a past conversation or delete ones you no longer need.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.newBtn, isRunning && styles.btnDisabled]}
          onPress={() => {
            onNewChat();
            onClose();
          }}
          disabled={isRunning}
        >
          <Ionicons name="add" size={18} color={colors.onPrimary} />
          <Text style={styles.newBtnText}>New chat</Text>
        </Pressable>

        {sessions.length === 0 ? (
          <Text style={styles.empty}>No saved chats yet. Send a message to start one.</Text>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.sessionId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const active = item.sessionId === activeSessionId;
              return (
                <Pressable
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(item.sessionId);
                    onClose();
                  }}
                  disabled={isRunning && !active}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title || "Chat"}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatSessionTime(item.updatedAt)}
                      {item.messageCount ? ` · ${item.messageCount} messages` : ""}
                      {item.running ? " · Running" : ""}
                      {active ? " · Open" : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => onDelete(item.sessionId)}
                    disabled={isRunning && item.sessionId === activeSessionId}
                    hitSlop={8}
                    accessibilityLabel={`Delete ${item.title || "chat"}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.errorText} />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: 56,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "space-between" as const,
      marginBottom: 16,
      gap: 12,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "700" as const,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },
    close: {
      color: colors.link,
      fontSize: 16,
      fontWeight: "600" as const,
    },
    newBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      backgroundColor: colors.buttonPrimary,
      borderRadius: 10,
      paddingVertical: 12,
      marginBottom: 16,
    },
    newBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 15,
    },
    empty: {
      color: colors.textMuted,
      textAlign: "center" as const,
      marginTop: 40,
      fontSize: 14,
      lineHeight: 20,
    },
    list: {
      paddingBottom: 32,
      gap: 8,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    rowActive: {
      borderColor: colors.accentBorder,
      backgroundColor: colors.surfaceMuted,
    },
    rowBody: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "600" as const,
    },
    rowMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
    deleteBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondary,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  };
}
