<!--
source: HDEUs/fittracker, exported 2026-07
gebaseerd op: .claude/rules/review-checklist.md (huidige stand, punten 0-16)
        + twee impliciete conventies uit de praktijk (model-keuze,
        query-correctheid in alle states) die in de bron-repo wel in code/gotchas
        zaten maar niet in de checklist stonden — hier expliciet gemaakt.
-->

# Architectuur-review-checklist (doorloop VOOR elke Claude Code-prompt)

Gebruik: loop deze lijst langs vóór je een prompt geeft die code raakt, en laat
Claude Code 'm nogmaals doorlopen vóór het schrijven. Punt 0 eerst, altijd.

## 0. Schema first

Query de ECHTE kolommen voordat er code komt die de database raakt. Nooit een
INSERT, SELECT, UPDATE of JOIN op basis van aannames; bij twijfel
`information_schema` queryen. Kolomnamen in code = databasekolommen, exact.

## 1. RLS / autorisatie

Kan user A bij user B's data? Elke INSERT/UPDATE/SELECT policy nalopen. De
volledige ownership-chain expliciet (wie ben je → is dit record van jou →
heb je consent/rechten). Middleware/proxy telt NIET als boundary.

## 2. CHECK-constraints

Numerieke en enum-velden matchen met de DB-constraints (ranges, toegestane
statussen). Frontend-validatie matcht dezelfde grenzen.

## 3. Edge cases

Dubbel klikken. Geen data (0 rijen). Meerdere rijen waar je er één verwacht.
Halverwege gestopt (partial failure). Pagina-refresh midden in een flow.

## 4. Query-correctheid in alle states

<!-- impliciet in de bron-repo (gotchas), hier expliciet -->
Klopt de query in élke datastand: geen rijen, één rij, duplicaten, legacy-rijen
met NULL in later toegevoegde kolommen, en álle status-waarden (ook legacy
statussen die nog in de CHECK-constraint zitten)? Nul-rij-veilige reads
(`.maybeSingle()`-stijl, of `order().limit()` + `[0]` waar duplicaten kunnen
bestaan); nieuwe statussen → alle lezende endpoints bijwerken.

## 5. Auth

Server-side auth-check op elke route. User ID ALTIJD uit de sessie/cookie,
NOOIT uit de request body. Publieke routes zijn een expliciete, benoemde
uitzondering.

## 6. Foreign-key-referenties

Kloppen de FK-relaties die de code aanneemt met het echte schema? Insert-volgorde
respecteert FK-afhankelijkheden (parent vóór child); deletes in omgekeerde
volgorde; let op nullable FK's en cascades.

## 7. Service role

Alleen waar nodig, met comment waarom. Alle user-supplied velden valideren
tegen expected types/ranges VOORDAT een service-role query draait (service role
bypasst RLS volledig).

## 8. Race conditions

UNIQUE-constraints of idempotente writes voor alles wat dubbel kan vuren.
Statustransities in één operatie (geen TOCTOU-window tussen check en update).

## 9. Type safety

Geen `any`. Null-checks op optionele velden. Runtime kan `null` zijn waar de
types `undefined` zeggen — falsy-check dekt beide.

## 10. Error handling

Try/catch op externe calls. Leesbare foutmeldingen voor de user; technische
details alleen server-side. 500 = generieke melding, nooit interne details.

## 11. Data leaks

API-responses bevatten alleen de benodigde velden (data-minimalisatie, zie
rules/security-stance.md).

## 12. Secrets

Geen `NEXT_PUBLIC_` op geheime keys. Geen hardcoded secrets.

## 13. Model-keuze (LLM)

<!-- impliciet in de bron-repo, hier expliciet -->
Bewust kiezen per taak: het sterkere model (Sonnet-klasse) voor de kernflows
met redeneerwerk; het goedkope model (Haiku-klasse) voor mechanische taken
waar kwaliteitsverschil er niet toe doet. Modelbron centraal (één
`getModel()`-achtige helper, niet per route hardcoden); weet dat een model-swap
de prompt-cache één keer invalideert (cache is model-scoped — verwacht, geen
regressie). Tool descriptions overriden de prompt: houd ze consistent.

## 14. Mobile

Knoppen min 48px. Labels op inputs. `inputmode` correct.

## 15. N+1 queries

JOINs of Promise.all, geen waterval van losse queries.

## 16. Output-zichtbaarheid

Als AI-gegenereerde inhoud (notes, instructies) wordt opgeslagen, moet die ook
zichtbaar/bereikbaar zijn voor de user (geen orphan features).

## 17. Shared-state-consistentie

Elke write naar een gedeeld state-object (memory/config JSONB) behoudt
bestaande data; elk nieuw schrijfpad wordt toegevoegd aan de gedocumenteerde
lijst van WRITE-locaties.
