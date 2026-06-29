import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { DiagnosticItem } from "../types/protocol";

interface Props {
  items: DiagnosticItem[];
  loading?: boolean;
  onSelect: (item: DiagnosticItem) => void;
}

export function ProblemsPanel({ items, loading, onSelect }: Props) {
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    title: {
      color: c.textSecondary,
      fontWeight: "700",
      fontSize: 14,
    },
    counts: {
      color: c.textMuted,
      fontSize: 12,
    },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      paddingVertical: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.surfaceElevated,
    },
    severity: {
      width: 20,
      height: 20,
      borderRadius: 4,
      textAlign: "center",
      lineHeight: 20,
      fontSize: 11,
      fontWeight: "700",
      marginRight: 8,
      overflow: "hidden",
    },
    error: {
      backgroundColor: c.error,
      color: c.onPrimary,
    },
    warning: {
      backgroundColor: c.warning,
      color: c.onPrimary,
    },
    body: {
      flex: 1,
    },
    message: {
      color: c.textPrimary,
      fontSize: 13,
    },
    location: {
      color: c.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
  }));

  const errors = items.filter((item) => item.severity === "error").length;
  const warnings = items.filter((item) => item.severity === "warning").length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Problems</Text>
        <Text style={styles.counts}>
          {errors} errors · {warnings} warnings
        </Text>
      </View>

      {loading ? (
        <Text style={styles.hint}>Running diagnostics...</Text>
      ) : items.length === 0 ? (
        <Text style={styles.hint}>No problems found</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.file}:${item.line}:${index}`}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <Text
                style={[
                  styles.severity,
                  item.severity === "error" ? styles.error : styles.warning,
                ]}
              >
                {item.severity === "error" ? "E" : "W"}
              </Text>
              <View style={styles.body}>
                <Text style={styles.message} numberOfLines={2}>
                  {item.message}
                </Text>
                <Text style={styles.location}>
                  {item.file}:{item.line}:{item.column} · {item.source}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
