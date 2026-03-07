# Context & Instruction Efficiency Audit

## 1. Executive Summary
- Gemeten baseline (runtime sessies in repo): **112,773 total tokens**, waarvan **109,889 input tokens**.
- Praktisch alle kosten komen uit 1 productiesessie: `eadf35db-c421-4182-8538-021f6a153719` (`session-2026-03-07-103834-...md`).
- Grootste structurele verspiller: zeer lange specialist-instructies die per call opnieuw meegaan via `callStrictJson`.
- Gemiddelde non-zero turn in deze sessie: **6,868 input tokens**.
- Explain-more paden zijn niet “light”: `REQUEST_EXPLANATION` calls zitten nog op ~6.7k-7.4k input tokens.
- Er is aantoonbare prompt-duplicatie in `targetgroup` en `productsservices`: `contextBlock` wordt dubbel meegestuurd.
- Contextsnapshot is breed: `last_specialist_result_json` gaat integraal mee.
- Retry/repair/autosuggest paden verhogen tokenlast met vrijwel dezelfde context.
- Turn-level logging verbergt subcall-level waste en vertraagt gericht optimaliseren.
- Verwachte structurele besparing (vNext): **30%-45% input-token reductie** op vergelijkbare flows, mits gefaseerd met feature flags.

## 2. Meetmethodiek
### Databronnen
- Code-inspectie (verplicht):
  - `mcp-server/src/handlers/run_step_runtime_execute.ts`
  - `mcp-server/src/handlers/run_step_preflight.ts`
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
  - `mcp-server/src/handlers/run_step_pipeline.ts`
  - `mcp-server/src/handlers/specialist_dispatch_safe.ts`
  - `mcp-server/src/core/model_routing.ts`
  - `mcp-server/config/model-routing.json`
  - `mcp-server/src/core/actioncode_registry.ts`
  - `mcp-server/src/core/session_token_log.ts`
  - `mcp-server/src/steps/*.ts`
  - `mcp-server/session-logs/*.md`
- Sessie-logs gebruikt:
  - `mcp-server/session-logs/session-2026-03-07-103834-eadf35db-c421-4182-8538-021f6a153719.md`
  - `mcp-server/session-logs/session-2026-03-07-103651-20e8e644-5f21-4444-914b-8b79e57d7017.md`
  - `mcp-server/session-logs/session-2026-03-07-105345-849c305c-88dd-472c-85ff-7b44c888bd31.md`
  - samenvatting: `mcp-server/session-logs/TEMP-session-summary.log`

### Werkwijze
- `SESSION_LOG_DATA` JSON uit elke sessielog geëxtraheerd.
- Aggregaties gemaakt per model, step, specialist, action_code, intent, en gecombineerd call-patroon.
- Callsites herleid via `run_step_pipeline`, `run_step_routes`, `specialist_dispatch`, `llm`.
- Promptopbouw gereconstrueerd vanuit codepad:
  - system instructions
  - step instructions
  - context block
  - recap/meta contracts
  - planner input
  - optional repair/autosuggest wrappers

### Meetbeperkingen
- Tokenlogging is turn-geaggregeerd, niet subcall-geaggregeerd (`run_step_response.ts` schrijft 1 turn entry).
- Daardoor zijn surface-correction/repair/autosuggest subcalls niet los terug te zien in sessielog-tokens.
- Geobserveerde non-zero sessie eindigt bij `strategy`; latere steps zijn code-geanalyseerd maar niet token-geobserveerd.

## 3. Call Inventory

