// Async analysis pipeline, runs inside waitUntil AFTER the webhook already
// replied. Hard rule 1: capture never fails because analysis fails — every
// error here ends as status 'analysis_failed' plus a server log, never as a
// thrown error towards the webhook response. Recovery: /analyse.
import { analyzeEntry } from "./claude";
import { transcribeInline, transcribeViaFilesApi } from "./gemini";
import { downloadTelegramFile } from "./telegram";
import {
  downloadMedia,
  getAnnotationTexts,
  getEntry,
  updateEntry,
  uploadMedia,
} from "./store";
import type { Entry } from "./db";

function extFor(entry: Entry): string {
  if (entry.kind === "screenshot") {
    return "jpg";
  }
  if (entry.kind === "voice") {
    return "ogg";
  }
  return "mp4";
}

function mimeFor(entry: Entry): string {
  if (entry.kind === "screenshot") {
    return "image/jpeg";
  }
  if (entry.kind === "voice") {
    return "audio/ogg";
  }
  return "video/mp4";
}

async function ensureMedia(entry: Entry): Promise<Uint8Array | null> {
  if (entry.kind === "text" || entry.kind === "link") {
    return null;
  }
  if (entry.media_path) {
    return downloadMedia(entry.media_path);
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

export async function processEntry(entryId: string): Promise<void> {
  let stage = "load";
  try {
    const entry = await getEntry(entryId);
    if (!entry) {
      return;
    }

    stage = "media";
    const bytes = await ensureMedia(entry);

    stage = "transcribe";
    let transcript = entry.transcript;
    if (!transcript && (entry.kind === "voice" || entry.kind === "video")) {
      if (!bytes) {
        throw new Error("no media bytes for transcription");
      }
      transcript =
        entry.kind === "voice"
          ? await transcribeInline(bytes, mimeFor(entry))
          : await transcribeViaFilesApi(bytes, mimeFor(entry));
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
