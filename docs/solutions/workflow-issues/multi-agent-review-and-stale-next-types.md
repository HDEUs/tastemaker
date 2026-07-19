---
title: Multi-lens review met SDK-verificatie + stale .next/types bij rebase
date: 2026-07-19
category: workflow-issues
problem_type: workflow-lesson
severity: medium
applies_when: /lfg-reviewfase en elke history-rewrite in een Next.js-repo
tags: [review, subagents, rebase, next-types, sdk-verification]
---

## Problem

Twee workflow-lessen uit de Tastebank v1-run. (1) Eén reviewer mist
categoriefouten: SDK-aanroepen die "er goed uitzien" maar niet tegen de
echte typings zijn gelegd, en plan-items die stil ontbreken. (2) Tijdens een
`git rebase --exec "commit --amend"` over oudere commits faalde de
pre-commit-gate op `tsc`: het GEGENEREERDE `.next/types/validator.ts` (van
de laatste build, verwijst naar de webhook-route) bestond in de werkmap,
terwijl de uitgecheckte tussentree die route nog niet had — tsconfig neemt
`.next/types/**` op, dus tsc zag een verwijzing naar een niet-bestaand
bestand.

## Solution

(1) Drie parallelle review-agents met verdeelde lenzen, met twee expliciete
opdrachten die het verschil maakten: "verifieer SDK-shapes tegen
node_modules-typings" (leverde bevestiging van alle @google/genai-,
Anthropic- en Supabase-aanroepen én de Next-tracing-key) en "zoek wat
ONTBREEKT t.o.v. het plan" (leverde P1-1). Rapporteren = dekking, filteren
gebeurt daarna centraal (P1/P2/P3 + verificatie tegen de branch-tip).
(2) Voor pure identiteits-rewrites van al-groene trees: amend met
`--no-verify` — de gate her-draaien op byte-identieke trees voegt niets toe
en struikelt over stale build-artefacten; daarna `git diff <oud> HEAD`
(moet leeg zijn) als bewijs.

## Related files

- tmp/review-tastebank-v1.md (geconsolideerd rapport, sessie-scratch)
- tsconfig.json (include van .next/types — de bron van les 2)

## Prevention strategy

Review-agent-prompts standaard uitrusten met: node_modules-verificatie,
"wat ontbreekt"-lens en het dekking-boven-filtering-mandaat. Bij rebases
over oude trees: gates niet her-draaien op ongewijzigde inhoud, wél
inhouds-gelijkheid bewijzen met een lege diff.

## Reusable insight

Een review die alleen leest wat er staat, valideert het verleden; de twee
duurste vondsten kwamen uit "vergelijk met wat er zou moeten staan" (plan)
en "vergelijk met wat er echt geïnstalleerd is" (typings).

## Source commits

Reviewfase branch claude/git-repo-init-issue-dfeq1v (fix-commits
"review-P1's" en "review-P2/P3-randlaag").
