# MCP Widget Single-Agent Onderzoeksdraaiboek En Rapport (Zero-Diff OpenAI MCP Proof)

## 1. Doel en harde regels
### 1.1 Doel
Dit document is het verplichte script voor 1 agent om het probleem te onderzoeken:
- interface eerst leeg/half,
- daarna gevuld,
- button die niet werkt of geen zichtbare progressie geeft.

### 1.2 Harde regels
1. Alles moet bewijs-gebaseerd zijn.
2. Aannames zijn verboden.
3. Elke claim moet minimaal 1 van deze bewijzen hebben:
   - codebewijs (`bestand:regel`),
   - testbewijs (exact commando + uitslag),
   - logbewijs (timestamp + event + correlatie).
4. Alles moet aantoonbaar OpenAI Apps SDK/MCP-conform zijn met bronverwijzing.
5. Als bewijs ontbreekt: label als `evidence_gap`.

### 1.3 Verplichte bronnen (eerst lezen, in deze volgorde)
1. `docs/mcp_widget_regressie_living_rapport.md`
2. `docs/mcp_widget_stabilisatie_run_resultaat.md`
3. `docs/mcp_widget_debug_agent_resultaat.md`
4. `mcp-server/docs/ui-interface-contract.md`
5. `mcp-server/docs/contracts/language-contract.md`
6. OpenAI Apps SDK:
   - https://developers.openai.com/apps-sdk/reference
   - https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
   - https://developers.openai.com/apps-sdk/build/state-management
   - https://developers.openai.com/apps-sdk/deploy/testing
   - https://developers.openai.com/apps-sdk/deploy/troubleshooting

### 1.4 Verplicht bijwerken van documenten
1. `docs/mcp_widget_regressie_living_rapport.md`
2. `docs/mcp_widget_stabilisatie_run_resultaat.md`
3. Dit document (`docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md`)

### 1.5 Single-agent uitvoering (verplicht)
1. Er is exact 1 uitvoerende agent.
2. Deze agent voert alle items `3.1.1` t/m `3.3.5` in volgorde uit.
3. De agent mag een item pas afsluiten als het verplichte bewijsblok volledig is ingevuld.
4. De agent werkt in iteraties, maar blijft in dezelfde rapportstructuur en dezelfde bewijsstandaard.

## 2. Script dat de agent exact moet volgen
### 2.1 Startconditie
1. Lees eerst alle bronnen uit sectie `1.3`.
2. Maak een nieuwe poging-sectie met timestamp in het living document.
3. Noteer vooraf:
   - onderzoek-item,
   - falsifieerbare hypothese,
   - verwacht bewijs als hypothese waar is,
   - verwacht bewijs als hypothese onwaar is.

### 2.2 Onderzoeksstappen per item
1. Verzamel codebewijs met file/line-referenties.
2. Verzamel testbewijs met verplichte testcommando’s:
   1. `cd mcp-server && npm run typecheck`
   2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
   3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
3. Verzamel live/logbewijs indien toegang bestaat:
   - `run_step_request` (`ACTION_START`, `TEXT_INPUT`)
   - `run_step_action_liveness_dispatch`
   - `run_step_action_liveness_ack`
   - `run_step_action_liveness_advance` of `run_step_action_liveness_explicit_error`
   - `run_step_response` (`contract_id`, `ui_view_mode`, `ack_status`, `state_advanced`, `reason_code`)
   - `run_step_render_source_selected`
   - startup markers (canonical hit/miss)
4. Label bevinding per item als exact een van:
   - `bevestigd`
   - `weerlegd`
   - `onbeslist`
5. Geef kansscore `1..10` dat dit het echte root-cause pad is.
6. Als onbeslist: noteer exact wat nog nodig is om het te bewijzen.

### 2.3 Kansscore-richtlijn (1..10)
1. `1-2`: zeer onwaarschijnlijk, sterk tegenbewijs.
2. `3-4`: onwaarschijnlijk, beperkt of indirect bewijs.
3. `5-6`: mogelijk, gemengd bewijs.
4. `7-8`: waarschijnlijk, direct code/log-correlatie.
5. `9-10`: zeer waarschijnlijk, reproduceerbaar en end-to-end bewezen.

### 2.4 Verplichte rapportage per item
Gebruik exact dit blok:

```md
#### Item X.Y - <titel>
- Hypothese:
- Waarom deze hypothese:
- Bewijs (code):
  - <bestand:regel>
- Bewijs (tests):
  - <commando + resultaat>
- Bewijs (live/log):
  - <timestamp + event + kernvelden>
  - of: evidence_gap + reden
- Uitkomst: bevestigd | weerlegd | onbeslist
- Kansscore (1-10):
- Wat is nog nodig voor 100% bewijs:
- OpenAI-doc match:
  - <doc uitspraak + link>
- Gap label:
  - spec_gap | implementation_gap | evidence_gap | geen gap
```

