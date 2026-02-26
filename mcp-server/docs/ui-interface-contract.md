# UI Interface & Button Contract (Canonical)

This document is the canonical source of truth for the widget ↔ backend contract and button behavior.

## 1) Widget → /run_step Request

Required fields (widget mode):
- `input_mode`: "widget" (chat clients use "chat").
- `current_step_id`: current step identifier (e.g. `step_0`).
- `user_message`: ActionCode string for button clicks, or free-text user input.
- `state`: session state object (opaque to the widget).

Notes:
- In widget mode, button clicks must send ActionCodes (no `choice:X`, no label text).
- Free-text submits send plain text in `user_message`.

## 2) /run_step Response Contract

Success (`ok: true`):
- `ok`: `true`
- `tool`: `"run_step"`
- `registry_version`: version tag for the ActionCode registry
- `result`: step payload
- `ui` (optional):
  - `actions`: array of structured rendered actions (canonical button source)
    - each action has `id`, `label`, `action_code`, and typed `intent`
  - `questionText`: display-only numbered prompt text generated from `actions`
  - `action_codes`: array of ActionCodes aligned to the parsed prompt options
  - `expected_choice_count`: integer (length of `action_codes`)
  - `flags`: UI hints (e.g. `showPurposeHint`)

Error (`ok: false`):
- `ok`: `false`
- `tool`: `"run_step"`
- `error`: object with `type`, `user_message`, `retry_action`, and optional fields

## 3) Error Types & UX Expectations

`rate_limited`:
- Fields: `retry_after_ms`, `user_message`, `retry_action`
- UI: show inline notice, disable controls for `retry_after_ms`, auto re-enable

`timeout`:
- Fields: `user_message`, `retry_action`
- UI: show inline notice, keep user on same step, allow retry

## 4) Button Rendering Rules

- The widget parses **raw prompt** text for numbered options.
- Canonical rendering path: buttons come from `ui.actions`.
- Legacy fallback path: index-match parsed labels with `ui.action_codes`.
- If `ui.action_codes` exist but numbered labels cannot be parsed, widget must show safe error (never render guessed buttons).
- If counts mismatch, the widget should surface a safe error state (no fallback routing).
- Display rendering is sanitized and does not influence parsing.

## 5) Security Rendering Rules

- Never use `innerHTML` for LLM/tool output.
- Safe `<strong>` rendering only via DOM nodes (no HTML injection).
- All other HTML tags are stripped to plain text.

## 6) Static Serving & Dev Workflow

- UI assets served from `/ui/step-card` (single bundled artifact) and static `/ui/*`.
- Bundle generation is TS-first from `ui/lib/*.ts` via `scripts/build-ui.mjs`.
- Dev workflow: `npm run dev` (and run `npm run typecheck` when needed).

## 7) Invariants

- Widget mode uses ActionCodes as the canonical routing input.
- Structured actions are the canonical render source (`ui.actions`).
- `ui.contract_id` must be present whenever buttons are rendered.
- No legacy fallback routing in widget mode.
- `registry_version` should be logged with menu/button interactions.

## 8) Widget Render-State SSOT

- Authoritative render-state source is `_meta.widget_result` only.
- Authoritative ordering tuple (from `_meta.widget_result.state`) is:
  - `bootstrap_session_id`
  - `bootstrap_epoch`
  - `response_seq`
  - `host_widget_session_id`
- This tuple is the only authority for stale/newer decisioning in widget state progression.
- `structuredContent.result` remains model-safe/minimal and is not authoritative for widget render-state.

## 9) Bootstrap/Locale Authority Rules

- Server-side bootstrap policy is authoritative for `bootstrap_phase`, `ui_gate_status`, `ui_strings_status`, and `ui.view.mode`.
- The widget must treat incoming state claims as untrusted hints and only render server-emitted intent from `_meta.widget_result`.
- `interactive_fallback` is not used for non-EN pending locale on `step_0`; server must emit `waiting_locale` or `recovery`.
- Widget render priority is: `ui.view.mode` first, then recovery fallback for corrupt/missing payload.

## 10) Migration Compatibility Window

- Legacy payloadvormen (`root.result` en andere alternate wrappers) mogen alleen tijdelijk bestaan tijdens migratie.
- Tijdens dit window moeten producers canonicaliseren naar `_meta.widget_result` voor widget-consumptie.
- Alternate bronnen mogen niet als truth-source gebruikt worden voor render-state of ordering.
