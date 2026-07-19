---
title: Async pipeline via waitUntil met status-machine en stale-recovery
date: 2026-07-19
category: architecture-patterns
problem_type: design-decision
severity: medium
applies_when: serverless functies die na de response doorwerken (Vercel waitUntil)
tags: [vercel, waitUntil, maxDuration, status-machine, recovery]
---

## Problem

`waitUntil`-werk telt gewoon mee in `maxDuration`. Wordt de functie afgekapt
midden in download→transcriptie→analyse, dan is er geen catch-blok meer dat
de status op `analysis_failed` zet: de entry blijft onzichtbaar in
`captured` hangen. En absorbed annotaties (voice-notities) die je bewust
niet analyseert, moeten hun mediahelft (download+transcript) wél doorlopen —
anders bereikt hun inhoud de parent-heranalyse nooit (dat was P1-1).

## Solution

Drie regels in samenhang (src/lib/analyze.ts, src/lib/store.ts):

1. Elke fout in de pipeline eindigt als `status='analysis_failed'` + één
   `console.error` met stage-label — nooit een throw richting de webhook.
2. `/analyse` (listRetryableEntries) pakt naast `analysis_failed` óók
   `captured` ouder dan 10 min — het vangnet voor afgekapte runs. Media is
   her-downloadbaar omdat `telegram_file_id` gepersisteerd wordt.
3. `transcribeAnnotation()` draait de media+transcript-helft zonder de
   analyse-helft voor absorbed voice-entries; `maxDuration` staat op 300
   (Fluid compute) omdat de video+parent-keten niet betrouwbaar in 60 s past.

## Related files

- src/lib/analyze.ts (processEntry, transcribeAnnotation, ensureMedia)
- src/lib/store.ts (listRetryableEntries)
- src/app/api/telegram/route.ts (maxDuration, waitUntil-blok)

## Prevention strategy

Bij elk waitUntil-ontwerp: (a) statuswaarde voor "begonnen maar nooit
afgemaakt" + een recovery-query; (b) alles persisteren wat een re-run nodig
heeft (file_id, mime_type); (c) het tijdsbudget van de hele keten optellen
vóór je maxDuration kiest.

## Reusable insight

Een async pipeline is pas af als elke tussentoestand een herstelroute heeft
die zonder de oorspronkelijke request-context werkt.

## Source commits

"[AI] feat: Tastebank lib-laag", "[AI] fix: review-P1's + dataflow-P2's".
