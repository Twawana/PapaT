/** Portrait-phone defaults; prefer `getTabBarMetrics` for live layout. */
export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_BOTTOM_MARGIN = 10;

const DESIGN_WIDTH = 390;

export type TabBarMetrics = {
  height: number;
  bottomMargin: number;
  sideInset: number;
  iconSize: number;
  labelFontSize: number;
  showLabels: boolean;
  borderRadius: number;
  tabMinHeight: number;
  pillRadius: number;
  maxBarWidth: number | undefined;
};

export function getTabBarMetrics(
  windowWidth: number,
  windowHeight: number,
  fontScale: number,
  tabCount: number
): TabBarMetrics {
  const landscape = windowWidth > windowHeight;
  const shortest = Math.min(windowWidth, windowHeight);
  const scale = Math.min(1.12, Math.max(0.85, shortest / DESIGN_WIDTH));
  const sideInset = Math.max(12, Math.round(windowWidth * 0.045));
  const available = Math.max(0, windowWidth - sideInset * 2);
  const perTab = tabCount > 0 ? available / tabCount : available;
  const compactHeight = landscape && windowHeight < 430;
  const showLabels =
    !compactHeight && perTab >= 52 && fontScale < 1.35 && windowWidth >= 340;

  const height = showLabels
    ? Math.round(62 * scale * Math.min(fontScale, 1.12))
    : Math.round(48 * scale);

  return {
    height,
    bottomMargin: landscape ? 6 : Math.round(10 * scale),
    sideInset,
    iconSize: showLabels ? Math.round(22 * scale) : Math.round(24 * scale),
    labelFontSize: Math.max(9, Math.round(10 * scale)),
    showLabels,
    borderRadius: showLabels ? Math.round(34 * scale) : 28,
    tabMinHeight: showLabels ? Math.round(50 * scale) : 40,
    pillRadius: showLabels ? 22 : 18,
    maxBarWidth: windowWidth >= 600 ? 520 : undefined,
  };
}

export function tabBarInset(
  bottomInset: number,
  height: number = TAB_BAR_HEIGHT,
  bottomMargin: number = TAB_BAR_BOTTOM_MARGIN
): number {
  return height + bottomMargin + bottomInset;
}