### 2.5 Verplichte afsluiting per run
1. Update living document met volledige poging-sectie.
2. Update stabilisatie-rapport met samenvatting van deze run.
3. Update dit document in sectie `4` (rapporttabel).
4. Geen “klaar”-status zolang er open gaps zonder label of zonder bewijs staan.

## 3. Onderzoeksitems (uit te voeren in deze volgorde)
### 3.1 Grote kans dat oorzaak hier zit
#### 3.1.1 Response-shape mismatch tussen `callTool` output en client resolver lookup
#### 3.1.2 Race tussen `openai:set_globals` en directe `callTool` ingest
#### 3.1.3 Canonical ingest drop (`ui_ingest_dropped_no_widget_result`) bij startup/action
#### 3.1.4 Action-contract niet gehydrateerd op klikmoment (role/action_code ontbreekt)
#### 3.1.5 Cache-preserve pad maskeert state-advance na ack

### 3.2 Nog niet genoeg onderzocht of oorzaak hier zit
#### 3.2.1 Productie-shape van `window.openai.callTool("run_step")` per host-context
#### 3.2.2 Volledige event-volgorde `ui/notifications/tool-result` vs `openai:set_globals`
#### 3.2.3 Rehydrate/persist gedrag van `window.openai.widgetState` en `setWidgetState`
#### 3.2.4 Long-running tool-call/timeout paden die als no-op worden ervaren
#### 3.2.5 Verschillen tussen Projects en normale chat-context voor MCP apps

### 3.3 Onwaarschijnlijk maar mogelijk
#### 3.3.1 Platform rollout/regressie buiten codebase
#### 3.3.2 OAuth/connector configuratie-effecten die runtimepad beïnvloeden
#### 3.3.3 Ontbrekende request `_meta` hints met indirecte side-effects
#### 3.3.4 Endpoint-methodeverschillen (POST/GET) buiten primaire widgetketen
#### 3.3.5 Mobile viewport/render issue dat op “lege interface” lijkt

## 4. Rapport van alle bevindingen (in te vullen door de agent)
### 4.1 Samenvatting status
- Laatste update: 2026-02-28T21:38:00Z
- Aantal items onderzocht: 15/15
- Bevestigd: 2
- Weerlegd: 3
- Onbeslist: 10
- Open gaps: 10 (`evidence_gap`), 2 (`implementation_gap`)
- Root-cause claim toegestaan: nee

### 4.2 Resultatenmatrix per item

| Item | Titel | Uitkomst | Kans (1-10) | Gap label | Bewijs compleet (ja/nee) | Volgende stap |
|---|---|---|---:|---|---|---|
| 3.1.1 | Response-shape mismatch | bevestigd | 8 | implementation_gap | nee | Raw `callTool` payloads uit productiehost loggen |
| 3.1.2 | Race set_globals vs callTool | onbeslist | 6 | evidence_gap | nee | Browser event-timeline met timestamps toevoegen |
| 3.1.3 | Canonical ingest drop | onbeslist | 7 | evidence_gap | nee | Correlatie tussen drop-marker en UI-stuck live vastleggen |
| 3.1.4 | Action-contract niet gehydrateerd | weerlegd | 2 | geen gap | ja | Geen; alleen monitoren op regressie |
| 3.1.5 | Cache-preserve maskeert advance | bevestigd | 8 | implementation_gap | nee | Client marker `ui_ingest_ack_cache_preserved` live correleren |
| 3.2.1 | Productie-shape callTool | onbeslist | 6 | evidence_gap | nee | Host-context shape-matrix meten (chat/projects/pinned) |
| 3.2.2 | Event-volgorde tool-result vs set_globals | onbeslist | 6 | evidence_gap | nee | Timestamps voor beide eventbronnen in browser verzamelen |
| 3.2.3 | widgetState persist/rehydrate | onbeslist | 5 | evidence_gap | nee | Rehydrate-test in echte hostsessie uitvoeren |
| 3.2.4 | Long-running timeout/no-op perceptie | onbeslist | 4 | evidence_gap | nee | Incident met timeout + UI-opname reproduceren |
| 3.2.5 | Projects vs normale chat context | onbeslist | 4 | evidence_gap | nee | Zelfde flow in Projects en normale chat A/B meten |
| 3.3.1 | Platform rollout/regressie | onbeslist | 3 | evidence_gap | nee | Externe platformcorrelatie (status/incident timeline) nodig |
| 3.3.2 | OAuth/connector config impact | weerlegd | 1 | geen gap | ja | Geen; app draait op `noauth` contract |
| 3.3.3 | Ontbrekende _meta hints | onbeslist | 4 | evidence_gap | nee | Failing requests inclusief `_meta` velden capteren |
| 3.3.4 | Endpoint methodeverschillen | weerlegd | 2 | geen gap | ja | Geen; wel blijven valideren dat widget via MCP loopt |
| 3.3.5 | Mobile viewport/render issue | onbeslist | 3 | evidence_gap | nee | Mobiele reproducerende run met logs/screenshots uitvoeren |

