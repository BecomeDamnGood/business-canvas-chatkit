# Run Step Refactor - 20 Percent Target Playbook (Single Source)

Date: 2026-02-26
Status: Active
Program: PR1 -> PR8 (sequential, single-lane)

Architecture context:
- [run_step_strategic_architecture_plan.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_strategic_architecture_plan.md)
- [run_step_ownership_map.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_ownership_map.md)

Execution memory (mandatory update every run):
- [run_step_refactor_20pct_log.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_20pct_log.md)

---

## Program Goal

Reduce `mcp-server/src/handlers/run_step.ts` to max **20%** of current size:
- Current baseline: `5854 LOC`
- Target cap: `<=1170 LOC`

Do this without intelligence loss and without OpenAI MCP app contract drift.

---

## Non-Negotiable Invariants

1. Keep external handler contract stable:
- `run_step(rawArgs)` signature unchanged
- success/error/fail-closed shape unchanged

2. Keep OpenAI MCP app compatibility stable:
- `ui.actions`, `ui.action_codes`, `ui.contract_id`, `ui.contract_version`, `ui.text_keys` behavior unchanged
- `registry_version` behavior unchanged
- no changes to server tool visibility/model-safe wrapper semantics

3. Keep fail-closed strict:
- startup/i18n invalid-state and legacy-block behavior must not fail-open

4. Full-subsystem extraction only:
- no helper-fragment churn as primary strategy

---

## Global Rules (apply to every PR)

1. Execute directly, no follow-up questions.
2. Work on `main` and commit on `main` at the end of the PR step.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_ownership_map.md`
- `docs/run_step_refactor_20pct_log.md`
4. Stay within 70%-cap for the assigned PR scope.
5. Always update `docs/run_step_refactor_20pct_log.md` at end.
6. If 70%-cap reached: stop, write exact handoff TODO, commit partial work on `main`.

---

## 70 Percent Stop Rule (mandatory)

Stop when either condition is true:

1. Scope-completion is around 70% and remaining 30% is non-trivial/risky.
2. Diff becomes broad and starts risking parity.

Mandatory checks before deciding stop/continue:

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
wc -l mcp-server/src/handlers/run_step.ts
```

If stopping at 70%, log must include:
- exact functions/files completed
- exact remaining tasks
- exact next command sequence for next agent
- known risks/assumptions

---

## Mandatory Quality Gates (every PR)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
npm --prefix mcp-server test
```

Architecture gate phase by PR:
- PR1-PR3: `RUN_STEP_ARCH_PHASE=phase_A`
- PR4-PR5: `RUN_STEP_ARCH_PHASE=phase_B`
- PR6-PR7: `RUN_STEP_ARCH_PHASE=phase_C`
- PR8: `RUN_STEP_ARCH_PHASE=phase_20` (new final phase to be introduced)

Required progression sequence:
- `baseline -> phase_A -> phase_B -> phase_C -> phase_20`

CI phase policy for this program:
- Keep CI required phase at `baseline` until explicit flip evidence is logged.
- Flip CI to `phase_A` only after PR3 logs show LOC <= 4000 and two consecutive `phase_A` passes (PR2 + PR3).
- Flip CI to `phase_B` only after PR5 logs show LOC <= 2500 and two consecutive `phase_B` passes (PR4 + PR5).
- Flip CI to `phase_C` only after PR7 logs show LOC <= 1500 and two consecutive `phase_C` passes (PR6 + PR7).
- Flip CI to `phase_20` only after PR8 logs show LOC <= 1170 and full mandatory checks all pass.

Run:

```bash
RUN_STEP_ARCH_PHASE=<phase> npm --prefix mcp-server run arch:run-step:check
```

---

## Mandatory End Report (every PR)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining scope (exact)
7. Verwijzing naar `docs/run_step_refactor_20pct_log.md`
8. Commit hash on `main`

---

## Logging Format (mandatory append to log file)

```md
## PR <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Scope goal:
- ...
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
run_step.ts LOC:
- before: <n>
- after: <n>
Next agent exact TODO:
- ...
Commit:
- <hash_on_main>
```

---

## Step Navigation

1. STEP 1 -> PR1 Guardrails to 20 percent target
2. STEP 2 -> PR2 i18n/bootstrap extraction
3. STEP 3 -> PR3 response/fail-closed extraction
4. STEP 4 -> PR4 policy/meta-topic extraction
5. STEP 5 -> PR5 Step0 + wording heuristics extraction
6. STEP 6 -> PR6 presentation + preflight extraction
7. STEP 7 -> PR7 facade boundary collapse + test decoupling
8. STEP 8 -> PR8 final convergence to <=20 percent

---

## STEP 1 START (PR1/8)
### PR1 - Guardrails to 20 percent target (Copy-paste)

```text
ROLE
Principal TypeScript architecture agent.

