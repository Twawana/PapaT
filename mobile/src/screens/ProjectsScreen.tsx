import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { papatClient } from "../services/websocket";
import { BrowseEntry, BrowseRoot, EditorId, RecentFolder } from "../types/protocol";

interface Props {
  isConnected: boolean;
  vscodeConnected: boolean;
  workspacePath: string | null;
  onWorkspaceChange: (path: string, name: string) => void;
  onError: (message: string | null) => void;
}

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectsScreen({
  isConnected,
  vscodeConnected,
  workspacePath,
  onWorkspaceChange,
  onError,
}: Props) {
  const [recent, setRecent] = useState<RecentFolder[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<EditorId | "workspace" | null>(null);

  const [browseVisible, setBrowseVisible] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<BrowseEntry[]>([]);
  const [browseRoots, setBrowseRoots] = useState<BrowseRoot[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const loadRecent = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    try {
      const result = await papatClient.getWorkspaceRecent();
      setRecent(result.recent);
      setSelectedPath((prev) => prev ?? result.current);
      onWorkspaceChange(result.current, result.recent[0]?.name ?? "workspace");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load recent folders");
    } finally {
      setLoading(false);
    }
  }, [isConnected, onError, onWorkspaceChange]);

  useEffect(() => {
    if (isConnected) {
      loadRecent();
    } else {
      setRecent([]);
      setSelectedPath(null);
    }
  }, [isConnected, loadRecent]);

  useEffect(() => {
    if (workspacePath) {
      setSelectedPath(workspacePath);
    }
  }, [workspacePath]);

  const openProject = async (path: string, editor?: EditorId) => {
    try {
      setOpening(editor ?? "workspace");
      const result = await papatClient.openProject(path, editor);
      setSelectedPath(result.path);
      onWorkspaceChange(result.path, result.name);
      await loadRecent();
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open project");
    } finally {
      setOpening(null);
    }
  };

  const startBrowse = async () => {
    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }

    setBrowseVisible(true);
    setBrowseLoading(true);

    try {
      const roots = await papatClient.getBrowseRoots();
      setBrowseRoots(roots.roots);
      const first = roots.roots[0]?.path;
      if (first) {
        const listing = await papatClient.browseList(first);
        setBrowsePath(listing.path);
        setBrowseEntries(listing.entries);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to browse folders");
      setBrowseVisible(false);
    } finally {
      setBrowseLoading(false);
    }
  };

  const enterBrowseFolder = async (path: string) => {
    setBrowseLoading(true);
    try {
      const listing = await papatClient.browseList(path);
      setBrowsePath(listing.path);
      setBrowseEntries(listing.entries);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open folder");
    } finally {
      setBrowseLoading(false);
    }
  };

  const browseParent = () => {
    if (!browsePath) return;
    const parts = browsePath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 1) {
      return;
    }
    parts.pop();
    const parent =
      browsePath.includes(":\\") || browsePath.match(/^[A-Za-z]:/)
        ? `${parts[0]}:/${parts.slice(1).join("/")}`.replace(/\//g, "\\")
        : `/${parts.join("/")}`;
    enterBrowseFolder(parent);
  };

  const selectBrowsedFolder = () => {
    if (!browsePath) return;
    setBrowseVisible(false);
    void openProject(browsePath, vscodeConnected ? "vscode" : undefined);
  };

  const selectedName =
    recent.find((item) => item.path === selectedPath)?.name ||
    selectedPath?.split(/[/\\]/).pop() ||
    "No folder selected";

  return (
    <View style={styles.container}>
      <View style={styles.currentCard}>
        <Text style={styles.cardLabel}>Active workspace</Text>
        <Text style={styles.currentName}>{selectedName}</Text>
        {vscodeConnected ? (
          <Text style={styles.vscodeBadge}>VS Code linked on your PC</Text>
        ) : isConnected ? (
          <Text style={styles.vscodeHint}>
            Install the PapaT VS Code extension to link your editor
          </Text>
        ) : null}
        {selectedPath ? (
          <Text style={styles.currentPath} numberOfLines={2}>
            {selectedPath}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[
            styles.editorBtn,
            styles.vscodeBtn,
            (!selectedPath || opening) && styles.btnDisabled,
          ]}
          disabled={!selectedPath || !!opening}
          onPress={() => selectedPath && openProject(selectedPath, "vscode")}
        >
          <Text style={styles.editorBtnText}>
            {opening === "vscode" ? "Opening..." : "Open in VS Code"}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.editorBtn,
            styles.cursorBtn,
            (!selectedPath || opening) && styles.btnDisabled,
          ]}
          disabled={!selectedPath || !!opening}
          onPress={() => selectedPath && openProject(selectedPath, "cursor")}
        >
          <Text style={styles.editorBtnText}>
            {opening === "cursor" ? "Opening..." : "Open in Cursor"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.secondaryActions}>
        <Pressable
          style={[styles.secondaryBtn, (!selectedPath || opening) && styles.btnDisabled]}
          disabled={!selectedPath || !!opening}
          onPress={() => selectedPath && openProject(selectedPath)}
        >
          <Text style={styles.secondaryBtnText}>
            {opening === "workspace" ? "Switching..." : "Use as workspace only"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryBtn, !isConnected && styles.btnDisabled]}
          disabled={!isConnected}
          onPress={startBrowse}
        >
          <Text style={styles.secondaryBtnText}>Browse PC folders</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Recent folders</Text>

      {loading ? (
        <ActivityIndicator color="#58a6ff" style={styles.loader} />
      ) : (
        <FlatList
          data={recent}
          keyExtractor={(item) => item.path}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {isConnected
                ? "No recent folders yet. Browse your PC to pick a project."
                : "Connect to see recent folders"}
            </Text>
          }
          renderItem={({ item }) => {
            const active = item.path === selectedPath;
            return (
              <Pressable
                style={[styles.recentRow, active && styles.recentRowActive]}
                onPress={() => setSelectedPath(item.path)}
                onLongPress={() => openProject(item.path, "vscode")}
              >
                <Text style={styles.recentIcon}>📁</Text>
                <View style={styles.recentBody}>
                  <Text style={styles.recentName}>{item.name}</Text>
                  <Text style={styles.recentPath} numberOfLines={1}>
                    {item.path}
                  </Text>
                  <Text style={styles.recentMeta}>
                    Opened {formatWhen(item.lastOpened)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={browseVisible} animationType="slide">
        <View style={styles.browseModal}>
          <View style={styles.browseHeader}>
            <Text style={styles.browseTitle}>Browse PC</Text>
            <Pressable onPress={() => setBrowseVisible(false)}>
              <Text style={styles.browseClose}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.rootRow}>
            {browseRoots.map((root) => (
              <Pressable
                key={root.path}
                style={styles.rootChip}
                onPress={() => enterBrowseFolder(root.path)}
              >
                <Text style={styles.rootChipText}>{root.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.browsePath} numberOfLines={2}>
            {browsePath ?? ""}
          </Text>

          {browseLoading ? (
            <ActivityIndicator color="#58a6ff" style={styles.loader} />
          ) : (
            <FlatList
              data={browseEntries}
              keyExtractor={(item) => item.path}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.browseRow}
                  onPress={() => enterBrowseFolder(item.path)}
                >
                  <Text style={styles.browseRowIcon}>📁</Text>
                  <Text style={styles.browseRowName}>{item.name}</Text>
                </Pressable>
              )}
            />
          )}

          <View style={styles.browseFooter}>
            <Pressable style={styles.browseFooterBtn} onPress={browseParent}>
              <Text style={styles.browseFooterText}>Up</Text>
            </Pressable>
            <Pressable
              style={[styles.browseFooterBtn, styles.browseSelectBtn]}
              onPress={selectBrowsedFolder}
            >
              <Text style={styles.browseSelectText}>Select this folder</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  currentCard: {
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    color: "#8b949e",
    fontSize: 12,
    marginBottom: 4,
  },
  currentName: {
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
  },
  vscodeBadge: {
    color: "#3fb950",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  vscodeHint: {
    color: "#8b949e",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  currentPath: {
    color: "#8b949e",
    fontSize: 12,
    marginTop: 6,
  },
  actions: {
    gap: 8,
    marginBottom: 8,
  },
  editorBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cursorBtn: {
    backgroundColor: "#6e40c9",
  },
  vscodeBtn: {
    backgroundColor: "#1f6feb",
  },
  editorBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryActions: {
    gap: 8,
    marginBottom: 16,
  },
  secondaryBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  secondaryBtnText: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 13,
  },
  sectionTitle: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 8,
  },
  loader: {
    marginTop: 16,
  },
  empty: {
    color: "#8b949e",
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
    borderRadius: 8,
  },
  recentRowActive: {
    backgroundColor: "#161b22",
    borderColor: "#1f6feb",
    borderWidth: 1,
  },
  recentIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 2,
  },
  recentBody: {
    flex: 1,
  },
  recentName: {
    color: "#f0f6fc",
    fontSize: 15,
    fontWeight: "600",
  },
  recentPath: {
    color: "#8b949e",
    fontSize: 12,
    marginTop: 2,
  },
  recentMeta: {
    color: "#6e7681",
    fontSize: 11,
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  browseModal: {
    flex: 1,
    backgroundColor: "#010409",
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  browseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  browseTitle: {
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
  },
  browseClose: {
    color: "#58a6ff",
    fontWeight: "600",
  },
  rootRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  rootChip: {
    backgroundColor: "#21262d",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  rootChipText: {
    color: "#c9d1d9",
    fontSize: 12,
    fontWeight: "600",
  },
  browsePath: {
    color: "#8b949e",
    fontSize: 12,
    marginBottom: 8,
  },
  browseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
  },
  browseRowIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  browseRowName: {
    color: "#f0f6fc",
    fontSize: 15,
  },
  browseFooter: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
  },
  browseFooterBtn: {
    flex: 1,
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  browseFooterText: {
    color: "#c9d1d9",
    fontWeight: "600",
  },
  browseSelectBtn: {
    backgroundColor: "#238636",
    borderColor: "#238636",
    flex: 2,
  },
  browseSelectText: {
    color: "#fff",
    fontWeight: "700",
  },
});
