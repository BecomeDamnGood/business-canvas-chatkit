# Repository Architectuuraudit (2026-02-26)

## Executive Summary
- De codebase is niet te dun; in `mcp-server` is ze momenteel te complex in de orchestratie-laag, terwijl `chatkit` en `managed-chatkit` relatief dun zijn.
- Grootste concentratie van complexiteit zit in `mcp-server/src/handlers/run_step_runtime.ts` (`run_step`) met 1765 LOC.
- De facade `mcp-server/src/handlers/run_step.ts` is netjes dun, maar maskeert dat de echte "god module" nu runtime is.
- Contract-veiligheid is sterk (fail-closed) via `parseRunStepIngressArgs` en `assertRunStepContractOrThrow`.
- SSOT is gedeeltelijk goed: `CanvasStateZod` + migraties bestaan.
- Tegelijk is er duplicatie van businessregels (step->final mapping, contract/menu parsing) over meerdere modules.
- Observability is functioneel maar niet uniform: veel `console.*` tags, beperkte trace-context propagatie.
- CI/guardrails zijn sterk voor `mcp-server`, maar buiten `mcp-server` nauwelijks tests gevonden.
- `arch:run-step:any-budget` faalt momenteel op "moet per PR dalen"-regel (580->580), niet op absolute kwaliteit.
- MCP-readiness is middelmatig: duidelijke tool boundary, maar idempotency/concurrency nog zwak (in-memory bootstrap registry).
- Onderhoudsrisico: hoge cognitieve load door brede dependency-porten en veel flags in runtime/backbone.
- Advies: eerst SSOT-contractlaag centraliseren, daarna runtime modulair splitsen en observability/idempotency professionaliseren.

### Is het te complex, te dun, of gebalanceerd?
- `mcp-server`: te complex rond runtime orchestration.
- `chatkit` en `managed-chatkit`: eerder dun.
- Repo als geheel: niet gebalanceerd; complexiteit is zwaar geconcentreerd.

### Grootste risico's voor onderhoud/debuggen
- Runtime orchestration als single change hotspot (`run_step_runtime.ts`).
- Duplicaatregels voor contract/menu/finals.
- Geen uniforme structured logging met harde trace-carry.
- Node-local session/bootstrap ordering zonder distributed concurrency model.

### Top 5 quick wins
1. Centraliseer `contract_id` parsing/building in 1 util en verwijder duplicaten uit runtime/tests/UI payload.
2. Maak 1 SSOT-map voor `step_id -> final_field` en gebruik die overal.
3. Introduceer structured logger + verplichte `correlation_id` in elke logregel.
4. Splits `run_step_runtime.ts` op in pure policy-core + side-effect adapters.
5. Voeg minimale testbaseline toe voor `chatkit` en `managed-chatkit`.

## Scope, aannames en onzekerheden

### Gescand
- Hele repo: `src`, tests, config en docs.
- Focus op `mcp-server` (veruit hoogste complexiteit).

### Verifieerbare checks
- `npm run -s arch:run-step:check` -> PASS
- `npm run -s arch:run-step-runtime:check` -> PASS
- `npm run -s arch:run-step:any-budget` -> FAIL op per-PR delta eis

### Onzeker / te checken
- Productie-topologie (single vs multi-instance) is niet rechtstreeks af te leiden.
- Externe trace backend (OTel/Datadog/etc.) is niet zichtbaar in repo.
- Geen ADR-bestanden gevonden in deze repo.

## Architectuurkaart

### Lagen/modules/components + afhankelijkheden
| Laag | Modules | Rol | Opmerkingen |
|---|---|---|---|
| Interface/API | `mcp-server/server.ts` | MCP resource/tool registratie + HTTP afhandeling | `registerTool`, `registerResource`, input/output schema's |
| Ingress/Contract Gate | `src/handlers/ingress.ts`, `src/handlers/turn_contract.ts` | Input normalisatie/fail-closed + output contract assert | Contract-first |
| Applicatie Orchestratie | `src/handlers/run_step_runtime.ts`, `run_step_routes.ts`, `run_step_pipeline.ts` | Controlflow turn lifecycle | Grootste complexiteit |
| Domein | `src/core/state.ts`, `orchestrator.ts`, `turn_policy_renderer.ts` | State, transities, render policy | Goede basis |
| Infra/Integraties | `src/core/llm.ts`, `src/handlers/specialist_dispatch.ts` | LLM calls + schema-validatie | Veel specialist branches |
| UI contract | `src/core/ui_contract_matrix.ts`, `actioncode_registry.ts` | Menu/action labels + contract-id constructie | Basis SSOT aanwezig |

