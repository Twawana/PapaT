import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { papatClient } from "../services/websocket";
import { ConnectionStatus } from "../types/protocol";

const DEFAULT_HOST =
  __DEV__ && Platform.OS === "android" ? "10.0.2.2" : "localhost";
const DEFAULT_PORT = "3847";

export function useConnection() {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [serverInfo, setServerInfo] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [vscodeConnected, setVscodeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const removeStatus = papatClient.addStatusListener((status, detail) => {
      if (status === "open" && detail !== "connecting") {
        setConnectionStatus("connected");
        setError(null);
      } else if (status === "open" && detail === "connecting") {
        setConnectionStatus("connecting");
        setServerInfo(null);
      } else if (status === "close") {
        setConnectionStatus("disconnected");
        setServerInfo(null);
        setVscodeConnected(false);
      } else if (status === "error") {
        setConnectionStatus("error");
        setError(detail ?? "Connection failed");
      }
    });

    const removeMessage = papatClient.addMessageListener((message) => {
      if (message.type === "connected") {
        setServerInfo(`${message.hostname} (v${message.version})`);
        setWorkspacePath(message.workspace);
        setVscodeConnected(message.vscode?.connected ?? false);
        setConnectionStatus("connected");
        setError(null);
      }

      if (message.type === "vscode_status") {
        setVscodeConnected(message.connected);
      }
    });

    return () => {
      removeStatus();
      removeMessage();
    };
  }, []);

  const handleConnect = useCallback(() => {
    setError(null);
    setConnectionStatus("connecting");
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError("Invalid port number");
      setConnectionStatus("error");
      return;
    }
    papatClient.connect(host, portNum);
  }, [host, port]);

  const handleDisconnect = useCallback(() => {
    papatClient.disconnect();
    setConnectionStatus("disconnected");
    setServerInfo(null);
  }, []);

  return {
    host,
    setHost,
    port,
    setPort,
    connectionStatus,
    serverInfo,
    workspacePath,
    setWorkspacePath,
    error,
    setError,
    handleConnect,
    handleDisconnect,
    isConnected: connectionStatus === "connected",
    vscodeConnected,
  };
}
