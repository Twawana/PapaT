import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ConnectionStatus } from "../types/protocol";
import { QrPairModal } from "./QrPairModal";

interface Props {
  host: string;
  port: string;
  connectionStatus: ConnectionStatus;
  serverInfo: string | null;
  vscodeConnected?: boolean;
  deviceName?: string | null;
  isPaired?: boolean;
  error: string | null;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onPairFromQr: (host: string, port: number, code: string) => void;
  onPairWithCode: (code: string) => void;
  onForgetDevice: () => void;
  onError: (message: string | null) => void;
  detailsVisible: boolean;
  onDetailsVisibleChange: (visible: boolean) => void;
}

export function ConnectionBar({
  host,
  port,
  connectionStatus,
  serverInfo,
  vscodeConnected = false,
  deviceName,
  isPaired = false,
  error,
  onHostChange,
  onPortChange,
  onConnect,
  onDisconnect,
  onPairFromQr,
  onPairWithCode,
  onForgetDevice,
  onError,
  detailsVisible,
  onDetailsVisibleChange,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    compactStatusText: {
      flex: 1,
      color: c.textMuted,
      fontSize: 13,
    },
    toggleHint: {
      color: c.link,
      fontSize: 12,
      fontWeight: "600",
    },
    connectionBar: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.textSecondary,
      fontSize: 14,
    },
    hostInput: {
      flex: 1,
    },
    portInput: {
      width: 72,
    },
    codeRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    codeInput: {
      flex: 1,
      letterSpacing: 2,
      fontWeight: "700",
    },
    codeBtn: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    codeBtnText: {
      color: c.textSecondary,
      fontWeight: "700",
      fontSize: 13,
    },
    connectBtn: {
      backgroundColor: c.buttonSuccess,
      borderRadius: 8,
      paddingHorizontal: 16,
      justifyContent: "center",
      alignItems: "center",
      minWidth: 90,
    },
    disconnectBtn: {
      backgroundColor: c.buttonSecondary,
      borderRadius: 8,
      paddingHorizontal: 12,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      minWidth: 90,
    },
    connectText: {
      color: c.onPrimary,
      fontWeight: "600",
      fontSize: 14,
    },
    disconnectText: {
      color: c.textSecondary,
      fontWeight: "600",
      fontSize: 13,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      color: c.textMuted,
      fontSize: 13,
    },
    errorText: {
      color: c.errorText,
      fontSize: 13,
      marginBottom: 8,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    secondaryRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    scanBtn: {
      flex: 1,
      backgroundColor: c.accent,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
    },
    scanBtnText: {
      color: c.onPrimary,
      fontWeight: "700",
      fontSize: 13,
    },
    forgetBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: c.buttonSecondary,
      borderWidth: 1,
      borderColor: c.border,
    },
    forgetBtnText: {
      color: c.textMuted,
      fontWeight: "600",
      fontSize: 12,
    },
  }));

  const [qrVisible, setQrVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const isConnected = connectionStatus === "connected";
  const showDetails = !isConnected || detailsVisible;

  useEffect(() => {
    if (!isConnected) {
      onDetailsVisibleChange(true);
    }
  }, [isConnected, onDetailsVisibleChange]);

  const statusColor =
    connectionStatus === "connected"
      ? colors.success
      : connectionStatus === "connecting" || connectionStatus === "authenticating"
        ? colors.warning
        : connectionStatus === "error"
          ? colors.error
          : colors.textMuted;

  const busy =
    connectionStatus === "connecting" || connectionStatus === "authenticating";

  const statusLabel =
    isConnected && serverInfo
      ? `Connected to ${serverInfo}${deviceName ? ` · ${deviceName}` : ""}${vscodeConnected ? " · VS Code" : ""}`
      : connectionStatus === "authenticating"
        ? "Authenticating..."
        : connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);

  return (
    <View>
      {isConnected ? (
        <Pressable
          style={styles.compactRow}
          onPress={() => onDetailsVisibleChange(!detailsVisible)}
        >
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.compactStatusText} numberOfLines={1}>
            {statusLabel}
          </Text>
          <Text style={styles.toggleHint}>
            {detailsVisible ? "Hide" : "Show"}
          </Text>
        </Pressable>
      ) : null}

      {showDetails ? (
        <>
          <View style={styles.connectionBar}>
            <TextInput
              style={[styles.input, styles.hostInput]}
              value={host}
              onChangeText={onHostChange}
              placeholder="PC IP address"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TextInput
              style={[styles.input, styles.portInput]}
              value={port}
              onChangeText={onPortChange}
              placeholder="Port"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            {isConnected ? (
              <Pressable style={styles.disconnectBtn} onPress={onDisconnect}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.connectBtn, busy && styles.btnDisabled]}
                onPress={isPaired ? onConnect : () => setQrVisible(true)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.spinnerOnAccent} size="small" />
                ) : (
                  <Text style={styles.connectText}>
                    {isPaired ? "Connect" : "Pair"}
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          {!isPaired && !isConnected ? (
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={manualCode}
                onChangeText={(text) => setManualCode(text.toUpperCase())}
                placeholder="6-char code from PC"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
              />
              <Pressable
                style={[
                  styles.codeBtn,
                  (busy || manualCode.trim().length < 6) && styles.btnDisabled,
                ]}
                onPress={() => {
                  onError(null);
                  onPairWithCode(manualCode);
                }}
                disabled={busy || manualCode.trim().length < 6}
              >
                <Text style={styles.codeBtnText}>Use code</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.secondaryRow}>
            <Pressable
              style={[styles.scanBtn, busy && styles.btnDisabled]}
              onPress={() => setQrVisible(true)}
              disabled={busy}
            >
              <Text style={styles.scanBtnText}>Scan QR</Text>
            </Pressable>
            {isPaired ? (
              <Pressable style={styles.forgetBtn} onPress={onForgetDevice}>
                <Text style={styles.forgetBtnText}>Forget device</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      {!isConnected ? (
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.errorText} selectable>
          {error}
        </Text>
      ) : null}

      <QrPairModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        onScanned={(qrHost, qrPort, code) => {
          onError(null);
          onPairFromQr(qrHost, qrPort, code);
        }}
        onError={(message) => {
          onError(message);
        }}
      />
    </View>
  );
}
