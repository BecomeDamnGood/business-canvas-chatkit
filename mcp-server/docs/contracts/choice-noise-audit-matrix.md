# Choice Noise Audit Matrix

This audit documents where generic instruction lines such as `Please choose 1 or 2.` can leak into card body text and how the contract prevents that.

For the full all-menu inventory (all 45 registered menus, including confirm-filter risk flags), see `mcp-server/docs/contracts/menu-contract-audit-matrix.md`.

## Contract Rules (Hard)

- Choice instructions belong only to `question` / `ui.questionText`.
- `message` / `text` may never contain generic chooser lines (`choose/pick/select` + numbered options).
- Numbered prompt parity must stay exact:
  - `count(numbered lines in question/questionText) === ui.actions.length`
  - fallback path: `count(numbered lines in prompt) === ui.action_codes.length`

## Runtime Source Matrix

| Layer | File | Source of buttons | Source of labels | Body text source | Guard |
|---|---|---|---|---|---|
| Registry | `src/core/actioncode_registry.ts` | `menus[menu_id]` | n/a | n/a | canonical action list |
| Turn policy | `src/core/turn_policy_renderer.ts` | filtered `uiActionCodes` from registry | parsed `question` or `MENU_LABELS` | `specialist.message` + recap | confirm filter + menu parity |
| Handler payload | `src/handlers/run_step.ts` | `ui.action_codes` / `ui.actions` | `buildQuestionTextFromActions` | `buildTextForWidget()` | strips choice-noise from message text |
| Widget render | `ui/lib/ui_render.ts` | `ui.actions` primary, `ui.action_codes` fallback | structured labels or parsed prompt labels | `result.text` | safe error on missing label/action parity |

## Risk Menus (Confirm Filter -> Single Remaining Button)

When `confirmEligible=false`, confirm actions are removed and only one action remains. These are the high-risk menus for "choose 1 or 2" leakage.

| Step | Menu | Confirm action removed | Remaining action |
|---|---|---|---|
| dream | `DREAM_MENU_REFINE` | `ACTION_DREAM_REFINE_CONFIRM` | `ACTION_DREAM_REFINE_START_EXERCISE` |
| dream (explainer) | `DREAM_EXPLAINER_MENU_REFINE` | `ACTION_DREAM_EXPLAINER_REFINE_CONFIRM` | `ACTION_DREAM_EXPLAINER_REFINE_ADJUST` |
| purpose | `PURPOSE_MENU_REFINE` | `ACTION_PURPOSE_REFINE_CONFIRM` | `ACTION_PURPOSE_REFINE_ADJUST` |
| bigwhy | `BIGWHY_MENU_REFINE` | `ACTION_BIGWHY_REFINE_CONFIRM` | `ACTION_BIGWHY_REFINE_ADJUST` |
| role | `ROLE_MENU_REFINE` | `ACTION_ROLE_REFINE_CONFIRM` | `ACTION_ROLE_REFINE_ADJUST` |
| entity | `ENTITY_MENU_EXAMPLE` | `ACTION_ENTITY_EXAMPLE_CONFIRM` | `ACTION_ENTITY_EXAMPLE_REFINE` |
| strategy | `STRATEGY_MENU_CONFIRM` | `ACTION_STRATEGY_CONFIRM_SATISFIED` | `ACTION_STRATEGY_REFINE_EXPLAIN_MORE` |
| targetgroup | `TARGETGROUP_MENU_POSTREFINE` | `ACTION_TARGETGROUP_POSTREFINE_CONFIRM` | `ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS` |
| rulesofthegame | `RULES_MENU_REFINE` | `ACTION_RULES_REFINE_CONFIRM` | `ACTION_RULES_REFINE_ADJUST` |

## Agent Instruction Audit Notes

Step prompts were checked for question-vs-message separation rules. Strong explicit constraints are present in:

- `src/steps/rulesofthegame.ts`
- `src/steps/dream_explainer.ts`
- `src/steps/dream.ts`
- `src/steps/purpose.ts`
- `src/steps/bigwhy.ts`
- `src/steps/role.ts`
- `src/steps/entity.ts`
- `src/steps/strategy.ts`
- `src/steps/productsservices.ts`

Despite prompt instructions, backend sanitization remains mandatory because specialist output is probabilistic.
