import React from "react";
import { Image, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  uri: string;
  label?: string;
}

export function ImagePreview({ uri, label }: Props) {
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
    },
    label: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 8,
    },
    image: {
      flex: 1,
      minHeight: 200,
      borderRadius: 6,
      backgroundColor: c.surface,
    },
    hint: {
      color: c.placeholder,
      fontSize: 11,
      marginTop: 8,
      textAlign: "center",
    },
  }));

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      <Text style={styles.hint}>Image preview (read-only)</Text>
    </View>
  );
}
