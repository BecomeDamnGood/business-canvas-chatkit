# MCP Widget Action-Liveness - Foolproof Agent Instructie

## Aanleiding
De regressie is bewezen: het eerste scherm kan leeg/half blijven en clicks kunnen eindigen als dead-end wanneer de keten `producer -> canonical payload -> ingest -> render` geen canonieke `_meta.widget_result` levert. Omdat `_meta.widget_result` SSOT render-authority is, leidt niet-canonieke of lege payload deterministisch tot fail-closed gedrag (waiting/recovery) in plaats van bruikbare interactieve state.

## Doel
Implementeer een structurele Action-Liveness contractlaag in de architectuur (niet alleen UI-opvang), zodat elke button/action aantoonbaar eindigt in precies 1 van 2 eindtoestanden:
1. `state_advanced`
2. `explicit_error` (met reason-code en zichtbare UX)

## Niet-doel
1. Geen workaround-only fix die de oorzaak maskeert.
2. Geen start-specifieke uitzonderingslogica.
3. Geen client-side business-routing of reconstructie van server-state buiten SSOT.

## 1) Links die je eerst moet lezen
1. [Living rapport](./mcp_widget_regressie_living_rapport.md)
2. [Stabilisatie resultaat](./mcp_widget_stabilisatie_run_resultaat.md)
3. [Debug rapport](./mcp_widget_debug_agent_resultaat.md)
4. [UI interface contract](../mcp-server/docs/ui-interface-contract.md)
5. [Language contract](../mcp-server/docs/contracts/language-contract.md)
6. [Hard refactoring notes](./hard_refactoring_2026-02-27.md)
7. OpenAI Apps SDK docs:
   - https://developers.openai.com/apps-sdk/reference
   - https://developers.openai.com/apps-sdk/build/mcp-chatgpt
   - https://developers.openai.com/apps-sdk/build/state-management
   - https://developers.openai.com/apps-sdk/build/testing
   - https://developers.openai.com/apps-sdk/build/troubleshooting

## 2) Bewezen oorzaak (niet gokken, dit is hard bewijs)
1. Render-authority is strikt `_meta.widget_result`:
   - `mcp-server/ui/lib/locale_bootstrap_runtime.ts` (`resolveMetaWidgetResult`, regels 148-170).
   - `mcp-server/docs/ui-interface-contract.md` (regels 78-85).
2. Payload zonder `_meta.widget_result` wordt gedropt:
   - `mcp-server/ui/lib/ui_actions.ts` (`[ui_ingest_dropped_no_widget_result]`, regels 676-683).
3. Lege bootstrap payload rendert waiting shell:
   - `mcp-server/ui/lib/main.ts` (regels 388-390 en 399-400).
4. Waiting/recovery pad verbergt controls:
   - `mcp-server/ui/lib/ui_render.ts` (regels 648-693).

Conclusie: dit is een architectuurketen-probleem (`producer -> canonical payload -> ingest -> render`) en **mag niet** met UI-workarounds worden afgeplakt.

## 3) Harde randvoorwaarden (niet onderhandelbaar)
1. SSOT blijft intact:
   - `_meta.widget_result` is en blijft render-authority.
   - ordering tuple (`bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`) blijft leidend.
2. UI blijft dumb:
   - geen business-routing in client.
   - client dispatcht alleen server-gedefinieerde acties.
3. MCP/OpenAI compatibiliteit:
   - `openai/outputTemplate`, `openai/widgetAccessible`, juiste rolverdeling `structuredContent` vs `_meta`.
4. Geen per-knop uitzonderingen:
   - 1 generiek action protocol voor alle knoppen.

## 4) Verboden (anti-workaround policy)
1. Geen client-side fallback die business-state reconstrueert als `_meta.widget_result` ontbreekt.
2. Geen speciale uitzonderingsregels alleen voor `ACTION_START`.
3. Geen masking fix zoals alleen “extra retry” zonder structurele producer/canonical contractfix.
4. Geen “passende UI tonen” op niet-canonieke payload als eindoplossing.

## 5) Verplichte architectuur-oplossing

### 5.1 Uniforme action lifecycle (voor alle actions)
Elke action moet aantoonbaar door deze states:
1. `visible`
2. `enabled`
3. `dispatched`
4. `acknowledged`
5. `state_advanced` of `explicit_error`

Alles buiten deze eindstatussen is contractschending.

### 5.2 Uniforme action source
1. Gebruik 1 server-leverde bron voor dispatch (`ui.actions[]` of eenduidig `ui.action_contract.actions[]`).
2. Verwijder mixed legacy pad (statekey-magic naast actions-array).

### 5.3 Liveness velden (end-to-end verplicht)
1. `ack_status` (`accepted|rejected|timeout|dropped`)
2. `state_advanced` (`true|false`)
3. `reason_code` (verplicht bij `state_advanced=false`)
4. `action_code_echo`
5. `client_action_id_echo`

