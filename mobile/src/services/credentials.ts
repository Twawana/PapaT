import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "titus.auth.token";
const HOST_KEY = "titus.auth.host";
const PORT_KEY = "titus.auth.port";
const DEVICE_NAME_KEY = "titus.auth.deviceName";

const LEGACY_TOKEN_KEY = "papat.auth.token";
const LEGACY_HOST_KEY = "papat.auth.host";
const LEGACY_PORT_KEY = "papat.auth.port";
const LEGACY_DEVICE_NAME_KEY = "papat.auth.deviceName";

export interface SavedCredentials {
  token: string;
  host: string;
  port: string;
  deviceName?: string;
}

async function readStoredItem(primary: string, legacy: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(primary);
  if (value) return value;
  return SecureStore.getItemAsync(legacy);
}

export async function loadCredentials(): Promise<SavedCredentials | null> {
  try {
    const token = await readStoredItem(TOKEN_KEY, LEGACY_TOKEN_KEY);
    const host = await readStoredItem(HOST_KEY, LEGACY_HOST_KEY);
    const port = await readStoredItem(PORT_KEY, LEGACY_PORT_KEY);
    if (!token || !host || !port) {
      return null;
    }
    const deviceName = await readStoredItem(DEVICE_NAME_KEY, LEGACY_DEVICE_NAME_KEY);
    return { token, host, port, deviceName: deviceName ?? undefined };
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: SavedCredentials): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, creds.token);
  await SecureStore.setItemAsync(HOST_KEY, creds.host);
  await SecureStore.setItemAsync(PORT_KEY, creds.port);
  if (creds.deviceName) {
    await SecureStore.setItemAsync(DEVICE_NAME_KEY, creds.deviceName);
  }
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(HOST_KEY);
  await SecureStore.deleteItemAsync(PORT_KEY);
  await SecureStore.deleteItemAsync(DEVICE_NAME_KEY);
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
  await SecureStore.deleteItemAsync(LEGACY_HOST_KEY);
  await SecureStore.deleteItemAsync(LEGACY_PORT_KEY);
  await SecureStore.deleteItemAsync(LEGACY_DEVICE_NAME_KEY);
}

export interface PairQrPayload {
  v: number;
  host: string;
  port: number;
  code: string;
  expiresAt?: number;
}

export function parsePairQrData(raw: string): PairQrPayload | null {
  let trimmed = raw.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return null;

  // Some scanners URL-encode the JSON payload.
  if (trimmed.includes("%7B") || trimmed.includes("%22")) {
    try {
      trimmed = decodeURIComponent(trimmed);
    } catch {
      // keep original
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const host = typeof parsed.host === "string" ? parsed.host.trim() : "";
    const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
    const portRaw = parsed.port;
    const port =
      typeof portRaw === "number"
        ? portRaw
        : typeof portRaw === "string"
          ? Number(portRaw.trim())
          : NaN;
    const expiresRaw = parsed.expiresAt;
    const expiresAt =
      typeof expiresRaw === "number"
        ? expiresRaw
        : typeof expiresRaw === "string"
          ? Number(expiresRaw)
          : undefined;

    if (
      parsed?.v === 1 &&
      host.length > 0 &&
      Number.isFinite(port) &&
      port >= 1 &&
      port <= 65535 &&
      /^[A-Z0-9]{6}$/i.test(code)
    ) {
      return {
        v: 1,
        host,
        port,
        code,
        expiresAt:
          expiresAt !== undefined && Number.isFinite(expiresAt)
            ? expiresAt
            : undefined,
      };
    }
  } catch {
    // not JSON
  }

  return null;
}
