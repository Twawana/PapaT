import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";

export function ThemeToggle() {
  const { isDark, toggleTheme, colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: isDark }}
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={styles.toggle}
      onPress={toggleTheme}
    >
      <View style={[styles.iconWrap, isDark ? styles.iconWrapDark : styles.iconWrapLight]}>
        <Ionicons
          name={isDark ? "moon" : "sunny"}
          size={16}
          color={isDark ? colors.onPrimary : colors.warning}
        />
      </View>
      <Text style={styles.label}>{isDark ? "Dark" : "Light"}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    toggle: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    iconWrapDark: {
      backgroundColor: colors.buttonPrimary,
    },
    iconWrapLight: {
      backgroundColor: colors.surfaceElevated,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600" as const,
    },
  };
}
