import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  onTryAgain: () => void;
  onDismiss: () => void;
}

export function AgentTryAgainModal({
  visible,
  title,
  message,
  onTryAgain,
  onDismiss,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onDismiss}>
              <Text style={styles.secondaryBtnText}>Dismiss</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onTryAgain}>
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#30363d",
    padding: 18,
    gap: 12,
  },
  title: {
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
  },
  message: {
    color: "#c9d1d9",
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryBtnText: {
    color: "#8b949e",
    fontWeight: "600",
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1f6feb",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
