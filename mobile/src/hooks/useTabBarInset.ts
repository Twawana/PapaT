import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarInset } from "../components/LiquidGlassTabBar";
import { useKeyboardVisible } from "../utils/keyboard";

/** Space to reserve at the bottom so content can scroll under the floating tab bar. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  if (keyboardVisible) {
    return insets.bottom;
  }
  return tabBarInset(insets.bottom);
}