### Dataflow en controlflow
1. Request via `runStepHandler` in `server.ts`.
2. Inputvalidatie via `RunStepInputSchema` (`server.ts`).
3. Ingress parse + fail-closed via `parseRunStepIngressArgs`.
4. Runtime execute via `run_step` in `run_step_runtime.ts`.
5. Preflight -> action routing -> special routes -> post pipeline.
6. Output assert via `assertRunStepContractOrThrow`.
7. Model-safe output via `buildModelSafeResult`.

### Waar state leeft en hoe het stroomt (incl. duplicaat)
- Canonieke sessiestate: `CanvasStateZod` (`core/state.ts`), met `CURRENT_STATE_VERSION = "12"`.
- Migraties: `migrateState`.
- Ephemeral serverstate: bootstrap session registry in `server.ts` (in-memory).
- Duplicaatregels:
- `step -> final` mapping op meerdere plaatsen.
- Contract/menu parsing op meerdere plaatsen.
- Transient key stripping zowel in `server.ts` als `ingress.ts`.

## Complexiteitsanalyse

### Hotspots
| Bestand | Indicatie | Risico |
|---|---|---|
| `src/handlers/run_step_runtime.ts` | 1765 LOC, veel lokale helpers/flags | Hoge regressiekans |
| `src/handlers/specialist_dispatch.ts` | 977 LOC, step-specifieke branches | Moeilijk uitbreiden |
| `src/handlers/run_step_routes.ts` | 894 LOC | Complex route-intent gedrag |
| `src/handlers/run_step_wording.ts` | 809 LOC | Overlap policy-logic |
| `src/handlers/run_step_runtime_action_routing.ts` | 773 LOC | Cyclomatic hotspot |

### Cyclomatic/structural (kwalitatief)
- Hoog in runtime/action-routing/specialist-dispatch.
- Laag in facade (`run_step.ts`).

### Waar abstraheren teveel/te weinig is
- Teveel: brede `RunStep*Ports` objecten met veel verantwoordelijkheden.
- Te weinig: herhaalde utility-regels (contract-id parsing, final mapping).

### Thin slices vs God modules
- Thin slice: `run_step.ts` (delegate).
- God module: `run_step_runtime.ts`.

## Opsplitsing & debugbaarheid

### Grenzen logisch?
- Domain (`core`) is redelijk separaat.
- Application handlers mixen domeinpolicy, infra en output-formatting.

### Logging/tracing/telemetry
- Veel tags aanwezig (`[contract_decision]`, `[ui_gate_decision]`, etc.).
- Geen uniforme logger abstraction of verplicht logschema.

### Foutafhandeling
- Sterk: fail-closed ingress/turn-contract.
- Zwakker: safe wrappers rond specialist kunnen root-cause context afvlakken.

### Testbaarheid
- Sterk in `mcp-server` (26 testfiles onder `mcp-server/src`).
- Zwak buiten `mcp-server`: geen tests gevonden in `chatkit`/`managed-chatkit` met standaardpatronen.

## Contract-based design + SSOT

### Welke contracts bestaan er?
- State schema + migratie: `core/state.ts`.
- Intent/event contracts: `contracts/intents.ts`, `contracts/transitions.ts`.
- UI action payload contract: `contracts/ui_actions.ts`.
- UI contract matrix: `core/ui_contract_matrix.ts`.
- Action registry: `core/actioncode_registry.ts`.
- MCP tool API contracts: `server.ts` (`RunStepInputSchema`, `ToolStructuredContentOutputSchema`).

### Waar regels dubbel worden geimplementeerd
- Contract/menu parsing in meerdere modules/tests.
- Step/final mapping in meerdere modules.
- State cleanup/transient stripping op meerdere plekken.

