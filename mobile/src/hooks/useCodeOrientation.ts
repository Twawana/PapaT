import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

/**
 * Unlock rotation while the Code tab (or fullscreen editor) is active.
 * Lock back to portrait when leaving so other tabs stay upright.
 */
export function useCodeOrientation(enabled: boolean): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (enabled) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[Titus] Screen orientation change failed", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {
        // ignore unlock cleanup failures
      });
    };
  }, [enabled]);
}
