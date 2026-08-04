import QRCode from "qrcode";
import {
  buildPairQrPayload,
  getLanIp,
  listLanIps,
  getActivePairing,
  isPairingExpired,
  rotatePairingCode,
} from "./auth";
import { config } from "./config";

export interface PairingUiInfo {
  enabled: boolean;
  lanIp: string;
  lanIps: string[];
  port: number;
  code: string | null;
  expiresAt: number | null;
  expiresInMs: number;
  qrDataUrl: string | null;
  payload: ReturnType<typeof buildPairQrPayload> | null;
  lanWarning: string | null;
}

export async function getPairingUiInfo(options?: {
  rotate?: boolean;
}): Promise<PairingUiInfo> {
  const lanIps = listLanIps();
  const lanIp = lanIps[0] ?? getLanIp();
  const lanWarning =
    lanIp === "127.0.0.1" || lanIps.length === 0
      ? "No Wi-Fi/LAN IP found. Connect this PC to Wi-Fi (or Ethernet), then tap Refresh code."
      : null;

  if (!config.requireAuth) {
    return {
      enabled: false,
      lanIp,
      lanIps,
      port: config.port,
      code: null,
      expiresAt: null,
      expiresInMs: 0,
      qrDataUrl: null,
      payload: null,
      lanWarning,
    };
  }

  if (options?.rotate) {
    rotatePairingCode();
  }

  const pairing = getActivePairing();
  if (!pairing) {
    return {
      enabled: true,
      lanIp,
      lanIps,
      port: config.port,
      code: null,
      expiresAt: null,
      expiresInMs: 0,
      qrDataUrl: null,
      payload: null,
      lanWarning,
    };
  }

  const payload = buildPairQrPayload(lanIp);
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      margin: 1,
      width: 280,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f1117",
        light: "#ffffff",
      },
    });
  } catch {
    qrDataUrl = null;
  }

  return {
    enabled: true,
    lanIp,
    lanIps,
    port: config.port,
    code: pairing.code,
    expiresAt: pairing.expiresAt,
    expiresInMs: Math.max(0, pairing.expiresAt - Date.now()),
    qrDataUrl,
    payload,
    lanWarning,
  };
}

export async function printPairingQr(): Promise<void> {
  if (!config.requireAuth) {
    return;
  }

  const info = await getPairingUiInfo();
  if (!info.code) {
    return;
  }

  console.log("\n[PapaT Host] ── Pair your phone ──");
  console.log(`[PapaT Host] Scan QR in the PapaT app, or enter manually:`);
  console.log(`[PapaT Host]   Host: ${info.lanIp}`);
  if (info.lanIps.length > 1) {
    console.log(`[PapaT Host]   Other IPs: ${info.lanIps.slice(1).join(", ")}`);
  }
  if (info.lanWarning) {
    console.warn(`[PapaT Host]   Warning: ${info.lanWarning}`);
  }
  console.log(`[PapaT Host]   Port: ${info.port}`);
  console.log(
    `[PapaT Host]   Code: ${info.code} (expires in ${Math.round(info.expiresInMs / 1000)}s)`
  );

  try {
    const qr = await QRCode.toString(JSON.stringify(info.payload), {
      type: "terminal",
      small: true,
    });
    console.log(qr);
  } catch {
    console.log(`[PapaT Host] QR payload: ${JSON.stringify(info.payload)}`);
  }

  console.log("[PapaT Host] ───────────────────────\n");
}

/**
 * Only rotate when the current code has expired.
 * A fixed interval from boot used to desync the desktop QR after manual refresh.
 */
export function startPairingRefreshTimer(): NodeJS.Timeout | null {
  if (!config.requireAuth) {
    return null;
  }

  return setInterval(() => {
    if (isPairingExpired()) {
      rotatePairingCode();
      void printPairingQr();
    }
  }, 5_000);
}
