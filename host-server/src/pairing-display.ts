import QRCode from "qrcode";
import { buildPairQrPayload, getLanIp, getActivePairing, rotatePairingCode } from "./auth";
import { config } from "./config";

export async function printPairingQr(): Promise<void> {
  if (!config.requireAuth) {
    return;
  }

  const lanHost = getLanIp();
  const pairing = getActivePairing();
  if (!pairing) {
    return;
  }
  const payload = buildPairQrPayload(lanHost);

  console.log("\n[Titus Host] ── Pair your phone ──");
  console.log(`[Titus Host] Scan QR in the Titus app, or enter manually:`);
  console.log(`[Titus Host]   Host: ${lanHost}`);
  console.log(`[Titus Host]   Port: ${config.port}`);
  console.log(`[Titus Host]   Code: ${pairing.code} (expires in ${Math.round(config.pairingTtlMs / 1000)}s)`);

  try {
    const qr = await QRCode.toString(JSON.stringify(payload), {
      type: "terminal",
      small: true,
    });
    console.log(qr);
  } catch {
    console.log(`[Titus Host] QR payload: ${JSON.stringify(payload)}`);
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
