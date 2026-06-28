import { errorMessage } from "../utils/errors";

type GlobalErrorListener = (message: string) => void;

type ErrorUtilsLike = {
  getGlobalHandler: () => ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let listener: GlobalErrorListener | null = null;

function getErrorUtils(): ErrorUtilsLike | undefined {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (utils && typeof utils.getGlobalHandler === "function") {
    return utils;
  }
  return undefined;
}

export function registerGlobalErrorListener(next: GlobalErrorListener | null): void {
  listener = next;
}

function notify(error: unknown, fallback: string): void {
  listener?.(errorMessage(error, fallback));
}

export function installGlobalErrorHandlers(): () => void {
  const ErrorUtils = getErrorUtils();
  const previousHandler = ErrorUtils?.getGlobalHandler();

  if (ErrorUtils) {
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      notify(error, isFatal ? "A critical error occurred." : "An unexpected error occurred.");
      console.error("[Titus] Global error", { isFatal, error });

      if (__DEV__ && previousHandler) {
        previousHandler(error, isFatal);
      }
    });
  }

  const onUnhandledRejection = (event: {
    reason?: unknown;
    preventDefault?: () => void;
  }) => {
    notify(event.reason, "An async operation failed.");
    console.error("[Titus] Unhandled promise rejection", event.reason);
    event.preventDefault?.();
  };

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("unhandledrejection", onUnhandledRejection);
  }

  return () => {
    if (ErrorUtils && previousHandler) {
      ErrorUtils.setGlobalHandler(previousHandler);
    }
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
    listener = null;
  };
}
