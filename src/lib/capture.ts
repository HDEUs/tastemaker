// Pure capture-planning logic: Telegram message in, storage intent out.
// No I/O here — everything testable without network or database.
import type { EntryKind } from "./db";
import type { TgMessage } from "./telegram";

// Telegram's bot API refuses getFile above 20 MB; we stop at 19 MB (PRD).
export const MAX_FILE_BYTES = 19 * 1024 * 1024;

export interface CapturePlan {
  kind: EntryKind;
  rawText: string | null;
  sourceUrl: string | null;
  fileId: string | null;
  mimeType: string | null;
  mediaGroupId: string | null;
  tooLarge: boolean;
}

const URL_RE = /https?:\/\/\S+/i;

function forwardPrefix(msg: TgMessage): string {
  const origin = msg.forward_origin;
  if (!origin) {
    return "";
  }
  const name =
    [origin.sender_user?.first_name, origin.sender_user?.last_name]
      .filter(Boolean)
      .join(" ") ||
    origin.sender_user_name ||
    origin.chat?.title ||
    origin.sender_chat?.title ||
    "";
  return name ? `[fwd: ${name}] ` : "[fwd] ";
}

export function planCapture(msg: TgMessage): CapturePlan | null {
  // Forward origin belongs on captions too, not only on plain text.
  const caption = msg.caption
    ? `${forwardPrefix(msg)}${msg.caption}`
    : null;

  if (msg.photo && msg.photo.length > 0) {
    // Telegram sorts photo sizes ascending; last one is the largest.
    const largest = msg.photo[msg.photo.length - 1];
    return {
      kind: "screenshot",
      rawText: caption,
      sourceUrl: null,
      fileId: largest.file_id,
      mimeType: "image/jpeg",
      mediaGroupId: msg.media_group_id ?? null,
      tooLarge: false,
    };
  }

  if (msg.voice) {
    return {
      kind: "voice",
      rawText: null,
      sourceUrl: null,
      fileId: msg.voice.file_id,
      mimeType: msg.voice.mime_type ?? "audio/ogg",
      mediaGroupId: null,
      tooLarge: (msg.voice.file_size ?? 0) > MAX_FILE_BYTES,
    };
  }

  const video = msg.video ?? msg.video_note;
  if (video) {
    return {
      kind: "video",
      rawText: caption,
      sourceUrl: null,
      fileId: video.file_id,
      mimeType: video.mime_type ?? "video/mp4",
      mediaGroupId: msg.media_group_id ?? null,
      tooLarge: (video.file_size ?? 0) > MAX_FILE_BYTES,
    };
  }

  if (msg.text && msg.text.trim().length > 0) {
    const text = `${forwardPrefix(msg)}${msg.text.trim()}`;
    const match = URL_RE.exec(msg.text);
    // "Primarily a URL": the message is the URL plus at most a few words.
    const isPrimarilyUrl =
      match !== null && msg.text.trim().length - match[0].length < 20;
    if (isPrimarilyUrl && match) {
      return {
        kind: "link",
        rawText: text,
        // Strip trailing punctuation that the greedy regex drags along,
        // e.g. "(https://x.nl/a)" or "https://x.nl/a."
        sourceUrl: match[0].replace(/[).,;:!?]+$/, ""),
        fileId: null,
        mimeType: null,
        mediaGroupId: null,
        tooLarge: false,
      };
    }
    return {
      kind: "text",
      rawText: text,
      sourceUrl: null,
      fileId: null,
      mimeType: null,
      mediaGroupId: null,
      tooLarge: false,
    };
  }

  // Stickers, locations, polls, etc.: not capture material.
  return null;
}

// True when the message carries a media type we deliberately do not store;
// the route replies instead of silently dropping it.
export function isUnsupportedMedia(msg: TgMessage): boolean {
  return Boolean(msg.document ?? msg.audio ?? msg.animation ?? msg.sticker);
}

export function tooLargeText(plan: CapturePlan): string {
  if (plan.kind === "voice") {
    return "Voice note te groot, stuur een kortere opname.";
  }
  return "Video te groot, stuur een screenshot + voice note";
}

// Confirmation copy: Dutch, short, no emoji (hard rule 6).
export function confirmText(
  plan: CapturePlan,
  isAnnotation: boolean,
): string {
  if (isAnnotation) {
    return "Opgeslagen als notitie bij je vorige entry.";
  }
  switch (plan.kind) {
    case "screenshot":
      return "Screenshot opgeslagen, analyse loopt.";
    case "voice":
      return "Voice note opgeslagen, transcriptie en analyse lopen.";
    case "video":
      return "Video opgeslagen, transcriptie en analyse lopen.";
    case "link":
      return "Link opgeslagen, analyse loopt.";
    case "text":
      return "Tekst opgeslagen, analyse loopt.";
  }
}
