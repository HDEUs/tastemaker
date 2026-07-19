# Plan — Tastebank v1 (capture + analyse + /profiel)

- **Datum:** 2026-07-19 · **Type:** feat · **Bron:** owner-PRD (sessie 2026-07-19)
- **Scope-lock:** v1 = capture + analyse + /profiel. GEEN generatie, GEEN Buffer,
  GEEN frontend (root page = statisch "Tastebank running").
- **Gedelegeerde beslissingen** ("beslis zelf redelijk") → vastgelegd in
  `docs/decisions.md` (zie WP1).

## Architectuur in één zin

Telegram-webhook (`app/api/telegram/route.ts`) valideert → dedupet → slaat de
entry direct op → bevestigt < 2 s → doet al het zware werk (media-download,
Gemini-transcriptie, Claude-analyse) async via `waitUntil`; `/profiel`
synthetiseert alle geanalyseerde entries naar een versioned taste profile.

## Werkpakketten

### WP1 — Docs & decisions

Bestanden: `docs/plans/…` (dit plan), `docs/decisions.md`, `docs/roadmap.md`,
`docs/architecture.md`, `docs/prompts/analysis-system-prompt.md`.
Decisions-seed (PRD) + gedelegeerd: (a) productnaam Tastebank in repo
tastemaker; (b) Next 16 i.p.v. 15; (c) `claude-sonnet-4-6` via centrale
`getModel()`; (d) Gemini-SDK `@google/genai` (opvolger van het EOL
`@google/generative-ai`), modelkeuze verifiëren in fase 2; (e) schema-aanvulling
`media_group_id` + `confirm_message_id` (album-/reply-linking is anders
onbouwbaar); (f) dedupe als atomaire insert (ON CONFLICT DO NOTHING);
(g) Vitest als devDep (contracttests authpaden); (h) analysis-output afgedwongen
via structured outputs (json_schema) + eigen enum-check vóór persist;
(i) video-transcriptie via Gemini Files API (inline base64 > 20 MB requestlimiet
bij ~19 MB video), voice inline.
**AC:** User kan via de repo (`docs/`) de architectuur, beslissingen, roadmap en
het analyse-prompt lezen; het prompt-bestand bevat de anti-copy-regel expliciet.

### WP2 — SQL-migratie

`supabase/migrations/20260719_001_tastebank_init.sql`: `telegram_updates`
(update_id bigint PK, received_at), `entries` (PRD-kolommen + `media_group_id
text`, `confirm_message_id bigint`), `taste_profile`; RLS AAN op alle drie
ZONDER policies (service_role-only); indexes op `entries(created_at desc)`,
`entries(status)`, `entries(media_group_id)`. Bucket "media" NIET in SQL
(handmatig, README).
**AC:** Owner kan de migratie via de Supabase SQL-editor draaien met resultaat:
drie tabellen met RLS enabled en de CHECK-constraints uit het PRD.

### WP3 — Lib-laag

- `src/lib/env.ts` — lazy `getEnv()` (geen module-level throw → testbaar).
- `src/lib/db.ts` — service-role Supabase-client (lazy singleton) + entry-types.
  SERVER-ONLY per conventie; nooit importeren vanuit client components.
- `src/lib/telegram.ts` — `sendMessage` (returnt message_id; splitst > 4096
  tekens), `getFile`/`downloadFile`, types voor Update/Message.
- `src/lib/gemini.ts` — `transcribeVoice` (inline), `transcribeVideo`
  (Files API: upload → poll ACTIVE → generate → delete).
- `src/lib/claude.ts` — `getModel()`, `analyzeEntry()` (vision óf tekst,
  structured output met json_schema), `synthesizeProfile()`; system prompt via
  `fs.readFileSync` uit `docs/prompts/` + `outputFileTracingIncludes` in
  next.config zodat Vercel het bestand meeneemt.
  **AC:** Owner kan het analyse-prompt wijzigen door ALLEEN het md-bestand te
  bewerken met resultaat: gewijzigd gedrag na deploy, geen code-duplicaat.

### WP4 — Webhook: capture + commands

`src/app/api/telegram/route.ts` (`maxDuration = 60`) + `src/lib/capture.ts` +
`src/lib/commands.ts`. Volgorde: secret-header (401 bij mismatch) → parse →
chat-allowlist (stil 200) → commands → dedupe (atomair) → entry opslaan →
bevestiging sturen (confirm_message_id opslaan) → `waitUntil(process(entry))`.
Message-types: photo (grootste size; caption→raw_text), text (URL-detectie →
kind=link, GEEN pagina-fetch), voice, video/video_note (file_size > 19 MB →
foutmelding, geen entry), albums (media_group_id: entry 2+ → annotation_of
eerste), forwards (origin-naam als raw_text-prefix). Annotatie-linking: reply op
bot-bevestiging of eigen bericht (confirm_message_id/telegram_message_id-lookup)
óf voice/tekst-niet-URL < 5 min na laatste media-entry. Commands: /start,
/stats, /laatste (sync sub-2s), /profiel en /analyse (async via waitUntil met
directe ack). Alle replies Nederlands, kort, geen emoji.
**AC (kern):** User kan een screenshot delen via Telegram met resultaat: rij in
`entries` (kind=screenshot, media_path gevuld) + bevestiging < 2 s. User kan
een voice note sturen binnen 5 min na een screenshot met resultaat:
`annotation_of` verwijst naar de screenshot-entry en de parent wordt
geheranalyseerd. User kan /profiel sturen met resultaat: nieuwe rij in
`taste_profile` + profieltekst als reply ("Nog geen geanalyseerde entries" bij 0).

