# MCP Widget Stabilisatie - Next Agent Prompt

Context datum: 2026-02-27 12:35 CET

## 1) Wat is afgerond (feitelijk)
1. `mcp-server/ui/lib/main.ts`
- Lege `openai:set_globals` payload overschrijft bestaande valide render-state niet meer.
- Nieuwe logmarker: `startup_set_globals_empty_payload_ignored`.

2. `mcp-server/ui/lib/ui_actions.ts`
- `ACTION_START` ack zonder state-advance triggert nu een begrensde auto-recovery:
  - exact 1 geplande `ACTION_BOOTSTRAP_POLL` (single-flight timer + signature dedupe),
  - geen infinite retry-loop.

3. `mcp-server/src/ui_render.test.ts`
- Nieuwe sequence-tests toegevoegd:
  - startup: lege init payload gevolgd door host payload,
  - start: ack zonder advance -> auto poll -> volgende state.

4. Validatie lokaal uitgevoerd
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` => groen.
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` => groen.

## 2) Wat nog open staat
1. Live validatie ontbreekt nog:
- `curl -sS -D - <public-url>/ui/step-card?...`
- `curl -sS -D - <public-url>/version`
- CloudWatch events rond:
  - `run_step_request`
  - `run_step_response`
  - `run_step_render_source_selected`
  - `ui_ingest_dropped_no_widget_result`
  - `stale_bootstrap_payload_dropped`
  - `ui_start_dispatch_ack_without_state_advance`

2. Stabiliteitsdrempel nog niet hard afgevinkt op echte MCP hostsessies (meerdere herhalingen).

## 3) Welke hypotheses al weerlegd zijn
1. "Primair MCP metadata/descriptor-probleem" is niet dragend voor huidige regressie.
- Contracttests voor `openai/outputTemplate`, `openai/widgetAccessible`, wrapper-vorm en `_meta.widget_result` blijven groen.

2. "Alleen server stale/rebase is root cause" is onvoldoende.
- Client lifecyclepad bevatte twee concrete racepunten (nu lokaal geadresseerd): lege `set_globals` overschrijving en start-ack-zonder-advance zonder recovery.

## 4) 70%-contextsubset voor eerste pass
Gebruik eerst deze 10 bestanden (10/15 = binnen budget):
1. `mcp-server/ui/lib/main.ts`
2. `mcp-server/ui/lib/ui_actions.ts`
3. `mcp-server/ui/lib/ui_render.ts`
4. `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
5. `mcp-server/server.ts`
6. `mcp-server/src/handlers/run_step_runtime.ts`
7. `mcp-server/src/handlers/run_step_ui_payload.ts`
8. `mcp-server/src/handlers/turn_contract.ts`
9. `mcp-server/src/ui_render.test.ts`
10. `mcp-server/src/mcp_app_contract.test.ts`

## 5) Exacte eerstvolgende 3 acties
1. Doe live endpoint-checks en leg exact response headers/body vast voor `/ui/step-card?...` en `/version`.
2. Trek CloudWatch logs voor de 6 kern-events in hetzelfde tijdvenster als de handmatige flowruns; bevestig of `ui_start_dispatch_ack_without_state_advance` nog voorkomt na deze fix.
3. Voer minimaal 5 volledige host-flows uit (startup -> start -> tweede scherm) en update:
- `docs/mcp_widget_stabilisatie_run_resultaat.md` met live bewijs,
- `docs/mcp_widget_regressie_living_rapport.md` met finale pogingstatus (bevestigd/weerlegd).
