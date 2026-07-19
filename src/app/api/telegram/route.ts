// Telegram webhook. Order is deliberate: secret (401) -> parse -> allowlist
// (silent 200) -> atomic dedupe -> command/capture -> ack < 2 s -> heavy work
// in waitUntil. Capture never fails because analysis fails (hard rule 1).
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import { confirmText, planCapture, type CapturePlan } from "@/lib/capture";
import { handleCommand } from "@/lib/commands";
import { processEntry } from "@/lib/analyze";
import { sendMessage, type TgMessage, type TgUpdate } from "@/lib/telegram";
import {
  findAlbumRoot,
  findEntryByMessageId,
  findRecentMediaEntry,
  insertEntry,
  recordUpdate,
  setConfirmMessageId,
} from "@/lib/store";

export const maxDuration = 60;

function ok(): Response {
  return Response.json({ ok: true });
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
  const replyId = msg.reply_to_message?.message_id;
  if (replyId !== undefined) {
    const target = await findEntryByMessageId(replyId);
    if (target) {
      return {
        target,
        absorbed: plan.kind === "text" || plan.kind === "voice",
      };
    }
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
  try {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== env("TELEGRAM_SECRET_TOKEN")) {
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
    if (!msg?.chat || typeof update.update_id !== "number") {
      // Edited messages, channel posts, etc.: silently ignored.
      return ok();
    }
    // String compare on purpose: negative group ids, no precision surprises.
    if (String(msg.chat.id) !== env("ALLOWED_CHAT_ID")) {
      return ok();
    }

    if (!(await recordUpdate(update.update_id))) {
      return ok();
    }

    const text = msg.text?.trim() ?? "";
    if (text.startsWith("/")) {
      const result = await handleCommand(text, msg.chat.id);
      if (result.background) {
        waitUntil(result.background);
      }
      return ok();
    }

    const plan = planCapture(msg);
    if (!plan) {
      return ok();
    }
    if (plan.tooLarge) {
      await sendMessage(
        msg.chat.id,
        "Video te groot, stuur een screenshot + voice note",
        msg.message_id,
      );
      return ok();
    }

    const { target, absorbed } = await resolveAnnotation(msg, plan);
    const entry = await insertEntry({
      plan,
      telegramMessageId: msg.message_id,
      annotationOf: target,
      absorbed,
    });
    const confirmId = await sendMessage(
      msg.chat.id,
      confirmText(plan, absorbed),
      msg.message_id,
    );
    await setConfirmMessageId(entry.id, confirmId);

    waitUntil(
      (async () => {
        if (!absorbed) {
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
    // Generic 500, details server-side only. Telegram retries, which is
    // correct here: if the database was down, capture genuinely failed.
    console.error(
      "[webhook] error:",
      err instanceof Error ? err.message : err,
    );
    return new Response(null, { status: 500 });
  }
}
