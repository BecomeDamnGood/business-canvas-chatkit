# MCP Widget Startup + Action-Liveness - Structurele Agent Instructie (v2)

## Aanleiding
Er zijn **2 afzonderlijke regressies** die samen als 1 probleem ervaren worden:
1. **Leeg/half eerste scherm** bij startup.
2. **Schijnbaar inactieve startknop** ("klik lijkt niets te doen").

Deze moeten allebei structureel worden opgelost in de keten `producer -> canonical payload -> ingest -> render`, zonder workaround-only gedrag.

## Doel
Implementeer een structurele ketenoplossing waardoor:
1. het eerste scherm niet eindigt in lege/half state;
2. elke user action aantoonbaar eindigt in exact 1 van:
   - `state_advanced`
   - `explicit_error` (met `reason_code` en zichtbare UX);
3. de UI nooit meer een succesvolle start maskeert als "zelfde prestart opnieuw".

## Niet-doel
1. Geen UI-only cosmetische fix.
2. Geen start-specifieke uitzondering die structurele invariant omzeilt.
3. Geen client-side reconstructie van business-state buiten `_meta.widget_result`.

## 1) Documentatie die je verplicht eerst leest
1. [Living rapport](./mcp_widget_regressie_living_rapport.md)
2. [Stabilisatie resultaat](./mcp_widget_stabilisatie_run_resultaat.md)
3. [Debug rapport](./mcp_widget_debug_agent_resultaat.md)
4. [UI interface contract](../mcp-server/docs/ui-interface-contract.md)
5. [Language contract](../mcp-server/docs/contracts/language-contract.md)
6. [Hard refactoring notes](./hard_refactoring_2026-02-27.md)
7. OpenAI Apps SDK docs:
   - https://developers.openai.com/apps-sdk/reference
   - https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
   - https://developers.openai.com/apps-sdk/build/state-management
   - https://developers.openai.com/apps-sdk/deploy/testing
   - https://developers.openai.com/apps-sdk/deploy/troubleshooting

## 2) Reeds bewezen feiten (niet opnieuw gokken)
1. Render authority is `_meta.widget_result` (SSOT).
2. Zonder `_meta.widget_result` wordt ingest gedropt (`[ui_ingest_dropped_no_widget_result]`).
3. Startup toont wacht-shell bij lege init payload (`[startup_first_render_wait_shell]`).
4. Live logs tonen dat `ACTION_START` server-side wel binnenkomt en `accepted + state_advanced=true` krijgt.
5. Tegelijk komen responses voor `step_0` met `contract_id=step_0:no_output:NO_MENU` en `ui_view_mode=interactive`.
6. UI valt bij interactive zonder renderbare content terug naar prestart, wat als "inactieve knop" aanvoelt.

Conclusie: dit is een keten-invariant probleem, geen losse UI-bug en geen losse transport-bug.

## 3) Harde randvoorwaarden (niet onderhandelbaar)
1. SSOT blijft intact:
   - `_meta.widget_result` blijft enige render authority.
   - ordering tuple (`bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`) blijft leidend.
2. UI blijft dumb:
   - geen business-routing, geen reconstructie.
   - UI dispatcht alleen server-gedefinieerde actions.
3. MCP/OpenAI compatibiliteit blijft behouden:
   - `_meta.ui.resourceUri`, `openai/outputTemplate`, `openai/widgetAccessible`, juiste scheiding `structuredContent` vs `_meta`.
4. Geen per-knop uitzonderingsregels.

## 4) Verboden (anti-workaround policy)
1. Geen "toon gewoon prestart opnieuw" als eindoplossing.
2. Geen extra retry als masking zonder contractinvariant.
3. Geen client-side fallback op niet-canonieke payload als business-oplossing.
4. Geen start-only hardcodepad.

## 5) Verplichte structurele oplossing (moet-criteria)

