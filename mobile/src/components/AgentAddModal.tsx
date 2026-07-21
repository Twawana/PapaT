import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";
import { titusClient } from "../services/websocket";
import { AgentEmailLoginModal } from "./AgentEmailLoginModal";
import { AgentProviderId, AgentProviderStatus } from "../types/protocol";
import { errorMessage } from "../utils/errors";
import { dismissKeyboard } from "../utils/keyboard";

interface Props {
  visible: boolean;
  onClose: () => void;
  isConnected: boolean;
  providers: AgentProviderStatus[];
  onError: (message: string | null) => void;
  onConfigured: (
    providers: AgentProviderStatus[],
    activeProviderId: AgentProviderId,
    message: string
  ) => void;
}

type SetupField = "apiKey" | "emailLogin" | "installPath";

interface AgentSetupGuide {
  id: AgentProviderId;
  label: string;
  blurb: string;
  needs: SetupField[];
  steps: string[];
  pathPlaceholder?: string;
  keyPlaceholder?: string;
  keyHint?: string;
}

const SETUP_GUIDES: AgentSetupGuide[] = [
  {
    id: "cursor",
    label: "Cursor",
    blurb: "Uses the Cursor Agent CLI on your PC.",
    needs: ["emailLogin", "apiKey", "installPath"],
    steps: [
      "Install Cursor Agent CLI on your PC (or use an existing install).",
      "Sign in with email & password, or paste a Cursor API key.",
      "If Titus cannot find the CLI, set the install path on your PC.",
    ],
    pathPlaceholder: "C:\\Users\\you\\AppData\\Local\\cursor-agent",
    keyPlaceholder: "Cursor API key (optional if you sign in)",
    keyHint: "API key is optional when you use Email & password or are already logged in on the PC.",
  },
  {
    id: "claude",
    label: "Claude Code",
    blurb: "Uses the Claude Code CLI on your PC.",
    needs: ["emailLogin", "installPath"],
    steps: [
      "Install Claude Code CLI on your PC.",
      "Sign in with your Anthropic / Claude account.",
      "Set the CLI path only if auto-detect fails.",
    ],
    pathPlaceholder: "C:\\Users\\you\\.local\\bin\\claude.exe",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    blurb: "Uses the GitHub Copilot CLI on your PC.",
    needs: ["emailLogin", "installPath"],
    steps: [
      "Install GitHub Copilot CLI (npm i -g @github/copilot).",
      "Sign in with your GitHub account.",
      "Set the path to copilot.cmd if Titus cannot find it.",
    ],
    pathPlaceholder: "C:\\Users\\you\\AppData\\Roaming\\npm\\copilot.cmd",
  },
  {
    id: "augment",
    label: "Augment",
    blurb: "Uses the Augment (auggie) CLI on your PC.",
    needs: ["emailLogin", "installPath"],
    steps: [
      "Install the Augment CLI on your PC.",
      "Sign in with your Augment account.",
      "Set the CLI path if it is not on PATH.",
    ],
    pathPlaceholder: "C:\\Users\\you\\AppData\\Roaming\\npm\\auggie.cmd",
  },
  {
    id: "openai",
    label: "OpenAI",
    blurb: "Calls OpenAI from your PC with an API key.",
    needs: ["apiKey"],
    steps: [
      "Create an API key in your OpenAI account.",
      "Paste the key below — it is stored only on your PC.",
      "No CLI install is required.",
    ],
    keyPlaceholder: "sk-...",
    keyHint: "Stored on your PC host only. Never sent to other devices.",
  },
];

