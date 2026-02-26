# Run Step Ownership Map

Date: 2026-02-26  
Status: 20 percent program PR1 guardrail progression wired; CI required phase remains `baseline`

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
- `phase_20` <= 1170 LOC (final 20 percent thin-facade target)

Compatibility note:
- `stretch` remains accepted as a deprecated alias of `phase_20` in architecture scripts.

## Required phase progression

- `baseline` -> `phase_A` -> `phase_B` -> `phase_C` -> `phase_20`
- CI stays pinned to `baseline` until explicit phase-flip criteria below are met and reported.

## CI phase-flip criteria and reporting

| CI required phase | Earliest flip point | Required evidence in `docs/run_step_refactor_20pct_log.md` |
| --- | --- | --- |
| `baseline` | now (PR1) | Keep mandatory checks green and report active `RUN_STEP_ARCH_PHASE` validation command result for each PR. |
| `phase_A` | after PR3 | `run_step.ts` LOC <= 4000 plus `RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check` pass in PR2 and PR3 logs. |
| `phase_B` | after PR5 | `run_step.ts` LOC <= 2500 plus `RUN_STEP_ARCH_PHASE=phase_B npm --prefix mcp-server run arch:run-step:check` pass in PR4 and PR5 logs. |
| `phase_C` | after PR7 | `run_step.ts` LOC <= 1500 plus `RUN_STEP_ARCH_PHASE=phase_C npm --prefix mcp-server run arch:run-step:check` pass in PR6 and PR7 logs. |
| `phase_20` | after PR8 | `run_step.ts` LOC <= 1170 plus `RUN_STEP_ARCH_PHASE=phase_20 npm --prefix mcp-server run arch:run-step:check` pass and all mandatory tests/parity checks green in PR8 log. |

Mandatory per-PR reporting fields for CI phase decisions:
- Current `run_step.ts` LOC.
- Current target phase check command and pass/fail result.
- Recommendation: `hold` or `flip_to_<phase>` with exact next CI env value.
