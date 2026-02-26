# RunStep Runtime Refactor - Architect PR Execution Plan (.dm)

Date: 2026-02-26
Status: Active
Owner scope: `mcp-server/src/handlers/run_step_runtime.ts` (+ direct runtime modules)

## Program Context En Scope

Context refs:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_agent_playbook_v3_20pct.md`
- `docs/run_step_refactor_20pct_log.md`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step_pipeline.ts`

Primary goals for this program:
1. Stabiliseer gedrag en contracten rond runtime owner.
2. Maak typed context + ports de standaard voor runtime orchestration.
3. Centraliseer render -> validate -> recover -> payload -> finalize in 1 engine.
4. Verlaag `any` hard in kritieke runtime paden.
5. Splits runtime in duidelijke lagen en reduceer runtime LOC.

Current measured baseline:
- `run_step_runtime.ts LOC`: `3294`
- `run_step_routes.ts LOC`: `1212`
- `run_step_pipeline.ts LOC`: `730`
- `any` count (`runtime + routes + pipeline`): `370`
- `any` count (`src/handlers/*.ts`): `859`

Program KPI targets (hard):
- `run_step_runtime.ts LOC < 1800`
- `any` in (`runtime + routes + pipeline`) minimaal `-80%` (370 -> `<=74`)
- 1 gedeeld pad voor render/validate/recover/payload/finalize
- DI objecten per factory gemiddeld `<=12` deps (hard gate)
- Geen nieuwe `any` in `mcp-server/src/handlers/**`

## Global Rules (Mandatory Every PR)

1. Werk sequentieel op `main`, 1 PR-step per run.
2. Max capaciteit per step: `<=70%`.
3. Verplichte quality suite na elke step:
   - `npm --prefix mcp-server run build`
   - `node mcp-server/scripts/ui_artifact_parity_check.mjs`
   - `node --loader ts-node/esm scripts/contract-smoke.mjs` (workdir `mcp-server`)
   - `npm --prefix mcp-server test`
4. Update altijd log:
   - `docs/run_step_runtime_refactor_execution_log.md` (nieuw bestand in STEP 1)
5. Geen contract drift:
   - `run_step(rawArgs)` signature
   - fail-closed behavior
   - OpenAI MCP app payload contract (`ui.actions`, `ui.action_codes`, `ui.contract_id`, `ui.text_keys`, `registry_version`)

## 70% Capacity Stop Protocol (Mandatory)

Stop direct als:
1. Scope-completion rond 70% zit en resterend deel niet triviaal is.
2. Diff breed wordt en parity-risico stijgt.

Verplichte checkpoint metrics:
```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step_runtime.ts | rg '^@@' | wc -l
wc -l mcp-server/src/handlers/run_step_runtime.ts
rg -n "\\bany\\b" mcp-server/src/handlers/run_step_runtime.ts mcp-server/src/handlers/run_step_routes.ts mcp-server/src/handlers/run_step_pipeline.ts | wc -l
```

Als stop op 70%:
- Log exact wat al klaar is.
- Log exact wat nog moet.
- Log first commands voor volgende agent.
- Commit partial work op `main`.

Mandatory handoff block:
```md
70% handoff details:
- Completed exactly:
  - ...
- Remaining exact TODO:
  - ...
- First commands next agent:
  - ...
- Risks/assumptions:
  - ...
```

## PR Sequence Overview

1. PR1: Runtime guardrails + golden trace freeze
2. PR2: Runtime-first architecture checks (runtime primary scope)
3. PR3: Typed `RunStepContext` + ports backbone
4. PR4: DI budget enforcement + factory split pass 1
5. PR5: `TurnResponseEngine` introduceren (pipeline adoptie)
6. PR6: `TurnResponseEngine` voor routes + duplicatie verwijderen
7. PR7: `any` removal sprint met specialist-output types + guards
8. PR8: Runtime orchestration layering + LOC convergence + CI ratchet

---

# ======================== STEP 1 START ========================
# PR1 - Runtime guardrails + golden freeze

Capacity budget: 45%

Expected files:
- `mcp-server/src/handlers/golden_trace_contract.test.ts`
- `mcp-server/src/handlers/run_step.test.ts`
- `mcp-server/src/handlers/run_step_finals.test.ts`
- `mcp-server/src/server_safe_string.test.ts`
- `mcp-server/src/handlers/__golden__/runtime/*.json` (new folder + files)
- `docs/run_step_runtime_refactor_execution_log.md` (new)

