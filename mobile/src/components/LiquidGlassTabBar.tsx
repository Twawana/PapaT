import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NavigationContext,
  NavigationTabConfig,
  resolveTabLabel,
  TabId,
} from "../config/navigationTabs";
import { useTheme } from "../context/ThemeContext";
import { useTabBarMetrics } from "../hooks/useTabBarInset";
import { useThemedStyles } from "../hooks/useThemedStyles";

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
  onSelectTab: (tabId: TabId) => void;
}

export function LiquidGlassTabBar({
  tabs,
  activeTab,
  ctx,
  onSelectTab,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const metrics = useTabBarMetrics(tabs.length);
  const styles = useThemedStyles((c) => ({
    container: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
    },
    shadowWrap: {
      ...Platform.select({
        ios: {
          shadowColor: c.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: isDark ? 0.42 : 0.18,
          shadowRadius: 24,
        },
        android: {
          elevation: 18,
        },
        default: {},
      }),
    },
    glass: {
      overflow: "hidden" as const,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 255, 255, 0.14)" : c.border,
      backgroundColor: isDark
        ? "rgba(18, 22, 30, 0.94)"
        : `${c.surfaceElevated}F2`,
    },
    glassTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(255, 255, 255, 0.72)",
    },
    tabRow: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    tabItem: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 3,
    },
    selectionPill: {
      position: "absolute" as const,
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.16)"
        : c.surfaceMuted,
      borderWidth: 1,
      borderColor: isDark
        ? "rgba(255, 255, 255, 0.12)"
        : c.accentBorder,
    },
    tabLabel: {
      fontWeight: "600" as const,
      letterSpacing: 0.1,
      color: c.textMuted,
      maxWidth: "100%" as const,
      paddingHorizontal: 2,
    },
    tabLabelActive: {
      color: c.textPrimary,
    },
  }));

  const iconActiveColor = colors.textPrimary;
  const iconInactiveColor = colors.iconMuted;
  const padLeft = Math.max(metrics.sideInset, insets.left + 8);
  const padRight = Math.max(metrics.sideInset, insets.right + 8);

  const tabContent = (
    <>
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
              style={[styles.tabItem, { minHeight: metrics.tabMinHeight }]}
              onPress={() => onSelectTab(tab.id)}
            >
              {active ? (
                <View
                  style={[
                    styles.selectionPill,
                    { borderRadius: metrics.pillRadius },
                  ]}
                />
              ) : null}
              <Ionicons
                name={active ? icons.active : icons.inactive}
                size={metrics.iconSize}
                color={active ? iconActiveColor : iconInactiveColor}
              />
              {metrics.showLabels ? (
                <Text
                  style={[
                    styles.tabLabel,
                    { fontSize: metrics.labelFontSize },
                    active && styles.tabLabelActive,
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {shortLabel}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          paddingLeft: padLeft,
          paddingRight: padRight,
          paddingBottom: insets.bottom + metrics.bottomMargin,
        },
      ]}
    >
      <View
        style={[
          styles.shadowWrap,
          {
            borderRadius: metrics.borderRadius,
            alignSelf: metrics.maxBarWidth ? "center" : "stretch",
            width: metrics.maxBarWidth ? metrics.maxBarWidth : "100%",
            maxWidth: "100%",
          },
        ]}
      >
        <View
          style={[
            styles.glass,
            {
              height: metrics.height,
              borderRadius: metrics.borderRadius,
            },
          ]}
        >
          {tabContent}
        </View>
      </View>
    </View>
  );
}
