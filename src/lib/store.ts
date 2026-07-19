// SERVER-ONLY data access. Single seam between app logic and Supabase, so
// contract tests can mock this one module. Every function throws on database
// errors — callers decide whether that becomes a 500 (capture path: yes, so
// Telegram retries) or a logged failure (analysis path).
import { db, type Analysis, type Entry } from "./db";
import type { CapturePlan } from "./capture";

// Atomic dedupe: PK insert, duplicate = already handled. No select-then-insert
// (TOCTOU — Telegram retries arrive near-simultaneously). Returns true when
// this delivery is the first one.
export async function recordUpdate(updateId: number): Promise<boolean> {
  const { error } = await db()
    .from("telegram_updates")
    .insert({ update_id: updateId });
  if (error) {
    if (error.code === "23505") {
      return false;
    }
    throw new Error(`recordUpdate failed: ${error.message}`);
  }
  return true;
}

export interface NewEntry {
  plan: CapturePlan;
  telegramMessageId: number;
  annotationOf: string | null;
  // Voice/text annotations are absorbed into the parent's context and never
  // analyzed standalone; they are stored as 'analyzed' right away.
  absorbed: boolean;
}

export async function insertEntry(input: NewEntry): Promise<Entry> {
  const { data, error } = await db()
    .from("entries")
    .insert({
      telegram_message_id: input.telegramMessageId,
      telegram_file_id: input.plan.fileId,
      media_group_id: input.plan.mediaGroupId,
      kind: input.plan.kind,
      raw_text: input.plan.rawText,
      source_url: input.plan.sourceUrl,
      annotation_of: input.annotationOf,
      ...(input.absorbed
        ? { status: "analyzed", analyzed_at: new Date().toISOString() }
        : {}),
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`insertEntry failed: ${error?.message ?? "no row"}`);
  }
  return data as Entry;
}

export async function setConfirmMessageId(
  entryId: string,
  messageId: number,
): Promise<void> {
  const { error } = await db()
    .from("entries")
    .update({ confirm_message_id: messageId })
    .eq("id", entryId);
  if (error) {
    throw new Error(`setConfirmMessageId failed: ${error.message}`);
  }
}

export async function getEntry(entryId: string): Promise<Entry | null> {
  const { data, error } = await db()
    .from("entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (error) {
    throw new Error(`getEntry failed: ${error.message}`);
  }
  return (data as Entry | null) ?? null;
}

// Reply on the bot's confirmation OR on the user's own original message.
export async function findEntryByMessageId(
  messageId: number,
): Promise<string | null> {
  const { data, error } = await db()
    .from("entries")
    .select("id")
    .or(
      `telegram_message_id.eq.${messageId},confirm_message_id.eq.${messageId}`,
    )
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`findEntryByMessageId failed: ${error.message}`);
  }
  return data && data.length > 0 ? (data[0] as { id: string }).id : null;
}

// First entry of a Telegram album; entries 2+ link to it.
export async function findAlbumRoot(
  mediaGroupId: string,
): Promise<string | null> {
  const { data, error } = await db()
    .from("entries")
    .select("id")
    .eq("media_group_id", mediaGroupId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`findAlbumRoot failed: ${error.message}`);
  }
  return data && data.length > 0 ? (data[0] as { id: string }).id : null;
}

// Most recent media entry within the annotation window (5 minutes).
export async function findRecentMediaEntry(): Promise<string | null> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("entries")
    .select("id")
    .in("kind", ["screenshot", "video"])
    .is("annotation_of", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`findRecentMediaEntry failed: ${error.message}`);
  }
  return data && data.length > 0 ? (data[0] as { id: string }).id : null;
}

export async function updateEntry(
  entryId: string,
  patch: Partial<{
    media_path: string;
    transcript: string;
    analysis: Analysis;
    analyzed_at: string;
    status: Entry["status"];
  }>,
): Promise<void> {
  const { error } = await db().from("entries").update(patch).eq("id", entryId);
  if (error) {
    throw new Error(`updateEntry failed: ${error.message}`);
  }
}

// Text content of child annotations, oldest first, for the parent's
// analysis context.
export async function getAnnotationTexts(entryId: string): Promise<string[]> {
  const { data, error } = await db()
    .from("entries")
    .select("raw_text, transcript")
    .eq("annotation_of", entryId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`getAnnotationTexts failed: ${error.message}`);
  }
  return (data ?? [])
    .map(
      (row) =>
        (row as { raw_text: string | null; transcript: string | null })
          .raw_text ??
        (row as { transcript: string | null }).transcript ??
        "",
    )
    .filter((t) => t.length > 0);
}

export async function listEntriesForStats(): Promise<
  Pick<Entry, "kind" | "status" | "analysis">[]
> {
  const { data, error } = await db()
    .from("entries")
    .select("kind, status, analysis");
  if (error) {
    throw new Error(`listEntriesForStats failed: ${error.message}`);
  }
  return (data ?? []) as Pick<Entry, "kind" | "status" | "analysis">[];
}

export async function listRecentEntries(limit: number): Promise<Entry[]> {
  const { data, error } = await db()
    .from("entries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listRecentEntries failed: ${error.message}`);
  }
  return (data ?? []) as Entry[];
}

export async function listAnalyzedEntries(): Promise<Entry[]> {
  const { data, error } = await db()
    .from("entries")
    .select("*")
    .eq("status", "analyzed")
    .not("analysis", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`listAnalyzedEntries failed: ${error.message}`);
  }
  return (data ?? []) as Entry[];
}

// Failed entries plus stale 'captured' ones (waitUntil can be cut off by
// maxDuration before the status flips — see plan, risk 3).
export async function listRetryableEntries(limit: number): Promise<Entry[]> {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("entries")
    .select("*")
    .or(
      `status.eq.analysis_failed,and(status.eq.captured,created_at.lt.${staleBefore})`,
    )
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`listRetryableEntries failed: ${error.message}`);
  }
  return (data ?? []) as Entry[];
}

export async function insertProfile(
  entryCount: number,
  profileMd: string,
): Promise<void> {
  const { error } = await db()
    .from("taste_profile")
    .insert({ entry_count: entryCount, profile_md: profileMd });
  if (error) {
    throw new Error(`insertProfile failed: ${error.message}`);
  }
}

export async function uploadMedia(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await db()
    .storage.from("media")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) {
    throw new Error(`uploadMedia failed: ${error.message}`);
  }
}

export async function downloadMedia(path: string): Promise<Uint8Array> {
  const { data, error } = await db().storage.from("media").download(path);
  if (error || !data) {
    throw new Error(`downloadMedia failed: ${error?.message ?? "no data"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}
