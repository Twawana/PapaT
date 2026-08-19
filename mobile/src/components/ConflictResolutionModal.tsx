import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useOffline } from "../context/OfflineContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { SyncConflictRecord } from "../services/localDb";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function ConflictItem({
  conflict,
  onResolve,
}: {
  conflict: SyncConflictRecord;
  onResolve: (id: string, resolution: "keep_local" | "keep_pc" | "edit", edited?: string) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(conflict.localContent ?? "");
  const styles = useThemedStyles((c) => ({
    card: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      backgroundColor: c.surface,
    },
    path: {
      color: c.textPrimary,
      fontWeight: "700",
      fontSize: 14,
      marginBottom: 8,
    },
    label: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 8,
      marginBottom: 4,
    },
    preview: {
      color: c.textSecondary,
      fontSize: 11,
      fontFamily: "monospace",
      maxHeight: 80,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    btn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: c.buttonSecondary,
      borderWidth: 1,
      borderColor: c.border,
    },
    btnPrimary: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    btnText: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 12,
    },
    btnTextPrimary: {
      color: c.onPrimary,
    },
    editor: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
      minHeight: 120,
      color: c.textPrimary,
      fontFamily: "monospace",
      fontSize: 12,
      textAlignVertical: "top",
    },
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.path}>{conflict.path}</Text>
      <Text style={styles.label}>Phone version</Text>
      <Text style={styles.preview} numberOfLines={4}>
        {conflict.localContent ?? "(empty)"}
      </Text>
      <Text style={styles.label}>PC version</Text>
      <Text style={styles.preview} numberOfLines={4}>
        {conflict.pcContent ?? "(empty)"}
      </Text>

      {editing ? (
        <>
          <Text style={styles.label}>Edit merged version</Text>
          <TextInput
            style={styles.editor}
            multiline
            value={editedContent}
            onChangeText={setEditedContent}
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => onResolve(conflict.id, "edit", editedContent)}
            >
              <Text style={[styles.btnText, styles.btnTextPrimary]}>Save merged</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => setEditing(false)}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => onResolve(conflict.id, "keep_local")}
          >
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Keep phone</Text>
          </Pressable>
          <Pressable
            style={styles.btn}
            onPress={() => onResolve(conflict.id, "keep_pc")}
          >
            <Text style={styles.btnText}>Keep PC</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => setEditing(true)}>
            <Text style={styles.btnText}>Edit merge</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ConflictResolutionModal({ visible, onClose }: Props) {
  const offline = useOffline();
  const styles = useThemedStyles((c) => ({
    modal: {
      flex: 1,
      backgroundColor: c.background,
      paddingTop: 48,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    title: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    close: {
      color: c.link,
      fontWeight: "600",
    },
    empty: {
      color: c.textMuted,
      textAlign: "center",
      marginTop: 24,
    },
  }));

  const handleResolve = async (
    id: string,
    resolution: "keep_local" | "keep_pc" | "edit",
    edited?: string
  ) => {
    if (resolution === "edit" && edited != null) {
      const conflict = offline.conflicts.find((c) => c.id === id);
      if (conflict) {
        const { saveLocalFileEdit } = await import("../services/sync/syncEngine");
        await saveLocalFileEdit(conflict.projectId, conflict.path, edited);
        const { resolveConflict } = await import("../services/localDb");
        await resolveConflict(id, "keep_local");
        await offline.refreshProjects();
        if (offline.activeProject) {
          await offline.syncNow();
        }
      }
    } else if (resolution === "keep_local" || resolution === "keep_pc") {
      await offline.resolveFileConflict(id, resolution);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Sync conflicts</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>
        <ScrollView>
          {offline.conflicts.length === 0 ? (
            <Text style={styles.empty}>No conflicts — you're all synced.</Text>
          ) : (
            offline.conflicts.map((conflict) => (
              <ConflictItem
                key={conflict.id}
                conflict={conflict}
                onResolve={(id, res, edited) => {
                  void handleResolve(id, res, edited);
                }}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
