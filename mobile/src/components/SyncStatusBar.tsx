import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useOffline, WorkspaceMode } from "../context/OfflineContext";
import { useThemedStyles } from "../hooks/useThemedStyles";

function modeLabel(mode: WorkspaceMode, pending: number, conflicts: number): string {
  switch (mode) {
    case "online_synced":
      return "Synced";
    case "online_pending":
      return `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
    case "online_syncing":
      return "Syncing…";
    case "online_conflict":
      return `${conflicts} conflict${conflicts === 1 ? "" : "s"} need attention`;
    case "offline_working":
      return pending > 0
        ? `Working offline · ${pending} pending`
        : "Working offline";
    case "offline_no_project":
      return "PC unavailable · no offline project";
    case "pc_unreachable":
      return "PC unavailable";
    default:
      return "";
  }
}

function modeEmoji(mode: WorkspaceMode): string {
  switch (mode) {
    case "online_synced":
      return "🟢";
    case "online_pending":
      return "🟡";
    case "online_syncing":
      return "🔄";
    case "online_conflict":
      return "⚠️";
    case "offline_working":
      return "🔴";
    case "offline_no_project":
      return "🔴";
    default:
      return "⚪";
  }
}

interface Props {
  projectName?: string;
  onShowConflicts?: () => void;
}

export function SyncStatusBar({ projectName, onShowConflicts }: Props) {
  const offline = useOffline();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.surfaceElevated,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 8,
    },
    left: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: c.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    status: {
      color: c.textSecondary,
      fontSize: 12,
    },
    syncBtn: {
      backgroundColor: c.accent,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    syncBtnText: {
      color: c.onPrimary,
      fontWeight: "700",
      fontSize: 12,
    },
    conflictBtn: {
      backgroundColor: c.warning ?? "#ffb020",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
  }));

  if (!offline.activeProject?.offlineEnabled && offline.workspaceMode === "offline_no_project") {
    return null;
  }

  if (!offline.activeProject?.offlineEnabled) {
    return null;
  }

  const label = modeLabel(
    offline.workspaceMode,
    offline.pendingChanges,
    offline.conflicts.length
  );
  const showSync =
    offline.workspaceMode === "online_pending" ||
    offline.workspaceMode === "online_conflict" ||
    offline.workspaceMode === "offline_working";

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {projectName ? <Text style={styles.title}>{projectName}</Text> : null}
        <Text style={styles.status}>
          {modeEmoji(offline.workspaceMode)} {label}
          {offline.syncProgress?.message ? ` · ${offline.syncProgress.message}` : ""}
        </Text>
      </View>
      {offline.workspaceMode === "online_syncing" ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : null}
      {offline.conflicts.length > 0 && onShowConflicts ? (
        <Pressable style={styles.conflictBtn} onPress={onShowConflicts}>
          <Text style={styles.syncBtnText}>Resolve</Text>
        </Pressable>
      ) : null}
      {showSync && offline.workspaceMode !== "online_syncing" ? (
        <Pressable
          style={styles.syncBtn}
          onPress={() => {
            void offline.syncNow();
          }}
        >
          <Text style={styles.syncBtnText}>Sync</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
