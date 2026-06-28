export interface Snippet {
  id: string;
  label: string;
  language: string;
  body: string;
}

export const BUILTIN_SNIPPETS: Snippet[] = [
  {
    id: "js-log",
    label: "console.log",
    language: "javascript",
    body: 'console.log("$1");',
  },
  {
    id: "js-fn",
    label: "function",
    language: "javascript",
    body: "function $1($2) {\n  $3\n}\n",
  },
  {
    id: "js-async",
    label: "async function",
    language: "javascript",
    body: "async function $1($2) {\n  $3\n}\n",
  },
  {
    id: "ts-interface",
    label: "interface",
    language: "typescript",
    body: "interface $1 {\n  $2\n}\n",
  },
  {
    id: "py-main",
    label: "if __main__",
    language: "python",
    body: 'if __name__ == "__main__":\n    $1\n',
  },
  {
    id: "py-fn",
    label: "def",
    language: "python",
    body: "def $1($2):\n    $3\n",
  },
  {
    id: "sh-shebang",
    label: "bash shebang",
    language: "shell",
    body: "#!/usr/bin/env bash\nset -euo pipefail\n\n$1\n",
  },
];

export function snippetsForLanguage(language: string): Snippet[] {
  return BUILTIN_SNIPPETS.filter(
    (snippet) => snippet.language === language || snippet.language === "javascript"
  );
}
