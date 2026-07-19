-- Tastebank v1 — initial schema
-- Run manually in the Supabase SQL editor (see README). Backward compatible:
-- creates only new objects, touches nothing existing.
-- Documented in docs/architecture.md; decisions in docs/decisions.md.

-- 1. Webhook dedupe: Telegram retries deliveries; update_id is globally
--    unique per bot, so a primary-key insert is the atomic gate.
create table if not exists telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

-- 2. Captured entries. Capture must never fail because analysis fails:
--    a row is written first with status 'captured'; async analysis moves it
--    to 'analyzed' or 'analysis_failed'.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  telegram_message_id bigint,
  -- message_id of the bot's own confirmation reply, so a user reply to that
  -- confirmation can be linked back to this entry (annotation flow)
  confirm_message_id bigint,
  -- Telegram file_id of the shared media, so /analyse can re-download when
  -- the original capture run was cut off before the storage upload
  telegram_file_id text,
  -- Actual mime type as reported by Telegram (webm/mov/mp4/ogg vary);
  -- transcription and storage contentType read this instead of guessing
  mime_type text,
  -- Telegram album id; entries 2+ of an album link to the first via
  -- annotation_of
  media_group_id text,
  kind text not null check (kind in ('screenshot','text','voice','link','video')),
  raw_text text,
  transcript text,
  media_path text,
  source_url text,
  annotation_of uuid references entries(id),
  analysis jsonb,
  analyzed_at timestamptz,
  status text not null default 'captured'
    check (status in ('captured','analyzed','analysis_failed'))
);

create index if not exists entries_created_at_idx on entries (created_at desc);
create index if not exists entries_status_idx on entries (status);
create index if not exists entries_media_group_idx on entries (media_group_id)
  where media_group_id is not null;
create index if not exists entries_annotation_of_idx on entries (annotation_of)
  where annotation_of is not null;

-- One album root per media_group: Telegram delivers album photos
-- near-simultaneously; without this, two concurrent inserts can both decide
-- they are the root. The second insert hits 23505 and retries as a sibling.
create unique index if not exists entries_album_root_uidx
  on entries (media_group_id)
  where media_group_id is not null and annotation_of is null;

-- 3. Versioned taste profiles (append-only; newest = current).
create table if not exists taste_profile (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  entry_count int not null,
  profile_md text not null
);

-- 4. RLS on, NO policies: only the service_role (server) can read/write;
--    anon and authenticated see nothing. This is deliberate — single-user
--    system, the API route is the only consumer.
alter table telegram_updates enable row level security;
alter table entries enable row level security;
alter table taste_profile enable row level security;

-- Storage: create the PRIVATE bucket "media" manually in the dashboard
-- (Storage > New bucket > name "media", public OFF). Not scripted here on
-- purpose: bucket creation is a one-time dashboard action (see README).
