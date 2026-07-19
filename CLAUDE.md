<!--
source: HDEUs/claudeconventions (CLAUDE-BASE.md, export uit HDEUs/fittracker 2026-07)
toegepast op tastemaker: 2026-07-19. What/Commands worden definitief bij de
eerste scaffold — TODO-markers staan op die plekken.
-->

# CLAUDE.md — Tastemaker

<!-- PROJECT-SPECIFIEK -->

## What

Tastemaker — HDEUs-project in opbouw. Technische basis staat: Next.js 16
(App Router, `src/`-structuur), TypeScript strict, pnpm. Productcode volgt
via het PRD (Telegram-capture + Claude-analyse; werktitel "Tastebank").
<!-- TODO bij de eerste feature-run: productomschrijving definitief maken
(wat, DB, hosting/deploy-doel) en de naamkeuze vastleggen. -->

## Commands

- `pnpm dev` — dev-server
- `pnpm build` — productie-build; regel die altijd geldt: **build vóór elke commit**
- `pnpm lint` — ESLint over het hele project
- `pnpm grain` — slop-pass over `src/` (blokkerende AI-slop-gate)
- `npx tsc --noEmit` — typecheck

De husky pre-commit draait `gitleaks → tsc → lint → grain → build` en is
geverifieerd: de gate vuurt echt (zie .claude/rules/guardrails.md). Lokale
gitleaks-binary is optioneel (graceful skip); de gitleaks-job in CI
(.github/workflows/ci.yml) is de niet-omzeilbare backstop.

## Owner

Christiaan (HDEUs). Solo founder. — Dutch communication, English code comments.

<!-- EINDE PROJECT-SPECIFIEK -->

---

## Rules (read BEFORE every session)

- .claude/rules/protocols.md — operational protocols (MANDATORY)
- .claude/rules/review-checklist.md — architectuur-review-checklist (doorloop VOOR je code schrijft)
- .claude/rules/known-environment.md — machine/shell-omgeving (lees vóór tool-claims)

**Single source of truth:** CLAUDE.md **linkt**, rules-files **bezitten de
inhoud**. Nooit dezelfde informatie op twee plekken; bij duplicatie: verwijder
uit CLAUDE.md en link. Elke referentie in CLAUDE.md moet naar een bestaand
bestand wijzen — bij delete/rename direct de referentie bijwerken. Verouderde
strategie-docs naar `docs/archive/` (met datum in de naam), niet in de root
laten concurreren met actuele docs.

## Workflow

### 1. Architectuur-review vóór elke prompt

Voor ELKE taak die code raakt: doorloop eerst `review-checklist.md`
(schema first, RLS/authorisatie, CHECK-constraints, edge cases, race conditions,
FK-referenties, model-keuze). Voor bugs over user-facing gedrag geldt
**Architecture First** (Protocol 17): eerst rendering lokaliseren → bestand
lezen → API/DB-pad lezen → PAS DAN een root-cause-hypothese. Aannames over
architectuur zonder bewijs = STOP.

Voor elke taak groter dan een single-file change: eerst plan (bestanden, wijziging
per bestand, verwacht resultaat) naar `tmp/plan.md`, akkoord, dán uitvoeren
(Protocol 12).

### 2. Decisions logging

Beslissingen en opgeloste problemen worden ALTIJD vastgelegd, niet alleen
toegepast:

