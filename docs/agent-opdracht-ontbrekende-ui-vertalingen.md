# Agent-opdracht: ontbrekende UI-vertalingen invullen

Lees eerst:
- `docs/overzicht-ontbrekende-ui-vertalingen.md`

Voer daarna exact dit uit:
1. Werk per taal alleen de keys bij die in het document als "Nog te vertalen" staan.
2. Pas uitsluitend deze bestanden aan: `mcp-server/src/i18n/ui_strings/locales/ui_strings_<locale>.ts`.
3. Vertaal EN-brontekst naar de doeltaal met placeholders exact ongewijzigd: `{0}`, `{1}`, `{2}`, `N`, `M`, `X`.
4. Laat technische tokens intact waar nodig (bijv. `[ui_error]`), maar vertaal functionele UI-tekst volledig.
5. Voeg geen hardcoded UI-tekst toe buiten locale-bestanden.
6. Controleer na afloop dat er geen key ontbreekt en dat alle locale-bestanden compileerbaar blijven.

Oplevering:
- Lijst van aangepaste bestanden.
- Per taal: aantal ingevulde keys.
- Eventuele bewust ongewijzigde keys met korte reden.
