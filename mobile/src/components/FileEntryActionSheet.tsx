import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

export interface FileEntryAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  entryName: string;
  actions: FileEntryAction[];
  onClose: () => void;
}

export function FileEntryActionSheet({
  visible,
  entryName,
  actions,
  onClose,
}: Props) {
  const styles = useThemedStyles((c) => ({
    overlay: {
      flex: 1,
      backgroundColor: `${c.shadow}99`,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.surfaceElevated,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 8,
      paddingBottom: 24,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 999,
      backgroundColor: c.border,
      marginBottom: 12,
    },
    title: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: "700",
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    action: {
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    actionText: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: "500",
    },
    actionDestructive: {
      color: c.errorText,
    },
    cancel: {
      marginTop: 8,
      marginHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: c.buttonSecondary,
      alignItems: "center",
    },
    cancelText: {
      color: c.textSecondary,
      fontSize: 16,
      fontWeight: "600",
    },
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={2}>
            {entryName}
          </Text>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              style={styles.action}
              onPress={() => {
                onClose();
                action.onPress();
              }}
            >
              <Text
                style={[
                  styles.actionText,
                  action.destructive && styles.actionDestructive,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
