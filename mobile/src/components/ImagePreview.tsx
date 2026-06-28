import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface Props {
  uri: string;
  label?: string;
}

export function ImagePreview({ uri, label }: Props) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      <Text style={styles.hint}>Image preview (read-only)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    padding: 8,
  },
  label: {
    color: "#8b949e",
    fontSize: 12,
    marginBottom: 8,
  },
  image: {
    flex: 1,
    minHeight: 200,
    borderRadius: 6,
    backgroundColor: "#161b22",
  },
  hint: {
    color: "#484f58",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
});
