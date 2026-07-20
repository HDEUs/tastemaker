# Tastebank (repo: tastemaker)

Persoonlijk taste-capture-systeem. Deel screenshots, teksten, voice notes,
links en korte video's met een prive Telegram-bot; alles wordt opgeslagen in
Supabase, geanalyseerd met Claude (abstracte principes, nooit kopieerbare
tekst) en samengevat in een levend taste profile via /profiel.

Single-user. v1 = capture + analyse + /profiel (zie `docs/roadmap.md`).
Werkwijze en conventies: `CLAUDE.md` + [HDEUs/claudeconventions](https://github.com/HDEUs/claudeconventions).

## Setup (van nul naar werkende bot)

### 1. Telegram-bot aanmaken

1. Chat met `@BotFather` → `/newbot` → kies een naam → bewaar het token.
2. Genereer een webhook-secret: `openssl rand -hex 32` (of een andere lange
   random string). Bewaar als `TELEGRAM_SECRET_TOKEN`.
3. Je chat-id: stuur `/start` naar `@userinfobot`, of zet de webhook straks
   eerst en lees `message.chat.id` uit de Vercel-logs. Bewaar als
   `ALLOWED_CHAT_ID`.

### 2. Supabase inrichten

1. Maak een project op supabase.com.
2. SQL-editor → plak en draai
   `supabase/migrations/20260719_001_tastebank_init.sql`.
3. Storage → New bucket → naam `media` → **Public bucket UIT** (private).
4. Settings → API: bewaar de Project URL (`SUPABASE_URL`) en de
   `service_role`-key (`SUPABASE_SERVICE_ROLE_KEY`).

### 3. API-keys

- `ANTHROPIC_API_KEY` via console.anthropic.com
- `GEMINI_API_KEY` via aistudio.google.com

### 4. Deploy naar Vercel

1. `pnpm install`
2. Kopieer `.env.example` naar `.env.local` en vul alle zeven waarden in.
3. `vercel` (eerste keer: project koppelen), daarna `vercel deploy --prod`.
4. Zet dezelfde zeven env vars in Vercel: Project → Settings → Environment
   Variables (Production), of via `vercel env add NAAM production`.

### 5. Webhook registreren

```
node scripts/set-webhook.mjs https://JOUW-APP.vercel.app
```

Het script leest `TELEGRAM_BOT_TOKEN` en `TELEGRAM_SECRET_TOKEN` uit je
omgeving of `.env.local` en registreert `/api/telegram` met het secret.

### 6. Smoke test

1. Stuur `/start` naar je bot → uitleg in het Nederlands.
2. Stuur een screenshot → binnen ~2 s "Screenshot opgeslagen, analyse loopt."
3. Even later: `/laatste` → de entry met een one-line summary.
4. Mislukt een analyse (bijv. rate limit): `/analyse` probeert het opnieuw.

## Commands

| Command | Doet |
| --- | --- |
| `/start` | Korte uitleg |
| `/stats` | Aantallen per soort, laag en status |
| `/laatste` | Laatste 5 entries met samenvatting |
| `/ideeen` | Je eigen ideeën; filter met `/ideeen linkedin` of `/ideeen conudge` |
| `/profiel` | Genereert en stuurt je taste profile (versioned opgeslagen) |
| `/analyse` | Herprobeert mislukte en blijven-hangen analyses |

## Ontwikkelen

```
pnpm dev          # dev-server
pnpm test:unit    # contracttests (geen creds nodig)
pnpm test:ci      # volledige poort: tsc, lint, grain, build, tests
```

Architectuur: `docs/architecture.md` · Beslissingen: `docs/decisions.md` ·
Analyse-prompt: `docs/prompts/analysis-system-prompt.md` (versioned; de
anti-copy-regel daarin mag niet afgezwakt worden).
