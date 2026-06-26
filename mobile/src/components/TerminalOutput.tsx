import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface Props {
  output: string;
  isRunning: boolean;
  exitCode: number | null;
}

export function TerminalOutput({ output, isRunning, exitCode }: Props) {
  const statusLabel = isRunning
    ? "Running..."
    : exitCode !== null
      ? `Exit code: ${exitCode}`
      : "Ready";

  const statusColor = isRunning
    ? "#3fb950"
    : exitCode === 0
      ? "#58a6ff"
      : exitCode !== null
        ? "#f85149"
        : "#8b949e";

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#30363d",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    backgroundColor: "#161b22",
  },
  headerTitle: {
    color: "#c9d1d9",
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
    color: "#c9d1d9",
    lineHeight: 20,
  },
});
