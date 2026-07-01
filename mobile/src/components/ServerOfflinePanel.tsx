import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { CONNECTION_HELP } from "../config/api";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ConnectionStatus } from "../types/protocol";

interface Props {
  connectionStatus: ConnectionStatus;
}

export function ServerOfflinePanel({ connectionStatus }: Props) {
  const styles = useThemedStyles((c) => ({
    wrap: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingBottom: 24,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 20,
      gap: 12,
    },
    title: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    subtitle: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    step: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 4,
    },
    loadingText: {
      color: c.textMuted,
      fontSize: 13,
    },
  }));

  const busy =
    connectionStatus === "connecting" || connectionStatus === "authenticating";

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Connect to your PC</Text>
        <Text style={styles.subtitle}>
          Titus talks to the PapaT host on your computer over Wi-Fi (port{" "}
          {CONNECTION_HELP.port}). Pair using the QR code in the connection bar
          above.
        </Text>
        {CONNECTION_HELP.steps.map((step, index) => (
          <Text key={step} style={styles.step}>
            {index + 1}. {step}
          </Text>
        ))}
        {busy ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Connecting to host…</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
