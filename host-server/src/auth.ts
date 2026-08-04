import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { config } from "./config";
import { ensureDataDir, getDataDir } from "./data-dir";

const PAIRING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tokensFile(): string {
  return path.join(getDataDir(), "tokens.json");
}

interface StoredDevice {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: number;
  lastUsedAt: number;
}

interface TokenStore {
  devices: StoredDevice[];
}

interface ActivePairing {
  code: string;
  expiresAt: number;
}

let activePairing: ActivePairing | null = null;
let tokenStore: TokenStore = { devices: [] };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function loadTokenStore(): void {
  try {
    const file = tokensFile();
    if (fs.existsSync(file)) {
      tokenStore = JSON.parse(fs.readFileSync(file, "utf-8")) as TokenStore;
    }
  } catch {
    tokenStore = { devices: [] };
  }
}

function saveTokenStore(): void {
  ensureDataDir();
  fs.writeFileSync(tokensFile(), JSON.stringify(tokenStore, null, 2), "utf-8");
}

export function initAuth(): void {
  loadTokenStore();
  rotatePairingCode();
}

export function isAuthRequired(): boolean {
  return config.requireAuth;
}

export function rotatePairingCode(): ActivePairing {
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += PAIRING_CHARS[bytes[i]! % PAIRING_CHARS.length];
  }

  activePairing = {
    code,
    expiresAt: Date.now() + config.pairingTtlMs,
  };

  return activePairing;
}

export function getActivePairing(): ActivePairing | null {
  if (!activePairing || activePairing.expiresAt <= Date.now()) {
    return rotatePairingCode();
  }
  return activePairing;
}

export interface PairQrPayload {
  v: 1;
  host: string;
  port: number;
  code: string;
  expiresAt: number;
}

export function buildPairQrPayload(lanHost: string): PairQrPayload {
  const pairing = getActivePairing();
  if (!pairing) {
    throw new Error("Pairing unavailable");
  }
  return {
    v: 1,
    host: lanHost,
    port: config.port,
    code: pairing.code,
    expiresAt: pairing.expiresAt,
  };
}

export interface AuthSuccess {
  deviceId: string;
  deviceName: string;
  token?: string;
  isNewPair: boolean;
}

export function pairWithCode(code: string, deviceName?: string): AuthSuccess {
  const normalized = code.trim().toUpperCase();

  // Small clock-skew grace so phone + PC clocks near expiry still succeed.
  if (!activePairing || activePairing.expiresAt + 2000 <= Date.now()) {
    rotatePairingCode();
    throw new Error("Pairing code expired — tap Refresh code in the PapaT desktop app");
  }

  if (normalized !== activePairing.code) {
    throw new Error("Invalid pairing code — use the code shown in the PapaT desktop app now");
  }

  rotatePairingCode();

  const token = randomBytes(32).toString("base64url");
  const deviceId = randomUUID();
  const name = deviceName?.trim() || "Mobile device";

  tokenStore.devices.push({
    id: deviceId,
    name,
    tokenHash: hashToken(token),
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  saveTokenStore();

  return { deviceId, deviceName: name, token, isNewPair: true };
}

export function authenticateToken(token: string): AuthSuccess | null {
  if (!token?.trim()) {
    return null;
  }

  const hash = hashToken(token.trim());
  const device = tokenStore.devices.find((entry) => {
    try {
      return timingSafeEqual(
        Buffer.from(entry.tokenHash, "hex"),
        Buffer.from(hash, "hex")
      );
    } catch {
      return false;
    }
  });

  if (!device) {
    return null;
  }

  device.lastUsedAt = Date.now();
  saveTokenStore();

  return {
    deviceId: device.id,
    deviceName: device.name,
    isNewPair: false,
  };
}

export function revokeDevice(deviceId: string): boolean {
  const before = tokenStore.devices.length;
  tokenStore.devices = tokenStore.devices.filter((d) => d.id !== deviceId);
  if (tokenStore.devices.length === before) {
    return false;
  }
  saveTokenStore();
  return true;
}

export function listPairedDevices(): Array<{
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
}> {
  return tokenStore.devices.map(({ id, name, createdAt, lastUsedAt }) => ({
    id,
    name,
    createdAt,
    lastUsedAt,
  }));
}

export function getLanIp(): string {
  const candidates = listLanIps();
  return candidates[0] ?? "127.0.0.1";
}

/** Prefer real Wi-Fi/Ethernet over Docker/Hyper-V/VMware virtual adapters. */
export function listLanIps(): string[] {
  const nets = os.networkInterfaces();
  const scored: { address: string; score: number }[] = [];

  for (const [name, iface] of Object.entries(nets)) {
    if (!iface) continue;
    const lower = name.toLowerCase();
    if (
      /virtual|vethernet|vmware|vbox|hyper-v|docker|wsl|loopback|bluetooth|isatap|teredo/.test(
        lower
      )
    ) {
      continue;
    }

    for (const entry of iface) {
      const family = entry.family as string | number;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || entry.internal) continue;

      // Skip link-local / APIPA — phones cannot use these for pairing.
      if (entry.address.startsWith("169.254.")) continue;

      let score = 0;
      if (/wi-?fi|wlan|wireless|ethernet|local area connection|en0|eth/.test(lower)) {
        score += 50;
      }
      if (entry.address.startsWith("192.168.")) score += 30;
      else if (entry.address.startsWith("10.")) score += 20;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(entry.address)) score += 5;
      else score -= 20;

      scored.push({ address: entry.address, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const unique: string[] = [];
  for (const item of scored) {
    if (!unique.includes(item.address)) {
      unique.push(item.address);
    }
  }
  return unique;
}

export function isPairingExpired(): boolean {
  return !activePairing || activePairing.expiresAt <= Date.now();
}
