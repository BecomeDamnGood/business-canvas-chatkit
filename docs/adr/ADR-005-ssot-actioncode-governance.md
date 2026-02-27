# ADR-005: SSOT governance voor action/menu/step-final mappings

- Status: Accepted
- Datum: 2026-02-26
- Owners: UI contract + action registry owners
- Gerelateerde contractfamilies: actioncode registry, UI contract matrix/id, step-final mapping

## Context

6A handoff vraagt expliciete governance voor registry-validatie, compatregels en owner-verantwoordelijkheid. De audit benoemt SSOT governance als ontbrekende beslissing.

## Besluit

- `core/actioncode_registry.ts` en `core/ui_contract_matrix.ts` vormen samen SSOT voor actie/menu-routes.
- `STEP_FINAL_FIELD_BY_STEP_ID` blijft SSOT voor step->final veldkoppeling.
- Elke wijziging in action/menu mapping vereist:
  - update van registry of matrix,
  - compatclassificatie,
  - update van contract inventory link.
- Fail-closed gedrag blijft standaard voor ongeldige menu/action combinaties.

## Compatibiliteit

- Additief toegestaan: nieuwe action code met expliciete default/fallback route.
- Breaking wijziging: verwijderen/hernoemen van bestaande action code of menu zonder fallback.
- Deprecatiepad: markeer legacy route tokens eerst als deprecated, verwijder pas na afgesproken release window.

## Enforcement

- Code enforcement: typed registry shape + centrale menu/action resolutie.
- CI gates: snapshot/diff checks voor registry + UI contract matrix consistency checks.

## Gevolgen

Betere traceability en minder drift tussen UI menus, action codes en final field routing.

## Links

- Contract inventory: [contract-adr-inventory](../inventory/contract-adr-inventory.md)
- Relevante modules:
  - `mcp-server/src/core/actioncode_registry.ts`
  - `mcp-server/src/core/ui_contract_matrix.ts`
  - `mcp-server/src/core/state.ts`