### Voorstel: een bron voor schema's/types/validatie
1. Introduceer `src/contracts/runtime_ssot/` als centrale contractlaag (Zod-first).
2. Genereer JSON Schema artifacts uit Zod voor CI-diffing.
3. Definieer versiebeheer per contractfamilie (state/ui/tool).
4. Voeg compatibiliteitstests toe (backward + forward where applicable).

### Schema-driven integratie suggestie
- Blijf Zod als authoring source gebruiken.
- Exporteer JSON Schema voor tooling/CI.
- Houd `ACTIONCODE_REGISTRY` + `ui_contract_matrix` onder contract-diff guardrail.

## MCP / agent-proof beoordeling (0-5)
| Categorie | Score | Observatie | Concrete fix |
|---|---:|---|---|
| Tool/command boundaries | 3 | Duidelijke boundary via `registerTool(run_step)` | Splits runtime intern in command handlers |
| Idempotency/side-effects | 2 | In-memory bootstrap registry | Idempotency key + persistente store |
| Deterministische planner-friendly functies | 3 | Pure functies bestaan (`migrateState`) | Meer pure policy-core, minder runtime side-effects |
| Observability | 2 | Veel logs, geen uniform schema | Structured logging met verplichte velden |
| Permissions/secrets handling | 3 | Env-secrets + security middleware | Redaction policy + scanner in CI |
| Concurrency safety | 2 | Session ordering node-local | Concurrency model + atomic snapshot updates |

## Aanbevelingen met prioriteit
| Aanbeveling | Impact | Effort | Risico | Betrokken bestanden | Definition of Done |
|---|---|---|---|---|---|
| Centraliseer contract-id util | H | M | Menu-routing regressie | `core/ui_contract_matrix.ts`, `handlers/run_step_ui_payload.ts`, `core/turn_policy_renderer.ts` | 1 util, duplicaten weg, tests groen |
| SSOT `step->final` mapping | H | M | Legacy mapfouten | `core/state.ts`, `handlers/run_step_runtime_action_routing.ts`, `core/turn_policy_renderer.ts` | Mapping op 1 plek |
| Runtime decomposition | H | H | Tijdelijke velocity dip | `handlers/run_step_runtime.ts`, `handlers/run_step_ports.ts` | runtime < 900 LOC, tests groen |
| Structured logging + trace context | H | M | Log volume stijgt | `server.ts`, `handlers/run_step_response.ts`, runtime modules | 100% kernlogs met `correlation_id` |
| Idempotency/replay policy | H | M | State drift bij retries | `server.ts`, runtime entry | Retry/replay tests pass |
| Contract schema export in CI | M | M | Breaking changes missen | `mcp-server/package.json`, `.github/workflows/ci.yml` | Schema diff gate actief |
| `any` debt reduceren | M | M | Trage cleanup | `mcp-server/src/handlers/*` | any-budget daalt |
| Testbaseline buiten mcp-server | M | L | Onopgemerkte regressies | `chatkit`, `managed-chatkit` | Min. smoke tests in CI |

## Refactor plan in fases

### Fase 0: veiligheidsnet (tests/linters/CI)
- Bevries runtime golden fixtures.
- Voeg schema-diff CI stap toe.
- Voeg minimale smoke tests toe voor `chatkit` en `managed-chatkit`.

Checklist:
- `npm test` stabiel.
- `arch:*` checks groen.
- Contract-breaking change faalt in CI.

### Fase 1: SSOT + contracts
- Introduceer centrale contract utility/module.
- Migreer parse/build calls naar centrale util.
- Centraliseer `step->final` mapping.

Checklist:
- Geen duplicate helperregels.
- Contract inventory automatisch afleidbaar.
- Compatibiliteitstests aanwezig.

### Fase 2: modulariteit & boundaries
- Split runtime in policy-core + adapters.
- Verklein en verscherp `RunStep*Ports`.
- Verplaats pure logica naar `core`.

Checklist:
- Runtime bestandsgrootte en branchdruk omlaag.
- Minder cross-layer imports.
- Unit tests op pure policy modules.

