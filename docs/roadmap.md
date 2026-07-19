# Roadmap — Tastebank

## v1 — Capture + analyse (NU)

- Telegram-bot ontvangt screenshots, tekst, voice notes, links, korte video's
- Webhook slaat alles direct op (capture faalt nooit door analyse)
- Async analyse per entry met Claude (abstracte principes, anti-copy)
- Commands: /start, /stats, /laatste, /profiel, /analyse
- Versioned taste profile in `taste_profile`

**Poort naar v2:** minimaal 30 geanalyseerde entries. Eerder beginnen aan
generatie = scope creep, ook als de owner het zelf vraagt.

## v2 — Generatie + similarity check

- LinkedIn-postgeneratie op basis van het taste profile (LinkedIn-only scope)
- Similarity check tegen bron-entries als anti-copy-vangnet
- Origineel bronmateriaal blijft buiten elke generatieprompt

## v3 — Publicatie + visuals

- Buffer-publicatie
- Nano Banana-visuals

Verouderde versies van dit document → `docs/archive/` met datum in de naam.