### 5.1 Incident A: leeg/half eerste scherm (startup)
Voer dit structureel door:
1. Definieer en enforce startup-invariant:
   - binnen bootstrap-window moet canonical `_meta.widget_result` beschikbaar komen,
   - anders eindig in `explicit_error` met reason code (niet oneindig waiting shell).
2. Producer/verwerkingspad moet op startup altijd een canonical payload of expliciete foutpayload leveren.
3. Observeerbaarheid:
   - marker voor startup canonical miss,
   - marker voor startup explicit error path.

### 5.2 Incident B: schijnbaar inactieve startknop
Voer dit structureel door:
1. Definieer en enforce contract-invariant:
   - als `step_0` en `started=true`, dan mag succesvolle response niet in `no_output:NO_MENU` eindigen.
2. Als producer geen renderbare interactive state heeft:
   - server moet `explicit_error` zetten met reason code, niet "accepted interactive" zonder content.
3. UI mag bij `started=true` nooit recoveren naar prestart als success pad.
   - alleen expliciete foutstatus tonen met reason code.
4. `client_action_id_echo` moet voor interactieve actions non-empty end-to-end zijn.

### 5.3 Uniforme action-liveness contract (blijft verplicht)
1. Lifecycle per action: `visible -> enabled -> dispatched -> acknowledged -> state_advanced|explicit_error`.
2. Uniforme action source: alleen `ui.action_contract.actions[]`.
3. Verplichte velden op alle paden:
   - `ack_status`
   - `state_advanced`
   - `reason_code` (verplicht als `state_advanced=false`)
   - `action_code_echo`
   - `client_action_id_echo`
4. Observability tellers per action:
   - `dispatch_count`, `ack_count`, `advance_count`, `explicit_error_count`.

## 6) Scope (minimaal aan te passen)
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

## 7) Verplichte teststrategie

### 7.1 Unit/contract
1. Startup zonder canonical payload eindigt in expliciete fout (geen eindeloze waiting shell).
2. `step_0 + started=true + no_output:NO_MENU` moet contract violation / explicit error geven.
3. Dispatch zonder transport -> expliciete errorstatus.
4. Ack zonder advance -> expliciete no-advance status + reason.
5. Stale/out-of-order -> expliciete drop + reason, zonder silent hang.

### 7.2 Sequences (minimaal 1 per type)
1. prestart/start
2. menu-choice
3. confirm
4. text-submit

Per sequence bewijs je:
1. click -> dispatch
2. dispatch -> ack
3. ack -> advance of expliciete fout

## 8) Verplichte commando's
1. `cd mcp-server && npm run typecheck`
2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`

## 9) Live bewijs (verplicht als toegang beschikbaar is)
Gebruik CloudWatch queries en lever timestamps:
1. `run_step_request` met `action=ACTION_START`
2. `run_step_action_liveness_ack`
3. `run_step_action_liveness_advance`
4. `run_step_response` met `contract_id`, `ui_view_mode`, `ack_status`, `state_advanced`
5. `run_step_render_source_selected`
6. eventuele startup/wait markers in UI logs

Je moet expliciet aantonen:
1. dat lege startup niet meer als eindtoestand blijft hangen;
2. dat start nooit meer "accepted" kan zijn met `step_0:no_output:NO_MENU` zonder explicit error.

## 10) Definition of Done
1. Geen silent no-op meer voor welke knop dan ook.
2. Geen lege/half startup als eindtoestand.
3. `step_0 started=true` kan niet meer semantisch inconsistent eindigen.
4. Elke action eindigt aantoonbaar in `state_advanced` of `explicit_error`.
5. Verplichte tests groen.
6. Documentatie volledig bijgewerkt.

## 11) Verplichte rapportage na implementatie
Na succesvolle implementatie **moet** je beide documenten bijwerken:
1. [Living rapport](./mcp_widget_regressie_living_rapport.md)
2. [Stabilisatie resultaat](./mcp_widget_stabilisatie_run_resultaat.md)

### 11.1 Verplichte velden living rapport
1. Hypothese
2. Waarom deze hypothese
3. Exacte wijziging(en)
4. Verwachte uitkomst
5. Testresultaten lokaal
6. Live observatie
7. AWS/logbewijs met timestamps
8. Uitkomst (`Bevestigd/Weerlegd/Onbeslist`)
9. Wat bleek achteraf onjuist
10. Wat was gemist
11. Besluit

### 11.2 Extra verplichte sectie in living rapport
Voeg verplicht toe:
1. "Waarom eerdere oplossing onvoldoende was"
2. "Welke invariant ontbrak toen"
3. "Waarom deze nieuwe fix structureel is en geen workaround"

## 12) Copy-paste opdracht voor agent (letterlijk gebruiken)
```text
Los twee regressies structureel op in de MCP-widget keten (producer -> canonical payload -> ingest -> render):
1) leeg/half startup scherm
2) schijnbaar inactieve startknop

