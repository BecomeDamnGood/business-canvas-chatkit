# Run Step Refactor 20 Percent - Execution Log

Date: 2026-02-26
Status: Active
Program source:
- [run_step_refactor_agent_playbook_v3_20pct.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_agent_playbook_v3_20pct.md)

## Baseline

- `run_step.ts LOC`: `5854`
- 20 percent target LOC: `<=1170`
- Required branch policy: commit on `main` after each PR step
- 70 percent policy: stop at ~70 percent scope completion, log exact handoff TODO, commit partial work

## PR Status Board

| PR | Title | Status | run_step.ts LOC before | run_step.ts LOC after | Commit on main |
| --- | --- | --- | --- | --- | --- |
| PR1 | Guardrails to 20 percent target | completed | 5854 | 5854 | pending_in_current_workspace |
| PR2 | i18n/bootstrap extraction | completed | 5854 | 5360 | pending_in_current_workspace |
| PR3 | Response/fail-closed extraction | completed | 5360 | 5289 | pending_in_current_workspace |
| PR4 | Policy/meta-topic extraction | completed | 5289 | 4580 | pending_in_current_workspace |
| PR5 | Step0 + wording heuristics extraction | completed | 4580 | 3905 | pending_in_current_workspace |
| PR6 | Presentation + preflight extraction | pending | - | - | - |
| PR7 | Facade boundary collapse + test decoupling | pending | - | - | - |
| PR8 | Final convergence to <=20 percent | pending | - | - | - |

---

## Append Template (copy for every agent run)

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
70% handoff details (mandatory when paused_at_70):
- Completed exactly:
  - ...
- Remaining exact TODO for next agent:
  - ...
- First commands for next agent:
  - ...
