# Off-Topic Contract

This contract defines behavior when a specialist marks a turn as off-topic.

## Trigger

- Specialist output has `is_offtopic=true`.

## State Protection

- Never mutate any persistent final field (`*_final`) on off-topic turn.
- Keep current step and active specialist context unless explicit escape/switch contract says otherwise.

## Menu Behavior

- Reuse prior valid menu contract when available.
- Do not introduce hidden fallback routing.
- Widget safety rules still apply for suppressed escape menus.

## Message Behavior

- Show specialist off-topic response.
- Keep recap/context line for active step when appropriate.
- Keep recovery prompt focused on current step continuation.

## Recovery

- User can recover by sending on-topic input.
- Recovery resumes normal step flow with same ownership rules.

