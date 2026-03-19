# Compare Contract

This contract governs compare selection when both user and suggestion variants are available.

## Trigger

- Compare mode is active when specialist payload exposes `compare_runtime` with:
- `status="pending"`
- `kind="text_compare"` or `kind="list_compare"`
- `user_*` and suggestion counterpart present
- Runtime trigger rule:
- If suggestion differs from user input in wording/content/order, show the compare panel.
- Exception: do **not** show the compare panel only when the difference is strictly spelling/surface correction and the sentence/list content is otherwise identical.
- This rule applies to all eligible steps and both text/list modes.

## UI Behavior

- Show comparison panel in one of two public kinds:
- `ui.pending_interaction.kind="text_compare"`
- `ui.pending_interaction.kind="list_compare"`
- The compare payload exposes `feedback_reason_text` inside `pending_interaction.render_model`.
- The compare panel must only render when `feedback_reason_text` contains a valid, content-specific reason for this exact rewrite.
- Block standard confirm/proceed actions until a pick is made.
- View priority is strict:
- DreamBuilder scoring view overrides compare.
- Outside scoring, compare overrides standard menu buttons.
- Accepted pick actions:
- `ACTION_COMPARE_PICK_USER`
- `ACTION_COMPARE_PICK_SUGGESTION`
- Compare UI never overrides menu routing; menu transitions stay actioncode + contract-state driven.

## State Update Rules

On pick:

1. Clear the pending `compare_runtime` state and raw comparison buffers.
2. Persist selected variant as staged value (`provisional_by_step[step]`) for active step.
3. Mark the resolved compare owner with `resolution="user"` or `resolution="suggestion"`.
4. Rebuild menu contract for parent step (do not branch into unrelated flow).

## Staged vs Committed

- Staged value is treated as the current step result for rendering/off-topic recap.
- Commit to canonical `*_final` happens only when user clicks the explicit next-step actioncode.

## Return-to-Parent Flow

- After pick, stay in current step.
- Show step-specific feedback message.
- Restore valid step menu for follow-up confirm/refine decision.

## Guardrails

- Step 0 never enters compare mode.
- Dream self mode uses the same public `text_compare` contract as the other single-value steps.
- DreamBuilder collect and refine contexts keep ownership in `dream_builder_contract`.
- DreamBuilder scoring context does not allow `ui.pending_interaction`.
- Off-topic turns do not show compare.
- Reordered list items are treated as a meaningful difference (panel must be shown).
