# Server Refactor Sweep Manifest - 2026-02-27

Scope: server.ts hard refactor (transport + registration + routing split), SSOT hardening on `_meta.widget_result`, plus UI fallback-pattern purge in tests/runtime.

- [changed] mcp-server/server.ts
- [changed] mcp-server/src/server/server_config.ts
- [changed] mcp-server/src/server/idempotency_registry.ts
- [changed] mcp-server/src/server/ordering_parity.ts
- [changed] mcp-server/src/server/observability.ts
- [changed] mcp-server/src/server/locale_resolution.ts
- [changed] mcp-server/src/server/run_step_model_result.ts
- [changed] mcp-server/src/server/run_step_transport.ts
- [changed] mcp-server/src/server/run_step_transport_context.ts
- [changed] mcp-server/src/server/run_step_transport_idempotency.ts
- [changed] mcp-server/src/server/run_step_transport_stale.ts
- [changed] mcp-server/src/server/mcp_registration.ts
- [changed] mcp-server/src/server/http_routes.ts
- [changed] mcp-server/scripts/server_refactor_gate.mjs
- [changed] mcp-server/package.json
- [changed] mcp-server/src/mcp_app_contract.test.ts
- [changed] mcp-server/src/server_safe_string.test.ts
- [changed] mcp-server/src/ui_render.test.ts
- [changed] mcp-server/ui/lib/locale_bootstrap_runtime.ts
- [changed] mcp-server/ui/step-card.bundled.html
- [reviewed] mcp-server/src/contracts/mcp_tool_contract.ts

Notes:
- `server.ts` is now composition-only bootstrap.
- Render-source authority is fail-closed on `_meta.widget_result` in MCP/local transport flow.
- Legacy render-source reason-codes (`structured_content_result_fallback`, `render_source_missing`) are removed from server transport code.
- `run_step_transport.ts` is orchestration-only and split into context/idempotency/stale modules.
- UI fallback-pattern tokens (`root.result`, `structuredContent.result`, `fallbackRaw`) are removed from `ui_render.test.ts`, `ui/lib/locale_bootstrap_runtime.ts`, and regenerated `ui/step-card.bundled.html`.
- Remaining `structuredContent.result` server match is only in tuple-parity patch logic (`ordering_parity.ts`) and is non-authoritative for render source.
