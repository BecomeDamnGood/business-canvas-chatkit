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

## Step 2 - Ingress
Date: 2026-02-25 17:24 CET
Status: completed
Completed:
- Extracted ingress canonicalization helpers to `mcp-server/src/handlers/ingress.ts` (`canonicalizeStateForRunStepArgs`, transient allowlist/state cleanup, and `RunStepArgsSchema`).
- Extracted legacy marker detection and invalid contract-state marker detection to `mcp-server/src/handlers/ingress.ts`.
- Extracted contract locale/language normalization and fail-closed state builder (`buildFailClosedState`) to `mcp-server/src/handlers/ingress.ts`.
- Added `parseRunStepIngressArgs` and replaced the `run_step.ts` ingress parse block with a thin delegator while preserving fail-closed response shape and error details.
- Switched `run_step.ts` contract assertions and ingress checks to imported ingress constants/helpers from `ingress.ts`.
Pending:
- None for Step 2 scope.
Changed files:
- mcp-server/src/handlers/ingress.ts
- mcp-server/src/handlers/run_step.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run typecheck => pass
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/state.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts => pass
Next agent exact TODO:
- Start Step 3 extraction from the updated baseline and keep ingress-only responsibilities in `mcp-server/src/handlers/ingress.ts` unchanged.
Commit:
- pending_after_commit

## Step 3 - Turn Contract
Date: 2026-02-25 17:30 CET
Status: completed
Completed:
- Extracted `validateUiPayloadContractParity` from `run_step.ts` into `mcp-server/src/handlers/turn_contract.ts` with dependency injection for step/menu label resolution.
- Extracted `assertRunStepContractOrThrow` into `mcp-server/src/handlers/turn_contract.ts` while preserving strict bootstrap/i18n fail-closed checks.
- Extracted `buildContractFailurePayload` into `mcp-server/src/handlers/turn_contract.ts` with unchanged failure payload shape.
- Extracted contract-safe `finalizeResponse` internals into `finalizeResponseContractInternals` and delegated from `run_step.ts` without changing telemetry/token logging flow.
Pending:
- None for Step 3 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/turn_contract.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run typecheck => pass
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/turn_policy_renderer.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts => pass
Next agent exact TODO:
- Start Step 4 from this baseline; keep `mcp-server/src/handlers/turn_contract.ts` as the sole owner of turn contract/finalization helper logic.
Commit:
- pending_after_commit
