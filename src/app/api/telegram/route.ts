// Telegram webhook. Order is deliberate: secret (401) -> parse -> allowlist
// (silent 200) -> atomic dedupe -> command/capture -> ack < 2 s -> heavy work
// in waitUntil. Capture never fails because analysis fails (hard rule 1),
// and a failure AFTER the dedupe insert rolls that insert back so Telegram's
// retry is not swallowed.
import { timingSafeEqual } from "crypto";
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import {
  confirmText,
  isUnsupportedMedia,
  planCapture,
  tooLargeText,
  type CapturePlan,
} from "@/lib/capture";
import { handleCommand } from "@/lib/commands";
import { processEntry, transcribeAnnotation } from "@/lib/analyze";
import { sendMessage, type TgMessage, type TgUpdate } from "@/lib/telegram";
import {
  findAlbumRoot,
  findEntryByMessageId,
  findRecentMediaEntry,
  insertEntry,
  recordUpdate,
  removeUpdate,
  setConfirmMessageId,
} from "@/lib/store";

// Fluid compute allows 300 s; the PRD said 60, but the video pipeline
// (download + Gemini Files poll + Claude) plus a parent re-analysis does not
// reliably fit in that — see docs/decisions.md.
export const maxDuration = 300;

function ok(): Response {
  return Response.json({ ok: true });
}

function secretMatches(candidate: string | null): boolean {
  if (candidate === null) {
    return false;
  }
  const a = Buffer.from(candidate);
  const b = Buffer.from(env("TELEGRAM_SECRET_TOKEN"));
  return a.length === b.length && timingSafeEqual(a, b);
}

interface AnnotationLink {
  target: string | null;
  // Voice/text annotations are absorbed into the parent (no standalone
  // analysis); album siblings stay full entries.
  absorbed: boolean;
}

async function resolveAnnotation(
  msg: TgMessage,
  plan: CapturePlan,
): Promise<AnnotationLink> {
  if (msg.reply_to_message) {
    const found = await findEntryByMessageId(msg.reply_to_message.message_id);
    if (found) {
      // A reply on a note's confirmation must land on the note's parent,
      // and absorbed notes must never become analysis targets themselves.
      return {
        target: found.annotationOf ?? found.id,
        absorbed: plan.kind === "text" || plan.kind === "voice",
      };
    }
    // Explicit reply that matches no entry (e.g. reply on a /stats message):
    // store as a regular entry, do NOT fall through to the recency window.
    return { target: null, absorbed: false };
  }
  if (plan.mediaGroupId) {
    const root = await findAlbumRoot(plan.mediaGroupId);
    if (root) {
      return { target: root, absorbed: false };
    }
  }
  if (plan.kind === "voice" || plan.kind === "text") {
    const recent = await findRecentMediaEntry();
    if (recent) {
      return { target: recent, absorbed: true };
    }
  }
  return { target: null, absorbed: false };
}

export async function POST(req: Request): Promise<Response> {
  // Non-null once the dedupe row is ours AND no entry exists yet — the
  // window in which an error must roll the dedupe back.
  let compensateUpdateId: number | null = null;
  try {
    if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"))) {
      return new Response(null, { status: 401 });
    }

    let update: TgUpdate;
    try {
      update = (await req.json()) as TgUpdate;
    } catch {
      // Malformed body: acknowledge, never let Telegram retry-loop on junk.
      return ok();
    }

    const msg = update.message;
    if (
      !msg?.chat ||
      !Number.isInteger(update.update_id) ||
      !Number.isInteger(msg.message_id)
    ) {
      // Edited messages, channel posts, malformed payloads: silently ignored.
      return ok();
    }
    // String compare on purpose: negative group ids, no precision surprises.
    if (String(msg.chat.id) !== env("ALLOWED_CHAT_ID")) {
      return ok();
    }

    if (!(await recordUpdate(update.update_id))) {
      return ok();
    }
    compensateUpdateId = update.update_id;

    const text = msg.text?.trim() ?? "";
    if (text.startsWith("/")) {
      const result = await handleCommand(text, msg.chat.id);
      compensateUpdateId = null;
      if (result.background) {
        waitUntil(result.background);
      }
      return ok();
    }

    const plan = planCapture(msg);
    if (!plan) {
      compensateUpdateId = null;
      if (isUnsupportedMedia(msg)) {
        await sendMessage(
          msg.chat.id,
          "Dit type kan ik niet opslaan. Stuur een screenshot, tekst, voice note, link of video.",
          msg.message_id,
        );
      }
      return ok();
    }
    if (plan.tooLarge) {
      compensateUpdateId = null;
      await sendMessage(msg.chat.id, tooLargeText(plan), msg.message_id);
      return ok();
    }

    const { target, absorbed } = await resolveAnnotation(msg, plan);
    const entry = await insertEntry({
      plan,
      telegramMessageId: msg.message_id,
      annotationOf: target,
      absorbed,
    });
    // Entry is durable: from here on, errors must NOT roll back the dedupe
    // (a retry would duplicate the entry) and must not become a 500.
    compensateUpdateId = null;

    try {
      const confirmId = await sendMessage(
        msg.chat.id,
        confirmText(plan, absorbed),
        msg.message_id,
      );
      await setConfirmMessageId(entry.id, confirmId);
    } catch (err) {
      // Confirmation is nice-to-have; the capture and the analysis are not.
      console.error(
        "[webhook] confirm failed:",
        err instanceof Error ? err.message : err,
      );
    }

    waitUntil(
      (async () => {
        if (absorbed) {
          // P1-fix: transcribe voice notes so their content reaches the
          // parent's re-analysis below.
          await transcribeAnnotation(entry.id);
        } else {
          await processEntry(entry.id);
        }
        if (target) {
          // Annotations and album siblings trigger parent re-analysis.
          await processEntry(target);
        }
      })(),
    );

    return ok();
  } catch (err) {
    // Generic 500, details server-side only. Roll back the dedupe insert
    // when the capture did not become durable, so Telegram's retry gets a
    // real second chance instead of being swallowed.
    console.error(
      "[webhook] error:",
      err instanceof Error ? err.message : err,
    );
    if (compensateUpdateId !== null) {
      await removeUpdate(compensateUpdateId).catch((rollbackErr) =>
        console.error(
          "[webhook] dedupe rollback failed:",
          rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
        ),
      );
    }
    return new Response(null, { status: 500 });
  }
}
