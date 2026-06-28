import { papatClient } from "./websocket";

export interface QueuedWrite {
  id: string;
  path: string;
  content: string;
  create: boolean;
  queuedAt: number;
}

const queue: QueuedWrite[] = [];
let flushing = false;

export function enqueueWrite(path: string, content: string, create = true): QueuedWrite {
  const item: QueuedWrite = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path,
    content,
    create,
    queuedAt: Date.now(),
  };
  queue.push(item);
  return item;
}

export function getQueuedWrites(): QueuedWrite[] {
  return [...queue];
}

export function clearQueuedWrites(): void {
  queue.length = 0;
}

export async function flushOfflineQueue(): Promise<{ ok: number; failed: number }> {
  if (flushing || !papatClient.isConnected() || queue.length === 0) {
    return { ok: 0, failed: 0 };
  }

  flushing = true;
  let ok = 0;
  let failed = 0;

  while (queue.length > 0 && papatClient.isConnected()) {
    const item = queue[0]!;
    try {
      await papatClient.writeFile(item.path, item.content, item.create);
      queue.shift();
      ok += 1;
    } catch {
      failed += 1;
      break;
    }
  }

  flushing = false;
  return { ok, failed };
}
