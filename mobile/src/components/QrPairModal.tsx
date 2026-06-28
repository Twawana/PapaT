import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { parsePairQrData } from "../services/credentials";

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (host: string, port: number, code: string) => void;
  onError: (message: string) => void;
}

export function QrPairModal({ visible, onClose, onScanned, onError }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  const handleBarcode = ({ data }: { data: string }) => {
    if (locked) return;

    const payload = parsePairQrData(data);
    if (!payload) {
      onError("Invalid PapaT QR code");
      return;
    }

    if (payload.expiresAt && payload.expiresAt <= Date.now() - 60_000) {
      onError("QR code expired — check the latest code on your PC terminal");
      return;
    }

    setLocked(true);
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
          Point your camera at the QR code shown in the PapaT host terminal on your PC.
        </Text>

        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Camera access is needed to scan the pairing QR code.
            </Text>
            <Pressable style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Allow camera</Text>
            </Pressable>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#010409",
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
    color: "#f0f6fc",
    fontSize: 18,
    fontWeight: "700",
  },
  close: {
    color: "#58a6ff",
    fontWeight: "600",
  },
  hint: {
    color: "#8b949e",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
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
    color: "#c9d1d9",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: "#238636",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
