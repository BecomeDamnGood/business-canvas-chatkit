# Step Contract Matrix

This document is the contract-first source of truth for step behavior in the Business Canvas flow.

## Shared Rules

- Every step owns exactly one canonical final field (except `dream` and `dream_explainer`, which co-own `dream_final`).
- A step may only mutate its owned final field(s).
- `is_offtopic=true` never mutates any `*_final` field.
- `wording_choice_pending=true` blocks normal confirm/proceed until a wording pick action is handled.
- Wording-choice decision rule is strict: show `user vs suggestion` whenever wording/content/order differs; only suppress when difference is spelling/surface-only with otherwise identical content.
- Language must be resolved before specialist call and must remain stable unless explicit override exists.
- Runtime is contract-only:
- interactive turns must be `ASK` with `contract_id + action_codes`.
- button labels come from contract menus (`MENU_LABELS` via `ui.actions`), never from prompt/question numbered lines.
- `CONFIRM`, `confirmation_question`, and `proceed_to_*` are not valid runtime drivers.
- Step transitions are actioncode-driven only.
- Legacy sessions with old markers are blocked with `session_upgrade_required` and must restart.
- Backup docs are historical only and non-normative for runtime behavior (example: `mcp-server/docs/BACKUP-v92.md`).
- Step prompts may describe route-token semantics, but may not include ActionCode to route mappings or ActionCode to `"yes"` mappings.

## step_0

- Final owner:
- `step_0_final`
- `business_name`
- Required input dependencies:
- `state.language` / `state.language_locked`
- `state.initial_user_message` (when available)
- Special flow:
- Proceed gate to Dream via `ACTION_STEP0_READY_START`
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
- Contract transition to DreamBuilder start is explicit:
- `ACTION_DREAM_INTRO_START_EXERCISE -> DREAM_EXPLAINER_MENU_SWITCH_SELF`
- `ACTION_DREAM_WHY_START_EXERCISE -> DREAM_EXPLAINER_MENU_SWITCH_SELF`
- `ACTION_DREAM_SUGGESTIONS_START_EXERCISE -> DREAM_EXPLAINER_MENU_SWITCH_SELF`
- `ACTION_DREAM_REFINE_START_EXERCISE -> DREAM_EXPLAINER_MENU_SWITCH_SELF`
- Allowed transitions:
- `dream -> dream`
- `dream -> purpose` (only via contract actioncode)
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
- Entry state for DreamBuilder start is always `DREAM_EXPLAINER_MENU_SWITCH_SELF`.
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
- terminal continue / finish-later behavior via actioncodes
