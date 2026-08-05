import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  formatConnectionError,
  isLocalhostHost,
} from "../config/api";
import { titusClient } from "../services/websocket";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "../services/credentials";
import { ConnectionStatus } from "../types/protocol";
import { errorMessage } from "../utils/errors";

type AuthAttempt = "token" | "pairing" | null;

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
  const [backgroundContinued, setBackgroundContinued] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDisconnectedRef = useRef(false);
  const savedTokenRef = useRef<string | null>(null);
  const authAttemptRef = useRef<AuthAttempt>(null);
  const hostRef = useRef(host);
  const portRef = useRef(port);

  useEffect(() => {
    savedTokenRef.current = savedToken;
  }, [savedToken]);

  useEffect(() => {
    hostRef.current = host;
    portRef.current = port;
  }, [host, port]);

  useEffect(() => {
    void loadCredentials()
      .then((creds) => {
        if (!creds) return;
        setHost(creds.host);
        setPort(creds.port);
        setSavedToken(creds.token);
        savedTokenRef.current = creds.token;
        setDeviceName(creds.deviceName ?? null);
        setIsPaired(true);
        titusClient.updateReconnectToken(creds.token, creds.deviceName);

        // Reconnect immediately on launch when already paired.
        const portNum = parseInt(creds.port, 10);
        if (
          creds.token &&
          creds.host &&
          !isNaN(portNum) &&
          !titusClient.isConnected()
        ) {
          userDisconnectedRef.current = false;
          authAttemptRef.current = "token";
          setConnectionStatus("connecting");
          titusClient.connect(creds.host, portNum, {
            token: creds.token,
            deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
          });
        }
      })
      .catch((err) => {
        console.error("[Titus] Failed to load saved credentials", err);
      });
  }, []);

  const applySession = useCallback(
    (hostname: string, version: string, workspace: string, name?: string) => {
      setServerInfo(`${hostname} (v${version})`);
      setWorkspacePath(workspace);
      setDeviceName(name ?? null);
      setConnectionStatus("connected");
      setError(null);
      setBackgroundContinued(false);
      userDisconnectedRef.current = false;
      authAttemptRef.current = null;
    },
    []
  );

  const tryAutoReconnect = useCallback(() => {
    if (userDisconnectedRef.current) {
      return;
    }
    if (titusClient.isConnected()) {
      return;
    }

    const token = savedTokenRef.current;
    const reconnectHost = hostRef.current;
    const reconnectPort = parseInt(portRef.current, 10);

    if (token && reconnectHost && !isNaN(reconnectPort)) {
      setError(null);
      authAttemptRef.current = "token";
      setConnectionStatus("connecting");
      titusClient.connect(reconnectHost, reconnectPort, {
        token,
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
      });
      return;
    }

    if (titusClient.canReconnect()) {
      setError(null);
      authAttemptRef.current = "token";
      setConnectionStatus("connecting");
      titusClient.reconnect();
    }
  }, []);

  useEffect(() => {
    const removeStatus = titusClient.addStatusListener((status, detail) => {
      if (status === "open" && detail === "connecting") {
        setConnectionStatus("connecting");
        setServerInfo(null);
      } else if (status === "open" && detail === "authenticating") {
        setConnectionStatus("authenticating");
      } else if (status === "close") {
        setConnectionStatus("disconnected");
        setServerInfo(null);
        setVscodeConnected(false);
        if (!userDisconnectedRef.current && appStateRef.current !== "active") {
          setBackgroundContinued(true);
        }
      } else if (status === "error") {
        setConnectionStatus("error");
        const target = titusClient.getConnectTarget();
        setError(
          formatConnectionError(
            target.host,
            target.port,
            detail ?? "Connection failed"
          )
        );
      }
    });

    const removeMessage = titusClient.addMessageListener((message) => {
      if (message.type === "auth_ok") {
        const { host: connectHost, port: connectPort } = titusClient.getConnectTarget();
        applySession(message.hostname, message.version, message.workspace, message.deviceName);
        setVscodeConnected(message.vscode?.connected ?? false);
        setHost(connectHost);
        setPort(String(connectPort));

        if (message.token) {
          setSavedToken(message.token);
          savedTokenRef.current = message.token;
          setIsPaired(true);
          titusClient.updateReconnectToken(message.token, message.deviceName);
          void saveCredentials({
            token: message.token,
            host: connectHost,
            port: String(connectPort),
            deviceName: message.deviceName,
          }).catch((err) => {
            console.error("[Titus] Failed to save credentials", err);
          });
        } else if (savedTokenRef.current) {
          titusClient.updateReconnectToken(
            savedTokenRef.current,
            message.deviceName
          );
          // Persist updated host/port after DHCP / manual IP change.
          void saveCredentials({
            token: savedTokenRef.current,
            host: connectHost,
            port: String(connectPort),
            deviceName: message.deviceName,
          }).catch((err) => {
            console.error("[Titus] Failed to update saved host", err);
          });
        }
      }

      if (message.type === "auth_error") {
        setConnectionStatus("error");
        setError(message.message);
        titusClient.clearPairingCode();

        const attempt = authAttemptRef.current;
        authAttemptRef.current = null;

        // Only wipe a saved device when a *token* reconnect was rejected.
        // Failed QR/code pairing must not clear a still-valid paired device.
        const pairingRelated = /pairing/i.test(message.message);
        if (
          attempt === "token" &&
          !pairingRelated &&
          savedTokenRef.current &&
          (message.message.includes("Invalid") ||
            message.message.includes("revoked") ||
            message.message.includes("expired"))
        ) {
          void clearCredentials();
          setSavedToken(null);
          savedTokenRef.current = null;
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
  }, [applySession]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        if (
          connectionStatus === "connected" ||
          connectionStatus === "connecting" ||
          connectionStatus === "authenticating"
        ) {
          setBackgroundContinued(true);
        }
        return;
      }

      if (nextState === "active" && previous !== "active") {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          if (!titusClient.isConnected() && !userDisconnectedRef.current) {
            tryAutoReconnect();
          }
        }, 400);
      }
    };

    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => {
      subscription.remove();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connectionStatus, tryAutoReconnect]);

  // Soft auto-reconnect after unexpected disconnect while app is active.
  useEffect(() => {
    if (connectionStatus !== "disconnected" && connectionStatus !== "error") {
      return;
    }
    if (userDisconnectedRef.current) {
      return;
    }
    if (appStateRef.current !== "active") {
      return;
    }
    if (!savedToken && !titusClient.canReconnect()) {
      return;
    }

    const timer = setTimeout(() => {
      tryAutoReconnect();
    }, 1500);

    return () => clearTimeout(timer);
  }, [connectionStatus, savedToken, tryAutoReconnect]);

  const connectWithOptions = useCallback(
    (options: { token?: string; pairingCode?: string }) => {
      userDisconnectedRef.current = false;
      setError(null);
      setConnectionStatus("connecting");
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setError("Invalid port number");
        setConnectionStatus("error");
        return;
      }
      if (isLocalhostHost(host) && Platform.OS !== "web") {
        setError(
          "localhost won't work on a phone. Use your PC's Wi-Fi IP address instead."
        );
        setConnectionStatus("error");
        return;
      }
      if (!host.trim()) {
        setError(
          "Enter your PC's Wi-Fi IP from the Titus desktop app (or scan the QR)"
        );
        setConnectionStatus("error");
        return;
      }

      authAttemptRef.current = options.pairingCode ? "pairing" : "token";
      titusClient.connect(host, portNum, {
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
      if (isLocalhostHost(qrHost) && Platform.OS !== "web") {
        setError(
          "This QR has localhost — Titus could not find your PC's Wi-Fi IP. Check the desktop app address, or enter the IP manually."
        );
        setConnectionStatus("error");
        return;
      }
      userDisconnectedRef.current = false;
      setHost(qrHost);
      setPort(String(qrPort));
      setError(null);
      setConnectionStatus("connecting");
      // Keep savedToken until the new pair succeeds so a failed scan cannot wipe pairing.
      authAttemptRef.current = "pairing";
      titusClient.connect(qrHost, qrPort, {
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
        setError("Enter the 6-character code from the Titus desktop app");
        setConnectionStatus("error");
        return;
      }
      const hostTrimmed = host.trim();
      if (!hostTrimmed) {
        setError(
          "Enter your PC's Wi-Fi IP from the Titus desktop app (or scan the QR instead)"
        );
        setConnectionStatus("error");
        return;
      }
      userDisconnectedRef.current = false;
      setError(null);
      setConnectionStatus("connecting");
      // Keep savedToken until the new pair succeeds.
      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setError("Invalid port number");
        setConnectionStatus("error");
        return;
      }
      if (isLocalhostHost(hostTrimmed) && Platform.OS !== "web") {
        setError(
          "localhost won't work on a phone. Use your PC's Wi-Fi IP from the Titus desktop app."
        );
        setConnectionStatus("error");
        return;
      }
      authAttemptRef.current = "pairing";
      titusClient.connect(hostTrimmed, portNum, {
        pairingCode: trimmed,
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android",
      });
    },
    [host, port]
  );

  const handleDisconnect = useCallback(() => {
    userDisconnectedRef.current = true;
    setBackgroundContinued(false);
    authAttemptRef.current = null;
    titusClient.disconnect();
    setConnectionStatus("disconnected");
    setServerInfo(null);
  }, []);

  const handleForgetDevice = useCallback(async () => {
    userDisconnectedRef.current = true;
    setBackgroundContinued(false);
    authAttemptRef.current = null;
    titusClient.disconnect();
    try {
      await clearCredentials();
      setSavedToken(null);
      savedTokenRef.current = null;
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
    backgroundContinued,
  };
}
