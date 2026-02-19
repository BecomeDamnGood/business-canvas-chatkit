# Contract Purity Inventory

This inventory captures the final scan state for ActionCode mapping purity.

## Scan scope

- `mcp-server/src/steps/*.ts`
- `mcp-server/docs/**`

## Forbidden patterns

- `ACTION CODE INTERPRETATION`
- `ACTION_* -> "__ROUTE__...__"` and `ACTION_* → "__ROUTE__...__"`
- `ACTION_* -> "yes"` and `ACTION_* → "yes"`
- `When USER_MESSAGE contains an ActionCode`
- `Map ActionCodes to route tokens`

## Result matrix

| Scope | File(s) | Forbidden pattern hits | Classification |
| --- | --- | ---: | --- |
| Runtime step prompts | `mcp-server/src/steps/*.ts` | 0 | `runtime_relevant` |
| Historical docs | `mcp-server/docs/BACKUP-v92.md` | Present (historical references only) | `historical_doc` |

## Governance rule

- Runtime purity is enforced by CI via `mcp-server/scripts/contract-purity-check.mjs`.
- Historical docs are allowed to reference old systems, but they are not normative.
