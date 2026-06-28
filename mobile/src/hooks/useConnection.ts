import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { papatClient } from "../services/websocket";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "../services/credentials";
import { ConnectionStatus } from "../types/protocol";
import { errorMessage } from "../utils/errors";

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
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToken, setSavedToken] = useState<string | null>(null);

  useEffect(() => {
    void loadCredentials()
      .then((creds) => {
        if (!creds) return;
        setHost(creds.host);
        setPort(creds.port);
        setSavedToken(creds.token);
        setDeviceName(creds.deviceName ?? null);
        setIsPaired(true);
      })
      .catch((err) => {
        console.error("[PapaT] Failed to load saved credentials", err);
      });
  }, []);

  const applySession = useCallback(
    (hostname: string, version: string, workspace: string, name?: string) => {
      setServerInfo(`${hostname} (v${version})`);
      setWorkspacePath(workspace);
      setDeviceName(name ?? null);
      setConnectionStatus("connected");
      setError(null);
    },
    []
  );

  useEffect(() => {
    const removeStatus = papatClient.addStatusListener((status, detail) => {
      if (status === "open" && detail === "connecting") {
        setConnectionStatus("connecting");
        setServerInfo(null);
      } else if (status === "open" && detail === "authenticating") {
        setConnectionStatus("authenticating");
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
      if (message.type === "auth_ok") {
        const { host: connectHost, port: connectPort } = papatClient.getConnectTarget();
        applySession(message.hostname, message.version, message.workspace, message.deviceName);
        setVscodeConnected(message.vscode?.connected ?? false);
        setHost(connectHost);
        setPort(String(connectPort));

        if (message.token) {
          setSavedToken(message.token);
          setIsPaired(true);
          void saveCredentials({
            token: message.token,
            host: connectHost,
            port: String(connectPort),
            deviceName: message.deviceName,
          }).catch((err) => {
            console.error("[PapaT] Failed to save credentials", err);
          });
        }
      }

      if (message.type === "auth_error") {
        setConnectionStatus("error");
        setError(message.message);
        if (
          savedToken &&
          (message.message.includes("Invalid") ||
            message.message.includes("revoked") ||
            message.message.includes("expired"))
        ) {
          void clearCredentials();
          setSavedToken(null);
          setIsPaired(false);
        }
      }

      if (message.type === "connected") {
        applySession(message.hostname, message.version, message.workspace, message.deviceName);
        setVscodeConnected(message.vscode?.connected ?? false);
      }

      if (message.type === "vscode_status") {
        setVscodeConnected(message.connected);
      }
    });

    return () => {
      removeStatus();
      removeMessage();
    };
  }, [applySession, savedToken]);

  const connectWithOptions = useCallback(
    (options: { token?: string; pairingCode?: string }) => {
      setError(null);
      setConnectionStatus("connecting");
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setError("Invalid port number");
        setConnectionStatus("error");
        return;
      }

      papatClient.connect(host, portNum, {
        token: options.token,
        pairingCode: options.pairingCode,
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
      });
    },
    [host, port]
  );

  const handleConnect = useCallback(() => {
    if (savedToken) {
      connectWithOptions({ token: savedToken });
      return;
    }
    setError("Scan the QR code on your PC to pair first");
    setConnectionStatus("error");
  }, [connectWithOptions, savedToken]);

  const handlePairFromQr = useCallback(
    (qrHost: string, qrPort: number, code: string) => {
      setHost(qrHost);
      setPort(String(qrPort));
      setError(null);
      setConnectionStatus("connecting");
      setSavedToken(null);
      papatClient.connect(qrHost, qrPort, {
        pairingCode: code.trim().toUpperCase(),
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
      });
    },
    []
  );

  const handlePairWithCode = useCallback(
    (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setError("Enter the 6-character code from your PC");
        setConnectionStatus("error");
        return;
      }
      setError(null);
      setConnectionStatus("connecting");
      setSavedToken(null);
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setError("Invalid port number");
        setConnectionStatus("error");
        return;
      }
      papatClient.connect(host, portNum, {
        pairingCode: trimmed,
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
      });
    },
    [host, port]
  );

  const handleDisconnect = useCallback(() => {
    papatClient.disconnect();
    setConnectionStatus("disconnected");
    setServerInfo(null);
  }, []);

  const handleForgetDevice = useCallback(async () => {
    papatClient.disconnect();
    try {
      await clearCredentials();
      setSavedToken(null);
      setIsPaired(false);
      setDeviceName(null);
      setConnectionStatus("disconnected");
      setServerInfo(null);
      setError(null);
    } catch (err) {
      setConnectionStatus("disconnected");
      setServerInfo(null);
      setError(errorMessage(err, "Failed to forget device"));
    }
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
    handlePairFromQr,
    handlePairWithCode,
    handleForgetDevice,
    isConnected: connectionStatus === "connected",
    vscodeConnected,
    deviceName,
    isPaired,
  };
}
