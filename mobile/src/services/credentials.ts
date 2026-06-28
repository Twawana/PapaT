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
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as PairQrPayload;
    if (
      parsed?.v === 1 &&
      typeof parsed.host === "string" &&
      typeof parsed.port === "number" &&
      typeof parsed.code === "string"
    ) {
      return parsed;
    }
  } catch {
    // not JSON
  }

  return null;
}
