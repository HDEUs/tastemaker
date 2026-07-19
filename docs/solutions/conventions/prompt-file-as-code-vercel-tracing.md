---
title: Versioned promptbestand + Vercel file tracing (geen inline duplicaat)
date: 2026-07-19
category: conventions
problem_type: convention
severity: medium
applies_when: LLM-prompts die als product-artefact beheerd moeten worden
tags: [prompts, protocol-8, vercel, outputFileTracingIncludes, anti-copy]
---

## Problem

Systeem-prompts die inline in route-handlers leven, drijven weg van hun
documentatie en zijn niet reviewbaar als artefact. Tastebank's
anti-copy-regel ("mag niet afgezwakt worden") vereist juist één canonieke,
versioned bron. Maar een los md-bestand komt op Vercel standaard níet in de
serverless bundle terecht — runtime `readFileSync` zou daar ENOENT geven.

## Solution

- Prompt leeft in docs/prompts/analysis-system-prompt.md (met de
  anti-copy-regel expliciet gemarkeerd als niet-afzwakbaar).
- src/lib/claude.ts leest het bestand lazy + gecached via
  `readFileSync(path.join(process.cwd(), ...))`.
- next.config.ts neemt het mee in de bundle:
  `outputFileTracingIncludes: { "/api/telegram": ["./docs/prompts/..."] }`.
  De route-key is het genormaliseerde app-pad (`/api/telegram`) — in review
  geverifieerd tegen Next-internals (collect-build-traces + normalizeAppPath).

## Related files

- docs/prompts/analysis-system-prompt.md
- src/lib/claude.ts (analysisSystemPrompt)
- next.config.ts (outputFileTracingIncludes)

## Prevention strategy

Protocol 8 (prompt changes are code changes) wordt afdwingbaar doordat de
prompt een los, diff-baar bestand is. Eerste deploy: één echte analyse
draaien als verificatie dat het bestand in de bundle zit (README stap 6).

## Reusable insight

"Import or fs-read, never duplicate" werkt op Vercel alleen mét een
tracing-include; zonder die regel faalt het pas in productie — precies het
soort stille configfout dat een preview-smoke-test moet vangen.

## Source commits

"[AI] docs: Tastebank v1 — plan, decisions, ..." en
"[AI] feat: Telegram-webhook — capture, dedupe, annotaties, commands".
