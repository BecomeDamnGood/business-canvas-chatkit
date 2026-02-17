# Step Contract Matrix

This document is the contract-first source of truth for step behavior in the Business Canvas flow.

## Shared Rules

- Every step owns exactly one canonical final field (except `dream` and `dream_explainer`, which co-own `dream_final`).
- A step may only mutate its owned final field(s).
- `is_offtopic=true` never mutates any `*_final` field.
- `wording_choice_pending=true` blocks normal confirm/proceed until a wording pick action is handled.
- Language must be resolved before specialist call and must remain stable unless explicit override exists.

## step_0

- Final owner:
- `step_0_final`
- `business_name`
- Required input dependencies:
- `state.language` / `state.language_locked`
- `state.initial_user_message` (when available)
- Special flow:
- Proceed gate to Dream (`proceed_to_dream="true"`)
- Allowed transitions:
- `step_0 -> dream`
- Exceptions:
- Start trigger with empty user message returns canonical Step 0 question without specialist roundtrip.

## dream

- Final owner:
- `dream_final` (shared with `dream_explainer`)
- Required input dependencies:
- `step_0_final`
- `business_name`
- language state
- Special flow:
- Self mode / builder mode switch, and handoff to `dream_explainer`
- Allowed transitions:
- `dream -> dream`
- `dream -> purpose` (only when proceed contract is satisfied)
- Exceptions:
- `ACTION_DREAM_SWITCH_TO_SELF` keeps same step and switches specialist path.

## dream_explainer

- Final owner:
- `dream_final` (shared with `dream`)
- Required input dependencies:
- prior statements (`last_specialist_result.statements` or scoring state)
- clustering/scoring transient state
- `step_0_final`, `business_name`
- language state
- Special flow:
- statement accumulation -> clustering -> scoring -> final Dream wording
- Allowed transitions:
- `dream_explainer -> dream_explainer`
- `dream_explainer -> dream`
- `dream_explainer -> purpose`
- Exceptions:
- switch back to self mode preserves statement history and clears stale scoring-only context.

## purpose

- Final owner:
- `purpose_final`
- Required input dependencies:
- `dream_final`
- `business_name`
- language state
- Special flow:
- wording choice dual-path (`user` vs `suggestion`)
- Allowed transitions:
- `purpose -> purpose`
- `purpose -> bigwhy`
- Exceptions:
- no Dream rediscovery allowed in this step.

## bigwhy

- Final owner:
- `bigwhy_final`
- Required input dependencies:
- `purpose_final`
- `dream_final`
- language state
- Special flow:
- wording choice dual-path
- Allowed transitions:
- `bigwhy -> bigwhy`
- `bigwhy -> role`

## role

- Final owner:
- `role_final`
- Required input dependencies:
- `bigwhy_final`
- `purpose_final`
- language state
- Special flow:
- wording choice dual-path
- Allowed transitions:
- `role -> role`
- `role -> entity`

## entity

- Final owner:
- `entity_final`
- Required input dependencies:
- `role_final`
- `purpose_final`
- `dream_final`
- language state
- Special flow:
- confirm/refine branching with entity phrase constraints
- Allowed transitions:
- `entity -> entity`
- `entity -> strategy`

## strategy

- Final owner:
- `strategy_final`
- Required input dependencies:
- `entity_final`
- prior finals recap context
- language state
- Special flow:
- list-oriented wording choice and informational context handling
- Allowed transitions:
- `strategy -> strategy`
- `strategy -> targetgroup`

## targetgroup

- Final owner:
- `targetgroup_final`
- Required input dependencies:
- `strategy_final`
- prior finals recap context
- language state
- Special flow:
- bounded final formatting rules
- Allowed transitions:
- `targetgroup -> targetgroup`
- `targetgroup -> productsservices`

## productsservices

- Final owner:
- `productsservices_final`
- Required input dependencies:
- `targetgroup_final`
- `strategy_final`
- language state
- Special flow:
- confirm-oriented menu flow
- Allowed transitions:
- `productsservices -> productsservices`
- `productsservices -> rulesofthegame`

## rulesofthegame

- Final owner:
- `rulesofthegame_final`
- Required input dependencies:
- `productsservices_final`
- prior finals recap context
- language state
- Special flow:
- post-processing to canonical bullet list
- Allowed transitions:
- `rulesofthegame -> rulesofthegame`
- `rulesofthegame -> presentation`

## presentation

- Final owner:
- `presentation_brief_final`
- Required input dependencies:
- all non-empty finals (`*_final`)
- `business_name`
- language state
- Special flow:
- presentation asset preparation output path
- Allowed transitions:
- `presentation -> presentation`
- terminal proceed / finish-later behavior