PROGRAM CONTEXT
- This is PR1 of an 8-PR run_step compression program.
- Current run_step.ts size is ~5854 LOC.
- End goal is <=1170 LOC (20% of current) with zero behavior drift.
- OpenAI MCP app compatibility is non-negotiable.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Install enforceable phase progression to force shrinking toward <=1170 LOC.

IN SCOPE
- Extend architecture scripts with final target phase `phase_20` for:
  - LOC budget <=1170
  - boundary budgets aligned to thin facade
  - complexity budgets aligned to thin facade
- Update docs with explicit phase progression baseline -> phase_A -> phase_B -> phase_C -> phase_20.
- Keep CI required phase at baseline for now, but add explicit docs/reporting for when to flip each phase.

OUT OF SCOPE
- No runtime behavior changes in run_step flow.
- No subsystem extraction.

INVARIANTS
- No changes to run_step response contract.
- No changes to OpenAI MCP app tool metadata behavior.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr1: add phase_20 run_step architecture target and progression"
- paused_at_70: git commit -m "pr1: phase_20 guardrails partial at 70 with handoff"
```

## STEP 1 END (PR1/8)

---

## STEP 2 START (PR2/8)
### PR2 - i18n/bootstrap extraction (Copy-paste)

```text
ROLE
Senior TypeScript extraction agent (i18n/runtime).

PROGRAM CONTEXT
- PR2/8 in the <=1170 LOC program.
- Existing extracted modules must remain owners: ui_payload, wording, routes, pipeline, state_update.
- Biggest remaining facade cluster is i18n/bootstrap runtime wrappers.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Extract i18n/bootstrap runtime orchestration from run_step.ts into run_step_i18n_runtime.ts without behavior change.

IN SCOPE
- Move language/locale/ui_strings runtime wrappers and helpers:
  - deriveBootstrapContract
  - ensureUiStringsForState
  - resolveLanguageForTurn
  - supporting normalization/readiness helpers and telemetry counters
- Expose one cohesive API used by run_step facade.
- Keep logging keys/values and fail-closed semantics unchanged.

OUT OF SCOPE
- No changes to business logic decisions.
- No changes to UI contract fields.

INVARIANTS
- waiting_locale vs ready semantics identical.
- strict non-English pending and bootstrap poll behavior unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr2: extract run_step i18n bootstrap runtime subsystem"
- paused_at_70: git commit -m "pr2: i18n bootstrap extraction partial at 70 with handoff"
```

## STEP 2 END (PR2/8)

---

## STEP 3 START (PR3/8)
### PR3 - Response/fail-closed extraction (Copy-paste)

```text
ROLE
Senior TypeScript extraction agent (response assembly/fail-closed).

PROGRAM CONTEXT
- PR3/8 in the <=1170 LOC program.
- run_step.ts still contains shared response assembly and telemetry append logic.
- Must preserve OpenAI MCP app-compatible payload behavior.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Extract shared response assembly to run_step_response.ts and keep run_step.ts as caller-only.

IN SCOPE
- Move finalizeResponse closure internals and helpers into run_step_response.ts.
- Preserve:
  - finalizeResponseContractInternals usage
  - attachRegistryPayload integration
  - ui telemetry merge
  - token log append flow
  - contract decision logging
