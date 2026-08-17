import { Platform } from "react-native";

/**
 * Titus host-server port (WebSocket). Backend default: 3847, binds to 0.0.0.0.
 * Override with EXPO_PUBLIC_HOST_PORT in mobile/.env
 */
export const HOST_SERVER_PORT = Number(
  process.env.EXPO_PUBLIC_HOST_PORT ?? "3847"
);

/**
 * Example LAN IP shown in UI placeholders (dev only).
 * Users always enter their own PC address after installing Titus on desktop.
 */
export const DEV_LOCAL_IP =
  process.env.EXPO_PUBLIC_DEV_HOST?.trim() || "192.168.1.100";

/** Default host for the connection form (emulator-aware in dev). */
export function getDefaultConnectionHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_DEV_HOST?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (__DEV__ && Platform.OS === "android") {
    return "10.0.2.2";
  }
  return "";
}

export const DEFAULT_HOST = getDefaultConnectionHost();
export const DEFAULT_PORT = String(HOST_SERVER_PORT);

/** Reserved for future cloud features; phone connects to the user's PC over LAN. */
export const API_BASE_URL = __DEV__
  ? `http://${DEV_LOCAL_IP}:${HOST_SERVER_PORT}`
  : "https://titus.onrender.com";

export function buildWebSocketUrl(
  host: string,
  port: number = HOST_SERVER_PORT
): string {
  const trimmed = host
    .trim()
    .replace(/^wss?:\/\//, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
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

  // Auth/pairing messages should surface as-is.
  if (
    detail &&
    (/pairing/i.test(detail) ||
      /invalid/i.test(detail) ||
      /expired/i.test(detail) ||
      /revoked/i.test(detail))
  ) {
    return detail;
  }

  const hint = isLocalhostHost(host)
    ? " Replace localhost with your PC's Wi-Fi IP from the Titus desktop app."
    : "";

  const base =
    `Cannot reach Titus host at ${buildWebSocketUrl(host, port)}.` +
    ` Open Titus on your PC, use the same Wi-Fi (not guest/isolated),` +
    ` and allow inbound TCP port ${port} in Windows Firewall if prompted.${hint}`;

  return detail && !detail.startsWith("Cannot reach") ? `${base} (${detail})` : base;
}

export const CONNECTION_HELP = {
  port: HOST_SERVER_PORT,
  suggestedHost: DEV_LOCAL_IP,
  steps: [
    "Install Titus on your PC and open it (Start Menu > Titus)",
    "Connect phone and PC to the same Wi-Fi (avoid guest / AP isolation networks)",
    "Scan the QR code shown in the Titus desktop window",
    `If it fails to connect, allow inbound TCP port ${HOST_SERVER_PORT} in Windows Firewall`,
    "Or enter the PC address and 6-character code manually from the desktop app",
  ],
} as const;