### Fase 3: observability + MCP readiness
- Structured logging standaardiseren.
- Idempotency key support toevoegen.
- Concurrency policy + persistente ordering implementeren.

Checklist:
- End-to-end trace corrigeerbaar per request.
- Retry/replay gedrag deterministisch.
- Secrets redaction gevalideerd in tests.

## Agent-ready werkpakketten (tickets)

### Ticket 1: Centrale contract-id util
- Doel: 1 parser/builder voor contract-id.
- Context/bestanden: `core/ui_contract_matrix.ts`, `handlers/run_step_ui_payload.ts`, `core/turn_policy_renderer.ts`.
- Constraints: backward compat met bestaand format.
- Acceptance criteria: duplicaten weg, tests groen.
- Risico's: menu-resolutie regressie.
- Voorstel aanpak: introduce util -> gefaseerde vervanging -> snapshot checks.

### Ticket 2: SSOT step-final mapping
- Doel: 1 bron voor final field resolutie.
- Context/bestanden: `core/state.ts`, `handlers/run_step_runtime_action_routing.ts`, `core/turn_policy_renderer.ts`.
- Constraints: persisted field names ongewijzigd.
- Acceptance criteria: mapping op exact 1 plek.
- Risico's: fout in legacy step handling.
- Voorstel aanpak: central map + compile-time usage + regressietests.

### Ticket 3: Runtime decomposition
- Doel: `run_step_runtime.ts` opsplitsen.
- Context/bestanden: `handlers/run_step_runtime.ts` en `handlers/run_step_runtime_*`.
- Constraints: extern `run_step` contract gelijk houden.
- Acceptance criteria: runtime < 900 LOC, contracttests groen.
- Risico's: subtiele controlflow regressies.
- Voorstel aanpak: strangler pattern per subflow.

### Ticket 4: Structured logging
- Doel: uniforme JSON logging met vaste keys.
- Context/bestanden: `server.ts`, `handlers/run_step_response.ts`, runtime modules.
- Constraints: geen secrets/PII in logs.
- Acceptance criteria: verplichte `correlation_id` in kernlogs.
- Risico's: hogere logkosten.
- Voorstel aanpak: logger wrapper + lint/check op verplicht velden.

### Ticket 5: Idempotency/replay guard
- Doel: veilige retries voor MCP turns.
- Context/bestanden: `server.ts` bootstrap/session ordering + runtime entry.
- Constraints: deterministische output per idempotency key.
- Acceptance criteria: duplicate request tests slagen.
- Risico's: storage consistency.
- Voorstel aanpak: request key strategy + store abstraction.

### Ticket 6: Error taxonomy hardening
- Doel: uniforme foutcodes voor agents/planners.
- Context/bestanden: `handlers/turn_contract.ts`, `handlers/ingress.ts`, `handlers/specialist_dispatch.ts`.
- Constraints: bestaande error types behouden.
- Acceptance criteria: elk foutpad heeft `type`, `code`, `retryable`.
- Risico's: client-compatibiliteit.
- Voorstel aanpak: centrale error map + adapterlaag.

### Ticket 7: Contract schema export pipeline
- Doel: Zod -> JSON Schema export + CI diff.
- Context/bestanden: `contracts/*`, `core/state.ts`, CI files.
- Constraints: CI runtime beperkt houden.
- Acceptance criteria: schema artifacts + compat gate in CI.
- Risico's: false positives bij schema-ordering.
- Voorstel aanpak: canonicalized schema output.

### Ticket 8: Cross-project test baseline
- Doel: minimale tests voor `chatkit` en `managed-chatkit`.
- Context/bestanden: beide backends/frontends.
- Constraints: snelle smoke tests.
- Acceptance criteria: CI draait minimaal 1 backend + 1 frontend smoke per app.
- Risico's: flaky tests.
- Voorstel aanpak: deterministic fixtures en minimale scope.