- **docs/solutions/** — elk niet-triviaal opgelost probleem of genomen
  tooling-/architectuurbesluit wordt een solution-doc met YAML-frontmatter
  (title, date, category, problem_type, severity, applies_when, tags).
  Categorie-submappen: `architecture-patterns/`, `build-errors/`, `conventions/`,
  `database-issues/`, `design-patterns/`, `integration-issues/`, `logic-errors/`,
  `runtime-errors/`, `security-issues/`, `tooling-decisions/`, `ui-bugs/`,
  `workflow-issues/`.
- **Handoffs** — bij complexe sessies of 50–70% contextgebruik:
  `.claude/handoffs/[date]-[topic].md` met status, rationale (waarom deze
  beslissingen), blast radius, next steps (Protocol 14).
- **Docs-sync** — na elke sessie die bestanden wijzigt: relevante
  `.claude/rules/`-files bijwerken (nieuwe routes, tabellen, gotchas, bugs);
  verouderde inhoud VERWIJDEREN (Protocol 6).

### 3. Migrations-only schemawijzigingen

Databaseschema wijzigt UITSLUITEND via genummerde/gedateerde SQL-migratiebestanden
in `sql/` (of `supabase/migrations/`), nooit ad-hoc in een dashboard zonder
bijbehorend bestand in de repo. Regels:

- Elke migratie: één bestand, beschrijvende naam met datum, gedocumenteerd in de
  database-rules-file (wat, waarom, wanneer gedraaid).
- Migraties zijn **backward compatible** (bouw-tenet: "één ding veranderen mag
  nooit iets anders breken"); additieve kolommen nullable met verstandige default.
- Draaien gebeurt bewust/handmatig (SQL-editor of migratie-MCP), en de
  code-helft merget pas NADAT de kolom bestaat.
- Test-/staging-omgeving krijgt dezelfde migratie, anders drift het schema.

## PowerShell-regels (Windows-omgeving)

- **NOOIT `&&`** tussen commando's — PowerShell 5.1 kent het niet. Gebruik `;`
  of aparte regels; git-stappen (add/commit/push) ALTIJD als aparte commando's.
- **`cd`-prefix**: begin elk shell-commando met een expliciete
  `cd <projectroot>;` (of gebruik absolute paden) — de werkdirectory van een
  tool-call is niet gegarandeerd. <!-- impliciete conventie, nu gedocumenteerd -->
- Hook-scripts (`.claude/hooks/*.ps1`) **ASCII-only** houden: PowerShell 5.1
  leest UTF-8-zonder-BOM als ANSI en breekt op em-dashes/pijlen. Gewone `-`
  gebruiken, of opslaan als UTF-8-met-BOM.
- Vóór claimen dat een tool ontbreekt: eerst CLI-check draaien (bijv.
  `gh --version`); de omgevingsdetectie heeft blinde vlekken bij Windows-PATH.
  Bij twijfel: volledig pad gebruiken.

## Communicatieregels

- **Taal:** Dutch communication, English code comments. UI-teksten volgens het
  i18n-systeem van het project (beide taalblokken altijd dezelfde keys).
- **The Karpathy Move:** fouten NOOIT in eigen woorden beschrijven — altijd de
  VOLLEDIGE rauwe stack trace plakken. Geparafraseerde errors verliezen context.
- Foutmeldingen tonen aan de gebruiker; technische details alleen naar de
  console/server-logs. API 500's geven één generieke melding, nooit stack
  traces of DB-details in de response.
- Commit-prefix `[AI]` voor alle Claude Code-commits (Protocol 13):
  `[AI] feat: …`, `[AI] fix: …`.
- Rapporteer eerlijk: falende tests melden mét output; overgeslagen stappen
  benoemen; "done" = works + visible + reachable + documented + pushed
  (Protocol 9, No Orphan Features).

## Compound Engineering

### Mappenconventie

- **docs/solutions/** — opgeloste problemen + learnings (output /ce-compound),
  met YAML-frontmatter en categorie-submappen. Pending stubs
  (`docs/solutions/pending-*.md`, gitignored scratch): verwerken via
  /ce-compound → herschrijven naar `[category]-[name].md` → pending-bestand
  verwijderen. NOOIT pending-\*.md committen.
- **docs/plans/** — implementatieplannen (output /ce-plan), naamconventie
  `YYYY-MM-DD-NNN-[type]-[slug]-plan.md`.
- **docs/brainstorms/** — brainstorm-output (/ce-brainstorm).
- **docs/architecture/** — actuele architectuur-doc(s).
- **docs/strategy/** — visie + master-plan + `projectstaat.md`
  (actuele feature-voortgang).
- **docs/archive/** — verouderde versies, alleen historische referentie.
- **todos/** — LEGACY zodra het project GitHub Issues gebruikt: **GitHub Issues
  is de canonieke backlog** (bugs, ideeën, taken). Nieuwe items ALTIJD als
  issue; labels: P0/P1/P2 (prioriteit), type:bug, ready:plan, blocked:owner,
  needs-testing, wip, cc (door de loop bedacht).
- **tmp/** — scratch (plan.md, sessie-export.md, rapporten); niet committen.

### CE-plugin-routing

Bij elke CE-command hoort een vaste output-bestemming — de routing is de
conventie:

| Command | Doet | Output → |
| --- | --- | --- |
| /ce-brainstorm | Opties verkennen, gap-analyse | docs/brainstorms/ |
| /ce-plan | Implementatieplan met blast radius | docs/plans/ |
| /ce-work | Bouwen volgens plan | code + PR; daarna docs/strategy/projectstaat.md bijwerken (merged PRDs afvinken, wat live is, wat open staat) |
| /ce-compound | Learnings destilleren | docs/solutions/[category]/[name].md (+ pending-\*.md opruimen) |

Afgeronde CE-artefacten committen in dezelfde of vervolg-PR als de code die ze
stuurde — nooit los untracked laten hangen.

## Anti-Patterns (portable top-lijst)

| ALWAYS | NEVER |
| --- | --- |
| Read file before editing | Assume column names or types |
| Build/typecheck before commit | Commit without build check |
| One change per commit | Multiple features in one commit |
| Separate git commands (PowerShell) | Chain with `&&` |
| Query real schema before DB-code | Write INSERT/JOIN from assumptions |
| Validate coach/LLM output against constraints | Trust AI output blind |
| Auth server-side per route | Trust user ID from request body |
| `.maybeSingle()`-achtige nul-rij-veilige reads | Single-row calls die crashen op 0/2+ rijen |
| Paste full raw error | Paraphrase errors |
| Fix code when a test fails | Change assertions to get CI green |

## Drift Prevention

If a bug is not fixed after 2 attempts: **STOP** (Two-Strike). git stash, clear
context, start fresh with a sharper prompt. Chasing the same bug with variations
of the same approach wastes sessions.

## /lfg Discipline — VERPLICHT

Het /lfg-command zelf staat in `.claude/commands/lfg.md` (8-fasen state
machine; meegeleverd in dit pakket onder `commands/`). Bij elke /lfg of
vergelijkbare grote autonome run:

1. Volg de state-machine in het plandocument met EXIT_SIGNAL per fase
2. Geen overslaan zonder expliciete reden in commit
3. Eindrapport `tmp/lfg-completion-[date].md` verplicht

Recommended permission mode: `--permission-mode auto` —
NIET `--dangerously-skip-permissions` (alleen toegestaan voor batch-ops: docs,
dependency bumps, bulk formatting; NOOIT voor logica/API/migraties/security).

## Guardrails

Twee lagen, bewust gescheiden naar betrouwbaarheid (zie
.claude/rules/guardrails.md + lint/SETUP.md):

- **Blokkerend = deterministisch:** husky pre-commit draait
  `gitleaks → tsc --noEmit → lint → slop-gate → build`. Geen false positives.
- **Adviserend = AI-analyse (mirdan of vergelijkbaar):** blokkeert NOOIT;
  draait via PostToolUse-hook en op verzoek.

## Local Settings

CLAUDE.local.md — persoonlijke voorkeuren, niet gecommit (in .gitignore).
