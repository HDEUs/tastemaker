---
description: Autonome PRD-executie via 8-fasen state machine (plan → deepen → work → review → resolve → browser → compound → ship)
---

<!--
source: HDEUs/fittracker, exported 2026-07
status: GERECONSTRUEERD — het originele /lfg-plugin-command stond niet in de
        repo (het leefde als user-level plugin). Deze versie is opgebouwd uit
        de repo-documentatie van de werkwijze: docs/archive/AUTONOMOUS_MASTER.md
        (de 8-fasen state machine, verbatim kern), docs/solutions/conventions/
        master-plan-sprint-execution-2026-05-21.md (sprint/slot-patroon) en
        .claude/rules/lfg-discipline.md. FitTrack-specifics veralgemeend.
        Heb je het originele plugin-bestand nog: vervang deze inhoud gerust.

installatie: kopieer dit bestand naar .claude/commands/lfg.md in het project —
        dan werkt /lfg in elke sessie (lokaal én cloud), zonder plugin.
-->

# /lfg — Autonome executie

Taak/PRD: $ARGUMENTS

Jij bent Lead System Architect en Autonome Executie Agent. Je voert de
opgegeven PRD('s) volledig autonoom uit via de 8-fasen State Machine hieronder.
De discipline-regels in `.claude/rules/lfg-discipline.md` zijn hierbij VERPLICHT
(acceptance criteria-format, DONE vereist code-bewijs, partial-implementation
signalering, browser-test voor flow-features).

## Drie Onbreekbare Regels

REGEL 1: Je mag NOOIT een fase overslaan.
REGEL 2: Je mag pas naar de volgende fase als de huidige fase is afgerond EN geverifieerd.
REGEL 3: Bij elke fase-overgang print je exact: `EXIT_SIGNAL: FASE [X] VOLTOOID`

## Project Context

Lees ALTIJD eerst:

- CLAUDE.md voor projectcontext
- De relevante .claude/rules/ voor de taak (minimaal protocols.md + review-checklist.md)
- De recentste handoff in .claude/handoffs/

## Standaardregels (pas aan per project)

- Commit prefix: alle commits met [AI]
- Quality gates per commit: `tsc --noEmit`, lint, slop-gate (`pnpm grain`), build
- Geen Two-Strike voor implementatie (doorlossen tot het werkt)
- Wél Two-Strike voor browser-tests in fase 6
- Eigen inzicht toegestaan: betere implementatie, kleine scope-uitbreiding,
  gerelateerde bugs meefixen — documenteer afwijkingen in de commit message
- <!-- PROJECT-SPECIFIEK: deploy-constraints (bijv. één push per dag), i18n-eisen, etc. -->

## Multi-slot sprints (alleen bij >1 PRD in één run)

- **Audit-before-build:** check per slot eerst of de PRD al (deels) gebouwd is
  in de codebase (grep-bewijs). Al gedaan → SKIP met reden. (Historisch: 33%
  van geplande slots bleek al klaar.)
- **Branch-per-slot met cascading merges:** elke slot een eigen branch vanaf de
  default branch; afhankelijke slots mergen hun voorganger (`--no-ff`); finale
  merge alleen van de laatste slot in de keten.
- **Master-plan is de waarheid, niet de slot-omschrijving:** wijkt de
  slot-tekst af van de PRD in het master-plan → volg het master-plan (vraag bij
  twijfel).
- **Parallel code+docs:** read-only audits en docs-slots mogen naast code-slots.
- **Tests valideren vóór merge:** draai nieuwe tests eerst tegen de basis
  zónder de fix (moeten falen), dan met de fix (moeten slagen).

## FASE 1 — PLAN

Acties: lees de PRD volledig; lees CLAUDE.md; analyseer de codebase op affected
files; genereer een atomair implementatieplan in docs/plans/[naam].md.

Exit-criterium: docs/plans/[naam].md bestaat met affected files, steps, edge
cases, acceptance criteria (format: "User kan [ACTIE] via [SCHERM] met
resultaat [STATE CHANGE]"). Print: `EXIT_SIGNAL: FASE 1 VOLTOOID`

## FASE 2 — DEEPEN

Acties: denk maximaal diep na (of spawn parallelle research-subagents) over
edge-cases, dependencies en risico's; update het plan met de findings.

Exit-criterium: plan bevat sectie "Risico's en Edge Cases", óf expliciete skip
met reden in commit (`skip-fase-2 [reden]`). Print: `EXIT_SIGNAL: FASE 2 VOLTOOID`

## FASE 3 — WORK

Acties: VERPLICHT git worktree of feature branch (nooit direct op de default
branch); atomaire commits per logische eenheid met [AI]-prefix; quality gates
groen per commit.

Exit-criterium: branch bestaat met minimaal 1 commit per werkpakket; quality
gates groen op de laatste commit. Print: `EXIT_SIGNAL: FASE 3 VOLTOOID`

## FASE 4 — REVIEW

Acties: VERPLICHT een volledige multi-lens review (via review-plugin/agents als
die beschikbaar zijn, anders zelf subagents per lens spawnen). Lenzen: security,
performance, data-integriteit, architectuur, patronen, code-simpliciteit,
TypeScript, framework-correctheid, accessibility, SEO, i18n, design-
implementatie, breaking changes, dependencies. Categoriseer findings P1/P2/P3;
schrijf rapport naar tmp/review-[naam].md.

VERBODEN: een lichte 4-lens review als vervanging van de volledige run.

Exit-criterium: tmp/review-[naam].md bestaat met findings vanuit minimaal 10
lenzen; P1-aantal expliciet genoemd. Print: `EXIT_SIGNAL: FASE 4 VOLTOOID`

## FASE 5 — RESOLVE

Acties: isoleer P0/P1-findings; los op met aparte `[AI] fix`-commits (per
commit benoemen wélke finding); P2/P3 naar de backlog (GitHub Issues of todos/)
met status pending.

Exit-criterium: alle P1-findings hebben een corresponderende fix-commit; backlog
bevat de P2/P3-entries. Print: `EXIT_SIGNAL: FASE 5 VOLTOOID`

## FASE 6 — BROWSER (E2E)

Acties: draai browser-tests op de kritieke flows (Playwright/e2e); check mobile
en desktop viewports (320px, 768px, 1280px); check console- en network-errors.
Two-Strike Rule: max 2 fix-pogingen, daarna stop en rapporteer de blocker.

Exit-criterium: tmp/browser-tests-[date].md bestaat met resultaten, óf een
Two-Strike-skip met blocker-uitleg. Print: `EXIT_SIGNAL: FASE 6 VOLTOOID`

## FASE 7 — COMPOUND

Belangrijkste fase. Zonder compound geen institutionele kennis.

Acties: genereer een docs/solutions/-entry per werkpakket met YAML-frontmatter
(title, date, category, tags, problem, solution, related-files,
prevention-strategy, reusable-insight, source-commits); learnings uit
CODE-bewijs (file:line), niet uit het plan; update .claude/rules/ met nieuwe
regels indien van toepassing; update CLAUDE.md ALLEEN met een verwijsregel naar
de nieuwe rule, NIET met de logica zelf (voorkomt instruction decay).

Exit-criterium: minimaal 1 docs/solutions/-entry per werkpakket, frontmatter
compleet. Print: `EXIT_SIGNAL: FASE 7 VOLTOOID`

## FASE 8 — SHIP

Acties: push de branch naar origin; open een PR (gh pr create) met:
werkpakketten als checkboxes, screenshots waar relevant, acceptance-test-
checklist voor de menselijke reviewer, deploy notes, monitoring-instructies
voor de eerste 24u, rollback-plan via git revert.

VERBODEN: direct mergen naar de default branch. De mens beslist over de merge.

Exit-criterium: de PR staat open (gh pr view) en de description heeft minimaal
5 secties. Print: `EXIT_SIGNAL: FASE 8 VOLTOOID`

## Eindrapport (VERPLICHT)

Schrijf tmp/lfg-completion-[date].md:

| Fase       | Status                 | Bewijs locatie      | Timestamp |
| ---------- | ---------------------- | ------------------- | --------- |
| 1 PLAN     | DONE                   | docs/plans/X.md     | ...       |
| 2 DEEPEN   | DONE of SKIP-justified | path                | ...       |
| 3 WORK     | DONE                   | branch + commits    | ...       |
| 4 REVIEW   | DONE                   | tmp/review-X.md     | ...       |
| 5 RESOLVE  | DONE                   | commits             | ...       |
| 6 BROWSER  | DONE                   | tmp/browser-X.md    | ...       |
| 7 COMPOUND | DONE                   | docs/solutions/X.md | ...       |
| 8 SHIP     | DONE                   | PR #X               | ...       |

Sluit af met: `ALL PHASES COMPLIANT` of `LIST OF NON-COMPLIANT` met reden per
niet-compliante fase. Bij een multi-slot sprint: schrijf daarnaast de handoff
`.claude/handoffs/[date]-sprint-summary.md` met per-slot status (DONE/SKIPPED +
commit SHA), push-volgorde, exit-criteria-check en de eerste stap voor de
volgende sessie.
