# Wording Choice Contract

This contract governs A/B wording selection when both user and suggestion variants are available.

## Trigger

- Wording choice mode is active when specialist payload exposes pending wording choice fields:
- `wording_choice_pending="true"`
- `wording_choice_user_*` and suggestion counterpart present
- Runtime trigger rule:
- If suggestion differs from user input in wording/content/order, show wording-choice panel.
- Exception: do **not** show wording-choice panel only when the difference is strictly spelling/surface correction and the sentence/list content is otherwise identical.
- This rule applies to all eligible steps and both text/list modes.

## UI Behavior

- Show comparison panel (text mode or list mode).
- Block standard confirm/proceed actions until a pick is made.
- Accepted pick actions:
- `ACTION_WORDING_PICK_USER`
- `ACTION_WORDING_PICK_SUGGESTION`
- Wording-choice UI never overrides menu routing; menu transitions stay actioncode + contract-state driven.

## State Update Rules

On pick:

1. Clear pending wording flags and raw comparison buffers.
2. Persist selected variant as staged value (`provisional_by_step[step]`) for active step.
3. Set `wording_choice_selected` to `user` or `suggestion`.
4. Rebuild menu contract for parent step (do not branch into unrelated flow).

## Staged vs Committed

- Staged value is treated as the current step result for rendering/off-topic recap.
- Commit to canonical `*_final` happens only when user clicks the explicit next-step actioncode.

## Return-to-Parent Flow

- After pick, stay in current step.
- Show step-specific feedback message.
- Restore valid step menu for follow-up confirm/refine decision.

## Guardrails

- Step 0 never enters wording-choice mode.
- DreamBuilder scoring context does not allow wording-choice panel.
- Off-topic turns do not show wording-choice panel.
- Reordered list items are treated as a meaningful difference (panel must be shown).
