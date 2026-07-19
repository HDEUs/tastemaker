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

// Compensation for the capture path: when something fails AFTER the dedupe
// insert but BEFORE the entry exists, the dedupe row must go away again —
// otherwise Telegram's retry is swallowed and the capture is lost forever.
export async function removeUpdate(updateId: number): Promise<void> {
  const { error } = await db()
    .from("telegram_updates")
    .delete()
    .eq("update_id", updateId);
  if (error) {
    throw new Error(`removeUpdate failed: ${error.message}`);
  }
}

export interface NewEntry {
  plan: CapturePlan;
  telegramMessageId: number;
  annotationOf: string | null;
  // Voice/text annotations are absorbed into the parent's context and never
  // analyzed standalone; they are stored as 'analyzed' right away.
  absorbed: boolean;
}

async function insertEntryRow(
  input: NewEntry,
  annotationOf: string | null,
): Promise<{ entry: Entry | null; albumConflict: boolean }> {
  const { data, error } = await db()
    .from("entries")
    .insert({
      telegram_message_id: input.telegramMessageId,
      telegram_file_id: input.plan.fileId,
      mime_type: input.plan.mimeType,
      media_group_id: input.plan.mediaGroupId,
      kind: input.plan.kind,
      raw_text: input.plan.rawText,
      source_url: input.plan.sourceUrl,
      annotation_of: annotationOf,
      ...(input.absorbed
        ? { status: "analyzed", analyzed_at: new Date().toISOString() }
        : {}),
    })
    .select()
    .single();
  if (error) {
    // Album-root race: a concurrent sibling won the unique root index
    // (entries_album_root_uidx). Caller re-resolves the root and retries.
    if (error.code === "23505" && input.plan.mediaGroupId && !annotationOf) {
      return { entry: null, albumConflict: true };
    }
    throw new Error(`insertEntry failed: ${error.message}`);
  }
  if (!data) {
    throw new Error("insertEntry failed: no row returned");
  }
  return { entry: data as Entry, albumConflict: false };
}

export async function insertEntry(input: NewEntry): Promise<Entry> {
  const first = await insertEntryRow(input, input.annotationOf);
  if (first.entry) {
    return first.entry;
  }
  const root = input.plan.mediaGroupId
    ? await findAlbumRoot(input.plan.mediaGroupId)
    : null;
  const retry = await insertEntryRow(input, root);
  if (!retry.entry) {
    throw new Error("insertEntry failed: album root conflict persisted");
  }
  return retry.entry;
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
// Returns the entry plus its annotation_of so the caller can resolve to the
// root (a reply on a note's confirmation must target the note's parent).
export async function findEntryByMessageId(
  messageId: number,
): Promise<{ id: string; annotationOf: string | null } | null> {
  // Runtime guard before interpolating into a PostgREST filter string:
  // this value comes straight from the webhook body (security-stance —
  // validate user-supplied fields before any service-role query).
  if (!Number.isInteger(messageId)) {
    return null;
  }
  const { data, error } = await db()
    .from("entries")
    .select("id, annotation_of")
    .or(
      `telegram_message_id.eq.${messageId},confirm_message_id.eq.${messageId}`,
    )
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`findEntryByMessageId failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return null;
  }
  const row = data[0] as { id: string; annotation_of: string | null };
  return { id: row.id, annotationOf: row.annotation_of };
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
  Pick<Entry, "kind" | "status" | "analysis" | "annotation_of">[]
> {
  const { data, error } = await db()
    .from("entries")
    .select("kind, status, analysis, annotation_of");
  if (error) {
    throw new Error(`listEntriesForStats failed: ${error.message}`);
  }
  return (data ?? []) as Pick<
    Entry,
    "kind" | "status" | "analysis" | "annotation_of"
  >[];
}

// Cheap existence check for /profiel's synchronous pre-check; the full read
// happens once, in the background run.
export async function countAnalyzedEntries(): Promise<number> {
  const { count, error } = await db()
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "analyzed")
    .not("analysis", "is", null);
  if (error) {
    throw new Error(`countAnalyzedEntries failed: ${error.message}`);
  }
  return count ?? 0;
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
