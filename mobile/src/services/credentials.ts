import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "papat.auth.token";
const HOST_KEY = "papat.auth.host";
const PORT_KEY = "papat.auth.port";
const DEVICE_NAME_KEY = "papat.auth.deviceName";

export interface SavedCredentials {
  token: string;
  host: string;
  port: string;
  deviceName?: string;
}

export async function loadCredentials(): Promise<SavedCredentials | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const host = await SecureStore.getItemAsync(HOST_KEY);
    const port = await SecureStore.getItemAsync(PORT_KEY);
    if (!token || !host || !port) {
      return null;
    }
    const deviceName = await SecureStore.getItemAsync(DEVICE_NAME_KEY);
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