Acceptance criteria:
1. Nieuwe runtime-gerichte golden traces bestaan en valideren shape + contract kritieke velden.
2. Tests asserten runtime owner (`run_step_runtime.ts`) op gedragspaden:
   - prestart
   - waiting_locale
   - interactive
   - blocked/failed
3. Geen runtime logic wijzigingen buiten trace/test freeze.
4. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Program doel: runtime stabiliseren voordat grote refactor start.
- Runtime owner file: mcp-server/src/handlers/run_step_runtime.ts.
- Geen behavior changes in deze step; alleen freeze + guardrails.

SCOPE
1) Voeg runtime golden trace fixtures toe onder mcp-server/src/handlers/__golden__/runtime/.
2) Breid golden_trace_contract.test.ts uit met runtime fixture shape + required keys.
3) Breid run_step.test.ts / run_step_finals.test.ts / server_safe_string.test.ts uit met runtime owner assertions.
4) Maak docs/run_step_runtime_refactor_execution_log.md met status board + append-template.

OUT OF SCOPE
- Geen wijzigingen in runtime route/pipeline orchestration.
- Geen DI/type redesign.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR1.
- Commit op main.
```

# ======================== STEP 1 END ========================

---

# ======================== STEP 2 START ========================
# PR2 - Runtime-first architecture checks

Capacity budget: 55%

Expected files:
- `mcp-server/scripts/arch/run_step_runtime_loc_check.mjs` (new)
- `mcp-server/scripts/arch/run_step_runtime_boundary_check.mjs` (new)
- `mcp-server/scripts/arch/run_step_runtime_complexity_check.mjs` (new)
- `mcp-server/package.json`
- `.github/workflows/ci.yml`
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. Architecture checks richten op `run_step_runtime.ts` als primaire scope.
2. `run_step.ts` blijft facade-check behouden (lichte budget), runtime krijgt hoofd-budget.
3. CI draait runtime-arch checks mee.
4. Full quality suite groen.

Runtime phase budgets (target):
- phase_R0: LOC <= 3400, any <= 370
- phase_R1: LOC <= 3000, any <= 300
- phase_R2: LOC <= 2500, any <= 220
- phase_R3: LOC <= 2100, any <= 140
- phase_R4: LOC <= 1800, any <= 74

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- run_step.ts is facade; runtime owner moet nu primair bewaakt worden.
- Bestaande arch scripts checken alleen run_step.ts.

SCOPE
1) Voeg runtime-specifieke LOC/boundary/complexity checks toe in mcp-server/scripts/arch/.
2) Voeg npm scripts toe:
   - arch:run-step-runtime:loc
   - arch:run-step-runtime:boundary
   - arch:run-step-runtime:complexity
   - arch:run-step-runtime:check
3) Update CI workflow om runtime check te draaien met phase_R0.
4) Houd bestaande facade checks intact (geen regressie).

OUT OF SCOPE
- Geen runtime behavior wijziging.
- Geen refactor van handlers.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR2.
- Commit op main.
```

# ======================== STEP 2 END ========================

---

# ======================== STEP 3 START ========================
# PR3 - Typed RunStepContext + ports backbone

Capacity budget: 65%

Expected files:
- `mcp-server/src/handlers/run_step_context.ts` (new)
- `mcp-server/src/handlers/run_step_ports.ts` (new)
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_modules.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/src/handlers/run_step.test.ts` (if needed)
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. `RunStepContext` bestaat met sub-contexts:
   - routing
   - rendering
   - state
   - specialist
2. `routes` en `pipeline` gebruiken typed context/ports i.p.v. losse mega injecties waar mogelijk.
3. Geen externe behavior drift.
4. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Doel: grote dependency objecten vervangen met typed context + ports.
- Deze step bouwt de structurele basis zonder grote flow redesign.

SCOPE
1) Introduceer run_step_context.ts met:
   - RunStepContext
   - RoutingContext, RenderingContext, StateContext, SpecialistContext
2) Introduceer run_step_ports.ts met:
   - expliciete port interfaces voor route/pipeline dependencies.
3) Rewire run_step_runtime.ts zodat createRunStepPipelineHelpers/createRunStepRouteHelpers context-gedreven worden.
4) Houd behavior 1:1; focus op type-structuur en DI discipline.

OUT OF SCOPE
- Geen TurnResponseEngine implementatie.
- Geen diepe any-eliminatie buiten context-randen.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR3.
- Commit op main.
```

# ======================== STEP 3 END ========================

