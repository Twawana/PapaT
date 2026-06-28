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
import { papatClient } from "../services/websocket";
import { GrepHit } from "../types/protocol";

interface Props {
  onOpen: (path: string, line?: number) => void;
}

export function WorkspaceSearchPanel({ onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GrepHit[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || !papatClient.isConnected()) return;

    setLoading(true);
    try {
      const result = await papatClient.grepWorkspace(trimmed, 60);
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
          placeholderTextColor="#484f58"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <Pressable style={styles.btn} onPress={runSearch}>
          <Text style={styles.btnText}>Search</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color="#58a6ff" style={styles.loader} /> : null}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
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
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    color: "#f0f6fc",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  btnText: {
    color: "#f0f6fc",
    fontWeight: "600",
    fontSize: 13,
  },
  loader: {
    marginBottom: 8,
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#21262d",
  },
  path: {
    color: "#58a6ff",
    fontSize: 12,
    fontWeight: "600",
  },
  line: {
    color: "#c9d1d9",
    fontSize: 13,
    marginTop: 2,
    fontFamily: "monospace",
  },
  empty: {
    color: "#8b949e",
    textAlign: "center",
    paddingVertical: 12,
  },
});
