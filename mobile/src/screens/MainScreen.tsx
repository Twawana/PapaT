import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
  tabBarInset,
} from "../components/LiquidGlassTabBar";
import { resolveTabLabel } from "../config/navigationTabs";
import { useConnection } from "../hooks/useConnection";
import { useNavigationTabs } from "../hooks/useNavigationTabs";

export default function MainScreen() {
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const connection = useConnection();
  const insets = useSafeAreaInsets();

  const handleWorkspaceChange = useCallback(
    (path: string, name: string) => {
      connection.setWorkspacePath(path);
      setWorkspaceName(name);
    },
    [connection]
  );

  const navContext = useMemo(
    () => ({
      isConnected: connection.isConnected,
      vscodeConnected: connection.vscodeConnected,
      workspacePath: connection.workspacePath,
      workspaceName,
      onWorkspaceChange: handleWorkspaceChange,
      onError: connection.setError,
    }),
    [
      connection.isConnected,
      connection.vscodeConnected,
      connection.workspacePath,
      connection.setError,
      workspaceName,
      handleWorkspaceChange,
    ]
  );

  const navigation = useNavigationTabs(navContext);
  const contentInset = tabBarInset(insets.bottom);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>PapaT</Text>
        </View>

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

        <LiquidGlassTabBar
          tabs={navigation.tabs}
          activeTab={navigation.activeTab}
          ctx={navContext}
          bottomInset={insets.bottom}
          onSelectTab={navigation.selectTab}
        />
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
