<!--
source: HDEUs/fittracker, exported 2026-07
origineel: .claude/rules/csp-when-adding-sdks.md
status: lightly generalized — "src/proxy.ts" vervangen door "het centrale
        CSP-configbestand"; de regel, tabel en verificatiestappen zijn verbatim.
-->

# Rule — CSP When Adding Third-Party SDKs

**Prio:** P1 — voorkomt regressie

## Doel

Voorkom dat nieuwe third-party SDKs (Sentry, Stripe, PostHog, etc.) stilletjes
falen doordat CSP hun network calls blokkeert.

## Regel

**Wanneer Claude Code een third-party SDK toevoegt die browser-side of
server-side network calls maakt, MOET Claude Code:**

1. Controleer of de SDK een endpoint-domein vereist in `connect-src`
2. Update het centrale CSP-configbestand (`connect-src` directive) met een
   specifieke wildcard (bijv. `https://*.ingest.de.sentry.io`, niet `*.sentry.io`)
3. Update het inline comment-block boven de CSP-config met de nieuwe entry + reden
4. Als SDK ook scripts van een externe CDN laadt: update ook `script-src`
5. Als SDK iframes toont: update ook `frame-src`

## Voorbeelden (om te herkennen)

| SDK              | connect-src toevoeging                          | script-src toevoeging | Reden              |
| ---------------- | ----------------------------------------------- | --------------------- | ------------------ |
| Sentry (EU)      | `https://*.ingest.de.sentry.io`                 | —                     | Error event ingest |
| Sentry (US)      | `https://*.ingest.us.sentry.io`                 | —                     | Error event ingest |
| Stripe           | `https://api.stripe.com`                        | —                     | Payment API        |
| PostHog (EU)     | `https://eu.i.posthog.com`                      | —                     | Event capture      |
| Vercel Speed Ins | `https://vitals.vercel-insights.com`            | `https://va.vercel-scripts.com` | Web Vitals ingest |
| Anthropic        | `https://api.anthropic.com`                     | —                     | LLM API            |
| Supabase         | `https://*.supabase.co` + `wss://*.supabase.co` | —                     | DB/auth/realtime   |

## Anti-patterns

- ❌ Whitelist `*.sentry.io` (te breed — ook marketing/blog)
- ❌ Whitelist `*` of `https:` (security = stuk)
- ❌ Toevoegen aan één CSP string (dev **of** prod) zonder de andere
- ❌ SDK toevoegen zonder CSP check en hopen dat het werkt

## Verificatie

Na elke CSP-wijziging:

1. Build lokaal
2. Deploy naar preview
3. Open preview-URL in Chrome, F12 → Console
4. Klik door de feature die de nieuwe SDK gebruikt
5. **Zoek in Console naar "Refused to connect" of "violates the following
   Content Security Policy"**
6. Als CSP errors zichtbaar: fix vóór productie-merge

## Historische context

In het bronproject is ooit Sentry toegevoegd zonder CSP-update. De SDK zond
events, CSP blokkeerde ze. Resultaat: 7 dagen blinde productie zonder error
monitoring, pas ontdekt bij een debugsessie. Deze regel bestaat om dat niet
opnieuw te laten gebeuren.
