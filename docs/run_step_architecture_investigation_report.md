# Run Step Architecture Investigation Report

Date: 2026-02-25  
Scope: `mcp-server/src/handlers/run_step.ts` and direct boundary modules  
Purpose: deep investigation and concrete architecture blueprint before Step 7-12 execution

## 1. Executive summary

Current state:

- `run_step.ts` is still a monolith at `8529` LOC.
- The file has mixed responsibilities: ingress glue, i18n runtime, action routing, special routes, wording engine, UI payload composition, state mutation, contract recovery, and final response assembly.
- Prior refactor steps (1-6) improved safety and extracted some modules, but did not achieve structural compression.

Primary recommendation:

- Move full subsystems in sequence, not helper fragments.
- Keep `run_step.ts` as facade/orchestrator.
- Use architecture gates (LOC + boundary + complexity) to prevent relapses.

Target:

- Primary band: `1500-2500 LOC`
- Stretch: `850-1200 LOC` only if parity remains stable.

## 2. Evidence snapshot (investigation facts)

### 2.1 Size and function density

- File size: `mcp-server/src/handlers/run_step.ts = 8529 LOC`
- Function count: `242`
- Exported function count: `22`

Largest blocks:

- `run_step(...)` ~2609 LOC at [run_step.ts:5921](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:5921)
- `buildUiPayload(...)` ~300 LOC at [run_step.ts:4734](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:4734)
- `buildTextForWidget(...)` ~158 LOC at [run_step.ts:1373](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:1373)
- `applyStateUpdate(...)` ~142 LOC at [run_step.ts:5721](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:5721)
- `validateRenderedContractTurn(...)` ~139 LOC at [run_step.ts:510](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:510)
- `buildWordingChoiceFromTurn(...)` ~139 LOC at [run_step.ts:4271](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts:4271)

### 2.2 Duplication and control-flow pressure

- `return finalizeResponse(attachRegistryPayload(...))` appears `29` times.
- `callSpecialistStrictSafe(...)` appears `8` times.
- `renderFreeTextTurnPolicy(...)` + `validateRenderedContractOrRecover(...)` recurring pattern appears across many route branches.

This indicates repeated response orchestration and branch-specific pipelines that should be centralized.

### 2.3 High-coupling exports

Tests and scripts import directly from `run_step.ts`:

- `mcp-server/src/handlers/run_step.test.ts`
- `mcp-server/src/handlers/run_step_finals.test.ts`
- `mcp-server/src/handlers/step_contracts.test.ts`
- `mcp-server/scripts/contract-smoke.mjs`

This coupling increases the cost of moving logic unless temporary re-exports are used.

## 3. Bottleneck map (why file remains large)

1. Multiple engines in one file
- wording engine + UI composer + i18n wrappers + route handlers + pipeline guards all co-located.

2. Repeated response assembly
- many branches build synthetic payloads individually instead of one shared response composer path.

3. Route branch explosion
- special route logic is inline and duplicated (dream variants, presentation route, start/prestart path).

4. Hidden domain boundaries
- function clusters exist but are not separated at module boundaries.

5. Export-driven inertia
- tests depending on run_step exports discourage aggressive extraction.

## 4. Architecture decomposition proposal

## 4.1 Target module partitions

1. `run_step.ts` (facade/orchestrator only)
- ingress delegation
- context initialization
- route dispatch call
- pipeline call
- finalize call

2. `run_step_ui_payload.ts`
- UI payload building, flags, contract metadata normalization, payload attachment

3. `run_step_wording.ts`
- wording pending detection, selection processing, mode logic, wording payload overrides

4. `run_step_routes/` (folder)
- route registry + handlers:
- `start_prestart.route.ts`
- `dream_special.route.ts`
- `presentation.route.ts`
- `synthetic_pick.route.ts`

5. `run_step_pipeline.ts`
- post-specialist staged processing:
- guards
- repairs
- render+contract validation
- rerender recovery
- overlays

6. `run_step_state_update.ts`
- state mutation, provisional staging, dream runtime mode transitions

7. `run_step_i18n_runtime.ts`
- locale/language/ui-strings runtime wrappers currently held in `run_step.ts`

8. `run_step_response.ts`
- shared response helpers for success/error/fail-closed path assembly

## 4.2 API design intent (no behavior change)

- Each module exposes one primary orchestrator function.
- Helper internals remain module-private unless tests require export.
- `run_step.ts` consumes module APIs, not low-level helpers.

## 5. Migration strategy with risk control

Sequence:

1. Guardrails first (Step 7).
2. Deterministic/low-risk subsystems first (UI payload, wording).
3. Branch-heavy route extraction next.
4. Core pipeline and state extraction after branch cleanup.
5. Final convergence and hardening.

Risk minimization rules:

- Move one subsystem per step.
- No policy redesign during extraction steps.
- Temporary compatibility re-exports allowed to keep tests stable.
- Every step must show LOC reduction in `run_step.ts`.

## 6. Per-step investigation checkpoints (before coding each step)

For every step, agent must first run:

```bash
wc -l mcp-server/src/handlers/run_step.ts
rg -n "export async function run_step|buildUiPayload|buildWordingChoiceFromTurn|applyStateUpdate|validateRenderedContractOrRecover" mcp-server/src/handlers/run_step.ts
rg -n "return finalizeResponse\\(attachRegistryPayload\\(" mcp-server/src/handlers/run_step.ts
```

Then verify expected ownership after the step:

- moved functions are no longer defined in `run_step.ts`
- `run_step.ts` imports new module API
- contracts/parity tests still green

## 7. File-system overview proposal (future)

Suggested end-state tree:

```text
mcp-server/src/handlers/
  run_step.ts
  run_step_ui_payload.ts
  run_step_wording.ts
  run_step_pipeline.ts
  run_step_state_update.ts
  run_step_i18n_runtime.ts
  run_step_response.ts
  run_step_routes/
    index.ts
    start_prestart.route.ts
    dream_special.route.ts
    presentation.route.ts
    synthetic_pick.route.ts
```

## 8. Quality gates and acceptance

Mandatory per step:

- `npm --prefix mcp-server run build`
- `node mcp-server/scripts/ui_artifact_parity_check.mjs`
- `npm --prefix mcp-server test`

Architecture gates:

- LOC budget gate by phase
- import-boundary gate
- complexity gate

Program done:

- `run_step.ts` in primary band (`1500-2500`) or better
- stretch (`850-1200`) only with stable parity
- no contract drift
- no fail-closed regressions

## 9. Outputs this investigation expects from execution playbook

Execution must include:

- copy-paste prompt per step
- fixed format end report
- 70% cap checkpoint and partial commit rule
- memory update protocol
- exact commit message per step

Companion runbook:

- [run_step_refactor_agent_playbook_v2.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_agent_playbook_v2.md)

