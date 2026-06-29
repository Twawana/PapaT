import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CodeEditor, CodeEditorHandle } from "../components/CodeEditor";
import { EditorTabs } from "../components/EditorTabs";
import { FileTreePanel } from "../components/FileTreePanel";
import { FindBar } from "../components/FindBar";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { ProblemsPanel } from "../components/ProblemsPanel";
import { QuickOpenModal } from "../components/QuickOpenModal";
import { TerminalOutput } from "../components/TerminalOutput";
import { WorkspaceSearchPanel } from "../components/WorkspaceSearchPanel";
import { editorModeFromPath, useEditor } from "../context/EditorContext";
import { useTheme } from "../context/ThemeContext";
import { useTabBarInset } from "../hooks/useTabBarInset";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { titusClient } from "../services/websocket";
import { snippetsForLanguage } from "../services/snippets";
import {
  DiagnosticItem,
  ExecuteLanguage,
  ExecutionState,
  PackageScript,
  ServerMessage,
} from "../types/protocol";
import { isImagePath, isMarkdownPath } from "../utils/language";

interface Props {
  isConnected: boolean;
  workspacePath: string | null;
  workspaceName: string;
  onError: (message: string | null) => void;
}

type BottomPanel = "output" | "problems" | "search";

const RUN_LANGUAGES: ExecuteLanguage[] = ["javascript", "typescript", "python", "shell"];

