# Hard Refactoring Delete Map - 2026-02-27

- mcp-server/src/handlers/turn_contract.ts
  verwijderd: multi-branch guard patching (`forced_prestart/forced_blocked`, patch flags)
  vervangen door: canonical mode toepassing via `buildCanonicalWidgetState(...)`

- mcp-server/src/handlers/run_step_response.ts
  verwijderd: `run_step_view_contract_guard` + `contract_decision` dual logging
  vervangen door: enkel `run_step_canonical_view_emitted`

- mcp-server/src/handlers/run_step_runtime_action_helpers.ts
  verwijderd: client-facing mode-routering voor `waiting_locale|recovery|failed`
  vervangen door: variant-only helper; mode niet meer hier beslist

- mcp-server/src/handlers/run_step_ui_payload.ts
  verwijderd: verplichte mode/waiting fields in helper-output
  vervangen door: optional view object (variant), mode wordt server-canonical gezet in contract-finalisatie

- mcp-server/ui/lib/locale_bootstrap_runtime.ts
  verwijderd: payload fallback selectie (`root.result`, `structuredContent.result`, direct result)
  vervangen door: strict `_meta.widget_result` ingest

- mcp-server/ui/lib/main.ts
  verwijderd: startup grace wait-shell synthese en empty-payload recovery routing
  vervangen door: pure host-ingest pad

- mcp-server/ui/lib/ui_actions.ts
  verwijderd: start-ack recovery timer/poll orchestration en recovery-mode tuple fail-close envelope
  vervangen door: blocked fail-close + enkel canonical ingest flow

- mcp-server/ui/lib/ui_render.ts
  verwijderd: rendering branches voor `waiting_locale|recovery|failed` en interactive->prestart recovery-switch
  vervangen door: render van canonical `prestart|interactive|blocked`

- mcp-server/src/handlers/__golden__/runtime/waiting_locale.json
  aangepast: expected `ui_view_mode` van `waiting_locale` naar `interactive` onder CORE-only mode set
