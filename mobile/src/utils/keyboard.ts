import { useEffect, useState } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";

export function dismissKeyboard(): void {
  Keyboard.dismiss();
}

export const keyboardPersistTaps = "never" as const;

/**
 * KeyboardAvoidingView behavior.
 * Android needs padding too when the window does not fully resize (landscape).
 */
export function keyboardAvoidBehavior(): "padding" | "height" {
  return "padding";
}

export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}

/** Live keyboard height (0 when hidden). Useful for landscape padding. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/** True when the soft keyboard is up in landscape — chrome should collapse. */
export function useCompactKeyboardLayout(): boolean {
  const landscape = useIsLandscape();
  const keyboardVisible = useKeyboardVisible();
  return landscape && keyboardVisible;
}
