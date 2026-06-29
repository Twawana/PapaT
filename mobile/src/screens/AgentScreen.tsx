import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { AgentProviderModal } from "../components/AgentProviderModal";
import { AgentTryAgainModal } from "../components/AgentTryAgainModal";
import { AgentWorkspaceModal } from "../components/AgentWorkspaceModal";
import { useTheme } from "../context/ThemeContext";
import { useAgentChat } from "../hooks/useAgentChat";
import { useTabBarInset } from "../hooks/useTabBarInset";
import { ThemeColors } from "../theme/colors";
import { AgentUiMessage } from "../types/protocol";
import { dismissKeyboard, keyboardAvoidBehavior, keyboardPersistTaps } from "../utils/keyboard";
import { titusClient } from "../services/websocket";

interface Props {
  isConnected: boolean;
  workspacePath: string | null;
  workspaceName: string;
  onWorkspaceChange: (path: string, name: string) => void;
  onError: (message: string | null) => void;
}

type AgentScreenStyles = ReturnType<typeof createAgentStyles>;

function ToolCard({
  item,
  styles,
}: {
  item: Extract<AgentUiMessage, { kind: "tool" }>;
  styles: AgentScreenStyles;
}) {
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
  styles,
  colors,
}: {
  attachments: Array<{ id: string; name: string; mimeType: string; previewUri?: string }>;
  styles: AgentScreenStyles;
  colors: ThemeColors;
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
              <Ionicons name="document-outline" size={16} color={colors.iconAccent} />
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

function MessageBubble({
  item,
  styles,
  colors,
}: {
  item: AgentUiMessage;
  styles: AgentScreenStyles;
  colors: ThemeColors;
}) {
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
            <AttachmentChips attachments={attachmentItems} styles={styles} colors={colors} />
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
    return <ToolCard item={item} styles={styles} />;
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
  onWorkspaceChange,
  onError,
}: Props) {
  const listRef = useRef<FlatList>(null);
  const chat = useAgentChat(isConnected, onError);
  const tabBarInset = useTabBarInset();
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () => StyleSheet.create(createAgentStyles(colors, isDark)),
    [colors, isDark]
  );
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
  const [activeAgentLabel, setActiveAgentLabel] = useState("Cursor");

  useEffect(() => {
    if (!isConnected) return;
    void titusClient
      .listAgentProviders(false)
      .then((result) => {
        const active = result.providers.find((item) => item.id === result.activeProviderId);
        if (active) {
          setActiveAgentLabel(active.label);
        }
      })
      .catch(() => {
        // Non-blocking; modal refresh handles errors.
      });
  }, [isConnected]);

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

  const openWorkspaceModal = () => {
    if (!isConnected) return;
    dismissKeyboard();
    setWorkspaceModalVisible(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={keyboardAvoidBehavior()}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.toolbar}>
        <Pressable
          style={styles.titleBlock}
          onPress={openWorkspaceModal}
          disabled={!isConnected}
        >
          <Text style={styles.title}>AI Agent</Text>
          {hasWorkspace ? (
            <View style={styles.workspaceRow}>
              <Text style={styles.workspaceHint} numberOfLines={1}>
                {activeAgentLabel} · {workspaceName}
              </Text>
              {isConnected ? (
                <Ionicons name="create-outline" size={12} color={colors.accent} />
              ) : null}
            </View>
          ) : (
            <Text style={styles.workspaceHint} numberOfLines={1}>
              {isConnected ? `${activeAgentLabel} · Tap to set path` : activeAgentLabel}
            </Text>
          )}
          {hasWorkspace && workspacePath ? (
            <Text style={styles.workspacePath} numberOfLines={1}>
              {workspacePath}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.toolbarActions}>
          <Pressable
            style={[styles.providerBtn, !isConnected && styles.btnDisabled]}
            onPress={openWorkspaceModal}
            disabled={!isConnected}
            accessibilityLabel="Set workspace path"
          >
            <Ionicons name="folder-outline" size={14} color={colors.icon} />
            <Text style={styles.providerBtnText}>Path</Text>
          </Pressable>
          <Pressable
            style={[styles.providerBtn, !isConnected && styles.btnDisabled]}
            onPress={() => {
              dismissKeyboard();
              setProviderModalVisible(true);
            }}
            disabled={!isConnected}
          >
            <Ionicons name="people-outline" size={14} color={colors.icon} />
            <Text style={styles.providerBtnText}>Agent</Text>
          </Pressable>
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

      {chat.runningOnPc ? (
        <View style={styles.pcRunningBanner}>
          <Text style={styles.pcRunningText}>
            {isConnected
              ? "Running on your PC — you can leave this screen"
              : "Still running on your PC — reconnect to see updates"}
          </Text>
        </View>
      ) : null}

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
          Tap Path or the title above to enter a folder path on your PC.
        </Text>
      ) : null}

      <CookingBanner
        visible={(isConnected && chat.isRunning) || chat.runningOnPc}
        subtitle={cookingSubtitle}
      />

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
        renderItem={({ item }) => (
          <MessageBubble item={item} styles={styles} colors={colors} />
        )}
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
          <Ionicons name="attach" size={22} color={colors.icon} />
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
                      <Ionicons name="document-outline" size={14} color={colors.iconAccent} />
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
                    <Ionicons name="close-circle" size={18} color={colors.iconMuted} />
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
            placeholderTextColor={colors.placeholder}
            multiline
            editable={isConnected && !chat.isRunning && hasWorkspace}
            contextMenuHidden={false}
            selectionColor={colors.accent}
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

      <AgentProviderModal
        visible={providerModalVisible}
        onClose={() => setProviderModalVisible(false)}
        isConnected={isConnected}
        onError={onError}
        onActiveProviderChange={setActiveAgentLabel}
      />

      <AgentTryAgainModal
        visible={!!chat.tryAgainPrompt}
        title={chat.tryAgainPrompt?.title ?? "Try again"}
        message={chat.tryAgainPrompt?.message ?? ""}
        onTryAgain={() => void chat.tryAgain()}
        onDismiss={chat.dismissTryAgain}
      />

      <AgentWorkspaceModal
        visible={workspaceModalVisible}
        currentPath={workspacePath}
        isConnected={isConnected}
        onClose={() => setWorkspaceModalVisible(false)}
        onApplied={onWorkspaceChange}
        onError={onError}
      />
    </KeyboardAvoidingView>
  );
}

