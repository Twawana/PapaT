import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

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
  const styles = useThemedStyles((c) => ({
    bar: {
      maxHeight: 40,
      marginBottom: 8,
    },
    empty: {
      paddingVertical: 8,
      marginBottom: 8,
    },
    emptyText: {
      color: c.textMuted,
      fontSize: 13,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingLeft: 10,
      paddingRight: 4,
      paddingVertical: 6,
      marginRight: 6,
      maxWidth: 180,
    },
    tabActive: {
      borderColor: c.accent,
      backgroundColor: c.background,
    },
    tabText: {
      color: c.textMuted,
      fontSize: 12,
      maxWidth: 130,
    },
    tabTextActive: {
      color: c.textPrimary,
      fontWeight: "600",
    },
    closeBtn: {
      marginLeft: 4,
      paddingHorizontal: 4,
    },
    closeText: {
      color: c.textMuted,
      fontSize: 16,
      lineHeight: 18,
    },
  }));

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
