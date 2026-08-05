import { WebSocket } from "ws";
import { IncomingMessage } from "http";

export interface ClientAuthState {
  authenticated: boolean;
  deviceId?: string;
  deviceName?: string;
  isVscode?: boolean;
}

export interface ConnectedMobileClient {
  deviceId: string;
  deviceName: string;
  connectedAt: number;
}

const clientAuth = new WeakMap<WebSocket, ClientAuthState>();
const connectedMobileClients = new Map<WebSocket, ConnectedMobileClient>();

function getState(ws: WebSocket): ClientAuthState {
  let state = clientAuth.get(ws);
  if (!state) {
    state = { authenticated: false };
    clientAuth.set(ws, state);
  }
  return state;
}

export function isClientAuthenticated(ws: WebSocket): boolean {
  return getState(ws).authenticated;
}

export function markClientAuthenticated(
  ws: WebSocket,
  info: { deviceId: string; deviceName: string; isVscode?: boolean }
): void {
  clientAuth.set(ws, {
    authenticated: true,
    deviceId: info.deviceId,
    deviceName: info.deviceName,
    isVscode: info.isVscode,
  });

  if (!info.isVscode) {
    connectedMobileClients.set(ws, {
      deviceId: info.deviceId,
      deviceName: info.deviceName,
      connectedAt: Date.now(),
    });
  }
}

export function clearClientAuth(ws: WebSocket): void {
  clientAuth.delete(ws);
  connectedMobileClients.delete(ws);
}

export function listConnectedMobileClients(): ConnectedMobileClient[] {
  const clients: ConnectedMobileClient[] = [];

  for (const [ws, info] of connectedMobileClients) {
    if (ws.readyState !== WebSocket.OPEN) {
      connectedMobileClients.delete(ws);
      continue;
    }
    clients.push(info);
  }

  clients.sort((a, b) => a.connectedAt - b.connectedAt);
  return clients;
}

export function isLocalConnection(req: IncomingMessage | undefined): boolean {
  const address = req?.socket?.remoteAddress ?? "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}
