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
import { BrowseEntry, BrowseRoot, FileEntry } from "../types/protocol";
import {
  dirname,
  isAbsolutePcPath,
  joinPath,
  parentPath,
  pathLabel,
} from "../utils/paths";

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

function driveRoot(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]:)/);
  return match ? `${match[1]}/` : path;
}

function breadcrumbSegments(current: string): { label: string; path: string }[] {
  if (!isAbsolutePcPath(current)) {
    if (current === ".") return [];
    return current
      .split("/")
      .filter(Boolean)
      .map((part, index, parts) => ({
        label: part,
        path: parts.slice(0, index + 1).join("/"),
      }));
  }

  const normalized = current.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return [];

  const root = `${parts[0]}/`;
  const segments: { label: string; path: string }[] = [{ label: parts[0], path: root }];

  for (let i = 1; i < parts.length; i++) {
    segments.push({
      label: parts[i],
      path: `${parts.slice(0, i + 1).join("/")}`,
    });
  }

  return segments;
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
  const [promptKind, setPromptKind] = useState<"file" | "folder" | "rename">("file");
  const [promptName, setPromptName] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);

  const [browseVisible, setBrowseVisible] = useState(false);
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<BrowseEntry[]>([]);
  const [browseRoots, setBrowseRoots] = useState<BrowseRoot[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [moveTarget, setMoveTarget] = useState<FileEntry | null>(null);
  const [moveDestPath, setMoveDestPath] = useState<string | null>(null);
  const [moveDestEntries, setMoveDestEntries] = useState<BrowseEntry[]>([]);
  const [moveDestRoots, setMoveDestRoots] = useState<BrowseRoot[]>([]);
  const [moveDestLoading, setMoveDestLoading] = useState(false);

  const inPcFolder = isAbsolutePcPath(currentPath);

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
        onError(null);
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

  const deleteEntry = async (entry: FileEntry) => {
    try {
      await papatClient.deletePath(entry.path);
      await loadDirectory(currentPath, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete");
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
          onPress: () => void deleteEntry(entry),
        },
      ]
    );
  };

  const showEntryActions = (entry: FileEntry) => {
    Alert.alert(entry.name, undefined, [
      {
        text: "Rename",
        onPress: () => {
          setRenameTarget(entry);
          setPromptKind("rename");
          setPromptName(entry.name);
          setPromptVisible(true);
        },
      },
      {
        text: "Move",
        onPress: () => void startMove(entry),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(entry),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const promptNewItem = (kind: "file" | "folder") => {
    setPromptKind(kind);
    setPromptName("");
    setRenameTarget(null);
    setPromptVisible(true);
  };

  const submitPrompt = async () => {
    const name = promptName.trim();
    if (!name) return;

    setPromptVisible(false);

    if (promptKind === "rename" && renameTarget) {
      const dest = joinPath(dirname(renameTarget.path), name);
      try {
        await papatClient.movePath(renameTarget.path, dest);
        await loadDirectory(currentPath, true);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to rename");
      } finally {
        setRenameTarget(null);
      }
      return;
    }

    const base = currentPath === "." ? "." : currentPath;
    const newPath = joinPath(base, name);

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
    if (isAbsolutePcPath(browsePath)) {
      const parent = parentPath(browsePath.replace(/\\/g, "/"));
      if (parent !== browsePath) {
        void enterBrowseFolder(parent);
      }
      return;
    }
    const parts = browsePath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    void enterBrowseFolder(`/${parts.join("/")}`);
  };

  const openBrowsedFolder = () => {
    if (!browsePath) return;
    setBrowseVisible(false);
    setCurrentPath(browsePath.replace(/\\/g, "/"));
  };

  const startMove = async (entry: FileEntry) => {
    setMoveTarget(entry);
    setMoveDestLoading(true);

    try {
      const roots = await papatClient.getBrowseRoots();
      setMoveDestRoots(roots.roots);
      const first = roots.roots[0]?.path;
      if (first) {
        const listing = await papatClient.browseList(first);
        setMoveDestPath(listing.path);
        setMoveDestEntries(listing.entries);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open move picker");
      setMoveTarget(null);
    } finally {
      setMoveDestLoading(false);
    }
  };

  const enterMoveDest = async (path: string) => {
    setMoveDestLoading(true);
    try {
      const listing = await papatClient.browseList(path);
      setMoveDestPath(listing.path);
      setMoveDestEntries(listing.entries);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open folder");
    } finally {
      setMoveDestLoading(false);
    }
  };

  const moveDestParent = () => {
    if (!moveDestPath) return;
    const parent = parentPath(moveDestPath.replace(/\\/g, "/"));
    if (parent !== moveDestPath) {
      void enterMoveDest(parent);
    }
  };

  const confirmMove = async () => {
    if (!moveTarget || !moveDestPath) return;

    const dest = joinPath(moveDestPath.replace(/\\/g, "/"), moveTarget.name);
    try {
      await papatClient.movePath(moveTarget.path, dest);
      setMoveTarget(null);
      setMoveDestPath(null);
      await loadDirectory(currentPath, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to move");
    }
  };

  const cancelMove = () => {
    setMoveTarget(null);
    setMoveDestPath(null);
  };

  const crumbs = breadcrumbSegments(currentPath);
  const canGoUp =
    inPcFolder
      ? currentPath.replace(/\\/g, "/").replace(/\/+$/, "") !== driveRoot(currentPath)
      : currentPath !== ".";

  const locationTitle = inPcFolder
    ? "PC folder"
    : workspaceName
      ? workspaceName
      : "Workspace";

  const promptTitle =
    promptKind === "rename"
      ? "Rename"
      : promptKind === "file"
        ? "New File"
        : "New Folder";

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarInfo}>
          <Text style={styles.sectionTitle}>{locationTitle}</Text>
          {inPcFolder ? (
            <Text style={styles.workspacePath} numberOfLines={1}>
              {currentPath}
            </Text>
          ) : workspacePath ? (
            <Text style={styles.workspacePath} numberOfLines={1}>
              {workspacePath}
            </Text>
          ) : null}
        </View>
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.toolBtn, !isConnected && styles.btnDisabled]}
            onPress={startBrowse}
            disabled={!isConnected}
          >
            <Text style={styles.toolBtnText}>Browse PC</Text>
          </Pressable>
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
        {inPcFolder ? (
          <Pressable onPress={() => setCurrentPath(".")}>
            <Text style={styles.crumbMuted}>workspace</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setCurrentPath(".")}>
            <Text style={[styles.crumb, crumbs.length === 0 && styles.crumbActive]}>
              workspace
            </Text>
          </Pressable>
        )}
        {inPcFolder ? (
          <>
            <Text style={styles.crumbSep}> · </Text>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={crumb.path}>
                {index > 0 ? <Text style={styles.crumbSep}>/</Text> : null}
                <Pressable onPress={() => setCurrentPath(crumb.path)}>
                  <Text
                    style={[
                      styles.crumb,
                      index === crumbs.length - 1 && styles.crumbActive,
                    ]}
                  >
                    {crumb.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </>
        ) : (
          crumbs.map((crumb) => (
            <React.Fragment key={crumb.path}>
              <Text style={styles.crumbSep}>/</Text>
              <Pressable onPress={() => setCurrentPath(crumb.path)}>
                <Text
                  style={[
                    styles.crumb,
                    crumb.path === currentPath && styles.crumbActive,
                  ]}
                >
                  {crumb.label}
                </Text>
              </Pressable>
            </React.Fragment>
          ))
        )}
      </View>

      <Text style={styles.hint}>
        Tap to open · Long-press for rename, move, or delete
      </Text>

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
              {isConnected
                ? `No files in ${pathLabel(currentPath)}`
                : "Connect to browse files"}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => openFile(item)}
              onLongPress={() => showEntryActions(item)}
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

      {canGoUp ? (
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
            <Text style={styles.promptTitle}>{promptTitle}</Text>
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
                onPress={() => {
                  setPromptVisible(false);
                  setRenameTarget(null);
                }}
              >
                <Text style={styles.promptBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.promptBtn, styles.promptBtnPrimary]}
                onPress={() => void submitPrompt()}
              >
                <Text style={styles.promptBtnPrimaryText}>
                  {promptKind === "rename" ? "Rename" : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                onPress={() => void enterBrowseFolder(root.path)}
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
                  onPress={() => void enterBrowseFolder(item.path)}
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
              onPress={openBrowsedFolder}
            >
              <Text style={styles.browseSelectText}>Open here</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!moveTarget} animationType="slide">
        <View style={styles.browseModal}>
          <View style={styles.browseHeader}>
            <Text style={styles.browseTitle}>
              Move {moveTarget?.name ?? ""}
            </Text>
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
            <ActivityIndicator color="#58a6ff" style={styles.loader} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    marginBottom: 8,
  },
  toolbarInfo: {
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
  },
  toolbarActions: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    marginBottom: 4,
  },
  crumb: {
    color: "#58a6ff",
    fontSize: 13,
  },
  crumbActive: {
    color: "#f0f6fc",
    fontWeight: "600",
  },
  crumbMuted: {
    color: "#6e7681",
    fontSize: 13,
  },
  crumbSep: {
    color: "#484f58",
    fontSize: 13,
  },
  hint: {
    color: "#6e7681",
    fontSize: 11,
    marginBottom: 8,
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
    flexWrap: "wrap",
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
  browseModal: {
    flex: 1,
    backgroundColor: "#010409",
    paddingTop: Platform.OS === "ios" ? 48 : 24,
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
    flex: 1,
    marginRight: 8,
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
