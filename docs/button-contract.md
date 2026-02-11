# Button Contract (Hard-Coded)

> Canonical reference: `mcp-server/docs/ui-interface-contract.md`. Keep this file in sync.

These rules are mandatory to keep button behavior deterministic and stable.

1. Every button sends an ActionCode.
   - Never send label text, "yes", "Next step", or "choice:X".
   - ActionCode format: `ACTION_<STEP>_<INTENT>` or `ACTION_CONFIRM_CONTINUE`.

2. Backend handles ActionCodes deterministically.
   - Each ActionCode maps to exactly one route/behavior.
   - No LLM interpretation or heuristics.

3. Confirm buttons are direct.
   - Always set the relevant `*_final` field.
   - Always set `proceed_to_next="true"` or `proceed_to_purpose="true"`.
   - Do not rely on `isClearYes` or confirm-state heuristics.

4. Menu buttons use `menu_id + index` only.
   - No label matching and no language-specific checks.

5. No fallback.
   - If an ActionCode mapping is missing, fail loudly (log error).
   - Do not fallback to `choice:X`.

6. Start, scoring, and text submit are ActionCodes.
   - Start uses `ACTION_START`.
   - Dream scoring submit uses `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES`.
   - Text submit uses `ACTION_TEXT_SUBMIT` with payload in state `__text_submit`.

7. English-only in code.
   - UI code strings are English.
   - Other languages are produced by the agent.

8. No empty buttons.
   - If buttons are shown, each must have a non-empty label AND a valid ActionCode mapping.
   - If not, do not execute; log error.

9. `menu_id` is mandatory whenever buttons are rendered.
   - If `menu_id` is empty, buttons must not function.
   - Missing `menu_id` is a hard error.

10. Validation checklist before any change:
    - ActionCode exists for every button.
    - `menu_id` present for every menu.
    - No fallback present.
    - Confirm buttons set finals + proceed flags deterministically.
