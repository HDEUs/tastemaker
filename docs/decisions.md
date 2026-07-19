# Decisions — ADR-light log

Format: **datum — keuze** — waarom. Nieuwe dependencies krijgen ALTIJD een
regel hier (hard rule 7).

- **2026-07-19 — Telegram als capture-kanaal** — laagste frictie vanaf
  telefoon (share sheet), gratis Bot API, geen eigen app nodig.
- **2026-07-19 — Supabase met service_role + RLS-enabled-zonder-policies** —
  single-user systeem; server is de enige consument, anon heeft nérgens
  toegang; RLS aan als vangnet tegen per-ongeluk-exposure.
- **2026-07-19 — Gemini voor audio-transcriptie** — Claude API heeft geen
  audio-input; Gemini is de goedkoopste betrouwbare transcriptieroute.
- **2026-07-19 — `@google/genai` als Gemini-SDK, model `gemini-3.5-flash`** —
  PRD noemde `@google/generative-ai` + "Gemini 2.0 Flash", maar dat pakket is
  EOL en 2.0 Flash staat live gedocumenteerd als "shut down soon"
  (ai.google.dev/gemini-api/docs/models, gecheckt 2026-07-19). Model-ID staat
  op één plek in `src/lib/gemini.ts`.
- **2026-07-19 — `claude-sonnet-4-6` voor analyse** — expliciete PRD-keuze,
  geverifieerd als actueel model-ID; centrale `getModel()` in
  `src/lib/claude.ts` zodat een latere swap (bijv. claude-sonnet-5, nu met
  introductieprijs goedkoper) een one-liner is.
- **2026-07-19 — Geen video-download boven 19 MB** — Telegram Bot API
  getFile-limiet is 20 MB; marge van 1 MB; gebruiker krijgt NL-instructie
  (screenshot + voice note).
- **2026-07-19 — Video-transcriptie via Gemini Files API, voice inline** —
  inline base64 van een ~19 MB-video overschrijdt de ~20 MB requestlimiet;
  voice notes zijn klein genoeg voor inline.
- **2026-07-19 — v2-generatie is LinkedIn-only** — scope-keuze owner; v1
  bouwt geen generatie.
- **2026-07-19 — Productnaam "Tastebank" (werktitel) in repo `tastemaker`** —
  repo-naam niet wijzigen; product-/docsnaam Tastebank per PRD.
- **2026-07-19 — Next.js 16 i.p.v. 15 uit het PRD** — conventies-bronrepo zit
  op 16; eslint-config-next major matcht; besloten in guardrails-PR (#2).
- **2026-07-19 — Schema-aanvulling `media_group_id` + `confirm_message_id`
  op `entries`** — album-linking en reply-op-botbevestiging zijn zonder deze
  kolommen niet implementeerbaar; PRD-gaten gedicht.
- **2026-07-19 — Dedupe als atomaire PK-insert met 23505-afvang** —
  select-dan-insert heeft een TOCTOU-window; Telegram-retries komen vrijwel
  gelijktijdig binnen (review-checklist punt 8). Faalt de capture ná de
  dedupe-insert, dan wordt die insert gecompenseerd verwijderd zodat de
  Telegram-retry niet ingeslikt wordt (review-finding P1-2).
- **2026-07-19 — `@anthropic-ai/sdk`, `@supabase/supabase-js` en
  `@vercel/functions` als dependencies** — respectievelijk de officiële
  Claude-SDK (analyse/synthese), de enige datalaag-client (service-role) en
  de `waitUntil`-bron voor werk ná de webhook-response op Vercel.
- **2026-07-19 — `server-only` als dependency** — maakt een client-side
  import van `src/lib/db.ts` een build-fout i.p.v. een conventie (harde
  regel 5).
- **2026-07-19 — `maxDuration = 300` i.p.v. 60 uit het PRD** — de
  video-pipeline (download tot 19 MB + Gemini Files-poll + Claude) plus een
  parent-heranalyse past niet betrouwbaar in 60 s (waitUntil telt mee);
  Vercel Fluid compute staat 300 s toe. De 2-seconden-ack blijft ongewijzigd.
- **2026-07-19 — Vitest als devDependency** — contracttests voor de
  webhook-authpaden (401/ignore/dedupe) per testing-strategy; geen
  LLM-output-assertions.
- **2026-07-19 — Analyse-output via prompt-contract + strikte shape-/enum-
  validatie vóór persist** — "vertrouw geen input, ook niet van de AI".
  Structured outputs (json_schema) is niet gegarandeerd beschikbaar op
  sonnet-4-6, dus de harde afdwinging zit in `validateAnalysis()`
  (src/lib/claude.ts): elke ontbrekende/lege key of foute layer-waarde =
  analysis_failed, nooit een halve analyse in de database.
- **2026-07-19 — `/analyse` herstelt ook stale `captured`-entries (> 10 min)** —
  waitUntil kan door maxDuration afgekapt worden vóór de status op
  analysis_failed staat; anders blijven entries onzichtbaar hangen.
