# Run Step Ownership Map

Date: 2026-02-25  
Status: Step 6 convergence hardening executed (facade thinning in progress)

| Concern | Current location | Target module | Owner step | Migration status |
| --- | --- | --- | --- | --- |
| Ingress parse + canonicalization + fail-closed marker checks | `mcp-server/src/handlers/ingress.ts` | `mcp-server/src/handlers/ingress.ts` | Step 2 | completed |
| Contract validation and finalize-response internals | `mcp-server/src/handlers/turn_contract.ts` | `mcp-server/src/handlers/turn_contract.ts` | Step 3 | completed |
| Specialist strict/safe dispatch + transient adapters | `mcp-server/src/handlers/specialist_dispatch.ts` | `mcp-server/src/handlers/specialist_dispatch.ts` | Step 4 | completed |
| UI payload composer (`buildUiPayload`, `attachRegistryPayload`, helpers) | `mcp-server/src/handlers/run_step_ui_payload.ts` | `mcp-server/src/handlers/run_step_ui_payload.ts` | Step 2 | completed |
| Wording engine (`buildWordingChoiceFromTurn`, selection/merge flow) | `mcp-server/src/handlers/run_step_wording.ts` | `mcp-server/src/handlers/run_step_wording.ts` | Step 3 | completed |
| Special route branches (start/prestart, dream specials, presentation/synthetic) | `mcp-server/src/handlers/run_step_routes.ts` | `mcp-server/src/handlers/run_step_routes.ts` | Step 4 | completed |
| Post-specialist staged pipeline (render/validate/recovery chain) | `mcp-server/src/handlers/run_step_pipeline.ts` | `mcp-server/src/handlers/run_step_pipeline.ts` | Step 5 | completed |
| State mutation + provisional source/runtime mode transitions | `mcp-server/src/handlers/run_step_state_update.ts` | `mcp-server/src/handlers/run_step_state_update.ts` | Step 5 | completed |
| i18n/bootstrap runtime wrappers and UI-strings gate orchestration | `mcp-server/src/handlers/run_step.ts` | `mcp-server/src/handlers/run_step_i18n_runtime.ts` | Step 5 | pending |
| Shared success/error/fail-closed response assembly helpers | `mcp-server/src/handlers/run_step.ts` + `mcp-server/src/handlers/turn_contract.ts` | `mcp-server/src/handlers/run_step_response.ts` | Step 6 | in_progress |
| Facade orchestration + dependency composition only | `mcp-server/src/handlers/run_step.ts` | `mcp-server/src/handlers/run_step.ts` | Step 6 | in_progress |

## Guardrail phase budgets (reference)

- `baseline` <= 9000 LOC (current gate for Step 1 wiring)
- `phase_A` <= 4000 LOC
- `phase_B` <= 2500 LOC
- `phase_C` <= 1500 LOC
- `stretch` <= 1200 LOC
