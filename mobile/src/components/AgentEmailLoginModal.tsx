import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";
import { titusClient } from "../services/websocket";
import { AgentProviderId, ServerMessage } from "../types/protocol";

interface Props {
  visible: boolean;
  providerId: AgentProviderId | null;
  providerLabel: string;
  loginUrl: string;
  onClose: () => void;
  onSignedIn: () => void;
}

export function AgentEmailLoginModal({
  visible,
  providerId,
  providerLabel,
  loginUrl,
  onClose,
  onSignedIn,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [waiting, setWaiting] = useState(true);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!visible || !providerId) return;
    completedRef.current = false;
    setWaiting(true);

    const remove = titusClient.addMessageListener((message: ServerMessage) => {
      if (message.type !== "agent_login_complete") return;
      if (message.providerId !== providerId) return;
      if (completedRef.current) return;

      completedRef.current = true;
      setWaiting(false);
      if (message.success) {
        onSignedIn();
      }
    });

    const poll = setInterval(() => {
      void titusClient
        .listAgentProviders(true)
        .then((result) => {
          const provider = result.providers.find((item) => item.id === providerId);
          if (provider?.authenticated && !completedRef.current) {
            completedRef.current = true;
            setWaiting(false);
            onSignedIn();
          }
        })
        .catch(() => {
          // ignore polling errors
        });
    }, 3000);

    return () => {
      remove();
      clearInterval(poll);
    };
  }, [onSignedIn, providerId, visible]);

  const handleClose = () => {
    if (providerId) {
      titusClient.cancelAgentLogin(providerId);
    }
    onClose();
  };

  const handleOpenBrowser = () => {
    if (loginUrl) {
      void Linking.openURL(loginUrl);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Sign in to {providerLabel}</Text>
            <Text style={styles.subtitle}>
              Enter your email and password on the sign-in page below.
            </Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {waiting ? (
          <View style={styles.waitingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.waitingText}>Waiting for sign-in to finish on your PC…</Text>
          </View>
        ) : null}

        <Pressable style={styles.browserBtn} onPress={handleOpenBrowser}>
          <Text style={styles.browserBtnText}>Open in browser instead</Text>
        </Pressable>

        {loginUrl ? (
          <WebView
            source={{ uri: loginUrl }}
            style={styles.webview}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sign-in page available.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: 56,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 16,
      marginBottom: 8,
      gap: 12,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
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
    waitingRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    waitingText: {
      color: colors.textMuted,
      fontSize: 12,
      flex: 1,
    },
    browserBtn: {
      alignSelf: "flex-start" as const,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    browserBtnText: {
      color: colors.link,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    webview: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    empty: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    emptyText: {
      color: colors.textMuted,
    },
  };
}
