import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ConnectionStatus } from "../types/protocol";

interface Props {
  host: string;
  port: string;
  connectionStatus: ConnectionStatus;
  serverInfo: string | null;
  vscodeConnected?: boolean;
  error: string | null;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectionBar({
  host,
  port,
  connectionStatus,
  serverInfo,
  vscodeConnected = false,
  error,
  onHostChange,
  onPortChange,
  onConnect,
  onDisconnect,
}: Props) {
  const statusColor =
    connectionStatus === "connected"
      ? "#3fb950"
      : connectionStatus === "connecting"
        ? "#d29922"
        : connectionStatus === "error"
          ? "#f85149"
          : "#8b949e";

  return (
    <View>
      <View style={styles.connectionBar}>
        <TextInput
          style={[styles.input, styles.hostInput]}
          value={host}
          onChangeText={onHostChange}
          placeholder="PC IP address"
          placeholderTextColor="#484f58"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={[styles.input, styles.portInput]}
          value={port}
          onChangeText={onPortChange}
          placeholder="Port"
          placeholderTextColor="#484f58"
          keyboardType="number-pad"
        />
        {connectionStatus === "connected" ? (
          <Pressable style={styles.disconnectBtn} onPress={onDisconnect}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.connectBtn,
              connectionStatus === "connecting" && styles.btnDisabled,
            ]}
            onPress={onConnect}
            disabled={connectionStatus === "connecting"}
          >
            {connectionStatus === "connecting" ? (
              <ActivityIndicator color="#0d1117" size="small" />
            ) : (
              <Text style={styles.connectText}>Connect</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={styles.statusText}>
          {connectionStatus === "connected" && serverInfo
            ? `Connected to ${serverInfo}${vscodeConnected ? " · VS Code linked" : ""}`
            : connectionStatus.charAt(0).toUpperCase() +
              connectionStatus.slice(1)}
        </Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  connectionBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#c9d1d9",
    fontSize: 14,
  },
  hostInput: {
    flex: 1,
  },
  portInput: {
    width: 72,
  },
  connectBtn: {
    backgroundColor: "#238636",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 90,
  },
  disconnectBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363d",
    minWidth: 90,
  },
  connectText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  disconnectText: {
    color: "#c9d1d9",
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
    color: "#8b949e",
    fontSize: 13,
  },
  errorText: {
    color: "#f85149",
    fontSize: 13,
    marginBottom: 8,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
