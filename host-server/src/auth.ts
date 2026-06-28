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

const PAIRING_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DATA_DIR = path.join(os.homedir(), ".papat");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

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
    if (fs.existsSync(TOKENS_FILE)) {
      tokenStore = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8")) as TokenStore;
    }
  } catch {
    tokenStore = { devices: [] };
  }
}

function saveTokenStore(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokenStore, null, 2), "utf-8");
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

  if (!activePairing || activePairing.expiresAt <= Date.now()) {
    rotatePairingCode();
    throw new Error("Pairing code expired — scan the latest QR on your PC");
  }

  if (normalized !== activePairing.code) {
    throw new Error("Invalid pairing code — use the code shown in your PC terminal now");
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
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}
