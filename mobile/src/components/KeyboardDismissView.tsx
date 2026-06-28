import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Layout wrapper for screens that manage their own keyboard dismissal. */
export function KeyboardDismissView({ children, style }: Props) {
  return <View style={[styles.flex, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