function createAgentStyles(colors: ThemeColors, isDark: boolean) {
  return {
    container: {
      flex: 1,
    },
    toolbar: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: 8,
    },
    pcRunningBanner: {
      backgroundColor: isDark ? "#132033" : "#ddf4ff",
      borderWidth: 1,
      borderColor: isDark ? "#388bfd66" : "#54aeff66",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
    },
    pcRunningText: {
      color: isDark ? "#79c0ff" : "#0550ae",
      fontSize: 12,
      fontWeight: "600" as const,
    },
    toolbarActions: {
      flexDirection: "row" as const,
      gap: 8,
    },
    providerBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    providerBtnText: {
      color: colors.icon,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    title: {
      color: colors.textSecondary,
      fontWeight: "600" as const,
      fontSize: 14,
    },
    titleBlock: {
      flex: 1,
      marginRight: 8,
    },
    workspaceHint: {
      color: colors.accent,
      fontSize: 12,
      marginTop: 2,
      flexShrink: 1,
    },
    workspaceRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      marginTop: 2,
    },
    workspacePath: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    actionBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.buttonPrimary,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    actionBtnText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    clearBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearBtnText: {
      color: colors.icon,
      fontSize: 12,
      fontWeight: "600" as const,
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
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sessionChipActive: {
      backgroundColor: colors.buttonPrimary,
      borderColor: colors.accentBorder,
    },
    sessionChipText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    sessionChipTextActive: {
      color: colors.onPrimary,
    },
    hint: {
      color: colors.textMuted,
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
      color: colors.textMuted,
      textAlign: "center" as const,
      marginTop: 24,
      fontSize: 14,
      lineHeight: 20,
    },
    messageBlock: {
      gap: 4,
    },
    senderLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700" as const,
      marginLeft: 4,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
    },
    senderLabelYou: {
      alignSelf: "flex-end" as const,
      marginRight: 4,
      marginLeft: 0,
      color: colors.accent,
    },
    senderLabelError: {
      color: colors.error,
    },
    bubble: {
      borderRadius: 12,
      padding: 12,
      maxWidth: "92%" as const,
    },
    userBubble: {
      alignSelf: "flex-end" as const,
      backgroundColor: colors.userBubble,
    },
    userText: {
      color: colors.onPrimary,
      fontSize: 14,
      lineHeight: 20,
    },
    assistantBubble: {
      alignSelf: "flex-start" as const,
      backgroundColor: colors.agentBubble,
      borderWidth: 1,
      borderColor: colors.border,
    },
    assistantText: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    errorBubble: {
      alignSelf: "stretch" as const,
      backgroundColor: colors.errorBannerBg,
      borderWidth: 1,
      borderColor: colors.error,
    },
    errorText: {
      color: colors.error,
      fontSize: 13,
    },
    toolCard: {
      backgroundColor: colors.toolCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      alignSelf: "stretch" as const,
    },
    toolCardError: {
      borderColor: colors.toolCardError,
    },
    toolHeader: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      marginBottom: 6,
    },
    toolName: {
      color: colors.accent,
      fontWeight: "700" as const,
      fontSize: 13,
    },
    toolStatus: {
      color: colors.textMuted,
      fontSize: 12,
    },
    toolArgs: {
      color: colors.textMuted,
      fontSize: 11,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      marginBottom: 6,
    },
    toolResult: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      lineHeight: 18,
    },
    inputRow: {
      flexDirection: "row" as const,
      gap: 8,
      alignItems: "flex-end" as const,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceMuted,
    },
    attachBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
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
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: 180,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
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
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.surface,
    },
    pendingAttachmentName: {
      flexShrink: 1,
      color: colors.textSecondary,
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
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      padding: 8,
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
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
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.08)",
    },
    attachmentMeta: {
      flex: 1,
      minWidth: 0,
    },
    attachmentName: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "600" as const,
    },
    attachmentKind: {
      color: isDark ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.85)",
      fontSize: 11,
      marginTop: 2,
    },
    input: {
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textSecondary,
      fontSize: 14,
    },
    sendBtn: {
      backgroundColor: colors.buttonSuccess,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    sendBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
    },
    stopBtn: {
      backgroundColor: colors.buttonDanger,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    stopBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  };
}
