# RunStep Refactor - Alle Stappen Copy-Paste (Zelfstandig Per Stap)

Dit bestand is gemaakt voor jouw workflow: je kopieert per stap 1 blok naar een nieuwe agent.
Elke stap hieronder bevat nu een **eigen volledige intro/context** zodat de agent niet eerst andere delen hoeft te lezen.

---

# ======================== STEP 1 ========================
# Guardrails First (geen functionele refactor)

```text
Je bent Agent-1 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) We doen een strangler-refactor van run_step monoliet naar capabilities, in fasen.
2) Doel: modulair maken zonder extern gedrag te veranderen.
3) Kritieke invarianten die niet mogen driften:
   - `run_step(rawArgs)` signature + response shape
   - `ui.actions`, `action_codes`, `contract_id`, `text_keys`
   - bootstrap gate: `waiting_locale` vs `ready`
   - fail-closed gedrag
   - MCP wrapper: `structuredContent.result` minimal, `_meta.widget_result` volledig
4) Programmafases:
   - Step 1 guardrails
   - Step 2 ingress extract
   - Step 3 turn-contract extract
   - Step 4 specialist-dispatch extract
   - Step 5 integratie
   - Step 6 hardening

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Gebruik/maak memory-bestand: `docs/run_step_refactor_memory.md`.
4) Als je rond 70% zit en niet netjes kunt afronden:
   - schrijf exact op wat klaar is en wat nog moet,
   - commit tussenstand,
   - stop.

SCOPE
1) Voeg parity/snapshot tests toe voor run_step output shape (success/error) in states:
   - prestart
   - waiting_locale
   - interactive
   - blocked
   - failed
2) Voeg MCP wrapper parity tests toe:
   - structuredContent.result blijft minimal/model-safe
   - _meta.widget_result blijft volledige payload
3) Voeg determinisme-tests toe voor:
   - ui.actions
   - action_codes
   - contract_id
   - text_keys
4) Voeg fail-closed regressietests toe voor invalid/legacy markers.

OUT OF SCOPE
1) Geen productielogica-wijzigingen in run_step branches.
2) Geen Dream/Wording/Presentation refactor.
3) Geen server contractvorm wijzigen.

CONTEXT LOAD (KORT)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/server.ts
- mcp-server/src/core/turn_policy_renderer.ts
- mcp-server/src/core/bootstrap_runtime.ts

MEMORY LOG FORMAT (VERPLICHT)
## Step 1 - Guardrails
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

TESTS
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/golden_trace_contract.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

COMMIT
- afgerond: git commit -m "step1: add run_step guardrails and parity gates"
- 70% pause: git commit -m "step1: guardrails partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

# ======================== STEP 2 ========================
# Ingress + Fail-Closed Extract

```text
Je bent Agent-2 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) We doen een strangler-refactor in 6 stappen.
2) Doel: run_step modulair maken zonder contractdrift.
3) Invarianten die gelijk moeten blijven:
   - extern run_step contract
   - ui action/menu contractvelden
   - bootstrap waiting/ready semantics
   - fail-closed paden
   - MCP wrapper shape
4) Jij doet nu alleen Step 2.

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Lees eerst `docs/run_step_refactor_memory.md`.
4) Bij 70%-checkpoint: update memory exact, commit tussenstand, stop.

SCOPE
1) Extract naar `mcp-server/src/handlers/ingress.ts`:
   - canonicalizeStateForRunStepArgs-gerelateerde helpers
   - transient allowlist / state normalisatie
   - legacy marker detectie
   - fail-closed builder voor invalid input
2) Maak `run_step.ts` voor dit deel dunne delegator.

OUT OF SCOPE
1) Geen wording-choice wijzigingen.
2) Geen DreamBuilder wijzigingen.
3) Geen presentation route wijzigingen.
4) Geen turn-contract/finalization extract.

FILES (VERWACHT)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/ingress.ts (new)
- mcp-server/src/handlers/run_step.test.ts (indien nodig)
- mcp-server/src/core/state.test.ts (indien nodig)

MEMORY LOG FORMAT (VERPLICHT)
## Step 2 - Ingress
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

TESTS
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/state.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

COMMIT
- afgerond: git commit -m "step2: extract ingress and fail-closed state handling"
- 70% pause: git commit -m "step2: ingress partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

# ======================== STEP 3 ========================
# Turn Contract + Finalization Extract

```text
Je bent Agent-3 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) Refactor verloopt gefaseerd; jij doet alleen contract/finalization extract.
2) Geen gedrag of contract drift toegestaan.
3) Kritieke invarianten:
   - extern run_step contract
   - ui payload contractvelden
   - fail-closed op contractfouten
   - MCP wrapper shape

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Lees eerst `docs/run_step_refactor_memory.md`.
4) Bij 70%-checkpoint: update memory exact, commit tussenstand, stop.

SCOPE
Extract naar `mcp-server/src/handlers/turn_contract.ts`:
1) validateUiPayloadContractParity
2) assertRunStepContractOrThrow
3) buildContractFailurePayload
4) finalizeResponse internals (alleen contract/finalization veilige delen)

OUT OF SCOPE
1) Geen locale/bootstrap extract.
2) Geen action routing extract.
3) Geen specialist dispatch extract.

FILES (VERWACHT)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/turn_contract.ts (new)
- mcp-server/src/handlers/run_step_finals.test.ts (indien nodig)
- mcp-server/src/core/turn_policy_renderer.test.ts (indien nodig)

MEMORY LOG FORMAT (VERPLICHT)
## Step 3 - Turn Contract
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

TESTS
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/turn_policy_renderer.test.ts src/handlers/step_contracts.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

COMMIT
- afgerond: git commit -m "step3: extract run_step turn-contract and finalization helpers"
- 70% pause: git commit -m "step3: turn-contract partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

# ======================== STEP 4 ========================
# Specialist Dispatch Extract

```text
Je bent Agent-4 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) Jij isoleert specialist execution zonder orchestration policy te wijzigen.
2) Invarianten blijven: routing gedrag, error mapping, retry/timeouts, extern contract.
3) Geen drift in MCP/output contract.

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Lees eerst `docs/run_step_refactor_memory.md`.
4) Bij 70%-checkpoint: update memory exact, commit tussenstand, stop.

