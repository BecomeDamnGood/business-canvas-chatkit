# MCP Widget Debug Agent - Volledige Onderzoeksinstructie + Verplichte Output

## 1) Context en doel

Je werkt in repo: `/Users/MinddMacBen/business-canvas-chatkit`.

Onderzoek van A t/m Z of er een protocol-/contractmismatch is tussen UI en backend, met focus op:

1. leeg/half scherm bij startup of na klik,
2. `ACTION_START` klikt maar flow gaat soms niet door,
3. mismatch tussen wat UI verwacht en wat `run_step` teruggeeft,
4. mogelijke dualiteit tussen `step-card.html` en `step-card.bundled.html`,
5. SSOT + OpenAI MCP-app compliance.

Gebruik als referentie:

- `docs/mcp_widget_regressie_living_rapport.md`

## 2) Harde regels

1. Schrijf geen productcode.
2. Wijzig geen runtimebestanden.
3. Alleen onderzoek, bewijs, conclusie.
4. Alleen het verplichte outputrapport schrijven (markdown).
5. Alles beoordelen op:
   - SSOT (`_meta.widget_result` + ordering tuple),
   - UI-dumbness (geen business-routing in UI),
   - OpenAI MCP-app compatibiliteit.

## 3) Verplichte onderzoeksvragen

### A. Live widget-keuze en routing

1. Welke widget-HTML wordt live echt geserveerd?
   - Waar in code gekozen?
   - Welke `openai/outputTemplate` URI wordt gebruikt?
2. Bestaat er een pad waarbij beide HTML-varianten live kunnen zijn?
   - routes/fallbacks/build artifacts/cache/versioning.

### B. Contractverwachting UI vs backend output

3. Verwacht de actieve UI-variant verplicht `result.ui.actions[]`?
   - met exacte codeverwijzingen.
4. Levert backend `run_step` altijd `ui.actions[]` op momenten dat UI ze nodig heeft?
   - met code + voorbeelden uit logs/trace.
5. Wordt `ui.actions[]` mogelijk eerst gezet en later weggefilterd?
   - check sanitizer/validator/model-safe shaping/output schema/ingest-normalizer/ordering/correlation.
   - verplicht: trace van `run_step` tool-result -> wrapper/meta -> widget ingest -> render.

### C. SSOT en action codes

6. SSOT-check voor render-state:
   - is `_meta.widget_result` + tuple overal leidend?
7. SSOT-check voor action codes:
   - waar worden action codes gedefinieerd?
   - is er exact 1 bron?
   - doet UI business-routing of alleen dispatch op server-geleverde action code?

### D. OpenAI MCP-app compliance

8. Check op:
   - outputTemplate,
   - widgetAccessible,
   - correcte tool-result vorm,
   - loading/failure UX zonder dead-end.

## 4) Verplicht extra onderzoek over de 2 HTML-bestanden

Deze 3 punten moeten expliciet en hard bewezen worden:

1. **Welke is SSOT-bron en welke build-artifact?**
   - Leg vast of `step-card.html` bron is en `step-card.bundled.html` gegenereerd artifact (of andersom).
   - Eis: er is exact 1 live entrypoint.

2. **Kunnen ze allebei live gebruikt worden (direct of fallback)?**
   - Onderzoek:
     - server routes die beide varianten aanbieden,
     - `outputTemplate` verwijst naar A terwijl andere paden naar B wijzen,
     - caching/versioning waardoor oude HTML actief kan blijven.
   - Conclusie verplicht: "uitgesloten" of "niet uitgesloten", met bewijs.

3. **Verwachten beide exact hetzelfde dataformaat?**
   - Als contractverwachting verschilt (bijv. bundled verwacht `ui.actions[]`, andere variant niet), dan is dubbele live-inzet automatisch een bugbron.
   - Maak verplicht eindbesluit:
     - of altijd variant zonder `ui.actions`-vereiste,
     - of backend altijd `ui.actions[]` + alleen die variant live.

Kernregel:

- Twee HTML-bestanden zijn alleen veilig als exact 1 live entrypoint bestaat, en die live variant exact het backend-contract verwacht.

## 5) Verplichte bestanden om te inspecteren

- `mcp-server/server.ts`
- `mcp-server/ui/step-card.html`
- `mcp-server/ui/step-card.bundled.html`
- `mcp-server/ui/step-card.template.html`
- `mcp-server/ui/lib/main.ts`
- `mcp-server/ui/lib/ui_actions.ts`
- `mcp-server/ui/lib/ui_render.ts`
- `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
- `mcp-server/src/handlers/run_step.ts`
- `mcp-server/src/mcp_app_contract.test.ts`
- `mcp-server/src/ui_render.test.ts`
- `mcp-server/scripts/build-ui.mjs`
- `docs/mcp_widget_regressie_living_rapport.md`

## 6) Live checks (voorkeur) + fallback als niet beschikbaar

### Als productie-URL/logs beschikbaar zijn

Voer uit:

1. `curl -sS -D - <public-url>/ui/step-card?...`
2. `curl -sS -D - <public-url>/version`
3. CloudWatch-query op:
   - `run_step_request`
   - `run_step_response`
   - `run_step_render_source_selected`
   - `ui_ingest_dropped_no_widget_result`
   - `stale_bootstrap_payload_dropped`
   - `ui_start_dispatch_ack_without_state_advance`
4. Noteer timestamps, correlation IDs, trace IDs.

### Als CloudWatch/curl niet beschikbaar is

Bewijs via:

1. server routes,
2. build output/artifacts,
3. embedded tool metadata (`outputTemplate`, widget settings),
4. code-level trace van tool-result naar ingest naar render.

## 7) Verplicht outputbestand (markdown)

Schrijf het resultaat in:

- `docs/mcp_widget_debug_agent_resultaat.md`

En gebruik exact dit format:

1. Executive summary (max 10 regels).
2. Bewijstabel:
   - hypothese
   - bewijs vóór
   - bewijs tégen
   - verdict (bevestigd / verworpen / onbeslist)
3. Welke HTML is live (met codeverwijzingen).
4. UI verwacht vs backend levert (matrix).
5. Wordt `ui.actions` later weggefilterd? (end-to-end trace).
6. SSOT-compliance matrix (`V / ? / x`) inclusief action-code SSOT.
7. OpenAI MCP-compliance matrix (`V / ? / x`).
8. Risicoanalyse:
   - Route A: overal `step-card.html`
   - Route B: backend altijd `ui.actions[]` + bundled live
9. HTML EntryPoint Verdict:
   - SSOT-bronbestand:
   - Build-artifact:
   - Live entrypoint:
   - Is dubbele live-inzet uitgesloten? (ja/nee + bewijs)
   - Is caching/versioning-afdekking aantoonbaar? (ja/nee + bewijs)
10. Eindadvies: kies exact 1 route met motivatie.
11. Follow-up checklist (max 10 punten, alleen verifieerbaar).

## 8) Definitie van klaar

Alles hieronder moet waar zijn:

1. Alle onderzoeksvragen beantwoord met bewijs.
2. Eén eenduidige conclusie over live HTML entrypoint.
3. Eén eenduidige conclusie over `ui.actions` mismatch/filtering.
4. SSOT (incl. action-code SSOT) beoordeeld met V/?/x.
5. OpenAI MCP-compliance beoordeeld met V/?/x.
6. Output staat volledig in `docs/mcp_widget_debug_agent_resultaat.md`.

