# Projectstaat — Tastebank

Laatste update: 2026-07-19 (Tastebank v1-bouwrun)

## Gemerged / live

- Conventies-basispakket toegepast (PR #1)
- Guardrails operationeel: husky-gate geverifieerd + CI-backstop (PR #2)

## In PR (wacht op review owner)

- Tastebank v1: capture + async analyse + commands + /profiel + tests + docs

## Openstaande owner-stappen (buiten de code)

- Supabase: migratie `20260719_001` draaien + private bucket `media` aanmaken
- Vercel: 7 env vars zetten + deploy
- Webhook registreren: `node scripts/set-webhook.mjs https://APP.vercel.app`
- Echte end-to-end smoke test via Telegram (README stap 6)
- Lokale machine: `winget install gitleaks`

## Volgende

- Na 30+ geanalyseerde entries: v2-poort (generatie + similarity check),
  zie docs/roadmap.md
