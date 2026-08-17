import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";
import ProjectsScreen from "../screens/ProjectsScreen";

const AgentScreen = React.lazy(() => import("../screens/AgentScreen"));
const CodeScreen = React.lazy(() => import("../screens/CodeScreen"));
const FilesScreen = React.lazy(() => import("../screens/FilesScreen"));
const GitScreen = React.lazy(() => import("../screens/GitScreen"));
const TerminalScreen = React.lazy(() => import("../screens/TerminalScreen"));

export type TabId = "open" | "agent" | "terminal" | "code" | "files" | "git";

export interface NavigationContext {
  isConnected: boolean;
  vscodeConnected: boolean;
  workspacePath: string | null;
  workspaceName: string;
  onWorkspaceChange: (path: string, name: string) => void;
  onError: (message: string | null) => void;
  onOpenInEditor: (path: string) => void;
  selectTab: (tab: TabId) => void;
  activeTab: TabId;
}

export interface NavigationTabConfig {
  id: TabId;
  label: string | ((ctx: NavigationContext) => string);
  shortLabel?: string;
  visible?: (ctx: NavigationContext) => boolean;
  render: (ctx: NavigationContext) => React.ReactNode;
}

function TabFallback() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<TabFallback />}>{node}</Suspense>;
}

const ALL_TABS: NavigationTabConfig[] = [
  {
    id: "open",
    label: "Open",
    shortLabel: "Open",
    render: (ctx) => (
      <ProjectsScreen
        isConnected={ctx.isConnected}
        vscodeConnected={ctx.vscodeConnected}
        workspacePath={ctx.workspacePath}
        onWorkspaceChange={ctx.onWorkspaceChange}
        onError={ctx.onError}
      />
    ),
  },
  {
    id: "agent",
    label: (ctx) =>
      ctx.workspaceName && ctx.workspaceName !== "workspace"
        ? `Agent · ${ctx.workspaceName}`
        : "Agent",
    shortLabel: "Agent",
    render: (ctx) =>
      withSuspense(
        <AgentScreen
          isConnected={ctx.isConnected}
          workspacePath={ctx.workspacePath}
          workspaceName={ctx.workspaceName}
          onWorkspaceChange={ctx.onWorkspaceChange}
          onError={ctx.onError}
        />
      ),
  },
  {
    id: "terminal",
    label: "Terminal",
    shortLabel: "Shell",
    render: (ctx) =>
      withSuspense(
        <TerminalScreen isConnected={ctx.isConnected} onError={ctx.onError} />
      ),
  },
  {
    id: "code",
    label: (ctx) =>
      ctx.workspaceName && ctx.workspaceName !== "workspace"
        ? `Code · ${ctx.workspaceName}`
        : "Code",
    shortLabel: "Code",
    render: (ctx) =>
      withSuspense(
        <CodeScreen
          key={ctx.workspacePath ?? "default"}
          isConnected={ctx.isConnected}
          workspacePath={ctx.workspacePath}
          workspaceName={ctx.workspaceName}
          onError={ctx.onError}
          isActive={ctx.activeTab === "code"}
        />
      ),
  },
  {
    id: "git",
    label: "Git",
    shortLabel: "Git",
    render: (ctx) =>
      withSuspense(
        <GitScreen
          isConnected={ctx.isConnected}
          onError={ctx.onError}
          onOpenFile={(path) => {
            ctx.onOpenInEditor(path);
          }}
        />
      ),
  },
  {
    id: "files",
    label: (ctx) =>
      ctx.workspaceName && ctx.workspaceName !== "workspace"
        ? `Files · ${ctx.workspaceName}`
        : "Files",
    shortLabel: "Files",
    render: (ctx) =>
      withSuspense(
        <FilesScreen
          key={ctx.workspacePath ?? "default"}
          isConnected={ctx.isConnected}
          vscodeConnected={ctx.vscodeConnected}
          workspaceName={ctx.workspaceName}
          workspacePath={ctx.workspacePath}
          onError={ctx.onError}
          onOpenInEditor={(path) => {
            ctx.onOpenInEditor(path);
          }}
        />
      ),
  },
];

export function getNavigationTabs(ctx: NavigationContext): NavigationTabConfig[] {
  return ALL_TABS.filter((tab) => tab.visible?.(ctx) ?? true);
}

export function resolveTabLabel(
  tab: NavigationTabConfig,
  ctx: NavigationContext
): string {
  return typeof tab.label === "function" ? tab.label(ctx) : tab.label;
}

export function isTabId(value: string): value is TabId {
  return ALL_TABS.some((tab) => tab.id === value);
}

export const DEFAULT_TAB_ID: TabId = "open";
