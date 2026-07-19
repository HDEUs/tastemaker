---
title: Contracttests zonder creds via één mockbare store-seam
date: 2026-07-19
category: tooling-decisions
problem_type: test-architecture
severity: medium
applies_when: API-routes testen die db/externe SDK's aanraken
tags: [vitest, mocking, seam, auth-tests, lazy-init]
---

## Problem

Webhook-authpaden (401, allowlist, dedupe) verdienen tests, maar de route
importeert Supabase/Anthropic/Gemini-clients. Module-level env-validatie of
client-constructie zou elke test zonder credentials laten crashen.

## Solution

Twee ontwerpkeuzes maken de tests puur (tests/api/telegram-auth.spec.ts):

1. **Lazy alles**: `env()` valideert per key bij gebruik (src/lib/env.ts),
   clients zijn lazy singletons — importeren kost niets.
2. **Eén data-seam**: alle db-operaties zitten in src/lib/store.ts; de test
   mockt precies vier modules (store, telegram, analyze, commands +
   @vercel/functions) en test de route als contract: 401 bij fout secret,
   nul db-sporen bij vreemde chats (allowlist vóór dedupe), skip bij dubbele
   update_id, en een positieve capture-controle zodat de deny-tests niet
   vacuous-groen zijn (testing-strategy-eis).

## Related files

- src/lib/env.ts, src/lib/store.ts, tests/api/telegram-auth.spec.ts,
  vitest.config.ts (alias @ → src)

## Prevention strategy

Nieuwe route = nieuwe contracttest op de auth/deny-paden + één positief pad.
Geen LLM-output-assertions (testing-strategy). Backlog: mocks typeren met
`satisfies typeof import("@/lib/store")` zodat signatuurdrift zichtbaar wordt.

## Reusable insight

Testbaarheid is een import-graph-eigenschap: één bewuste seam + lazy
initialisatie maakt élke route-test credential-vrij, zonder testcontainers
of netwerk.

## Source commits

"[AI] test: Vitest-contracttests webhook-authpaden + CI-teststap".
