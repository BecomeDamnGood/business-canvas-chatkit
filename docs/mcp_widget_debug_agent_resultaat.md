# 1. Executive summary
- In deze codebase is er geen `mcp-server/ui/step-card.html`; alleen `step-card.template.html` (bron) en `step-card.bundled.html` (artifact) bestaan.
- Live MCP-entrypoint wijst naar `/ui/step-card?v=<VERSION>` en serveert `step-card.bundled.html`.
- `openai/outputTemplate` en `openai/widgetAccessible` zijn correct ingesteld op dezelfde UI-resource.
- UI gebruikt `_meta.widget_result` als primaire SSOT; fallback is `structuredContent.result`.
- `ui.actions[]` is niet overal verplicht: prestart gebruikt `state.ui_action_start`; choice-buttons gebruiken `ui.actions[]`.
- Backend levert `ui.actions[]` contract-gedreven bij menustaten, maar niet in alle states (bv. wording-choice/scoring/no-buttons paden).
- Er is geen bewijs dat `ui.actions[]` in widget-ingest later “weggesaneerd” wordt; de belangrijkste filtering is bewust in `buildModelSafeResult` (structuredContent minimaliseert UI-data).
- Leeg/half scherm en start-hang blijven plausibel lifecycle/ordering issues; living rapport meldt dit nog op 2026-02-27.
- Dubbele live-inzet van `step-card.html` + bundled is in deze repo uitgesloten (bestand ontbreekt), maar template + bundled zijn beiden via `/ui/*` opvraagbaar.
- Eindadvies: kies 1 live entrypoint (`/ui/step-card` -> bundled) en borg servercontract voor alle interactieve menustaten.

# 2. Bewijstabel
| hypothese | bewijs vóór | bewijs tégen | verdict |
|---|---|---|---|
| `step-card.bundled.html` is live runtime-entrypoint | `server.ts:1110`, `server.ts:2655-2657`, `server.ts:2096-2103`, `server.ts:2143` | geen code die `step-card.html` laadt | bevestigd |
| `step-card.html` kan live geserveerd worden | geen (bestand ontbreekt in `mcp-server/ui`) | `ls` toont alleen `step-card.template.html` + `step-card.bundled.html`; geen `step-card.html` | verworpen |
| UI verwacht altijd `ui.actions[]` | `ui_render.ts:732-735`, `ui_render.ts:259-278` tonen usage voor keuze-buttons | prestart gebruikt `state.ui_action_start` (`ui_render.ts:574-576`, `main.ts:331-343`) | verworpen |
| Backend levert altijd `ui.actions[]` wanneer interactie nodig is | contract/parity checks: `turn_contract.ts:44-70`; runtime guard `run_step_runtime.ts:539-548`; payload builder `run_step_ui_payload.ts:442-469` | expliciete uitzonderingen zonder action_codes: `run_step_runtime.ts:524-547` (no_buttons), `run_step_finals.test.ts:2419-2420` | onbeslist |
| `ui.actions[]` wordt later in UI-pipeline weggefilterd | geen expliciete drop van `ui.actions` in ingest-normalizer (`locale_bootstrap_runtime.ts:227-299`, `ui_actions.ts:589-724`) | payloads kunnen wel volledig gedropt worden bij stale/tuple issues (`ui_actions.ts:645-666`, `ui_render.test.ts:1274-1311`) | onbeslist |
| StructuredContent kan UI-contract verliezen | `buildModelSafeResult` laat UI-detail weg (`server.ts:1894-2041`), output schema is minimaal (`mcp_tool_contract.ts:31-37`) | `_meta.widget_result` bewaart volledige payload (`server.ts:1766-1769`) en is primair render-source (`locale_bootstrap_runtime.ts:231-239`) | bevestigd |
| Action-code SSOT is exact 1 bron | registry is centrale bron voor business acties (`actioncode_registry.ts:18-136`, `run_step_ui_payload.ts:442-469`) | duplicaten/hardcoded systeemcodes bestaan ook (`run_step_runtime_finalize.ts:515-523`, `ui_actions.ts:1099`) | onbeslist |
| OpenAI MCP-app metadata is compliant | `server.ts:2143-2146`, `mcp_app_contract.test.ts:45-58` | geen | bevestigd |

# 3. Welke HTML is live (met codeverwijzingen)
- UI resource URI:
  - `UI_RESOURCE_PATH = "/ui/step-card"` (`server.ts:100`)
  - `uiResourceUri = baseUrl + /ui/step-card + ?v=<VERSION>` (`server.ts:2096-2098`)
- Tool metadata:
  - `openai/outputTemplate: uiResourceUri` (`server.ts:2143`)
  - `openai/widgetAccessible: true` (`server.ts:2144`)
- Resource/body selectie:
  - `loadUiHtml()` leest `./ui/step-card.bundled.html` (`server.ts:1108-1111`)
  - `registerResource(... text: loadUiHtml())` (`server.ts:2100-2114`)
