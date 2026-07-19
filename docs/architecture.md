# Architectuur — Tastebank v1

Personal taste-capture systeem. Single user (Christiaan). Eén Next.js-app op
Vercel, Supabase als database + private mediastorage, Claude voor analyse,
Gemini voor audio-transcriptie.

## Dataflow

```
Telefoon (Telegram share)
   │  bericht/foto/voice/link/video
   ▼
Telegram Bot API ──webhook──▶ app/api/telegram/route.ts   (maxDuration 60)
   1. secret-header check (401 bij mismatch)
   2. alleen ALLOWED_CHAT_ID (rest: stil 200)
   3. command? → /start /stats /laatste sync; /profiel /analyse async
   4. dedupe: INSERT update_id in telegram_updates (ON CONFLICT → stop)
   5. entry-rij opslaan (status 'captured') + annotatie-linking
   6. bevestiging < 2 s (bot-message_id → entries.confirm_message_id)
   7. waitUntil(processEntry):
        media: getFile → download → Storage-bucket "media" → media_path
        voice/video: Gemini-transcriptie (video via Files API) → transcript
        Claude-analyse (vision of tekst; annotaties mee) → entries.analysis
        falen: status 'analysis_failed' (herstel via /analyse)
   ▼
Supabase (Postgres + Storage)
   ▼
/profiel → alle analyzed entries → Claude-synthese → taste_profile (versioned)
         → profieltekst terug via Telegram (gesplitst bij > 4096 tekens)
```

## Tabellen

| Tabel | Doel | Kernkolommen |
| --- | --- | --- |
| `telegram_updates` | Dedupe van webhook-retries | `update_id` (PK), `received_at` |
| `entries` | Elke gedeelde snippet | `kind` (screenshot/text/voice/link/video, CHECK), `raw_text`, `transcript`, `media_path`, `source_url`, `annotation_of` (self-FK), `media_group_id` (albums), `telegram_message_id` + `confirm_message_id` (reply-linking), `analysis` (jsonb), `status` (captured/analyzed/analysis_failed, CHECK) |
| `taste_profile` | Versioned profielen | `generated_at`, `entry_count`, `profile_md` |

RLS staat AAN op alle drie de tabellen **zonder policies**: alleen de
service-role (server) kan erbij; anon ziet niets. Bucket `media` is private.

## Security-grenzen

- User-ID-concept bestaat niet: het systeem bedient exact één chat
  (`ALLOWED_CHAT_ID`, stringvergelijking), al het andere wordt stil genegeerd.
- `SUPABASE_SERVICE_ROLE_KEY` leeft uitsluitend server-side (`src/lib/db.ts`);
  niets onder `src/app` dat client-side rendert importeert die module.
- Webhook-echtheid via `X-Telegram-Bot-Api-Secret-Token` (401 bij mismatch).
- Links worden opgeslagen, nooit gefetcht (geen SSRF-oppervlak).
- Foutdetails alleen in serverlogs; bot-replies blijven generiek NL.

## Analyse-contract

Het systeem-prompt leeft in `docs/prompts/analysis-system-prompt.md` (geladen
at runtime via fs-read + Vercel file tracing; NIET gedupliceerd in code).
Output is afgedwongen JSON: `format_type`, `hook_style`, `tone`,
`topic_tags[]`, `why_it_works`, `layer` (`form_inspiration` |
`topic_relevant`), `one_line_summary` — abstracte principes, nooit
overneembare tekst. De anti-copy-regel in dat bestand mag niet afgezwakt
worden.
