# Efficiency Implementatieplan (Zero Content Loss)

## 1. Doel
Dit document is het uitvoerbare implementatieplan voor efficiency-optimalisaties uit `efficiency.md`.

Harde eis voor elke wijziging:
- Er mag geen content verloren gaan die de agent nodig heeft om te formuleren, routeren, recapituleren of contractueel correct output te geven.
- Zonder hard bewijs van contentbehoud mag een wijziging niet naar productie.

## 2. Scope en baseline
Bronbaseline: `efficiency.md`.
- Input tokens domineren het verbruik.
- Grootste verspillers: lange step-instructies, explain-more zonder light profiel, brede contextsnapshots, extra repair/autosuggest calls.

Doel van dit plan:
- Tokenreductie met behoud van outputkwaliteit en contractstabiliteit.
- Elke wijziging uitvoerbaar voor een andere agent zonder interpretatieruimte.

## 3. Definitie "met zekerheid geen contentverlies"
Een ticket is alleen "veilig" als alle onderstaande gates groen zijn.

### G0 - Instruction Coverage
- Verplichte instructie-atomen blijven aanwezig (voor/na vergelijking).
- Minimaal: outputschema, route/action semantiek, taalregels, offtopic/meta regels, recapregels.

### G1 - Context Coverage
- Verplichte contextvelden blijven aanwezig in de effectieve promptinput.
- Minimaal: `CURRENT_STEP`, `STATE FINALS`, `LANGUAGE` (indien bekend), `user_message`, recap-regel.
- Voor snapshots: whitelist mag kleiner, maar geen veld verwijderen dat downstream wordt gelezen.

### G2 - Output Contract Equivalence
- Geen regressie op required outputvelden en typecontracten.
- Geen regressie op `contract_id`, `action_codes`, `rendered_actions`, `ui.view.mode`.

### G3 - Behavioral Equivalence
- Replayset blijft functioneel gelijk op intent en flow.
- Geen semantisch verlies in step-output (intro/explain/refine/confirm/offtopic).

### G4 - Token/Latency Gate
- Vooraf gedefinieerde budgetten worden gehaald of verbeterd.

### G5 - Rollback Verifieerbaar
- Feature flag uitzetten herstelt oud gedrag aantoonbaar.

## 4. Verplicht bewijspakket per ticket
Per ticket moet exact dit bewijs worden opgeleverd:
1. `atom_diff_before_after.json` (G0)
2. `context_field_coverage.json` (G1)
3. `contract_replay_report.json` (G2)
4. `behavioral_replay_report.json` (G3)
5. `token_latency_before_after.json` (G4)
6. `rollback_verification.md` (G5)

Fail-fast regel:
- Als een gate faalt, ticket niet mergen.
- Eerst rollback/pad terug naar laatst groene state, dan pas herontwerp.

## 5. Implementatiebacklog (direct uitvoerbaar)