## ADR-lijst (ontbrekende beslissingen)
- ADR-001: Runtime orchestration boundaries en ownership.
- ADR-002: Contract versioning policy (state/ui/tool) + compatregels.
- ADR-003: Idempotency/replay semantics voor MCP `run_step`.
- ADR-004: Concurrency model voor bootstrap/session ordering.
- ADR-005: Structured logging schema + trace propagation standaard.
- ADR-006: Secret redaction en prompt/log hygiene policy.
- ADR-007: SSOT governance voor action/menu/step-final mappings.
- ADR-008: Error taxonomy en retryability matrix.
- ADR-009: Schema generation pipeline (Zod als source of truth).
- ADR-010: Teststrategie buiten `mcp-server`.

## Contract inventory
| Contract | Type | Owner-module | Enforcement | Versie | Compat/notes |
|---|---|---|---|---|---|
| MCP `run_step` input | API schema (Zod) | `server.ts` + `handlers/ingress.ts` | `RunStepArgsSchema` (tool + local-dev parse), ingress canonicalization | implicit (release-coupled) | `state` canonicalization + transient allowlist via ingress-SSOT |
| MCP `run_step` output | API schema (Zod) | `server.ts` | Tool registration outputSchema | implicit | output shape gevalideerd op MCP + lokale bridge |
| Canvas state | Domain schema (Zod) | `core/state.ts` | `normalizeState`, `migrateState` | `CURRENT_STATE_VERSION=12` | step->final mapping SSOT: `STEP_FINAL_FIELD_BY_STEP_ID` |
| Ingress args/state markers | Input contract | `handlers/ingress.ts` | `parseRunStepIngressArgs` fail-closed | implicit | idempotency-key normalisatie SSOT (`normalizeIngressIdempotencyKey`) |
| Turn output contract parity | Output contract | `handlers/turn_contract.ts` | `assertRunStepContractOrThrow` | implicit | fail-closed op contract mismatch |
| UI contract id/menu | UI contract matrix | `core/ui_contract_matrix.ts` | renderer/pipeline/routes | `UI_CONTRACT_VERSION` | menu/action resolutie blijft fail-closed |
| Action code registry | Registry contract | `core/actioncode_registry.ts` | menu/action resolution | `ACTIONCODE_REGISTRY_VERSION` (env) | registry diff/contract checks in CI |
| Step intents | Domain command contract | `contracts/intents.ts` | parsers/adapters | implicit | adapter compat nodig bij intent uitbreiding |
| Transition events | Domain event contract | `contracts/transitions.ts` | orchestrator transitions | implicit | event-naam stabiliteit vereist voor replay/debug |
| UI rendered action payload | UI payload schema | `contracts/ui_actions.ts` | response engine/pipeline | implicit | schema-first, runtime checks op renderpad |
| Orchestrator output | Domain output schema | `core/orchestrator.ts` | runtime orchestration | implicit | determinisme vereist voor idempotent gedrag |
| Specialist step outputs | Per-step schema (Zod/JSON) | `handlers/specialist_dispatch.ts` + `steps/*` | `callStrictJson` + Zod parse | implicit per step | strict parse voorkomt silent payload drift |
| UI/i18n bootstrap state | Runtime contract type | `handlers/run_step_i18n_runtime.ts` | i18n gating | implicit | bootstrap compatibility via migration + gate-status |

## Concrete code-locaties (selectie)
- `mcp-server/src/handlers/run_step_runtime.ts:1371` (`run_step`)
- `mcp-server/src/handlers/run_step.ts:11` (facade delegate)
- `mcp-server/src/core/state.ts:204` (`CanvasStateZod`)
- `mcp-server/src/core/state.ts:281` (`CURRENT_STATE_VERSION`)
- `mcp-server/src/core/state.ts:615` (`migrateState`)
- `mcp-server/src/core/ui_contract_matrix.ts:606` (`buildContractId`)
- `mcp-server/src/core/actioncode_registry.ts:18` (`ACTIONCODE_REGISTRY`)
- `mcp-server/src/handlers/ingress.ts:217` (`parseRunStepIngressArgs`)
- `mcp-server/src/handlers/turn_contract.ts:74` (`assertRunStepContractOrThrow`)
- `mcp-server/server.ts:1152` (`RunStepInputSchema`)
- `mcp-server/server.ts:1180` (`registerTool`)