### 4.3 Detailbevindingen per item
#### Item 3.1.1 - Response-shape mismatch tussen `callTool` output en client resolver lookup
- Hypothese:
  - De client mist canonical payloads wanneer `callTool` response in niet-ondersteunde wrapper-shape aankomt.
- Waarom deze hypothese:
  - Resolver accepteert alleen `_widget_result`/`_meta.widget_result` paden; niet elk mogelijk wrapperpad.
- Bewijs (code):
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:148`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:176`
  - `mcp-server/ui/lib/ui_actions.ts:1433`
  - `mcp-server/ui/lib/ui_actions.ts:1456`
  - `mcp-server/ui/lib/ui_actions.ts:671`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS (`tsc -p tsconfig.build.json --noEmit && tsc -p tsconfig.ui.json --noEmit`).
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS (`110 pass, 0 fail`).
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS (`170 tests, 169 pass, 0 fail, 1 skipped`).
  - `cd mcp-server && node --loader ts-node/esm -e "<resolveWidgetPayload cases>"` + output:
    - `root_structuredContent_widget_result -> {"source":"none"...}`
    - `root_toolOutput_widget_result -> {"source":"meta.widget_result"...}`.
- Bewijs (live/log):
  - `2026-02-27T11:53:01.231Z`: `run_step_response` accepted (`docs/mcp_widget_regressie_living_rapport.md:242`).
  - `2026-02-27T11:53:01.232Z`: `run_step_render_source_selected` op server (`docs/mcp_widget_regressie_living_rapport.md:243`).
  - `evidence_gap`: geen raw `window.openai.callTool` response-capture met timestamp per host-context.
- Uitkomst: bevestigd
- Kansscore (1-10): 8
- Wat is nog nodig voor 100% bewijs:
  - Productiecapture van exacte `callTool` response-shape in failing sessie + correlatie met client ingest-marker.
- OpenAI-doc match:
  - Toolresult gebruikt model-data in `structuredContent` en component-data in `_meta`; mismatch op consumerzijde veroorzaakt renderproblemen. Bron: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- Gap label:
  - implementation_gap

#### Item 3.1.2 - Race tussen `openai:set_globals` en directe `callTool` ingest
- Hypothese:
  - Dubbele ingest-kanalen veroorzaken timing-race waardoor startup of actiepad tijdelijk fout rendert.
- Waarom deze hypothese:
  - UI verwerkt zowel `ui/notifications/tool-result` als `openai:set_globals`.
- Bewijs (code):
  - `mcp-server/ui/lib/main.ts:346`
  - `mcp-server/ui/lib/main.ts:348`
  - `mcp-server/ui/lib/main.ts:542`
  - `mcp-server/ui/lib/main.ts:546`
  - `mcp-server/ui/lib/main.ts:283`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS (`110 pass, 0 fail`), inclusief source-asserties op beide eventpaden.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen browser-side eventvolgorde met timestamps (`tool-result` vs `set_globals`) in dezelfde correlatie.
- Uitkomst: onbeslist
- Kansscore (1-10): 6
- Wat is nog nodig voor 100% bewijs:
  - Client event trace met milliseconde-ordering + correlatie-id.
- OpenAI-doc match:
  - Race conditions moeten expliciet getest worden in integratietests. Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - evidence_gap

#### Item 3.1.3 - Canonical ingest drop (`ui_ingest_dropped_no_widget_result`) bij startup/action
- Hypothese:
  - Canonical payload ontbreekt soms, waardoor ingest dropt en UI op oude/lege state blijft.
- Waarom deze hypothese:
  - Code heeft expliciet fail-closed pad voor ontbrekende canonical payload.
- Bewijs (code):
  - `mcp-server/ui/lib/ui_actions.ts:671`
  - `mcp-server/ui/lib/ui_actions.ts:677`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:179`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:187`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS; commandoutput bevat marker `[ui_ingest_dropped_no_widget_result]`.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `2026-02-27T11:53:01.232Z`: server render-source is wel canonical (`docs/mcp_widget_regressie_living_rapport.md:243`).
  - `evidence_gap`: geen timestamped live hit van `ui_ingest_dropped_no_widget_result` in dezelfde failing incidentcorrelatie.
