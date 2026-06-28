import React, { useMemo, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CookingBanner } from "../components/CookingBanner";
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
    <View style={styles.messageBlock}>
      <Text style={styles.senderLabel}>Papa T · tool</Text>
      <View style={[styles.toolCard, item.isError && styles.toolCardError]}>
        <View style={styles.toolHeader}>
          <Text style={styles.toolName}>{item.name}</Text>
          <Text style={styles.toolStatus}>
            {item.status === "running" ? "Running..." : item.isError ? "Failed" : "Done"}
          </Text>
        </View>
        {argsPreview ? (
          <Text style={styles.toolArgs} numberOfLines={6} selectable>
            {argsPreview}
          </Text>
        ) : null}
        {item.result ? (
          <Text style={styles.toolResult} selectable>
            {item.result}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MessageBubble({ item }: { item: AgentUiMessage }) {
  if (item.kind === "user") {
    return (
      <View style={styles.messageBlock}>
        <Text style={[styles.senderLabel, styles.senderLabelYou]}>You</Text>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText} selectable>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  if (item.kind === "assistant") {
    return (
      <View style={styles.messageBlock}>
        <Text style={styles.senderLabel}>Papa T</Text>
        <View style={[styles.bubble, styles.assistantBubble]}>
          <Text style={styles.assistantText} selectable>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  if (item.kind === "tool") {
    return <ToolCard item={item} />;
  }

  return (
    <View style={styles.messageBlock}>
      <Text style={[styles.senderLabel, styles.senderLabelError]}>Error</Text>
      <View style={[styles.bubble, styles.errorBubble]}>
        <Text style={styles.errorText} selectable>
          {item.content}
        </Text>
      </View>
    </View>
  );
}

function visibleMessages(messages: AgentUiMessage[]): AgentUiMessage[] {
  return messages.filter((item) => {
    if (item.kind === "assistant") {
      return item.content.trim().length > 0;
    }
    return true;
  });
}

export default function AgentScreen({ isConnected, onError }: Props) {
  const listRef = useRef<FlatList>(null);
  const chat = useAgentChat(isConnected, onError);

  const displayMessages = useMemo(
    () => visibleMessages(chat.messages),
    [chat.messages]
  );

  const cookingSubtitle = useMemo(() => {
    const lastTool = [...chat.messages].reverse().find((m) => m.kind === "tool");
    if (lastTool && lastTool.kind === "tool" && lastTool.status === "running") {
      return `Running ${lastTool.name} on your PC`;
    }
    return "Thinking and fixing on your PC — hang tight";
  }, [chat.messages]);

  const handleSend = () => {
    onError(null);
    chat.sendMessage();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const hasCurrentSession =
    chat.sessions.some((session) => session.sessionId === chat.activeSessionId) ||
    chat.messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.toolbar}>
        <Text style={styles.title}>AI Agent</Text>
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.actionBtn, chat.isRunning && styles.btnDisabled]}
            onPress={chat.newChat}
            disabled={chat.isRunning}
          >
            <Text style={styles.actionBtnText}>New</Text>
          </Pressable>
          <Pressable
            style={[styles.clearBtn, (!isConnected || chat.isRunning) && styles.btnDisabled]}
            onPress={chat.clearChat}
            disabled={!isConnected || chat.isRunning}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {chat.sessions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sessionScroll}
          contentContainerStyle={styles.sessionList}
        >
          {chat.sessions.map((session) => {
            const active = session.sessionId === chat.activeSessionId;
            return (
              <Pressable
                key={session.sessionId}
                style={[styles.sessionChip, active && styles.sessionChipActive]}
                onPress={() => chat.selectSession(session.sessionId)}
                disabled={chat.isRunning}
              >
                <Text
                  style={[styles.sessionChipText, active && styles.sessionChipTextActive]}
                  numberOfLines={1}
                >
                  {session.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!isConnected ? (
        <Text style={styles.hint}>Connect to your PC to use the agent.</Text>
      ) : null}

      <CookingBanner visible={isConnected && chat.isRunning} subtitle={cookingSubtitle} />

      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(item, index) => `${item.kind}-${item.id}-${index}`}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          chat.isRunning ? null : (
            <Text style={styles.empty}>
              {hasCurrentSession
                ? "This chat is empty. Send a message to start."
                : "Ask Papa T to create files, fix bugs, or run commands on your PC."}
            </Text>
          )
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
          contextMenuHidden={false}
          selectionColor="#58a6ff"
          selectTextOnFocus={false}
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
  toolbarActions: {
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#c9d1d9",
    fontWeight: "600",
    fontSize: 14,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1f6feb",
    borderWidth: 1,
    borderColor: "#388bfd",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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
  sessionScroll: {
    maxHeight: 44,
    marginBottom: 8,
  },
  sessionList: {
    gap: 8,
    paddingRight: 8,
  },
  sessionChip: {
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  sessionChipActive: {
    backgroundColor: "#1f6feb",
    borderColor: "#388bfd",
  },
  sessionChipText: {
    color: "#8b949e",
    fontSize: 12,
    fontWeight: "600",
  },
  sessionChipTextActive: {
    color: "#fff",
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
    gap: 10,
  },
  empty: {
    color: "#8b949e",
    textAlign: "center",
    marginTop: 24,
    fontSize: 14,
    lineHeight: 20,
  },
  messageBlock: {
    gap: 4,
  },
  senderLabel: {
    color: "#8b949e",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  senderLabelYou: {
    alignSelf: "flex-end",
    marginRight: 4,
    marginLeft: 0,
    color: "#58a6ff",
  },
  senderLabelError: {
    color: "#f85149",
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
