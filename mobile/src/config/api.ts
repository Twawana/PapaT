import { Platform } from "react-native";

/**
 * PapaT host-server port (WebSocket). Backend default: 3847, binds to 0.0.0.0.
 * Override with EXPO_PUBLIC_HOST_PORT in mobile/.env
 */
export const HOST_SERVER_PORT = Number(
  process.env.EXPO_PUBLIC_HOST_PORT ?? "3847"
);

/**
 * Your PC's LAN IP on Wi-Fi — never use localhost or 127.0.0.1 on a real device.
 * Set EXPO_PUBLIC_DEV_HOST in mobile/.env (see .env.example).
 */
export const DEV_LOCAL_IP =
  process.env.EXPO_PUBLIC_DEV_HOST?.trim() || "192.168.178.40";

const PRODUCTION_HOST =
  process.env.EXPO_PUBLIC_PRODUCTION_HOST?.trim() || "api.papat.app";

const PRODUCTION_USE_TLS =
  process.env.EXPO_PUBLIC_PRODUCTION_USE_TLS !== "false";

/** Default host for the connection form (emulator-aware in dev). */
export function getDefaultConnectionHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_DEV_HOST?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (__DEV__ && Platform.OS === "android") {
    return "10.0.2.2";
  }
  return DEV_LOCAL_IP;
}

export const DEFAULT_HOST = getDefaultConnectionHost();
export const DEFAULT_PORT = String(HOST_SERVER_PORT);

/** HTTP base URL (for future REST endpoints; host uses WebSocket today). */
export const API_BASE_URL = __DEV__
  ? `http://${DEV_LOCAL_IP}:${HOST_SERVER_PORT}`
  : `${PRODUCTION_USE_TLS ? "https" : "http"}://${PRODUCTION_HOST}${
      PRODUCTION_USE_TLS ? "" : `:${HOST_SERVER_PORT}`
    }`;

export function buildWebSocketUrl(
  host: string,
  port: number = HOST_SERVER_PORT
): string {
  const trimmed = host
    .trim()
    .replace(/^wss?:\/\//, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (!__DEV__) {
    const scheme = PRODUCTION_USE_TLS ? "wss" : "ws";
    const portSuffix =
      PRODUCTION_USE_TLS && (port === 443 || port === 80) ? "" : `:${port}`;
    if (!trimmed || trimmed === PRODUCTION_HOST) {
      return `${scheme}://${PRODUCTION_HOST}${portSuffix}`;
    }
  }
  return `ws://${trimmed}:${port}`;
}

export function isLocalhostHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function formatConnectionError(
  host: string,
  port: number,
  detail?: string
): string {
  if (detail?.includes("Pairing required") || detail?.includes("Scan the QR")) {
    return detail;
  }

  const hint = isLocalhostHost(host)
    ? " Replace localhost with your PC's Wi-Fi IP (e.g. " + DEV_LOCAL_IP + ")."
    : "";

  const base =
    `Cannot reach PapaT host at ${buildWebSocketUrl(host, port)}.` +
    ` Ensure the PC server is running, you're on the same Wi-Fi, and the IP is correct.${hint}`;

  return detail && !detail.startsWith("Cannot reach") ? `${base} (${detail})` : base;
}

export const CONNECTION_HELP = {
  port: HOST_SERVER_PORT,
  suggestedHost: DEV_LOCAL_IP,
  steps: [
    "Start the host server on your PC (npm start in host-server)",
    `Enter your PC's Wi-Fi IP — e.g. ${DEV_LOCAL_IP} (not localhost)`,
    `Use port ${HOST_SERVER_PORT}`,
    "Connect phone and PC to the same Wi-Fi network",
    "Scan the pairing QR code shown in the PC terminal",
  ],
} as const;
