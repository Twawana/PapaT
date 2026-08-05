import React, { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { parsePairQrData } from "../services/credentials";

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (host: string, port: number, code: string) => void;
  onError: (message: string) => void;
}

export function QrPairModal({ visible, onClose, onScanned, onError }: Props) {
  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingTop: 48,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    title: {
      color: c.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    close: {
      color: c.link,
      fontWeight: "600",
    },
    hint: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    scanError: {
      color: c.errorText,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    camera: {
      flex: 1,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 24,
    },
    permissionBox: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    permissionText: {
      color: c.textSecondary,
      textAlign: "center",
      marginBottom: 16,
      lineHeight: 22,
    },
    permissionBtn: {
      backgroundColor: c.buttonSuccess,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 8,
      marginBottom: 12,
    },
    permissionBtnText: {
      color: c.onPrimary,
      fontWeight: "700",
    },
    settingsLink: {
      color: c.link,
      fontWeight: "600",
      marginTop: 8,
    },
  }));

  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLocked(false);
      setScanError(null);
    }
  }, [visible]);

  const lockBriefly = () => {
    setLocked(true);
    setTimeout(() => setLocked(false), 2000);
  };

  const showError = (message: string) => {
    setScanError(message);
    onError(message);
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (locked) return;

    const payload = parsePairQrData(data);
    if (!payload) {
      lockBriefly();
      showError("Invalid Titus QR code — scan the QR shown in the Titus desktop app");
      return;
    }

    // Allow ~2s clock skew; reject once truly expired.
    if (payload.expiresAt && payload.expiresAt + 2000 <= Date.now()) {
      lockBriefly();
      showError(
        "QR code expired — tap Refresh code in the Titus desktop app, then scan again"
      );
      return;
    }

    setLocked(true);
    setScanError(null);
    onScanned(payload.host, payload.port, payload.code.trim().toUpperCase());
    onClose();
    setTimeout(() => setLocked(false), 1500);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan PC pairing QR</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Point your camera at the QR code in the Titus desktop window on your PC.
          Phone and PC must be on the same Wi-Fi (not a guest/isolated network).
        </Text>

        {scanError ? <Text style={styles.scanError}>{scanError}</Text> : null}

        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Camera access is needed to scan the pairing QR code.
            </Text>
            <Pressable style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Allow camera</Text>
            </Pressable>
            {permission && !permission.canAskAgain ? (
              <Pressable onPress={() => void Linking.openSettings()}>
                <Text style={styles.settingsLink}>Open Settings</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcode}
          />
        )}
      </View>
    </Modal>
  );
}