### 3.1 Runtime callsites (LLM startpunten)
| call_id | file:line | step_id | specialist | trigger | model | attempts |
|---|---|---|---|---|---|---|
| RT-001 | `run_step_surface_correction.ts:162` | dynamisch | SurfaceCorrection | vrije tekst (geen action/route, gating pass) | baseline (`OPENAI_MODEL` of `gpt-4.1`) | 1-2 |
| RT-010 | `run_step_pipeline.ts:328` | decision.current_step | decision.specialist_to_call | default specialistpad | routed/fallback | 1-2 |
| RT-011 | `run_step_pipeline.ts:362` | autosuggest set | forced specialist | `INSPIRATION_REQUEST` autosuggest | routed/fallback | 1-2 |
| RT-012 | `run_step_pipeline.ts:394` | strategy/productsservices/rulesofthegame | idem | autosuggest minimum repair | routed/fallback | 1-2 |
| RT-013 | `run_step_pipeline.ts:469` | dream | Dream | dream candidate missing repair | routed/fallback | 1-2 |
| RT-014 | `run_step_pipeline.ts:506` | strategy | Strategy | consolidate repair | routed/fallback | 1-2 |
| RT-015 | `run_step_pipeline.ts:529` | bigwhy | BigWhy | shorten guard | routed/fallback | 1-2 |
| RT-020 | `run_step_routes.ts:482` | dream | DreamExplainer | submit scores special route | routed/fallback | 1-2 |
| RT-021 | `run_step_routes.ts:607` | dream | Dream | switch-to-self special route | routed/fallback | 1-2 |
| RT-022 | `run_step_routes.ts:866` | dream | DreamExplainer | start-exercise special route | routed/fallback | 1-2 |
| SP-101 | `specialist_dispatch.ts:301` | step_0 | ValidationAndBusinessName | specialist_to_call dispatch | params.model | 1-2 |
| SP-102 | `specialist_dispatch.ts:330` | dream | Dream | specialist_to_call dispatch | params.model | 1-2 |
| SP-103 | `specialist_dispatch.ts:384` | dream | DreamExplainer | specialist_to_call dispatch | params.model | 1-2 |
| SP-104 | `specialist_dispatch.ts:415` | purpose | Purpose | specialist_to_call dispatch | params.model | 1-2 |
| SP-105 | `specialist_dispatch.ts:441` | bigwhy | BigWhy | specialist_to_call dispatch | params.model | 1-2 |
| SP-106 | `specialist_dispatch.ts:467` | role | Role | specialist_to_call dispatch | params.model | 1-2 |
| SP-107 | `specialist_dispatch.ts:493` | entity | Entity | specialist_to_call dispatch | params.model | 1-2 |
| SP-108 | `specialist_dispatch.ts:522` | strategy | Strategy | specialist_to_call dispatch | params.model | 1-2 |
| SP-109 | `specialist_dispatch.ts:549` | targetgroup | TargetGroup | specialist_to_call dispatch | params.model | 1-2 |
| SP-110 | `specialist_dispatch.ts:576` | productsservices | ProductsServices | specialist_to_call dispatch | params.model | 1-2 |
| SP-111 | `specialist_dispatch.ts:610` | rulesofthegame | RulesOfTheGame | specialist_to_call dispatch | params.model | 1-2 |
| SP-112 | `specialist_dispatch.ts:656` | presentation | Presentation | specialist_to_call dispatch | params.model | 1-2 |
| CORE-201 | `llm.ts:378` | n.v.t. | n.v.t. | strict-json attempt 1 | args.model | 1 |
| CORE-202 | `llm.ts:490` | n.v.t. | n.v.t. | strict-json repair attempt 2 | args.model | +1 |
| CORE-203 | `llm.ts:323` | n.v.t. | n.v.t. | OpenAI Responses API call | args.model | HTTP retry loop extern |

