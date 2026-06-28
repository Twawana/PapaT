import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  NavigationContext,
  NavigationTabConfig,
  resolveTabLabel,
  TabId,
} from "../config/navigationTabs";

export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_BOTTOM_MARGIN = 10;

export function tabBarInset(bottomInset: number): number {
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + bottomInset;
}

const TAB_ICONS: Record<
  TabId,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  open: { active: "folder", inactive: "folder-outline" },
  agent: { active: "sparkles", inactive: "sparkles-outline" },
  terminal: { active: "terminal", inactive: "terminal-outline" },
  code: { active: "code-slash", inactive: "code-slash-outline" },
  files: { active: "documents", inactive: "documents-outline" },
  git: { active: "git-branch", inactive: "git-branch-outline" },
};

interface Props {
  tabs: NavigationTabConfig[];
  activeTab: TabId;
  ctx: NavigationContext;
  bottomInset: number;
  onSelectTab: (tabId: TabId) => void;
}

export function LiquidGlassTabBar({
  tabs,
  activeTab,
  ctx,
  bottomInset,
  onSelectTab,
}: Props) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: bottomInset + TAB_BAR_BOTTOM_MARGIN }]}
    >
      <View style={styles.shadowWrap}>
        <BlurView intensity={Platform.OS === "ios" ? 72 : 48} tint="dark" style={styles.glass}>
          <View style={styles.glassTint} />
          <View style={styles.tabRow}>
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              const icons = TAB_ICONS[tab.id];
              const label = resolveTabLabel(tab, ctx);
              const shortLabel =
                tab.id === "files" &&
                ctx.workspaceName &&
                ctx.workspaceName !== "workspace"
                  ? ctx.workspaceName.length > 8
                    ? `${ctx.workspaceName.slice(0, 7)}…`
                    : ctx.workspaceName
                  : typeof tab.label === "function"
                    ? tab.shortLabel ?? label
                    : tab.shortLabel ?? label;

              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  style={styles.tabItem}
                  onPress={() => onSelectTab(tab.id)}
                >
                  {active ? <View style={styles.selectionPill} /> : null}
                  <Ionicons
                    name={active ? icons.active : icons.inactive}
                    size={22}
                    color={active ? "#FFFFFF" : "rgba(235, 240, 255, 0.58)"}
                  />
                  <Text
                    style={[styles.tabLabel, active && styles.tabLabelActive]}
                    numberOfLines={1}
                  >
                    {shortLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
  },
  shadowWrap: {
    borderRadius: 34,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.42,
        shadowRadius: 24,
      },
      android: {
        elevation: 18,
      },
      default: {},
    }),
  },
  glass: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: Platform.OS === "android" ? "rgba(18, 22, 30, 0.88)" : "transparent",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    gap: 3,
  },
  selectionPill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: "rgba(235, 240, 255, 0.58)",
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
});
