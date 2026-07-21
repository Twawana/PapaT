import QRCode from "qrcode";
import { buildPairQrPayload, getLanIp, getActivePairing, rotatePairingCode } from "./auth";
import { config } from "./config";

export interface PairingUiInfo {
  enabled: boolean;
  lanIp: string;
  port: number;
  code: string | null;
  expiresAt: number | null;
  expiresInMs: number;
  qrDataUrl: string | null;
  payload: ReturnType<typeof buildPairQrPayload> | null;
}

export async function getPairingUiInfo(options?: {
  rotate?: boolean;
}): Promise<PairingUiInfo> {
  const lanIp = getLanIp();

  if (!config.requireAuth) {
    return {
      enabled: false,
      lanIp,
      port: config.port,
      code: null,
      expiresAt: null,
      expiresInMs: 0,
      qrDataUrl: null,
      payload: null,
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
      port: config.port,
      code: null,
      expiresAt: null,
      expiresInMs: 0,
      qrDataUrl: null,
      payload: null,
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
    port: config.port,
    code: pairing.code,
    expiresAt: pairing.expiresAt,
    expiresInMs: Math.max(0, pairing.expiresAt - Date.now()),
    qrDataUrl,
    payload,
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

  console.log("\n[Titus Host] ── Pair your phone ──");
  console.log(`[Titus Host] Scan QR in the Titus app, or enter manually:`);
  console.log(`[Titus Host]   Host: ${info.lanIp}`);
  console.log(`[Titus Host]   Port: ${info.port}`);
  console.log(
    `[Titus Host]   Code: ${info.code} (expires in ${Math.round(info.expiresInMs / 1000)}s)`
  );

  try {
    const qr = await QRCode.toString(JSON.stringify(info.payload), {
      type: "terminal",
      small: true,
    });
    console.log(qr);
  } catch {
    console.log(`[Titus Host] QR payload: ${JSON.stringify(info.payload)}`);
  }

  console.log("[Titus Host] ───────────────────────\n");
}

export function startPairingRefreshTimer(): NodeJS.Timeout | null {
  if (!config.requireAuth) {
    return null;
  }

  return setInterval(() => {
    rotatePairingCode();
    void printPairingQr();
  }, config.pairingTtlMs);
}