### 3.2 Promptopbouw per specialistcall
| blok | herkomst | mandatory/optional | stable/volatile | cacheable/non-cacheable |
|---|---|---|---|---|
| Global glossary prefix | `core/glossary.ts` via `composeInstructionsWithGlossary` | mandatory | stable | cacheable |
| Step base instructions | `steps/*.ts` `*_INSTRUCTIONS` | mandatory | stable | cacheable |
| Language lock | `run_step_policy_meta.ts` | mandatory | stable | cacheable |
| Context block (`STATE FINALS`, `last_specialist_result_json`) | `run_step_runtime_state_helpers.ts` | mandatory | volatile | non-cacheable |
| Recap instruction | `run_step_runtime_state_helpers.ts` | mandatory | stable | cacheable |
| Universal meta/offtopic policy | `run_step_policy_meta.ts` | optional (`includeUniversalMeta`) | stable | cacheable |
| User intent/meta topic/offtopic contracts | `run_step_policy_meta.ts` | mandatory | stable | cacheable |
| Planner input | step `build*SpecialistInput` | mandatory | volatile | non-cacheable |
| Repair wrapper | `llm.ts` repair mode | optional | volatile | non-cacheable |

## 4. Tokenverbruik Analyse

### 4.1 Baseline
- Totaal sessies: 3
- Totaal turns: 22
- Non-zero turns: 16
- Input tokens: **109,889**
- Output tokens: **2,884**
- Total tokens: **112,773**

Bron: `session-2026-03-07-103834-...` regels 45-49 + 2 nul-sessies.

### 4.2 Verbruik per dimensie

#### Per model
| model | turns | total_tokens |
|---|---:|---:|
| gpt-4.1 | 22 | 112,773 |

#### Per step (total_tokens)
| step | turns | total_tokens |
|---|---:|---:|
| purpose | 4 | 28,363 |
| role | 4 | 21,213 |
| entity | 3 | 20,729 |
| bigwhy | 2 | 14,882 |
| dream | 3 | 12,124 |
| strategy | 1 | 10,219 |
| step_0 | 5 | 5,243 |

#### Per intent
| intent_type | turns | total_tokens | aandeel |
|---|---:|---:|---:|
| ROUTE | 11 | 77,051 | 68.3% |
| REQUEST_EXPLANATION | 5 | 35,722 | 31.7% |
| (none) | 6 | 0 | 0% |

#### Per action_code (top non-zero)
| action_code | turns | total_tokens |
|---|---:|---:|
| ACTION_ENTITY_EXAMPLE_CONFIRM | 1 | 10,219 |
| ACTION_BIGWHY_INTRO_GIVE_EXAMPLE | 1 | 7,557 |
| ACTION_PURPOSE_REFINE_CONFIRM | 1 | 7,325 |
| ACTION_PURPOSE_INTRO_EXPLAIN_MORE | 1 | 7,104 |
| ACTION_ROLE_INTRO_GIVE_EXAMPLES | 1 | 7,098 |
| ACTION_ENTITY_INTRO_EXPLAIN_MORE | 1 | 6,998 |

