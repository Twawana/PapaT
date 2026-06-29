import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { dismissKeyboard } from "../utils/keyboard";

interface Props {
  visible: boolean;
  query: string;
  onChangeQuery: (value: string) => void;
  onFindNext: () => void;
  onClose: () => void;
}

export function FindBar({ visible, query, onChangeQuery, onFindNext, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    input: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      color: c.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    btn: {
      backgroundColor: c.buttonPrimary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    btnGhost: {
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    btnText: {
      color: c.onPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
    btnGhostText: {
      color: c.textPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
  }));

  if (!visible) return null;

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Find in file..."
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onFindNext}
        autoFocus
      />
      <Pressable style={styles.btn} onPress={onFindNext}>
        <Text style={styles.btnText}>Next</Text>
      </Pressable>
      <Pressable
        style={styles.btnGhost}
        onPress={() => {
          dismissKeyboard();
          onClose();
        }}
      >
        <Text style={styles.btnGhostText}>Close</Text>
      </Pressable>
    </View>
  );
}
