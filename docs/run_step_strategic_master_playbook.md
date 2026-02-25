# Run Step Strategic Master Playbook

Date: 2026-02-25  
Program: `run_step` compression + architectural partitioning  
Mode: Sequential single-lane execution (one agent step at a time)

## 1. Why this document exists

This is the operational master document for Steps 7-12.  
It combines:

- overall strategy and hard program context,
- technical boundaries and invariants,
- copy-paste-ready prompts per step with deep context.

Use this document as the primary execution source for the next refactor wave.

## 2. Current factual baseline (must stay visible to every step)

- Branch: `main`
- Latest commit: `d6e7a1e` (`step6: hardening parity gates and release validation`)
- Pre-step-series baseline: `e7c1c2c`
- Current file size: `mcp-server/src/handlers/run_step.ts = 8529 LOC`

Main hotspots in `run_step.ts`:

- Contract validation/recovery: `:510`, `:680`
- Wording engine: `:4271`, `:4410`
- UI payload composer: `:4734`
- i18n runtime block: `:5371`
- state mutation core: `:5721`
- main orchestrator function: `:5921`

## 3. Program-level target model

Primary size target:

- `run_step.ts` in `1500-2500 LOC` band

Stretch target (only if parity-risk stays low):

- `run_step.ts` in `850-1200 LOC` band

Non-negotiable:

- No contract/parity drift.
- No startup/i18n fail-open regression.
- No route token behavior drift.

## 4. Global architecture invariants (apply to every step)

1. Keep external contract stable
- `run_step(rawArgs)` signature
- success/error/fail-closed response shape
- `registry_version`, `ui.action_codes`, `ui.actions`, `ui.contract_*`, `ui.text_keys`

2. Preserve fail-closed behavior
- invalid/legacy/session-upgrade paths remain blocked with restart semantics

3. Preserve deterministic ordering
- no nondeterministic menu/action generation
- no branch-order drift in special routes

4. Preserve i18n/bootstrap semantics
- `waiting_locale` vs `ready` behavior remains identical

## 5. Global gates (run every step)

- `npm --prefix mcp-server run build`
- `node mcp-server/scripts/ui_artifact_parity_check.mjs`
- `npm --prefix mcp-server test`

Architecture gates (from Step 7 onward):

- LOC gate for `run_step.ts` by phase budget
- boundary/import gate
- complexity gate

## 6. Standard memory/handoff protocol

Always append to:

- `docs/run_step_refactor_memory.md`

Use this block format:

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <command/check> => <pass/fail>
Key invariants validated:
- ...
Next step exact TODO:
- ...
Commit:
- <hash>
```

## 7. Execution sequence map (program context chain)

- Step 7 creates enforcement rails.
- Step 8 removes UI payload subsystem.
- Step 9 removes wording subsystem.
- Step 10 removes special route subsystem.
- Step 11 removes post-specialist pipeline + state subsystem.
- Step 12 converges to thin facade and hardens release quality.

Each step must explicitly confirm how it supports the next step.

---

## 8. Copy-paste prompt - Step 7 (Architecture Guardrails)

```text
ROLE
Principal TypeScript architecture agent.

PROGRAM CONTEXT (MANDATORY)
- You are Step 7 in a larger Step 7-12 compression program.
- Current run_step.ts size is ~8529 LOC.
- This step creates hard rails for all subsequent extractions; it does not perform broad subsystem extraction.
- You must preserve behavior and contract parity.

OBJECTIVE
Install architecture guardrails that enforce progressive shrinking and module boundaries.

IN SCOPE
- Add architecture ownership map document.
- Add run_step LOC gate script with phased budgets.
- Add import-boundary gate for run_step facade.
- Add complexity gate for run_step facade.
- Wire these checks into CI.

DEEP TECHNICAL CONTEXT
- Existing code is monolithic and test-coupled through run_step exports.
- Without hard gates, subsystem logic will leak back into run_step.ts.
- This step must make future refactors enforceable and auditable.

TECHNICAL INSTRUCTIONS
1) Create ownership map doc:
- docs/run_step_ownership_map.md
- Columns: concern, current location, target module, owner step, migration status.

2) Add architecture scripts:
- mcp-server/scripts/arch/run_step_loc_check.mjs
- mcp-server/scripts/arch/run_step_boundary_check.mjs
- mcp-server/scripts/arch/run_step_complexity_check.mjs

3) Configure phased LOC budgets:
- phase_A <= 4000
- phase_B <= 2500
- phase_C <= 1500
- stretch <= 1200

4) Fail-check output must be explicit and actionable.