| ticket_id | prioriteit | doel | concrete wijziglocaties | no-content-loss zekerheid (moet groen) | acceptatiecriteria | tests | risico | owner | rollback |
|---|---|---|---|---|---|---|---|---|---|
| P0-001 | P0 | Subcall tokenmeting toevoegen | `mcp-server/src/handlers/run_step_response.ts`, `mcp-server/src/core/session_token_log.ts`, `mcp-server/src/handlers/specialist_dispatch_safe.ts`, `mcp-server/src/handlers/run_step_runtime_execute.ts` | G2 (payload gelijk), G5 | Subcalls zichtbaar met `call_id`, `step_id`, `specialist`, `model`, `attempts`, `usage`, `latency_ms`, `trigger`; bestaande log-consumers blijven werken | `session_token_log.test.ts`, `run_step.test.ts` | laag | runtime | `BSC_SUBCALL_TOKEN_LOG_V1=0` |
| P0-002 | P0 | Explain-light promptprofiel | `mcp-server/src/handlers/run_step_pipeline.ts`, `mcp-server/src/handlers/specialist_dispatch.ts`, nieuw `mcp-server/src/steps/explain_profile.ts` | G0, G1, G2, G3, G5 | Explain routes gebruiken light profiel zonder contractverlies; explain p95 input tokens omlaag | `instructions_contract_sweep.test.ts`, `step_contracts.test.ts`, explain replayset | middel | prompt | `BSC_PROMPT_PROFILE_EXPLAIN_V1=0` |
| P0-003 | P0 | Dubbele contextinjectie verwijderen (targetgroup/productsservices) | `mcp-server/src/steps/targetgroup.ts`, `mcp-server/src/steps/productsservices.ts`, `mcp-server/src/handlers/specialist_dispatch.ts` | G0, G1, G2, G5 | Context nog exact 1x aanwezig; finals-inhoud identiek; tokenreductie op deze paden | builder unit tests + contract tests beide steps | laag | prompt | `BSC_DEDUP_CONTEXT_PLANNER_V1=0` |
| P0-004 | P0 | Context snapshot versmallen met whitelist | `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`, nieuw `mcp-server/src/handlers/run_step_context_whitelist.ts` | G1, G2, G3, G5 | Alleen noodzakelijke keys in snapshot; geen regressie in refine/explain/offtopic/recap | `run_step_runtime_state_helpers.test.ts`, `run_step_wording_intent.test.ts`, replay | middel | runtime | `BSC_CONTEXT_SNAPSHOT_V2=0` |
| P1-001 | P1 | Langste step-instructies dedupen/comprimeren | `mcp-server/src/steps/strategy.ts`, `mcp-server/src/steps/rulesofthegame.ts`, `mcp-server/src/steps/dream_explainer.ts`, `mcp-server/src/steps/step_instruction_contracts.ts` | G0, G2, G3, G5 | Geen mandatory atom verloren; tokenreductie op doelsteps | `strategy_instructions.test.ts`, `rulesofthegame_instructions.test.ts`, `instructions_contract_sweep.test.ts` | middel-hoog | prompt | per-step flags (`BSC_STRATEGY_PROMPT_V2`, `BSC_RULES_PROMPT_V2`, `BSC_DREAM_EXPLAINER_PROMPT_V2`) |
| P1-002 | P1 | Surface correction stricter gating | `mcp-server/src/handlers/run_step_runtime_execute.ts`, `mcp-server/src/handlers/run_step_surface_correction.ts` | G2, G3, G4, G5 | Minder correctiecalls zonder stijging in misroutes/schema-fouten | surface-correction tests + typo/noise replay | middel | runtime | `BSC_SURFACE_CORRECTION_V2=0` |
| P1-003 | P1 | Delta repair in strict JSON attempt 2 | `mcp-server/src/core/llm.ts` | G0, G2, G4, G5 | Repair input kleiner; repair-success ratio niet slechter dan baseline | llm repair contract tests + timeout tests | middel | runtime | `BSC_STRICT_JSON_REPAIR_DELTA_V1=0` |
| P2-001 | P2 | CI budget gates | nieuw `mcp-server/scripts/token_budget_gate.mjs`, `mcp-server/src/core/session_token_log.test.ts`, `mcp-server/package.json` | G5 | CI faalt boven budget en toont per callpad overschrijding | replay + budget assertions | laag | runtime | gate uitschakelbaar via CI var |
| P2-002 | P2 | UI/i18n guardrails tijdens promptoptimalisatie | `mcp-server/src/handlers/run_step_ui_payload.ts`, `mcp-server/src/i18n/ui_strings_catalog.ts`, bijbehorende tests | G2, G3, G5 | Geen contract regressie in UI payload of locale fallback | `step_contracts.test.ts`, i18n parity tests | laag | ui/i18n | guardrail-checks via CI flag |

## 6. Ticket-specifieke zekerheidspunten (extra bovenop gates)

### P0-002 Explain-light
- Mandatory atom manifest per step/intent verplicht.
- Explain-light mag alleen niet-verplichte herhaling verwijderen.
- `REQUEST_EXPLANATION` replay moet gelijk blijven op intent + route + outputtype.

### P0-004 Context whitelist
- Verplichte minimumkeys:
  - `action`, `message`, `question`, `refined_formulation`, `wants_recap`, `is_offtopic`, `user_intent`, `meta_topic`, `statements`
  - step-specifiek veld van actieve step (`dream`, `purpose`, `bigwhy`, `role`, `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`)
- Whitelistwijzigingen altijd met field-usage bewijs (code search + tests).

### P1-001 Step dedupe
- Alleen representatie compacter maken; semantiek van regels identiek houden.
- Verplicht side-by-side review door runtime + prompt owner.

### P1-003 Delta repair
- Schema-id en alle validatiefouten moeten expliciet in repair prompt blijven.
- Geen versoepeling van strict JSON contract toegestaan.

## 7. Budgetdoelen (expliciet)

Tokenbudget p95 per callpad:
- `REQUEST_EXPLANATION` <= 3000 input tokens
- `dream/purpose/bigwhy/role/entity` <= 4800 input tokens
- `strategy/rules/dream_explainer` <= 6000 input tokens

Latencybudget p95 per steppad:
- `step_0` <= 2200ms
- `dream/purpose/bigwhy/role/entity` <= 3000ms
- `strategy/rules` <= 3200ms
- `REQUEST_EXPLANATION` <= 2200ms

## 8. Werkvolgorde voor implementatie-agent
1. P0-001 (meetbaarheid eerst)
2. P0-003 en P0-004 (lage/middel risico, directe winst)
3. P0-002 (explain-light met strikte gates)
4. P1-001, P1-002, P1-003 elk in aparte PR
5. P2-001 en P2-002 als regressieguardrails

PR-regel:
- Max 1 ticket per PR.
- Elke PR bevat alle 6 bewijsartefacten uit sectie 4.
- Zonder compleet bewijs geen merge.

## 9. Beslisdocument (owner approvals)
Voor start implementatie expliciet akkoord nodig op:
1. Explain-light profielgrenzen (P0-002)
2. Context whitelist definitie (P0-004)
3. Dedupe grenzen per step (P1-001)
4. Surface correction gating drempels (P1-002)
5. Delta repair policy (P1-003)
6. CI budget/fail policy (P2-001)

## 10. Definition of Done
Een ticket is pas "done" als:
- Alle relevante gates (G0-G5) groen zijn.
- Geen contractregressie aantoonbaar in replay/contracttests.
- Token- en latencydelta is gemeten en gerapporteerd.
- Rollback is uitgevoerd en bevestigd.
