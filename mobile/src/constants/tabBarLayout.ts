export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_BOTTOM_MARGIN = 10;

export function tabBarInset(bottomInset: number): number {
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + bottomInset;
}
