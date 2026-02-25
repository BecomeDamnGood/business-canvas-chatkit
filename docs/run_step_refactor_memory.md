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

## Step 1 - Guardrails
Date: 2026-02-25 20:12 CET
Status: completed
Completed:
- Added ownership map at `docs/run_step_ownership_map.md` with concern boundaries, target modules, owner steps, and migration status.
- Added LOC guardrail script at `mcp-server/scripts/arch/run_step_loc_check.mjs` with phased budgets (`baseline`, `phase_A`, `phase_B`, `phase_C`, `stretch`).
- Added import-boundary guardrail script at `mcp-server/scripts/arch/run_step_boundary_check.mjs` with allowed facade import domains and phased dependency budgets.
- Added complexity guardrail script at `mcp-server/scripts/arch/run_step_complexity_check.mjs` with AST-based top-level function and cyclomatic budgets by phase.
- Wired architecture checks into `mcp-server/package.json` and `.github/workflows/ci.yml` (`Run-step architecture guardrails` step).
Pending:
- Advance architecture phase from `baseline` to stricter phases as subsystem extractions land in next steps.
Changed files:
- .github/workflows/ci.yml
- mcp-server/package.json
- mcp-server/scripts/arch/run_step_loc_check.mjs
- mcp-server/scripts/arch/run_step_boundary_check.mjs
- mcp-server/scripts/arch/run_step_complexity_check.mjs
- docs/run_step_ownership_map.md
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- npm --prefix mcp-server run arch:run-step:check => pass
Next agent exact TODO:
- Start Step 2 and extract the full UI payload subsystem from `run_step.ts` into `mcp-server/src/handlers/run_step_ui_payload.ts`, then move guardrail phase toward `phase_A` when budgets are met.
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

## Step 4 - Specialist Dispatch
Date: 2026-02-25 17:40 CET
Status: completed
Completed:
- Extracted specialist instruction composition into `mcp-server/src/handlers/specialist_dispatch.ts` via `composeSpecialistInstructions` with unchanged instruction block ordering.
- Extracted strict specialist execution into `callSpecialistStrict` with identical per-specialist schema/instruction/input routing, including Rules-of-the-Game normalization before post-processing.
- Extracted strict-safe specialist execution into `callSpecialistStrictSafe` with unchanged model-routing shadow logging and retryable timeout/rate-limit handling.
- Extracted timeout/rate-limit/error adapters (`isRateLimitError`, `isTimeoutError`, transient retry fallback builder, and structured transient payload builders) and wired `run_step.ts` to use dispatch wrappers.
- Updated source-guard test to assert the Rules-of-the-Game normalization sequence in `specialist_dispatch.ts` after extraction.
Pending:
- None for Step 4 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/specialist_dispatch.ts
- mcp-server/src/handlers/run_step_finals.test.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run typecheck => pass
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/llm_timeout.test.ts src/core/model_routing.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts => pass
Next agent exact TODO:
- Start Step 5 from this baseline and keep specialist dispatch/runtime error adapters owned by `mcp-server/src/handlers/specialist_dispatch.ts`.
Commit:
- pending_after_commit

## Step 5 - Integration
Date: 2026-02-25 17:44 CET
Status: completed
Completed:
- Thinned `run_step.ts` facade wiring by removing dead specialist-schema/instruction imports that were fully extracted in Step 4.
- Kept existing delegate flow/order intact (`ingress` parsing, `turn_contract` finalization, `specialist_dispatch` strict/safe call path) with no policy changes.
- Updated server-side source guard to validate ui.view contract ownership across the integrated modules (`run_step.ts`, `ingress.ts`, `turn_contract.ts`).
Pending:
- None for Step 5 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/server_safe_string.test.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server test => pass
Next agent exact TODO:
- Continue with next planned refactor step from this baseline while preserving module ownership boundaries introduced in Steps 2-5.
Commit:
- pending_after_commit

## Step 6 - Hardening
Date: 2026-02-25 17:45 CET
Status: completed
Completed:
- Ran all required hardening gates end-to-end: `npm --prefix mcp-server run build`, `node mcp-server/scripts/ui_artifact_parity_check.mjs`, and `npm --prefix mcp-server test`.
- Confirmed parity status is green: UI artifact parity check passed and full test suite passed with zero failures.
- Applied no code fixes because no gate failed.
Pending:
- None for Step 6 scope.
Changed files:
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Next agent exact TODO:
- No additional hardening action required; continue only if a new post-Step-6 requirement is opened.
Commit:
- pending_after_commit

## Step 2 - UI payload subsystem
Date: 2026-02-25 20:21 CET
Status: completed
Completed:
- Extracted UI payload subsystem into `mcp-server/src/handlers/run_step_ui_payload.ts` with `createRunStepUiPayloadHelpers`.
- Moved `buildUiPayload`, `attachRegistryPayload`, `normalizeUiContractMeta` and direct payload helpers (phase/render-mode/menu transition helpers) out of `run_step.ts`.
- Switched `run_step.ts` to delegation-only wiring via `uiPayloadHelpers` while preserving existing call sites and OpenAI MCP app contract behavior.
- Updated ownership mapping to mark the UI payload concern as completed in `docs/run_step_ownership_map.md`.
Pending:
- No pending work for Step 2 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_ui_payload.ts
- docs/run_step_ownership_map.md
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- npm --prefix mcp-server run arch:run-step:check => pass
Next agent exact TODO:
- Start Step 3 and extract the wording subsystem (`buildWordingChoiceFromTurn` + selection/merge flow) into `mcp-server/src/handlers/run_step_wording.ts` while keeping UI payload ownership in `run_step_ui_payload.ts`.
Commit:
- pending_after_commit