OUT OF SCOPE
- No refactor of runtime logic blocks.
- No extraction of UI, wording, route, or pipeline domains yet.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- run new architecture checks

COMMIT
- git add <changed files>
- git commit -m "step7: add run_step architecture guardrails and phase budgets"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Which constraints are now enforced for Steps 8-12
6) Exact next-step TODO for Step 8
7) Commit hash
```

---

## 9. Copy-paste prompt - Step 8 (UI Payload Subsystem)

```text
ROLE
Senior TypeScript architecture extraction agent (UI contract path).

PROGRAM CONTEXT (MANDATORY)
- You are Step 8 in the Step 7-12 program.
- Step 7 guardrails are assumed active.
- Your output is prerequisite for Step 10 and Step 12 facade convergence.

OBJECTIVE
Extract the full UI payload composition subsystem from run_step.ts into dedicated module(s) and keep behavior identical.

IN SCOPE
- Move UI payload assembly internals out of run_step.ts.
- Introduce run_step_ui_payload module boundary.
- Keep run_step.ts as caller-only for payload attachment.

DEEP TECHNICAL CONTEXT
- Hotspot: buildUiPayload/attachRegistryPayload path.
- This subsystem controls deterministic ui contract:
  action_codes, actions, contract_id, contract_version, text_keys, view, flags.
- Any mismatch causes parity failures and widget contract regressions.

TECHNICAL INSTRUCTIONS
1) Extract as one cohesive unit:
- buildUiPayload
- attachRegistryPayload
- normalizeUiContractMeta
- directly-coupled helper chain used only by these functions

2) Keep module API explicit and small:
- attachRegistryPayload(payload, specialist, options)
- optional typed helper exports only if tests require them

3) Preserve response semantics:
- text/prompt post-processing
- registry_version injection
- fail-closed contract compatibility

4) Run parity and tests before commit.

OUT OF SCOPE
- No wording engine extraction.
- No special route extraction.
- No pipeline stage refactor.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- architecture gates

COMMIT
- git add <changed files>
- git commit -m "step8: extract run_step ui payload subsystem"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Exact functions moved and new module API
6) run_step.ts LOC before/after
7) Exact next-step TODO for Step 9
8) Commit hash
```

---

## 10. Copy-paste prompt - Step 9 (Wording Subsystem)

```text
ROLE
Senior TypeScript architecture extraction agent (wording domain).

PROGRAM CONTEXT (MANDATORY)
- You are Step 9 in the Step 7-12 program.
- Step 8 extracted UI payload subsystem; now wording logic must be isolated.
- This step unlocks cleaner Step 11 pipeline extraction.

OBJECTIVE
Extract the full wording-choice engine into dedicated module(s) while preserving exact behavior.

IN SCOPE
- Move wording pending/pick/build flows from run_step.ts.
- Create run_step_wording module boundary.
- Keep run_step.ts with one orchestrated wording call.

DEEP TECHNICAL CONTEXT
- Hotspot: buildWordingChoiceFromTurn/applyWordingPickSelection + related flow.
- Critical invariants:
  pending-state gating,
  list vs text mode semantics,
  off-topic compatibility,
  provisional source correctness,
  contract metadata stability.

TECHNICAL INSTRUCTIONS
1) Extract cohesive wording subsystem:
- build from turn
- pending specialist reconstruction
- route-based pick selection
- required equivalence/material-rewrite/list merge utilities

2) Expose one orchestrator API:
- processWordingTurn(context) -> { earlyReturn?, specialist, state, overrides }

3) Keep temporary compatibility re-exports from run_step.ts only where tests depend on them.

4) No semantic rewrites; only relocation + minimal adapter glue.

OUT OF SCOPE
- No special route extraction.
- No post-specialist pipeline extraction.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- architecture gates

COMMIT
- git add <changed files>
- git commit -m "step9: extract run_step wording subsystem"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Wording invariants validated
6) run_step.ts LOC before/after
7) Exact next-step TODO for Step 10
8) Commit hash
```

---

## 11. Copy-paste prompt - Step 10 (Special Routes)

```text
ROLE
Senior TypeScript architecture extraction agent (route handlers).

PROGRAM CONTEXT (MANDATORY)
- You are Step 10 in the Step 7-12 program.
- Steps 8-9 reduced subsystem bulk; now branch-heavy special routes must be isolated.
- This step is required before final pipeline convergence in Step 11/12.

OBJECTIVE
Extract special route branches into route-handler registry modules with deterministic ordering.

IN SCOPE
- Extract route logic from run_step.ts for:
  prestart/start
  dream special routes (switch/self/scores/readiness tokens)
  synthetic pick routes
  presentation generation route