- Uitkomst: onbeslist
- Kansscore (1-10): 7
- Wat is nog nodig voor 100% bewijs:
  - Live clientlog (timestamp + correlation) met drop-marker direct voor zichtbare UI-stagnatie.
- OpenAI-doc match:
  - Bij renderproblemen moet output/template-resultpad gecontroleerd worden; ontbrekende componentdata is een primaire troubleshooting-route. Bron: https://developers.openai.com/apps-sdk/deploy/troubleshooting
- Gap label:
  - evidence_gap

#### Item 3.1.4 - Action-contract niet gehydrateerd op klikmoment (role/action_code ontbreekt)
- Hypothese:
  - Klik gebeurt soms zonder geldige role/action_code en veroorzaakt no-op.
- Waarom deze hypothese:
  - Dit verklaart een knop die zichtbaar is maar niets doet.
- Bewijs (code):
  - `mcp-server/ui/lib/main.ts:441`
  - `mcp-server/ui/lib/main.ts:463`
  - `mcp-server/ui/lib/main.ts:496`
  - `mcp-server/ui/lib/main.ts:500`
  - `mcp-server/ui/lib/ui_actions.ts:500`
  - `mcp-server/src/handlers/turn_contract.ts:587`
  - `mcp-server/src/handlers/turn_contract.ts:601`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS; bevat assertions op `ui_action_contract_missing` en start-role-dispatch.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `2026-02-27T11:53:01.225Z`: `run_step_request` met `action:"ACTION_START"` (`docs/mcp_widget_regressie_living_rapport.md:241`).
  - `2026-02-27T11:53:01.231Z`: `run_step_response` accepted op dezelfde flow (`docs/mcp_widget_regressie_living_rapport.md:242`).
- Uitkomst: weerlegd
- Kansscore (1-10): 2
- Wat is nog nodig voor 100% bewijs:
  - Alleen regressiemonitoring op marker `ui_action_contract_missing`.
- OpenAI-doc match:
  - Tools moeten deterministic interaction en duidelijke status geven; expliciete action-contract mapping past hierbij. Bron: https://developers.openai.com/apps-sdk/reference
- Gap label:
  - geen gap

#### Item 3.1.5 - Cache-preserve pad maskeert state-advance na ack
- Hypothese:
  - Ack komt terug, maar rendercache blijft staan door quality-gating, waardoor voortgang visueel uitblijft.
- Waarom deze hypothese:
  - Code bewaart bewust huidige render bij zwakkere inkomende payload.
- Bewijs (code):
  - `mcp-server/ui/lib/ui_actions.ts:782`
  - `mcp-server/ui/lib/ui_actions.ts:793`
  - `mcp-server/ui/lib/ui_actions.ts:1561`
  - `mcp-server/ui/lib/ui_actions.ts:1570`
  - `mcp-server/src/server/run_step_transport_context.ts:172`
  - `mcp-server/src/server/run_step_transport_context.ts:180`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS, inclusief:
    - cache-preserve test (`handleToolResult... preserves stronger cached payload`),
    - `ACTION_START` ack zonder advance test (`no auto bootstrap poll`).
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `2026-02-28T10:33:54.167Z`: `run_step_response` met `ack_status:"accepted"` + `state_advanced:false` (`docs/mcp_widget_regressie_living_rapport.md:940`).
  - `2026-02-28T10:33:54.169Z`: `run_step_action_liveness_explicit_error` (`docs/mcp_widget_regressie_living_rapport.md:942`).
  - Zelfde window: geen `run_step_action_liveness_advance` (`docs/mcp_widget_regressie_living_rapport.md:948`).
- Uitkomst: bevestigd
- Kansscore (1-10): 8
- Wat is nog nodig voor 100% bewijs:
  - Live clienttimestamp met `ui_ingest_ack_cache_preserved` op exact dezelfde correlatie.
- OpenAI-doc match:
  - State-overgangen moeten expliciet en testbaar zijn; verborgen no-op perceptie moet voorkomen worden. Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - implementation_gap

#### Item 3.2.1 - Productie-shape van `window.openai.callTool("run_step")` per host-context
- Hypothese:
  - Verschillende host-contexten leveren verschillende `callTool` shapes; niet alle shapes worden geaccepteerd.
- Waarom deze hypothese:
  - Resolverpad is strikt en de hostcontracten verschillen per runtime.
- Bewijs (code):
  - `mcp-server/ui/lib/ui_actions.ts:1433`
  - `mcp-server/ui/lib/ui_actions.ts:1436`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:148`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts:176`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
  - `cd mcp-server && node --loader ts-node/esm -e "<resolveWidgetPayload cases>"` + toont shape-afhankelijk gedrag (`source:none` vs `meta.widget_result`).
