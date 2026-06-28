import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { DiagnosticItem } from "../types/protocol";

interface Props {
  items: DiagnosticItem[];
  loading?: boolean;
  onSelect: (item: DiagnosticItem) => void;
}

export function ProblemsPanel({ items, loading, onSelect }: Props) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
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
    color: "#c9d1d9",
    fontWeight: "700",
    fontSize: 14,
  },
  counts: {
    color: "#8b949e",
    fontSize: 12,
  },
  hint: {
    color: "#8b949e",
    fontSize: 13,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#21262d",
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
    backgroundColor: "#da3633",
    color: "#fff",
  },
  warning: {
    backgroundColor: "#d29922",
    color: "#fff",
  },
  body: {
    flex: 1,
  },
  message: {
    color: "#f0f6fc",
    fontSize: 13,
  },
  location: {
    color: "#8b949e",
    fontSize: 11,
    marginTop: 2,
  },
});