### 5.4 Fail-closed zonder dead-end
1. Bij no-advance/failure: render expliciete status met reason-code.
2. Geen stille disable/no-op.
3. Retry alleen begrensd + observeerbaar.

### 5.5 Observability/SLO
1. Per action_code tellers: `dispatch_count`, `ack_count`, `advance_count`, `explicit_error_count`.
2. Vaste logmarkers met `action_code`, `client_action_id`, ordering tuple.
3. No-op pad moet altijd traceerbaar zijn.

## 6) Scope (minimaal aanpassen)
1. `mcp-server/ui/lib/ui_actions.ts`
2. `mcp-server/ui/lib/main.ts`
3. `mcp-server/ui/lib/ui_render.ts`
4. `mcp-server/src/server/run_step_transport.ts`
5. `mcp-server/src/server/run_step_transport_context.ts`
6. `mcp-server/src/server/run_step_transport_stale.ts`
7. `mcp-server/src/handlers/turn_contract.ts`
8. Tests:
   - `mcp-server/src/ui_render.test.ts`
   - `mcp-server/src/handlers/run_step.test.ts`
   - `mcp-server/src/mcp_app_contract.test.ts`

## 7) Teststrategie (verplicht)

### 7.1 Unit/contract cases
1. Zichtbare knop zonder geldige action mag niet bestaan (of force-explicit-error).
2. Dispatch zonder transport -> expliciete errorstatus.
3. Ack zonder advance -> expliciete no-advance status + reason.
4. Stale/out-of-order -> expliciete drop + reason, zonder silent hang.

### 7.2 Sequence tests (minimaal 1 per type)
1. prestart/start
2. menu-choice
3. confirm
4. text submit

Elke sequence bewijst:
1. click -> dispatch
2. dispatch -> ack
3. ack -> advance of expliciete fout

### 7.3 Verplichte commando's
1. `cd mcp-server && npm run typecheck`
2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`

## 8) Definition of Done
1. Geen silent no-op meer voor welke knop dan ook.
2. Elke action eindigt aantoonbaar in `state_advanced` of `explicit_error`.
3. Verplichte tests groen + sequence-bewijs geleverd.
4. Geen SSOT/MCP regressie.
5. Documentatie bijgewerkt met volledige resultaten.

## 9) Verplichte rapportage na succesvolle implementatie
Na implementatie **moet** je beide documenten bijwerken:
1. [Living rapport](./mcp_widget_regressie_living_rapport.md) met nieuwe poging in sectie 9-template.
2. [Stabilisatie resultaat](./mcp_widget_stabilisatie_run_resultaat.md) met exacte wijzigingen + bewijs.

Minimaal deze velden invullen in living rapport:
1. Hypothese
2. Waarom deze hypothese
3. Exacte wijziging(en)
4. Verwachte uitkomst
5. Testresultaten lokaal
6. Live observatie (indien beschikbaar)
7. AWS/logbewijs met timestamps
8. Uitkomst (`Bevestigd/Weerlegd/Onbeslist`)
9. Wat bleek achteraf onjuist
10. Wat was gemist
11. Besluit

## 10) Copy-paste opdracht voor agent (letterlijk gebruiken)
```text
Implementeer een structurele Action-Liveness Contractlaag voor de MCP-widget die de bewezen ketenoorzaak oplost (producer -> canonical payload -> ingest -> render), zodat elke button-click eindigt in state_advanced of expliciete foutstatus, zonder silent no-op en zonder lege/half render als eindtoestand.

Niet doen:
- geen workaround-only fix
- geen start-specifieke uitzonderingsfix
- geen client business-routing

Wel doen (verplicht):
1) respecteer _meta.widget_result als SSOT render-authority en de ordering tuple
2) houd UI dumb; dispatch alleen server-contract actions
3) behoud MCP/OpenAI contracten (outputTemplate/widgetAccessible/structuredContent vs _meta)
4) implementeer uniforme lifecycle voor alle actions: visible -> enabled -> dispatched -> acknowledged -> state_advanced|explicit_error
5) gebruik 1 uniforme action source (geen mixed legacy paden)
6) zorg voor expliciete livenessvelden: ack_status/state_advanced/reason_code/action_code_echo/client_action_id_echo
7) fail-closed UX zonder dead-end, met expliciete reason-code boodschap
8) observability per action_code met dispatch/ack/advance/error tellers + vaste markers
9) sequence-tests voor start/menu/confirm/text-submit

Lees eerst:
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- docs/mcp_widget_debug_agent_resultaat.md
- mcp-server/docs/ui-interface-contract.md
- mcp-server/docs/contracts/language-contract.md

Draai verplicht:
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

Na succesvolle implementatie verplicht:
1) update docs/mcp_widget_regressie_living_rapport.md met volledige poging-resultaten
2) update docs/mcp_widget_stabilisatie_run_resultaat.md met exacte wijzigingen + test/live/logbewijs
```
