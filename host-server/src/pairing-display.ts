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

  console.log("\n[PapaT Host] ── Pair your phone ──");
  console.log(`[PapaT Host] Scan QR in the PapaT app, or enter manually:`);
  console.log(`[PapaT Host]   Host: ${lanHost}`);
  console.log(`[PapaT Host]   Port: ${config.port}`);
  console.log(`[PapaT Host]   Code: ${pairing.code} (expires in ${Math.round(config.pairingTtlMs / 1000)}s)`);

  try {
    const qr = await QRCode.toString(JSON.stringify(payload), {
      type: "terminal",
      small: true,
    });
    console.log(qr);
  } catch {
    console.log(`[PapaT Host] QR payload: ${JSON.stringify(payload)}`);
  }

  console.log("[PapaT Host] ───────────────────────\n");
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
