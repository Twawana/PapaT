import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { dismissKeyboard } from "../utils/keyboard";

interface Props {
  visible: boolean;
  query: string;
  onChangeQuery: (value: string) => void;
  onFindNext: () => void;
  onClose: () => void;
}

export function FindBar({ visible, query, onChangeQuery, onFindNext, onClose }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Find in file..."
        placeholderTextColor="#484f58"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onFindNext}
        autoFocus
      />
      <Pressable style={styles.btn} onPress={onFindNext}>
        <Text style={styles.btnText}>Next</Text>
      </Pressable>
      <Pressable style={styles.btnGhost} onPress={() => {
        dismissKeyboard();
        onClose();
      }}>
        <Text style={styles.btnText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    color: "#f0f6fc",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnGhost: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  btnText: {
    color: "#f0f6fc",
    fontSize: 13,
    fontWeight: "600",
  },
});