### WP5 — Analysepipeline

`src/lib/analyze.ts`: media download → storage-upload (bucket "media", pad
`{entryId}.{ext}`) → transcriptie indien voice/video (lege transcript →
analysis_failed) → Claude-analyse (screenshot als vision-image; raw_text +
caption + transcript + annotaties gecombineerd) → shape-/enum-validatie →
`analysis` jsonb + `analyzed_at` + status=analyzed. Elke failure:
status=analysis_failed + `console.error` met context; NOOIT throw richting
webhook-response; geen inline retries op 429/529.
**AC:** User kan /analyse sturen na een gefaalde analyse met resultaat: entry
opnieuw geprobeerd en status analyzed óf analysis_failed (met serverlog).

### WP6 — Tests + CI

`vitest` devDep; `tests/api/telegram-auth.spec.ts`: (1) 401 bij fout/ontbrekend
secret; (2) 200 + geen verwerking bij fout chat_id; (3) dedupe: tweede levering
zelfde update_id → geen tweede entry (db-module gemockt). Scripts `test:unit` +
`test:ci`; CI-workflow uitbreiden met `pnpm test:unit`. Geen LLM-output-tests
(testing-strategy).
**AC:** Owner kan `pnpm test:unit` draaien met resultaat: 3 groene tests zonder
credentials; CI draait ze mee.

### WP7 — Delivery

README.md (NL: migratie draaien, bucket aanmaken, Vercel env vars, deploy,
webhook registreren), `.env.example` (7 vars), `scripts/set-webhook.mjs`
(`node scripts/set-webhook.mjs https://APP.vercel.app`), root page →
"Tastebank running", CLAUDE.md-sync (What/Commands + Tastebank-hard-rules
verwijzing), projectstaat bijwerken.
**AC:** Owner kan met alleen de README van nul naar werkende bot (elke stap
expliciet, kopieerbaar).

## Edge cases (uit PRD, allemaal expliciet afhandelen)

Album met caption op foto 1 · foto mét caption = één entry · forwarded text ·
lege Gemini-transcript → entry blijft, analysis_failed · /profiel met 0
analyzed → vaste reply zonder Claude-call · dubbele webhook-levering →
dedupe-PK · reply op niet-gevonden message_id → geen link, gewone entry ·
non-message updates (edited, channel) → stil 200 · profieltekst > 4096 →
gesplitst versturen.

## Volgorde & commits

WP1 → WP2 → WP3 → WP4+5 (samenhangend, 2-3 commits) → WP6 → WP7; elke commit
[AI]-prefix door de volledige gate. Branch: claude/git-repo-init-issue-dfeq1v.

## Risico's en Edge Cases (FASE 2 — DEEPEN)

1. **Gemini 2.0 Flash is EOL** — live geverifieerd (ai.google.dev, 2026-07-19):
   staat onder "Previous models / Shut down". Keuze: `gemini-3.5-flash`
   (actueel stabiel) via SDK `@google/genai`; model-ID op één plek.
2. **Inline-limiet ~20 MB per request** — een 19 MB-video past niet inline
   (base64 +33%). Video → Gemini **Files API** (upload → poll ACTIVE →
   generate → delete, poll-cap ~30 s); voice → inline.
3. **waitUntil telt mee in maxDuration=60** — bij afkap blijft een entry in
   status `captured` hangen (niet `analysis_failed`). Mitigatie: `/analyse`
   pakt óók entries `captured` ouder dan 10 min (stale recovery). WP5 zo
   aangepast.
4. **Annotatie-race** — annotatie kan landen terwijl parent-analyse loopt:
   re-analyse van de parent wordt ná linking altijd opnieuw gestart; `analysis`
   wordt altijd volledig vervangen (nooit gemerged) — laatste schrijver wint,
   acceptabel voor single-user.
5. **Dubbel vuren** — identieke update_id → dedupe-PK; /profiel 2× bewust
   verstuurd → 2 profielversies (by design, versioned).
6. **Telegram 4096-tekens-limiet** — sendMessage splitst lange teksten.
7. **Chat-id-vergelijking als string** — geen number-parsing (negatieve
   group-ids, precisieverlies bij grote ids).
8. **Claude refusal/max_tokens** — structured output kan onvolledig zijn →
   enum-/shape-check vóór persist; falen = `analysis_failed`, geen inline
   retry (ook bij 429/529).
9. **Storage** — pad `{entryId}.{ext}` (geen collisions), contentType expliciet.
10. **Geen link-fetching** (PRD) — bewust géén SSRF-oppervlak; alleen URL
    opslaan.
11. **Service-role-grens** — `lib/db` uitsluitend geïmporteerd door
    server-code; reviewfase grep-t dat af.
12. **Tests zonder creds** — lazy `getEnv()`/lazy db-client + `vi.mock`,
    geen netwerk in tests.
