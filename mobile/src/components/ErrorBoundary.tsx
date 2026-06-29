import React from "react";
import { Pressable, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";
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

function ErrorFallback({
  title,
  error,
  onRetry,
}: {
  title?: string;
  error: Error;
  onRetry: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {title ? `${title} ran into a problem` : "Something went wrong"}
      </Text>
      <Text style={styles.message} selectable>
        {errorMessage(error, "An unexpected error occurred.")}
      </Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
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
        <ErrorFallback
          title={this.props.title}
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

function createStyles(colors: ThemeColors) {
  return {
    container: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: 24,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700" as const,
      textAlign: "center" as const,
      marginBottom: 8,
    },
    message: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center" as const,
      marginBottom: 16,
    },
    button: {
      backgroundColor: colors.buttonPrimary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 8,
    },
    buttonText: {
      color: colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 14,
    },
  };
}
