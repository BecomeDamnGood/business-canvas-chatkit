# Contract-ADR Inventory Koppeling

Bijgewerkt op: 2026-02-26  
Bron contract inventory (Agent 6A): [mcp-server/docs/contracts/contract-purity-inventory.md](../../mcp-server/docs/contracts/contract-purity-inventory.md)

## Doel

Expliciete traceability tussen contractfamilies en ADR-besluiten.

## Mapping

| Contractfamilie | Primair owner-module(s) | ADR-koppeling | Versiebeleid (kort) | CI/Enforcement focus |
| --- | --- | --- | --- | --- |
| Runtime orchestration boundaries | `handlers/run_step.ts`, `handlers/run_step_runtime.ts`, `handlers/ingress.ts`, `handlers/turn_contract.ts` | [ADR-001](../adr/ADR-001-runtime-orchestration-boundaries.md) | Boundary-stabiel; wijzigingen via ADR | Parity asserts + runtime smoke |
| State contracts en migratie | `core/state.ts` | [ADR-002](../adr/ADR-002-contract-versioning-policy.md) | `CURRENT_STATE_VERSION` + migratiepad | `normalizeState`/`migrateState` checks |
| UI contract matrix/id/bootstrap | `core/ui_contract_matrix.ts`, `core/ui_contract_id.ts`, `core/bootstrap_runtime.ts` | [ADR-002](../adr/ADR-002-contract-versioning-policy.md), [ADR-004](../adr/ADR-004-bootstrap-session-concurrency.md), [ADR-005](../adr/ADR-005-ssot-actioncode-governance.md) | Expliciete UI/view versies + compatclassificatie | Matrix consistency + stale-order tests |
| Tool API input/output (`run_step`) | `server.ts`, `handlers/ingress.ts` | [ADR-002](../adr/ADR-002-contract-versioning-policy.md), [ADR-003](../adr/ADR-003-run-step-idempotency-replay.md) | Schema versie + deprecatiepad | Ingress-schema SSOT + server-side replay guard |
| Transport outputSchema enforcement (`run_step`) | `server.ts`, `src/mcp_app_contract.test.ts` | [ADR-002](../adr/ADR-002-contract-versioning-policy.md) | Zelfde output-schema op alle transportpaden | MCP SDK output-validate + lokale `/run_step` bridge parse |
| Idempotency/replay en transities | `server.ts`, `handlers/ingress.ts`, `contracts/transitions.ts` | [ADR-003](../adr/ADR-003-run-step-idempotency-replay.md) | Turn-key semantiek expliciet | Registry ownership op server-pad; runtime fallback alleen buiten server-owned calls |
| Bootstrap/session ordering | `core/bootstrap_runtime.ts`, `handlers/run_step_i18n_runtime.ts` | [ADR-004](../adr/ADR-004-bootstrap-session-concurrency.md) | Ordered processing policy | Out-of-order/stale payload tests |
| SSOT action/menu/step-final | `core/actioncode_registry.ts`, `core/ui_contract_matrix.ts`, `core/state.ts` | [ADR-005](../adr/ADR-005-ssot-actioncode-governance.md) | Registry/matrix wijziging met compatclassificatie | Registry diff + fail-closed checks |
| Observability/logging/diagnostics | `server.ts`, `handlers/run_step_response.ts`, `handlers/run_step_preflight.ts`, `handlers/specialist_dispatch.ts` | [ADR-001](../adr/ADR-001-runtime-orchestration-boundaries.md), [ADR-003](../adr/ADR-003-run-step-idempotency-replay.md), [ADR-004](../adr/ADR-004-bootstrap-session-concurrency.md) | Structured event schema met `correlation_id` + `trace_id` | Endpoint checks (`/health`,`/ready`,`/diagnostics`) + event-driven failure playbook |

## Governance regels

- Elke nieuwe contractfamilie krijgt in dezelfde PR een ADR-link in deze tabel.
- Elke breaking contractwijziging vereist:
  - ADR update,
  - compatclassificatie (`breaking`),
  - CI-gate update of expliciete motivatie waarom niet nodig.

## Operations referentie

- Failure playbook: [operations_failure_playbook.md](../operations_failure_playbook.md)
