# Run Step Architecture & Strategy (Single Source)

Date: 2026-02-25
Status: Active
Scope: `mcp-server/src/handlers/run_step.ts` and directly coupled modules

This is the single source for architecture and strategy.
Operational execution is in:
- [run_step_refactor_agent_playbook_v2.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_agent_playbook_v2.md)

## 1. Program goal

Reduce `run_step.ts` from monolith to thin facade while preserving behavior and contract parity.

Primary target:
- `run_step.ts` in `1500-2500 LOC`

Stretch target (only if low risk):
- `run_step.ts` in `850-1200 LOC`

## 2. Baseline

Current known baseline:
- `run_step.ts`: ~8529 LOC
- Hotspots:
- contract validation/recovery
- wording engine
- UI payload composer
- i18n/runtime wrappers
- state mutation
- route-special branches
- final orchestrator body

## 3. What we are doing (and not doing)

In scope:
- Partition full subsystems into dedicated modules
- Keep `run_step.ts` as orchestration facade
- Enforce architecture rails in CI

Out of scope:
- Broad behavior redesign
- Cosmetic rewrites unrelated to partitioning
- Opportunistic feature additions

## 4. Architecture principles

1. One responsibility per module
- `run_step.ts` orchestrates only
- domain logic lives in domain modules

2. Full-subsystem extraction only
- move complete clusters, not helper fragments

3. Deterministic response path
- centralize `render -> contract validate -> finalize response`

4. Fail-closed stays fail-closed
- startup/i18n/invalid-state behavior must remain strict

5. No contract drift
- preserve `ui.actions`, `action_codes`, `contract_id`, `text_keys`, `registry_version`

## 5. Target module partition

Target modules:
- `run_step.ts` (facade)
- `run_step_ui_payload.ts`
- `run_step_wording.ts`
- `run_step_routes.ts` (or `run_step_routes/`)
- `run_step_pipeline.ts`
- `run_step_state_update.ts`
- `run_step_i18n_runtime.ts`
- `run_step_response.ts`

## 6. Step strategy (high level)

Step 1 - Guardrails
- Add LOC/boundary/complexity rails and ownership mapping

Step 2 - UI payload subsystem
- Extract UI compose/attach path

Step 3 - Wording subsystem
- Extract pending/pick/build wording flow

Step 4 - Special routes subsystem
- Extract start/prestart, dream specials, presentation and synthetic route branches

Step 5 - Pipeline + state subsystem
- Extract post-specialist stage chain and state mutation logic

Step 6 - Convergence + hardening
- Final facade thinning + full release gates + architecture conformance

## 7. Mandatory quality gates (every step)

- `npm --prefix mcp-server run build`
- `node mcp-server/scripts/ui_artifact_parity_check.mjs`
- `npm --prefix mcp-server test`

From Step 1 onward also:
- LOC gate for `run_step.ts`
- import-boundary gate
- complexity gate

## 8. Program-level invariants

Must remain stable at all times:
- `run_step(rawArgs)` external signature
- success/error/fail-closed response shape
- MCP model/app visibility contract behavior
- startup/i18n gate semantics (`waiting_locale` vs `ready`)
- deterministic route and menu/action behavior

## 9. Memory + handoff protocol

Track every step in:
- `docs/run_step_refactor_memory.md`

Required fields per step entry:
- step id/title
- status
- completed/pending
- changed files
- tests + architecture checks
- next step TODO
- commit hash

## 10. Definition of done

Program is done when all are true:
1. `run_step.ts` in `1500-2500 LOC` band (or lower)
2. Stretch to `850-1200` only if parity stays stable
3. architecture gates active and passing in CI
4. all parity/tests green
5. facade owns orchestration only
