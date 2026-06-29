import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  output: string;
  isRunning: boolean;
  exitCode: number | null;
}

export function TerminalOutput({ output, isRunning, exitCode }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    headerTitle: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 13,
    },
    status: {
      fontSize: 12,
      fontWeight: "500",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 12,
      flexGrow: 1,
    },
    output: {
      fontFamily: "monospace",
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 20,
    },
  }));

  const statusLabel = isRunning
    ? "Running..."
    : exitCode !== null
      ? `Exit code: ${exitCode}`
      : "Ready";

  const statusColor = isRunning
    ? colors.success
    : exitCode === 0
      ? colors.link
      : exitCode !== null
        ? colors.error
        : colors.textMuted;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Terminal</Text>
        <Text style={[styles.status, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.output} selectable>
          {output || "Output will appear here..."}
        </Text>
      </ScrollView>
    </View>
  );
}
