import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConnectionBar } from "../components/ConnectionBar";
import { ServerOfflinePanel } from "../components/ServerOfflinePanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import {
  LiquidGlassTabBar,
} from "../components/LiquidGlassTabBar";
import { resolveTabLabel, TabId } from "../config/navigationTabs";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import { useEditor } from "../context/EditorContext";
import {
  dismissKeyboard,
  keyboardAvoidBehavior,
  useCompactKeyboardLayout,
  useKeyboardVisible,
} from "../utils/keyboard";
import { useConnection } from "../hooks/useConnection";
import { useNavigationTabs } from "../hooks/useNavigationTabs";
import { useScreenLayout } from "../hooks/useScreenLayout";
import { titusClient } from "../services/websocket";
import { ThemeColors } from "../theme/colors";

interface EditorActions {
  openFile: (path: string) => Promise<void>;
  resetForWorkspace: () => void;
}

function EditorActionBridge({
  actionsRef,
}: {
  actionsRef: React.MutableRefObject<EditorActions>;
}) {
  const editor = useEditor();

  actionsRef.current = {
    openFile: editor.openFile,
    resetForWorkspace: editor.resetForWorkspace,
  };

  return null;
}

export default function MainScreen() {
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const [connectionDetailsVisible, setConnectionDetailsVisible] = useState(true);
  const connection = useConnection();
  const insets = useSafeAreaInsets();
  const screen = useScreenLayout();
  const editorActionsRef = useRef<EditorActions>({
    openFile: async () => {},
    resetForWorkspace: () => {},
  });
  const lastWorkspacePathRef = useRef<string | null>(null);

  const handleWorkspaceChange = useCallback(
    (path: string, name: string) => {
      if (lastWorkspacePathRef.current && lastWorkspacePathRef.current !== path) {
        editorActionsRef.current.resetForWorkspace();
      }
      lastWorkspacePathRef.current = path;
      connection.setWorkspacePath(path);
      setWorkspaceName(name);
    },
    [connection]
  );

  useEffect(() => {
    if (connection.workspacePath) {
      lastWorkspacePathRef.current = connection.workspacePath;
      const name =
        connection.workspacePath.split(/[/\\]/).pop() || workspaceName;
      if (workspaceName === "workspace") {
        setWorkspaceName(name);
      }
    }
  }, [connection.workspacePath, workspaceName]);

  const handleOpenInEditor = useCallback(
    async (path: string) => {
      try {
        await editorActionsRef.current.openFile(path);
        connection.setError(null);
      } catch (err) {
        connection.setError(err instanceof Error ? err.message : "Failed to open file");
      }
    },
    [connection]
  );

  const selectTabRef = React.useRef<(tab: TabId) => void>(() => {});

  const navContextBase = useMemo(
    () => ({
      isConnected: connection.isConnected,
      vscodeConnected: connection.vscodeConnected,
      workspacePath: connection.workspacePath,
      workspaceName,
      onWorkspaceChange: handleWorkspaceChange,
      onError: connection.setError,
      onOpenInEditor: (path: string) => {
        void handleOpenInEditor(path);
        selectTabRef.current("code");
      },
      selectTab: (tab: TabId) => selectTabRef.current(tab),
      activeTab: "open" as TabId,
    }),
    [
      connection.isConnected,
      connection.vscodeConnected,
      connection.workspacePath,
      connection.setError,
      workspaceName,
      handleWorkspaceChange,
      handleOpenInEditor,
    ]
  );

  const navigation = useNavigationTabs(navContextBase);
  selectTabRef.current = navigation.selectTab;

  const navContext = useMemo(
    () => ({
      ...navContextBase,
      activeTab: navigation.activeTab,
    }),
    [navContextBase, navigation.activeTab]
  );

  useEffect(() => {
    const tab = navigation.activeTab;
    if (!connection.isConnected || (tab !== "code" && tab !== "agent")) {
      return;
    }

    if (!connection.workspacePath) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const workspacePath = connection.workspacePath;
      if (!workspacePath) return;

      try {
        const info = await titusClient.getWorkspace();
        if (cancelled || info.path === workspacePath) {
          return;
        }
        const result = await titusClient.openProject(workspacePath);
        if (cancelled) return;
        handleWorkspaceChange(result.path, result.name);
      } catch (err) {
        if (!cancelled) {
          connection.setError(
            err instanceof Error ? err.message : "Failed to sync project workspace"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    navigation.activeTab,
    connection.isConnected,
    connection.workspacePath,
    connection.setError,
    handleWorkspaceChange,
  ]);

  const keyboardVisible = useKeyboardVisible();
  const compactKeyboard = useCompactKeyboardLayout();
  const contentInset = keyboardVisible ? insets.bottom : 0;
  const showHeaderExtras = !connection.isConnected || connectionDetailsVisible;

  return (
    <SafeAreaView
      style={styles.safe}
      edges={compactKeyboard ? [] : ["top"]}
    >
      <EditorActionBridge actionsRef={editorActionsRef} />
      <StatusBar style={isDark ? "light" : "dark"} hidden={compactKeyboard} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboardAvoidBehavior()}
        keyboardVerticalOffset={
          compactKeyboard ? 0 : Platform.OS === "ios" ? 8 : 0
        }
      >
        <KeyboardDismissView style={styles.flex}>
        <View
          style={[
            styles.body,
            {
              paddingLeft: screen.contentPadLeft,
              paddingRight: screen.contentPadRight,
            },
          ]}
        >
        {!compactKeyboard ? (
          <View
            style={[
              styles.header,
              {
                paddingTop: screen.headerPadTop,
                paddingBottom: screen.headerPadBottom,
              },
            ]}
          >
            <Pressable style={styles.titleWrap} onPress={dismissKeyboard}>
              <Text style={[styles.title, { fontSize: screen.titleSize }]}>
                Titus
              </Text>
            </Pressable>
            {showHeaderExtras ? <ThemeToggle /> : null}
          </View>
        ) : null}

        {!compactKeyboard ? (
          <ConnectionBar
            host={connection.host}
            port={connection.port}
            connectionStatus={connection.connectionStatus}
            serverInfo={connection.serverInfo}
            vscodeConnected={connection.vscodeConnected}
            deviceName={connection.deviceName}
            isPaired={connection.isPaired}
            error={connection.error}
            onHostChange={connection.setHost}
            onPortChange={connection.setPort}
            onConnect={connection.handleConnect}
            onDisconnect={connection.handleDisconnect}
            onPairFromQr={connection.handlePairFromQr}
            onPairWithCode={connection.handlePairWithCode}
            onForgetDevice={connection.handleForgetDevice}
            onError={connection.setError}
            detailsVisible={connectionDetailsVisible}
            onDetailsVisibleChange={setConnectionDetailsVisible}
          />
        ) : null}

        {connection.backgroundContinued && !connection.isConnected && !compactKeyboard ? (
          <Text style={styles.backgroundHint}>
            PC tasks keep running in the background. Reconnecting…
          </Text>
        ) : null}

        <View style={[styles.content, { paddingBottom: contentInset }]}>
          {connection.isConnected ? (
            navigation.tabs.map((tab) =>
              navigation.activeTab === tab.id ? (
                <View key={tab.id} style={styles.panel}>
                  <ErrorBoundary
                    title={resolveTabLabel(tab, navContext)}
                    resetKey={tab.id}
                    onError={(error) => connection.setError(error.message)}
                  >
                    {tab.render(navContext)}
                  </ErrorBoundary>
                </View>
              ) : null
            )
          ) : (
            <ServerOfflinePanel connectionStatus={connection.connectionStatus} />
          )}
        </View>
        </View>

        {!keyboardVisible ? (
          <LiquidGlassTabBar
            tabs={navigation.tabs}
            activeTab={navigation.activeTab}
            ctx={navContext}
            onSelectTab={(tabId) => {
              dismissKeyboard();
              navigation.selectTab(tabId);
            }}
          />
        ) : null}
        </KeyboardDismissView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return {
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    body: {
      flex: 1,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 12,
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.textPrimary,
    },
    backgroundHint: {
      color: colors.warning,
      fontSize: 12,
      marginBottom: 8,
      lineHeight: 16,
    },
    content: {
      flex: 1,
    },
    panel: {
      flex: 1,
    },
  };
}
