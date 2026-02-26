# ADR-003: Idempotency en replay-semantiek voor MCP `run_step`

- Status: Accepted
- Datum: 2026-02-26
- Owners: runtime orchestratie + ingress owners
- Gerelateerde contractfamilies: MCP `run_step` input/output, ingress markers, transition events

## Context

Bij retries en dubbele verzoeken moet `run_step` voorspelbaar blijven. Zonder expliciete semantiek ontstaan inconsistenties in state en UI.

## Besluit

- `run_step` hanteert at-least-once transport, maar exactly-once effect op state-transition per turn key.
- Ingress verwerkt idempotency markers fail-closed:
  - ontbrekende/ongeldige marker -> reject of safe fallback volgens policy.
- Replay van dezelfde turn key mag geen extra side effects uitvoeren.
- Output contract behoudt deterministische structuur voor dezelfde input + state snapshot.

## Compatibiliteit

- Additief toegestaan: extra observabilityvelden in output (`passthrough`), zonder semantische wijziging.
- Breaking wijziging: aangepaste turn-key definitie of replaygedrag zonder migratiemechanisme.
- Deprecatiepad: dual-evaluation met telemetry voordat policy-striktheid wordt verhoogd.

## Enforcement

- Code enforcement: centrale idempotency checks in ingress/runtime, niet verspreid per step.
- CI gates: replay regression tests (zelfde input tweemaal) en invariant checks op output parity.

## Gevolgen

Retry-veilig gedrag met stabiele contracten en minder dubbele state-mutaties.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Relevante modules:
  - `mcp-server/src/handlers/ingress.ts`
  - `mcp-server/src/handlers/run_step_runtime.ts`
  - `mcp-server/src/contracts/transitions.ts`
  - `mcp-server/server.ts`

