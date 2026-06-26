import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConnectionBar } from "../components/ConnectionBar";
import { useConnection } from "../hooks/useConnection";
import FilesScreen from "./FilesScreen";
import HomeScreen from "./HomeScreen";
import ProjectsScreen from "./ProjectsScreen";
import AgentScreen from "./AgentScreen";

type Tab = "open" | "agent" | "code" | "files";

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [workspaceName, setWorkspaceName] = useState("workspace");
  const connection = useConnection();

  const handleWorkspaceChange = (path: string, name: string) => {
    connection.setWorkspacePath(path);
    setWorkspaceName(name);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>PapaT</Text>
          <Text style={styles.subtitle}>Phone-as-PC Terminal</Text>
        </View>

        <ConnectionBar
          host={connection.host}
          port={connection.port}
          connectionStatus={connection.connectionStatus}
          serverInfo={connection.serverInfo}
          vscodeConnected={connection.vscodeConnected}
          error={connection.error}
          onHostChange={connection.setHost}
          onPortChange={connection.setPort}
          onConnect={connection.handleConnect}
          onDisconnect={connection.handleDisconnect}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabBar}
        >
          {(
            [
              ["open", "Open"],
              ["agent", "Agent"],
              ["code", "Code"],
              ["files", "Files"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              style={[styles.tab, activeTab === id && styles.tabActive]}
              onPress={() => setActiveTab(id)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === id && styles.tabTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.content}>
          {activeTab === "open" ? (
            <ProjectsScreen
              isConnected={connection.isConnected}
              vscodeConnected={connection.vscodeConnected}
              workspacePath={connection.workspacePath}
              onWorkspaceChange={handleWorkspaceChange}
              onError={connection.setError}
            />
          ) : activeTab === "agent" ? (
            <AgentScreen
              isConnected={connection.isConnected}
              onError={connection.setError}
            />
          ) : activeTab === "code" ? (
            <HomeScreen
              isConnected={connection.isConnected}
              onError={connection.setError}
            />
          ) : (
            <FilesScreen
              key={connection.workspacePath ?? "default"}
              isConnected={connection.isConnected}
              vscodeConnected={connection.vscodeConnected}
              workspaceName={workspaceName}
              workspacePath={connection.workspacePath}
              onError={connection.setError}
            />
          )}
        </View>
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
  subtitle: {
    fontSize: 14,
    color: "#8b949e",
    marginTop: 2,
  },
  tabScroll: {
    maxHeight: 48,
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    minWidth: 72,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#1f6feb",
    borderColor: "#1f6feb",
  },
  tabText: {
    color: "#8b949e",
    fontWeight: "600",
    fontSize: 14,
  },
  tabTextActive: {
    color: "#ffffff",
  },
  content: {
    flex: 1,
  },
});
