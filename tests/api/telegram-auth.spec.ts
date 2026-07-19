// Contract tests for the webhook auth paths (testing-strategy: auth/RLS
// paths get Vitest coverage; LLM output gets none). Pure — no network, no
// database, no credentials: store/telegram/analyze/commands are mocked and
// env vars are plain test values.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  recordUpdate: vi.fn(async () => true),
  insertEntry: vi.fn(async () => ({ id: "entry-1" })),
  setConfirmMessageId: vi.fn(async () => undefined),
  findEntryByMessageId: vi.fn(async () => null),
  findAlbumRoot: vi.fn(async () => null),
  findRecentMediaEntry: vi.fn(async () => null),
}));

vi.mock("@/lib/telegram", () => ({
  sendMessage: vi.fn(async () => 111),
}));

vi.mock("@/lib/analyze", () => ({
  processEntry: vi.fn(async () => undefined),
}));

vi.mock("@/lib/commands", () => ({
  handleCommand: vi.fn(async () => ({ background: null })),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: vi.fn(),
}));

import { POST } from "@/app/api/telegram/route";
import * as store from "@/lib/store";
import * as telegram from "@/lib/telegram";

const SECRET = "test-secret";
const CHAT_ID = "12345";

function makeRequest(body: unknown, secret?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret !== undefined) {
    headers["x-telegram-bot-api-secret-token"] = secret;
  }
  return new Request("http://localhost/api/telegram", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function textUpdate(updateId: number, chatId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      chat: { id: chatId },
      text: "observatie over een sterke hook",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(store.recordUpdate).mockResolvedValue(true);
  process.env.TELEGRAM_SECRET_TOKEN = SECRET;
  process.env.ALLOWED_CHAT_ID = CHAT_ID;
});

describe("webhook auth contract", () => {
  it("returns 401 on a wrong or missing secret header", async () => {
    const wrong = await POST(makeRequest(textUpdate(1, 12345), "wrong"));
    expect(wrong.status).toBe(401);

    const missing = await POST(makeRequest(textUpdate(1, 12345)));
    expect(missing.status).toBe(401);

    expect(store.recordUpdate).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("silently ignores messages from a non-allowlisted chat", async () => {
    const res = await POST(makeRequest(textUpdate(2, 99999), SECRET));
    expect(res.status).toBe(200);
    // Allowlist sits before dedupe: foreign chats leave zero database traces.
    expect(store.recordUpdate).not.toHaveBeenCalled();
    expect(store.insertEntry).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("skips processing on a duplicate update_id (Telegram retry)", async () => {
    vi.mocked(store.recordUpdate).mockResolvedValue(false);
    const res = await POST(makeRequest(textUpdate(3, 12345), SECRET));
    expect(res.status).toBe(200);
    expect(store.recordUpdate).toHaveBeenCalledWith(3);
    expect(store.insertEntry).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("captures a fresh message (positive control for the deny paths)", async () => {
    const res = await POST(makeRequest(textUpdate(4, 12345), SECRET));
    expect(res.status).toBe(200);
    expect(store.recordUpdate).toHaveBeenCalledWith(4);
    expect(store.insertEntry).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(store.setConfirmMessageId).toHaveBeenCalledWith("entry-1", 111);
  });
});
