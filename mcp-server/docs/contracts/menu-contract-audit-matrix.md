# Menu Contract Audit Matrix (Complete)

This is the complete audit matrix for menu/button parity and confirm-filter behavior across all registered menus.

## Runtime Sources (Canonical)

- Button source: `mcp-server/src/core/actioncode_registry.ts` (`ACTIONCODE_REGISTRY.menus`)
- Label source: `mcp-server/src/core/turn_policy_renderer.ts` (`labelsForMenu`, `MENU_LABELS`, parsed `question`)
- Confirm filter source: `mcp-server/src/core/turn_policy_renderer.ts` (`isConfirmActionCode`, `resolveMenuContract`)
- Widget body text source + chooser-noise sanitizer: `mcp-server/src/handlers/run_step.ts` (`buildTextForWidget`, `stripChoiceInstructionNoise`)
- UI render source: `mcp-server/ui/lib/ui_render.ts` (structured actions primary, safe fallback behavior)

## Default Menu By Step/Status

| Step | no_output | incomplete_output | valid_output |
|---|---|---|---|
| `dream` | `DREAM_MENU_INTRO` | `DREAM_MENU_INTRO` | `DREAM_MENU_REFINE` |
| `purpose` | `PURPOSE_MENU_INTRO` | `PURPOSE_MENU_EXPLAIN` | `PURPOSE_MENU_REFINE` |
| `bigwhy` | `BIGWHY_MENU_INTRO` | `BIGWHY_MENU_A` | `BIGWHY_MENU_REFINE` |
| `role` | `ROLE_MENU_INTRO` | `ROLE_MENU_INTRO` | `ROLE_MENU_REFINE` |
| `entity` | `ENTITY_MENU_INTRO` | `ENTITY_MENU_FORMULATE` | `ENTITY_MENU_EXAMPLE` |
| `strategy` | `STRATEGY_MENU_INTRO` | `STRATEGY_MENU_ASK` | `STRATEGY_MENU_CONFIRM` |
| `targetgroup` | `TARGETGROUP_MENU_INTRO` | `TARGETGROUP_MENU_EXPLAIN_MORE` | `TARGETGROUP_MENU_POSTREFINE` |
| `productsservices` | `PRODUCTSSERVICES_MENU_CONFIRM` | `PRODUCTSSERVICES_MENU_CONFIRM` | `PRODUCTSSERVICES_MENU_CONFIRM` |
| `rulesofthegame` | `RULES_MENU_INTRO` | `RULES_MENU_ASK_EXPLAIN` | `RULES_MENU_CONFIRM` |
| `presentation` | `PRESENTATION_MENU_ASK` | `PRESENTATION_MENU_ASK` | `PRESENTATION_MENU_ASK` |

## Full Menu Inventory

Legend:
- `high_risk_single_after_filter = yes`: at least one confirm action exists and confirm filtering can collapse to 0 or 1 actions.
- Escape menus are listed for completeness but are intentionally excluded from free-text menu selection in `pickMenuId`.

