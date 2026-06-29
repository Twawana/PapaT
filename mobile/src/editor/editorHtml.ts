import { codemirrorMode, EditorMode } from "../utils/language";

export function buildEditorHtml(
  initialContent: string,
  mode: EditorMode,
  isDark = true
): string {
  const cmMode = codemirrorMode(mode);
  const escaped = JSON.stringify(initialContent);
  const theme = isDark ? "dracula" : "eclipse";
  const bgColor = isDark ? "#0d1117" : "#ffffff";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/eclipse.min.css"/>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: ${bgColor}; overflow: hidden; }
  .CodeMirror { height: 100% !important; font-size: 13px; line-height: 1.45; font-family: Menlo, Monaco, Consolas, monospace; }
  .CodeMirror-scroll { overflow: auto !important; }
</style>
</head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/shell/shell.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/meta.min.js"></script>
<script>
  const isDark = ${isDark ? "true" : "false"};
  const darkBg = "#0d1117";
  const lightBg = "#ffffff";

  function applyTheme(dark) {
    const bg = dark ? darkBg : lightBg;
    const themeName = dark ? "dracula" : "eclipse";
    editor.setOption("theme", themeName);
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    editor.getWrapperElement().style.background = bg;
  }

  const editor = CodeMirror(document.body, {
    value: ${escaped},
    mode: ${JSON.stringify(cmMode)},
    theme: ${JSON.stringify(theme)},
    lineNumbers: true,
    lineWrapping: false,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      Tab: function(cm) { cm.replaceSelection("  ", "end"); }
    }
  });

  let suppressChange = false;

  editor.on("change", function() {
    if (suppressChange) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "change",
      value: editor.getValue()
    }));
  });

  window.addEventListener("message", function(event) {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data || !data.type) return;

    if (data.type === "setValue") {
      suppressChange = true;
      editor.setValue(data.value || "");
      suppressChange = false;
    } else if (data.type === "setMode") {
      editor.setOption("mode", data.mode || "plaintext");
    } else if (data.type === "setTheme") {
      applyTheme(data.isDark !== false);
    } else if (data.type === "find") {
      const query = data.query || "";
      if (!query) return;
      const cursor = editor.getSearchCursor(query, editor.getCursor());
      if (cursor.findNext()) {
        editor.setSelection(cursor.from(), cursor.to());
        editor.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 40);
      } else {
        const fromStart = editor.getSearchCursor(query, { line: 0, ch: 0 });
        if (fromStart.findNext()) {
          editor.setSelection(fromStart.from(), fromStart.to());
          editor.scrollIntoView({ from: fromStart.from(), to: fromStart.to() }, 40);
        }
      }
    } else if (data.type === "insert") {
      editor.replaceSelection(data.text || "");
    } else if (data.type === "focus") {
      editor.focus();
    } else if (data.type === "blur") {
      editor.getInputField().blur();
    }
  });

  applyTheme(isDark);
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));
</script>
</body>
</html>`;
}
