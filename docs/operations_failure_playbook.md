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
- `contract_decision`, `legacy_preflight_blocked`
- `idempotency_conflict`, `idempotency_replay_inflight`, `idempotency_replay_served`
- `stale_bootstrap_payload_dropped`, `host_session_mismatch_dropped`
- `run_step_llm_call`, `transient_fallback_returned`
- `unknown_action_code`, `session_token_log_write_failed`

## Ops Endpoints

- `GET /health|/healthz|/ready`: readiness + versievelden.
- `GET /version`: plain-text build/contract versions.
- `GET /diagnostics`: runtime snapshot met registry counts, limits, memory, uptime, `correlation_id`, `trace_id`.

## Top 10 Failure Modes

| # | Failure mode | Trigger/symptoom | Detectie (log event/metric) | Eerste mitigatie | Duurzame fix-richting | ADR/Inventory |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Ongeldige tool payload | `run_step` faalt direct op schema | `error_code=invalid_run_step_payload` of `invalid_json` | Payload opnieuw sturen met geldig schema | Contract-validatie in client buildstep | ADR-002, Tool API in inventory |
| 2 | Legacy/state contract block | Session krijgt `session_upgrade_required`/`invalid_state` | `legacy_preflight_blocked`, `blocking_marker_class` | Sessiestate resetten, nieuwe run starten | Strakkere migratie- en compatpolicy | ADR-002, ADR-001 |
| 3 | Render/contract violation na specialist call | Error `contract_violation` in payload | `error.type=contract_violation`, `contract_decision` | Herstart sessie voor schone state | Meer contract guard tests + recovery pad | ADR-001, ADR-005 |
| 4 | Idempotency conflict | Zelfde key met andere payload | `idempotency_conflict` | Nieuwe idempotency key genereren | Client-side key-strategie expliciet maken | ADR-003 |
| 5 | Idempotency inflight collision | Dubbele click/retry tijdens lopende turn | `idempotency_replay_inflight` | Zelfde key later opnieuw proberen | UI debounce + single-flight policy | ADR-003 |
| 6 | Stale bootstrap payload | Oude epoch/seq komt later binnen | `stale_bootstrap_payload_dropped` | Laatste snapshot renderen, geen oude payload toepassen | Volgorde/ordering policy afdwingen in alle clients | ADR-004 |
| 7 | Host widget session mismatch | Payload van andere host session | `host_session_mismatch_dropped` | Nieuwe sessie forceren in host | Session ownership expliciet koppelen | ADR-004 |
| 8 | LLM rate limit (transient infra) | 429/rate-limit van model call | `run_step_llm_call` met `ok=false` + `error_type` rate-limit, `transient_fallback_returned` | Retry met dezelfde actie na wachttijd | Model routing en quota tuning | ADR-003 (retry gedrag), ADR-001 |
| 9 | LLM timeout/netwerktransient | Timeout of netwerkfout op specialist call | `run_step_llm_call` + `error_type=timeout`, `transient_fallback_returned` | Retry dezelfde actie | Timeouts + circuit-breaker tuning | ADR-001 |
| 10 | Interne serverfout | Onverwachte exception in runtime/server | `run_step_error` of `mcp_request_error` (`error_severity=fatal`) | Hard refresh of sessie reset | Root-cause fix met extra contract/invariant tests | ADR-001, ADR-002 |

## Koppeling Naar Contract Inventory / ADR

- Contractfamilie mapping: [contract-adr-inventory.md](./inventory/contract-adr-inventory.md)
- Contract-overzicht: [contract-purity-inventory.md](../mcp-server/docs/contracts/contract-purity-inventory.md)
- ADRs:
  - [ADR-001](./adr/ADR-001-runtime-orchestration-boundaries.md)
  - [ADR-002](./adr/ADR-002-contract-versioning-policy.md)
  - [ADR-003](./adr/ADR-003-run-step-idempotency-replay.md)
  - [ADR-004](./adr/ADR-004-bootstrap-session-concurrency.md)
  - [ADR-005](./adr/ADR-005-ssot-actioncode-governance.md)