- Bewijs (live/log):
  - `2026-02-28T20:19:29Z`: AWS query faalt met `Could not connect to the endpoint URL: "https://logs.us-east-1.amazonaws.com/"` (geen directe productie-shape capture mogelijk).
  - `evidence_gap`: geen host-context payloaddump (chat vs projects vs pinned).
- Uitkomst: onbeslist
- Kansscore (1-10): 6
- Wat is nog nodig voor 100% bewijs:
  - Per host-context 1 raw `callTool` response capture met shape-diff.
- OpenAI-doc match:
  - Integratietesten in deployed omgeving moeten expliciet hostgedrag valideren. Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - evidence_gap

#### Item 3.2.2 - Volledige event-volgorde `ui/notifications/tool-result` vs `openai:set_globals`
- Hypothese:
  - Event-order beïnvloedt welke payload als laatste render-authority wordt toegepast.
- Waarom deze hypothese:
  - Beide eventbronnen schrijven naar dezelfde ingest-functie.
- Bewijs (code):
  - `mcp-server/ui/lib/main.ts:346`
  - `mcp-server/ui/lib/main.ts:348`
  - `mcp-server/ui/lib/main.ts:542`
  - `mcp-server/ui/lib/main.ts:546`
  - `mcp-server/ui/lib/main.ts:560`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS; source test verifieert beide ingestpaden.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen client-side eventtimestamping van beide events met dezelfde correlation-id.
- Uitkomst: onbeslist
- Kansscore (1-10): 6
- Wat is nog nodig voor 100% bewijs:
  - Browserinstrumentatie die beide events met monotone timestamp logt.
- OpenAI-doc match:
  - Race conditions en timing moeten expliciet worden getest. Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - evidence_gap

#### Item 3.2.3 - Rehydrate/persist gedrag van `window.openai.widgetState` en `setWidgetState`
- Hypothese:
  - Persist/rehydrate van `widgetState` kan ordering/host-session verloren laten gaan.
- Waarom deze hypothese:
  - State progression is tuple-afhankelijk en werkt via host bridge.
- Bewijs (code):
  - `mcp-server/ui/lib/ui_actions.ts:533`
  - `mcp-server/ui/lib/ui_actions.ts:538`
  - `mcp-server/ui/lib/ui_actions.ts:544`
  - `mcp-server/ui/lib/ui_actions.ts:571`
  - `mcp-server/ui/lib/ui_actions.ts:695`
  - `mcp-server/ui/lib/ui_actions.ts:704`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS; bevat monotone ordering en `host_widget_session_id` persist tests.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen rehydrate-run (reload/resume) met timestamps in echte host.
- Uitkomst: onbeslist
- Kansscore (1-10): 5
- Wat is nog nodig voor 100% bewijs:
  - Reproduceerbare host-run met refresh + state dump voor/na `setWidgetState`.
- OpenAI-doc match:
  - `window.openai.widgetState`/`setWidgetState` zijn bedoeld voor client-state persistence; gedrag moet host-end-to-end gevalideerd worden. Bron: https://developers.openai.com/apps-sdk/build/state-management
- Gap label:
  - evidence_gap

#### Item 3.2.4 - Long-running tool-call/timeout paden die als no-op worden ervaren
- Hypothese:
  - Timeouts kunnen user-perceptie “klik doet niets” veroorzaken ondanks expliciete foutstatus.
- Waarom deze hypothese:
  - Timeout houdt oude view zichtbaar en toont alleen notice.
- Bewijs (code):
  - `mcp-server/ui/lib/ui_actions.ts:1401`
  - `mcp-server/ui/lib/ui_actions.ts:1413`
  - `mcp-server/ui/lib/ui_actions.ts:1611`
  - `mcp-server/ui/lib/ui_actions.ts:1628`
  - `mcp-server/src/server/http_routes.ts:697`
  - `mcp-server/src/server/http_routes.ts:721`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS; test `render ignores transient timeout payload and keeps previous visible view`.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS; test `timeout: returns structured error payload`.
- Bewijs (live/log):
  - `evidence_gap`: geen timestamped timeout-incident met gebruikersscreenshot in deze run.
- Uitkomst: onbeslist
- Kansscore (1-10): 4
- Wat is nog nodig voor 100% bewijs:
  - Incidentcapture met `mcp_request_timeout`/`ack_status:timeout` + UI-opname.
- OpenAI-doc match:
  - Troubleshooting adviseert network throttling en timeoutpaden expliciet te testen. Bron: https://developers.openai.com/apps-sdk/deploy/troubleshooting
- Gap label:
  - evidence_gap

#### Item 3.2.5 - Verschillen tussen Projects en normale chat-context voor MCP apps
- Hypothese:
  - Hostcontext (Projects vs normale chat) verandert event/payloadgedrag.
