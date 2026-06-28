import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export interface EditorTab {
  path: string;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ tabs, activePath, onSelect, onClose }: Props) {
  if (tabs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No files open</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar}>
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const name = tab.path.split("/").pop() ?? tab.path;
        return (
          <Pressable
            key={tab.path}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onSelect(tab.path)}
            onLongPress={() => onClose(tab.path)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {tab.dirty ? "● " : ""}
              {name}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => onClose(tab.path)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    maxHeight: 40,
    marginBottom: 8,
  },
  empty: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  emptyText: {
    color: "#8b949e",
    fontSize: 13,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 6,
    marginRight: 6,
    maxWidth: 180,
  },
  tabActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#0d1117",
  },
  tabText: {
    color: "#8b949e",
    fontSize: 12,
    maxWidth: 130,
  },
  tabTextActive: {
    color: "#f0f6fc",
    fontWeight: "600",
  },
  closeBtn: {
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  closeText: {
    color: "#8b949e",
    fontSize: 16,
    lineHeight: 18,
  },
});