function createExecutionId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CodeScreen({
  isConnected,
  workspacePath,
  workspaceName,
  onError,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    flex: { flex: 1 },
    workspaceBanner: {
      color: c.link,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 6,
    },
    toolbar: {
      maxHeight: 44,
      marginBottom: 8,
    },
    toolBtn: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    toolText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: "600",
    },
    runBtn: {
      backgroundColor: c.buttonPrimary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 6,
    },
    runText: {
      color: c.onPrimary,
      fontWeight: "700",
      fontSize: 12,
    },
    disabled: { opacity: 0.5 },
    queueHint: {
      color: c.warning,
      fontSize: 11,
      marginBottom: 6,
    },
    langRow: {
      maxHeight: 36,
      marginBottom: 8,
    },
    langChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.buttonSecondary,
      marginRight: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    langChipActive: {
      borderColor: c.buttonPrimary,
      backgroundColor: c.surface,
    },
    langChipText: {
      color: c.textMuted,
      fontSize: 11,
      textTransform: "capitalize",
    },
    langChipTextActive: {
      color: c.link,
      fontWeight: "700",
    },
    editorRow: {
      flex: 1,
      flexDirection: "row",
      minHeight: 160,
      marginBottom: 8,
    },
    editorMain: {
      flex: 1,
    },
    placeholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 16,
    },
    placeholderTitle: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
    },
    placeholderText: {
      color: c.textMuted,
      textAlign: "center",
      marginBottom: 12,
      lineHeight: 20,
    },
    placeholderHint: {
      color: c.placeholder,
      fontSize: 12,
      textAlign: "center",
    },
    primaryBtn: {
      backgroundColor: c.buttonPrimary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    primaryBtnText: {
      color: c.onPrimary,
      fontWeight: "700",
    },
    scriptRow: {
      maxHeight: 36,
      marginBottom: 8,
    },
    scriptChip: {
      backgroundColor: c.surfaceElevated,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    scriptText: {
      color: c.link,
      fontSize: 11,
      fontFamily: "monospace",
    },
    bottomTabs: {
      flexDirection: "row",
      marginBottom: 6,
      gap: 6,
    },
    bottomTab: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: c.surfaceElevated,
    },
    bottomTabActive: {
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    bottomTabText: {
      color: c.textMuted,
      fontSize: 12,
    },
    bottomTabTextActive: {
      color: c.textPrimary,
      fontWeight: "600",
    },
    bottomPanel: {
      flex: 1,
      minHeight: 120,
      marginBottom: 4,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: `${c.shadow}B3`,
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
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
    },
    snippetRow: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    snippetLabel: {
      color: c.textSecondary,
      fontSize: 14,
    },
  }));
  const editor = useEditor();
  const editorRef = useRef<CodeEditorHandle>(null);
  const tabBarInset = useTabBarInset();

  const [quickOpen, setQuickOpen] = useState(false);
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [snippetsVisible, setSnippetsVisible] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("output");
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [scripts, setScripts] = useState<PackageScript[]>([]);
  const [execution, setExecution] = useState<ExecutionState>({
    id: null,
    output: "",
    isRunning: false,
    exitCode: null,
  });

  const activeExecutionId = useRef<string | null>(null);
  const activeFile = editor.getActiveFile();

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "output":
          if (message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              output: prev.output + message.data,
            }));
          }
          break;
        case "done":
          if (message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              isRunning: false,
              exitCode: message.exitCode,
            }));
            activeExecutionId.current = null;
          }
          break;
        case "error":
          if (message.id && message.id === activeExecutionId.current) {
            setExecution((prev) => ({
              ...prev,
              output: prev.output + `\n[Error] ${message.message}\n`,
              isRunning: false,
            }));
            activeExecutionId.current = null;
          }
          break;
      }
    },
    []
  );

  useEffect(() => {
    return titusClient.addMessageListener(handleServerMessage);
  }, [handleServerMessage]);

  useEffect(() => {
    if (!isConnected) return;
    void titusClient.listScripts().then((result) => setScripts(result.scripts)).catch(() => {});
    void editor.flushPendingWrites();
  }, [isConnected, editor]);

  const handleRun = () => {
    if (!isConnected || !activeFile) {
      onError("Connect and open a file first");
      return;
    }

    const id = createExecutionId();
    activeExecutionId.current = id;
    setBottomPanel("output");
    setExecution({ id, output: "", isRunning: true, exitCode: null });
    onError(null);

    try {
      titusClient.execute(id, activeFile.content, activeFile.runLanguage);
    } catch (err) {
      setExecution((prev) => ({ ...prev, isRunning: false }));
      onError(err instanceof Error ? err.message : "Failed to execute");
    }
  };

  const handleRunScript = (script: PackageScript) => {
    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }
    const id = createExecutionId();
    activeExecutionId.current = id;
    setBottomPanel("output");
    setExecution({ id, output: "", isRunning: true, exitCode: null });
    titusClient.shellRun(id, `npm run ${script.name}`);
  };

  const handleDiagnostics = async () => {
    if (!isConnected) {
      onError("Connect to your PC first");
      return;
    }
    setBottomPanel("problems");
    setDiagLoading(true);
    try {
      const result = await titusClient.runDiagnostics();
      setDiagnostics(result.items);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Diagnostics failed");
    } finally {
      setDiagLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await editor.saveActive();
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleOpenPath = async (path: string) => {
    try {
      await editor.openFile(path);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const hasWorkspace = !!workspacePath;

  const renderEditorArea = () => {
    if (!hasWorkspace) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>No project open</Text>
          <Text style={styles.placeholderText}>
            Open a folder on the Open tab first. Code, search, and run will use that project.
          </Text>
        </View>
      );
    }

    if (!activeFile) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Mini IDE</Text>
          <Text style={styles.placeholderText}>
            Quick Open, edit with syntax highlighting, run code, and check problems.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => setQuickOpen(true)}>
            <Text style={styles.primaryBtnText}>Quick Open (Ctrl+P)</Text>
          </Pressable>
        </View>
      );
    }

    if (activeFile.loading) {
      return (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.iconAccent} />
        </View>
      );
    }

    if (isImagePath(activeFile.path)) {
      return (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Image file: {activeFile.path.split("/").pop()}
          </Text>
          <Text style={styles.placeholderHint}>
            Open in Files tab or on your PC to view binary images.
          </Text>
        </View>
      );
    }

    if (isMarkdownPath(activeFile.path) && activeFile.previewMode === "markdown") {
      return <MarkdownPreview markdown={activeFile.content} />;
    }

    return (
      <CodeEditor
        ref={editorRef}
        editorKey={activeFile.path}
        value={activeFile.content}
        mode={editorModeFromPath(activeFile.path)}
        onChange={(value) => editor.updateContent(activeFile.path, value)}
      />
    );
  };

  const snippetLanguage = activeFile
    ? editorModeFromPath(activeFile.path)
    : "javascript";

  return (
    <View style={styles.flex}>
      {hasWorkspace ? (
        <Text style={styles.workspaceBanner} numberOfLines={1}>
          Project: {workspaceName}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={() => setQuickOpen(true)}>
          <Text style={styles.toolText}>Open</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setFindVisible((v) => !v)}>
          <Text style={styles.toolText}>Find</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => void handleSave()}>
          <Text style={styles.toolText}>Save</Text>
        </Pressable>
        <Pressable
          style={styles.toolBtn}
          onPress={() => editor.setTreeVisible(!editor.treeVisible)}
        >
          <Text style={styles.toolText}>{editor.treeVisible ? "Hide Tree" : "Tree"}</Text>
        </Pressable>
        {isMarkdownPath(activeFile?.path ?? "") ? (
          <Pressable
            style={styles.toolBtn}
            onPress={() => activeFile && editor.togglePreview(activeFile.path)}
          >
            <Text style={styles.toolText}>Preview</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.toolBtn} onPress={() => setSnippetsVisible(true)}>
          <Text style={styles.toolText}>Snippets</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => void handleDiagnostics()}>
          <Text style={styles.toolText}>Problems</Text>
        </Pressable>
        <Pressable
          style={[styles.runBtn, (!isConnected || execution.isRunning) && styles.disabled]}
          onPress={handleRun}
          disabled={!isConnected || execution.isRunning}
        >
          <Text style={styles.runText}>{execution.isRunning ? "Running…" : "Run"}</Text>
        </Pressable>
      </ScrollView>

      {editor.pendingWrites > 0 ? (
        <Text style={styles.queueHint}>
          {editor.pendingWrites} save(s) queued — reconnect to sync
        </Text>
      ) : null}

      <EditorTabs
        tabs={editor.tabs.map((tab) => ({
          path: tab.path,
          dirty: tab.content !== tab.savedContent,
        }))}
        activePath={editor.activePath}
        onSelect={editor.setActivePath}
        onClose={editor.closeTab}
      />

      <FindBar
        visible={findVisible}
        query={findQuery}
        onChangeQuery={setFindQuery}
        onFindNext={() => editorRef.current?.find(findQuery)}
        onClose={() => setFindVisible(false)}
      />

      {activeFile ? (
        <ScrollView horizontal style={styles.langRow} showsHorizontalScrollIndicator={false}>
          {RUN_LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              style={[styles.langChip, activeFile.runLanguage === lang && styles.langChipActive]}
              onPress={() => editor.setRunLanguage(activeFile.path, lang)}
            >
              <Text
                style={[
                  styles.langChipText,
                  activeFile.runLanguage === lang && styles.langChipTextActive,
                ]}
              >
                {lang}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.editorRow}>
        <FileTreePanel
          visible={editor.treeVisible}
          workspaceKey={workspacePath}
          onOpenFile={(path) => void handleOpenPath(path)}
        />
        <View style={styles.editorMain}>{renderEditorArea()}</View>
      </View>

      {scripts.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scriptRow}>
          {scripts.slice(0, 8).map((script) => (
            <Pressable
              key={script.name}
              style={styles.scriptChip}
              onPress={() => handleRunScript(script)}
            >
              <Text style={styles.scriptText}>npm run {script.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.bottomTabs}>
        {(["output", "problems", "search"] as BottomPanel[]).map((panel) => (
          <Pressable
            key={panel}
            style={[styles.bottomTab, bottomPanel === panel && styles.bottomTabActive]}
            onPress={() => setBottomPanel(panel)}
          >
            <Text
              style={[
                styles.bottomTabText,
                bottomPanel === panel && styles.bottomTabTextActive,
              ]}
            >
              {panel === "output"
                ? "Output"
                : panel === "problems"
                  ? `Problems${diagnostics.length ? ` (${diagnostics.length})` : ""}`
                  : "Search"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.bottomPanel, { marginBottom: tabBarInset }]}>
        {bottomPanel === "output" ? (
          <TerminalOutput
            output={execution.output}
            isRunning={execution.isRunning}
            exitCode={execution.exitCode}
          />
        ) : null}
        {bottomPanel === "problems" ? (
          <ProblemsPanel
            items={diagnostics}
            loading={diagLoading}
            onSelect={(item) => void handleOpenPath(item.file)}
          />
        ) : null}
        {bottomPanel === "search" ? (
          <WorkspaceSearchPanel
            onOpen={(path) => void handleOpenPath(path)}
          />
        ) : null}
      </View>

      <QuickOpenModal
        visible={quickOpen}
        recentFiles={editor.recentFiles}
        onClose={() => setQuickOpen(false)}
        onOpen={(path) => void handleOpenPath(path)}
      />

      <Modal visible={snippetsVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setSnippetsVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Snippets</Text>
            {snippetsForLanguage(snippetLanguage).map((snippet) => (
              <Pressable
                key={snippet.id}
                style={styles.snippetRow}
                onPress={() => {
                  editorRef.current?.insert(snippet.body.replace(/\$1/g, "").replace(/\$2/g, "").replace(/\$3/g, ""));
                  setSnippetsVisible(false);
                }}
              >
                <Text style={styles.snippetLabel}>{snippet.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
