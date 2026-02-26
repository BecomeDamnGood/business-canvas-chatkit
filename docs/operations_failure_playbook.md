# MCP Observability + Failure Playbook

Bijgewerkt op: 2026-02-26  
Scope: `mcp-server/server.ts` + `mcp-server/src/handlers/*` runtime pad.

## Doel

Snelle detectie, triage en herstel van runtime failures in `run_step`, met eenduidige logging en endpoint checks.

## Structured Logging Contract

Kernvelden voor alle operationele events:

- `event`
- `severity`
- `correlation_id`
- `trace_id`
- `session_id`
- `step_id`
- `contract_id`

Belangrijke events voor detectie:

- `mcp_request_received`, `mcp_request_error`
- `run_step_request`, `run_step_response`, `run_step_error`
- `run_step_render_source_selected`
- `contract_decision`, `legacy_preflight_blocked`
- `idempotency_conflict`, `idempotency_replay_inflight`, `idempotency_replay_served`
- `stale_bootstrap_payload_rebased`, `stale_bootstrap_payload_dropped`, `host_session_mismatch_dropped`
- `run_step_llm_call`, `transient_fallback_returned`
- `unknown_action_code`, `session_token_log_write_failed`

Belangrijke lifecycle reason-codes:

- `accept_reason_code`: `accepted_fresh_dispatch`, `accepted_after_stale_rebase`
- `drop_reason_code`: `host_session_mismatch`, `stale_rebase_state_missing`, `stale_action_not_rebase_eligible`, `stale_rebase_flag_disabled`
- `rebase_reason_code`: `stale_interactive_action_rebased`
- `render_source_reason_code`: `meta_widget_result_authoritative`, `structured_content_result_fallback`, `render_source_missing`

## Rollout Flags (Step 7)

| Flag | Default | Effect | Canary use |
| --- | --- | --- | --- |
| `RUN_STEP_STALE_INGEST_GUARD_V1` | `false` | Zet stale ingest detection (`stale_bootstrap_payload_*`) aan/uit. | Eerst op canary aanzetten, daarna breed uitrollen. |
| `RUN_STEP_STALE_REBASE_V1` | `false` | Staat stale interactive rebase (`ACTION_START`) toe als ingest guard actief is. | Pas aanzetten nadat ingest guard stabiel is. |

Belangrijk:
- `RUN_STEP_STALE_REBASE_V1` heeft alleen effect als `RUN_STEP_STALE_INGEST_GUARD_V1=true`.
- Controleer actuele flag-stand via `GET /diagnostics` (`runtime.rollout_flags`).
- Fallback voor oudere live builds zonder `runtime.rollout_flags`: controleer App Runner `RuntimeEnvironmentVariables` via `aws apprunner describe-service`.

## Canary KPI's + Alertdrempels

Meetvenster: rolling 15 min, met alert als drempel 2 vensters op rij overschreden wordt.

| KPI | Query/bron | Drempel |
| --- | --- | --- |
| Stale drop ratio | `count(stale_bootstrap_payload_dropped) / count(run_step_request)` | `> 2%` = alert |
| Host mismatch ratio | `count(host_session_mismatch_dropped) / count(run_step_request)` | `> 0.5%` = alert |
| Rebase accept ratio | `count(run_step_response where accept_reason_code=accepted_after_stale_rebase) / count(run_step_response)` | `> 5%` = alert |
| Runtime error ratio | `count(run_step_error) / count(run_step_request)` | `> 1%` = alert |
| Stale rebase disabled drops | `count(stale_bootstrap_payload_dropped where drop_reason_code=stale_rebase_flag_disabled)` | stijgende trend tijdens fase met `RUN_STEP_STALE_REBASE_V1=true` = rollback check |

## Rollback Procedure (Canary/Prod)

1. Zet `RUN_STEP_STALE_REBASE_V1=false` en deploy.
2. Controleer 10 minuten:
   - `accepted_after_stale_rebase` daalt naar `0`.
   - `run_step_error` terug onder drempel.
3. Blijft incident actief: zet ook `RUN_STEP_STALE_INGEST_GUARD_V1=false` en deploy.
4. Verifieer met `GET /diagnostics` dat `runtime.rollout_flags` de verwachte stand toont (of gebruik App Runner env-var fallback als dat veld ontbreekt).
5. Sluit incident pas na 30 minuten stabiele KPI's onder drempel.