Commit:
- <hash_on_main>
```

---

## PR0 - Program setup
Date: 2026-02-26
Status: completed
Scope goal:
- Create 20 percent runbook and tracking log with mandatory 70 percent stop-and-handoff and commit-on-main rules.
Completed:
- Added `docs/run_step_refactor_agent_playbook_v3_20pct.md`.
- Added this tracking log file.
Pending:
- Execute PR1 -> PR8 sequentially using the v3 playbook.
Changed files:
- docs/run_step_refactor_agent_playbook_v3_20pct.md
- docs/run_step_refactor_20pct_log.md
Tests run:
- not run (docs-only change)
Architecture checks:
- not run (docs-only change)
run_step.ts LOC:
- before: 5854
- after: 5854
Commit:
- pending_in_current_workspace

## PR6 - Presentation + preflight extraction
Date: 2026-02-26 10:06 CET
Status: completed
Scope goal:
- Extract presentation helper utilities and run-step preflight flow from `run_step.ts` into dedicated modules while preserving fail-closed and OpenAI MCP app contracts.
Completed:
- Added `mcp-server/src/handlers/run_step_presentation.ts` and moved presentation helper cluster:
  - PPT placeholder/XML processing utilities.
  - PPTX generation + PDF/PNG conversion + presentation file cleanup + base URL resolution.
- Added `mcp-server/src/handlers/run_step_preflight.ts` and moved preflight cluster:
  - legacy migration + auto-upgrade preprocessing.
  - bootstrap poll preprocessing branch.
  - actioncode click/text-submit normalization and routing intent normalization.
- Updated `mcp-server/src/handlers/run_step_modules.ts` export surface with presentation and preflight helper factories.
- Rewired `mcp-server/src/handlers/run_step.ts` to orchestration calls via the new modules and removed inlined presentation/preflight blocks.
- 70% rule decision: continue to completion (metrics before decision: files=4, adds+dels=813, `run_step.ts` hunks=9, `run_step.ts` LOC=3338).
Pending:
- PR7 facade boundary collapse + test decoupling.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_modules.ts
- mcp-server/src/handlers/run_step_presentation.ts
- mcp-server/src/handlers/run_step_preflight.ts
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (known repo-root loader resolution issue for `ts-node`)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_C npm --prefix mcp-server run arch:run-step:check => fail (expected at current phase; `run_step.ts lines=3338`, `phase_C limit=1500`)
run_step.ts LOC:
- before: 3905
- after: 3338
Commit:
- pending_in_current_workspace

## PR5 - Step0 + wording heuristics extraction
Date: 2026-02-26 09:55 CET
Status: completed
Scope goal:
- Move step0 parse/seed/ask-display normalization and wording rewrite/similarity heuristics out of `run_step.ts` into dedicated domain modules while preserving behavior 1:1.
Completed:
- Added `mcp-server/src/handlers/run_step_step0.ts` with extracted step0 subsystem logic:
  - `parseStep0Final`, `hasValidStep0Final`, step0 candidate seed inference, and seed application from initial user message.
  - `createRunStepStep0DisplayHelpers(...)` with `normalizeStep0AskDisplayContract` and `normalizeStep0OfftopicToAsk`.
- Added `mcp-server/src/handlers/run_step_wording_heuristics.ts` with extracted wording heuristic logic:
  - text/list normalization, comparable canonicalization, tokenization, material-rewrite + equivalence checks.
  - step-contributing/offtopic heuristics.
  - suggestion-pick heuristics (`pickDualChoiceSuggestion`, dream/role previous-state suggestion pickers).
- Updated `mcp-server/src/handlers/run_step_modules.ts` export surface for `createRunStepStep0DisplayHelpers` and `createRunStepWordingHeuristicHelpers`.
- Rewired `mcp-server/src/handlers/run_step.ts` facade to consume new helpers and kept compatibility exports used by tests (`normalizeStep0AskDisplayContract`, `normalizeStep0OfftopicToAsk`, `isMaterialRewriteCandidate`, `areEquivalentWordingVariants`, `isClearlyGeneralOfftopicInput`, `shouldTreatAsStepContributingInput`, `pickDualChoiceSuggestion`).
- 70% rule decision: continue to completion (metrics before decision: files=4, adds+dels=789, `run_step.ts` hunks=9, `run_step.ts` LOC=3905).
Pending:
- PR6 presentation + preflight extraction.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_modules.ts
- mcp-server/src/handlers/run_step_step0.ts
- mcp-server/src/handlers/run_step_wording_heuristics.ts
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (known repo-root loader resolution issue for `ts-node`)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_B npm --prefix mcp-server run arch:run-step:check => fail (expected at current phase; `run_step.ts lines=3905`, `phase_B limit=2500`)
run_step.ts LOC:
- before: 4580
- after: 3905
Commit:
- pending_in_current_workspace

## PR3 - Response/fail-closed extraction
Date: 2026-02-26 09:37 CET
Status: completed
Scope goal:
- Extract shared response assembly from `run_step.ts` into `run_step_response.ts` while preserving fail-closed semantics and OpenAI MCP app-compatible payload behavior.
Completed:
- Added `mcp-server/src/handlers/run_step_response.ts` and moved finalize-response internals there:
  - `finalizeResponseContractInternals` invocation and registry payload integration hook.
  - ui telemetry merge into `state.__ui_telemetry`.
  - contract decision logging with marker-class derivation.
  - session token log append flow with unchanged payload/field mapping.
- Replaced the inlined `finalizeResponse` closure in `run_step.ts` with `createRunStepResponseHelpers(...)` wiring and kept `run_step.ts` as caller-only for response finalization.
- Preserved fail-closed payload behavior and contract-shape invariants for success/error paths.
- 70% rule decision: continue to completion (diff remained narrow and low-risk: files=3, adds/dels total=123, `run_step.ts` hunks=4).
Pending:
- PR4 policy/meta-topic extraction.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_response.ts
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (known repo-root loader resolution issue for `ts-node`)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check => fail (expected; `run_step.ts lines=5289`, `phase_A limit=4000`)
run_step.ts LOC:
- before: 5360
- after: 5289
Commit:
- pending_in_current_workspace

## PR2 - i18n/bootstrap extraction
Date: 2026-02-26 09:32 CET
Status: completed
Scope goal:
- Extract i18n/bootstrap runtime orchestration from `run_step.ts` into `run_step_i18n_runtime.ts` without behavior change.
Completed:
- Added `mcp-server/src/handlers/run_step_i18n_runtime.ts` as the dedicated owner for language/locale/ui_strings runtime orchestration.
- Moved bootstrap/i18n runtime wrappers and telemetry helpers (`deriveBootstrapContract`, `ensureUiStringsForState`, `resolveLanguageForTurn`, normalization/readiness helpers, telemetry counters) into the new module.
- Wired `run_step.ts` to consume one cohesive runtime API via `createRunStepI18nRuntimeHelpers(...)` and removed the inlined runtime cluster.
- Kept existing logging keys/values and fail-closed gate behavior unchanged in runtime decisions and locale/bootstrap logs.
Pending:
- PR3 response/fail-closed extraction to continue facade thinning and reduce `run_step.ts` toward `phase_A`.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_i18n_runtime.ts
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (ts-node loader not resolved from repo root)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check => fail (expected; `run_step.ts lines=5360`, `phase_A limit=4000`)
run_step.ts LOC:
- before: 5854
- after: 5360
Commit:
- pending_in_current_workspace

## PR1 - Guardrails to 20 percent target
Date: 2026-02-26 09:24 CET
Status: completed
Scope goal:
- Add enforceable final `phase_20` architecture guardrail phase and codify baseline -> phase_A -> phase_B -> phase_C -> phase_20 progression.
- Keep CI required architecture phase at `baseline` while documenting exact phase-flip/reporting criteria.
Completed:
- Added `phase_20` to LOC, boundary, and complexity guardrail scripts with final 20 percent budgets.
- Kept `stretch` as a deprecated compatibility alias mapped to `phase_20` budgets.
- Updated ownership map with explicit progression sequence and CI phase-flip criteria/reporting requirements.
- Updated v3 20 percent playbook with explicit CI hold/flip policy and progression sequence.
Pending:
- PR2 extraction work (i18n/bootstrap extraction) to move toward LOC <= 4000 and make `phase_A` pass.
Changed files:
- mcp-server/scripts/arch/run_step_loc_check.mjs
- mcp-server/scripts/arch/run_step_boundary_check.mjs
- mcp-server/scripts/arch/run_step_complexity_check.mjs
- docs/run_step_ownership_map.md
- docs/run_step_refactor_agent_playbook_v3_20pct.md
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (ts-node loader not resolved from repo root)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_A npm --prefix mcp-server run arch:run-step:check => fail (expected; `run_step.ts lines=5854`, `phase_A limit=4000`)
- npm --prefix mcp-server run arch:run-step:check => pass (`baseline`)
run_step.ts LOC:
- before: 5854
- after: 5854
Commit:
- pending_in_current_workspace

## PR4 - Policy/meta-topic extraction
Date: 2026-02-26 09:45 CET
Status: completed
Scope goal:
- Extract policy/meta/offtopic/motivation contract cluster from `run_step.ts` into a dedicated module while keeping fail-closed semantics and MCP app contract behavior unchanged.
Completed:
- Added `mcp-server/src/handlers/run_step_policy_meta.ts` and moved:
  - `LANGUAGE_LOCK_INSTRUCTION`
  - `UNIVERSAL_META_OFFTOPIC_POLICY` / `OFF_TOPIC_POLICY`
  - `applyMotivationQuotesContractV11`
  - `applyCentralMetaTopicRouter`
  - `normalizeNonStep0OfftopicSpecialist`
  - related meta/offtopic validators and intent/meta-topic resolvers.
- Kept temporary compatibility re-exports from `run_step.ts` for tests (`LANGUAGE_LOCK_INSTRUCTION`, `UNIVERSAL_META_OFFTOPIC_POLICY`, `OFF_TOPIC_POLICY`, `applyMotivationQuotesContractV11`, `applyCentralMetaTopicRouter`, `normalizeNonStep0OfftopicSpecialist`).
- Wired `run_step.ts` to consume extracted helpers via `createRunStepPolicyMetaHelpers(...)` without changing runtime contract wiring.
- Updated `mcp-server/src/handlers/run_step_modules.ts` export surface with `createRunStepPolicyMetaHelpers`.
- 70% rule decision: continue to completion (metrics before decision: files=4, adds+dels=828, `run_step.ts` hunks=7, `run_step.ts` LOC=4580).
Pending:
- PR5 Step0 + wording heuristics extraction.
Changed files:
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/run_step_modules.ts
- mcp-server/src/handlers/run_step_policy_meta.ts
- docs/run_step_refactor_20pct_log.md
Tests run:
- npm --prefix mcp-server run build => pass
- node mcp-server/scripts/ui_artifact_parity_check.mjs => pass
- node --loader ts-node/esm mcp-server/scripts/contract-smoke.mjs => fail (known repo-root loader resolution issue for `ts-node`)
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir `mcp-server`) => pass
- npm --prefix mcp-server test => pass
Architecture checks:
- RUN_STEP_ARCH_PHASE=phase_B npm --prefix mcp-server run arch:run-step:check => fail (expected at current phase; `run_step.ts lines=4580`, `phase_B limit=2500`)
run_step.ts LOC:
- before: 5289
- after: 4580
Commit:
- pending_in_current_workspace
