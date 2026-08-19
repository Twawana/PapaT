import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useOfflineOptional } from "../context/OfflineContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useFileEntryOperations } from "../hooks/useFileEntryOperations";
import { listProjectDirectory } from "../services/localDb";
import { titusClient } from "../services/websocket";
import { FileEntry } from "../types/protocol";
import { isPathRoot, parentPath } from "../utils/paths";

interface Props {
  visible: boolean;
  workspaceKey?: string | null;
  onOpenFile: (path: string) => void;
  onError?: (message: string | null) => void;
}

export function FileTreePanel({
  visible,
  workspaceKey,
  onOpenFile,
  onError,
}: Props) {
  const offline = useOfflineOptional();
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
    hint: {
      color: c.textMuted,
      fontSize: 10,
      marginBottom: 4,
    },
    offlineBadge: {
      color: c.warning ?? "#ffb020",
      fontSize: 9,
      marginBottom: 4,
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

  const useLocal =
    Boolean(offline?.activeProject?.offlineEnabled) &&
    (!titusClient.isConnected() || offline?.workspaceMode === "offline_working");

  const load = useCallback(
    async (dir: string) => {
      setLoading(true);
      try {
        if (useLocal && offline?.activeProject?.id) {
          const localEntries = await listProjectDirectory(
            offline.activeProject.id,
            dir
          );
          setPath(dir);
          setEntries(
            localEntries.map((item) => ({
              name: item.path.split("/").pop() ?? item.path,
              path: item.path,
              entryType: item.entryType,
              size: item.content?.length,
              mtime: item.localMtime,
            }))
          );
          return;
        }

        if (!titusClient.isConnected()) {
          setEntries([]);
          return;
        }

        const result = await titusClient.listDir(dir);
        setPath(result.path || dir);
        setEntries(result.entries);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [useLocal, offline?.activeProject?.id]
  );

  const { openEntryActions, OperationModals } = useFileEntryOperations({
    onError: onError ?? (() => {}),
    onChanged: () => load(path),
    onOpenInEditor: onOpenFile,
    offlineProjectId: useLocal ? offline?.activeProject?.id ?? null : null,
  });

  useEffect(() => {
    setPath(".");
  }, [workspaceKey]);

  useEffect(() => {
    if (visible) {
      void load(path);
    }
  }, [visible, load, path, workspaceKey, useLocal]);

  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Pressable
          disabled={isPathRoot(path)}
          onPress={() => {
            void load(parentPath(path));
          }}
        >
          <Text style={[styles.up, isPathRoot(path) && styles.disabled]}>↑</Text>
        </Pressable>
        <Text style={styles.path} numberOfLines={1}>
          {path}
        </Text>
      </View>

      {useLocal ? (
        <Text style={styles.offlineBadge}>Local copy · offline</Text>
      ) : null}
      <Text style={styles.hint}>Hold to rename, move, or delete</Text>

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
              onLongPress={() => openEntryActions(item)}
              delayLongPress={350}
            >
              <Text style={styles.icon}>{item.entryType === "directory" ? "📁" : "📄"}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}

      <OperationModals />
    </View>
  );
}
