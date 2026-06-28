import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { titusClient } from "../services/websocket";
import {
  enqueueWrite,
  flushOfflineQueue,
  getQueuedWrites,
} from "../services/offlineQueue";
import { loadRecentFiles, RecentFile, touchRecentFile } from "../services/recentFiles";
import { ExecuteLanguage } from "../types/protocol";
import {
  editorModeFromPath,
  executeLanguageFromPath,
  isImagePath,
  isMarkdownPath,
} from "../utils/language";

export interface OpenFile {
  path: string;
  content: string;
  savedContent: string;
  loading: boolean;
  runLanguage: ExecuteLanguage;
  previewMode?: "editor" | "markdown" | "image";
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
  const [tabs, setTabs] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [treeVisible, setTreeVisible] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);

  const refreshRecent = useCallback(async () => {
    const list = await loadRecentFiles();
    setRecentFiles(list);
  }, []);

  React.useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

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

      if (!titusClient.isConnected()) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.path === path
              ? { ...tab, loading: false, content: "// Connect to PC to load file" }
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
    [tabs]
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

  const saveFile = useCallback(async (path?: string) => {
    const targetPath = path ?? activePath;
    if (!targetPath) return;

    const tab = tabs.find((item) => item.path === targetPath);
    if (!tab || tab.content === tab.savedContent) return;

    if (!titusClient.isConnected()) {
      enqueueWrite(targetPath, tab.content, false);
      setPendingWrites(getQueuedWrites().length);
      setTabs((prev) =>
        prev.map((item) =>
          item.path === targetPath ? { ...item, savedContent: tab.content } : item
        )
      );
      return;
    }

    await titusClient.writeFile(targetPath, tab.content, false);
    setTabs((prev) =>
      prev.map((item) =>
        item.path === targetPath
          ? { ...item, savedContent: tab.content }
          : item
      )
    );
  }, [activePath, tabs]);

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
    const result = await flushOfflineQueue();
    setPendingWrites(getQueuedWrites().length);
    return result;
  }, []);

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
