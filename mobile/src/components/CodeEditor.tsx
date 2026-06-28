import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { buildEditorHtml } from "../editor/editorHtml";
import { codemirrorMode, EditorMode } from "../utils/language";

interface Props {
  value: string;
  mode: EditorMode;
  onChange: (value: string) => void;
  onReady?: () => void;
  editorKey?: string;
}

export interface CodeEditorHandle {
  find: (query: string) => void;
  insert: (text: string) => void;
  focus: () => void;
}

export const CodeEditor = React.forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, mode, onChange, onReady, editorKey },
  ref
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingValue = useRef<string | null>(null);
  const lastEmittedValue = useRef(value);

  const post = useCallback((payload: Record<string, unknown>) => {
    webRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  React.useImperativeHandle(ref, () => ({
    find: (query: string) => post({ type: "find", query }),
    insert: (text: string) => post({ type: "insert", text }),
    focus: () => post({ type: "focus" }),
  }));

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          value?: string;
        };
        if (data.type === "ready") {
          readyRef.current = true;
          if (pendingValue.current !== null) {
            post({ type: "setValue", value: pendingValue.current });
            pendingValue.current = null;
          }
          onReady?.();
          return;
        }
        if (data.type === "change" && typeof data.value === "string") {
          lastEmittedValue.current = data.value;
          onChange(data.value);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onChange, onReady, post]
  );

  useEffect(() => {
    readyRef.current = false;
    pendingValue.current = value;
    lastEmittedValue.current = value;
  }, [editorKey]);

  useEffect(() => {
    if (!readyRef.current) {
      pendingValue.current = value;
      return;
    }
    if (value === lastEmittedValue.current) {
      return;
    }
    lastEmittedValue.current = value;
    post({ type: "setValue", value });
  }, [post, value]);

  useEffect(() => {
    if (readyRef.current) {
      post({ type: "setMode", mode: codemirrorMode(mode) });
    }
  }, [mode, post]);

  useEffect(() => {
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub = Keyboard.addListener(hideEvent, () => {
      post({ type: "blur" });
    });
    return () => sub.remove();
  }, [post]);

  const html = useMemo(
    () => buildEditorHtml(value, mode),
    [editorKey, mode]
  );
  const source = useMemo(() => ({ html }), [html]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        key={editorKey ?? mode}
        originWhitelist={["*"]}
        source={source}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        style={styles.webview}
        keyboardDisplayRequiresUserAction={false}
        {...(Platform.OS === "android"
          ? { mixedContentMode: "always" as const }
          : {})}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
});
