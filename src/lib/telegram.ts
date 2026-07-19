// Thin Telegram Bot API wrapper. All bot replies are Dutch, short, no emoji
// (hard rule 6) — callers pass the final text, this module only transports.
import { env } from "./env";

export interface TgChat {
  id: number;
}

export interface TgPhotoSize {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TgMedia {
  file_id: string;
  file_size?: number;
  mime_type?: string;
}

export interface TgForwardOrigin {
  type: string;
  sender_user?: { first_name?: string; last_name?: string };
  sender_user_name?: string;
  chat?: { title?: string };
  sender_chat?: { title?: string };
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  voice?: TgMedia;
  video?: TgMedia;
  video_note?: TgMedia;
  // Recognized only to reply "not supported" instead of silently dropping.
  document?: TgMedia;
  audio?: TgMedia;
  animation?: TgMedia;
  sticker?: { file_id: string };
  media_group_id?: string;
  reply_to_message?: { message_id: number };
  forward_origin?: TgForwardOrigin;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

const API = "https://api.telegram.org";
const TEXT_LIMIT = 4096;

async function call<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Scrub: never propagate the token-bearing URL from fetch errors.
    throw new Error(
      `Telegram ${method} request failed: ${
        err instanceof Error ? err.name : "unknown"
      }`,
    );
  }
  // The Bot API answers logical errors as JSON (ok:false, description) with
  // 4xx; infrastructure errors can be HTML. Read text once, then decide.
  const body = await res.text();
  let json: { ok?: boolean; result?: T; description?: string };
  try {
    json = JSON.parse(body) as typeof json;
  } catch {
    throw new Error(
      `Telegram ${method} HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  if (!json.ok || json.result === undefined) {
    throw new Error(
      `Telegram ${method} failed: ${json.description ?? res.status}`,
    );
  }
  return json.result;
}

// Sends a message, splitting anything over the 4096-char API limit on line
// boundaries. Returns the message_id of the FIRST sent message — stored as
// entries.confirm_message_id so replies to it can be linked back.
export async function sendMessage(
  chatId: number | string,
  text: string,
  replyTo?: number,
): Promise<number> {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TEXT_LIMIT) {
    let cut = rest.lastIndexOf("\n", TEXT_LIMIT);
    if (cut < TEXT_LIMIT / 2) cut = TEXT_LIMIT;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);

  let firstId: number | null = null;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].trim().length === 0) {
      // Telegram rejects empty messages; a split on a newline boundary can
      // produce a whitespace-only chunk.
      continue;
    }
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
    };
    if (firstId === null && replyTo !== undefined) {
      // reply_parameters is the current Bot API shape; sending must not
      // fail when the user already deleted their original message.
      payload.reply_parameters = {
        message_id: replyTo,
        allow_sending_without_reply: true,
      };
    }
    const msg = await call<TgMessage>("sendMessage", payload);
    if (firstId === null) {
      firstId = msg.message_id;
    }
  }
  if (firstId === null) {
    throw new Error("sendMessage produced no message");
  }
  return firstId;
}

export async function downloadTelegramFile(
  fileId: string,
): Promise<Uint8Array> {
  const file = await call<{ file_path?: string }>("getFile", {
    file_id: fileId,
  });
  if (!file.file_path) {
    throw new Error("getFile returned no file_path");
  }
  let res: Response;
  try {
    res = await fetch(
      `${API}/file/bot${env("TELEGRAM_BOT_TOKEN")}/${file.file_path}`,
      { signal: AbortSignal.timeout(120_000) },
    );
  } catch (err) {
    throw new Error(
      `Telegram file download request failed: ${
        err instanceof Error ? err.name : "unknown"
      }`,
    );
  }
  if (!res.ok) {
    throw new Error(`Telegram file download failed: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