- HTTP static routing:
  - `/ui/step-card` en `/ui/step-card/` mappen expliciet naar `step-card.bundled.html` (`server.ts:2655-2657`)
  - `cache-control: no-store` + `x-ui-version` op UI responses (`server.ts:2688-2697`)
- Bestandstatus:
  - `mcp-server/ui/step-card.html` ontbreekt in de repo.
  - `step-card.bundled.html` bevat auto-generated banner (`step-card.bundled.html:2`).
  - `step-card.template.html` noemt zichzelf bron + bundling pad (`step-card.template.html:5-7`).

# 4. UI verwacht vs backend levert (matrix)
| UI-pad | Wat UI verwacht | Waar in UI | Wat backend levert | Waar in backend | oordeel |
|---|---|---|---|---|---|
| Prestart startknop | `state.ui_action_start` (geen `ui.actions` vereist) | `ui_render.ts:574-576`, `main.ts:331-343` | `ui_action_start = "ACTION_START"` in state-contract | `run_step_runtime_finalize.ts:515`, `turn_contract.ts:184-186` | match |
| Choice buttons | `ui.actions[]` met `label` + `action_code` | `ui_render.ts:259-299`, `ui_render.ts:732-735` | `action_codes` + `actions` uit registry-menu | `run_step_ui_payload.ts:442-469`, parity `turn_contract.ts:44-70` | match |
| Interactieve content algemeen | minimaal body/prompt/actions | `ui_render.ts:751-780` | meestal via specialist/prompt + optioneel acties | `run_step_ui_payload.ts:346-490` | match |
| Model-safe fallback | kan zonder `ui.actions` | `locale_bootstrap_runtime.ts:261-269` | structuredContent is minimalistisch (`result/state`) | `server.ts:1894-2041`, `mcp_tool_contract.ts:31-37` | potentieel mismatch-risico als `_meta` ontbreekt |
| Wording/scoring uitzonderingen | flow zonder standaard action-menu mogelijk | `ui_render.ts:1145-1171` | expliciet mogelijk zonder action_codes | `run_step_runtime.ts:524-547`, `run_step_finals.test.ts:2419-2420` | verwacht gedrag |

# 5. Wordt `ui.actions` later weggefilterd? (end-to-end trace)
1. Runtime bouwt volledige turn payload met `ui` (incl. `action_codes`/`actions` wanneer menu actief).
   - `run_step_ui_payload.ts:264-490`, `run_step_ui_payload.ts:557-561`
2. Server-wrapper maakt twee vormen:
   - model-safe `structuredContent.result = buildModelSafeResult(...)` (`server.ts:1745-1750`, `server.ts:1894-2041`)
   - volledige widget payload in `_meta.widget_result` (`server.ts:1766-1769`)
3. MCP tool response geeft `structuredContent` + `_meta` terug.
   - `server.ts:2231-2235`
4. UI ingest normaliseert payload en kiest primair `_meta.widget_result`.
   - `locale_bootstrap_runtime.ts:227-239`, `locale_bootstrap_runtime.ts:291-299`, `ui_actions.ts:428-434`
5. Alleen bij ontbrekende canonical payload wordt ingest gedropt (`ui_ingest_dropped_no_widget_result`).
   - `ui_actions.ts:599-606`
6. Daarna kan payload nog gedropt worden op stale/tuple-regels (niet specifiek op `ui.actions`).
   - `ui_actions.ts:645-666`; testbewijs `ui_render.test.ts:1274-1311`
7. Render gebruikt resolved result en leest `result.ui.actions` voor buttons.
   - `ui_render.ts:408-421`, `ui_render.ts:259-299`

Conclusie trace: er is geen aparte “sanitizer die `ui.actions` verwijdert” in widget-ingest/render. De relevante reductie gebeurt bewust in server-side model-safe shaping (`structuredContent`), met `_meta.widget_result` als compensatie-SSOT.

# 6. SSOT-compliance matrix (`V / ? / x`) inclusief action-code SSOT
| SSOT-criterium | status | bewijs |
|---|---|---|
| `_meta.widget_result` is primaire renderbron | `V` | `locale_bootstrap_runtime.ts:231-239`, tests `ui_render.test.ts:1785-1823` |
| Fallbacks zijn expliciet en geordend (`_meta` -> `root.result` -> `structuredContent.result`) | `V` | `locale_bootstrap_runtime.ts:291-299` |
| Ordering tuple (`bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`) wordt monotone gehandhaafd | `V` | `ui_actions.ts:613-681`, `ui_render.test.ts:1179-1340` |
| UI doet geen business-routing op route tokens | `V` | UI dispatcht action codes (`main.ts:331-343`, `ui_render.ts:293-296`) |
| Action-code SSOT is exact 1 bron | `?` | registry centraal (`actioncode_registry.ts:18-136`), maar systeemcodes ook hardcoded buiten registry (`run_step_runtime_finalize.ts:515-523`, `ui_actions.ts:1099`) |

