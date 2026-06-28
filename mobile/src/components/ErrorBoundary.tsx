import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { errorMessage } from "../utils/errors";

interface Props {
  children: React.ReactNode;
  title?: string;
  resetKey?: string | number;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[Titus] UI error${this.props.title ? ` (${this.props.title})` : ""}`, error, info);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>
            {this.props.title ? `${this.props.title} ran into a problem` : "Something went wrong"}
          </Text>
          <Text style={styles.message} selectable>
            {errorMessage(this.state.error, "An unexpected error occurred.")}
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0d1117",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  title: {
    color: "#f0f6fc",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    color: "#8b949e",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#1f6feb",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
