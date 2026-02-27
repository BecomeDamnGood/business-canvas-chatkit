# Server Refactor Delete Map - 2026-02-27

## Hard Deletes Applied

1. Legacy render-source fallback as authoritative path
- Removed: `render_source: "structuredContent.result"` branch in MCP tool transport callback.
- Removed: `render_source_reason_code: "structured_content_result_fallback"`.
- Removed: `render_source_reason_code: "render_source_missing"` as acceptable transport path.

2. Silent recovery for missing metadata render source
- Replaced with fail-closed behavior:
  - If `_meta.widget_result` is absent/invalid, transport now throws `meta_widget_result_missing`.
  - A structured error event is emitted, then request is terminated (no fallback authority shift).

3. server.ts monolith boot responsibilities
- Deleted from `mcp-server/server.ts`:
  - in-file MCP registration
  - in-file HTTP routing implementation
  - in-file tuple/idempotency/observability/locale/runtime transport logic
- `server.ts` now only boots via `startServer()` from `src/server/http_routes.ts`.

4. UI runtime fallback selectors and fixtures
- Removed from `mcp-server/ui/lib/locale_bootstrap_runtime.ts`:
  - candidate context `"root.result"` during `_meta.widget_result` selection.
- Removed from `mcp-server/src/ui_render.test.ts`:
  - fallback fixture usage via `fallbackRaw`.
  - fallback-oriented assertions referring to `root.result` / `structuredContent.result`.
- Removed from bundled runtime (`mcp-server/ui/step-card.bundled.html` via rebuild):
  - legacy fallback selector tokens for `root.result` / `structuredContent.result`.

5. Legacy fallback token residue outside transport scope
- Removed/renamed in non-authoritative sources:
  - `mcp-server/src/handlers/run_step_state_update.ts`: `fallbackRaw` -> `secondaryRaw`.
  - `mcp-server/src/mcp_app_contract.test.ts`: test title wording no longer encodes legacy fallback path.
  - `mcp-server/scripts/runtime-smoke.mjs`: assert message no longer references legacy render-source wording.
- Gate hardening:
  - `mcp-server/scripts/server_refactor_gate.mjs` now fails on legacy fallback tokens across `src`, `ui/lib`, `scripts`, and `server.ts` (explicit allowlist for gate source itself).

## Files Introduced For Composition Boundary
- `mcp-server/src/server/run_step_transport.ts`
- `mcp-server/src/server/run_step_transport_context.ts`
- `mcp-server/src/server/run_step_transport_idempotency.ts`
- `mcp-server/src/server/run_step_transport_stale.ts`
- `mcp-server/src/server/run_step_model_result.ts`
- `mcp-server/src/server/server_config.ts`
- `mcp-server/src/server/http_routes.ts`
- `mcp-server/src/server/mcp_registration.ts`
- `mcp-server/src/server/ordering_parity.ts`
- `mcp-server/src/server/idempotency_registry.ts`
- `mcp-server/src/server/observability.ts`
- `mcp-server/src/server/locale_resolution.ts`
- `mcp-server/scripts/server_refactor_gate.mjs`
