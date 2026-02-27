# MCP Widget Stabilisatie - Next Agent Prompt (na v203 view-contract guard pass)

Context datum: 2026-02-27 16:05 CET
Status: lokale ketenfix + tests groen; live validatie nog open.

## 1) Wat is afgerond (feitelijk)
1. Server view-contract guard toegevoegd in `mcp-server/src/handlers/turn_contract.ts`:
   - forceert `step_0 + started=false` naar `ui.view.mode=prestart` + `ui_action_start=ACTION_START`.
   - forceert `interactive` zonder renderbare content naar `prestart` (step_0 + start action) of `blocked`.
2. Nieuwe observability per response in `mcp-server/src/handlers/run_step_response.ts`:
   - event `run_step_view_contract_guard` met velden:
     - `started`, `ui_view_mode`, `has_renderable_content`, `has_start_action`, `invariant_ok`, `violation_reason_code`, `guard_patch_applied`.
3. UI fail-safe toegevoegd in `mcp-server/ui/lib/ui_render.ts`:
   - interactive-no-content op `step_0` met start-action rendert nu prestart recovery i.p.v. blank/blocked dead-end.
4. Tests bijgewerkt:
   - `mcp-server/src/handlers/run_step.test.ts`
   - `mcp-server/src/ui_render.test.ts`
   - `mcp-server/src/mcp_app_contract.test.ts`
   - `mcp-server/src/server_safe_string.test.ts`
5. Verplichte testcommands uitgevoerd en groen:
   - `ui_render + mcp_app_contract + server_safe_string`: 107 pass, 0 fail.
   - `run_step + run_step_finals`: 166 pass, 0 fail, 1 skipped.

## 2) Wat nog open staat
1. Live verificatie op minimaal 5 volledige flows ontbreekt nog:
   - startup -> startklik -> tweede scherm.
2. CloudWatch-correlatie ontbreekt nog voor deze nieuwe guard-events:
   - `run_step_view_contract_guard`
   - `run_step_request`
   - `run_step_response`
   - `run_step_ordering_tuple_parity`
   - `run_step_render_source_selected`
   - `ui_start_dispatch_ack_without_state_advance`
   - `ui_contract_interactive_missing_content`
3. Steady-state acceptatie (guard violations ~0 of expliciet recoverable) is nog niet bewezen in productie.

## 3) Welke hypotheses al weerlegd zijn
1. `host_widget_session_id_present:false` in `run_step_render_source_selected` betekende altijd echte tuple-mismatch.
   - Weerlegd: observability gebruikte eerder niet de geselecteerde render-source payload.
2. Alleen tuple/parity fixen is voldoende om UX-regressie op te lossen.
   - Weerlegd: aanvullende view-contract guard + UI fallback waren nodig.
3. "Groene contracttests" is voldoende bewijs voor stabiele UX.
   - Weerlegd: live ketenbewijs blijft verplicht.

## 4) 70%-contextsubset voor de volgende agent (eerste pass)
1. `mcp-server/src/handlers/turn_contract.ts`
2. `mcp-server/src/handlers/run_step_response.ts`
3. `mcp-server/ui/lib/ui_render.ts`
4. `mcp-server/ui/lib/ui_actions.ts`
5. `mcp-server/ui/lib/main.ts`
6. `mcp-server/server.ts`
7. `mcp-server/src/handlers/run_step_runtime.ts`
8. `mcp-server/src/handlers/run_step_ui_payload.ts`
9. `mcp-server/src/ui_render.test.ts`
10. `mcp-server/src/handlers/run_step.test.ts`

## 5) Exacte eerstvolgende 3 acties
1. Deploy huidige workspace-versie en run 5 volledige user-flows; capture per flow of first paint/start/tweede scherm slaagt.
2. Trek CloudWatch events op dezelfde correlation/session en vul een flow-matrix met `run_step_view_contract_guard` (`invariant_ok`, `violation_reason_code`, `guard_patch_applied`).
3. Beslis op bewijs:
   - Als UX stabiel + guard_patch_applied vrijwel 0: markeer done.
   - Als UX nog breekt met invariant_ok=true: formuleer nieuwe lifecycle-hypothese en leg die vast in run-resultaat + living rapport.
