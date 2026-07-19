<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/security.md (sectie "Houding" + architectuurprincipes)
        en docs/solutions/conventions/pragmatic-eu-security-stance-data-minimization-2026-06-09.md
status: extracted — de FitTrack-specifieke policies (tabellen, CSP-domeinen,
        consent-vlakken) zijn weggelaten; de staande houding en de generieke
        principes zijn verbatim overgenomen.
-->

# Security-houding (standaard, elke taak)

Behandel security als **pragmatisch security-specialist met een Europese
(AVG/GDPR) bril**. Dit is een staande houding, niet een eenmalige audit-modus.

## De houding

1. **Data-minimalisatie is de default (AVG art. 5(1)(c)).** Exposeer alleen de
   kolommen/rijen/velden die een consument écht nodig heeft. Als een veld niet
   nodig is voor de client, hoort het niet leesbaar te zijn voor de client —
   ook als de data "niet zo gevoelig" is. Onnodige blootstelling dicht je,
   ook bij lage severity, in plaats van wegredeneren.
2. **Pragmatisch, niet absolutistisch.** Weeg severity tegen breekrisico.
   Kies de kleinste chirurgische fix die het gat dicht zonder functie te
   breken. Niet gold-platen (geen velden locken die de app legitiem nodig
   heeft); niet onder-acteren (geen triviaal exploiteerbare exposure open
   laten omdat het "low severity" is).
3. **Verifieer exposure én fix met bewijs, niet met aannames.** Bevestig wie
   een veld daadwerkelijk kan lezen (bijv. `has_column_privilege` in
   Postgres), en bevestig dat de fix geen echt leespad breekt (grep wie het
   leest) — vóór en ná de wijziging.
4. **Defense-in-depth.** Middleware/proxy is GEEN security boundary
   (CVE-2025-29927). RLS is de primaire laag, auth in elke API route de
   tweede, input-validatie de derde, security headers de vierde. Geen enkele
   laag mag alleen staan.
5. **Eerst vastleggen, dan handelen.** Leg de beslissing vast (wat was
   blootgesteld, waarom gedicht of geaccepteerd) zodat het niet als verrassing
   terugkomt — dan pas de wijziging doorvoeren.

## Generieke architectuurprincipes

- **Service role bypassed RLS volledig.** Elke query met service role MOET alle
  velden valideren tegen expected types en ranges VOORDAT de query wordt
  uitgevoerd. Geef nooit user-supplied data ongevalideerd door aan een
  service-role query. Comment bij elk service-role-gebruik waarom.
- **User ID komt ALTIJD uit de sessie/cookie, NOOIT uit de request body.**
- **Error disclosure:** 500's geven alleen een generieke melding. Stack traces
  en database-errors NOOIT in de response body; technische details alleen
  server-side naar console/monitoring. Bij 400: beschrijvende melding zonder
  interne veldnamen of queries.
- **Prompt injection:** harde lengte-cap op user-berichten; GEEN
  blacklist/pattern-stripping (onbetrouwbaar, vals gevoel van veiligheid);
  expliciete rol-vastheid in de system prompt; ALLE derden-tekst (namen,
  notities, methodologie) door gedeelde sanitizers vóór prompt-injectie;
  verdachte berichten loggen, niet blokkeren; LLM-output valideren tegen
  DB-constraints vóór persist ("vertrouw geen input — niet van de gebruiker,
  niet van de AI").
- **Postgres kolom-grant-valkuil:** een `REVOKE SELECT (kolom)` tegen een
  TABEL-grant dropt de héle-tabel SELECT. Juiste idioom: `REVOKE SELECT ON
  table` + `GRANT SELECT (alle kolommen behalve de geheime)`. Altijd
  verifiëren met `has_column_privilege`. PostgREST faalt bovendien de hele
  query op één geweigerde kolom → nooit `select('*')` op een tabel met een
  verborgen kolom.
- **Secrets:** geen `NEXT_PUBLIC_` op geheime keys; secret-scanning (gitleaks)
  lokaal in pre-commit én in CI; MCP-tokens nooit in code committen.
