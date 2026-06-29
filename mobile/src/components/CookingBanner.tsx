import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useThemedStyles } from "../hooks/useThemedStyles";

interface Props {
  visible: boolean;
  subtitle?: string;
}

export function CookingBanner({ visible, subtitle }: Props) {
  const styles = useThemedStyles((c) => ({
    wrap: {
      marginBottom: 10,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: `${c.warning}55`,
      backgroundColor: c.surface,
    },
    glow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.warning,
    },
    inner: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    steamRow: {
      flexDirection: "row",
      gap: 10,
      height: 20,
      marginBottom: 2,
    },
    steam: {
      color: c.textMuted,
      fontSize: 18,
      fontWeight: "700",
    },
    emoji: {
      fontSize: 28,
      marginBottom: 4,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    title: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
    dots: {
      flexDirection: "row",
      marginBottom: 2,
    },
    dot: {
      color: c.warning,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 22,
    },
    subtitle: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 4,
      textAlign: "center",
    },
  }));

  const pulse = useRef(new Animated.Value(0)).current;
  const steam1 = useRef(new Animated.Value(0)).current;
  const steam2 = useRef(new Animated.Value(0)).current;
  const steam3 = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!visible) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const makeSteam = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const makeDot = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: 350,
            useNativeDriver: true,
          }),
        ])
      );

    pulseLoop.start();
    glowLoop.start();
    makeSteam(steam1, 0).start();
    makeSteam(steam2, 450).start();
    makeSteam(steam3, 900).start();
    makeDot(dot1, 0).start();
    makeDot(dot2, 180).start();
    makeDot(dot3, 360).start();

    return () => {
      pulse.stopAnimation();
      glow.stopAnimation();
      steam1.stopAnimation();
      steam2.stopAnimation();
      steam3.stopAnimation();
      dot1.stopAnimation();
      dot2.stopAnimation();
      dot3.stopAnimation();
    };
  }, [visible, pulse, glow, steam1, steam2, steam3, dot1, dot2, dot3]);

  if (!visible) return null;

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  const steamStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.2, 1],
      outputRange: [0, 0.9, 0],
    }),
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [8, -18],
        }),
      },
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.7, 1.2],
        }),
      },
    ],
  });

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
      <View style={styles.inner}>
        <View style={styles.steamRow}>
          <Animated.Text style={[styles.steam, steamStyle(steam1)]}>~</Animated.Text>
          <Animated.Text style={[styles.steam, steamStyle(steam2)]}>~</Animated.Text>
          <Animated.Text style={[styles.steam, steamStyle(steam3)]}>~</Animated.Text>
        </View>
        <Text style={styles.emoji}>🍳</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Titus is Cooking</Text>
          <View style={styles.dots}>
            <Animated.Text style={[styles.dot, { opacity: dot1 }]}>.</Animated.Text>
            <Animated.Text style={[styles.dot, { opacity: dot2 }]}>.</Animated.Text>
            <Animated.Text style={[styles.dot, { opacity: dot3 }]}>.</Animated.Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {subtitle ?? "Fixing things on your PC — hang tight"}
        </Text>
      </View>
    </Animated.View>
  );
}