Belangrijk: dit is geen UI-only issue. Respecteer SSOT `_meta.widget_result` en ordering tuple als enige render-authority.

Niet doen:
- geen workaround-only fix
- geen start-specifieke uitzondering
- geen client business-routing
- geen masking via alleen retries

Wel doen (verplicht):
1) Enforce startup-invariant: startup mag niet eindigen in lege waiting shell; bij canonical miss -> explicit_error met reason_code.
2) Enforce step_0-start invariant: bij `started=true` mag succesvolle response niet eindigen in `step_0:no_output:NO_MENU`; anders explicit_error.
3) Houd UI dumb: dispatch alleen server action-contract (`ui.action_contract.actions[]`), geen mixed legacy routing.
4) Uniforme action lifecycle voor alle actions:
   visible -> enabled -> dispatched -> acknowledged -> state_advanced|explicit_error
5) Verplichte livenessvelden end-to-end:
   ack_status, state_advanced, reason_code, action_code_echo, client_action_id_echo
6) Zorg dat client_action_id_echo voor interactieve actions non-empty is.
7) Fail-closed UX zonder dead-end: bij no-advance/failure expliciete status tonen met reason-code.
8) Observability/SLO per action_code:
   dispatch_count, ack_count, advance_count, explicit_error_count
   + vaste markers met action_code, client_action_id, ordering tuple.
9) Behoud MCP/OpenAI compatibiliteit:
   _meta.ui.resourceUri, openai/outputTemplate, openai/widgetAccessible, scheiding structuredContent vs _meta.

Lees eerst:
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- docs/mcp_widget_debug_agent_resultaat.md
- mcp-server/docs/ui-interface-contract.md
- mcp-server/docs/contracts/language-contract.md
- https://developers.openai.com/apps-sdk/reference
- https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- https://developers.openai.com/apps-sdk/build/state-management
- https://developers.openai.com/apps-sdk/deploy/testing
- https://developers.openai.com/apps-sdk/deploy/troubleshooting

Draai verplicht:
1) cd mcp-server && npm run typecheck
2) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts
3) cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

Lever verplicht bewijs:
- lokale test output
- CloudWatch timestamps voor ACTION_START dispatch/ack/advance + run_step_response contract_id/ui_view_mode
- bewijs dat startup leeg-scherm geen eindtoestand meer is
- bewijs dat started=true niet meer als no_output:NO_MENU succesvol doorloopt

Na succesvolle implementatie verplicht:
1) update docs/mcp_widget_regressie_living_rapport.md met volledige poging-resultaten
2) update docs/mcp_widget_stabilisatie_run_resultaat.md met exacte wijzigingen + test/live/logbewijs
3) voeg in living rapport expliciet toe:
   - waarom vorige oplossing onvoldoende was
   - welke invariant ontbrak
   - waarom deze oplossing structureel is (geen workaround)
```
