# MCP Widget Stabilisatie - Next Agent Prompt (Na tuple-parity + fail-closed pass)

Context datum: 2026-02-27 14:32 CET  
Scope: lokale ketenfix pass 2 is klaar; productievalidatie op App Runner ontbreekt nog.

## 1) Missie
Valideer en rond de MCP-widget integraal af over de volledige keten:
`host event -> ingest -> ordering -> render -> ACTION_START dispatch -> server response -> ingest -> next render`

Definition of Done:
1. Eerste scherm toont direct bruikbare content (geen lege/half-eindtoestand).
2. Startknop werkt deterministisch op eerste klik.
3. Tweede scherm toont direct renderbare content.
4. SSOT blijft intact: `_meta.widget_result` blijft render-authority.
5. Ordering tuple is consistent in alle relevante payloads:
   - `bootstrap_session_id`
   - `bootstrap_epoch`
   - `response_seq`
   - `host_widget_session_id`

## 2) Verplichte bronnen (eerst lezen)
1. `docs/mcp_widget_regressie_living_rapport.md`
2. `docs/mcp_widget_stabilisatie_run_resultaat.md`
3. `docs/mcp_widget_debug_agent_resultaat.md`
4. `docs/ssot_mcp_app_proof_pr_stappen.md`
5. `docs/ssot_openstaande_punten_en_vragen_2026-02-26.md`

## 3) Nieuwe harde feiten na pass 2 (lokale code + tests)
1. `run_step_render_source_selected.host_widget_session_id_present` gebruikte voorheen request-context i.p.v. geselecteerde render-source payload.
2. Daardoor kon `run_step_response:true` en `run_step_render_source_selected:false` tegelijk voorkomen zonder echte payload-mismatch.
3. Server bevat nu tuple-parity hardening:
   - `ensureRunStepOutputTupleParity(...)`
   - event `run_step_ordering_tuple_parity`
   - event `run_step_output_tuple_parity_patched`.
4. UI ingest bevat nu fail-closed pad voor tuple-incomplete render-authority payload:
   - event `[ui_ingest_tuple_incomplete_fail_closed]`
   - recovery-state i.p.v. stille lege UI.
5. Verplichte lokale tests zijn groen:
   - `ui_render + mcp_app_contract + server_safe_string`: 103 pass, 0 fail
   - `run_step + run_step_finals`: 164 pass, 0 fail, 1 skipped

## 4) Werkhypothese + falsificatie
Werkhypothese (actueel):
- Het eerdere v200-bewijs voor tuple-mismatch was deels observability-artefact.
- Als regressie in productie blijft na deze fixes, dan ligt de resterende oorzaak waarschijnlijk in host/UI lifecycle-sequencing (bijv. duplicate open of event-volgorde), niet primair in tuple-pariteit.

Falsificatieplicht:
- Toets expliciet of nieuwe parity-events `tuple_parity_match:true` blijven tijdens problematische user-runs.
- Als parity stabiel is maar UX blijft breken, verwerp tuple-hypothese en documenteer nieuwe root-cause hypothese met hard bewijs.

## 5) 70%-contextbudget (eerste pass)
Lees diep maximaal 10 bestanden uit U:
1. `mcp-server/src/handlers/run_step_ui_payload.ts`
2. `mcp-server/src/handlers/turn_contract.ts`
3. `mcp-server/src/handlers/run_step_runtime.ts`
4. `mcp-server/server.ts`
5. `mcp-server/ui/lib/main.ts`
6. `mcp-server/ui/lib/ui_render.ts`
7. `mcp-server/ui/lib/ui_actions.ts`
8. `mcp-server/src/ui_render.test.ts`
9. `mcp-server/src/mcp_app_contract.test.ts`
10. `mcp-server/src/handlers/run_step.test.ts`

Breid alleen uit bij harde blokkade en noteer waarom in run-resultaat.

## 6) Verplichte aanpak (volgorde)

### Stap A - Sequence en observability (live)
1. Draai minimaal 5 volledige flows op gedeployde versie.
2. Correlleer user-observatie met events:
   - `run_step_request`
   - `run_step_response`
   - `run_step_ordering_tuple_parity`
   - `run_step_output_tuple_parity_patched`
   - `run_step_render_source_selected`
   - `ui_ingest_tuple_incomplete_fail_closed`
3. Leg pass/fail tabel vast per flow.

### Stap B - Tuple-pariteit valideren
1. Controleer dat parity-event tijdens probleemruns niet structureel op mismatch blijft.
2. Als mismatch voorkomt: exporteer exacte before/after tuples uit logs.
3. Als geen mismatch: markeer tuple-hypothese als weerlegd voor die sessie.

### Stap C - Ingest fail-closed gedrag valideren
1. Verifieer dat tuple-incomplete payloads geen lege eindtoestand geven.
2. Verifieer dat bestaande valide state niet overschreven wordt.

### Stap D - ACTION_START pad valideren
1. Behoud single-dispatch per klik.
2. Verifieer zichtbare state-advance binnen begrensde tijd.
3. Geen infinite retry loops.

### Stap E - Testen en regressiecheck
1. Houd onderstaande minimale commandset groen.
2. Voeg alleen extra tests toe als live-bewijs op nieuw falen wijst.

### Stap F - Besluit
1. **Geslaagd**: parity stabiel + geen leeg/half scherm + deterministische start in herhaalde live runs.
2. **Niet geslaagd**: parity stabiel maar UX nog kapot -> nieuwe hypothese rond host lifecycle/documenteer en handoff.

## 7) Verboden oplossingsrichtingen
1. Business-routing naar UI verplaatsen.
2. Contract versoepelen om tests groen te maken.
3. `_meta.widget_result` minder autoritatief maken.
4. Alleen lokale routefix zonder MCP/App Runner bewijs als “done” verklaren.

## 8) Minimale validatiecommands
1. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
3. Live checks (indien toegang):
   - `curl -sS -D - <public-url>/ui/step-card?...`
   - `curl -sS -D - <public-url>/version`

## 9) Verplichte outputbestanden
1. Update `docs/mcp_widget_stabilisatie_run_resultaat.md`
- Hypothese + falsificatie
- Wijzigingen per bestand
- Testresultaten
- Ketenbewijs startup -> start -> tweede scherm
- Restrisico + rollback

2. Update `docs/mcp_widget_regressie_living_rapport.md`
- Nieuwe poging met feitelijke observatie en uitkomst (bevestigd/weerlegd/onbeslist)

3. Update `docs/mcp_widget_stabilisatie_next_agent_prompt.md`
- Nieuwe handoff met afgerond/open/hypotheses/70%-subset/eerstvolgende acties

## 10) Stopcriteria
Stop en handoff als:
1. 70%-contextbudget bereikt zonder sluitend bewijs, of
2. Externe blockers (deploy/logtoegang) verhinderen eindvalidatie, of
3. Tuple-hypothese is weerlegd en nieuwe hypothese vereist bredere scope.

## 11) Exacte eerstvolgende 3 acties
1. Deploy versie met pass-2 fixes en verzamel parity-events op minimaal 5 volledige flows.
2. Correlleer user-observaties met `run_step_ordering_tuple_parity` + `run_step_render_source_selected` per flow.
3. Beslis: done (als UX stabiel) of nieuwe hypothese/handoff (als UX nog breekt met parity ok).
