import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";
import { titusClient } from "../services/websocket";
import { AgentEmailLoginModal } from "./AgentEmailLoginModal";
import { AgentProviderId, AgentProviderStatus, ServerMessage } from "../types/protocol";
import { errorMessage } from "../utils/errors";
import { dismissKeyboard } from "../utils/keyboard";

interface Props {
  visible: boolean;
  onClose: () => void;
  isConnected: boolean;
  onError: (message: string | null) => void;
  onActiveProviderChange?: (label: string) => void;
}

const KEYED_PROVIDERS = new Set<AgentProviderId>(["cursor", "openai"]);
const EMAIL_LOGIN_PROVIDERS = new Set<AgentProviderId>([
  "cursor",
  "claude",
  "copilot",
  "augment",
]);
const CLI_INSTALL_PROVIDERS = new Set<AgentProviderId>([
  "cursor",
  "claude",
  "copilot",
  "augment",
]);

function statusColor(provider: AgentProviderStatus, colors: ThemeColors): string {
  if (!provider.installed) return colors.textMuted;
  if (provider.authenticated) return colors.success;
  return colors.warning;
}

export function AgentProviderModal({
  visible,
  onClose,
  isConnected,
  onError,
  onActiveProviderChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [providers, setProviders] = useState<AgentProviderStatus[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<AgentProviderId>("cursor");
  const [loading, setLoading] = useState(false);
  const [busyProviderId, setBusyProviderId] = useState<AgentProviderId | null>(null);
  const [editingProviderId, setEditingProviderId] = useState<AgentProviderId | null>(null);
  const [editingPathProviderId, setEditingPathProviderId] = useState<AgentProviderId | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [loginProviderId, setLoginProviderId] = useState<AgentProviderId | null>(null);
  const [loginProviderLabel, setLoginProviderLabel] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [loginModalVisible, setLoginModalVisible] = useState(false);

  const applyProviderState = useCallback(
    (nextProviders: AgentProviderStatus[], nextActiveId: AgentProviderId) => {
      setProviders(nextProviders);
      setActiveProviderId(nextActiveId);
      const active = nextProviders.find((item) => item.id === nextActiveId);
      if (active) {
        onActiveProviderChange?.(active.label);
      }
    },
    [onActiveProviderChange]
  );

  const refresh = useCallback(
    async (force = true) => {
      if (!isConnected) return;
      setLoading(true);
      onError(null);
      try {
        const result = await titusClient.listAgentProviders(force);
        applyProviderState(result.providers, result.activeProviderId);
      } catch (err) {
        onError(errorMessage(err, "Failed to load agents"));
      } finally {
        setLoading(false);
      }
    },
    [applyProviderState, isConnected, onError]
  );

  useEffect(() => {
    if (!visible || !isConnected) return;
    void refresh(true);
  }, [visible, isConnected, refresh]);

  useEffect(() => {
    if (!visible) return;

    const remove = titusClient.addMessageListener((message: ServerMessage) => {
      if (message.type === "agent_provider_changed") {
        applyProviderState(message.providers, message.activeProviderId);
      }
    });

    return remove;
  }, [applyProviderState, visible]);

  const handleSelect = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    setBusyProviderId(providerId);
    onError(null);
    try {
      const result = await titusClient.setAgentProvider(providerId);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(`Using ${result.providers.find((p) => p.id === providerId)?.label ?? providerId}`);
    } catch (err) {
      onError(errorMessage(err, "Failed to switch agent"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleSaveApiKey = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      onError("Enter an API key or tap Use PC login");
      return;
    }

    setBusyProviderId(providerId);
    onError(null);
    dismissKeyboard();
    try {
      const result = await titusClient.setAgentCredentials(providerId, trimmed);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(result.message);
      setApiKeyInput("");
      setEditingProviderId(null);
    } catch (err) {
      onError(errorMessage(err, "Failed to save API key"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleClearApiKey = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    setBusyProviderId(providerId);
    onError(null);
    try {
      const result = await titusClient.setAgentCredentials(providerId, null);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(result.message);
      setApiKeyInput("");
      setEditingProviderId(null);
    } catch (err) {
      onError(errorMessage(err, "Failed to clear API key"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleLogout = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    setBusyProviderId(providerId);
    onError(null);
    try {
      const result = await titusClient.logoutAgentProvider(providerId);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(result.message);
      setApiKeyInput("");
      setEditingProviderId(null);
    } catch (err) {
      onError(errorMessage(err, "Failed to sign out"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleEmailLogin = async (provider: AgentProviderStatus) => {
    if (!isConnected || busyProviderId) return;
    setBusyProviderId(provider.id);
    onError(null);
    dismissKeyboard();
    try {
      const result = await titusClient.startAgentLogin(provider.id);
      if (!result.loginUrl) {
        onError(result.message || "No sign-in page returned");
        return;
      }
      setLoginProviderId(provider.id);
      setLoginProviderLabel(provider.label);
      setLoginUrl(result.loginUrl);
      setLoginModalVisible(true);
      setToast(result.message);
    } catch (err) {
      onError(errorMessage(err, "Failed to start email sign-in"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleLoginSignedIn = () => {
    setLoginModalVisible(false);
    setLoginUrl("");
    setLoginProviderId(null);
    setToast("Signed in successfully");
    void refresh(true);
  };

  const handleLoginClose = () => {
    setLoginModalVisible(false);
    setLoginUrl("");
    setLoginProviderId(null);
  };

  const openPathEditor = (provider: AgentProviderStatus) => {
    setEditingProviderId(null);
    setApiKeyInput("");
    if (editingPathProviderId === provider.id) {
      setEditingPathProviderId(null);
      setPathInput("");
      return;
    }
    setEditingPathProviderId(provider.id);
    setPathInput(provider.installPath ?? "");
  };

  const handleSaveInstallPath = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    const trimmed = pathInput.trim();
    if (!trimmed) {
      onError("Enter the install folder or executable path on your PC");
      return;
    }

    setBusyProviderId(providerId);
    onError(null);
    dismissKeyboard();
    try {
      const result = await titusClient.setAgentInstallPath(providerId, trimmed);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(result.message);
      setEditingPathProviderId(null);
      setPathInput("");
    } catch (err) {
      onError(errorMessage(err, "Failed to save install path"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleClearInstallPath = async (providerId: AgentProviderId) => {
    if (!isConnected || busyProviderId) return;
    setBusyProviderId(providerId);
    onError(null);
    try {
      const result = await titusClient.setAgentInstallPath(providerId, null);
      applyProviderState(result.providers, result.activeProviderId);
      setToast(result.message);
      setPathInput("");
      setEditingPathProviderId(null);
    } catch (err) {
      onError(errorMessage(err, "Failed to clear install path"));
    } finally {
      setBusyProviderId(null);
    }
  };

  const renderPathChip = (provider: AgentProviderStatus) => {
    const editingPath = editingPathProviderId === provider.id;
    return (
      <Pressable
        style={styles.actionChip}
        onPress={() => openPathEditor(provider)}
        disabled={!!busyProviderId}
      >
        <Text style={styles.actionChipText}>
          {editingPath ? "Cancel path" : provider.installPath ? "Edit path" : "Set path"}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Agent account</Text>
            <Text style={styles.subtitle}>
              Switch which AI runs on your PC. API keys are stored on the host only.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
            <Pressable onPress={() => setToast(null)}>
              <Ionicons name="close" size={16} color={colors.icon} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {loading && providers.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : null}

          {providers.map((provider) => {
            const active = provider.id === activeProviderId;
            const busy = busyProviderId === provider.id;
            const editing = editingProviderId === provider.id;
            const editingPath = editingPathProviderId === provider.id;
            const supportsKey = KEYED_PROVIDERS.has(provider.id);
            const supportsEmailLogin = EMAIL_LOGIN_PROVIDERS.has(provider.id);
            const supportsInstallPath = CLI_INSTALL_PROVIDERS.has(provider.id);
            const showPathInEmailRow = supportsInstallPath && supportsEmailLogin && !supportsKey;
            const showPathInKeyRow = supportsInstallPath && supportsKey;

            return (
              <View
                key={provider.id}
                style={[styles.card, active && styles.cardActive]}
              >
                <Pressable
                  style={styles.cardMain}
                  onPress={() => void handleSelect(provider.id)}
                  disabled={!isConnected || !!busyProviderId}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardTitleRow}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor(provider, colors) }]} />
                      <Text style={styles.cardTitle}>{provider.label}</Text>
                      {active ? <Text style={styles.activeBadge}>Active</Text> : null}
                    </View>
                    {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  </View>
                  <Text style={styles.cardDescription}>{provider.description}</Text>
                  <Text style={styles.cardStatus} numberOfLines={3}>
                    {provider.statusMessage}
                  </Text>
                </Pressable>

                {supportsEmailLogin ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionChip, styles.actionChipPrimary]}
                      onPress={() => void handleEmailLogin(provider)}
                      disabled={!!busyProviderId}
                    >
                      <Text style={styles.actionChipTextPrimary}>Email & password</Text>
                    </Pressable>
                    {showPathInEmailRow ? renderPathChip(provider) : null}
                  </View>
                ) : null}

                {supportsKey ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.actionChip}
                      onPress={() => {
                        setEditingProviderId(editing ? null : provider.id);
                        setEditingPathProviderId(null);
                        setPathInput("");
                        setApiKeyInput("");
                      }}
                    >
                      <Text style={styles.actionChipText}>
                        {editing ? "Cancel key" : "Set API key"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionChip}
                      onPress={() => void handleClearApiKey(provider.id)}
                      disabled={!!busyProviderId}
                    >
                      <Text style={styles.actionChipText}>Use PC login</Text>
                    </Pressable>
                    {showPathInKeyRow ? renderPathChip(provider) : null}
                    <Pressable
                      style={[styles.actionChip, styles.actionChipDanger]}
                      onPress={() => void handleLogout(provider.id)}
                      disabled={!!busyProviderId}
                    >
                      <Text style={styles.actionChipTextDanger}>Sign out</Text>
                    </Pressable>
                  </View>
                ) : null}

                {editing ? (
                  <View style={styles.keyEditor}>
                    <TextInput
                      style={styles.keyInput}
                      value={apiKeyInput}
                      onChangeText={setApiKeyInput}
                      placeholder={
                        provider.id === "cursor"
                          ? "Cursor API key (different account)"
                          : "OpenAI API key"
                      }
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      style={[styles.saveBtn, !apiKeyInput.trim() && styles.btnDisabled]}
                      onPress={() => void handleSaveApiKey(provider.id)}
                      disabled={!apiKeyInput.trim() || !!busyProviderId}
                    >
                      <Text style={styles.saveBtnText}>Save key</Text>
                    </Pressable>
                  </View>
                ) : null}

                {editingPath ? (
                  <View style={styles.keyEditor}>
                    <Text style={styles.pathLabel}>Install path on your PC</Text>
                    <TextInput
                      style={styles.pathInput}
                      value={pathInput}
                      onChangeText={setPathInput}
                      placeholder="C:\Users\you\AppData\Local\cursor-agent"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      multiline
                    />
                    <Text style={styles.pathHint}>
                      Point to the install folder or the CLI executable. Leave blank and use
                      Auto-detect to search PATH again.
                    </Text>
                    <View style={styles.pathActions}>
                      <Pressable
                        style={[styles.saveBtn, !pathInput.trim() && styles.btnDisabled]}
                        onPress={() => void handleSaveInstallPath(provider.id)}
                        disabled={!pathInput.trim() || !!busyProviderId}
                      >
                        <Text style={styles.saveBtnText}>Save path</Text>
                      </Pressable>
                      {provider.installPath ? (
                        <Pressable
                          style={styles.secondaryPathBtn}
                          onPress={() => void handleClearInstallPath(provider.id)}
                          disabled={!!busyProviderId}
                        >
                          <Text style={styles.secondaryPathBtnText}>Auto-detect</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.footerNote}>
            Use Email & password to sign in on your phone (opens the provider sign-in page). Set
            path when the CLI is installed somewhere Titus cannot find automatically. API keys are
            stored on your PC.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.refreshBtn, (!isConnected || loading) && styles.btnDisabled]}
            onPress={() => void refresh(true)}
            disabled={!isConnected || loading}
          >
            <Ionicons name="refresh" size={16} color={colors.icon} />
            <Text style={styles.refreshBtnText}>Refresh status</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <AgentEmailLoginModal
      visible={loginModalVisible}
      providerId={loginProviderId}
      providerLabel={loginProviderLabel}
      loginUrl={loginUrl}
      onClose={handleLoginClose}
      onSignedIn={handleLoginSignedIn}
    />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: 56,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "space-between" as const,
      marginBottom: 12,
      gap: 12,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700" as const,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 4,
      lineHeight: 18,
    },
    close: {
      color: colors.link,
      fontSize: 16,
      fontWeight: "600" as const,
    },
    toast: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 8,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    toastText: {
      color: colors.textSecondary,
      flex: 1,
      fontSize: 13,
    },
    list: {
      paddingBottom: 24,
      gap: 12,
    },
    loader: {
      marginTop: 24,
    },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      overflow: "hidden" as const,
    },
    cardActive: {
      borderColor: colors.accentBorder,
    },
    cardMain: {
      padding: 14,
      gap: 6,
    },
    cardTop: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    cardTitleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      flex: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700" as const,
    },
    activeBadge: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "700" as const,
      textTransform: "uppercase" as const,
    },
    cardDescription: {
      color: colors.textMuted,
      fontSize: 12,
    },
    cardStatus: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    actions: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 12,
    },
    actionChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionChipPrimary: {
      backgroundColor: colors.buttonPrimary,
      borderColor: colors.accentBorder,
    },
    actionChipTextPrimary: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "700" as const,
    },
    actionChipDanger: {
      borderColor: colors.error,
    },
    actionChipText: {
      color: colors.icon,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    actionChipTextDanger: {
      color: colors.errorText,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    keyEditor: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 8,
    },
    keyInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      fontSize: 14,
    },
    saveBtn: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonPrimary,
    },
    saveBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 13,
    },
    pathLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    pathInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      fontSize: 14,
      minHeight: 72,
      textAlignVertical: "top" as const,
    },
    pathHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    pathActions: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      alignItems: "center" as const,
    },
    secondaryPathBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryPathBtnText: {
      color: colors.icon,
      fontWeight: "600" as const,
      fontSize: 13,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    footerNote: {
      color: colors.placeholder,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    footer: {
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceMuted,
    },
    refreshBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshBtnText: {
      color: colors.icon,
      fontWeight: "600" as const,
      fontSize: 14,
    },
  };
}