# 7. OpenAI MCP-compliance matrix (`V / ? / x`)
| Compliancepunt | status | bewijs |
|---|---|---|
| `openai/outputTemplate` ingesteld | `V` | `server.ts:2143` |
| `openai/widgetAccessible` ingesteld | `V` | `server.ts:2144` |
| UI resource MIME correct (`text/html;profile=mcp-app`) | `V` | `server.ts:2104`, static html `server.ts:2676` |
| Tool-result vorm correct (`structuredContent` + `_meta`) | `V` | `server.ts:2231-2235`, `/run_step` bridge `server.ts:2597-2599` |
| output schema expliciet | `V` | `server.ts:2133`, `mcp_tool_contract.ts:31-37` |
| Loading/failure UX zonder dead-end aantoonbaar stabiel | `?` | shells/blocked/recovery bestaan (`main.ts:119-143`, `ui_render.ts:577-631`), maar living rapport meldt nog leeg/half scherm (`mcp_widget_regressie_living_rapport.md:41-43`, `:96-97`) |

# 8. Risicoanalyse
## Route A: overal `step-card.html`
- Hoog risico/nu niet uitvoerbaar: bestand bestaat niet in huidige repo.
- Runtime is hard op bundled pad (`server.ts:1110`, `server.ts:2656`).
- Vereist nieuw artifact- en deploymentcontract; vergroot regressierisico.

## Route B: backend altijd `ui.actions[]` + bundled live
- Technisch logisch met huidige actieve runtime-entry (`/ui/step-card` -> bundled).
- Contract past al grotendeels: menu-staten leveren `action_codes` + `actions` met parity checks.
- Let op expliciete uitzonderingen (wording/scoring/no-buttons) waar geen action-menu hoort.
- Grootste resterende risico zit in host/UI lifecycle en ordering-drop, niet in templateroute.

# 9. HTML EntryPoint Verdict
- SSOT-bronbestand:
  - `mcp-server/ui/step-card.template.html` + `mcp-server/ui/lib/*.ts` (expliciet benoemd in template en build script).
- Build-artifact:
  - `mcp-server/ui/step-card.bundled.html` (`build-ui.mjs:12-13`, banner in `step-card.bundled.html:2`).
- Live entrypoint:
  - `/ui/step-card?v=<VERSION>` via `openai/outputTemplate` naar bundled.
- Is dubbele live-inzet uitgesloten? (ja/nee + bewijs)
  - **Nee** (strikt genomen): `/ui/*` static route kan ook `step-card.template.html` serveren (`server.ts:2652-2660`).
  - Voor specifiek `step-card.html` vs bundled: `step-card.html` ontbreekt, dus die specifieke dualiteit is wel uitgesloten.
- Is caching/versioning-afdekking aantoonbaar? (ja/nee + bewijs)
  - **Nee** als “live bewezen”: productie-curl/logchecks niet uitvoerbaar in deze omgeving.
  - Code-mitigaties bestaan wel: `?v=<VERSION>` (`server.ts:101`, `2096-2098`) + `cache-control: no-store` (`server.ts:2688-2697`).

# 10. Eindadvies: kies exact 1 route met motivatie
Kies **Route B**: houd `step-card.bundled.html` als enige bedoelde live-entrypoint via `/ui/step-card?v=<VERSION>` en borg servercontract dat alle menu-gedreven interactieve states `ui.actions[]` + `action_codes[]` leveren.

Motivatie:
- Sluit aan op bestaande MCP tool metadata en routing.
- Vermijdt introductie van niet-bestaand `step-card.html` pad.
- Past bij huidige SSOT-opzet (`_meta.widget_result` + ordering tuple).
- Richt probleemoplossing op echte rest-risico’s: ingest/order/lifecycle race i.p.v. HTML-entry ambiguïteit.

# 11. Follow-up checklist (max 10 punten, alleen verifieerbaar)
1. Verifieer in code dat `openai/outputTemplate` alleen `/ui/step-card?v=...` gebruikt (`server.ts:2143`).
2. Verifieer dat `/ui/step-card` naar `step-card.bundled.html` mapt (`server.ts:2655-2657`).
3. Beslis expliciet of `/ui/step-card.template.html` publiek bereikbaar mag blijven; anders route harden.
4. Voeg test toe die faalt als `step-card.html` onverwacht opnieuw geïntroduceerd wordt zonder routebesluit.
5. Voeg end-to-end test toe: `_meta.widget_result` ontbreekt -> observeer fallbackgedrag en UI-state.
6. Voeg test toe voor `ACTION_START` pad met ingest + ordering advanced check op UI-niveau.
7. Meet en log `payload_source`/`payload_reason_code` in alle startflows; vergelijk met `ui_start_dispatch_ack_without_state_advance`.
8. Verifieer parity-eis `ui.actions` vs `ui.action_codes` in alle menu-contracten (`turn_contract.ts:44-70`).
9. Voer live `curl` uit op `<public-url>/ui/step-card?...` en `<public-url>/version` zodra URL beschikbaar is.
10. Voer CloudWatch-queries uit voor de 6 events zodra netwerktoegang beschikbaar is; archiveer timestamps/correlation/trace IDs.
