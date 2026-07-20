// Async analysis pipeline, runs inside waitUntil AFTER the webhook already
// replied. Hard rule 1: capture never fails because analysis fails — every
// error here ends as status 'analysis_failed' plus a server log, never as a
// thrown error towards the webhook response. Recovery: /analyse.
import { analyzeEntry } from "./claude";
import { isYoutubeUrl } from "./capture";
import {
  describeYoutubeVideo,
  transcribeInline,
  transcribeViaFilesApi,
} from "./gemini";
import { downloadTelegramFile } from "./telegram";
import {
  downloadMedia,
  getAnnotationTexts,
  getEntry,
  updateEntry,
  uploadMedia,
} from "./store";
import type { Entry } from "./db";

// Telegram reports the real mime (webm/mov/mp4/ogg vary); fall back on the
// kind only when it is missing.
function mimeFor(entry: Entry): string {
  if (entry.mime_type) {
    return entry.mime_type;
  }
  if (entry.kind === "screenshot") {
    return "image/jpeg";
  }
  if (entry.kind === "voice") {
    return "audio/ogg";
  }
  return "video/mp4";
}

function extFor(entry: Entry): string {
  const sub = mimeFor(entry).split("/")[1] ?? "";
  const known: Record<string, string> = {
    jpeg: "jpg",
    ogg: "ogg",
    mpeg: "mp3",
    mp4: entry.kind === "voice" ? "m4a" : "mp4",
    webm: "webm",
    quicktime: "mov",
  };
  return known[sub] ?? (entry.kind === "screenshot" ? "jpg" : "bin");
}

// Downloads/persists media as needed. needBytes=false skips the (up to
// 19 MB) fetch when the caller only needs the entry to be durable — but a
// missing media_path is always repaired, so /analyse can recover captures
// that were cut off before the upload.
async function ensureMedia(
  entry: Entry,
  needBytes: boolean,
): Promise<Uint8Array | null> {
  if (entry.kind === "text" || entry.kind === "link") {
    return null;
  }
  if (entry.media_path) {
    return needBytes ? downloadMedia(entry.media_path) : null;
  }
  if (!entry.telegram_file_id) {
    throw new Error("media entry without telegram_file_id");
  }
  const bytes = await downloadTelegramFile(entry.telegram_file_id);
  const mediaPath = `${entry.id}.${extFor(entry)}`;
  await uploadMedia(mediaPath, bytes, mimeFor(entry));
  await updateEntry(entry.id, { media_path: mediaPath });
  return bytes;
}

// Inline base64 adds ~33%; stay well under Gemini's ~20 MB request cap.
const INLINE_AUDIO_LIMIT = 10 * 1024 * 1024;

async function transcribe(entry: Entry, bytes: Uint8Array): Promise<string> {
  const useFilesApi =
    entry.kind === "video" || bytes.byteLength > INLINE_AUDIO_LIMIT;
  return useFilesApi
    ? transcribeViaFilesApi(bytes, mimeFor(entry))
    : transcribeInline(bytes, mimeFor(entry));
}

// P1-fix: absorbed voice annotations are never analyzed standalone, but
// their AUDIO CONTENT must reach the parent's re-analysis. This runs the
// media+transcription half of the pipeline without the analysis half.
export async function transcribeAnnotation(entryId: string): Promise<void> {
  try {
    const entry = await getEntry(entryId);
    if (!entry || entry.kind !== "voice" || entry.transcript) {
      return;
    }
    const bytes = await ensureMedia(entry, true);
    if (!bytes) {
      throw new Error("no media bytes for annotation transcription");
    }
    const transcript = await transcribe(entry, bytes);
    if (!transcript) {
      console.error(`[analyze] empty annotation transcript, entry=${entryId}`);
      return;
    }
    await updateEntry(entryId, { transcript });
  } catch (err) {
    // The parent re-analysis still runs, just without this note's content.
    console.error(
      `[analyze] annotation transcription failed, entry=${entryId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function processEntry(entryId: string): Promise<void> {
  let stage = "load";
  try {
    const entry = await getEntry(entryId);
    if (!entry) {
      return;
    }

    stage = "media";
    const needBytes =
      entry.kind === "screenshot" ||
      ((entry.kind === "voice" || entry.kind === "video") &&
        !entry.transcript);
    const bytes = await ensureMedia(entry, needBytes);

    stage = "transcribe";
    let transcript = entry.transcript;
    if (!transcript && (entry.kind === "voice" || entry.kind === "video")) {
      if (!bytes) {
        throw new Error("no media bytes for transcription");
      }
      transcript = await transcribe(entry, bytes);
      if (!transcript) {
        // Empty transcript: keep the entry, mark failed (PRD edge case).
        await updateEntry(entry.id, { status: "analysis_failed" });
        console.error(
          `[analyze] empty transcript, entry=${entry.id} kind=${entry.kind}`,
        );
        return;
      }
      await updateEntry(entry.id, { transcript });
    }

    // YouTube link: let Gemini watch the video and use its description as the
    // transcript. A failure here is non-fatal — we still analyze the bare
    // link (a private/removed video should not get stuck failed).
    if (
      !transcript &&
      entry.kind === "link" &&
      entry.source_url &&
      isYoutubeUrl(entry.source_url)
    ) {
      stage = "youtube";
      try {
        const desc = await describeYoutubeVideo(entry.source_url);
        if (desc) {
          transcript = desc;
          await updateEntry(entry.id, { transcript });
        }
      } catch (err) {
        console.error(
          `[analyze] youtube describe failed, entry=${entry.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    stage = "analyze";
    const annotations = await getAnnotationTexts(entry.id);
    const analysis = await analyzeEntry({
      kind: entry.kind,
      rawText: entry.raw_text,
      transcript,
      sourceUrl: entry.source_url,
      imageBase64:
        entry.kind === "screenshot" && bytes
          ? Buffer.from(bytes).toString("base64")
          : null,
      annotations,
    });

    stage = "persist";
    await updateEntry(entry.id, {
      analysis,
      analyzed_at: new Date().toISOString(),
      status: "analyzed",
    });
  } catch (err) {
    // No inline retries, also not on 429/529 — /analyse is the recovery path.
    console.error(
      `[analyze] failed, entry=${entryId} stage=${stage}:`,
      err instanceof Error ? err.message : err,
    );
    await updateEntry(entryId, { status: "analysis_failed" }).catch(
      (updateErr) =>
        console.error(
          `[analyze] could not mark entry failed, entry=${entryId}:`,
          updateErr instanceof Error ? updateErr.message : updateErr,
        ),
    );
  }
}
