import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { ThemeColors } from "../theme/colors";

interface Props {
  visible: boolean;
  subtitle?: string;
}

function loopTiming(
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing = Easing.inOut(Easing.ease)
) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue,
        duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }),
    ])
  );
}

export function CookingBanner({ visible, subtitle }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles((c) => createStyles(c, isDark));

  const pulse = useRef(new Animated.Value(0)).current;
  const panTilt = useRef(new Animated.Value(0)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const steam1 = useRef(new Animated.Value(0)).current;
  const steam2 = useRef(new Animated.Value(0)).current;
  const steam3 = useRef(new Animated.Value(0)).current;
  const steam4 = useRef(new Animated.Value(0)).current;
  const bit1 = useRef(new Animated.Value(0)).current;
  const bit2 = useRef(new Animated.Value(0)).current;
  const bit3 = useRef(new Animated.Value(0)).current;
  const led = useRef(new Animated.Value(0.35)).current;

  const steamAnims = useMemo(
    () => [
      { value: steam1, delay: 0, label: "01" },
      { value: steam2, delay: 280, label: ">>" },
      { value: steam3, delay: 560, label: "10" },
      { value: steam4, delay: 840, label: "//" },
    ],
    [steam1, steam2, steam3, steam4]
  );

  useEffect(() => {
    if (!visible) return;

    const animations: Animated.CompositeAnimation[] = [
      loopTiming(pulse, 1, 1100),
      loopTiming(panTilt, 1, 1600, Easing.inOut(Easing.sin)),
      loopTiming(glow, 1, 1400),
      Animated.loop(
        Animated.timing(ringSpin, {
          toValue: 1,
          duration: 4800,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(scan, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(led, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
          }),
          Animated.timing(led, {
            toValue: 0.3,
            duration: 420,
            useNativeDriver: true,
          }),
        ])
      ),
    ];

    const makeSteam = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const makeBit = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

    for (const anim of animations) {
      anim.start();
    }
    for (const item of steamAnims) {
      makeSteam(item.value, item.delay).start();
    }
    makeBit(bit1, 0).start();
    makeBit(bit2, 300).start();
    makeBit(bit3, 600).start();

    return () => {
      pulse.stopAnimation();
      panTilt.stopAnimation();
      ringSpin.stopAnimation();
      scan.stopAnimation();
      glow.stopAnimation();
      progress.stopAnimation();
      steam1.stopAnimation();
      steam2.stopAnimation();
      steam3.stopAnimation();
      steam4.stopAnimation();
      bit1.stopAnimation();
      bit2.stopAnimation();
      bit3.stopAnimation();
      led.stopAnimation();
    };
  }, [
    visible,
    pulse,
    panTilt,
    ringSpin,
    scan,
    glow,
    progress,
    steamAnims,
    steam1,
    steam2,
    steam3,
    steam4,
    bit1,
    bit2,
    bit3,
    led,
  ]);

  if (!visible) return null;

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  const panRotate = panTilt.interpolate({
    inputRange: [0, 1],
    outputRange: ["-7deg", "7deg"],
  });

  const panBob = panTilt.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -3, 0],
  });

  const ringRotate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  const scanY = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 72],
  });

  const progressX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 220],
  });

  const steamStyle = (value: Animated.Value, drift: number) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.15, 0.7, 1],
      outputRange: [0, 0.95, 0.45, 0],
    }),
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [10, -26],
        }),
      },
      {
        translateX: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, drift],
        }),
      },
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.75, 1.15],
        }),
      },
    ],
  });

  const bitOpacity = (value: Animated.Value) =>
    value.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.25, 1, 0.25],
    });

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({ length: 5 }).map((_, index) => (
          <View key={`h-${index}`} style={[styles.gridLineH, { top: 12 + index * 18 }]} />
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={`v-${index}`} style={[styles.gridLineV, { left: 18 + index * 56 }]} />
        ))}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[styles.scanLine, { transform: [{ translateY: scanY }] }]}
      />

      <View style={styles.inner}>
        <View style={styles.topMeta}>
          <View style={styles.statusPill}>
            <Animated.View style={[styles.led, { opacity: led }]} />
            <Text style={styles.statusText}>AGENT RUNTIME</Text>
          </View>
          <Text style={styles.hexLabel}>0xCOOK</Text>
        </View>

        <View style={styles.stage}>
          <Animated.View
            style={[
              styles.orbitRing,
              { transform: [{ rotate: ringRotate }] },
            ]}
          >
            <View style={[styles.orbitNode, styles.orbitNodeA]} />
            <View style={[styles.orbitNode, styles.orbitNodeB]} />
            <View style={[styles.orbitNode, styles.orbitNodeC]} />
          </Animated.View>

          <View style={styles.steamRow}>
            {steamAnims.map((item, index) => (
              <Animated.Text
                key={item.label}
                style={[
                  styles.steamBit,
                  steamStyle(item.value, index % 2 === 0 ? -8 : 10),
                ]}
              >
                {item.label}
              </Animated.Text>
            ))}
          </View>

          <Animated.View
            style={{
              transform: [{ translateY: panBob }, { rotate: panRotate }],
            }}
          >
            <View style={styles.panHalo}>
              <Text style={styles.emoji}>🍳</Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Titus is Cooking</Text>
          <View style={styles.bits}>
            <Animated.Text style={[styles.bit, { opacity: bitOpacity(bit1) }]}>
              .
            </Animated.Text>
            <Animated.Text style={[styles.bit, { opacity: bitOpacity(bit2) }]}>
              .
            </Animated.Text>
            <Animated.Text style={[styles.bit, { opacity: bitOpacity(bit3) }]}>
              .
            </Animated.Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          {subtitle ?? "Running on your PC — safe to leave the app"}
        </Text>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressShine,
              { transform: [{ translateX: progressX }] },
            ]}
          />
          <View style={[styles.progressSeg, { backgroundColor: colors.accent }]} />
          <View style={[styles.progressSeg, { opacity: 0.55 }]} />
          <View style={[styles.progressSeg, { opacity: 0.3 }]} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerCode}>{"{ pan: egg, mode: agent }"}</Text>
          <Text style={styles.footerCode}>compiling…</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const frame = isDark ? "#0b1220" : colors.surfaceElevated;
  const accentSoft = `${colors.accent}33`;
  const warnSoft = `${colors.warning}40`;

  return {
    wrap: {
      marginBottom: 10,
      borderRadius: 16,
      overflow: "hidden" as const,
      borderWidth: 1,
      borderColor: accentSoft,
      backgroundColor: frame,
    },
    glow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.accent,
    },
    gridOverlay: {
      ...StyleSheet.absoluteFillObject,
      opacity: isDark ? 0.22 : 0.12,
    },
    gridLineH: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.accent,
    },
    gridLineV: {
      position: "absolute" as const,
      top: 0,
      bottom: 0,
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.accent,
    },
    scanLine: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      height: 18,
      backgroundColor: colors.accent,
      opacity: 0.12,
    },
    inner: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center" as const,
    },
    topMeta: {
      width: "100%" as const,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: 6,
    },
    statusPill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: warnSoft,
      backgroundColor: `${colors.warning}14`,
    },
    led: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: colors.warning,
    },
    statusText: {
      color: colors.warning,
      fontSize: 10,
      fontWeight: "800" as const,
      letterSpacing: 1.1,
    },
    hexLabel: {
      color: colors.accent,
      fontSize: 10,
      fontWeight: "700" as const,
      fontVariant: ["tabular-nums" as const],
      letterSpacing: 0.8,
      opacity: 0.85,
    },
    stage: {
      width: 108,
      height: 92,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: 2,
    },
    orbitRing: {
      position: "absolute" as const,
      width: 86,
      height: 86,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.accent}55`,
      borderStyle: "dashed" as const,
    },
    orbitNode: {
      position: "absolute" as const,
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.accent,
    },
    orbitNodeA: {
      top: -3,
      left: "50%" as const,
      marginLeft: -3,
    },
    orbitNodeB: {
      right: -3,
      top: "50%" as const,
      marginTop: -3,
      opacity: 0.7,
    },
    orbitNodeC: {
      bottom: -3,
      left: "28%" as const,
      opacity: 0.5,
    },
    steamRow: {
      position: "absolute" as const,
      top: 2,
      flexDirection: "row" as const,
      gap: 10,
      height: 28,
      zIndex: 2,
    },
    steamBit: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "800" as const,
      letterSpacing: 0.5,
      fontVariant: ["tabular-nums" as const],
    },
    panHalo: {
      width: 54,
      height: 54,
      borderRadius: 999,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: `${colors.warning}18`,
      borderWidth: 1,
      borderColor: warnSoft,
    },
    emoji: {
      fontSize: 30,
    },
    titleRow: {
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      marginTop: 2,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800" as const,
      letterSpacing: 0.2,
    },
    bits: {
      flexDirection: "row" as const,
      marginBottom: 1,
      marginLeft: 1,
    },
    bit: {
      color: colors.accent,
      fontSize: 22,
      fontWeight: "900" as const,
      lineHeight: 22,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
      textAlign: "center" as const,
      lineHeight: 16,
    },
    progressTrack: {
      marginTop: 10,
      width: "100%" as const,
      height: 4,
      borderRadius: 999,
      overflow: "hidden" as const,
      backgroundColor: `${colors.accent}22`,
      flexDirection: "row" as const,
      gap: 3,
      paddingHorizontal: 2,
      alignItems: "center" as const,
    },
    progressSeg: {
      flex: 1,
      height: 2,
      borderRadius: 999,
      backgroundColor: colors.accent,
    },
    progressShine: {
      position: "absolute" as const,
      width: 64,
      height: 4,
      backgroundColor: "#ffffff",
      opacity: 0.35,
    },
    footerRow: {
      marginTop: 8,
      width: "100%" as const,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
    },
    footerCode: {
      color: colors.textMuted,
      fontSize: 10,
      letterSpacing: 0.3,
      opacity: 0.8,
    },
  };
}
