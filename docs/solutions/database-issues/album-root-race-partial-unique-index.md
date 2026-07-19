---
title: Album-root-race gedicht met partial unique index + 23505-retry
date: 2026-07-19
category: database-issues
problem_type: race-condition
severity: medium
applies_when: "eerste rij in een groep wordt parent"-patronen onder parallelle inserts
tags: [postgres, unique-index, race, telegram-albums, supabase]
---

## Problem

Telegram levert albumfoto's vrijwel gelijktijdig af (parallelle
webhook-calls). Het patroon "zoek de album-root; niet gevonden → ik ben de
root" is een klassieke select-dan-beslis-race: twee foto's zien allebei géén
root en worden allebei root — het album valt uiteen.

## Solution

De databank beslecht de race i.p.v. de applicatie
(supabase/migrations/20260719_001_tastebank_init.sql):

```sql
create unique index entries_album_root_uidx
  on entries (media_group_id)
  where media_group_id is not null and annotation_of is null;
```

Slechts één root per media_group kan bestaan. De verliezer van de race krijgt
23505; `insertEntry` (src/lib/store.ts) vangt precies dat geval, zoekt de
inmiddels bestaande root op en insert zichzelf opnieuw als sibling.

## Related files

- supabase/migrations/20260719_001_tastebank_init.sql (entries_album_root_uidx)
- src/lib/store.ts (insertEntryRow albumConflict-pad, insertEntry-retry)

## Prevention strategy

Review-checklist punt 8: elk "eerste-wint"-patroon krijgt een constraint die
de race op db-niveau beslecht; de applicatie behandelt de unique-violation
als normaal pad, niet als fout.

## Reusable insight

Een partial unique index is de goedkoopste vorm van "distributed lock" die
Postgres gratis meelevert: codeer de invariant ("één root per groep") als
index en de race verdwijnt per constructie.

## Source commits

"[AI] fix: review-P1's + dataflow-P2's — voice-annotaties, dedupe-compensatie".