---

# ======================== STEP 4 START ========================
# PR4 - DI budget enforcement + factory split pass 1

Capacity budget: 60%

Expected files:
- `mcp-server/scripts/arch/run_step_di_budget_check.mjs` (new)
- `mcp-server/package.json`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/src/handlers/run_step_context.ts`
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. Nieuwe CI/script gate voor max dependencies per factory (`<=12`).
2. `createRunStepRouteHelpers` en `createRunStepPipelineHelpers` opgesplitst in kleinere services/ports.
3. Gemiddelde DI deps per factory onder limiet.
4. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Mega-factory dependency objecten verhogen regressierisico.
- Deze step forceert harde DI-budget discipline.

SCOPE
1) Maak run_step_di_budget_check.mjs die factory-constructor argumenten/injected members telt.
2) Voeg script toe aan package.json en CI quality chain.
3) Split route/pipeline helper factories in kleinere units met expliciete interfaces.
4) Zorg dat elke factory <=12 dependencies gebruikt.

OUT OF SCOPE
- Geen centrale response engine nog.
- Geen grote route behavior changes.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR4.
- Commit op main.
```

# ======================== STEP 4 END ========================

---

# ======================== STEP 5 START ========================
# PR5 - TurnResponseEngine introduceren (pipeline adoptie)

Capacity budget: 68%

Expected files:
- `mcp-server/src/handlers/run_step_turn_response_engine.ts` (new)
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/src/handlers/run_step_response.ts`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_finals.test.ts`
- `mcp-server/src/handlers/step_contracts.test.ts` (if needed)
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. Nieuwe `TurnResponseEngine` implementeert centraal patroon:
   - render
   - validate
   - recover (optional rerender)
   - attach payload
   - finalize
2. Pipeline gebruikt de engine als primair response pad.
3. Geen contract drift in response payload.
4. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- render/validate/recover/payload/finalize is nu verspreid.
- Doel: 1 gedeeld engine-pad starten via pipeline.

SCOPE
1) Voeg run_step_turn_response_engine.ts toe met engine API.
2) Vervang in run_step_pipeline.ts duplicatie door engine-aanroepen.
3) Houd run_step_response.ts als finalize contract owner; engine gebruikt deze.
4) Pas tests aan zodat contract parity hard bewaakt blijft.

OUT OF SCOPE
- Nog geen volledige route-engine adoptie.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR5.
- Commit op main.
```

# ======================== STEP 5 END ========================

---

# ======================== STEP 6 START ========================
# PR6 - TurnResponseEngine naar routes + duplicatie verwijderen

Capacity budget: 68%

Expected files:
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step_turn_response_engine.ts`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_response.ts` (if needed)
- `mcp-server/src/handlers/run_step_finals.test.ts`
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. `run_step_routes.ts` gebruikt ook `TurnResponseEngine`.
2. Route handlers retourneren business intent + specialist data; engine doet render/validate/finalize.
3. Duplicatie tussen routes en pipeline voor response assembly is verwijderd.
4. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Pipeline gebruikt al engine; routes nog niet.
- Deze step maakt 1 gedeeld response-pad voor hele runtime.

SCOPE
1) Migreer special route branches naar business-intent output model.
2) Laat engine alle response-assembly uitvoeren.
3) Verwijder dubbele render/validate/recover blocks in run_step_routes.ts.
4) Houd output contract exact gelijk.

OUT OF SCOPE
- Geen brede type-rewrite buiten benodigde route boundaries.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR6.
- Commit op main.
```

# ======================== STEP 6 END ========================

---

# ======================== STEP 7 START ========================
# PR7 - any elimination + specialist output typing

Capacity budget: 70%

Expected files:
- `mcp-server/src/handlers/run_step_specialist_types.ts` (new)
- `mcp-server/src/handlers/run_step_type_guards.ts` (new)
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/scripts/arch/run_step_any_budget_check.mjs` (new)
- `mcp-server/package.json`
- `.github/workflows/ci.yml` (if CI gate integrated here)
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. Specialist output schemas per step met `zod` + inferred TS types.
2. Ingress/LLM/output boundaries: `any -> unknown + guards`.
3. CI gate:
   - geen nieuwe `any` in `src/handlers`
   - teller daalt per PR
4. Meetbare daling:
   - runtime+routes+pipeline any count naar `<=140` in deze step.
5. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Kritieke paden hebben nog veel any.
- Deze step forceert typed specialist-output en guard-driven boundaries.

SCOPE
1) Definieer zod schemas + inferred types per specialist-step.
2) Introduceer guards voor onbetrouwbare ingress/LLM/output data.
3) Vervang any systematisch door unknown + typed narrowing in runtime/routes/pipeline.
4) Voeg any-budget script + CI rule toe:
   - no new any
   - count must decrease.

OUT OF SCOPE
- Geen nieuwe productfeatures.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR7.
- Commit op main.
```

