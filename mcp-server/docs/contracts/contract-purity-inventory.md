# Contract Inventory

Bijgewerkt op: 2026-02-26  
Doel: actueel overzicht van contracten met owner, versie, enforcement en compat-status.

## Scope (Agent 6A)

- `mcp-server/src/contracts/*`
- `mcp-server/src/core/state.ts`
- `mcp-server/src/core/ui_contract_matrix.ts`
- `mcp-server/src/core/actioncode_registry.ts`
- `mcp-server/server.ts`
- direct noodzakelijke import: `mcp-server/src/core/ui_contract_id.ts`
- direct noodzakelijke import: `mcp-server/src/core/bootstrap_runtime.ts`

## Compat-legenda

- `BC`: backward compatible pad aanwezig.
- `Partieel BC`: deels lenient/additief, maar niet uniform.
- `Release-coupled`: geen expliciet versiebeleid; compat afhankelijk van gelijktijdige release.
- `Onzeker / te checken`: extra verificatie buiten deze scope nodig.

## Contract matrix

| Contract | Type | Owner-module | Versie | Enforcement (huidige code) | Compat-status | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| Canvas state schema (`CanvasStateZod`) | Domain/state schema | `mcp-server/src/core/state.ts` | `CURRENT_STATE_VERSION = "12"` | `normalizeState()` + eindcheck `CanvasStateZod.parse()` + `migrateState()` | `BC` | Migratiepad aanwezig van oudere versies naar v12. |
| Step->final SSOT mapping (`STEP_FINAL_FIELD_BY_STEP_ID`) | Domain mapping contract | `mcp-server/src/core/state.ts` | Impliciet (state-release) | Type-level `satisfies Record<CanonicalStepId, string>` + gebruik via helpers | `Release-coupled` | Geen aparte semver/versietag voor dit sub-contract. |
| UI contract matrix (`NEXT_MENU_BY_ACTIONCODE`, `DEFAULT_MENU_BY_STATUS`, labels) | UI flow/menu contract | `mcp-server/src/core/ui_contract_matrix.ts` | `UI_CONTRACT_VERSION = "2026-02-21-ux-contract-v3-key-first"` | Centrale matrix in code; `buildContractId()` gebruikt SSOT id-builder | `Partieel BC` | Nieuwe/gewijzigde menu/action entries vereisen synchrone runtime updates. |
| UI contract ID formaat (`step:status:menu`) | UI identifier contract | `mcp-server/src/core/ui_contract_id.ts` | Geen expliciete versie | `buildUiContractId()`, `parseUiContractId()`, `validateUiContractIdForStep()` | `Partieel BC` | Parse/validate aanwezig; geen expliciet deprecation/version-beleid. |
| ActionCode registry (`actions`, `menus`, `ui_flags`) | Routing registry contract | `mcp-server/src/core/actioncode_registry.ts` | `ACTIONCODE_REGISTRY_VERSION` (env; fallback `"dev"`) | Statische typed registry (`ActionCodeRegistryShape`) + `actioncode-diff --check` CI-guardrail | `Partieel BC` | Runtime semantiek blijft release-coupled; registry drift wordt contractmatig gecheckt. |
| Step IDs + specialist names (`StepIdZod`, `SpecialistNameZod`) | Core enum contract | `mcp-server/src/contracts/step_ids.ts` | Geen expliciete versie | Zod enums | `Release-coupled` | Uitbreiding van enums kan breaking zijn voor consumers die exhaustiveness aannemen. |
| Step intent union (`StepIntentZod`) | Domain command contract | `mcp-server/src/contracts/intents.ts` | Geen expliciete versie | Zod discriminated union (`type`) | `Release-coupled` | Toevoegen intent-types vergt afstemming met adapters/handlers. |
| Transition event union (`TransitionEventZod`) | Domain event contract | `mcp-server/src/contracts/transitions.ts` | Geen expliciete versie | Zod discriminated union (`type`) | `Release-coupled` | Zelfde compat-risico als intents bij uitbreiding. |
| Rendered action payload (`RenderedActionZod`) | UI payload contract | `mcp-server/src/contracts/ui_actions.ts` | Geen expliciete versie | Zod object + nested `StepIntentZod` | `Release-coupled` | Brede `action_code: z.string()` houdt transport flexibel, maar semantiek elders. |
| Structured turn payload (`StructuredTurnPayloadZod`) | UI content contract | `mcp-server/src/contracts/ui_actions.ts` | Geen expliciete versie | Zod object met optionele `uiHints` | `Partieel BC` | Additieve velden mogelijk; required velden blijven strict. |
| MCP `run_step` input (`RunStepInputSchema`) | MCP tool API input | `mcp-server/server.ts`, `mcp-server/src/handlers/ingress.ts` | Impliciet (release) | `RunStepArgsSchema.extend(...)`; state-canonicalization via `canonicalizeStateForRunStepArgs` | `Partieel BC` | Ingress is SSOT voor transient allowlist + idempotency-key normalisatie. |
| MCP `run_step` output (`ToolStructuredContentOutputSchema`) | MCP tool API output | `mcp-server/server.ts` | `model_result_shape_version = "v2_minimal"` binnen result | MCP SDK `validateToolOutput()` + expliciete parse op lokale `/run_step` bridge (`ToolStructuredContentOutputSchema.parse`) | `Partieel BC` | Basisminima strict, extra velden toegestaan; transport-pariteit afgedwongen. |
| Widget render-state SSOT (`_meta.widget_result` + ordering tuple) | UI render authority contract | `mcp-server/ui/step-card.bundled.html`, `mcp-server/src/server/http_routes.ts`, `mcp-server/src/server/run_step_transport.ts` | Impliciet (ADR-006 policy) | Contract-tests op runtime authority wrappers en server ownership | `Partieel BC` | Legacy `root.result` en `_widget_result` zijn expliciet non-authority. |
| View/bootstrap diagnostics contract (`view_contract_version`) | Runtime diagnostics contract | `mcp-server/src/core/bootstrap_runtime.ts` + `mcp-server/server.ts` | `VIEW_CONTRACT_VERSION = "v3_ssot_rigid"` | `attachBootstrapDiagnostics()` zet versie in `state` + `ui.flags` | `Partieel BC` | Contract is operationeel, maar formele compatmatrix ontbreekt. |
| `run_step` idempotency/replay ownership | Runtime execution contract | `mcp-server/server.ts` (owner), `mcp-server/src/handlers/run_step_runtime.ts` (fallback buiten server-owned calls) | Impliciet (release) | Server markeert `__idempotency_registry_owner="server"`; runtime registry checkt alleen als owner niet server is | `Partieel BC` | Voorkomt dubbele registry-handhaving op MCP/local-dev server-pad, behoudt directe-runtime compat. |

