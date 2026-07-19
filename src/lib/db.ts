// SERVER-ONLY: Supabase client on the service role key. RLS has no policies,
// so this client is the single data consumer (docs/architecture.md). The
// server-only import makes a client-component import a build error instead
// of a convention (hard rule 5).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export type EntryKind = "screenshot" | "text" | "voice" | "link" | "video";
export type EntryStatus = "captured" | "analyzed" | "analysis_failed";
export type AnalysisLayer = "form_inspiration" | "topic_relevant";

export interface Analysis {
  format_type: string;
  hook_style: string;
  tone: string;
  topic_tags: string[];
  why_it_works: string;
  layer: AnalysisLayer;
  one_line_summary: string;
}

export interface Entry {
  id: string;
  created_at: string;
  telegram_message_id: number | null;
  confirm_message_id: number | null;
  telegram_file_id: string | null;
  mime_type: string | null;
  media_group_id: string | null;
  kind: EntryKind;
  raw_text: string | null;
  transcript: string | null;
  media_path: string | null;
  source_url: string | null;
  annotation_of: string | null;
  analysis: Analysis | null;
  analyzed_at: string | null;
  status: EntryStatus;
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  client ??= createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  return client;
}
