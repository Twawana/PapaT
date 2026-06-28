import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  message: string;
  onDismiss: () => void;
}

export function GlobalErrorBanner({ message, onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <Text style={styles.message} numberOfLines={3}>
          {message}
        </Text>
        <Pressable style={styles.dismiss} onPress={onDismiss} hitSlop={8}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#3d1214",
    borderWidth: 1,
    borderColor: "#f85149",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    flex: 1,
    color: "#ffb4b0",
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: "#f85149",
    fontWeight: "700",
    fontSize: 12,
  },
});
