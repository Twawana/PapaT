import React from "react";
import AgentScreen from "../screens/AgentScreen";
import CodeScreen from "../screens/CodeScreen";
import FilesScreen from "../screens/FilesScreen";
import GitScreen from "../screens/GitScreen";
import ProjectsScreen from "../screens/ProjectsScreen";
import TerminalScreen from "../screens/TerminalScreen";

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
}

export interface NavigationTabConfig {
  id: TabId;
  label: string | ((ctx: NavigationContext) => string);
  shortLabel?: string;
  visible?: (ctx: NavigationContext) => boolean;
  render: (ctx: NavigationContext) => React.ReactNode;
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
    render: (ctx) => (
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
    render: (ctx) => (
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
    render: (ctx) => (
      <CodeScreen
        key={ctx.workspacePath ?? "default"}
        isConnected={ctx.isConnected}
        workspacePath={ctx.workspacePath}
        workspaceName={ctx.workspaceName}
        onError={ctx.onError}
      />
    ),
  },
  {
    id: "git",
    label: "Git",
    shortLabel: "Git",
    render: (ctx) => (
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
    render: (ctx) => (
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