### 4.3 Top 20 duurste call-patronen
| rank | pattern (model\|step\|specialist\|action\|intent) | freq | total_tokens | share |
|---:|---|---:|---:|---:|
| 1 | gpt-4.1\|strategy\|Strategy\|ACTION_ENTITY_EXAMPLE_CONFIRM\|ROUTE | 1 | 10,219 | 9.06% |
| 2 | gpt-4.1\|purpose\|Purpose\|(none)\|ROUTE | 1 | 7,566 | 6.71% |
| 3 | gpt-4.1\|bigwhy\|BigWhy\|ACTION_BIGWHY_INTRO_GIVE_EXAMPLE\|REQUEST_EXPLANATION | 1 | 7,557 | 6.70% |
| 4 | gpt-4.1\|bigwhy\|BigWhy\|ACTION_PURPOSE_REFINE_CONFIRM\|ROUTE | 1 | 7,325 | 6.50% |
| 5 | gpt-4.1\|role\|Role\|(none)\|ROUTE | 1 | 7,203 | 6.39% |
| 6 | gpt-4.1\|purpose\|Purpose\|ACTION_PURPOSE_INTRO_EXPLAIN_MORE\|REQUEST_EXPLANATION | 1 | 7,104 | 6.30% |
| 7 | gpt-4.1\|role\|Role\|ACTION_ROLE_INTRO_GIVE_EXAMPLES\|REQUEST_EXPLANATION | 1 | 7,098 | 6.29% |
| 8 | gpt-4.1\|entity\|Entity\|ACTION_ENTITY_INTRO_EXPLAIN_MORE\|REQUEST_EXPLANATION | 1 | 6,998 | 6.21% |
| 9 | gpt-4.1\|purpose\|Purpose\|ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES\|REQUEST_EXPLANATION | 1 | 6,965 | 6.18% |
| 10 | gpt-4.1\|role\|Role\|ACTION_BIGWHY_REFINE_CONFIRM\|ROUTE | 1 | 6,912 | 6.13% |
| 11 | gpt-4.1\|entity\|Entity\|ACTION_ENTITY_FORMULATE_FOR_ME\|ROUTE | 1 | 6,895 | 6.11% |
| 12 | gpt-4.1\|entity\|Entity\|ACTION_ROLE_REFINE_CONFIRM\|ROUTE | 1 | 6,836 | 6.06% |
| 13 | gpt-4.1\|purpose\|Purpose\|ACTION_DREAM_REFINE_CONFIRM\|ROUTE | 1 | 6,728 | 5.97% |
| 14 | gpt-4.1\|dream\|Dream\|(none)\|ROUTE | 1 | 6,554 | 5.81% |
| 15 | gpt-4.1\|dream\|Dream\|ACTION_STEP0_READY_START\|ROUTE | 1 | 5,570 | 4.94% |
| 16 | gpt-4.1\|step_0\|ValidationAndBusinessName\|(none)\|ROUTE | 1 | 5,243 | 4.65% |
| 17 | gpt-4.1\|step_0\|ValidationAndBusinessName\|(none)\|(none) | 3 | 0 | 0% |
| 18 | gpt-4.1\|step_0\|ValidationAndBusinessName\|ACTION_START\|(none) | 1 | 0 | 0% |
| 19 | gpt-4.1\|dream\|Dream\|ACTION_WORDING_PICK_SUGGESTION\|(none) | 1 | 0 | 0% |
| 20 | gpt-4.1\|role\|Role\|ACTION_ROLE_EXAMPLES_CHOOSE_FOR_ME\|(none) | 1 | 0 | 0% |

## 5. Root Causes van Inefficiency

| oorzaak | repo-evidence | sessie-evidence | impact | herhaalbaarheid |
|---|---|---|---|---|
| RC-01: Zeer lange step-instructies per call | `steps/strategy.ts`, `steps/rulesofthegame.ts`, `steps/dream_explainer.ts`; callpad `specialist_dispatch.ts` -> `llm.ts` | `strategy` turn `7a4f...` input 10,007; meerdere turns >6.7k input | zeer hoog | alle specialist calls |
| RC-02: Shared policyblokken + stepblokken dupliceren dezelfde regels | `composeSpecialistInstructions` + herhaalde language/meta/offtopic secties in step instructions | explain-turns blijven ~6.7k-7.4k input ondanks smalle intent | hoog | cross-step |
| RC-03: Overbrede contextblock en dubbele contextinjectie | `buildSpecialistContextBlock` bevat `last_specialist_result_json`; `targetgroup/productsservices` voegen contextBlock ook in plannerInput | oplopend inputpatroon in sessie over steps | hoog | cross-step, vooral late steps |
| RC-04: Explain-more pad heeft geen “light profile” | explain actioncodes bestaan in registry, maar pipeline doet volledige specialistcall | `REQUEST_EXPLANATION` totaal 35,722 tokens over 5 turns | hoog | purpose/bigwhy/role/entity e.a. |
| RC-05: Extra herstelcalls met vergelijkbare context | `run_step_pipeline.ts` extra calls + `llm.ts` repair pass + surface correction | turns met attempts=2 en hoge input (`0f0d...`, `f45c...`) | medium-hoog | variabel, cross-step |
| RC-06: Tokenlogging op turn-niveau i.p.v. subcall-niveau | `run_step_response.ts` schrijft 1 geaggregeerde entry | subcall-waste niet direct zichtbaar in sessielogs | medium | alle paden |

