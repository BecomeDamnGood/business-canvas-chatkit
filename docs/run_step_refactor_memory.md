## Step 1 - Guardrails
Date: 2026-02-25 17:19 CET
Status: completed
Completed:
- Added run_step output-shape parity snapshots for prestart, waiting_locale, interactive, blocked, and failed states.
- Added fail-closed regressions for invalid contract-state input and legacy confirmation markers.
- Added determinism guardrail for `ui.actions`, `action_codes`, `contract_id`, and `text_keys` using repeated identical input.
- Added MCP wrapper parity guardrails to enforce model-safe minimal `structuredContent.result` and full `_meta.widget_result` mapping paths.
Pending:
- None for Step 1 scope.
Changed files:
- mcp-server/src/handlers/run_step.test.ts
- mcp-server/src/handlers/run_step_finals.test.ts
- mcp-server/src/mcp_app_contract.test.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run typecheck => pass
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/golden_trace_contract.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts => pass
Next agent exact TODO:
- Start Step 2 (ingress extract) while preserving Step 1 guardrail tests and all listed invariants.
Commit:
- pending_after_commit
