# MCP App Compliance Checklist

## 1) Tool contract schemas
- [x] Public MCP tools use schema-driven input validation.
- [x] Public MCP tools use schema-driven structured output validation.
- [x] Tool schema ownership is centralized in `src/contracts/mcp_tool_contract.ts`.

## 2) Versioning and compatibility
- [x] Tool input schema version is explicit and exported.
- [x] Tool output schema version is explicit and exported.
- [x] Compatibility policy is explicit and exposed.
- [x] Version endpoint exposes tool contract versions.

## 3) Deterministic core boundaries
- [x] Route orchestration consumes presentation write-side through a single adapter port.
- [x] Core/route logic remains deterministic given the same adapter outputs.

## 4) Retry and idempotency safety
- [x] Write-side presentation artifacts use deterministic fingerprinted filenames.
- [x] Duplicate artifact generation is conflict-safe (existing-file reuse / rename handling).
- [x] Repeated conversion steps reuse existing outputs when available.

## 5) Security and logging hygiene
- [x] Structured logs redact secret-bearing keys.
- [x] Structured logs redact token-like secret values.
- [x] Presentation route logs avoid leaking filesystem details.

## 6) Automated enforcement
- [x] Compliance gate script enforces checklist completion.
- [x] Compliance gate script validates key MCP contract anchors in source.
- [x] CI runs the MCP app compliance gate.