- Waarom deze hypothese:
  - OpenAI noemt meerdere ChatGPT surfaces met eigen testverplichting.
- Bewijs (code):
  - `mcp-server/src/server/run_step_transport_context.ts:301`
  - `mcp-server/src/server/run_step_transport_context.ts:336`
  - `mcp-server/src/handlers/ingress.ts:82`
  - `mcp-server/ui/lib/ui_actions.ts:1357`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen Projects-context logrun met timestamps.
- Uitkomst: onbeslist
- Kansscore (1-10): 4
- Wat is nog nodig voor 100% bewijs:
  - Zelfde script uitvoeren in Projects en normale chat met identieke correlatiemeting.
- OpenAI-doc match:
  - OpenAI adviseert testen in alle relevante surfaces (o.a. ChatGPT projects en pinned apps). Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - evidence_gap

#### Item 3.3.1 - Platform rollout/regressie buiten codebase
- Hypothese:
  - Incident komt door platformrollout buiten repo, niet door lokale code.
- Waarom deze hypothese:
  - Symptoom was intermitterend en niet volledig door unit-tests gevangen.
- Bewijs (code):
  - Geen direct codebewijs mogelijk voor externe rollout; lokale code toont wel deterministische contracts/assertions.
  - `mcp-server/src/server/mcp_registration.ts:84`
  - `mcp-server/src/server/run_step_transport.ts:357`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen externe rollout-telemetrie/incidentfeed gekoppeld aan deze sessies.
- Uitkomst: onbeslist
- Kansscore (1-10): 3
- Wat is nog nodig voor 100% bewijs:
  - Platform incident timeline + regressiecorrelatie met exacte sessietimestamps.
- OpenAI-doc match:
  - Bij intermitterende productieproblemen is deploy/troubleshooting op platformniveau verplicht. Bron: https://developers.openai.com/apps-sdk/deploy/troubleshooting
- Gap label:
  - evidence_gap

#### Item 3.3.2 - OAuth/connector configuratie-effecten die runtimepad beïnvloeden
- Hypothese:
  - OAuth/connectorconfig kan de widgetflow verstoren.
- Waarom deze hypothese:
  - Dit is een bekende externe variabele bij sommige MCP-apps.
- Bewijs (code):
  - `mcp-server/src/server/mcp_registration.ts:102` (`securitySchemes: [{ type: "noauth" }]`).
  - `mcp-server/src/server/mcp_registration.ts:98`
  - `mcp-server/src/server/mcp_registration.ts:108`
  - Repo-breed geen OAuth-implementatie (`rg oauth` op `mcp-server/src` geeft geen runtime-auth flow).
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `2026-02-27T11:53:01.225Z` en `2026-02-27T11:53:01.231Z`: `run_step` request/response succesvol zonder auth challenge (`docs/mcp_widget_regressie_living_rapport.md:241`, `docs/mcp_widget_regressie_living_rapport.md:242`).
- Uitkomst: weerlegd
- Kansscore (1-10): 1
- Wat is nog nodig voor 100% bewijs:
  - Geen extra bewijs nodig binnen huidige appcontract (`noauth`).
- OpenAI-doc match:
  - OAuth is relevant voor remote servers met auth; hier is expliciet `noauth` geconfigureerd. Bron: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- Gap label:
  - geen gap

#### Item 3.3.3 - Ontbrekende request `_meta` hints met indirecte side-effects
- Hypothese:
  - Ontbrekende `_meta` hints (locale/session/trace) beïnvloeden routing en liveness indirect.
- Waarom deze hypothese:
  - Server haalt locale/session/correlation uit `extra._meta` met fallbacks.
- Bewijs (code):
  - `mcp-server/src/server/locale_resolution.ts:133`
  - `mcp-server/src/server/locale_resolution.ts:142`
  - `mcp-server/src/server/locale_resolution.ts:160`
  - `mcp-server/src/server/locale_resolution.ts:166`
  - `mcp-server/src/server/observability.ts:148`
  - `mcp-server/src/server/observability.ts:193`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS; bevat language-policy tests voor `webplus_i18n`.
- Bewijs (live/log):
  - `evidence_gap`: geen raw `extra._meta` dumps voor failing requests beschikbaar.
- Uitkomst: onbeslist
- Kansscore (1-10): 4
- Wat is nog nodig voor 100% bewijs:
  - Requestcapture met `_meta` velden + vergelijking tussen succesvolle en falende runs.
- OpenAI-doc match:
  - `_meta`/request metadata wordt door host doorgegeven en kan appgedrag sturen; ontbrekende hints moeten defensief afgehandeld worden. Bron: https://developers.openai.com/apps-sdk/reference
- Gap label:
  - evidence_gap

