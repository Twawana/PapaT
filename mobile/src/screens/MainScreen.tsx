import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConnectionBar } from "../components/ConnectionBar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  LiquidGlassTabBar,
} from "../components/LiquidGlassTabBar";
import { resolveTabLabel, TabId } from "../config/navigationTabs";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import { useEditor } from "../context/EditorContext";
import {
  dismissKeyboard,
  keyboardAvoidBehavior,
  useKeyboardVisible,
} from "../utils/keyboard";
import { useConnection } from "../hooks/useConnection";
import { useNavigationTabs } from "../hooks/useNavigationTabs";
import { titusClient } from "../services/websocket";

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
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const connection = useConnection();
  const insets = useSafeAreaInsets();
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

  const navContext = useMemo(
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

  const navigation = useNavigationTabs(navContext);
  selectTabRef.current = navigation.selectTab;

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
  const contentInset = keyboardVisible ? insets.bottom : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <EditorActionBridge actionsRef={editorActionsRef} />
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboardAvoidBehavior()}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <KeyboardDismissView style={styles.flex}>
        <Pressable style={styles.header} onPress={dismissKeyboard}>
          <Text style={styles.title}>Titus</Text>
        </Pressable>

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
        />

        <View style={[styles.content, { paddingBottom: contentInset }]}>
          {navigation.tabs.map((tab) => (
            <View
              key={tab.id}
              style={
                navigation.activeTab === tab.id ? styles.panel : styles.panelHidden
              }
            >
              <ErrorBoundary
                title={resolveTabLabel(tab, navContext)}
                resetKey={`${tab.id}-${navigation.activeTab === tab.id ? "active" : "idle"}`}
                onError={(error) => connection.setError(error.message)}
              >
                {tab.render(navContext)}
              </ErrorBoundary>
            </View>
          ))}
        </View>

        {!keyboardVisible ? (
          <LiquidGlassTabBar
            tabs={navigation.tabs}
            activeTab={navigation.activeTab}
            ctx={navContext}
            bottomInset={insets.bottom}
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#010409",
  },
  flex: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  content: {
    flex: 1,
  },
  panel: {
    flex: 1,
  },
  panelHidden: {
    display: "none",
  },
});