## 6. Efficiency vNext Matrix
| pad | huidige contextblokken | voorgestelde contextset | tokenbesparing (schatting) | latency impact | kwaliteitsrisico | fallback/rollback |
|---|---|---|---|---|---|---|
| `REQUEST_EXPLANATION` paden | full step + full shared + full context | light explain profile + minimale context | 35%-50% op explain-traffic | -20% tot -35% | middel | `BSC_PROMPT_PROFILE_EXPLAIN_V1` |
| strategy main | zeer lang step contract + shared stack | compacte strategy template | ~3k-4.5k per strategy-call | -20% tot -30% | middel | `BSC_STRATEGY_PROMPT_V2` |
| purpose/role/entity/bigwhy | full promptstack | gecomprimeerde step contracts | ~2k-3k per call | -15% tot -25% | middel | per-step feature flags |
| targetgroup/productsservices | context dubbel in system + planner | context alleen system-side | ~250-900 per call | -5% tot -12% | laag | directe revert |
| alle specialistcalls | volledige `last_specialist_result_json` | compacte, whitelist context snapshot | ~300-1200 per call | -8% tot -18% | middel | `BSC_CONTEXT_SNAPSHOT_V2` |
| surface correction | extra LLM-call op brede criteria | heuristics-first + stricter gate | ~150-500 per eligible turn | -10% tot -20% | laag-middel | `BSC_SURFACE_CORRECTION_V2` |
| strict-json repair | volledige 2e prompt met grote payload | delta repair prompt met cap | ~300-1200 wanneer repair triggert | -8% tot -15% | middel | `BSC_STRICT_JSON_REPAIR_DELTA_V1` |
| autosuggest repair loops | meerdere bijna identieke calls | single-pass constraints waar kan | 1 call minder per trigger | -15% tot -30% | middel-hoog | `BSC_AUTOSUGGEST_SINGLEPASS_V1` |

## 7. Actieplan voor Implementatie-agent

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

## 8. Validatie & Guardrails

### Gate-model (verplicht)
- `G0 Instruction Coverage`: verplichte instructie-atomen blijven aanwezig (schema, route/action, taalregels, recap, offtopic/meta).
- `G1 Context Coverage`: verplichte contextvelden blijven in effectieve promptinput (`CURRENT_STEP`, `STATE FINALS`, `LANGUAGE` indien bekend, `user_message`, recap).
- `G2 Output Contract Equivalence`: geen regressie op required outputvelden, `contract_id`, `action_codes`, `rendered_actions`, `ui.view.mode`.
- `G3 Behavioral Equivalence`: replayset functioneel gelijk op intro/explain/refine/confirm/offtopic.
- `G4 Token/Latency Gate`: budgetten gehaald of verbeterd.
- `G5 Rollback Verifieerbaar`: feature flag uit levert aantoonbaar oud gedrag op.

### Verplicht bewijspakket per ticket
1. `atom_diff_before_after.json` (G0)
2. `context_field_coverage.json` (G1)
3. `contract_replay_report.json` (G2)
4. `behavioral_replay_report.json` (G3)
5. `token_latency_before_after.json` (G4)
6. `rollback_verification.md` (G5)

Fail-fast:
- Als een relevante gate faalt: ticket niet mergen.
- Eerst rollback naar laatst groene state; daarna pas herontwerp.

### Budgetdoelen (expliciet)
- Input token p95:
  - `REQUEST_EXPLANATION` <= 3000
  - `dream/purpose/bigwhy/role/entity` <= 4800
  - `strategy/rules/dream_explainer` <= 6000
