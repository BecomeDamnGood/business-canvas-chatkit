# RunStep Refactor - Sequential Agent Runbook (Commit-Forced)

## Gebruiksscenario
Dit playbook is voor jouw werkwijze:
1. Je start **één agent tegelijk**.
2. Agent rondt zijn pakket volledig af.
3. Agent doet **altijd commit aan het einde zonder vraag**.
4. Pas daarna geef jij de volgende agent opdracht.

Dit document vervangt parallel-thread coördinatie met een **single-lane pipeline**.

---

## Hard Rules (geldt voor elke agent)

## Rule A - Niet vragen, wel uitvoeren
De agent mag geen afrondingsvraag stellen. De agent moet:
1. Scope uitvoeren binnen pakketgrenzen.
2. Relevante tests draaien.
3. Commit maken.
4. Resultaatrapport geven.

## Rule B - 70%-cap per taak (hard)
Stopcriteria:
1. Max 6 gewijzigde files.
2. Max ~350 netto diff-lines (`adds + dels`).
3. Max 2 extracties/verplaatsingen uit `mcp-server/src/handlers/run_step.ts`.
4. Geen behavior changes buiten expliciete scope.
5. Bij overschrijding: stop en rapporteer `Remaining 30%`.

Verplichte cap-check:
```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

## Rule C - Contracten mogen niet driften
Moet gelijk blijven:
1. `run_step(rawArgs)` externe signature.
2. Response shape (success + error + fail-closed).
3. MCP wrapper: `structuredContent.result` en `_meta.widget_result`.
4. `ui.actions`, `action_codes`, `contract_id`, `text_keys`.
5. Bootstrap gate semantiek: `waiting_locale` vs `ready`.

## Rule D - Verplicht eindrapport
Elke agent levert exact:
1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Risks/assumpties
5. Remaining 30%

---

## Baseline commando’s (voor elke agent)
```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only
```

Agent werkt op eigen branch:
```bash
git checkout -b <agent-branch>
```

---

## Agentvolgorde (sequentieel)
1. Agent-1: Guardrails
2. Agent-2: Ingress + fail-closed extract
3. Agent-3: Turn-contract/finalization extract
4. Agent-4: Specialist-dispatch extract
5. Agent-5: Integratie/facade thinning (alleen wiring)
6. Agent-6: Hardening + release gates

Elke agent start vanaf de laatste `main`.

---

## Copy-paste prompt - Agent 1 (Guardrails)
```text
ROLE
Senior TypeScript test/contract agent.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Install guardrails before any functional extraction.

IN SCOPE
- Add/extend tests for run_step parity and contract shape.
- Snapshot parity for success/error outputs across states.
- MCP wrapper parity tests.
- Action/menu determinism tests.
- Fail-closed invariant tests.

OUT OF SCOPE
- No production behavior changes.
- No refactor of run_step branch logic.

TESTS TO RUN
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/golden_trace_contract.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent1: add run_step guardrails and parity gates"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

## Copy-paste prompt - Agent 2 (Ingress + fail-closed)
```text
ROLE
Senior TypeScript refactor agent for ingress/state hygiene.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Extract ingress/state canonicalization + legacy/fail-closed builders from run_step.ts to ingress.ts.

IN SCOPE
- Extract canonicalizeStateForRunStepArgs-related helpers.
- Extract transient allowlist/state normalization helpers.
- Extract legacy marker detection + fail-closed state construction.
- Keep run_step as delegating caller.

OUT OF SCOPE
- No wording-choice changes.
- No dream-builder changes.
- No presentation branch changes.
- No turn-contract/finalize extract.

FILES (EXPECTED)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/ingress.ts (new)
- mcp-server/src/handlers/run_step.test.ts (if needed)
- mcp-server/src/core/state.test.ts (if needed)

TESTS TO RUN
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/state.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent2: extract ingress and fail-closed state handling"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

## Copy-paste prompt - Agent 3 (Turn contract + finalization)
```text
ROLE
Senior TypeScript contract-safety refactor agent.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Extract run_step contract validation/failure payload/finalization helpers into turn_contract.ts.

IN SCOPE
- validateUiPayloadContractParity
- assertRunStepContractOrThrow
- buildContractFailurePayload
- finalizeResponse internals (contract-safe subset)

OUT OF SCOPE
- No locale/bootstrap changes.
- No action routing extract.
- No specialist dispatch extract.

