import React, { useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAgentChat } from "../hooks/useAgentChat";
import { AgentUiMessage } from "../types/protocol";

interface Props {
  isConnected: boolean;
  onError: (message: string | null) => void;
}

function ToolCard({ item }: { item: Extract<AgentUiMessage, { kind: "tool" }> }) {
  const argsPreview = item.args
    ? Object.entries(item.args)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")
    : "";

  return (
    <View style={[styles.toolCard, item.isError && styles.toolCardError]}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolName}>{item.name}</Text>
        <Text style={styles.toolStatus}>
          {item.status === "running" ? "Running..." : item.isError ? "Failed" : "Done"}
        </Text>
      </View>
      {argsPreview ? (
        <Text style={styles.toolArgs} numberOfLines={4}>
          {argsPreview}
        </Text>
      ) : null}
      {item.result ? (
        <Text style={styles.toolResult} selectable>
          {item.result}
        </Text>
      ) : null}
    </View>
  );
}

function MessageBubble({ item }: { item: AgentUiMessage }) {
  if (item.kind === "user") {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{item.content}</Text>
      </View>
    );
  }

  if (item.kind === "assistant") {
    return (
      <View style={[styles.bubble, styles.assistantBubble]}>
        <Text style={styles.assistantText}>{item.content}</Text>
        {item.streaming ? <ActivityIndicator color="#58a6ff" size="small" /> : null}
      </View>
    );
  }

  if (item.kind === "tool") {
    return <ToolCard item={item} />;
  }

  return (
    <View style={[styles.bubble, styles.errorBubble]}>
      <Text style={styles.errorText}>{item.content}</Text>
    </View>
  );
}

export default function AgentScreen({ isConnected, onError }: Props) {
  const listRef = useRef<FlatList>(null);
  const chat = useAgentChat(isConnected);

  const handleSend = () => {
    onError(null);
    chat.sendMessage();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.toolbar}>
        <Text style={styles.title}>AI Agent</Text>
        <Pressable
          style={[styles.clearBtn, !isConnected && styles.btnDisabled]}
          onPress={chat.clearChat}
          disabled={!isConnected}
        >
          <Text style={styles.clearBtnText}>Clear</Text>
        </Pressable>
      </View>

      {!isConnected ? (
        <Text style={styles.hint}>Connect to your PC to use the agent.</Text>
      ) : null}

      <FlatList
        ref={listRef}
        data={chat.messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Uses your logged-in Cursor agent on your PC. Ask it to create files, fix bugs, or run commands.
          </Text>
        }
        renderItem={({ item }) => <MessageBubble item={item} />}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={chat.input}
          onChangeText={chat.setInput}
          placeholder="Ask the agent..."
          placeholderTextColor="#484f58"
          multiline
          editable={isConnected && !chat.isRunning}
        />
        {chat.isRunning ? (
          <Pressable style={styles.stopBtn} onPress={chat.cancel}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.sendBtn,
              (!isConnected || !chat.input.trim()) && styles.btnDisabled,
            ]}
            onPress={handleSend}
            disabled={!isConnected || !chat.input.trim()}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 14,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  clearBtnText: {
    color: "#c9d1d9",
    fontSize: 12,
    fontWeight: "600",
  },
  hint: {
    color: "#8b949e",
    fontSize: 13,
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 12,
    gap: 8,
  },
  empty: {
    color: "#8b949e",
    textAlign: "center",
    marginTop: 24,
    fontSize: 14,
    lineHeight: 20,
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    maxWidth: "92%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#1f6feb",
  },
  userText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  assistantText: {
    color: "#c9d1d9",
    fontSize: 14,
    lineHeight: 20,
  },
  errorBubble: {
    alignSelf: "stretch",
    backgroundColor: "#3d1214",
    borderWidth: 1,
    borderColor: "#f85149",
  },
  errorText: {
    color: "#f85149",
    fontSize: 13,
  },
  toolCard: {
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 10,
    padding: 10,
    alignSelf: "stretch",
  },
  toolCardError: {
    borderColor: "#f85149",
  },
  toolHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  toolName: {
    color: "#58a6ff",
    fontWeight: "700",
    fontSize: 13,
  },
  toolStatus: {
    color: "#8b949e",
    fontSize: 12,
  },
  toolArgs: {
    color: "#8b949e",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 6,
  },
  toolResult: {
    color: "#c9d1d9",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#21262d",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#c9d1d9",
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: "#238636",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  stopBtn: {
    backgroundColor: "#da3633",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stopBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