- Keep fail-closed error payload shape stable.

OUT OF SCOPE
- No changes to routing/pipeline decisions.
- No schema contract redesign.

INVARIANTS
- success/error/fail-closed response shapes unchanged.
- registry_version/ui fields unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr3: extract run_step response assembly and finalize path"
- paused_at_70: git commit -m "pr3: response extraction partial at 70 with handoff"
```

## STEP 3 END (PR3/8)

---

## STEP 4 START (PR4/8)
### PR4 - Policy and meta-topic extraction (Copy-paste)

```text
ROLE
Senior TypeScript extraction agent (policy/meta contracts).

PROGRAM CONTEXT
- PR4/8 in the <=1170 LOC program.
- Policy intelligence must move out of facade without losing behavior.
- Tests currently rely on exported policy helpers/constants.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Extract policy/meta/offtopic/motivation cluster to dedicated modules while preserving exports via temporary compatibility re-exports.

IN SCOPE
- Move:
  - LANGUAGE_LOCK_INSTRUCTION
  - UNIVERSAL_META_OFFTOPIC_POLICY / OFF_TOPIC_POLICY
  - applyMotivationQuotesContractV11
  - applyCentralMetaTopicRouter
  - normalizeNonStep0OfftopicSpecialist
  - related validator helpers
- Keep run_step.ts re-export surface temporarily stable for tests.

OUT OF SCOPE
- No prompt behavior changes.
- No off-topic semantics changes.

INVARIANTS
- Step0 prompt rules unchanged.
- Non-step0 universal policy presence unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_B npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr4: extract run_step policy and meta-topic contract subsystem"
- paused_at_70: git commit -m "pr4: policy extraction partial at 70 with handoff"
```

## STEP 4 END (PR4/8)

---

## STEP 5 START (PR5/8)
### PR5 - Step0 + wording heuristics extraction (Copy-paste)

```text
ROLE
Senior TypeScript extraction agent (step0 + wording heuristics).

PROGRAM CONTEXT
- PR5/8 in the <=1170 LOC program.
- Facade still holds step0 normalization and rewrite/similarity intelligence.
- Intelligence must be preserved exactly.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Move Step0 seed/normalization and wording heuristics out of run_step.ts into domain modules.

IN SCOPE
- Move step0 candidate parse/seed/ask-display normalization functions.
- Move similarity/material rewrite helpers to run_step_wording (or dedicated helper module).
- Keep temporary re-exports from run_step.ts where tests still import from facade.
- Keep behavior 1:1.

OUT OF SCOPE
- No algorithm changes.
- No threshold changes unless parity proves identical.

INVARIANTS
- Step0 startup behavior unchanged.
- Wording-choice eligibility and suggestion behavior unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_B npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr5: extract step0 normalization and wording heuristic subsystem"
- paused_at_70: git commit -m "pr5: step0 wording extraction partial at 70 with handoff"
```

## STEP 5 END (PR5/8)

---

## STEP 6 START (PR6/8)
### PR6 - Presentation + preflight extraction (Copy-paste)

```text
ROLE
Senior TypeScript extraction agent (presentation + preflight).

PROGRAM CONTEXT
- PR6/8 in the <=1170 LOC program.
- run_step.ts still contains presentation/xml/ppt utility logic and preflight action/language blocks.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Extract presentation helper cluster and request preflight cluster into dedicated modules.

IN SCOPE
- Move PPT/PDF/PNG and XML placeholder utilities into a presentation helper module.
- Move preflight blocks (legacy upgrade handling, actioncode normalization, bootstrap poll preprocessing) into run_step_preflight.ts.
- Keep run_step.ts orchestration-only around these phases.

OUT OF SCOPE
- No changes to generated artifact content semantics.
- No changes to actioncode routing results.

