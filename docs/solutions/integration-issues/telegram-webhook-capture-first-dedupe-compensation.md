---
title: Telegram-webhook — capture-first met dedupe-compensatie
date: 2026-07-19
category: integration-issues
problem_type: data-loss-risk
severity: high
applies_when: webhooks met at-least-once delivery (Telegram, Stripe, GitHub)
tags: [telegram, webhook, dedupe, idempotency, waitUntil]
---

## Problem

Twee subtiele manieren waarop een "dedupe + opslaan + ack"-webhook berichten
verliest: (1) dedupe-insert slaagt maar de entry-insert erna faalt → de
retry van de provider strandt op "al gezien" en de capture is permanent weg;
(2) de bevestiging-send faalt ná een geslaagde insert → 500 → zelfde
verhaal, terwijl de data er al stond.

## Solution

Capture-first met een compensatiewindow (src/app/api/telegram/route.ts):
`compensateUpdateId` is non-null tussen dedupe-insert en entry-insert; het
catch-pad draait dan `removeUpdate()` (src/lib/store.ts) zodat de retry een
echte tweede kans krijgt. Zodra de entry duurzaam is, wordt het veld null en
zijn bevestigingsfouten niet-fataal (log + doorgaan naar de analyse). De
dedupe zelf is een atomaire PK-insert met 23505-afvang — nooit
select-dan-insert (TOCTOU).

## Related files

- src/app/api/telegram/route.ts (POST, compensateUpdateId)
- src/lib/store.ts (recordUpdate, removeUpdate)
- scripts/set-webhook.mjs (.env-parser strips quotes — een gequote secret
  registreerde anders een webhook die elke echte call 401'ǝ)

## Prevention strategy

Bij elke webhook: teken eerst het faalpad per stap uit (wat gebeurt er bij
een fout NA stap X, gegeven de retry-semantiek van de provider) en pas dan
de volgorde kiezen. Review-checklist punt 8 (races) + punt 3 (partial
failure).

## Reusable insight

Dedupe hoort logisch bij "verwerking voltooid", niet bij "verwerking
begonnen". Kun je dat niet in één transactie krijgen (Supabase REST), dan is
een compensating delete in het foutpad de kleinste correcte oplossing.

## Source commits

Branch claude/git-repo-init-issue-dfeq1v: "[AI] feat: Telegram-webhook" +
"[AI] fix: review-P1's + dataflow-P2's" (P1-2).
