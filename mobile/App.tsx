import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { GlobalErrorBanner } from "./src/components/GlobalErrorBanner";
import {
  installGlobalErrorHandlers,
  registerGlobalErrorListener,
} from "./src/services/globalErrors";
import MainScreen from "./src/screens/MainScreen";

export default function App() {
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    registerGlobalErrorListener((message) => setGlobalError(message));
    return installGlobalErrorHandlers();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary title="PapaT">
        {globalError ? (
          <GlobalErrorBanner
            message={globalError}
            onDismiss={() => setGlobalError(null)}
          />
        ) : null}
        <MainScreen />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
