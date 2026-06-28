import * as SecureStore from "expo-secure-store";
import { DEFAULT_TAB_ID, isTabId, TabId } from "../config/navigationTabs";

const ACTIVE_TAB_KEY = "titus.nav.activeTab";

export async function loadActiveTab(): Promise<TabId> {
  try {
    const saved = await SecureStore.getItemAsync(ACTIVE_TAB_KEY);
    if (saved && isTabId(saved)) {
      return saved;
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_TAB_ID;
}

export async function saveActiveTab(tabId: TabId): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACTIVE_TAB_KEY, tabId);
  } catch {
    // Non-critical preference
  }
}
