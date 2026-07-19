<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/testing.md (bovenste, project-agnostische helft)
status: trimmed — de FitTrack-specifieke suites (PRD-0 t/m PRD-10, seed-factory,
        load/quality/cost-pipelines) zijn weggelaten; de strategie, de
        laag-keuze-tabellen en de anti-patterns zijn verbatim overgenomen.
-->

# Testing Strategy

Voor een AI-product met één developer is de test-aanpak een **omgekeerde
piramide**: weinig browser-e2e, meer API-contracts, vrijwel nooit assertions op
LLM-output. Doel: groene CI die je vertrouwt, geen onderhoudsschuld.

## De drie lagen

| Laag                        | Tool            | Wat het test                                        | Snelheid | Wanneer schrijven                                                  |
| --------------------------- | --------------- | --------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| 1. Typecheck + lint + build | tsc/eslint/next | Geen behavior; pure compileerbaarheid en code-style | ~30s     | Altijd; draait pre-commit + in CI                                  |
| 2. API contracts            | Vitest          | HTTP request → response shape + status codes        | ~1-2 min | Bij elke nieuwe of gewijzigde `/api/*` route                       |
| 3. e2e browser flow         | Playwright      | "Klikt user op X, gebeurt Y in de UI"               | ~2-3 min | Alleen voor kritieke happy paths (auth, kern-flows)                |

Geen integration tests tegen een preview-DB — deferred totdat het pijn doet.
Geen visual regression (Percy/Chromatic) — overkill voor een solo project.

## Welke laag voor welk soort verandering

| Type wijziging                             | Test waar?                                          |
| ------------------------------------------ | --------------------------------------------------- |
| Nieuwe API route                           | Vitest API contract (`tests/api/*.spec.ts`)         |
| RLS-policy of ownership chain wijzigt      | Vitest API contract (401/403 paths)                 |
| Body-validatie of CHECK constraint         | Vitest API contract (400 path)                      |
| Nieuwe kritieke pagina/flow                | e2e happy path (`tests/e2e/*-happy-path.spec.ts`)   |
| UI tweak (className, copy, button styling) | **Niets** — pre-commit + handmatige check is genoeg |
| Nieuwe LLM-tool of prompt-wijziging        | **Niets in test-suite** — exploratory testen        |
| i18n-string toevoegen                      | **Niets** — TypeScript strict checkt key parity     |
| DB-migratie                                | Handmatig via preview branch / test-DB              |
| Refactor zonder gedragsverandering         | **Niets** — bestaande tests bewijzen geen regressie |
| Bug-fix met reproducerbare bug             | Vitest of e2e — schrijf de failing test eerst       |

## Wat we NIET testen

- **LLM-output content.** De provider test het model. Wij testen of onze code
  het model correct aanroept (status 200, response shape) — niet of het antwoord
  "goed" is. Geen assertions op berichtinhoud, lengte, sentiment.
- **Exacte UI-strings.** i18n-parity wordt door TypeScript afgedwongen. E2e
  tests gebruiken regex (`/log out|uitloggen/i`) zodat een i18n-rename niet de
  test omver gooit.
- **Niet-deterministische test-data state.** Test "pagina laadt zonder crash",
  niet "detail toont waarde X".
- **Marketing copy.** Tekst wijzigt vaak; alleen status (2xx) en aanwezigheid
  van een `<h1>` testen.

## Anti-patterns (harde lessen uit een gefaalde 26-test suite)

- **`.locator("button").first()` als deel van een `.or()` chain.** Playwright
  strict-mode kapt af zodra meerdere matches resolven. Gebruik
  `getByRole("button", { name: /label/i })` of `getByPlaceholder("...")`.
- **Inline `page.goto("/login") → fill → click` zonder `waitForURL`.** De
  auth-cookie wordt pas gezet ná de client-side redirect. Gebruik altijd een
  shared `login()` helper.
- **Tests die op LLM-output asserten.** Inherently flaky. De LLM mocken is ook
  geen oplossing — dan test je je mock, niet je code.
- **Tests die test-data state aannemen.** Test "page rendert", niet "page toont X".
- **Massa screenshots / visual diffs.** Onderhoudsschuld. Error-monitoring
  (Sentry) vangt prod errors sneller dan visual regression tests.

## Verdere principes

- **PURE/impure-splitsing:** logica die je wilt unit-testen leeft in pure
  functies (geen DB/LLM/klok); dunne impure randen eromheen. CI draait alleen de
  pure lagen; live suites zijn owner-run met eigen credentials.
- **Deny-assertions hebben een werkende positieve controle nodig** — anders zijn
  ze vacuous-groen (de weigering "slaagt" om de verkeerde reden).
- **RLS test je met de user-JWT op een anon-client, NOOIT met de service-role**
  (die bypasst RLS volledig → vals-groen).
- **Graceful skip-patroon** voor tests die optionele credentials nodig hebben:
  `const describeOrSkip = CREDS ? test.describe : test.describe.skip;`
- **Determinisme nooit met `Math.random`** — alles via een seedbare RNG.

## Wanneer een test wel/niet schrijven

**Wel schrijven als:**

- Het is een reproduceerbare bug die je net hebt gefixt (failing test first)
- Het raakt auth, RLS, ownership, of CHECK-constraints
- De flow is kritiek én er is een eenvoudige stabiele assertion mogelijk

**Niet schrijven als:**

- De assertion zou afhangen van LLM-output, animation timing, of
  niet-deterministische test-data
- De test heeft 30+ regels setup voor 1 regel assertion
- Het dekt iets dat TypeScript of een lint-rule al pakt
- Je hebt het in je hoofd al 3 keer "voor de zekerheid" genoemd — dat is meestal
  het signaal dat de test géén signaal toevoegt
