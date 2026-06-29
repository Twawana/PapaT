import * as fs from "fs";
import * as path from "path";
import { AgentAttachmentPayload, AgentAttachmentRef, AgentChatMessage } from "../protocol";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_INLINE_CHARS = 12_000;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".sql",
  ".sh",
  ".ps1",
  ".bat",
  ".csv",
  ".log",
  ".env",
  ".ini",
  ".cfg",
]);

const IMAGE_MIME_PREFIX = "image/";

export interface ProcessedAttachment extends AgentAttachmentRef {
  textContent?: string;
}

export interface PreparedAgentUserMessage {
  displayText: string;
  cursorPrompt: string;
  attachmentRefs: AgentAttachmentRef[];
  openAiImages: Array<{ mimeType: string; dataUri: string }>;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]+/g, "_").trim();
  return base || "attachment";
}

function classifyAttachment(name: string, mimeType: string): AgentAttachmentRef["kind"] {
  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    return "image";
  }

  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith("text/")) {
    return "text";
  }

  return "document";
}

function isProbablyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) {
    return false;
  }
  return true;
}

function readInlineText(filePath: string, kind: AgentAttachmentRef["kind"]): string | undefined {
  if (kind !== "text") {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.length <= MAX_TEXT_INLINE_CHARS) {
      return raw;
    }
    return `${raw.slice(0, MAX_TEXT_INLINE_CHARS)}\n… [truncated]`;
  } catch {
    return undefined;
  }
}

export function validateAttachments(attachments: AgentAttachmentPayload[] | undefined): void {
  if (!attachments?.length) {
    return;
  }

  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments (max ${MAX_ATTACHMENTS})`);
  }

  let totalBytes = 0;

  for (const attachment of attachments) {
    if (!attachment.id || !attachment.name || !attachment.mimeType || !attachment.data) {
      throw new Error("Invalid attachment payload");
    }

    if (attachment.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${attachment.name}" is too large (max 5 MB)`);
    }

    totalBytes += attachment.size;
    if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
      throw new Error("Total attachment size exceeds 15 MB");
    }
  }
}

export function saveAttachments(
  sessionId: string,
  workspace: string,
  attachments: AgentAttachmentPayload[]
): ProcessedAttachment[] {
  if (!attachments.length) {
    return [];
  }

  const dir = path.join(workspace, ".titus", "attachments", sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const processed: ProcessedAttachment[] = [];

  for (const attachment of attachments) {
    const buffer = Buffer.from(attachment.data, "base64");
    if (buffer.length !== attachment.size && attachment.size > 0) {
      // Size from client is advisory; use decoded length if mismatch is small.
      if (Math.abs(buffer.length - attachment.size) > 16) {
        throw new Error(`Attachment "${attachment.name}" size mismatch`);
      }
    }

    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${attachment.name}" is too large (max 5 MB)`);
    }

    let kind = classifyAttachment(attachment.name, attachment.mimeType);
    if (kind === "text" && !isProbablyText(buffer)) {
      kind = "document";
    }

    const safeName = sanitizeFileName(attachment.name);
    const filePath = path.join(dir, `${attachment.id}-${safeName}`);
    fs.writeFileSync(filePath, buffer);

    const textContent = readInlineText(filePath, kind);

    processed.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: buffer.length,
      path: filePath,
      kind,
      textContent,
    });
  }

  return processed;
}

function formatAttachmentBlock(processed: ProcessedAttachment[], index: number): string {
  const item = processed[index]!;
  const header = `${index + 1}. ${item.name} (${item.kind}) — ${item.path}`;

  if (item.textContent) {
    return `${header}\n\`\`\`\n${item.textContent}\n\`\`\``;
  }

  if (item.kind === "image") {
    return `${header}\n(Image attached — inspect the file at this path.)`;
  }

  return `${header}\n(Binary document — open or process this file on the PC if needed.)`;
}

export function prepareAgentUserMessage(
  userMessage: string,
  processed: ProcessedAttachment[]
): PreparedAgentUserMessage {
  const trimmed = userMessage.trim();
  const attachmentRefs = processed.map(({ textContent: _text, ...ref }) => ref);

  if (processed.length === 0) {
    return {
      displayText: trimmed,
      cursorPrompt: trimmed,
      attachmentRefs,
      openAiImages: [],
    };
  }

  const attachmentSection = processed
    .map((_item, index) => formatAttachmentBlock(processed, index))
    .join("\n\n");

  const displayText = trimmed || "(attached files)";
  const cursorPrompt = [
    trimmed || "The user attached files from their phone. Use them as context.",
    "",
    "[Attachments from mobile]",
    attachmentSection,
  ].join("\n");

  const openAiImages = processed
    .filter((item) => item.kind === "image")
    .map((item) => {
      const data = fs.readFileSync(item.path).toString("base64");
      return {
        mimeType: item.mimeType,
        dataUri: `data:${item.mimeType};base64,${data}`,
      };
    });

  return {
    displayText: trimmed ? trimmed : `(attached ${processed.length} file${processed.length === 1 ? "" : "s"})`,
    cursorPrompt,
    attachmentRefs,
    openAiImages,
  };
}

export function readImageDataUri(filePath: string, mimeType: string): string | null {
  try {
    const data = fs.readFileSync(filePath).toString("base64");
    return `data:${mimeType};base64,${data}`;
  } catch {
    return null;
  }
}

export function preparedFromStoredUserMessage(
  message: AgentChatMessage
): PreparedAgentUserMessage {
  const refs = message.attachments ?? [];
  if (refs.length === 0) {
    const text = message.content.trim();
    return {
      displayText: text,
      cursorPrompt: text,
      attachmentRefs: [],
      openAiImages: [],
    };
  }

  const processed: ProcessedAttachment[] = refs.map((ref) => {
    let textContent: string | undefined;
    if (ref.kind === "text" && fs.existsSync(ref.path)) {
      try {
        textContent = fs.readFileSync(ref.path, "utf8").slice(0, MAX_TEXT_INLINE_CHARS);
      } catch {
        // ignore
      }
    }
    return { ...ref, textContent };
  });

  return prepareAgentUserMessage(message.content.trim(), processed);
}