export function AgentAddModal({
  visible,
  onClose,
  isConnected,
  providers,
  onError,
  onConfigured,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedId, setSelectedId] = useState<AgentProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");

  const guide = useMemo(
    () => SETUP_GUIDES.find((item) => item.id === selectedId) ?? null,
    [selectedId]
  );

  const existing = useMemo(
    () => providers.find((item) => item.id === selectedId) ?? null,
    [providers, selectedId]
  );

  const resetForm = () => {
    setApiKey("");
    setInstallPath(existing?.installPath ?? "");
    setLoginVisible(false);
    setLoginUrl("");
  };

  const handlePick = (id: AgentProviderId) => {
    setSelectedId(id);
    const current = providers.find((item) => item.id === id);
    setApiKey("");
    setInstallPath(current?.installPath ?? "");
    onError(null);
  };

  const handleBack = () => {
    setSelectedId(null);
    setApiKey("");
    setInstallPath("");
    onError(null);
  };

  const finishWithState = (
    nextProviders: AgentProviderStatus[],
    activeProviderId: AgentProviderId,
    message: string
  ) => {
    onConfigured(nextProviders, activeProviderId, message);
    resetForm();
    setSelectedId(null);
    onClose();
  };

  const handleSaveAndUse = async () => {
    if (!isConnected || !guide || busy) return;

    const needsKey = guide.needs.includes("apiKey");
    const needsPath = guide.needs.includes("installPath");
    const keyRequired = guide.id === "openai";

    if (keyRequired && !apiKey.trim()) {
      onError("Enter your OpenAI API key to continue");
      return;
    }

    setBusy(true);
    onError(null);
    dismissKeyboard();

    try {
      if (needsKey && apiKey.trim()) {
        await titusClient.setAgentCredentials(guide.id, apiKey.trim());
      }
      if (needsPath && installPath.trim()) {
        await titusClient.setAgentInstallPath(guide.id, installPath.trim());
      }

      const result = await titusClient.setAgentProvider(guide.id);
      finishWithState(
        result.providers,
        result.activeProviderId,
        `Connected to ${guide.label}`
      );
    } catch (err) {
      onError(errorMessage(err, "Failed to add agent"));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!isConnected || !guide || busy) return;
    setBusy(true);
    onError(null);
    dismissKeyboard();
    try {
      const result = await titusClient.startAgentLogin(guide.id);
      if (!result.loginUrl) {
        onError(result.message || "No sign-in page returned");
        return;
      }
      setLoginUrl(result.loginUrl);
      setLoginVisible(true);
    } catch (err) {
      onError(errorMessage(err, "Failed to start sign-in"));
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSignedIn = async () => {
    if (!guide) return;
    setBusy(true);
    try {
      if (installPath.trim()) {
        await titusClient.setAgentInstallPath(guide.id, installPath.trim());
      }
      const result = await titusClient.setAgentProvider(guide.id);
      setLoginVisible(false);
      finishWithState(
        result.providers,
        result.activeProviderId,
        `Signed in to ${guide.label}`
      );
    } catch (err) {
      onError(errorMessage(err, "Signed in, but failed to activate agent"));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    if (loginVisible && selectedId) {
      titusClient.cancelAgentLogin(selectedId);
    }
    setLoginVisible(false);
    setSelectedId(null);
    setApiKey("");
    setInstallPath("");
    onClose();
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {guide ? `Add ${guide.label}` : "Add agent"}
              </Text>
              <Text style={styles.subtitle}>
                {guide
                  ? "Enter the details Titus needs to connect this agent on your PC."
                  : "Choose an AI agent, then fill in the connection info."}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={8} disabled={busy}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {!guide ? (
              SETUP_GUIDES.map((item) => {
                const status = providers.find((p) => p.id === item.id);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.pickCard}
                    onPress={() => handlePick(item.id)}
                    disabled={!isConnected || busy}
                  >
                    <Text style={styles.pickTitle}>{item.label}</Text>
                    <Text style={styles.pickBlurb}>{item.blurb}</Text>
                    <Text style={styles.pickStatus} numberOfLines={2}>
                      {status
                        ? status.authenticated
                          ? "Already connected on this PC"
                          : status.installed
                            ? "Installed — needs sign-in"
                            : "Not set up yet"
                        : "Tap to set up"}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.setupCard}>
                <Pressable onPress={handleBack} disabled={busy} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>← Choose a different agent</Text>
                </Pressable>

                <Text style={styles.sectionTitle}>What you need</Text>
                {guide.steps.map((step, index) => (
                  <Text key={step} style={styles.step}>
                    {index + 1}. {step}
                  </Text>
                ))}

                {existing ? (
                  <View style={styles.statusBox}>
                    <Text style={styles.statusLabel}>Current status on PC</Text>
                    <Text style={styles.statusValue} numberOfLines={4}>
                      {existing.statusMessage}
                    </Text>
                  </View>
                ) : null}

                {guide.needs.includes("emailLogin") ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>Sign in</Text>
                    <Text style={styles.fieldHint}>
                      Opens the provider login page so you can enter email and password.
                    </Text>
                    <Pressable
                      style={[styles.primaryBtn, busy && styles.btnDisabled]}
                      onPress={() => void handleEmailLogin()}
                      disabled={busy || !isConnected}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.onPrimary} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Email & password</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {guide.needs.includes("apiKey") ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>API key</Text>
                    {guide.keyHint ? (
                      <Text style={styles.fieldHint}>{guide.keyHint}</Text>
                    ) : null}
                    <TextInput
                      style={styles.input}
                      value={apiKey}
                      onChangeText={setApiKey}
                      placeholder={guide.keyPlaceholder}
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ) : null}

                {guide.needs.includes("installPath") ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>CLI path on your PC (optional)</Text>
                    <Text style={styles.fieldHint}>
                      Only needed if Titus cannot auto-find the install. Paste the folder or
                      .exe / .cmd path.
                    </Text>
                    <TextInput
                      style={[styles.input, styles.pathInput]}
                      value={installPath}
                      onChangeText={setInstallPath}
                      placeholder={guide.pathPlaceholder}
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      multiline
                    />
                  </View>
                ) : null}

                <Pressable
                  style={[styles.primaryBtn, styles.useBtn, busy && styles.btnDisabled]}
                  onPress={() => void handleSaveAndUse()}
                  disabled={busy || !isConnected}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {guide.needs.includes("emailLogin") && !apiKey.trim()
                        ? "Save path & use agent"
                        : "Save & use this agent"}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <AgentEmailLoginModal
        visible={loginVisible}
        providerId={selectedId}
        providerLabel={guide?.label ?? ""}
        loginUrl={loginUrl}
        onClose={() => {
          if (selectedId) {
            titusClient.cancelAgentLogin(selectedId);
          }
          setLoginVisible(false);
        }}
        onSignedIn={() => {
          void handleLoginSignedIn();
        }}
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
      fontSize: 22,
      fontWeight: "800" as const,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    close: {
      color: colors.link,
      fontWeight: "700" as const,
      fontSize: 14,
    },
    content: {
      paddingBottom: 40,
      gap: 12,
    },
    pickCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 16,
      backgroundColor: colors.surfaceElevated,
      gap: 6,
    },
    pickTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "700" as const,
    },
    pickBlurb: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    pickStatus: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    setupCard: {
      gap: 14,
    },
    backBtn: {
      alignSelf: "flex-start" as const,
      paddingVertical: 4,
    },
    backBtnText: {
      color: colors.link,
      fontWeight: "600" as const,
      fontSize: 13,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "700" as const,
    },
    step: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    statusBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      padding: 12,
      gap: 4,
    },
    statusLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700" as const,
      textTransform: "uppercase" as const,
    },
    statusValue: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    fieldBlock: {
      gap: 8,
    },
    fieldLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700" as const,
    },
    fieldHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textSecondary,
      backgroundColor: colors.surfaceElevated,
      fontSize: 14,
    },
    pathInput: {
      minHeight: 64,
      textAlignVertical: "top" as const,
    },
    primaryBtn: {
      backgroundColor: colors.buttonPrimary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 44,
    },
    useBtn: {
      marginTop: 4,
    },
    primaryBtnText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 14,
    },
    btnDisabled: {
      opacity: 0.5,
    },
  };
}
