import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { titusClient } from "../services/websocket";
import { useTheme } from "../context/ThemeContext";
import { dismissKeyboard, keyboardPersistTaps } from "../utils/keyboard";
import { useTabBarInset } from "../hooks/useTabBarInset";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { GitFileStatus, GitStatusResult } from "../types/protocol";

interface Props {
  isConnected: boolean;
  onError: (message: string | null) => void;
  onOpenFile?: (path: string) => void;
}

function statusLabel(file: GitFileStatus): string {
  const code = `${file.index}${file.working}`;
  const map: Record<string, string> = {
    "??": "Untracked",
    MM: "Modified",
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
  };
  return map[code.trim()] ?? (code.trim() || "Changed");
}

export default function GitScreen({ isConnected, onError, onOpenFile }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    flex: { flex: 1 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    hint: {
      color: c.textMuted,
      textAlign: "center",
      marginVertical: 8,
    },
    hintSub: {
      color: c.placeholder,
      textAlign: "center",
      fontSize: 12,
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      gap: 8,
    },
    headerInfo: {
      flex: 1,
    },
    branch: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    meta: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    actionRow: {
      maxHeight: 44,
      marginBottom: 8,
    },
    actionChip: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 6,
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 72,
      alignItems: "center",
    },
    actionChipBusy: {
      borderColor: c.buttonPrimary,
    },
    actionChipText: {
      color: c.link,
      fontSize: 12,
      fontWeight: "600",
    },
    btn: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    btnText: {
      color: c.textPrimary,
      fontWeight: "600",
      fontSize: 13,
    },
    list: {
      flex: 1,
      marginBottom: 8,
    },
    fileRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.surfaceMuted,
      gap: 8,
    },
    fileStatus: {
      color: c.warning,
      fontSize: 11,
      fontWeight: "700",
      width: 72,
    },
    filePath: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 13,
    },
    stageBtn: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: c.buttonSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    stageText: {
      color: c.success,
      fontSize: 18,
      lineHeight: 20,
    },
    commitBox: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
      gap: 8,
    },
    commitInput: {
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      color: c.textPrimary,
      padding: 10,
      minHeight: 56,
      fontSize: 14,
      textAlignVertical: "top",
    },
    commitBtn: {
      backgroundColor: c.buttonSuccess,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    commitBtnText: {
      color: c.onPrimary,
      fontWeight: "700",
    },
    disabled: { opacity: 0.5 },
    outputBox: {
      maxHeight: 160,
      marginTop: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
    },
    outputTitle: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 4,
      fontWeight: "600",
    },
    outputScroll: {
      maxHeight: 110,
    },
    outputText: {
      color: c.textSecondary,
      fontFamily: "monospace",
      fontSize: 11,
      lineHeight: 16,
    },
    linkBtn: {
      marginTop: 4,
    },
    linkText: {
      color: c.link,
      fontSize: 12,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: `${c.shadow}BF`,
      justifyContent: "center",
      padding: 24,
    },
    modalSheet: {
      backgroundColor: c.surfaceElevated,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalTitle: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 4,
    },
    modalHint: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 12,
    },
    modalInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      color: c.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 12,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
  }));
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [outputTitle, setOutputTitle] = useState<string | null>(null);
  const [outputText, setOutputText] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [newBranchName, setNewBranchName] = useState("my-feature");
  const tabBarInset = useTabBarInset();

  const loadStatus = useCallback(
    async (isRefresh = false) => {
      if (!isConnected) {
        onError("Connect to your PC first");
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await titusClient.gitStatus();
        setStatus(result.status);
        onError(null);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Git status failed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isConnected, onError]
  );

  useEffect(() => {
    if (isConnected) {
      void loadStatus();
    } else {
      setStatus(null);
      setOutputText(null);
      setOutputTitle(null);
    }
  }, [isConnected, loadStatus]);

  const showOutput = (title: string, text: string) => {
    setOutputTitle(title);
    setOutputText(text);
  };

  const runAction = async (label: string, task: () => Promise<{ output: string }>) => {
    setActionLoading(label);
    try {
      const result = await task();
      showOutput(label, result.output);
      onError(null);
      await loadStatus(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  const showDiff = async (path?: string) => {
    try {
      const result = await titusClient.gitDiff(path);
      setOutputTitle(path ? `Diff: ${path}` : "Diff");
      setOutputText(result.diff);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Git diff failed");
    }
  };

  const stageAll = async () => {
    try {
      await titusClient.gitAdd();
      await loadStatus(true);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Git add failed");
    }
  };

  const stageFile = async (path: string) => {
    try {
      await titusClient.gitAdd([path]);
      await loadStatus(true);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Git add failed");
    }
  };

  const commit = async () => {
    if (!commitMessage.trim()) {
      onError("Enter a commit message");
      return;
    }
    setCommitting(true);
    try {
      const result = await titusClient.gitCommit(commitMessage.trim());
      setCommitMessage("");
      showOutput("Commit", result.output);
      await loadStatus(true);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Git commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const confirmMergeMain = () => {
    Alert.alert(
      "Merge main",
      "Merge branch main into the current branch?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          onPress: () => void runAction("Merge main", () => titusClient.gitMerge("main")),
        },
      ]
    );
  };

  const createBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      onError("Enter a branch name");
      return;
    }
    setBranchModalVisible(false);
    dismissKeyboard();
    await runAction(`Branch ${name}`, () => titusClient.gitCheckout(name, true));
  };

  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Connect to your PC to use Git</Text>
      </View>
    );
  }

  if (loading && !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.iconAccent} />
      </View>
    );
  }

  if (!status?.isRepo) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Workspace is not a Git repository</Text>
        <Text style={styles.hintSub}>Open your project root (folder with .git) on the Open tab</Text>
        <Pressable style={styles.btn} onPress={() => void loadStatus()}>
          <Text style={styles.btnText}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  const actions = [
    { id: "pull", label: "Pull", run: () => runAction("Pull", () => titusClient.gitPull()) },
    { id: "push", label: "Push", run: () => runAction("Push", () => titusClient.gitPush()) },
    {
      id: "branch",
      label: "New branch",
      run: () => {
        setNewBranchName("my-feature");
        setBranchModalVisible(true);
      },
    },
    {
      id: "log",
      label: "Log",
      run: () => runAction("Log", () => titusClient.gitLog(10)),
    },
    {
      id: "stash",
      label: "Stash",
      run: () => runAction("Stash", () => titusClient.gitStash()),
    },
    { id: "merge", label: "Merge main", run: confirmMergeMain },
  ] as const;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.branch}>{status.branch}</Text>
          <Text style={styles.meta}>
            {status.clean ? "Clean working tree" : `${status.files.length} changed`}
            {status.ahead ? ` · ↑${status.ahead}` : ""}
            {status.behind ? ` · ↓${status.behind}` : ""}
          </Text>
        </View>
        <Pressable style={styles.btn} onPress={() => void stageAll()}>
          <Text style={styles.btnText}>Stage All</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionRow}
        keyboardShouldPersistTaps={keyboardPersistTaps}
      >
        {actions.map((action) => (
          <Pressable
            key={action.id}
            style={[styles.actionChip, actionLoading === action.label && styles.actionChipBusy]}
            onPress={() => void action.run()}
            disabled={!!actionLoading && actionLoading !== action.label}
          >
            {actionLoading === action.label ? (
              <ActivityIndicator color={colors.iconAccent} size="small" />
            ) : (
              <Text style={styles.actionChipText}>{action.label}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        style={styles.list}
        data={status.files}
        keyExtractor={(item) => item.path}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps={keyboardPersistTaps}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={dismissKeyboard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadStatus(true)} />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.fileRow}
            onPress={() => void showDiff(item.path)}
            onLongPress={() => onOpenFile?.(item.path)}
          >
            <Text style={styles.fileStatus}>{statusLabel(item)}</Text>
            <Text style={styles.filePath} numberOfLines={1}>
              {item.path}
            </Text>
            <Pressable style={styles.stageBtn} onPress={() => void stageFile(item.path)}>
              <Text style={styles.stageText}>+</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.hint}>No changes</Text>}
      />

      <View style={[styles.commitBox, { marginBottom: tabBarInset }]}>
        <TextInput
          style={styles.commitInput}
          value={commitMessage}
          onChangeText={setCommitMessage}
          placeholder="Commit message"
          placeholderTextColor={colors.placeholder}
          multiline
        />
        <Pressable
          style={[styles.commitBtn, committing && styles.disabled]}
          onPress={() => void commit()}
          disabled={committing}
        >
          <Text style={styles.commitBtnText}>{committing ? "Committing…" : "Commit"}</Text>
        </Pressable>
      </View>

      {outputText ? (
        <View style={styles.outputBox}>
          <Text style={styles.outputTitle}>{outputTitle ?? "Output"}</Text>
          <ScrollView style={styles.outputScroll}>
            <Text style={styles.outputText} selectable>
              {outputText}
            </Text>
          </ScrollView>
          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              setOutputText(null);
              setOutputTitle(null);
            }}
          >
            <Text style={styles.linkText}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={branchModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setBranchModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>New branch</Text>
            <Text style={styles.modalHint}>Runs git checkout -b …</Text>
            <TextInput
              style={styles.modalInput}
              value={newBranchName}
              onChangeText={setNewBranchName}
              placeholder="my-feature"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.btn} onPress={() => setBranchModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.commitBtn} onPress={() => void createBranch()}>
                <Text style={styles.commitBtnText}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
