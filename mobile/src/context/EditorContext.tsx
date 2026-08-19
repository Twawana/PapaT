import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { titusClient } from "../services/websocket";
import { loadRecentFiles, RecentFile, touchRecentFile } from "../services/recentFiles";
import { ExecuteLanguage } from "../types/protocol";
import {
  editorModeFromPath,
  executeLanguageFromPath,
  isImagePath,
  isMarkdownPath,
} from "../utils/language";
import { useOfflineOptional } from "./OfflineContext";
import {
  readLocalFileContent,
  saveLocalFileEdit,
} from "../services/sync/syncEngine";
import { projectIdFromPath } from "../services/sync/exclusions";

export interface OpenFile {
  path: string;
  content: string;
  savedContent: string;
  loading: boolean;
  runLanguage: ExecuteLanguage;
  previewMode?: "editor" | "markdown" | "image";
  encoding?: "utf-8" | "base64";
  mimeType?: string;
  /** True when saved locally but not yet on PC */
  pendingSync?: boolean;
}

interface EditorContextValue {
  tabs: OpenFile[];
  activePath: string | null;
  recentFiles: RecentFile[];
  treeVisible: boolean;
  setTreeVisible: (visible: boolean) => void;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActivePath: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveFile: (path?: string) => Promise<void>;
  saveActive: () => Promise<void>;
  refreshRecent: () => Promise<void>;
  getActiveFile: () => OpenFile | null;
  setRunLanguage: (path: string, language: ExecuteLanguage) => void;
  togglePreview: (path: string) => void;
  pendingWrites: number;
  flushPendingWrites: () => Promise<{ ok: number; failed: number }>;
  resetForWorkspace: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const offline = useOfflineOptional();
  const [tabs, setTabs] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [treeVisible, setTreeVisible] = useState(true);

  const pendingWrites = offline?.pendingChanges ?? 0;

  const refreshRecent = useCallback(async () => {
    const list = await loadRecentFiles();
    setRecentFiles(list);
  }, []);

  React.useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const canUseLocal = Boolean(
    offline?.activeProject?.offlineEnabled && offline.activeProject.id
  );
  const projectId = offline?.activeProject?.id ?? null;

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabs.find((tab) => tab.path === path);
      if (existing) {
        setActivePath(path);
        return;
      }

      const placeholder: OpenFile = {
        path,
        content: "",
        savedContent: "",
        loading: true,
        runLanguage: executeLanguageFromPath(path),
        previewMode: isMarkdownPath(path)
          ? "markdown"
          : isImagePath(path)
            ? "image"
            : "editor",
      };

      setTabs((prev) => [...prev, placeholder]);
      setActivePath(path);

