# UI Interface & Button Contract (Canonical)

Status: Active (normatief, 2026-03-01 alignment)

This document is the single canonical source of truth for the widget ↔ backend contract.
Historical runlogs and rollout journals are explicitly archival and non-normative.

## 1) Widget → /mcp Request (tools/call: run_step)

Transport envelope:
- `POST /mcp`
- Headers: `accept: application/json, text/event-stream` and `content-type: application/json`
- JSON-RPC body:
  - `jsonrpc`: `"2.0"`
  - `method`: `"tools/call"`
  - `params.name`: `"run_step"`
  - `params.arguments`: run_step input payload

Required fields (widget mode):
- `input_mode`: "widget" (chat clients use "chat").
- `current_step_id`: current step identifier (e.g. `step_0`).
- `user_message`: ActionCode string for action dispatches, or free-text user input for text submit.
- `state`: session state object (opaque to the widget).

Notes:
- Button/choice/start dispatches must send ActionCodes.
- Free-text submits send plain text in `user_message`.

## 2) /mcp Response Contract (tools/call result)

Success (JSON-RPC `result`):
- `result.structuredContent.result.ok`: `true`
- `result.structuredContent.result.tool`: `"run_step"`
- `result.structuredContent.result.state`: canonical session state
- `result.structuredContent.result.ui`: canonical UI payload
  - `view.mode`: one of `prestart | interactive | waiting_locale | recovery | blocked | failed`
  - `action_contract.actions[]`: canonical action descriptors
- `result._meta.widget_result`: volledige widget payload (authoritative render source)

Error:
- Transport/JSON-RPC failures: top-level `error` object.
- Tool-level failures: `result.structuredContent.result.ok = false` met `error` object (`type`, `user_message`, optional retry metadata).

## 3) Static Serving & Ownership

- Runtime UI source of truth: `ui/step-card.bundled.html`.
- UI endpoint: `/ui/step-card` serves the bundled runtime file.
- Server owns all flow/intelligence decisions and all user-facing copy decisions.
- The widget is a dumb renderer only.

## 4) Rendering Rules (Fail-Closed)

- Authoritative render-state source is `_meta.widget_result` only.
- Widget must not use `root.result`, `structuredContent.result`, or alternate wrappers as render truth-source.
- Widget must render only server-emitted fields from `_meta.widget_result`.
- Missing required contract fields must fail-closed with a technical contract error marker.
- Widget must not invent fallback narratives when fields are missing.

## 5) Action Rules

- Canonical action source: `ui.action_contract.actions`.
- Actions without valid `action_code` are invalid and must not be dispatched.
- Routing/flow decisions are server-owned; client does not infer step or intent.

## 6) i18n Rules

- Widget does not perform locale negotiation.
- Widget only renders server-provided strings from state payload.
- No client-side language fallback selection.

## 7) Security Rendering Rules

- Never use `innerHTML` for LLM/tool output.
- Render text content only (escaped/plain text).
- Treat all payload text as untrusted.

## 8) Ordering Tuple Authority

Authoritative ordering tuple (from `_meta.widget_result.state`):
- `bootstrap_session_id`
- `bootstrap_epoch`
- `response_seq`
- `host_widget_session_id`

This tuple is the only authority for stale/newer decisioning in widget state progression.