FILES (EXPECTED)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/turn_contract.ts (new)
- mcp-server/src/handlers/run_step_finals.test.ts (if needed)
- mcp-server/src/core/turn_policy_renderer.test.ts (if needed)

TESTS TO RUN
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/turn_policy_renderer.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent3: extract run_step turn-contract and finalization helpers"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

## Copy-paste prompt - Agent 4 (Specialist dispatch)
```text
ROLE
Senior TypeScript refactor agent for specialist execution boundaries.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Extract specialist instruction composition + strict/safe call adapters into specialist_dispatch.ts.

IN SCOPE
- composeSpecialistInstructions
- callSpecialistStrict
- callSpecialistStrictSafe
- timeout/rate-limit/error adapters

OUT OF SCOPE
- No specialist selection policy changes.
- No locale/bootstrap changes.
- No turn-contract changes.

FILES (EXPECTED)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/specialist_dispatch.ts (new)
- mcp-server/src/core/llm_timeout.test.ts (if needed)
- mcp-server/src/core/model_routing.test.ts (if needed)

TESTS TO RUN
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/llm_timeout.test.ts src/core/model_routing.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent4: extract specialist dispatch and strict/safe adapters"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

## Copy-paste prompt - Agent 5 (Integration wiring only)
```text
ROLE
Senior integration agent.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Integrate outputs from agents 2/3/4 into run_step facade with minimal churn.

IN SCOPE
- Imports + delegate wiring in run_step.ts
- Remove dead inline code only when extracted 1:1
- Resolve conflicts preserving previous behavior

OUT OF SCOPE
- No new extraction domains
- No policy redesign
- No locale/bootstrap or action-routing rewrite

TESTS TO RUN
- npm --prefix mcp-server test

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent5: integrate extracted modules into thin run_step facade"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

## Copy-paste prompt - Agent 6 (Hardening + release gate)
```text
ROLE
Senior release-hardening agent.

OPERATING MODE (MANDATORY)
- Execute directly, do not ask follow-up questions.
- At the end: commit changes automatically.
- Stay within 70%-cap.

OBJECTIVE
Run full parity/release gates and apply only critical minimal fixes if needed.

IN SCOPE
- Full test matrix run
- UI artifact parity verification
- Explicit report on drift/no-drift
- Minimal surgical fixes only when critical

OUT OF SCOPE
- No broad cleanup
- No architecture rewrites

TESTS TO RUN
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test

CAP CHECK (MANDATORY)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'

COMMIT (MANDATORY, NO QUESTION)
- git add <changed files>
- git commit -m "agent6: hardening parity gates and release validation"

OUTPUT FORMAT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Risks/assumpties
5) Remaining 30%
```

---

## Exacte git-checklist (sequentieel, agent-na-agent)

## Stap 0 - Voor elke nieuwe agent
```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only
git checkout -b <agent-branch>
```

## Stap 1 - Agent voert pakket uit en commit direct
```bash
# code + tests + cap-check

git add <changed files>
git commit -m "<agent-specifieke message>"
git push -u origin <agent-branch>
```

## Stap 2 - Merge naar main (door jou of merge-agent)
```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only
git merge --no-ff <agent-branch> -m "merge: <agent package>"
git push origin main
```

## Stap 3 - Volgende agent start pas nu
Herhaal vanaf `Stap 0`.

---

## Main-only werken (jouw voorkeur: praktisch)
Dit is compatibel met jouw flow zolang je **sequentieel** werkt.

Main-only regels:
1. Slechts 1 agent tegelijk.
2. Zelfde pakketvolgorde 1 -> 6.
3. Elke agent commit direct na tests, zonder vraag.
4. Na elk pakket meteen push naar `main`.

Main-only command patroon:
```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only

# agent voert pakket uit

git add <changed files>
git commit -m "main: agentX package complete"
git push origin main
```

Let op: main-only is praktisch, maar minder veilig voor rollback/bisect dan per-agent branches.

---

## Global Definition of Done
1. Extern `run_step(rawArgs)` contract gelijk.
2. MCP wrapper shape gelijk.
3. Action/menu determinisme gelijk.
4. Fail-closed paden blijven gesloten.
5. Bootstrap/i18n gates gelijk.
6. Volledige tests groen.
7. Elke agent rapporteert `Remaining 30%`.
