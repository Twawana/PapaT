import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TAB_ID,
  getNavigationTabs,
  NavigationContext,
  NavigationTabConfig,
  TabId,
} from "../config/navigationTabs";
import { loadActiveTab, saveActiveTab } from "../services/navPreferences";

export function useNavigationTabs(ctx: NavigationContext) {
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB_ID);

  const tabs = useMemo(() => getNavigationTabs(ctx), [ctx]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const saved = await loadActiveTab();
      if (!cancelled) {
        setActiveTab(saved);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      const fallback = tabs[0]?.id ?? DEFAULT_TAB_ID;
      setActiveTab(fallback);
      void saveActiveTab(fallback);
    }
  }, [tabs, activeTab]);

  const selectTab = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    void saveActiveTab(tabId);
  }, []);

  const isActive = useCallback(
    (tab: NavigationTabConfig) => tab.id === activeTab,
    [activeTab]
  );

  return {
    tabs,
    activeTab,
    selectTab,
    isActive,
  };
}