## Step 3 - Wording subsystem
Date: 2026-02-25 20:38 CET
Status: completed
Completed:
- Extracted wording pending/pick/build flow into `mcp-server/src/handlers/run_step_wording.ts` via `createRunStepWordingHelpers`.
- Moved wording selection/merge utilities and feedback sanitization logic out of `run_step.ts` and delegated through one helper wiring point.
- Kept `run_step.ts` exports stable for tests (`isWordingChoiceEligibleStep`, `isWordingChoiceEligibleContext`, `isListChoiceScope`, `stripUnsupportedReformulationClaims`, `buildWordingChoiceFromTurn`) via helper-backed bindings.
- Updated ownership map to mark wording subsystem migration as completed.
Pending:
- No pending work for Step 3 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_wording.ts
- docs/run_step_ownership_map.md
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- git diff --name-only | wc -l => pass (1)
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}' => pass (adds=55 dels=715 total=770)
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l => pass (8)
- npm --prefix mcp-server run arch:run-step:check => pass
Next agent exact TODO:
- Start Step 4 and extract special route branches (start/prestart, dream specials, synthetic pick/presentation routes) into dedicated route module(s) while preserving wording ownership in `mcp-server/src/handlers/run_step_wording.ts`.
Commit:
- pending_after_commit

## Step 4 - Special route registry subsystem
Date: 2026-02-25 20:56 CET
Status: completed
Completed:
- Extracted special routes from `run_step.ts` into `mcp-server/src/handlers/run_step_routes.ts` with a deterministic `canHandle`/`handle` registry order.
- Moved start/prestart, dream special routes, synthetic pick routes, and presentation generation route into route handlers while preserving route token behavior and response contracts.
- Replaced inline branch-heavy special-route control flow in `run_step.ts` with one `handleSpecialRouteRegistry` dispatch path.
- Added `mcp-server/src/handlers/run_step_modules.ts` barrel import so `run_step.ts` stays within architecture import-boundary budget.
- Updated source guard test to validate Dream start-exercise route ownership through `run_step_routes.ts`.
- Updated ownership map to mark special route subsystem as completed.
Pending:
- No pending work for Step 4 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_routes.ts
- mcp-server/src/handlers/run_step_modules.ts
- mcp-server/src/handlers/run_step_finals.test.ts
- docs/run_step_ownership_map.md
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- git diff --name-only | wc -l => pass (2)
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}' => pass (adds=103 dels=922 total=1025)
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l => pass (4)
- npm --prefix mcp-server run arch:run-step:check => pass
Next agent exact TODO:
- Start Step 5 and extract post-specialist pipeline and state mutation flow into `mcp-server/src/handlers/run_step_pipeline.ts` and `mcp-server/src/handlers/run_step_state_update.ts` while keeping `run_step_routes.ts` as sole owner of special-route handling.
Commit:
- pending_after_commit

## Step 5 - Pipeline + state subsystem
Date: 2026-02-25 21:09 CET
Status: completed
Completed:
- Extracted state mutation logic into `mcp-server/src/handlers/run_step_state_update.ts` with `createRunStepStateUpdateHelpers` (`applyStateUpdate` + post-specialist dream/runtime mutations).
- Extracted post-specialist stage chain into `mcp-server/src/handlers/run_step_pipeline.ts` with explicit stage-order manifest and a single `runPostSpecialistPipeline` entrypoint.
- Switched `run_step.ts` to facade wiring: initialize helpers, call pipeline once after special-route dispatch, and finalize once via `finalizeResponse(pipelinePayload)`.
- Updated source-guard ownership assertions in `run_step_finals.test.ts` to validate wording/off-topic pipeline ownership in `run_step_pipeline.ts`.
- Extended `mcp-server/src/handlers/run_step_modules.ts` barrel exports to include pipeline/state helper factories.
Pending:
- No pending work for Step 5 scope.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_pipeline.ts
- mcp-server/src/handlers/run_step_state_update.ts
- mcp-server/src/handlers/run_step_modules.ts
- mcp-server/src/handlers/run_step_finals.test.ts
- docs/run_step_refactor_memory.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- git diff --name-only | wc -l => pass (4)
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}' => pass (adds=132 dels=675 total=807)
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l => pass (4)
- npm --prefix mcp-server run arch:run-step:check => pass
Next agent exact TODO:
- Start Step 6 convergence: final facade cleanup and hardening pass, keeping `run_step_pipeline.ts` as sole owner of the post-specialist stage chain and `run_step_state_update.ts` as sole owner of state mutation staging.
Commit:
- pending_after_commit
