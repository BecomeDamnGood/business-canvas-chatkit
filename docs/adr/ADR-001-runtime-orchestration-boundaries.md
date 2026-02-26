# ADR-001: Runtime orchestration boundaries en ownership

- Status: Accepted
- Datum: 2026-02-26
- Owners: `mcp-server` runtime maintainers
- Gerelateerde contractfamilies: runtime ingress/output en orchestrator output

## Context

De audit benoemt onduidelijke grenzen tussen facade, runtime-orchestratie en contract-enforcement. Dat verhoogt regressierisico bij refactors.

## Besluit

- `handlers/run_step.ts` blijft dunne facade (delegatie + minimale guarding).
- `handlers/run_step_runtime.ts` is de enige orchestrator voor turn-flow sequencing.
- `handlers/ingress.ts` is eigenaar van input parsing en normalisatie.
- `handlers/turn_contract.ts` is eigenaar van output contract parity checks.
- `core/orchestrator.ts` beheert domein-output en transitievolgorde, niet MCP transportdetails.

## Compatibiliteit

- Additief toegestaan: nieuwe interne helpers binnen dezelfde boundary.
- Breaking wijziging: verplaatsen van contract-enforcement naar andere lagen zonder ADR update.
- Deprecatiepad: eerst dual-path met parity assertions, daarna oude pad verwijderen.

## Enforcement

- Code enforcement: imports blijven unidirectioneel (facade -> runtime -> domain/helpers).
- CI gates: contract parity tests op `assertRunStepContractOrThrow` en smoke op `run_step`.

## Gevolgen

Heldere owner-grenzen, lagere kans op regressie door cross-layer wijzigingen.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Relevante modules:
  - `mcp-server/src/handlers/run_step.ts`
  - `mcp-server/src/handlers/run_step_runtime.ts`
  - `mcp-server/src/handlers/ingress.ts`
  - `mcp-server/src/handlers/turn_contract.ts`

