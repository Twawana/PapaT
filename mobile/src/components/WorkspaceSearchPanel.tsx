import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { titusClient } from "../services/websocket";
import { GrepHit } from "../types/protocol";

interface Props {
  onOpen: (path: string, line?: number) => void;
}

export function WorkspaceSearchPanel({ onOpen }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
    },
    searchRow: {
      flexDirection: "row",
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
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    btn: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 12,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    btnText: {
      color: c.textPrimary,
      fontWeight: "600",
      fontSize: 13,
    },
    loader: {
      marginBottom: 8,
    },
    row: {
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.surfaceElevated,
    },
    path: {
      color: c.link,
      fontSize: 12,
      fontWeight: "600",
    },
    line: {
      color: c.textSecondary,
      fontSize: 13,
      marginTop: 2,
      fontFamily: "monospace",
    },
    empty: {
      color: c.textMuted,
      textAlign: "center",
      paddingVertical: 12,
    },
  }));

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GrepHit[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || !titusClient.isConnected()) return;

    setLoading(true);
    try {
      const result = await titusClient.grepWorkspace(trimmed, 60);
      setHits(result.hits);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
    }
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search in workspace..."
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <Pressable style={styles.btn} onPress={runSearch}>
          <Text style={styles.btnText}>Search</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : null}

      <FlatList
        data={hits}
        keyExtractor={(item, index) => `${item.path}:${item.line}:${index}`}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onOpen(item.path, item.line)}>
            <Text style={styles.path}>
              {item.path}:{item.line}
            </Text>
            <Text style={styles.line} numberOfLines={2}>
              {item.text.trim()}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim() && !loading ? (
            <Text style={styles.empty}>No matches</Text>
          ) : null
        }
      />
    </View>
  );
}