## Operationele telemetry-koppeling (playbook)

Voor on-call incidentdetectie op contractbreuk gelden minimaal deze events/ratio's:

- `run_step_response` (succesvolume en accept reason-codes)
- `run_step_error` (foutvolume + error classificatie)
- `stale_bootstrap_payload_dropped` (ordering/concurrency drift)
- `unknown_action_code` (registry/UI contract drift)

Referentie playbook: [docs/operations_failure_playbook.md](../../../docs/operations_failure_playbook.md)

## Infra verificatie (Agent 6C)

- `aws apprunner describe-service` (service `business-canvas-mcp`, `us-east-1`) bevestigt:
  - autoscaling summary: `DefaultConfiguration` revision `1` (ARN aanwezig),
  - observability: `ObservabilityEnabled=true`, `DefaultConfiguration` revision `1` (ARN aanwezig),
  - instance role actief: `arn:aws:iam::559050238376:role/AppRunnerBusinessCanvasMcpInstanceRole`.
  - secret hygiene opgelost: `OPENAI_API_KEY` staat niet meer in `RuntimeEnvironmentVariables` en staat in `RuntimeEnvironmentSecrets`.
  - `PUBLIC_BASE_URL` blijft expliciet plain env var.
- `aws apprunner describe-auto-scaling-configuration` bevestigt:
  - `MaxConcurrency=100`, `MinSize=1`, `MaxSize=25`, status `active`.
- `aws apprunner describe-observability-configuration` bevestigt:
  - observability status `ACTIVE`, trace vendor `AWSXRAY`.

## Onzekerheden / blockers (actueel)

- Repo-lokale scan (2026-02-26): buiten `mcp-server` zijn alleen documentatie-referenties gevonden, geen extra runtime-consumer codepaden.
- `Onzeker / te checken`: consumers buiten deze repository blijven onbekend en vragen aparte inventarisatie.

## Handoff naar 6B (ADR-koppeling)

- Koppel elke contractfamilie aan expliciete ADR-owner + versioning policy:
  - State contracts (`core/state.ts`) -> versioning + migratiegaranties.
  - UI contracts (`ui_contract_matrix.ts`, `ui_contract_id.ts`, `bootstrap_runtime.ts`) -> compatregels voor menu/status/contract-id.
  - Tool API contracts (`server.ts`) -> input/output compatbeleid en deprecationpad.
  - Action registry (`actioncode_registry.ts`) -> formele validatie- en release-governance.
- Leg compatregels vast per contract:
  - wat mag additief,
  - wat is breaking,
  - welke CI-gates blokkeren breaking changes.
- Voeg owner-rol toe per contractfamilie (code-owner + reviewverplichting).

## ADR-koppeling ingevuld (Agent 6B)

Overkoepelende mapping: [docs/inventory/contract-adr-inventory.md](../../../docs/inventory/contract-adr-inventory.md)

| Contractfamilie | ADR |
| --- | --- |
| Runtime orchestration boundaries | [ADR-001](../../../docs/adr/ADR-001-runtime-orchestration-boundaries.md) |
| State versioning/migratie + UI/tool compatpolicy | [ADR-002](../../../docs/adr/ADR-002-contract-versioning-policy.md) |
| `run_step` idempotency/replay | [ADR-003](../../../docs/adr/ADR-003-run-step-idempotency-replay.md) |
| Bootstrap/session ordering concurrency | [ADR-004](../../../docs/adr/ADR-004-bootstrap-session-concurrency.md) |
| SSOT governance action/menu/step-final | [ADR-005](../../../docs/adr/ADR-005-ssot-actioncode-governance.md) |
| Widget render-state authority (`_meta.widget_result`) | [ADR-006](../../../docs/adr/ADR-006-widget-result-ssot.md) |
