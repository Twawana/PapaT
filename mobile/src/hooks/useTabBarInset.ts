import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarMetrics, TabBarMetrics } from "../constants/tabBarLayout";
import { useKeyboardVisible } from "../utils/keyboard";

const DEFAULT_TAB_COUNT = 6;

export function useTabBarMetrics(tabCount: number = DEFAULT_TAB_COUNT): TabBarMetrics {
  const { width, height, fontScale } = useWindowDimensions();
  return useMemo(
    () => getTabBarMetrics(width, height, fontScale, tabCount),
    [width, height, fontScale, tabCount]
  );
}

/** Space to reserve at the bottom so content can scroll under the floating tab bar. */
export function useTabBarInset(tabCount: number = DEFAULT_TAB_COUNT): number {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const metrics = useTabBarMetrics(tabCount);
  if (keyboardVisible) {
    return insets.bottom;
  }
  return metrics.height + metrics.bottomMargin + insets.bottom;
}
