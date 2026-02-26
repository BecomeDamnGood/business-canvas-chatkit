# ADR-002: Contract versioning policy voor state/ui/tool

- Status: Accepted
- Datum: 2026-02-26
- Owners: contract owners per familie + reviewer uit runtime team
- Gerelateerde contractfamilies: state, UI contract matrix/id, MCP tool input/output

## Context

De audit en 6A inventory tonen mixed versioning: deels expliciet (`CURRENT_STATE_VERSION`, `UI_CONTRACT_VERSION`), deels implicit release-coupled.

## Besluit

- Elke contractfamilie krijgt expliciete versie-identificatie:
  - State: `CURRENT_STATE_VERSION`.
  - UI: `UI_CONTRACT_VERSION` en `VIEW_CONTRACT_VERSION`.
  - Tool API: `model_result_shape_version` + schema-change log.
- Compatklasse per wijziging is verplicht: `additive`, `behavioral`, `breaking`.
- Breaking wijzigingen vereisen:
  - migratie of fallback pad,
  - release note met impact,
  - expliciete approval van contract owner.

## Compatibiliteit

- Additief toegestaan: nieuwe optionele velden of nieuwe enum-waarden met fallback.
- Breaking wijziging: required veldwijziging, contract-id semantiekwijziging, verwijderde outputvelden.
- Deprecatiepad: minimaal 1 release dual-support voor consumers buiten `mcp-server`.

## Enforcement

- Code enforcement: versies als constante in owner-module; geen verborgen versies in businesslogica.
- CI gates: schema diff check + compat classificatie in PR template/checklist.

## Gevolgen

Versioning wordt expliciet en traceerbaar in code en docs, met minder release-coupled verrassingen.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Relevante modules:
  - `mcp-server/src/core/state.ts`
  - `mcp-server/src/core/ui_contract_matrix.ts`
  - `mcp-server/src/core/ui_contract_id.ts`
  - `mcp-server/src/core/bootstrap_runtime.ts`
  - `mcp-server/server.ts`

