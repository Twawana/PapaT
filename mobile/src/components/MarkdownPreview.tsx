import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  markdown: string;
}

export function MarkdownPreview({ markdown }: Props) {
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
    },
    h1: {
      color: c.textPrimary,
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 8,
    },
    h2: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 6,
    },
    paragraph: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 22,
      marginBottom: 6,
    },
    bold: {
      fontWeight: "700",
      color: c.textPrimary,
    },
    code: {
      fontFamily: "monospace",
      backgroundColor: c.surface,
      color: c.warning,
    },
    codeBlock: {
      backgroundColor: c.surface,
      borderRadius: 6,
      padding: 8,
      marginVertical: 4,
    },
    codeBlockText: {
      color: c.textSecondary,
      fontFamily: "monospace",
      fontSize: 12,
    },
    spacer: {
      height: 8,
    },
  }));

  const renderInline = (text: string): React.ReactNode[] => {
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
  };

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
