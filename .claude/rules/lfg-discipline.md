<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/lfg-discipline.md
status: lightly generalized — de voorbeelden verwezen naar FitTrack-flows
        (PT-review, /trainer); hier vervangen door generieke voorbeelden.
        De regels zelf zijn verbatim.
-->

# /lfg Discipline Rules

## Verplicht bij elke /lfg sprint (grote autonome run)

### 1. Acceptance Criteria Format

Elk WP MOET concrete acceptance criteria hebben in dit format:

```
User kan [ACTIE] via [SCHERM] met resultaat [STATE CHANGE]
```

Voorbeeld:

- "User klikt 'Bevestig' op de confirm-stap → onComplete() wordt aangeroepen → generatie start"
- "Admin klikt 'Goedkeuren' → record-status verandert naar approved"

Vaag ("review werkt") is NIET acceptabel.

### 2. DONE-markering vereist code-bewijs

Bij markering van WP als DONE:

- Per acceptance criterium: file:line bewijs dat code bestaat
- Grep-verificatie dat features daadwerkelijk bestaan
- NOOIT DONE markeren op basis van "ik heb het gebouwd" zonder bewijs

### 3. Compound entries vanuit code, niet plan

Bij schrijven van docs/solutions/:

- Grep de codebase voor bewijzen VOORDAT je schrijft
- Vermeld file:line references
- Als een feature in het plan stond maar niet gebouwd is: documenteer als ONTBREKEND

### 4. End-to-end flow check per sprint

Na alle WPs: loop de volledige user journey:

1. Signup → onboarding → kernflow → resultaat
2. Per stap: check of data consistent doorstroomt (taal, profielvelden, statussen)
3. Check voor dead code: gedefinieerde maar ongebruikte functies

### 5. Partial implementation signalering

Als een WP meer dan 3 items bevat:

- Maak een checklijst in het plan per item
- Vink af per gebouwd item
- Bij skip: documenteer WAAROM met reden
- NOOIT de hele WP als DONE markeren als items ontbreken

### 6. Review moet zoeken naar wat ONTBREEKT

Review agents moeten niet alleen kijken naar wat er IS (bugs in bestaande code), maar ook naar wat ONTBREEKT:

- Zijn alle geplande velden aanwezig in types?
- Worden alle gedefinieerde functies daadwerkelijk aangeroepen?
- Stroomt data end-to-end door (UI → API → DB → terug)?

### 7. Browser-test verplicht voor flow-features

- Browser-tests (Playwright) zijn verplicht voor flow-features, GEEN curl-test als acceptance
- Curl-tests testen endpoint bereikbaarheid, NIET gebruikersflow
- Test ALTIJD met bestaande accounts (met historie), niet alleen fresh accounts
- Fresh accounts triggeren eerste-gebruik-flows die andere codepaden volgen

### 8. Diagnose ZONDER fix bij recursive bugs

- Bij bugs die >2x terugkomen: EERST volledig diagnose-document schrijven
- GEEN code wijzigen tijdens diagnose-fase
- DB-queries naar de betrokken tabellen VERPLICHT bij flow-bugs
- Pas NA bewezen root cause: fix implementeren

### 9. Tool descriptions zijn code, niet documentatie

- LLM tool descriptions OVERRIDEN prompt instructions wanneer ze conflicteren
- Bij prompt-wijzigingen: ALTIJD ook tool descriptions checken op conflicten
- Tool descriptions moeten mode-aware zijn als gedrag per mode verschilt
- Server-side enforcement > prompt instructie voor kritieke flows
