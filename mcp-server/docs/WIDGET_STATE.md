# Step-card widget: state and tool output

The step-card widget (Dream Builder and other steps) needs the **last tool output** of `run_step` to work correctly. That output contains `result.state` and `result.specialist` (or equivalent under a `result` wrapper), which hold the current step, the list of statements, and the last specialist response.

## How it works

- On each user action (e.g. sending a message or clicking a choice), the widget calls `run_step` with the **current state** (from the previous response).
- The server returns a new response that includes `state` and `specialist`. The widget stores this and uses it for the next call.
- If the host (e.g. Cursor, ChatKit) passes the **full** `run_step` response to the widget after each call (via `toolOutput` or equivalent), the widget can keep `__BSC_LATEST__` in sync and send the correct state on the next request. Then "Total: N statements" and the statements list stay correct.
- Interactive UI is contract-only: buttons are rendered from `ui.actions` / `ui.action_codes` tied to `ui.contract_id`.
- Legacy prompt-driven confirm fields (`confirmation_question`, `proceed_to_*`) are not used by the widget flow.

## If something goes wrong

- If the widget shows "Total: 0 statements" after a REFINE or when you expect a non‑empty list, the state may be missing or from an older turn. Ensure the host provides the latest tool output to the widget after every `run_step` call.
- **Hard refresh** the page or **reopen the widget** so the latest UI and state are loaded. Cache can otherwise serve an old step-card or old state.
