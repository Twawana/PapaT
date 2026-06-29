import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { titusClient } from "../services/websocket";
import { FileEntry } from "../types/protocol";
import { copyPathToClipboard } from "../utils/clipboard";

interface Props {
  visible: boolean;
  workspaceKey?: string | null;
  onOpenFile: (path: string) => void;
}

export function FileTreePanel({ visible, workspaceKey, onOpenFile }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    panel: {
      width: "38%",
      minWidth: 120,
      maxWidth: 200,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      marginRight: 8,
      padding: 6,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
      gap: 6,
    },
    up: {
      color: c.link,
      fontSize: 16,
      fontWeight: "700",
      paddingHorizontal: 4,
    },
    disabled: {
      opacity: 0.3,
    },
    path: {
      flex: 1,
      color: c.textMuted,
      fontSize: 11,
    },
    loader: {
      marginTop: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      gap: 6,
    },
    icon: {
      fontSize: 12,
    },
    name: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 12,
    },
  }));

  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (dir: string) => {
    if (!titusClient.isConnected()) return;
    setLoading(true);
    try {
      const result = await titusClient.listDir(dir);
      setPath(result.path || dir);
      setEntries(result.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPath(".");
  }, [workspaceKey]);

  useEffect(() => {
    if (visible) {
      void load(path);
    }
  }, [visible, load, path, workspaceKey]);

  const showEntryActions = (entry: FileEntry) => {
    Alert.alert(entry.name, undefined, [
      {
        text: "Copy Path",
        onPress: () => void copyPathToClipboard(entry.path),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Pressable
          disabled={path === "."}
          onPress={() => {
            const parts = path.split("/").filter(Boolean);
            parts.pop();
            void load(parts.length ? parts.join("/") : ".");
          }}
        >
          <Text style={[styles.up, path === "." && styles.disabled]}>↑</Text>
        </Pressable>
        <Text style={styles.path} numberOfLines={1}>
          {path}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                if (item.entryType === "directory") {
                  void load(item.path);
                } else {
                  onOpenFile(item.path);
                }
              }}
              onLongPress={() => showEntryActions(item)}
            >
              <Text style={styles.icon}>{item.entryType === "directory" ? "📁" : "📄"}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