# ======================== STEP 7 END ========================

---

# ======================== STEP 8 START ========================
# PR8 - Runtime orchestration layering + KPI convergence

Capacity budget: 70%

Expected files:
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_runtime_preflight.ts` (new)
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts` (new)
- `mcp-server/src/handlers/run_step_runtime_special_routes.ts` (new)
- `mcp-server/src/handlers/run_step_runtime_post_pipeline.ts` (new)
- `mcp-server/src/handlers/run_step_runtime_finalize.ts` (new)
- `mcp-server/src/handlers/run_step_modules.ts`
- `mcp-server/scripts/arch/run_step_runtime_loc_check.mjs`
- `mcp-server/scripts/arch/run_step_runtime_boundary_check.mjs`
- `mcp-server/scripts/arch/run_step_runtime_complexity_check.mjs`
- `mcp-server/scripts/arch/run_step_any_budget_check.mjs`
- `docs/run_step_runtime_refactor_execution_log.md`

Acceptance criteria:
1. Runtime orchestration is expliciet in 5 lagen:
   - preflight
   - action routing
   - special route handling
   - post-specialist pipeline
   - response finalize
2. `run_step_runtime.ts` bevat alleen orchestratie en wiring.
3. KPI gehaald:
   - runtime LOC `< 1800`
   - any runtime+routes+pipeline `<=74`
   - 1 gedeeld response engine path actief voor routes + pipeline
   - DI per factory `<=12`
4. Runtime arch gates op phase_R4 pass.
5. Full quality suite groen.

Copy-paste block for agent:
```text
ROLE
Principal TypeScript architecture agent.

CONTEXT
- Laatste convergentie-step: runtime moet orchestration-only worden.
- KPI's zijn hard release criteria.

SCOPE
1) Splits runtime in 5 laagmodules:
   - preflight
   - action routing
   - special routes
   - post-specialist pipeline
   - finalize
2) Houd domain helperlogica uit de runtime orchestrator.
3) Zet runtime gates op phase_R4 en laat die slagen.
4) Verifieer KPI targets en log exact before/after metrics.

OUT OF SCOPE
- Geen extra functionele uitbreiding.

MANDATORY
- Respecteer 70% stop protocol.
- Draai volledige quality suite.
- Append log entry voor PR8.
- Commit op main.
```

# ======================== STEP 8 END ========================

---

## Mandatory End Report Template (Every Step)

```md
## PR <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Capacity budget:
- target: <X%>
- observed: <Y%>
Scope goal:
- ...
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- npm --prefix mcp-server run build => <pass/fail>
- node mcp-server/scripts/ui_artifact_parity_check.mjs => <pass/fail>
- node --loader ts-node/esm scripts/contract-smoke.mjs (workdir mcp-server) => <pass/fail>
- npm --prefix mcp-server test => <pass/fail>
Architecture checks:
- RUN_STEP_ARCH_PHASE=<...> npm --prefix mcp-server run arch:run-step:check => <pass/fail>
- RUN_STEP_RUNTIME_ARCH_PHASE=<...> npm --prefix mcp-server run arch:run-step-runtime:check => <pass/fail>
Metrics:
- run_step_runtime.ts LOC before: <n>
- run_step_runtime.ts LOC after: <n>
- any runtime/routes/pipeline before: <n>
- any runtime/routes/pipeline after: <n>
- DI factories >12 deps: <count>
70% handoff details (mandatory when paused_at_70):
- Completed exactly:
  - ...
- Remaining exact TODO:
  - ...
- First commands next agent:
  - ...
- Risks/assumptions:
  - ...
Commit:
- <hash_on_main>
```

## Copy-Paste Quick Start For A New Agent

Gebruik steeds 1 step tegelijk:
1. Kopieer `STEP X START ... STEP X END` blok.
2. Laat agent exact die step uitvoeren.
3. Controleer of observed capacity `<=70%`.
4. Is capacity >70% of status `paused_at_70`:
   - neem alleen de `70% handoff details` over naar volgende agent prompt.
5. Ga daarna pas naar volgende step.

