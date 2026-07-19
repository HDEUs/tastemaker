---
title: LLM-model-IDs uit een PRD altijd live verifiëren (Gemini 2.0 EOL)
date: 2026-07-19
category: integration-issues
problem_type: stale-dependency
severity: high
applies_when: elk PRD/plan dat een extern model-ID of SDK-pakket vastpint
tags: [gemini, model-eol, sdk, verification, deepen-fase]
---

## Problem

Het Tastebank-PRD schreef "Gemini 2.0 Flash" + `@google/generative-ai` voor.
Beide waren bij de bouw al end-of-life: het pakket is opgevolgd door
`@google/genai` en 2.0 Flash stond live gedocumenteerd als "shut down soon".
Blind volgen had een systeem opgeleverd waarvan elke transcriptie bij
livegang (of kort daarna) zou 404'en.

## Solution

In de DEEPEN-fase één WebFetch naar de officiële modeldocumentatie
(ai.google.dev/gemini-api/docs/models) i.p.v. bouwen op geheugen of PRD.
Uitkomst (`gemini-3.5-flash`, SDK `@google/genai`) vastgelegd in
docs/decisions.md mét bron en datum; model-ID op één plek
(src/lib/gemini.ts, `GEMINI_MODEL`).

## Related files

- src/lib/gemini.ts (GEMINI_MODEL, transcribeInline, transcribeViaFilesApi)
- docs/decisions.md (regel met bron + datum van de live-check)

## Prevention strategy

Vast onderdeel van fase 2 (DEEPEN): elke externe model-/pakketnaam uit een
PRD krijgt een live-verificatie met bron+datum in decisions.md. Backlog-item
(issue #3): `models.get` bij deploy als runtime-vangnet.

## Reusable insight

PRD's veroudereren sneller dan code — vooral op AI-model-namen. "Het PRD
zegt X" is een startpunt voor verificatie, geen bouwinstructie. Tweede les:
inline base64 (+33%) botst met request-caps — een 19 MB-video past niet in
een ~20 MB-limiet; grote media gaat via de Files API (upload → poll ACTIVE →
generate → delete), kleine audio inline.

## Source commits

"[AI] docs: Tastebank v1 — plan, decisions, ..." (deepen-vondst) en
"[AI] feat: Tastebank lib-laag" (implementatie).
