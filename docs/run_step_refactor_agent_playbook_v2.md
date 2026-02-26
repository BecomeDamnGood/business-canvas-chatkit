# Run Step Refactor - Step-by-Step Copy-Paste Runbook (Single Source)

Date: 2026-02-25
Status: Active

Update 2026-02-26:
- New 20 percent target program playbook: [run_step_refactor_agent_playbook_v3_20pct.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_agent_playbook_v3_20pct.md)
- New mandatory execution log for that program: [run_step_refactor_20pct_log.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_refactor_20pct_log.md)

Architecture context:
- [run_step_strategic_architecture_plan.md](/Users/MinddMacBen/business-canvas-chatkit/docs/run_step_strategic_architecture_plan.md)

Use this file in sequence: Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6.

---

## Step 1 - Guardrails (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-1 in een groter run_step compressieprogramma.
2. Doel van het geheel: run_step.ts structureel verkleinen met parity-behoud.
3. Deze stap bouwt rails voor alle volgende stappen.
4. Geen brede runtime-refactor in deze stap.

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- Architecture guardrails toevoegen (LOC/boundary/complexity) + ownership map.

IN SCOPE
- Ownership map document toevoegen/updaten.
- LOC gate, import-boundary gate, complexity gate toevoegen.
- CI wiring toevoegen voor deze checks.

OUT OF SCOPE
- Geen subsystemextractie.
- Geen behavior changes in run_step runtime.

COMMIT
- afgerond: `git commit -m "step1: add run_step architecture guardrails and phase budgets"`
- 70% pause: `git commit -m "step1: guardrails partial at 70 with handoff log"`

---

## Step 2 - UI payload subsystem (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-2 in het grotere programma.
2. Step-1 rails zijn actief; nu eerste grote extractie.
3. Deze stap levert vroege LOC-winst met laag behavior-risico.
4. Volgende stappen bouwen op deze modulegrens.
5. Zorg dat he altijd open AI mcp app comliant bent

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- UI payload subsystem uit run_step.ts extraheren.

IN SCOPE
- Move:
- `buildUiPayload`
- `attachRegistryPayload`
- `normalizeUiContractMeta`
- direct gekoppelde payload-helpers
- run_step.ts houdt alleen delegatie.

OUT OF SCOPE
- Geen wording extractie.
- Geen route extractie.
- Geen pipeline redesign.

COMMIT
- afgerond: `git commit -m "step2: extract run_step ui payload subsystem"`
- 70% pause: `git commit -m "step2: ui payload partial at 70 with handoff log"`

---

## Step 3 - Wording subsystem (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-3 in het grotere programma.
2. UI payload is losgetrokken; nu wording intelligence partitioneren.
3. Deze stap reduceert semantische branching in run_step.ts.
4. Pipeline-step hangt af van deze cleanup.

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- Wording pending/pick/build subsystem extraheren naar dedicated module(s).

IN SCOPE
- Move wording cluster inclusief benodigde vergelijk/merge utilities.
- Eén orchestrated API-call vanuit run_step.ts.
- Tijdelijke re-exports alleen indien tests vereisen.

OUT OF SCOPE
- Geen special route extractie.
- Geen pipeline extractie.
- Geen policy redesign.

COMMIT
- afgerond: `git commit -m "step3: extract run_step wording subsystem"`
- 70% pause: `git commit -m "step3: wording partial at 70 with handoff log"`

---

## Step 4 - Special routes subsystem (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-4 in het grotere programma.
2. UI + wording zijn losgetrokken; nu route-branches partitioneren.
3. Deze stap verwijdert duplicate control flow uit run_step.ts.
4. Pipeline-step bouwt op jouw route cleanup.

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- Special route handlers extraheren naar route-registry modules.

IN SCOPE
- Move route logic:
- start/prestart
- dream special routes
- synthetic pick routes
- presentation route
- Introduce deterministic route registry.

OUT OF SCOPE
- Geen generieke post-specialist pipeline extractie.
- Geen wording semantiek wijzigingen.

COMMIT
- afgerond: `git commit -m "step4: extract run_step special route handlers"`
- 70% pause: `git commit -m "step4: routes partial at 70 with handoff log"`

---

## Step 5 - Pipeline + state subsystem (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-5 in het grotere programma.
2. Routes zijn opgeschoond; nu kernpipeline + state mutation partitioneren.
3. Deze stap is cruciaal voor echte facade-thinning.
4. Step-6 convergentie hangt af van correcte stage-order.

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- Post-specialist pipeline en state mutation uit run_step.ts extraheren.

IN SCOPE
- Move to dedicated modules:
- `run_step_pipeline.ts`
- `run_step_state_update.ts`
- Stage-order expliciet maken en behouden.
- run_step.ts gebruikt één pipeline-call + finalize.

OUT OF SCOPE
- Geen nieuwe features.
- Geen menu/action contract redesign.

COMMIT
- afgerond: `git commit -m "step5: extract run_step pipeline and state modules"`
- 70% pause: `git commit -m "step5: pipeline partial at 70 with handoff log"`

---

## Step 6 - Convergence + hardening (Copy-paste)

PROGRAM INTRO (ALTIJD MEELEZEN)
1. Je bent Step-6, finale stap in het grotere programma.
2. Doel: convergentie naar dunne facade + release-grade validatie.
3. Grootte telt, maar parity/contract blijft prioriteit.
4. Alleen minimale kritieke fixes als gate faalt.

## Global rules (apply to every step)

1. Execute directly, no follow-up questions.
2. Commit at end of run.
3. Read first:
- `docs/run_step_strategic_architecture_plan.md`
- `docs/run_step_refactor_memory.md`
4. Stay within 70%-cap.
5. Update `docs/run_step_refactor_memory.md` at end.
6. If 70%-cap exceeded: update memory, partial commit, stop.

### 70%-cap checks (mandatory)

```bash
git diff --name-only | wc -l
git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l
```

### Mandatory tests (every step)

```bash
npm --prefix mcp-server run build
node mcp-server/scripts/ui_artifact_parity_check.mjs
npm --prefix mcp-server test
```

### Mandatory end report (every step)

1. Scope uitgevoerd
2. Files changed
3. Tests + resultaat
4. Architecture checks + resultaat
5. Risks/assumpties
6. Remaining 30%
7. Verwijzing naar `docs/run_step_refactor_memory.md`
8. Commit hash

### Memory format (mandatory)

```md
## Step <N> - <Title>
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed|blocked>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Architecture checks:
- <check> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>
```

OBJECTIVE
- Final facade-thinning uitvoeren en alle release/architecture gates groen krijgen.

IN SCOPE
- Final facade cleanup.
- Dead adapters/helpers verwijderen.
- Architecture conformance rapport opleveren.
- Full hardening run.

OUT OF SCOPE
- Geen opportunistische cleanup buiten scope.
- Geen policy redesign.

COMMIT
- afgerond: `git commit -m "step6: converge run_step facade and release hardening"`
- 70% pause: `git commit -m "step6: convergence partial at 70 with handoff log"`

---

## Minimal git flow per step

```bash
cd /Users/MinddMacBen/business-canvas-chatkit
git checkout main
git pull --ff-only

# run one step

# update memory
# run tests/checks

git add <changed files>
git commit -m "<step message>"
git push origin main
```

## Program done criteria

1. `run_step.ts` in `1500-2500 LOC` band (or lower)
2. Stretch to `850-1200` only if parity remains stable
3. Architecture gates active and green
4. Full tests + parity green
5. `docs/run_step_refactor_memory.md` complete for all steps
