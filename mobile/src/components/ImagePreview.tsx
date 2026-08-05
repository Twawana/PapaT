import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  /** Preferred: http(s) URL to the host preview endpoint. */
  httpUri?: string | null;
  /** Fallback data URI (base64 / svg). */
  dataUri?: string | null;
  label?: string;
  useWebView?: boolean;
}

export function ImagePreview({
  httpUri,
  dataUri,
  label,
  useWebView = false,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"http" | "data" | "webview">(
    httpUri ? "http" : useWebView || dataUri ? "webview" : "http"
  );

  useEffect(() => {
    setFailed(false);
    if (httpUri) {
      setMode("http");
    } else if (useWebView || dataUri) {
      setMode("webview");
    }
  }, [httpUri, dataUri, useWebView]);

  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 8,
      minHeight: 240,
    },
    label: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 8,
    },
    image: {
      width: "100%" as const,
      minHeight: 280,
      height: 360,
      borderRadius: 6,
      backgroundColor: c.surface,
    },
    web: {
      flex: 1,
      minHeight: 280,
      borderRadius: 6,
      backgroundColor: c.surface,
      overflow: "hidden" as const,
    },
    hint: {
      color: c.placeholder,
      fontSize: 11,
      marginTop: 8,
      textAlign: "center" as const,
    },
    error: {
      color: c.errorText,
      fontSize: 13,
      textAlign: "center" as const,
      marginTop: 24,
      paddingHorizontal: 16,
      lineHeight: 20,
    },
    loading: {
      marginTop: 40,
    },
  }));

  const webHtml = useMemo(() => {
    const src = httpUri || dataUri || "";
    // Put the URL in JS (JSON.stringify) so huge base64 / special chars stay safe.
    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4" />
<style>
  html,body{margin:0;padding:0;background:#111;height:100%;width:100%;}
  body{display:flex;align-items:center;justify-content:center;}
  img{max-width:100%;max-height:100%;object-fit:contain;}
  .err{color:#f88;font:14px sans-serif;padding:16px;text-align:center;}
</style></head><body>
<img id="img" alt="" />
<script>
  var img = document.getElementById('img');
  img.onerror = function () {
    document.body.innerHTML = '<p class="err">Could not load image</p>';
  };
  img.src = ${JSON.stringify(src)};
</script>
</body></html>`;
  }, [httpUri, dataUri]);

  const onHttpError = () => {
    // Fall back to WebView/data URI if HTTP preview fails.
    if (dataUri || useWebView) {
      setMode("webview");
      setFailed(false);
      return;
    }
    setFailed(true);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {failed ? (
        <Text style={styles.error}>
          Could not display this image. Restart PapaT on your PC, reconnect, and
          open the file again.
        </Text>
      ) : mode === "http" && httpUri ? (
        <Image
          source={{ uri: httpUri }}
          style={styles.image}
          resizeMode="contain"
          onError={onHttpError}
        />
      ) : httpUri || dataUri ? (
        <WebView
          style={styles.web}
          originWhitelist={["*"]}
          allowFileAccess
          mixedContentMode="always"
          source={{ html: webHtml }}
          onHttpError={() => setFailed(true)}
          onError={() => {
            if (mode === "webview" && httpUri && dataUri) {
              // already on webview — give up
              setFailed(true);
              return;
            }
            setFailed(true);
          }}
          startInLoadingState
          renderLoading={() => (
            <ActivityIndicator style={styles.loading} />
          )}
        />
      ) : (
        <Text style={styles.error}>No image data available.</Text>
      )}
      <Text style={styles.hint}>Image preview (read-only)</Text>
    </View>
  );
}
