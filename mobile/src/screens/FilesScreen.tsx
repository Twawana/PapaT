import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { papatClient } from "../services/websocket";
import { FileEntry } from "../types/protocol";

interface Props {
  isConnected: boolean;
  vscodeConnected?: boolean;
  workspaceName?: string;
  workspacePath?: string | null;
  onError: (message: string | null) => void;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function joinPath(dir: string, name: string): string {
  if (dir === "." || dir === "") return name;
  return `${dir}/${name}`.replace(/\/+/g, "/");
}

function parentPath(current: string): string {
  if (current === "." || current === "") return ".";
  const parts = current.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "." : parts.join("/");
}

export default function FilesScreen({
  isConnected,
  vscodeConnected = false,
  workspaceName,
  workspacePath,
  onError,
}: Props) {
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorPath, setEditorPath] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingVscode, setOpeningVscode] = useState(false);

  const [promptVisible, setPromptVisible] = useState(false);
  const [promptKind, setPromptKind] = useState<"file" | "folder">("file");
  const [promptName, setPromptName] = useState("");

  const loadDirectory = useCallback(
    async (path: string, isRefresh = false) => {
      if (!isConnected) {
        onError("Connect to your PC first");
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await papatClient.listDir(path);
        setCurrentPath(result.path || ".");
        setEntries(result.entries);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to list files");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isConnected, onError]
  );

  useEffect(() => {
    if (isConnected) {
      loadDirectory(currentPath);
    } else {
      setEntries([]);
    }
  }, [isConnected, currentPath, loadDirectory]);

  const openFile = async (entry: FileEntry) => {
    if (entry.entryType === "directory") {
      setCurrentPath(entry.path);
      return;
    }

    try {
      setLoading(true);
      const result = await papatClient.readFile(entry.path);
      setEditorPath(result.path);
      setEditorContent(result.content);
      setEditorDirty(false);
      setEditorVisible(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  const openInVscode = async (path: string) => {
    try {
      setOpeningVscode(true);
      const result = await papatClient.openInVscode(path);
      if (!result.ok) {
        onError(result.message ?? "VS Code is not connected");
      } else {
        onError(null);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open in VS Code");
    } finally {
      setOpeningVscode(false);
    }
  };

  const saveFile = async () => {
    try {
      setSaving(true);
      await papatClient.writeFile(editorPath, editorContent, false);
      setEditorDirty(false);
      setEditorVisible(false);
      await loadDirectory(currentPath, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (entry: FileEntry) => {
    Alert.alert(
      "Delete",
      `Delete ${entry.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await papatClient.deletePath(entry.path);
              await loadDirectory(currentPath, true);
            } catch (err) {
              onError(
                err instanceof Error ? err.message : "Failed to delete"
              );
            }
          },
        },
      ]
    );
  };

  const promptNewItem = (kind: "file" | "folder") => {
    setPromptKind(kind);
    setPromptName("");
    setPromptVisible(true);
  };

  const submitNewItem = async () => {
    const name = promptName.trim();
    if (!name) return;

    setPromptVisible(false);
    const newPath = joinPath(currentPath === "." ? "" : currentPath, name);

    try {
      if (promptKind === "file") {
        await papatClient.writeFile(newPath, "", true);
      } else {
        await papatClient.mkdir(newPath);
      }
      await loadDirectory(currentPath, true);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : `Failed to create ${promptKind}`
      );
    }
  };

  const pathParts =
    currentPath === "."
      ? []
      : currentPath.split("/").filter(Boolean);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View>
          <Text style={styles.sectionTitle}>
            {workspaceName ? workspaceName : "PC Workspace"}
          </Text>
          {workspacePath ? (
            <Text style={styles.workspacePath} numberOfLines={1}>
              {workspacePath}
            </Text>
          ) : null}
        </View>
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.toolBtn, !isConnected && styles.btnDisabled]}
            onPress={() => loadDirectory(currentPath, true)}
            disabled={!isConnected}
          >
            <Text style={styles.toolBtnText}>Sync</Text>
          </Pressable>
          <Pressable
            style={[styles.toolBtn, !isConnected && styles.btnDisabled]}
            onPress={() => promptNewItem("folder")}
            disabled={!isConnected}
          >
            <Text style={styles.toolBtnText}>+ Folder</Text>
          </Pressable>
          <Pressable
            style={[styles.toolBtn, !isConnected && styles.btnDisabled]}
            onPress={() => promptNewItem("file")}
            disabled={!isConnected}
          >
            <Text style={styles.toolBtnText}>+ File</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.breadcrumb}>
        <Pressable onPress={() => setCurrentPath(".")}>
          <Text style={styles.crumb}>workspace</Text>
        </Pressable>
        {pathParts.map((part, index) => {
          const path = pathParts.slice(0, index + 1).join("/");
          return (
            <React.Fragment key={path}>
              <Text style={styles.crumbSep}>/</Text>
              <Pressable onPress={() => setCurrentPath(path)}>
                <Text style={styles.crumb}>{part}</Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color="#58a6ff" style={styles.loader} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadDirectory(currentPath, true)}
              tintColor="#58a6ff"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {isConnected ? "No files in this folder" : "Connect to browse files"}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => openFile(item)}
              onLongPress={() => confirmDelete(item)}
            >
              <Text style={styles.rowIcon}>
                {item.entryType === "directory" ? "📁" : "📄"}
              </Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.entryType === "file" ? formatSize(item.size) : "folder"}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {currentPath !== "." ? (
        <Pressable
          style={styles.backBtn}
          onPress={() => setCurrentPath(parentPath(currentPath))}
        >
          <Text style={styles.backBtnText}>↑ Up</Text>
        </Pressable>
      ) : null}

      <Modal visible={editorVisible} animationType="slide">
        <View style={styles.editorModal}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle} numberOfLines={1}>
              {editorPath}
            </Text>
            <View style={styles.editorActions}>
              {vscodeConnected ? (
                <Pressable
                  style={[styles.editorBtn, openingVscode && styles.btnDisabled]}
                  onPress={() => openInVscode(editorPath)}
                  disabled={openingVscode}
                >
                  <Text style={styles.editorBtnText}>
                    {openingVscode ? "Opening..." : "VS Code"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.editorBtn}
                onPress={() => setEditorVisible(false)}
              >
                <Text style={styles.editorBtnText}>Close</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editorBtn,
                  styles.saveBtn,
                  (!editorDirty || saving) && styles.btnDisabled,
                ]}
                onPress={saveFile}
                disabled={!editorDirty || saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "Saving..." : "Save to PC"}
                </Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            style={styles.editor}
            value={editorContent}
            onChangeText={(text) => {
              setEditorContent(text);
              setEditorDirty(true);
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
          />
        </View>
      </Modal>

      <Modal visible={promptVisible} transparent animationType="fade">
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>
              {promptKind === "file" ? "New File" : "New Folder"}
            </Text>
            <TextInput
              style={styles.promptInput}
              value={promptName}
              onChangeText={setPromptName}
              placeholder="name"
              placeholderTextColor="#484f58"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.promptActions}>
              <Pressable
                style={styles.promptBtn}
                onPress={() => setPromptVisible(false)}
              >
                <Text style={styles.promptBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.promptBtn, styles.promptBtnPrimary]}
                onPress={submitNewItem}
              >
                <Text style={styles.promptBtnPrimaryText}>Create</Text>
              </Pressable>
            </View>
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
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 14,
  },
  workspacePath: {
    color: "#6e7681",
    fontSize: 11,
    marginTop: 2,
    maxWidth: 180,
  },
  toolbarActions: {
    flexDirection: "row",
    gap: 8,
  },
  toolBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  toolBtnText: {
    color: "#c9d1d9",
    fontSize: 12,
    fontWeight: "600",
  },
  breadcrumb: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 8,
  },
  crumb: {
    color: "#58a6ff",
    fontSize: 13,
  },
  crumbSep: {
    color: "#484f58",
    fontSize: 13,
  },
  loader: {
    marginTop: 24,
  },
  empty: {
    color: "#8b949e",
    textAlign: "center",
    marginTop: 24,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
  },
  rowIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    color: "#f0f6fc",
    fontSize: 15,
  },
  rowMeta: {
    color: "#8b949e",
    fontSize: 12,
    marginTop: 2,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: "#58a6ff",
    fontWeight: "600",
  },
  editorModal: {
    flex: 1,
    backgroundColor: "#010409",
    paddingTop: Platform.OS === "ios" ? 48 : 24,
    paddingHorizontal: 16,
  },
  editorHeader: {
    marginBottom: 12,
  },
  editorTitle: {
    color: "#c9d1d9",
    fontSize: 14,
    marginBottom: 8,
  },
  editorActions: {
    flexDirection: "row",
    gap: 8,
  },
  editorBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  editorBtnText: {
    color: "#c9d1d9",
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#238636",
    borderColor: "#238636",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  editor: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    padding: 12,
    color: "#c9d1d9",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  promptCard: {
    backgroundColor: "#161b22",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  promptTitle: {
    color: "#f0f6fc",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  promptInput: {
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#c9d1d9",
    marginBottom: 12,
  },
  promptActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  promptBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#21262d",
  },
  promptBtnText: {
    color: "#c9d1d9",
    fontWeight: "600",
  },
  promptBtnPrimary: {
    backgroundColor: "#238636",
  },
  promptBtnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
