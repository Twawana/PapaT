import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  countPendingFiles,
  getProjectByPcPath,
  listOfflineProjects,
  listUnresolvedConflicts,
  LocalProject,
  resolveConflict,
  SyncConflictRecord,
} from "../services/localDb";
import {
  enableOfflineForProject,
  ensureLocalProject,
  SyncProgress,
  syncProjectWithPc,
} from "../services/sync/syncEngine";
import { projectIdFromPath } from "../services/sync/exclusions";
import { titusClient } from "../services/websocket";

export type WorkspaceMode =
  | "online_synced"
  | "online_pending"
  | "online_syncing"
  | "online_conflict"
  | "offline_working"
  | "offline_no_project"
  | "pc_unreachable";

export interface OfflineContextValue {
  activeProject: LocalProject | null;
  offlineProjects: LocalProject[];
  workspaceMode: WorkspaceMode;
  pendingChanges: number;
  conflicts: SyncConflictRecord[];
  syncProgress: SyncProgress | null;
  isOfflineCapable: boolean;
  refreshProjects: () => Promise<void>;
  setActiveWorkspace: (pcPath: string | null, name?: string) => Promise<void>;
  enableOffline: () => Promise<void>;
  syncNow: () => Promise<void>;
  resolveFileConflict: (
    conflictId: string,
    resolution: "keep_local" | "keep_pc"
  ) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

function deriveWorkspaceMode(
  isConnected: boolean,
  project: LocalProject | null,
  pending: number,
  conflictCount: number,
  syncing: boolean
): WorkspaceMode {
  if (!project?.offlineEnabled) {
    return isConnected ? "online_synced" : "offline_no_project";
  }
  if (!isConnected) {
    return "offline_working";
  }
  if (syncing) return "online_syncing";
  if (conflictCount > 0) return "online_conflict";
  if (pending > 0) return "online_pending";
  return "online_synced";
}

export function OfflineProvider({
  children,
  isConnected,
  workspacePath,
  workspaceName,
}: {
  children: React.ReactNode;
  isConnected: boolean;
  workspacePath: string | null;
  workspaceName: string;
}) {
  const [activeProject, setActiveProject] = useState<LocalProject | null>(null);
  const [offlineProjects, setOfflineProjects] = useState<LocalProject[]>([]);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshProjects = useCallback(async () => {
    const projects = await listOfflineProjects();
    setOfflineProjects(projects);

    if (workspacePath) {
      const project = await getProjectByPcPath(workspacePath);
      setActiveProject(project);
      if (project) {
        const pending = await countPendingFiles(project.id);
        const unresolved = await listUnresolvedConflicts(project.id);
        setPendingChanges(pending);
        setConflicts(unresolved);
      } else {
        setPendingChanges(0);
        setConflicts([]);
      }
    }
  }, [workspacePath]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const setActiveWorkspace = useCallback(
    async (pcPath: string | null, name?: string) => {
      if (!pcPath) {
        setActiveProject(null);
        setPendingChanges(0);
        setConflicts([]);
        return;
      }
      const projectName = name ?? pcPath.split(/[/\\]/).pop() ?? "project";
      await ensureLocalProject(pcPath, projectName);
      await refreshProjects();
    },
    [refreshProjects]
  );

  useEffect(() => {
    if (workspacePath) {
      void setActiveWorkspace(workspacePath, workspaceName);
    }
  }, [workspacePath, workspaceName, setActiveWorkspace]);

  const enableOffline = useCallback(async () => {
    if (!workspacePath) {
      throw new Error("Open a project first");
    }
    setSyncing(true);
    setSyncProgress({ phase: "downloading", message: "Preparing offline copy…" });
    try {
      const project = await enableOfflineForProject(
        workspacePath,
        workspaceName,
        setSyncProgress
      );
      setActiveProject(project);
      await refreshProjects();
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [workspacePath, workspaceName, refreshProjects]);

  const syncNow = useCallback(async () => {
    if (!activeProject?.offlineEnabled) return;
    if (!titusClient.isConnected()) {
      throw new Error("PC is not reachable");
    }
    setSyncing(true);
    setSyncProgress({ phase: "uploading", message: "Syncing…" });
    try {
      await syncProjectWithPc(activeProject.id, setSyncProgress);
      await refreshProjects();
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [activeProject, refreshProjects]);

  // Auto-sync when PC reconnects
  useEffect(() => {
    if (!isConnected || !activeProject?.offlineEnabled || syncing) return;
    if (pendingChanges === 0 && conflicts.length === 0) return;

    const timer = setTimeout(() => {
      void syncNow().catch(() => {
        /* user can retry manually */
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [isConnected, activeProject?.offlineEnabled, pendingChanges, conflicts.length, syncing, syncNow]);

  const resolveFileConflict = useCallback(
    async (conflictId: string, resolution: "keep_local" | "keep_pc") => {
      await resolveConflict(conflictId, resolution);
      await refreshProjects();
      if (activeProject && titusClient.isConnected()) {
        await syncNow();
      }
    },
    [activeProject, refreshProjects, syncNow]
  );

  const workspaceMode = deriveWorkspaceMode(
    isConnected,
    activeProject,
    pendingChanges,
    conflicts.length,
    syncing
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      activeProject,
      offlineProjects,
      workspaceMode,
      pendingChanges,
      conflicts,
      syncProgress,
      isOfflineCapable: Boolean(activeProject?.offlineEnabled),
      refreshProjects,
      setActiveWorkspace,
      enableOffline,
      syncNow,
      resolveFileConflict,
    }),
    [
      activeProject,
      offlineProjects,
      workspaceMode,
      pendingChanges,
      conflicts,
      syncProgress,
      refreshProjects,
      setActiveWorkspace,
      enableOffline,
      syncNow,
      resolveFileConflict,
    ]
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOffline must be used within OfflineProvider");
  }
  return ctx;
}

export function useOfflineOptional(): OfflineContextValue | null {
  return useContext(OfflineContext);
}

export function projectIdForWorkspace(pcPath: string | null): string | null {
  if (!pcPath) return null;
  return projectIdFromPath(pcPath);
}
