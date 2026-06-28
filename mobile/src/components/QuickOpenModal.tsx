import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { titusClient } from "../services/websocket";
import { RecentFile } from "../services/recentFiles";
import { FileSearchHit } from "../types/protocol";
import { dismissKeyboard, keyboardPersistTaps } from "../utils/keyboard";

interface Props {
  visible: boolean;
  recentFiles: RecentFile[];
  onClose: () => void;
  onOpen: (path: string) => void;
}

export function QuickOpenModal({ visible, recentFiles, onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FileSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setHits([]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (!titusClient.isConnected()) return;
      setLoading(true);
      try {
        const result = await titusClient.searchFiles(trimmed, 40);
        setHits(result.hits);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, visible]);

  const showRecent = !query.trim() && recentFiles.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={() => {
        dismissKeyboard();
        onClose();
      }}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Quick Open</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Type a file name..."
            placeholderTextColor="#484f58"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          {loading ? <ActivityIndicator color="#58a6ff" style={styles.loader} /> : null}

          {showRecent ? (
            <>
              <Text style={styles.sectionLabel}>Recent</Text>
              <FlatList
                data={recentFiles}
                keyExtractor={(item) => item.path}
                keyboardShouldPersistTaps={keyboardPersistTaps}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() => {
                      onOpen(item.path);
                      onClose();
                    }}
                  >
                    <Text style={styles.rowName}>{item.path.split("/").pop()}</Text>
                    <Text style={styles.rowPath} numberOfLines={1}>
                      {item.path}
                    </Text>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <FlatList
              data={hits}
              keyExtractor={(item) => item.path}
              keyboardShouldPersistTaps={keyboardPersistTaps}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onOpen(item.path);
                    onClose();
                  }}
                >
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowPath} numberOfLines={1}>
                    {item.path}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                query.trim() ? (
                  <Text style={styles.empty}>No files match "{query.trim()}"</Text>
                ) : null
              }
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(1, 4, 9, 0.75)",
    justifyContent: "flex-start",
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  sheet: {
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    padding: 16,
    maxHeight: "70%",
  },
  title: {
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    color: "#f0f6fc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  loader: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: "#8b949e",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#30363d",
  },
  rowName: {
    color: "#f0f6fc",
    fontSize: 15,
    fontWeight: "600",
  },
  rowPath: {
    color: "#8b949e",
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: "#8b949e",
    paddingVertical: 16,
    textAlign: "center",
  },
});
