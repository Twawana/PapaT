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
import { DEV_LOCAL_IP, HOST_SERVER_PORT } from "../config/api";
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

    // --- QR-scan-first primary state ---
    qrPrimary: {
      alignItems: "center" as const,
      paddingVertical: 16,
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    qrPrimaryBtn: {
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 32,
      alignItems: "center" as const,
      width: "100%" as const,
      maxWidth: 320,
    },
    qrPrimaryBtnText: {
      color: c.onPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    qrPrimaryHint: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 8,
      textAlign: "center" as const,
    },
    pairedHint: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 12,
      textAlign: "center" as const,
    },
    pairedConnectRow: {
      flexDirection: "row" as const,
      gap: 8,
      justifyContent: "center" as const,
      marginBottom: 12,
    },

    // --- Manual setup section ---
    manualToggle: {
      alignSelf: "center" as const,
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    manualToggleText: {
      color: c.link,
      fontSize: 13,
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
  const [manualOpen, setManualOpen] = useState(false);

  const isConnected = connectionStatus === "connected";
  const showDetails = !isConnected || detailsVisible;
  const busy =
    connectionStatus === "connecting" || connectionStatus === "authenticating";

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

  const statusLabel =
    isConnected && serverInfo
      ? `Connected to ${serverInfo}${deviceName ? ` · ${deviceName}` : ""}${vscodeConnected ? " · VS Code" : ""}`
      : connectionStatus === "authenticating"
        ? "Authenticating..."
        : connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);

  return (
    <View>
      {/* Compact status row when connected */}
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
          {/* ====== NOT CONNECTED: QR-first primary ====== */}
          {!isConnected && (
            <>
              {/* If already paired (has saved token), show a Connect button and Forget */}
              {isPaired ? (
                <>
                  <Text style={styles.pairedHint}>
                    Previously paired with this PC. Tap Connect to reconnect, or
                    scan a new QR code.
                  </Text>
                  <View style={styles.pairedConnectRow}>
                    <Pressable
                      style={[styles.connectBtn, busy && styles.btnDisabled]}
                      onPress={onConnect}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator
                          color={colors.spinnerOnAccent}
                          size="small"
                        />
                      ) : (
                        <Text style={styles.connectText}>Connect</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.scanBtn}
                      onPress={() => setQrVisible(true)}
                    >
                      <Text style={styles.scanBtnText}>Scan new QR</Text>
                    </Pressable>
                    <Pressable style={styles.forgetBtn} onPress={onForgetDevice}>
                      <Text style={styles.forgetBtnText}>Forget</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                /* Not paired — big QR button as primary action */
                <View style={styles.qrPrimary}>
                  <Pressable
                    style={[styles.qrPrimaryBtn, busy && styles.btnDisabled]}
                    onPress={() => setQrVisible(true)}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator
                        color={colors.spinnerOnAccent}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.qrPrimaryBtnText}>
                        Scan QR Code to Connect
                      </Text>
                    )}
                  </Pressable>
                  <Text style={styles.qrPrimaryHint}>
                    Open PapaT on your PC, then scan the QR code shown there.
                    Phone and PC must be on the same Wi-Fi.
                  </Text>
                </View>
              )}

              {/* Manual setup — available for first pair and to fix IP after DHCP change */}
              <Pressable
                style={styles.manualToggle}
                onPress={() => setManualOpen(!manualOpen)}
              >
                <Text style={styles.manualToggleText}>
                  {manualOpen
                    ? "Hide manual setup"
                    : isPaired
                      ? "Change PC address"
                      : "Enter IP & code manually"}
                </Text>
              </Pressable>
            </>
          )}

          {/* ====== Manual setup fields (collapsible) ====== */}
          {manualOpen && !isConnected && (
            <>
              <View style={styles.connectionBar}>
                <TextInput
                  style={[styles.input, styles.hostInput]}
                  value={host}
                  onChangeText={onHostChange}
                  placeholder={`PC IP (e.g. ${DEV_LOCAL_IP})`}
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
                  placeholder={String(HOST_SERVER_PORT)}
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {isPaired ? (
                  <Pressable
                    style={[styles.connectBtn, busy && styles.btnDisabled]}
                    onPress={onConnect}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator
                        color={colors.spinnerOnAccent}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.connectText}>Connect</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.disconnectBtn]}
                    onPress={() => setQrVisible(true)}
                  >
                    <Text style={styles.disconnectText}>Scan QR</Text>
                  </Pressable>
                )}
              </View>

              {!isPaired ? (
              <View style={styles.codeRow}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={manualCode}
                  onChangeText={(text) => setManualCode(text.toUpperCase())}
                  placeholder="6-char code from PapaT desktop"
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
              ) : (
                <Text style={styles.pairedHint}>
                  Update the IP if your PC address changed, then tap Connect.
                  Or scan a new QR to re-pair.
                </Text>
              )}
            </>
          )}

          {/* ====== Connected state: show disconnect and forget buttons ====== */}
          {isConnected && (
            <View style={styles.secondaryRow}>
              <Pressable
                style={[styles.disconnectBtn, { flex: 1 }]}
                onPress={onDisconnect}
              >
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
              <Pressable style={styles.forgetBtn} onPress={onForgetDevice}>
                <Text style={styles.forgetBtnText}>Forget device</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : null}

      {/* Status indicator + error */}
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

