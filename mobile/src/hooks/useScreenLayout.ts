import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useScreenLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const landscape = width > height;
    const narrow = width < 380;
    const short = height < 700;
    const contentPadH = Math.max(12, Math.min(20, Math.round(width * 0.042)));

    return {
      width,
      height,
      fontScale,
      insets,
      landscape,
      narrow,
      short,
      contentPadH,
      contentPadLeft: contentPadH + insets.left,
      contentPadRight: contentPadH + insets.right,
      titleSize: narrow ? 24 : width >= 420 ? 32 : 28,
      headerPadTop: short || landscape ? 4 : 8,
      headerPadBottom: short || landscape ? 8 : 12,
    };
  }, [width, height, fontScale, insets]);
}
