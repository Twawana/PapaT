import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { FileEntryActionSheet } from "../components/FileEntryActionSheet";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { titusClient } from "../services/websocket";
import { BrowseEntry, BrowseRoot, FileEntry } from "../types/protocol";
import { copyPathToClipboard } from "../utils/clipboard";
import { dirname, isPathRoot, joinPath, normalizePath, parentPath } from "../utils/paths";

interface Options {
  onError: (message: string | null) => void;
  onChanged: () => void | Promise<void>;
  onOpenInEditor?: (path: string) => void;
}

export function useFileEntryOperations({
  onError,
  onChanged,
  onOpenInEditor,
}: Options) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    promptOverlay: {
      flex: 1,
      backgroundColor: `${c.shadow}99`,
      justifyContent: "center",
      padding: 24,
    },
    promptCard: {
      backgroundColor: c.surfaceElevated,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    promptTitle: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 12,
    },
    promptInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.textSecondary,
      marginBottom: 12,
    },
    promptActions: {
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      gap: 8,
    },
    promptBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: c.buttonSecondary,
    },
    promptBtnText: {
      color: c.textSecondary,
      fontWeight: "600" as const,
    },
    promptBtnPrimary: {
      backgroundColor: c.buttonSuccess,
    },
    promptBtnPrimaryText: {
      color: c.onPrimary,
      fontWeight: "700" as const,
    },
    browseModal: {
      flex: 1,
      backgroundColor: c.background,
      paddingTop: Platform.OS === "ios" ? 48 : 24,
      paddingHorizontal: 16,
    },
    browseHeader: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: 12,
    },
    browseTitle: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700" as const,
      flex: 1,
      marginRight: 8,
    },
    browseClose: {
      color: c.link,
      fontWeight: "600" as const,
    },
    rootRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      marginBottom: 12,
    },
    rootChip: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    rootChipText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    browsePath: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 8,
    },
    browseRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: 12,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.surfaceMuted,
    },
    browseRowIcon: {
      fontSize: 16,
    },
    browseRowName: {
      color: c.textPrimary,
      fontSize: 15,
      flex: 1,
    },
    browseFooter: {
      flexDirection: "row" as const,
      gap: 8,
      paddingVertical: 12,
    },
    browseFooterBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center" as const,
      backgroundColor: c.buttonSecondary,
      borderWidth: 1,
      borderColor: c.border,
    },
    browseFooterText: {
      color: c.textSecondary,
      fontWeight: "600" as const,
    },
    browseSelectBtn: {
      backgroundColor: c.buttonSuccess,
      borderColor: c.buttonSuccess,
      flex: 2,
    },
    browseSelectText: {
      color: c.onPrimary,
      fontWeight: "700" as const,
    },
    loader: {
      marginTop: 24,
    },
  }));

  const [actionEntry, setActionEntry] = useState<FileEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [moveTarget, setMoveTarget] = useState<FileEntry | null>(null);
  const [moveDestPath, setMoveDestPath] = useState<string | null>(null);
  const [moveDestEntries, setMoveDestEntries] = useState<BrowseEntry[]>([]);
  const [moveDestRoots, setMoveDestRoots] = useState<BrowseRoot[]>([]);
  const [moveDestLoading, setMoveDestLoading] = useState(false);

  const closeActionSheet = useCallback(() => {
    setActionEntry(null);
  }, []);

  const deleteEntry = useCallback(
    async (entry: FileEntry) => {
      try {
        await titusClient.deletePath(entry.path);
        await onChanged();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [onChanged, onError]
  );

  const confirmDelete = useCallback(
    (entry: FileEntry) => {
      Alert.alert(
        "Delete",
        `Delete ${entry.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => void deleteEntry(entry),
          },
        ]
      );
    },
    [deleteEntry]
  );

  const startRename = useCallback((entry: FileEntry) => {
    setRenameTarget(entry);
    setRenameName(entry.name);
  }, []);

  const cancelRename = useCallback(() => {
    setRenameTarget(null);
    setRenameName("");
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;

    const dest = joinPath(dirname(renameTarget.path), name);
    setRenameTarget(null);
    setRenameName("");

    try {
      await titusClient.movePath(renameTarget.path, dest);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to rename");
    }
  }, [onChanged, onError, renameName, renameTarget]);

  const startMove = useCallback(
    async (entry: FileEntry) => {
      setMoveTarget(entry);
      setMoveDestLoading(true);

      try {
        const roots = await titusClient.getBrowseRoots();
        setMoveDestRoots(roots.roots);
        const first = roots.roots[0]?.path;
        if (first) {
          const listing = await titusClient.browseList(first);
          setMoveDestPath(normalizePath(listing.path));
          setMoveDestEntries(listing.entries);
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to open move picker");
        setMoveTarget(null);
      } finally {
        setMoveDestLoading(false);
      }
    },
    [onError]
  );

  const enterMoveDest = useCallback(
    async (path: string) => {
      setMoveDestLoading(true);
      try {
        const listing = await titusClient.browseList(path);
        setMoveDestPath(normalizePath(listing.path));
        setMoveDestEntries(listing.entries);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to open folder");
      } finally {
        setMoveDestLoading(false);
      }
    },
    [onError]
  );

  const moveDestParent = useCallback(() => {
    if (!moveDestPath || isPathRoot(moveDestPath)) return;
    void enterMoveDest(parentPath(moveDestPath));
  }, [enterMoveDest, moveDestPath]);

  const cancelMove = useCallback(() => {
    setMoveTarget(null);
    setMoveDestPath(null);
  }, []);

  const confirmMove = useCallback(async () => {
    if (!moveTarget || !moveDestPath) return;

    const dest = joinPath(normalizePath(moveDestPath), moveTarget.name);
    try {
      await titusClient.movePath(moveTarget.path, dest);
      setMoveTarget(null);
      setMoveDestPath(null);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to move");
    }
  }, [moveDestPath, moveTarget, onChanged, onError]);

  const openEntryActions = useCallback((entry: FileEntry) => {
    setActionEntry(entry);
  }, []);

  const actionSheetActions = useMemo(() => {
    if (!actionEntry) return [];

    const actions = [];

    if (actionEntry.entryType === "file" && onOpenInEditor) {
      actions.push({
        label: "Open in Code",
        onPress: () => onOpenInEditor(actionEntry.path),
      });
    }

    actions.push(
      {
        label: "Rename",
        onPress: () => startRename(actionEntry),
      },
      {
        label: "Move",
        onPress: () => void startMove(actionEntry),
      },
      {
        label: "Copy Path",
        onPress: () => void copyPathToClipboard(actionEntry.path),
      },
      {
        label: "Delete",
        destructive: true,
        onPress: () => confirmDelete(actionEntry),
      }
    );

    return actions;
  }, [actionEntry, confirmDelete, onOpenInEditor, startMove, startRename]);

  const OperationModals = useCallback(
    () => (
      <>
        <FileEntryActionSheet
          visible={!!actionEntry}
          entryName={actionEntry?.name ?? ""}
          actions={actionSheetActions}
          onClose={closeActionSheet}
        />

        <Modal visible={!!renameTarget} transparent animationType="fade">
          <View style={styles.promptOverlay}>
            <View style={styles.promptCard}>
              <Text style={styles.promptTitle}>Rename</Text>
              <TextInput
                style={styles.promptInput}
                value={renameName}
                onChangeText={setRenameName}
                placeholder="name"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <View style={styles.promptActions}>
                <Pressable style={styles.promptBtn} onPress={cancelRename}>
                  <Text style={styles.promptBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.promptBtn, styles.promptBtnPrimary]}
                  onPress={() => void submitRename()}
                >
                  <Text style={styles.promptBtnPrimaryText}>Rename</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={!!moveTarget} animationType="slide">
          <View style={styles.browseModal}>
            <View style={styles.browseHeader}>
              <Text style={styles.browseTitle}>Move {moveTarget?.name ?? ""}</Text>
              <Pressable onPress={cancelMove}>
                <Text style={styles.browseClose}>Cancel</Text>
              </Pressable>
            </View>

            <View style={styles.rootRow}>
              {moveDestRoots.map((root) => (
                <Pressable
                  key={root.path}
                  style={styles.rootChip}
                  onPress={() => void enterMoveDest(root.path)}
                >
                  <Text style={styles.rootChipText}>{root.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.browsePath} numberOfLines={2}>
              {moveDestPath ?? ""}
            </Text>

            {moveDestLoading ? (
              <ActivityIndicator color={colors.iconAccent} style={styles.loader} />
            ) : (
              <FlatList
                data={moveDestEntries}
                keyExtractor={(item) => item.path}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.browseRow}
                    onPress={() => void enterMoveDest(item.path)}
                  >
                    <Text style={styles.browseRowIcon}>📁</Text>
                    <Text style={styles.browseRowName}>{item.name}</Text>
                  </Pressable>
                )}
              />
            )}

            <View style={styles.browseFooter}>
              <Pressable style={styles.browseFooterBtn} onPress={moveDestParent}>
                <Text style={styles.browseFooterText}>Up</Text>
              </Pressable>
              <Pressable
                style={[styles.browseFooterBtn, styles.browseSelectBtn]}
                onPress={() => void confirmMove()}
              >
                <Text style={styles.browseSelectText}>Move here</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    ),
    [
      actionEntry,
      actionSheetActions,
      cancelMove,
      cancelRename,
      closeActionSheet,
      colors.iconAccent,
      colors.placeholder,
      confirmMove,
      enterMoveDest,
      moveDestEntries,
      moveDestLoading,
      moveDestParent,
      moveDestPath,
      moveDestRoots,
      moveTarget,
      renameName,
      renameTarget,
      styles,
      submitRename,
    ]
  );

  return {
    openEntryActions,
    OperationModals,
  };
}
