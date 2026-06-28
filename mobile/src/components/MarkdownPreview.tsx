import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface Props {
  markdown: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*.+?\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <Text key={key++} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <Text key={key++} style={styles.code}>
          {token.slice(1, -1)}
        </Text>
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

export function MarkdownPreview({ markdown }: Props) {
  const lines = markdown.split(/\r?\n/);

  return (
    <ScrollView style={styles.container}>
      {lines.map((line, index) => {
        if (line.startsWith("# ")) {
          return (
            <Text key={index} style={styles.h1}>
              {line.slice(2)}
            </Text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <Text key={index} style={styles.h2}>
              {line.slice(3)}
            </Text>
          );
        }
        if (line.startsWith("```")) {
          return (
            <View key={index} style={styles.codeBlock}>
              <Text style={styles.codeBlockText}>{line.replace(/```/g, "")}</Text>
            </View>
          );
        }
        if (!line.trim()) {
          return <View key={index} style={styles.spacer} />;
        }
        return (
          <Text key={index} style={styles.paragraph}>
            {renderInline(line)}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    padding: 12,
  },
  h1: {
    color: "#f0f6fc",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  h2: {
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  paragraph: {
    color: "#c9d1d9",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 6,
  },
  bold: {
    fontWeight: "700",
    color: "#f0f6fc",
  },
  code: {
    fontFamily: "monospace",
    backgroundColor: "#161b22",
    color: "#ffa657",
  },
  codeBlock: {
    backgroundColor: "#161b22",
    borderRadius: 6,
    padding: 8,
    marginVertical: 4,
  },
  codeBlockText: {
    color: "#c9d1d9",
    fontFamily: "monospace",
    fontSize: 12,
  },
  spacer: {
    height: 8,
  },
});
