export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  placeholder: string;
  accent: string;
  accentBorder: string;
  buttonPrimary: string;
  buttonSecondary: string;
  buttonSuccess: string;
  buttonDanger: string;
  onPrimary: string;
  success: string;
  warning: string;
  error: string;
  errorText: string;
  errorBannerBg: string;
  errorBannerText: string;
  link: string;
  userBubble: string;
  agentBubble: string;
  toolCard: string;
  toolCardError: string;
  icon: string;
  iconMuted: string;
  iconAccent: string;
  shadow: string;
  spinnerOnAccent: string;
}

export const darkColors: ThemeColors = {
  background: "#010409",
  surface: "#0d1117",
  surfaceElevated: "#161b22",
  surfaceMuted: "#21262d",
  border: "#30363d",
  textPrimary: "#f0f6fc",
  textSecondary: "#c9d1d9",
  textMuted: "#8b949e",
  placeholder: "#484f58",
  accent: "#58a6ff",
  accentBorder: "#388bfd",
  buttonPrimary: "#1f6feb",
  buttonSecondary: "#21262d",
  buttonSuccess: "#238636",
  buttonDanger: "#da3633",
  onPrimary: "#ffffff",
  success: "#3fb950",
  warning: "#d29922",
  error: "#f85149",
  errorText: "#ff7b72",
  errorBannerBg: "#3d1214",
  errorBannerText: "#ffb4b0",
  link: "#58a6ff",
  userBubble: "#1f6feb",
  agentBubble: "#161b22",
  toolCard: "#0d1117",
  toolCardError: "#f85149",
  icon: "#c9d1d9",
  iconMuted: "#8b949e",
  iconAccent: "#58a6ff",
  shadow: "#000000",
  spinnerOnAccent: "#ffffff",
};

export const lightColors: ThemeColors = {
  background: "#ffffff",
  surface: "#ffffff",
  surfaceElevated: "#f6f8fa",
  surfaceMuted: "#eaeef2",
  border: "#d0d7de",
  textPrimary: "#1f2328",
  textSecondary: "#24292f",
  textMuted: "#57606a",
  placeholder: "#8c959f",
  accent: "#0969da",
  accentBorder: "#0550ae",
  buttonPrimary: "#0969da",
  buttonSecondary: "#eaeef2",
  buttonSuccess: "#1a7f37",
  buttonDanger: "#cf222e",
  onPrimary: "#ffffff",
  success: "#1a7f37",
  warning: "#9a6700",
  error: "#cf222e",
  errorText: "#a40e26",
  errorBannerBg: "#ffebe9",
  errorBannerText: "#82071e",
  link: "#0969da",
  userBubble: "#0969da",
  agentBubble: "#f6f8fa",
  toolCard: "#f6f8fa",
  toolCardError: "#cf222e",
  icon: "#24292f",
  iconMuted: "#57606a",
  iconAccent: "#0969da",
  shadow: "#000000",
  spinnerOnAccent: "#ffffff",
};

export function resolveThemeColors(mode: ThemeMode): ThemeColors {
  return mode === "dark" ? darkColors : lightColors;
}