| Menu | Step | Actions | Confirm actions | Non-confirm actions | high_risk_single_after_filter | Confirm action codes | Non-confirm action codes |
|---|---|---:|---:|---:|---|---|---|
| `DREAM_MENU_INTRO` | `dream` | 2 | 0 | 2 | no | `-` | `ACTION_DREAM_INTRO_EXPLAIN_MORE, ACTION_DREAM_INTRO_START_EXERCISE` |
| `DREAM_MENU_WHY` | `dream` | 2 | 0 | 2 | no | `-` | `ACTION_DREAM_WHY_GIVE_SUGGESTIONS, ACTION_DREAM_WHY_START_EXERCISE` |
| `DREAM_MENU_SUGGESTIONS` | `dream` | 2 | 0 | 2 | no | `-` | `ACTION_DREAM_SUGGESTIONS_PICK_ONE, ACTION_DREAM_SUGGESTIONS_START_EXERCISE` |
| `DREAM_MENU_REFINE` | `dream` | 2 | 1 | 1 | yes | `ACTION_DREAM_REFINE_CONFIRM` | `ACTION_DREAM_REFINE_START_EXERCISE` |
| `DREAM_MENU_ESCAPE` | `dream` | 2 | 0 | 2 | no | `-` | `ACTION_DREAM_ESCAPE_CONTINUE, ACTION_DREAM_ESCAPE_FINISH_LATER` |
| `DREAM_EXPLAINER_MENU_REFINE` | `dream` | 2 | 1 | 1 | yes | `ACTION_DREAM_EXPLAINER_REFINE_CONFIRM` | `ACTION_DREAM_EXPLAINER_REFINE_ADJUST` |
| `DREAM_EXPLAINER_MENU_SWITCH_SELF` | `dream` | 1 | 0 | 1 | no | `-` | `ACTION_DREAM_SWITCH_TO_SELF` |
| `DREAM_EXPLAINER_MENU_ESCAPE` | `dream` | 2 | 0 | 2 | no | `-` | `ACTION_DREAM_EXPLAINER_CONTINUE, ACTION_DREAM_EXPLAINER_FINISH_LATER` |
| `PURPOSE_MENU_INTRO` | `purpose` | 1 | 0 | 1 | no | `-` | `ACTION_PURPOSE_INTRO_EXPLAIN_MORE` |
| `PURPOSE_MENU_EXPLAIN` | `purpose` | 2 | 0 | 2 | no | `-` | `ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS, ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES` |
| `PURPOSE_MENU_EXAMPLES` | `purpose` | 2 | 0 | 2 | no | `-` | `ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS, ACTION_PURPOSE_EXAMPLES_CHOOSE_FOR_ME` |
| `PURPOSE_MENU_REFINE` | `purpose` | 2 | 1 | 1 | yes | `ACTION_PURPOSE_REFINE_CONFIRM` | `ACTION_PURPOSE_REFINE_ADJUST` |
| `PURPOSE_MENU_CONFIRM_SINGLE` | `purpose` | 1 | 1 | 0 | yes | `ACTION_PURPOSE_CONFIRM_SINGLE` | `-` |
| `PURPOSE_MENU_ESCAPE` | `purpose` | 2 | 0 | 2 | no | `-` | `ACTION_PURPOSE_ESCAPE_CONTINUE, ACTION_PURPOSE_ESCAPE_FINISH_LATER` |
| `BIGWHY_MENU_INTRO` | `bigwhy` | 2 | 0 | 2 | no | `-` | `ACTION_BIGWHY_INTRO_GIVE_EXAMPLE, ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE` |
| `BIGWHY_MENU_A` | `bigwhy` | 2 | 0 | 2 | no | `-` | `ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS, ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLE` |
| `BIGWHY_MENU_REFINE` | `bigwhy` | 2 | 1 | 1 | yes | `ACTION_BIGWHY_REFINE_CONFIRM` | `ACTION_BIGWHY_REFINE_ADJUST` |
| `BIGWHY_MENU_ESCAPE` | `bigwhy` | 2 | 0 | 2 | no | `-` | `ACTION_BIGWHY_ESCAPE_CONTINUE, ACTION_BIGWHY_ESCAPE_FINISH_LATER` |
| `ROLE_MENU_INTRO` | `role` | 2 | 0 | 2 | no | `-` | `ACTION_ROLE_INTRO_GIVE_EXAMPLES, ACTION_ROLE_INTRO_EXPLAIN_MORE` |
| `ROLE_MENU_ASK` | `role` | 1 | 0 | 1 | no | `-` | `ACTION_ROLE_ASK_GIVE_EXAMPLES` |
| `ROLE_MENU_REFINE` | `role` | 2 | 1 | 1 | yes | `ACTION_ROLE_REFINE_CONFIRM` | `ACTION_ROLE_REFINE_ADJUST` |
| `ROLE_MENU_ESCAPE` | `role` | 2 | 0 | 2 | no | `-` | `ACTION_ROLE_ESCAPE_CONTINUE, ACTION_ROLE_ESCAPE_FINISH_LATER` |
| `ROLE_MENU_EXAMPLES` | `role` | 1 | 0 | 1 | no | `-` | `ACTION_ROLE_EXAMPLES_CHOOSE_FOR_ME` |
| `ENTITY_MENU_INTRO` | `entity` | 2 | 0 | 2 | no | `-` | `ACTION_ENTITY_INTRO_FORMULATE, ACTION_ENTITY_INTRO_EXPLAIN_MORE` |
| `ENTITY_MENU_EXAMPLE` | `entity` | 2 | 1 | 1 | yes | `ACTION_ENTITY_EXAMPLE_CONFIRM` | `ACTION_ENTITY_EXAMPLE_REFINE` |
| `ENTITY_MENU_FORMULATE` | `entity` | 1 | 0 | 1 | no | `-` | `ACTION_ENTITY_FORMULATE_FOR_ME` |
| `ENTITY_MENU_ESCAPE` | `entity` | 2 | 0 | 2 | no | `-` | `ACTION_ENTITY_ESCAPE_CONTINUE, ACTION_ENTITY_ESCAPE_FINISH_LATER` |
| `STRATEGY_MENU_INTRO` | `strategy` | 1 | 0 | 1 | no | `-` | `ACTION_STRATEGY_INTRO_EXPLAIN_MORE` |
| `STRATEGY_MENU_ASK` | `strategy` | 2 | 0 | 2 | no | `-` | `ACTION_STRATEGY_ASK_3_QUESTIONS, ACTION_STRATEGY_ASK_GIVE_EXAMPLES` |
| `STRATEGY_MENU_REFINE` | `strategy` | 1 | 0 | 1 | no | `-` | `ACTION_STRATEGY_REFINE_EXPLAIN_MORE` |
| `STRATEGY_MENU_QUESTIONS` | `strategy` | 1 | 0 | 1 | no | `-` | `ACTION_STRATEGY_QUESTIONS_EXPLAIN_MORE` |
| `STRATEGY_MENU_CONFIRM` | `strategy` | 2 | 1 | 1 | yes | `ACTION_STRATEGY_CONFIRM_SATISFIED` | `ACTION_STRATEGY_REFINE_EXPLAIN_MORE` |
| `STRATEGY_MENU_FINAL_CONFIRM` | `strategy` | 1 | 1 | 0 | yes | `ACTION_STRATEGY_FINAL_CONTINUE` | `-` |
| `STRATEGY_MENU_ESCAPE` | `strategy` | 2 | 0 | 2 | no | `-` | `ACTION_STRATEGY_ESCAPE_CONTINUE, ACTION_STRATEGY_ESCAPE_FINISH_LATER` |
| `TARGETGROUP_MENU_INTRO` | `targetgroup` | 2 | 0 | 2 | no | `-` | `ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE, ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS` |
| `TARGETGROUP_MENU_EXPLAIN_MORE` | `targetgroup` | 1 | 0 | 1 | no | `-` | `ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS` |
| `TARGETGROUP_MENU_POSTREFINE` | `targetgroup` | 2 | 1 | 1 | yes | `ACTION_TARGETGROUP_POSTREFINE_CONFIRM` | `ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS` |
| `PRODUCTSSERVICES_MENU_CONFIRM` | `productsservices` | 1 | 1 | 0 | yes | `ACTION_PRODUCTSSERVICES_CONFIRM` | `-` |
| `RULES_MENU_INTRO` | `rulesofthegame` | 2 | 0 | 2 | no | `-` | `ACTION_RULES_INTRO_EXPLAIN_MORE, ACTION_RULES_INTRO_GIVE_EXAMPLE` |
| `RULES_MENU_ASK_EXPLAIN` | `rulesofthegame` | 2 | 0 | 2 | no | `-` | `ACTION_RULES_ASK_EXPLAIN_MORE, ACTION_RULES_ASK_GIVE_EXAMPLE` |
| `RULES_MENU_EXAMPLE_ONLY` | `rulesofthegame` | 1 | 0 | 1 | no | `-` | `ACTION_RULES_ASK_GIVE_EXAMPLE` |
| `RULES_MENU_REFINE` | `rulesofthegame` | 2 | 1 | 1 | yes | `ACTION_RULES_REFINE_CONFIRM` | `ACTION_RULES_REFINE_ADJUST` |
| `RULES_MENU_CONFIRM` | `rulesofthegame` | 3 | 1 | 2 | no | `ACTION_RULES_CONFIRM_ALL` | `ACTION_RULES_ASK_EXPLAIN_MORE, ACTION_RULES_ASK_GIVE_EXAMPLE` |
| `RULES_MENU_ESCAPE` | `rulesofthegame` | 2 | 0 | 2 | no | `-` | `ACTION_RULES_ESCAPE_CONTINUE, ACTION_RULES_ESCAPE_FINISH_LATER` |
| `PRESENTATION_MENU_ASK` | `presentation` | 1 | 0 | 1 | no | `-` | `ACTION_PRESENTATION_MAKE` |
| `PRESENTATION_MENU_ESCAPE` | `presentation` | 2 | 0 | 2 | no | `-` | `ACTION_PRESENTATION_ESCAPE_CONTINUE, ACTION_PRESENTATION_ESCAPE_FINISH_LATER` |

## Agent Prompt Audit Notes

- Searched for explicit chooser-noise leakage markers in prompts and handlers.
- Query used: `rg -n "Please choose 1 or 2|choose 1 or 2|pick 1 or 2|select 1 or 2|Choose an option by typing 1 or 2" mcp-server/src/steps/*.ts mcp-server/src/handlers/run_step.ts mcp-server/src/core/turn_policy_renderer.ts`
- Finding: one explicit phrase in `mcp-server/src/steps/dream_explainer.ts` (escape flow question text), which is valid because it belongs in the question/interaction field.
- Contract reinforcement remains mandatory because specialist output is probabilistic; sanitizer and parity checks are the hard guardrails.

## Test Coverage Linked To This Matrix

- `mcp-server/src/core/turn_policy_renderer.test.ts`
  - `all non-escape menus keep parity and confirm-filter contract in both eligibility states`
  - `confirm-filtered menus collapse to one non-confirm action with strict question parity`
  - `non-escape menu labels stay in parity with action registry`
- `mcp-server/src/handlers/run_step_finals.test.ts`
  - `buildTextForWidget strips chooser-noise for every registered menu in widget mode`
  - `buildTextForWidget strips choose-noise for all confirm-filtered single-action menus`
