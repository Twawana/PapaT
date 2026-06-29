import React from "react";
import { Pressable, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  message: string;
  onDismiss: () => void;
}

export function GlobalErrorBanner({ message, onDismiss }: Props) {
  const styles = useThemedStyles((c) => ({
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
      backgroundColor: c.errorBannerBg,
      borderWidth: 1,
      borderColor: c.error,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    message: {
      flex: 1,
      color: c.errorBannerText,
      fontSize: 13,
      lineHeight: 18,
    },
    dismiss: {
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    dismissText: {
      color: c.error,
      fontWeight: "700",
      fontSize: 12,
    },
  }));

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