- Latency p95:
  - `step_0` <= 2200ms
  - `dream/purpose/bigwhy/role/entity` <= 3000ms
  - `strategy/rules` <= 3200ms
  - `REQUEST_EXPLANATION` <= 2200ms

## 9. Beslisdocument (owner approvals)
- Voor start implementatie expliciet akkoord nodig op:
  1. Explain-light profielgrenzen (P0-002)
  2. Context whitelist definitie (P0-004)
  3. Dedupe grenzen per step (P1-001)
  4. Surface correction gating drempels (P1-002)
  5. Delta repair policy (P1-003)
  6. CI budget/fail policy (P2-001)

---

## Evidence Appendix

### A. Kern code-evidence
- `mcp-server/src/handlers/run_step_runtime_execute.ts:299`
- `mcp-server/src/handlers/run_step_pipeline.ts:328`
- `mcp-server/src/handlers/run_step_pipeline.ts:362`
- `mcp-server/src/handlers/run_step_pipeline.ts:394`
- `mcp-server/src/handlers/run_step_pipeline.ts:469`
- `mcp-server/src/handlers/run_step_pipeline.ts:506`
- `mcp-server/src/handlers/run_step_pipeline.ts:529`
- `mcp-server/src/handlers/run_step_routes.ts:482`
- `mcp-server/src/handlers/run_step_routes.ts:607`
- `mcp-server/src/handlers/run_step_routes.ts:866`
- `mcp-server/src/handlers/specialist_dispatch.ts:219`
- `mcp-server/src/handlers/specialist_dispatch.ts:540`
- `mcp-server/src/handlers/specialist_dispatch.ts:567`
- `mcp-server/src/core/llm.ts:380`
- `mcp-server/src/core/llm.ts:469`
- `mcp-server/src/core/glossary.ts:63`
- `mcp-server/src/handlers/run_step_runtime_state_helpers.ts:623`
- `mcp-server/src/handlers/run_step_policy_meta.ts:17`
- `mcp-server/src/steps/targetgroup.ts:75`
- `mcp-server/src/steps/productsservices.ts:75`
- `mcp-server/src/handlers/run_step_response.ts:270`

### B. Sessie-log evidence
- `session_id=eadf35db-c421-4182-8538-021f6a153719`  
  bestand: `mcp-server/session-logs/session-2026-03-07-103834-eadf35db-c421-4182-8538-021f6a153719.md`
  - turn `7a4f8d3f-2cde-4691-953f-0ee31fc7cd63` total `10,219` (strategy)
  - turn `f45c283b-2d61-490d-8708-6733c6f29912` total `7,566` (purpose, attempts=2)
  - turn `0e96ac35-8cec-4c76-8b41-bf82430c40ac` total `7,557` (bigwhy explain)
  - turn `9ae05f33-f7d9-4862-89c7-afc6ebd1bd4c` total `7,104` (purpose explain)
  - turn `c7d94711-7a96-4984-bacb-c38162bba36b` total `6,998` (entity explain)
  - totals: input `109,889`, output `2,884`, total `112,773`
- `session_id=20e8e644-5f21-4444-914b-8b79e57d7017`  
  bestand: `mcp-server/session-logs/session-2026-03-07-103651-20e8e644-5f21-4444-914b-8b79e57d7017.md`  
  total `0`
- `session_id=849c305c-88dd-472c-85ff-7b44c888bd31`  
  bestand: `mcp-server/session-logs/session-2026-03-07-105345-849c305c-88dd-472c-85ff-7b44c888bd31.md`  
  total `0`

## 10. Implementatiekoppeling
- Uitvoeringsplan staat in: `efficiency-implementatie.md`.
- `efficiency.md` en `efficiency-implementatie.md` hanteren nu hetzelfde gate-model (`G0-G5`) en hetzelfde bewijsprincipe voor zero-content-loss.