      // Try local storage first when project is offline-enabled
      if (canUseLocal && projectId) {
        const local = await readLocalFileContent(projectId, path);
        if (local) {
          const recent = await touchRecentFile(path);
          setRecentFiles(recent);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.path === path
                ? {
                    ...tab,
                    content: local.content,
                    savedContent: local.content,
                    loading: false,
                    encoding: local.encoding,
                    mimeType: local.mimeType ?? undefined,
                    pendingSync: false,
                  }
                : tab
            )
          );
          return;
        }
      }

      if (!titusClient.isConnected()) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.path === path
              ? {
                  ...tab,
                  loading: false,
                  content: canUseLocal
                    ? "// File not found in local copy"
                    : "// Connect to PC or enable offline for this project",
                }
              : tab
          )
        );
        return;
      }

      try {
        const result = await titusClient.readFile(path);
        const recent = await touchRecentFile(path);
        setRecentFiles(recent);
        setTabs((prev) =>
          prev.map((tab) =>
            tab.path === path
              ? {
                  ...tab,
                  content: result.content,
                  savedContent: result.content,
                  loading: false,
                  encoding: result.encoding ?? "utf-8",
                  mimeType: result.mimeType,
                  pendingSync: false,
                }
              : tab
          )
        );
      } catch (err) {
        setTabs((prev) => prev.filter((tab) => tab.path !== path));
        setActivePath((current) => (current === path ? null : current));
        throw err;
      }
    },
    [tabs, canUseLocal, projectId]
  );

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.path !== path);
      setActivePath((current) => {
        if (current !== path) return current;
        return next.length > 0 ? next[next.length - 1]!.path : null;
      });
      return next;
    });
  }, []);

  const updateContent = useCallback((path: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.path === path ? { ...tab, content } : tab))
    );
  }, []);

  const saveFile = useCallback(
    async (path?: string) => {
      const targetPath = path ?? activePath;
      if (!targetPath) return;

      const tab = tabs.find((item) => item.path === targetPath);
      if (!tab || tab.content === tab.savedContent) return;

      if (canUseLocal && projectId) {
        await saveLocalFileEdit(
          projectId,
          targetPath,
          tab.content,
          tab.encoding ?? "utf-8",
          tab.mimeType
        );
        await offline?.refreshProjects();

        setTabs((prev) =>
          prev.map((item) =>
            item.path === targetPath
              ? {
                  ...item,
                  savedContent: tab.content,
                  pendingSync: !titusClient.isConnected(),
                }
              : item
          )
        );

        if (titusClient.isConnected()) {
          try {
            await offline?.syncNow();
            setTabs((prev) =>
              prev.map((item) =>
                item.path === targetPath ? { ...item, pendingSync: false } : item
              )
            );
          } catch {
            /* queued for later */
          }
        }
        return;
      }

      if (!titusClient.isConnected()) {
        throw new Error("PC unavailable — enable offline for this project to save locally.");
      }

      await titusClient.writeFile(targetPath, tab.content, false);
      setTabs((prev) =>
        prev.map((item) =>
          item.path === targetPath
            ? { ...item, savedContent: tab.content, pendingSync: false }
            : item
        )
      );
    },
    [activePath, tabs, canUseLocal, projectId, offline]
  );

  const saveActive = useCallback(async () => {
    await saveFile(activePath ?? undefined);
  }, [activePath, saveFile]);

  const getActiveFile = useCallback(() => {
    if (!activePath) return null;
    return tabs.find((tab) => tab.path === activePath) ?? null;
  }, [activePath, tabs]);

  const setRunLanguage = useCallback((path: string, language: ExecuteLanguage) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.path === path ? { ...tab, runLanguage: language } : tab))
    );
  }, []);

  const togglePreview = useCallback((path: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.path !== path) return tab;
        if (!isMarkdownPath(path)) return tab;
        return {
          ...tab,
          previewMode: tab.previewMode === "markdown" ? "editor" : "markdown",
        };
      })
    );
  }, []);

  const flushPendingWrites = useCallback(async () => {
    if (offline?.activeProject?.offlineEnabled) {
      try {
        await offline.syncNow();
        return { ok: offline.pendingChanges, failed: 0 };
      } catch {
        return { ok: 0, failed: offline.pendingChanges };
      }
    }
    return { ok: 0, failed: 0 };
  }, [offline]);

  const resetForWorkspace = useCallback(() => {
    setTabs([]);
    setActivePath(null);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      tabs,
      activePath,
      recentFiles,
      treeVisible,
      setTreeVisible,
      openFile,
      closeTab,
      setActivePath,
      updateContent,
      saveFile,
      saveActive,
      refreshRecent,
      getActiveFile,
      setRunLanguage,
      togglePreview,
      pendingWrites,
      flushPendingWrites,
      resetForWorkspace,
    }),
    [
      tabs,
      activePath,
      recentFiles,
      treeVisible,
      openFile,
      closeTab,
      updateContent,
      saveFile,
      saveActive,
      refreshRecent,
      getActiveFile,
      setRunLanguage,
      togglePreview,
      pendingWrites,
      flushPendingWrites,
      resetForWorkspace,
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used within EditorProvider");
  }
  return ctx;
}

export { editorModeFromPath };