## Ops Endpoints

- `GET /health|/healthz|/ready`: readiness + versievelden + `correlation_id` + `trace_id` + `diagnostics_endpoint`.
- `GET /version`: plain-text build/contract versions.
- `GET /diagnostics`: runtime snapshot met registry counts, limits, memory, uptime, `correlation_id`, `trace_id`.

## Top 10 Failure Modes (On-call uitvoerbaar)

Per mode: trigger/symptoom, detectie met exacte telemetry, eerste mitigatie en duurzame fix.

### 1) Ongeldige `run_step` payload (`invalid_run_step_payload` / `invalid_json`)
- Trigger/symptoom: call faalt direct zonder specialist-uitvoering.
- Detectie:
  - Log events: `run_step_error` met `error_code=invalid_run_step_payload` of `error_code=invalid_json`.
  - Metric: `count(run_step_error where error_code in [invalid_run_step_payload, invalid_json]) / count(run_step_request)`.
- Eerste mitigatie: request opnieuw sturen met gevalideerde payload en nieuwe `idempotency_key`.
- Duurzame fix: client-side schema pre-validate in build/runtime en contract test op ingress.
- ADR/contract: [ADR-002](./adr/ADR-002-contract-versioning-policy.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (MCP `run_step` input).

### 2) Legacy/state contract block (`session_upgrade_required` / `invalid_state`)
- Trigger/symptoom: run wordt geblokkeerd vóór verdere verwerking.
- Detectie:
  - Log events: `legacy_preflight_blocked` met `blocking_marker_class`.
  - Metric: `count(legacy_preflight_blocked) / count(run_step_request)`.
- Eerste mitigatie: forceer nieuwe sessie/startflow en herhaal stap.
- Duurzame fix: migration-path en compat-window aanscherpen zodat oude state niet opnieuw opduikt.
- ADR/contract: [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md), [ADR-002](./adr/ADR-002-contract-versioning-policy.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (state schema + tool input).

### 3) Contract violation na specialist call (`contract_violation`)
- Trigger/symptoom: response komt terug maar contract-check breekt.
- Detectie:
  - Log events: `run_step_error` met `error.type=contract_violation`; vaak in combinatie met `contract_decision`.
  - Metric: `count(run_step_error where error.type=contract_violation) / count(run_step_request)`.
- Eerste mitigatie: sessie resetten naar laatste stabiele checkpoint en stap opnieuw uitvoeren.
- Duurzame fix: aanvullende contract guard tests op decision/render pad, fail-closed gedrag behouden.
- ADR/contract: [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md), [ADR-005](./adr/ADR-005-ssot-actioncode-governance.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (UI contract matrix + action registry).

### 4) Unknown action code (`unknown_action_code`)
- Trigger/symptoom: UI-actie wordt niet gerouteerd.
- Detectie:
  - Log events: `unknown_action_code` (met action/menu context), mogelijk gevolgd door `run_step_error`.
  - Metric: `count(unknown_action_code) / count(run_step_request)`.
- Eerste mitigatie: laat user terugvallen op bekende default-menu actie en herstart de stap.
- Duurzame fix: registry/matrix drift oplossen en release-gate afdwingen voor niet-geregistreerde action codes.
- ADR/contract: [ADR-005](./adr/ADR-005-ssot-actioncode-governance.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (ActionCode registry + UI matrix).

### 5) Idempotency conflict (`idempotency_conflict`)
- Trigger/symptoom: dezelfde key met afwijkende payload.
- Detectie:
  - Log events: `idempotency_conflict`.
  - Metric: `count(idempotency_conflict) / count(run_step_request)`.
- Eerste mitigatie: nieuwe `idempotency_key` genereren en call opnieuw sturen.
- Duurzame fix: key-strategie op client en retries eenduidig maken (payload-bound key policy).
- ADR/contract: [ADR-003](./adr/ADR-003-run-step-idempotency-replay.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (`run_step` idempotency ownership).

### 6) Idempotency inflight replay (`idempotency_replay_inflight`)
- Trigger/symptoom: dubbele klik/retry terwijl eerste call nog draait.
- Detectie:
  - Log events: `idempotency_replay_inflight` (evt. later `idempotency_replay_served`).
  - Metric: `count(idempotency_replay_inflight) / count(run_step_request)`.
- Eerste mitigatie: wacht op lopende turn-completion en hergebruik dezelfde key zonder payload-wijziging.
- Duurzame fix: single-flight in UI/host, debounce op action triggers.
- ADR/contract: [ADR-003](./adr/ADR-003-run-step-idempotency-replay.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (`run_step` idempotency ownership).

### 7) Stale bootstrap payload dropped (`stale_bootstrap_payload_dropped`)
- Trigger/symptoom: oudere epoch/seq arriveert na een nieuwere response.
- Detectie:
  - Log events: `stale_bootstrap_payload_dropped` met `drop_reason_code` (bijv. `stale_action_not_rebase_eligible`).
  - Metric: `count(stale_bootstrap_payload_dropped) / count(run_step_request)`.
- Eerste mitigatie: niets toepassen uit stale payload; gebruiker op laatste snapshot laten doorgaan.
- Duurzame fix: ordering tuple discipline en stale rebase policy uniform maken in alle producers.
- ADR/contract: [ADR-004](./adr/ADR-004-bootstrap-session-concurrency.md), [ADR-006](./adr/ADR-006-widget-result-ssot.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (widget render-state SSOT).

### 8) Host session mismatch (`host_session_mismatch_dropped`)
- Trigger/symptoom: payload hoort bij andere `host_widget_session_id`.
- Detectie:
  - Log events: `host_session_mismatch_dropped`.
  - Metric: `count(host_session_mismatch_dropped) / count(run_step_request)`.
- Eerste mitigatie: host-session hard resetten en widget opnieuw bootstrappen.
- Duurzame fix: session ownership handshake expliciet afdwingen in host bridge.
- ADR/contract: [ADR-004](./adr/ADR-004-bootstrap-session-concurrency.md), [ADR-006](./adr/ADR-006-widget-result-ssot.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (bootstrap/session ordering).

### 9) LLM transient failure (rate limit/timeout/netwerk)
- Trigger/symptoom: specialist-call slaagt niet; fallback antwoord mogelijk.
- Detectie:
  - Log events: `run_step_llm_call` met `ok=false` en `error_type in [rate_limit, timeout, network]`, plus `transient_fallback_returned`.
  - Metric: `count(run_step_llm_call where ok=false) / count(run_step_request)`.
- Eerste mitigatie: gecontroleerde retry met dezelfde user intent na korte backoff.
- Duurzame fix: model routing, timeout tuning, quota/circuit-breaker instellingen verbeteren.
- ADR/contract: [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md), [ADR-003](./adr/ADR-003-run-step-idempotency-replay.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (MCP `run_step` output + runtime orchestration).

### 10) Interne serverfout / onverwachte exception
- Trigger/symptoom: request faalt zonder herstelpad.
- Detectie:
  - Log events: `run_step_error` of `mcp_request_error` (`error_severity=fatal`), met daling in `run_step_response`.
  - Metric: `count(run_step_error) / count(run_step_request)` en `count(run_step_response) / count(run_step_request)`.
- Eerste mitigatie: sessie reset/hard refresh; bij ratio boven drempel canary rollback procedure uitvoeren.
- Duurzame fix: root-cause analyse met invariants/contract tests op het falende pad.
- ADR/contract: [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md), [ADR-002](./adr/ADR-002-contract-versioning-policy.md), [Contract inventory](../mcp-server/docs/contracts/contract-purity-inventory.md) (tool API input/output + state schema).

## Koppeling Naar Contract Inventory / ADR

- Contractfamilie mapping: [contract-adr-inventory.md](./inventory/contract-adr-inventory.md)
- Contract-overzicht: [contract-purity-inventory.md](../mcp-server/docs/contracts/contract-purity-inventory.md)
- ADRs:
  - [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md)
  - [ADR-002](./adr/ADR-002-contract-versioning-policy.md)
  - [ADR-003](./adr/ADR-003-run-step-idempotency-replay.md)
  - [ADR-004](./adr/ADR-004-bootstrap-session-concurrency.md)
  - [ADR-005](./adr/ADR-005-ssot-actioncode-governance.md)
  - [ADR-006](./adr/ADR-006-widget-result-ssot.md)
