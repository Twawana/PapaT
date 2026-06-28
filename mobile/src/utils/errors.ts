export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export async function runSafely<T>(
  action: () => Promise<T>,
  fallback: T,
  onError?: (message: string) => void
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const message = errorMessage(error);
    onError?.(message);
    console.error("[PapaT]", message, error);
    return fallback;
  }
}

export function runSyncSafely<T>(
  action: () => T,
  fallback: T,
  onError?: (message: string) => void
): T {
  try {
    return action();
  } catch (error) {
    const message = errorMessage(error);
    onError?.(message);
    console.error("[PapaT]", message, error);
    return fallback;
  }
}
