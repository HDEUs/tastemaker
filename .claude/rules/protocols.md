<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/protocols.md
status: lightly generalized — Protocol 7 sprak over `coach_memory` (FitTrack);
        hier veralgemeend naar "critical shared state". Verder verbatim.
-->

# Operational Protocols

## Protocols (MANDATORY — follow on every task)

### Protocol 1: Read Before Write

BEFORE modifying any file: read the full file, read relevant rules files, if API route read frontend that calls it and vice versa. Note which files you read. Why: 80% of bugs came from assumed schemas.

### Protocol 2: One Change One Test One Commit

Never multiple features in one commit. Per change: make change, build, fix if fail, lint, fix if fail, git add + commit SEPARATE.

### Protocol 3: Diagnose Before Fix

For bugs: READ code with line numbers, WRITE root cause, WRITE fix plan, THEN modify. Never guess.

**The Karpathy Move:** NEVER describe errors in your own words. Always paste the FULL RAW error stack trace. Let AI reverse-engineer the root cause from the actual output. Paraphrased errors lose critical context.

### Protocol 4: Verify the Obvious

After UI changes: check components are RENDERED and VISIBLE, not just imported. Check onClick handlers connected.

### Protocol 5: Git Discipline

Start with git status (clean). End with git add -p (MANDATORY line-by-line review), commit, push SEPARATE. Verify with git log. PowerShell: NEVER use &&.

**Reject AI Slop during git add -p:** generic variable names, leftover console.logs, placeholder TODOs, unused imports, hallucinated dependencies. If you see slop, reject the hunk and fix the code first.

### Protocol 6: Documentation Sync

After every session check rules files match actual code. Add new, REMOVE outdated.

### Protocol 7: Shared-State Verification

When touching a critical shared state object (e.g. a JSONB memory/config column that multiple code paths read and write): check its TYPE, read the interface, check every WRITE and READ location, verify the same format everywhere. Every write must preserve existing data.

### Protocol 8: Prompt Changes Are Code Changes

Read FULL prompt before changing. Change one thing. Document what and why. Check token impact against the project budget. Test with real conversation.

### Protocol 9: No Orphan Features

Done = works + visible + reachable + documented + pushed.

### Protocol 10: Scope Lock

Prompt asks 1 thing, build 1 thing. Discovered problems go to tmp/TODO.md.

### Protocol 11: Drift Prevention (Two-Strike)

If a bug is not fixed after 2 attempts: STOP. Do not try a third time. Instead: git stash or git reset --hard, clear context, start fresh with a sharper prompt. Chasing the same bug with variations of the same approach wastes sessions.

### Protocol 12: Plan Before Execute

For any task larger than a single-file change: first create a plan (list of files to touch, what changes per file, expected outcome). Write the plan to tmp/plan.md. Get approval. THEN execute. Never 'build the whole feature' in one go.

### Protocol 13: Commit Prefix

All commits made by Claude Code use the prefix [AI]: e.g. '[AI] feat: add onboarding flow', '[AI] fix: notes visible on train page'. This makes it clear which commits are AI-generated vs human.

### Protocol 14: Context Limit

At 50-70% token capacity: STOP. Write a handoff document to .claude/handoffs/[date]-[topic].md with: current status, rationale (why these decisions were made), blast radius (what files/systems are affected), immediate next steps. Then suggest starting a fresh session. Do not wait until context is nearly full.

### Protocol 15: Interactive Execution Only

`--dangerously-skip-permissions` is ONLY allowed for batch-ops: docs updates, dependency bumps, bulk formatting. NEVER for logic development, API changes, database migrations, or security-sensitive code. When writing logic, always run interactively so each change can be reviewed.

### Protocol 16: Fix Code Not Tests

When a test fails: fix the underlying code. NEVER change expected status codes, assertions, or test expectations just to make CI green — unless the test is demonstrably outdated (e.g., tests a removed feature). For CI issues: always debug root cause first. A green CI that ignores real failures is worse than a red CI.

### Protocol 17: Architecture First

Bij ELKE bug over user-facing gedrag (klik werkt niet, button doet niks, response blijft uit):

1. Lokaliseer rendering: grep src/ voor exacte UI tekst
2. Lees dat bestand: onClick, state, API calls
3. Lees API endpoints: tools, database
4. PAS DAN: root cause hypothese

Overslaan = Two-Strike. Aannames over architectuur zonder bewijs = STOP.

## Sync Protocol

- Loop: Claude.ai decides -> Claude Code builds + writes tmp/sessie-export.md -> Developer uploads to Claude.ai -> Claude.ai reviews -> repeat
- Session export format with sections: what done, doc changes, shared-state status, system prompt state, open bugs, build status, git
- Never: fix without diagnosis, build without the reviewing side knowing state, three runs without review

## Session Template

### Pre-flight

1. git status (must be clean)
2. Read CLAUDE.md
3. Read .claude/rules/protocols.md
4. Read relevant .claude/rules/ for the task
5. If .claude/handoffs/ has a recent file: read it for context

### Task

- One clear task per session

### Changes

- List changes per file

### Verification

1. tsc --noEmit (typecheck, must pass)
2. lint (must pass)
3. slop-gate lint over src/ (must pass)
4. build (must pass)
5. smoke test (must pass)
6. e2e tests (must pass, if the change touches a critical flow)
7. Check: visible, reachable, documented
8. Update relevant .claude/rules/ files

### Git

1. git add -p (MANDATORY line-by-line review)
2. git commit -m '[AI] descriptive message'
3. git push
4. git log --oneline -1
5. CE-docs commit: aan het einde van elke sessie, commit ALLE afgeronde CE-artefacten (docs/brainstorms, docs/plans, docs/solutions). NOOIT pending-\*.md committen (gitignored scratch). Een afgerond plan/solution-doc hoort in dezelfde of vervolg-PR als de code die het stuurde, niet los untracked blijven hangen.
6. PR-before-merge (DEFAULT, geen uitzondering): werk altijd op een feature-branch, open een PR, en merge die PR (squash) naar de default branch. NOOIT direct naar de default branch pushen/mergen zonder PR — ook niet voor docs of "kleine" fixes. De PR is het checkpoint: zichtbare diff, CI-checks, en een terugleesbaar spoor. Laat PR's niet openstaan: openen = ook sluiten.

### Handoff (if complex session or context limit hit)

- Write .claude/handoffs/[date]-[topic].md
- Sections: current status, rationale (why these decisions), blast radius (affected files/systems), immediate next steps
