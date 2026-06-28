import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { AgentAttachmentPayload } from "../types/protocol";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface PendingAgentAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
  previewUri?: string;
  kind: "image" | "document";
}

function createAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function guessMimeType(name: string, fallback: string): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    default:
      return fallback || "application/octet-stream";
  }
}

function estimateBase64Size(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

function toPendingAttachment(input: {
  name: string;
  mimeType: string;
  base64: string;
  previewUri?: string;
  kind: "image" | "document";
}): PendingAgentAttachment {
  const size = estimateBase64Size(input.base64);
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`"${input.name}" is too large (max 5 MB)`);
  }

  return {
    id: createAttachmentId(),
    name: input.name,
    mimeType: input.mimeType,
    size,
    data: input.base64,
    previewUri: input.previewUri,
    kind: input.kind,
  };
}

async function ensureMediaLibraryPermission(): Promise<boolean> {
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (result.granted) {
    return true;
  }
  Alert.alert("Permission needed", "Allow photo library access to attach images.");
  return false;
}

async function ensureCameraPermission(): Promise<boolean> {
  const result = await ImagePicker.requestCameraPermissionsAsync();
  if (result.granted) {
    return true;
  }
  Alert.alert("Permission needed", "Allow camera access to take photos.");
  return false;
}

export async function pickPhotoFromLibrary(): Promise<PendingAgentAttachment | null> {
  if (!(await ensureMediaLibraryPermission())) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    base64: true,
    quality: 0.85,
  });

  if (result.canceled || !result.assets[0]?.base64) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = asset.base64;
  if (!base64) {
    return null;
  }

  const name = asset.fileName || `photo-${Date.now()}.jpg`;
  const mimeType = asset.mimeType || guessMimeType(name, "image/jpeg");

  return toPendingAttachment({
    name,
    mimeType,
    base64,
    previewUri: asset.uri,
    kind: "image",
  });
}

export async function takePhoto(): Promise<PendingAgentAttachment | null> {
  if (!(await ensureCameraPermission())) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.85,
  });

  if (result.canceled || !result.assets[0]?.base64) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = asset.base64;
  if (!base64) {
    return null;
  }

  const name = asset.fileName || `camera-${Date.now()}.jpg`;
  const mimeType = asset.mimeType || guessMimeType(name, "image/jpeg");

  return toPendingAttachment({
    name,
    mimeType,
    base64,
    previewUri: asset.uri,
    kind: "image",
  });
}

export async function pickDocument(): Promise<PendingAgentAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    base64: true,
    multiple: false,
    type: Platform.OS === "ios" ? "*/*" : "*/*",
  });

  if (result.canceled || !result.assets[0]?.base64) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = asset.base64;
  if (!base64) {
    return null;
  }

  const name = asset.name || `document-${Date.now()}`;
  const mimeType = asset.mimeType || guessMimeType(name, "application/octet-stream");
  const isImage = mimeType.startsWith("image/");

  return toPendingAttachment({
    name,
    mimeType,
    base64,
    previewUri: isImage ? asset.uri : undefined,
    kind: isImage ? "image" : "document",
  });
}

export function showAttachmentPicker(
  onPick: (attachment: PendingAgentAttachment) => void
): void {
  Alert.alert("Attach file", "Choose what to attach to your prompt", [
    {
      text: "Photo library",
      onPress: () => {
        void pickPhotoFromLibrary().then((attachment) => {
          if (attachment) onPick(attachment);
        });
      },
    },
    {
      text: "Take photo",
      onPress: () => {
        void takePhoto().then((attachment) => {
          if (attachment) onPick(attachment);
        });
      },
    },
    {
      text: "Document",
      onPress: () => {
        void pickDocument().then((attachment) => {
          if (attachment) onPick(attachment);
        });
      },
    },
    { text: "Cancel", style: "cancel" },
  ]);
}

export function toWirePayload(
  attachments: PendingAgentAttachment[]
): AgentAttachmentPayload[] {
  return attachments.map(({ id, name, mimeType, size, data }) => ({
    id,
    name,
    mimeType,
    size,
    data,
  }));
}