SCOPE
Extract naar `mcp-server/src/handlers/specialist_dispatch.ts`:
1) composeSpecialistInstructions
2) callSpecialistStrict
3) callSpecialistStrictSafe
4) timeout/rate-limit/error adapters

OUT OF SCOPE
1) Geen wijziging in specialist-selectiepolicy.
2) Geen locale/bootstrap wijzigingen.
3) Geen contract/finalization wijzigingen.

FILES (VERWACHT)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/specialist_dispatch.ts (new)
- mcp-server/src/core/llm_timeout.test.ts (indien nodig)
- mcp-server/src/core/model_routing.test.ts (indien nodig)

MEMORY LOG FORMAT (VERPLICHT)
## Step 4 - Specialist Dispatch
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'
- git diff -- mcp-server/src/handlers/run_step.ts | rg '^@@' | wc -l

TESTS
- npm --prefix mcp-server run typecheck
- cd mcp-server
- TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/core/llm_timeout.test.ts src/core/model_routing.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

COMMIT
- afgerond: git commit -m "step4: extract specialist dispatch and strict/safe adapters"
- 70% pause: git commit -m "step4: specialist-dispatch partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

# ======================== STEP 5 ========================
# Integratie + Facade Thinning (alleen wiring)

```text
Je bent Agent-5 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) Step 2/3/4 hebben modules toegevoegd.
2) Jij doet alleen wiring naar een dunnere run_step facade.
3) Geen redesign; alleen integratie met parity behoud.

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Lees eerst `docs/run_step_refactor_memory.md`.
4) Bij 70%-checkpoint: update memory exact, commit tussenstand, stop.

SCOPE
1) Integratie/wiring in run_step.ts:
   - imports
   - delegate calls
   - volgorde/semantiek behouden
2) Alleen dode inline code verwijderen als 1-op-1 al geëxtraheerd.

OUT OF SCOPE
1) Geen nieuwe extractiegebieden.
2) Geen policywijzigingen.
3) Geen locale/action-routing herontwerp.

FILES (VERWACHT)
- mcp-server/src/handlers/run_step.ts
- mcp-server/src/handlers/ingress.ts
- mcp-server/src/handlers/turn_contract.ts
- mcp-server/src/handlers/specialist_dispatch.ts

MEMORY LOG FORMAT (VERPLICHT)
## Step 5 - Integration
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'

TESTS
- npm --prefix mcp-server test

COMMIT
- afgerond: git commit -m "step5: integrate extracted modules into thin run_step facade"
- 70% pause: git commit -m "step5: integration partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

# ======================== STEP 6 ========================
# Hardening + Release Gates

```text
Je bent Agent-6 in een sequentiële refactor van `mcp-server/src/handlers/run_step.ts`.

PROGRAM INTRO (ALTIJD MEELEZEN)
1) Integratie is gedaan; nu finale gatekeeping.
2) Doel: bewijzen dat contract/parity intact is.
3) Alleen minimale kritieke fixes als een gate faalt.

WERKWIJZE
1) Voer direct uit, geen vervolgvragen.
2) Commit altijd aan einde run.
3) Lees eerst `docs/run_step_refactor_memory.md`.
4) Bij 70%-checkpoint: update memory exact, commit tussenstand, stop.

SCOPE
1) Volledige test- en parity-checks draaien.
2) Expliciet rapporteren van parity status.
3) Alleen minimale kritieke fixes doen indien noodzakelijk.

OUT OF SCOPE
1) Geen brede refactor.
2) Geen cosmetische cleanup.

MEMORY LOG FORMAT (VERPLICHT)
## Step 6 - Hardening
Date: <YYYY-MM-DD HH:mm local>
Status: <in_progress|paused_at_70|completed>
Completed:
- ...
Pending:
- ...
Changed files:
- ...
Tests run:
- <command> => <pass/fail>
Next agent exact TODO:
- ...
Commit:
- <hash>

70%-CHECKPOINT METRICS (SOFT)
- git diff --name-only | wc -l
- git diff --numstat | awk '{a+=$1; d+=$2} END {print "adds="a,"dels="d,"total="a+d}'

TESTS
- npm --prefix mcp-server run build
- node mcp-server/scripts/ui_artifact_parity_check.mjs
- npm --prefix mcp-server test

COMMIT
- afgerond: git commit -m "step6: hardening parity gates and release validation"
- 70% pause: git commit -m "step6: hardening partial at 70 with handoff log"

VERPLICHT EINDRAPPORT
1) Scope uitgevoerd
2) Files changed
3) Tests + resultaat
4) Wat is exact klaar
5) Wat moet exact nog gedaan worden
6) Verwijzing naar docs/run_step_refactor_memory.md
7) Commit hash
```

---

## Belangrijk voor jouw vraag
1) Ja, `docs/run_step_refactor_memory.md` moet door de eerste agent worden aangemaakt.
2) Ja, elke volgende agent moet dat bestand eerst lezen.
3) De intro/context staat nu ook per stap, zodat je per stap zelfstandig kunt copy-pasten.
