<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/mirdan.md (sectie "Guardrail-architectuur") +
        .claude/rules/bugs-and-priorities.md (schijn-guardrails-audit) +
        docs/solutions/tooling-decisions/schijn-guardrails-configured-but-never-firing-2026-06-28.md
status: generalized — mirdan-tool-tabellen en FitTrack-paden weggelaten; de
        twee-lagen-architectuur en de harde lessen zijn de conventie.
-->

# Guardrail-architectuur

Twee lagen, bewust gescheiden naar betrouwbaarheid:

## Laag 1 — Blokkerend = deterministisch (geen false positives)

De husky pre-commit (`.husky/pre-commit`) draait, in deze volgorde:

```
gitleaks (secrets) -> tsc --noEmit -> lint -> slop-gate (eslint src/) -> build
```

- **ESLint is de AI-slop-gate** (zie `lint/eslint.config.mjs` in dit pakket):
  placeholder-throws, TODO/FIXME-comments, dode imports/variabelen,
  string-geïnterpoleerde SQL, en `console.log` in UI-code blokkeren de commit.
  `error`-regels blokkeren; server-paden die bewust naar platform-logs
  schrijven krijgen `warn` voor `no-console`.
- **gitleaks** draait lokaal als hard gate met graceful skip als de binary
  ontbreekt — de CI-gitleaks-job is dan de niet-omzeilbare backstop. Commando:
  `gitleaks git --staged` (NIET het deprecated `protect`).

## Laag 2 — Adviserend = AI-analyse (heeft false positives)

AI/regex-gebaseerde code-review-tooling (mirdan of vergelijkbaar) blokkeert
**NOOIT**. Het draait (a) automatisch tijdens AI-edits via een PostToolUse-hook
en (b) op verzoek via skills/MCP-tools. Reden: bewezen false-positive-historie;
een blokkerende gate die soms onterecht rood is, wordt omzeild of genegeerd en
ondermijnt daarmee ook de terechte signalen.

## Harde lessen (schijn-guardrails-audit)

Een guardrail die geconfigureerd lijkt maar nooit vuurt is erger dan geen
guardrail — je vertrouwt op bescherming die er niet is. Checks bij elke
guardrail-wijziging:

1. **Hooks moeten geregistreerd staan in `.claude/settings.json`** — een script
   in `.claude/hooks/` vuurt NIET vanzelf op naamconventie, en Claude Code
   leest ALLEEN `settings.json` (niet een los `hooks.json`).
2. **PostToolUse-hooks krijgen hun payload als JSON op stdin** — parse het
   bestandspad uit `tool_input.file_path` (met `node` als `jq` ontbreekt).
   `$CLAUDE_FILE_PATH` is een legacy/dood pattern.
3. **`husky` MOET in `devDependencies`** — `prepare: "husky || true"` slikt de
   fout, dus zonder de dependency krijgt een verse clone STIL geen git-hooks.
4. **Verifieer dat elke gate daadwerkelijk vuurt** (bewust een overtreding
   staged committen en de weigering zien) voordat je erop vertrouwt.
5. **Framework-configs zonder geïnstalleerd framework verwijderen** (bijv. een
   `.pre-commit-config.yaml` terwijl het Python-framework nergens draait).

## AI-quality-regelset (referentie-nummering)

- **AI001**: No placeholder code (`NotImplementedError`, TODO-throws)
- **AI002**: No hallucinated imports — verify every import exists
- **AI003**: No invented APIs — verify signatures against source
- **AI004**: No dead code — unused functions/variables/imports weg
- **AI005**: No copy-paste artifacts — geen duplicate blocks
- **AI006**: No inconsistent naming — volg codebase-conventies
- **AI007**: No unvalidated input — valideer op system boundaries
- **AI008**: No string injection — nooit user input concateneren in SQL/eval/shell

TypeScript-specifiek: `const`/`let` niet `var`; geen `as any` (gebruik
`as unknown` of narrowing); geen `console.log` in UI-productiecode
(console.error/warn OK); `===` niet `==`; optional chaining (`?.`) en nullish
coalescing (`??`).