#### Item 3.3.4 - Endpoint-methodeverschillen (POST/GET) buiten primaire widgetketen
- Hypothese:
  - Verschil in HTTP-methodes veroorzaakt de UI-regressie.
- Waarom deze hypothese:
  - MCP endpoint accepteert meerdere methodes; lokale bridge gebruikt aparte route.
- Bewijs (code):
  - `mcp-server/src/server/http_routes.ts:537`
  - `mcp-server/src/server/http_routes.ts:539`
  - `mcp-server/src/server/http_routes.ts:278`
  - `mcp-server/src/server/http_routes.ts:281`
  - `mcp-server/ui/lib/ui_actions.ts:1433`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `2026-02-27T11:53:01.225Z`: `run_step_request` event aanwezig op primaire toolketen (`docs/mcp_widget_regressie_living_rapport.md:241`).
  - Geen bewijs dat incident via lokale `/run_step` dev-bridge liep.
- Uitkomst: weerlegd
- Kansscore (1-10): 2
- Wat is nog nodig voor 100% bewijs:
  - Geen extra bewijs nodig voor primaire keten; wel periodiek route-audit behouden.
- OpenAI-doc match:
  - Productieketen hoort via MCP toolinvocatie te lopen; lokale test-endpoints zijn secundair. Bron: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- Gap label:
  - geen gap

#### Item 3.3.5 - Mobile viewport/render issue dat op “lege interface” lijkt
- Hypothese:
  - Mobiele layout/rendering kan een “leeg” beeld veroorzaken zonder backendfout.
- Waarom deze hypothese:
  - UI heeft aparte mobiele CSS-varianten; gebruikersperceptie kan device-afhankelijk zijn.
- Bewijs (code):
  - `mcp-server/ui/step-card.template.html:9`
  - `mcp-server/ui/step-card.template.html:170`
  - `mcp-server/ui/step-card.template.html:177`
  - `mcp-server/ui/step-card.template.html:190`
- Bewijs (tests):
  - `cd mcp-server && npm run typecheck` + PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` + PASS (geen device-emulatie test).
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` + PASS.
- Bewijs (live/log):
  - `evidence_gap`: geen mobiele sessielogs/screenshots met timestamp in deze run.
- Uitkomst: onbeslist
- Kansscore (1-10): 3
- Wat is nog nodig voor 100% bewijs:
  - Reproductie op mobiel (iOS/Android) met screenshots + client ingest logs.
- OpenAI-doc match:
  - OpenAI vereist testen op desktop en mobile layouts/surfaces. Bron: https://developers.openai.com/apps-sdk/deploy/testing
- Gap label:
  - evidence_gap

## 5. Definition of Done voor dit rapport
### 5.1 Inhoudelijk
1. Alle items `3.1.1` t/m `3.3.5` hebben een ingevulde detailsectie.
2. Elk item heeft:
   - uitkomst,
   - kansscore 1..10,
   - gaplabel,
   - bewijsbron(nen).
3. Geen onbewezen claims.

### 5.2 Zero-diff proof
1. Elke relevante conclusie verwijst naar OpenAI Apps SDK bron + code/log/testbewijs.
2. Als live bewijs ontbreekt, staat dit expliciet als `evidence_gap`.
3. Eindconclusie “0 verschillen” mag alleen als matrix 100% zonder open gaps is.

### 5.3 Eindoutput
1. Living document bijgewerkt.
2. Stabilisatie-document bijgewerkt.
3. Dit rapport volledig ingevuld en opgeslagen in `docs/`.

## 6. PR-6 Final Closure Gate (2026-02-28 21:38 UTC)
### 6.1 Docs-only verificatie
- Deze PR-6 pass is **docs-only**.
- Geen codewijzigingen uitgevoerd.
- Daarom zijn de 3 standaard testcommando's in deze pass niet opnieuw gedraaid.
- Gebruikte laatste harde run-bewijzen:
  - PR-5 matrix-capture (`run_id: pr5-local-1772314306386`).
  - PR-5 timeout-harness (`verify:release-proof`, `mcp_request_timeout` bevestigd).

### 6.2 Herbeoordeling hypothese-matrix (3.1.1 t/m 3.3.5)

