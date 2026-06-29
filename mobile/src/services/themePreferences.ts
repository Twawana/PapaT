import * as SecureStore from "expo-secure-store";
import { ThemeMode } from "../theme/colors";

const THEME_MODE_KEY = "titus.theme.mode";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const saved = await SecureStore.getItemAsync(THEME_MODE_KEY);
    if (isThemeMode(saved)) {
      return saved;
    }
  } catch {
    // Fall back to default
  }
  return "dark";
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
  } catch {
    // Non-critical preference
  }
}
