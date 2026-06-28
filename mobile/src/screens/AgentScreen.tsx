import React, { useMemo, useRef } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CookingBanner } from "../components/CookingBanner";
import { useAgentChat } from "../hooks/useAgentChat";
import { useTabBarInset } from "../hooks/useTabBarInset";
import { AgentUiMessage } from "../types/protocol";
import { dismissKeyboard, keyboardAvoidBehavior, keyboardPersistTaps } from "../utils/keyboard";

interface Props {
  isConnected: boolean;
  workspacePath: string | null;
  workspaceName: string;
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
      <Text style={styles.senderLabel}>Titus · tool</Text>
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

function formatAttachmentLabel(name: string, mimeType: string): string {
  if (mimeType.startsWith("image/")) return "Image";
  return name.includes(".") ? name.split(".").pop()?.toUpperCase() ?? "File" : "File";
}

function AttachmentChips({
  attachments,
}: {
  attachments: Array<{ id: string; name: string; mimeType: string; previewUri?: string }>;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.attachmentRow}>
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.attachmentChip}>
          {attachment.previewUri && attachment.mimeType.startsWith("image/") ? (
            <Image source={{ uri: attachment.previewUri }} style={styles.attachmentThumb} />
          ) : (
            <View style={styles.attachmentIconWrap}>
              <Ionicons name="document-outline" size={16} color="#58a6ff" />
            </View>
          )}
          <View style={styles.attachmentMeta}>
            <Text style={styles.attachmentName} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={styles.attachmentKind}>
              {formatAttachmentLabel(attachment.name, attachment.mimeType)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MessageBubble({ item }: { item: AgentUiMessage }) {
  if (item.kind === "user") {
    const attachmentItems =
      item.localAttachmentPreviews ??
      item.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
      })) ??
      [];

    return (
      <View style={styles.messageBlock}>
        <Text style={[styles.senderLabel, styles.senderLabelYou]}>You</Text>
        <View style={[styles.bubble, styles.userBubble]}>
          {attachmentItems.length > 0 ? (
            <AttachmentChips attachments={attachmentItems} />
          ) : null}
          {item.content.trim() ? (
            <Text style={styles.userText} selectable>
              {item.content}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (item.kind === "assistant") {
    return (
      <View style={styles.messageBlock}>
        <Text style={styles.senderLabel}>Titus</Text>
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
    if (item.kind === "user") {
      return item.content.trim().length > 0 || !!item.attachments?.length || !!item.localAttachmentPreviews?.length;
    }
    return true;
  });
}

export default function AgentScreen({
  isConnected,
  workspacePath,
  workspaceName,
  onError,
}: Props) {
  const listRef = useRef<FlatList>(null);
  const chat = useAgentChat(isConnected, onError);
  const tabBarInset = useTabBarInset();

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
    dismissKeyboard();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const hasCurrentSession =
    chat.sessions.some((session) => session.sessionId === chat.activeSessionId) ||
    chat.messages.length > 0;

  const hasWorkspace = !!workspacePath;
  const canSend =
    isConnected &&
    hasWorkspace &&
    !chat.isRunning &&
    (chat.input.trim().length > 0 || chat.attachments.length > 0);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={keyboardAvoidBehavior()}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.toolbar}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>AI Agent</Text>
          {hasWorkspace ? (
            <Text style={styles.workspaceHint} numberOfLines={1}>
              Working in {workspaceName}
            </Text>
          ) : null}
        </View>
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.actionBtn, chat.isRunning && styles.btnDisabled]}
            onPress={() => {
            dismissKeyboard();
            chat.newChat();
          }}
            disabled={chat.isRunning}
          >
            <Text style={styles.actionBtnText}>New</Text>
          </Pressable>
          <Pressable
            style={[styles.clearBtn, (!isConnected || chat.isRunning) && styles.btnDisabled]}
            onPress={() => {
            dismissKeyboard();
            chat.clearChat();
          }}
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
      ) : !hasWorkspace ? (
        <Text style={styles.hint}>
          Open a project folder first, then use Agent to work on that project.
        </Text>
      ) : null}

      <CookingBanner visible={isConnected && chat.isRunning} subtitle={cookingSubtitle} />

      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(item, index) => `${item.kind}-${item.id}-${index}`}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarInset }]}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps={keyboardPersistTaps}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={dismissKeyboard}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          chat.isRunning ? null : (
            <Text style={styles.empty}>
              {hasCurrentSession
                ? "This chat is empty. Send a message to start."
                : "Ask Titus to create files, fix bugs, or run commands on your PC."}
            </Text>
          )
        }
        renderItem={({ item }) => <MessageBubble item={item} />}
      />

      <View style={[styles.inputRow, { marginBottom: tabBarInset }]}>
        <Pressable
          style={[
            styles.attachBtn,
            (!isConnected || chat.isRunning || !hasWorkspace) && styles.btnDisabled,
          ]}
          onPress={chat.pickAttachment}
          disabled={!isConnected || chat.isRunning || !hasWorkspace}
          accessibilityLabel="Attach file"
        >
          <Ionicons name="attach" size={22} color="#c9d1d9" />
        </Pressable>
        <View style={styles.inputColumn}>
          {chat.attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pendingAttachmentScroll}
              contentContainerStyle={styles.pendingAttachmentList}
            >
              {chat.attachments.map((attachment) => (
                <View key={attachment.id} style={styles.pendingAttachmentChip}>
                  {attachment.previewUri && attachment.kind === "image" ? (
                    <Image
                      source={{ uri: attachment.previewUri }}
                      style={styles.pendingAttachmentThumb}
                    />
                  ) : (
                    <View style={styles.pendingAttachmentIcon}>
                      <Ionicons name="document-outline" size={14} color="#58a6ff" />
                    </View>
                  )}
                  <Text style={styles.pendingAttachmentName} numberOfLines={1}>
                    {attachment.name}
                  </Text>
                  <Pressable
                    style={styles.pendingAttachmentRemove}
                    onPress={() => chat.removeAttachment(attachment.id)}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color="#8b949e" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <TextInput
            style={styles.input}
            value={chat.input}
            onChangeText={chat.setInput}
            placeholder="Ask the agent..."
            placeholderTextColor="#484f58"
            multiline
            editable={isConnected && !chat.isRunning && hasWorkspace}
            contextMenuHidden={false}
            selectionColor="#58a6ff"
            selectTextOnFocus={false}
          />
        </View>
        {chat.isRunning ? (
          <Pressable style={styles.stopBtn} onPress={chat.cancel}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, !canSend && styles.btnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
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
  titleBlock: {
    flex: 1,
    marginRight: 8,
  },
  workspaceHint: {
    color: "#58a6ff",
    fontSize: 12,
    marginTop: 2,
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
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  inputColumn: {
    flex: 1,
    gap: 8,
  },
  pendingAttachmentScroll: {
    maxHeight: 72,
  },
  pendingAttachmentList: {
    gap: 8,
    paddingRight: 4,
  },
  pendingAttachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  pendingAttachmentThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  pendingAttachmentIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0d1117",
  },
  pendingAttachmentName: {
    flexShrink: 1,
    color: "#c9d1d9",
    fontSize: 12,
    maxWidth: 96,
  },
  pendingAttachmentRemove: {
    marginLeft: 2,
  },
  attachmentRow: {
    gap: 8,
    marginBottom: 8,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  attachmentThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  attachmentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,4,9,0.25)",
  },
  attachmentMeta: {
    flex: 1,
    minWidth: 0,
  },
  attachmentName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  attachmentKind: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    marginTop: 2,
  },
  input: {
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