| Item | Type | Bewijs vóór (kort) | Bewijs tegen (kort) | Status (open/verworpen/waarschijnlijk/bevestigd) | Gap label |
|---|---|---|---|---|---|
| 3.1.1 | code fault | resolver is shape-strikt; mismatch pad reproduceerbaar | geen live host raw payload per surface | bevestigd | implementation_gap |
| 3.1.2 | architectural fault | 2 ingest-kanalen naar zelfde statepad | geen timestamped event-order in 1 incident | waarschijnlijk | evidence_gap |
| 3.1.3 | code fault | expliciet drop-pad voor missende canonical payload | geen live correlatie drop-marker + UI-stuck | waarschijnlijk | evidence_gap |
| 3.1.4 | code fault | contract hydration guards + tests | live `ACTION_START` request/response aanwezig | verworpen | geen gap |
| 3.1.5 | code fault | cache/liveness masking pad bevestigd in code+tests | geen volledige live clientmarker-correlatie | bevestigd | implementation_gap |
| 3.2.1 | architectural fault | host-context shape-verschillen plausibel | geen projects/pinned raw shape capture | open | evidence_gap |
| 3.2.2 | architectural fault | event-order kan render authority bepalen | geen complete order-trace per correlatie | open | evidence_gap |
| 3.2.3 | code fault | persist/rehydrate tuplepaden aangescherpt | geen echte host reload/resume capture | open | evidence_gap |
| 3.2.4 | architectural fault | timeoutpad server-side bewezen (`mcp_request_timeout`) | UX/no-op correlatie in host niet sluitend | waarschijnlijk | evidence_gap |
| 3.2.5 | architectural fault | surface-afhankelijk hostgedrag is plausibel | geen Projects vs chat A/B met markers | open | evidence_gap |
| 3.3.1 | architectural fault | intermitterend gedrag kan extern zijn | geen platform incident timeline koppeling | open | evidence_gap |
| 3.3.2 | architectural fault | n.v.t. | `noauth` contract + succesvolle runs | verworpen | geen gap |
| 3.3.3 | architectural fault | `_meta` hints sturen locale/trace-fallbacks | geen raw failing `_meta` requestdumps | open | evidence_gap |
| 3.3.4 | architectural fault | n.v.t. | primaire keten via MCP aangetoond | verworpen | geen gap |
| 3.3.5 | architectural fault | mobile perceptie-risico bestaat | geen complete mobile hostflow + logs | open | evidence_gap |

### 6.3 Finale gap-telling (na PR-6 gate)
- `implementation_gap`: 2 (`3.1.1`, `3.1.5`)
- `evidence_gap`: 10 (`3.1.2`, `3.1.3`, `3.2.1`, `3.2.2`, `3.2.3`, `3.2.4`, `3.2.5`, `3.3.1`, `3.3.3`, `3.3.5`)
- `spec_gap`: 0
- `geen gap`: 3 (`3.1.4`, `3.3.2`, `3.3.4`)
- Totaal open gaps: **12**

### 6.4 Harde DoD-gate checklist (final)

| Gate | Regel | Status |
|---|---|---|
| G1 | Alle items 3.1.1 t/m 3.3.5 herbeoordeeld | PASS |
| G2 | Alle open gaps hebben expliciete reden + vervolgbewijs | PASS |
| G3 | Geen "0 gaps" claim zolang open gaps bestaan | PASS |
| G4 | Root-cause claim alleen bij gesloten relevante P0 + live correlatie | FAIL |
| G5 | Stabilisatiedoc bevat finale statusblok (gesloten/open + next trigger) | PASS |
| G6 | Living doc bevat nieuwe poging met 14 velden + finale oorzaakclaim | PASS |

### 6.5 P0/P1 sluitingsstatus voor root-cause claim
- Relevante P0 blockers voor "root cause bewezen":
  - `3.1.1` (implementation_gap) niet gesloten.
  - `3.1.5` (implementation_gap) niet gesloten.
  - `3.2.2` (evidence_gap) geen sluitende live event-order correlatie.
- Beslissing:
  - Root-cause claim toegestaan: **nee**.

## 7. PR-8 harmonisatie (2026-02-28 21:52 UTC)
Doel van deze sectie:
- Gap-telling harmoniseren met:
  - `docs/mcp_widget_regressie_living_rapport.md` (PR-8 poging),
  - `docs/mcp_widget_stabilisatie_run_resultaat.md` (PR-8 failsluitingsstatus).

PR-8 auditfails status (PR-7 herstelrun):
- Gesloten: `PR2-G1`, `PR2-G2`, `PR2-G3`, `PR2-G4`, `CROSS-G1`.
- Open: `PR5-G1` (`evidence_gap`).

Actuele PR-8 gaptelling (auditfails):
- `audit_gap`: 0
- `evidence_gap`: 1
- `consistency_gap`: 0
- Open totaal: **1**

Harde blocker (extern):
- `PR5-G1` owner: host-surface QA/platform owner.
- Dependency: echte host-surface matrix met complete capture op:
  - normale chat,
  - Projects,
  - pinned,
  - mobile,
  - timeout.

Consistency-notitie:
- Historische `0 open gaps` claims uit oudere runs zijn expliciet als superseded gemarkeerd in stabilisatiedoc.
