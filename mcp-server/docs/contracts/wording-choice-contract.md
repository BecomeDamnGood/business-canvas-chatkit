# Wording Choice Contract

This contract governs A/B wording selection when both user and suggestion variants are available.

## Trigger

- Wording choice mode is active when specialist payload exposes pending wording choice fields:
- `wording_choice_pending="true"`
- `wording_choice_user_*` and suggestion counterpart present

## UI Behavior

- Show comparison panel (text mode or list mode).
- Block standard confirm/proceed actions until a pick is made.
- Accepted pick actions:
- `ACTION_WORDING_PICK_USER`
- `ACTION_WORDING_PICK_SUGGESTION`

## State Update Rules

On pick:

1. Clear pending wording flags and raw comparison buffers.
2. Persist selected variant in target field for active step.
3. Set `wording_choice_selected` to `user` or `suggestion`.
4. Rebuild menu contract for parent step (do not branch into unrelated flow).

## Return-to-Parent Flow

- After pick, stay in current step.
- Show step-specific feedback message.
- Restore valid step menu for follow-up confirm/refine decision.

## Guardrails

- Step 0 never enters wording-choice mode.
- DreamBuilder scoring context does not allow wording-choice panel.
- Off-topic turns do not show wording-choice panel.