- Introduce route registry with explicit priority order.

DEEP TECHNICAL CONTEXT
- These branches currently duplicate:
  synthetic decision construction,
  state update,
  render+validate+fail-closed response path.
- Duplicates amplify bug risk and bloat orchestrator size.

TECHNICAL INSTRUCTIONS
1) Define route handler interface:
- canHandle(context): boolean
- handle(context): Promise<RouteResult>

2) Move routes in deterministic order.

3) Reuse shared response-construction path; avoid branch-local custom copy/paste logic.

4) Keep token values and observable behavior unchanged.

OUT OF SCOPE
- No extraction of generic post-specialist pipeline.
- No wording semantic changes.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- architecture gates

COMMIT
- git add <changed files>
- git commit -m "step10: extract run_step special route handlers"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Registry order and routes extracted
6) run_step.ts LOC before/after
7) Exact next-step TODO for Step 11
8) Commit hash
```

---

## 12. Copy-paste prompt - Step 11 (Pipeline + State)

```text
ROLE
Principal TypeScript architecture extraction agent (post-specialist pipeline).

PROGRAM CONTEXT (MANDATORY)
- You are Step 11 in the Step 7-12 program.
- Steps 8-10 isolated UI/wording/routes; now core pipeline must be partitioned.
- This step sets up final facade convergence in Step 12.

OBJECTIVE
Extract post-specialist processing and state mutation into explicit staged pipeline modules.

IN SCOPE
- Extract to:
  run_step_pipeline.ts
  run_step_state_update.ts
- Keep run_step.ts orchestration-only for this path.

DEEP TECHNICAL CONTEXT
- Critical behavior chain includes:
  dream scoring guards/repair,
  strategy consolidate bounds,
  bigwhy size guard,
  off-topic normalization,
  render contract validation and rerender.
- Stage order is behavior-critical; reordering can cause subtle regressions.

TECHNICAL INSTRUCTIONS
1) Define and enforce stage order:
- pre-guard normalization
- repair attempts
- state mutation
- render/validate
- optional rerender recovery
- overlays (wording/motivation)
- final contract propagation

2) Keep each stage pure where possible; isolate side effects.

3) Move applyStateUpdate and related state mutation helpers to state module.

4) Keep orchestrator path simple: call pipeline once, finalize once.

OUT OF SCOPE
- No new feature behavior.
- No menu contract redesign.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- architecture gates

COMMIT
- git add <changed files>
- git commit -m "step11: extract run_step pipeline and state mutation modules"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Stage order manifest and validation
6) run_step.ts LOC before/after
7) Exact next-step TODO for Step 12
8) Commit hash
```

---

## 13. Copy-paste prompt - Step 12 (Convergence + Hardening)

```text
ROLE
Principal release-hardening architecture agent.

PROGRAM CONTEXT (MANDATORY)
- You are Step 12, final step in the Step 7-12 program.
- Prior steps must have isolated UI/wording/routes/pipeline/state.
- Your job is convergence, compression, and release-grade validation.

OBJECTIVE
Converge run_step.ts into thin facade shape and validate architecture + parity release readiness.

IN SCOPE
- Final facade thinning.
- Remove dead adapters/helpers no longer used.
- Enforce architecture gates as blocking.
- Publish conformance report.

DEEP TECHNICAL CONTEXT
- Final risk is integration drift between extracted modules.
- Primary acceptance is not only LOC; it is preserved contract and deterministic behavior.

TECHNICAL INSTRUCTIONS
1) Reach primary LOC band:
- run_step.ts 1500-2500 LOC

2) Attempt stretch only if low-risk:
- 850-1200 LOC

3) Ensure facade responsibilities only:
- ingress
- route dispatch
- pipeline invocation
- finalization

4) Publish `docs/run_step_architecture_conformance_report.md` with:
- final LOC
- ownership matrix status
- gate outcomes
- residual risks/debt

OUT OF SCOPE
- No unrelated cleanups.
- No behavior redesign.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test
- architecture gates all pass

COMMIT
- git add <changed files>
- git commit -m "step12: converge run_step facade and release hardening"

MANDATORY END REPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Architecture checks + resultaat
5) Final LOC and target-band status
6) Conformance report path
7) Remaining technical debt
8) Commit hash
```

---

## 14. Quick start commands (for each step)

```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only
git status --short
```

Optional work branch per step:

```bash
git checkout -b step<NN>-run-step-<topic>
```

## 15. Program done criteria

- `run_step.ts` in `1500-2500 LOC` band or lower
- stretch toward `850-1200` only if parity remains stable
- architecture checks active and green in CI
- parity gates and full tests green
- conformance report committed

