# ADR-004: Concurrency model voor bootstrap en session ordering

- Status: Accepted
- Datum: 2026-02-26
- Owners: bootstrap/runtime owners
- Gerelateerde contractfamilies: bootstrap diagnostics, session state, UI contract id/status

## Context

Bootstrap payloads en sessie-updates kunnen elkaar kruisen. De audit noemt ontbrekende afspraken over ordering/concurrency.

## Besluit

- Session verwerking is single-writer per session id binnen runtime-flow.
- Nieuwe updates worden geordend op monotone sequence/turn-order; stale payloads worden gedropt.
- Bootstrap diagnostics (`view_contract_version` en flags) mogen geen oudere state overschrijven.
- UI contract id wordt altijd afgeleid uit actuele state na ordering-beslissing.

## Compatibiliteit

- Additief toegestaan: extra diagnostische flags zonder gedrag te veranderen.
- Breaking wijziging: verandering in ordering-regel die bestaande replay/resultaatvolgorde wijzigt.
- Deprecatiepad: shadow mode logging van oud vs nieuw orderingbeleid voordat hard switch plaatsvindt.

## Enforcement

- Code enforcement: ordering checks gecentraliseerd in runtime/bootstrap paden.
- CI gates: concurrency tests met out-of-order events en stale bootstrap cases.

## Gevolgen

Minder race conditions en betere reproduceerbaarheid van UI/status transities.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Relevante modules:
  - `mcp-server/src/core/bootstrap_runtime.ts`
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts`
  - `mcp-server/src/handlers/run_step_runtime.ts`
  - `mcp-server/src/core/ui_contract_id.ts`