INVARIANTS
- presentation output paths/asset contract unchanged.
- legacy fail-closed and auto-upgrade behavior unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_C npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr6: extract presentation utilities and run_step preflight flow"
- paused_at_70: git commit -m "pr6: presentation preflight extraction partial at 70 with handoff"
```

## STEP 6 END (PR6/8)

---

## STEP 7 START (PR7/8)
### PR7 - Facade boundary collapse + test decoupling (Copy-paste)

```text
ROLE
Principal TypeScript architecture agent (facade boundary collapse).

PROGRAM CONTEXT
- PR7/8 in the <=1170 LOC program.
- Boundary gate still fails stricter phases due to direct step/core imports and facade-owned test exports.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Collapse facade imports and decouple tests from run_step.ts implementation exports.

IN SCOPE
- Add run_step_dependencies.ts (or equivalent local handler composition module) that owns step/core dependency assembly.
- Reduce direct run_step.ts imports to local handler modules.
- Migrate tests to import helper functions from owning modules.
- Keep only minimal temporary compatibility re-exports in run_step.ts.

OUT OF SCOPE
- No runtime logic redesign.
- No contract field changes.

INVARIANTS
- run_step(rawArgs) signature unchanged.
- MCP wrapper and tool contract behavior unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_C npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr7: collapse run_step facade imports and decouple test exports"
- paused_at_70: git commit -m "pr7: facade boundary collapse partial at 70 with handoff"
```

## STEP 7 END (PR7/8)

---

## STEP 8 START (PR8/8)
### PR8 - Final convergence to <=20 percent (Copy-paste)

```text
ROLE
Principal TypeScript convergence agent.

PROGRAM CONTEXT
- PR8/8 final convergence for <=1170 LOC (20% target).
- All major subsystems should now be outside run_step.ts.
- This PR must finish thin-facade shape and enforce final gates.

GENERAL INSTRUCTIONS (MANDATORY FOR THIS STEP)
- Execute directly, no follow-up questions.
- Work on `main` and commit on `main` at end of this step.
- Read first: `docs/run_step_strategic_architecture_plan.md`, `docs/run_step_ownership_map.md`, `docs/run_step_refactor_20pct_log.md`.
- Apply the 70% stop rule. Before stop/continue decision, run:
  - `git diff --name-only | wc -l`
  - `git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'`
  - `git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l`
  - `wc -l mcp-server/src/handlers/run_step.ts`
- If paused_at_70: stop, append exact handoff TODO in log, commit partial on `main`.
- Always append a run entry to `docs/run_step_refactor_20pct_log.md`.
- Keep fail-closed semantics and OpenAI MCP app contract behavior unchanged.

OBJECTIVE
Finalize run_step.ts as orchestration facade only and enforce phase_20 gate in CI.

IN SCOPE
- Remove remaining non-facade helper bodies from run_step.ts.
- Keep run_step.ts focused on:
  - ingress parse
  - dependency/context setup
  - preflight
  - routes dispatch
  - pipeline call
  - finalize
- Update CI run-step architecture phase to `phase_20`.
- Update docs/report with final LOC and architecture metrics.

OUT OF SCOPE
- No behavior redesign.
- No API contract changes.

INVARIANTS
- OpenAI MCP app compatibility unchanged.
- fail-closed behavior unchanged.
- UI contract parity unchanged.

MANDATORY
- Apply 70% stop rule from playbook.
- Update docs/run_step_refactor_20pct_log.md.
- Commit on main branch.

REQUIRED CHECKS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs
- npm --prefix mcp-server test
- RUN_STEP_ARCH_PHASE=phase_20 npm --prefix mcp-server run arch:run-step:check

COMMIT
- completed: git commit -m "pr8: converge run_step to thin facade and enforce phase_20 gate"
- paused_at_70: git commit -m "pr8: final convergence partial at 70 with handoff"
```

---

## STEP 8 END (PR8/8)

---

## Done Criteria

Program is done only when all are true:

1. `run_step.ts` <= `1170 LOC`
2. phase_20 architecture checks pass
3. build + parity + contract-smoke + tests all pass
4. run_step facade owns orchestration only
5. `docs/run_step_refactor_20pct_log.md` fully updated with commit hashes
