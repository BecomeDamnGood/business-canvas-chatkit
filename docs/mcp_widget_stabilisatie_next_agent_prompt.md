# MCP Widget Stabilisatie - Next Agent Prompt (post CORE hard-refactor)

Context datum: 2026-02-27
Status: CORE-only refactor lokaal afgerond; gates/typecheck PASS. Live 5/5 bewijs ontbreekt nog.

## 1) Wat al klaar is
1. Canonical mode-authority server-side:
   - `mcp-server/src/handlers/run_step_canonical_widget_state.ts`
   - gebruikt door `mcp-server/src/handlers/turn_contract.ts`
   - toegestane modes: `prestart|interactive|blocked`.
2. UI gestript:
   - ingest alleen `_meta.widget_result`
   - geen client startup/recovery mode-routing meer.
3. Observability centraal:
   - event `run_step_canonical_view_emitted` in `run_step_response.ts`.
4. Gates lokaal groen:
   - `cd mcp-server && npm run typecheck`
   - `cd mcp-server && npm run gate:hard-refactor`

## 2) Wat de volgende agent nu MOET doen
1. Voer volledige live 5/5 bewijsrun uit (flow 1..5):
   - startup
   - eerste render
   - startklik
   - tweede scherm render
2. Leg per flow exact vast:
   - absolute timestamp (UTC)
   - sessie-id / correlatie-id / trace-id
   - action/request id
   - ui mode uit payload
   - UX-uitkomst (zichtbaar/bruikbaar)
3. Herijk en fix eventuele resterende testregressies in `src/ui_render.test.ts` die nog legacy fallback/recovery gedrag verwachten.

## 3) Exacte live-check stappen (per flow)
1. Open widget in schone sessie.
2. Controleer eerste payload: `_meta.widget_result` aanwezig.
3. Verifieer event `run_step_canonical_view_emitted` voor startup-turn.
4. Klik Start exact 1x.
5. Verifieer volgende `run_step_canonical_view_emitted` + tuple (`bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`).
6. Bevestig dat tweede scherm direct renderbaar is (geen blank/half eindtoestand).
7. Markeer flow PASS/FAIL.

## 4) Vereiste correlatie-events per flow
1. `run_step_request`
2. `run_step_response`
3. `run_step_canonical_view_emitted`
4. `run_step_render_source_selected`

## 5) Pass/fail matrix en beslisregel
- PASS flow:
  - `_meta.widget_result` is render-source,
  - canonical mode geldig,
  - startklik deterministic (1 klik -> advance),
  - tweede scherm direct renderbaar,
  - geen blank/half eindtoestand.
- FAIL flow:
  - een van bovenstaande criteria faalt.
- Definitief DONE:
  - alleen bij 5/5 PASS.
- Bij <5/5:
  - lever root-cause + gerichte vervolgstap met codepad en bewijs.
