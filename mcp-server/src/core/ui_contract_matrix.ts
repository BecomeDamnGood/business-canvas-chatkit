import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { buildUiContractId } from "./ui_contract_id.js";
import { CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES } from "../steps/step_registry.js";

export type TurnOutputStatus = "no_output" | "incomplete_output" | "valid_output";

export const UI_CONTRACT_VERSION = "2026-02-21-ux-contract-v3-key-first";

export type UiContractStateDefinition = {
  menu_id: string;
  status: TurnOutputStatus;
};

export type UiMenuTransition = {
  step_id: string;
  to_menu_id?: string;
  to_step_id?: string;
  render_mode?: "menu" | "no_buttons";
  from_menu_ids?: string[];
};

const CHOOSE_FOR_ME_TRANSITIONS = Object.fromEntries(
  CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES.map((entry) => [
    entry.chooseForMe.actionCode,
    {
      step_id: entry.stepId,
      from_menu_ids: [entry.chooseForMe.menuId],
      to_menu_id: entry.chooseForMe.nextMenuId,
    } satisfies UiMenuTransition,
  ])
) as Record<string, UiMenuTransition>;

export const NEXT_MENU_BY_ACTIONCODE: Record<string, UiMenuTransition> = {
  ACTION_STEP0_READY_START: {
    step_id: "step_0",
    from_menu_ids: ["STEP0_MENU_READY_START"],
    to_step_id: "dream",
    to_menu_id: "DREAM_MENU_INTRO",
  },
  ACTION_STEP0_META_RETURN: {
    step_id: "step_0",
    from_menu_ids: ["STEP0_MENU_META_RETURN"],
    to_menu_id: "STEP0_MENU_READY_START",
  },
  ACTION_DREAM_INTRO_EXPLAIN_MORE: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_INTRO"],
    to_menu_id: "DREAM_MENU_WHY",
  },
  ACTION_DREAM_WHY_GIVE_SUGGESTIONS: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_WHY"],
    to_menu_id: "DREAM_MENU_SUGGESTIONS",
  },
  ACTION_DREAM_INTRO_START_EXERCISE: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_INTRO"],
    to_menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
  },
  ACTION_DREAM_WHY_START_EXERCISE: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_WHY"],
    to_menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
  },
  ACTION_DREAM_SUGGESTIONS_START_EXERCISE: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_SUGGESTIONS"],
    to_menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
  },
  ACTION_DREAM_REFINE_START_EXERCISE: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_NEXT_STEP"],
    to_menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
  },
  ACTION_DREAM_REFINE_CONFIRM: {
    step_id: "dream",
    from_menu_ids: ["DREAM_MENU_NEXT_STEP"],
    to_step_id: "purpose",
    to_menu_id: "PURPOSE_MENU_INTRO",
  },
  ACTION_DREAM_SWITCH_TO_SELF: {
    step_id: "dream",
    from_menu_ids: ["DREAM_EXPLAINER_MENU_SWITCH_SELF", "NO_MENU"],
    to_menu_id: "DREAM_MENU_INTRO",
  },
  ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: {
    step_id: "dream",
    from_menu_ids: ["DREAM_EXPLAINER_MENU_NEXT_STEP"],
    to_step_id: "purpose",
    to_menu_id: "PURPOSE_MENU_INTRO",
  },
  ACTION_DREAM_EXPLAINER_REFINE_ADJUST: {
    step_id: "dream",
    from_menu_ids: ["DREAM_EXPLAINER_MENU_NEXT_STEP"],
    to_menu_id: "DREAM_EXPLAINER_MENU_NEXT_STEP",
  },
  ACTION_PURPOSE_INTRO_EXPLAIN_MORE: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_INTRO", "PURPOSE_MENU_POST_ASK"],
    to_menu_id: "PURPOSE_MENU_EXPLAIN",
  },
  ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_INTRO", "PURPOSE_MENU_EXPLAIN"],
    to_menu_id: "PURPOSE_MENU_POST_ASK",
  },
  ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_EXAMPLES", "PURPOSE_MENU_AFTER_CHOOSE"],
    to_menu_id: "PURPOSE_MENU_POST_ASK",
  },
  ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_EXPLAIN", "PURPOSE_MENU_POST_ASK"],
    to_menu_id: "PURPOSE_MENU_EXAMPLES",
  },
  ACTION_PURPOSE_REFINE_ADJUST: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_REFINE"],
    to_menu_id: "PURPOSE_MENU_CONFIRM_SINGLE",
  },
  ACTION_PURPOSE_REFINE_CONFIRM: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_REFINE", "PURPOSE_MENU_CONFIRM_SINGLE", "PURPOSE_MENU_AFTER_CHOOSE"],
    to_step_id: "bigwhy",
    to_menu_id: "BIGWHY_MENU_INTRO",
  },
  ACTION_PURPOSE_CONFIRM_SINGLE: {
    step_id: "purpose",
    from_menu_ids: ["PURPOSE_MENU_CONFIRM_SINGLE", "PURPOSE_MENU_AFTER_CHOOSE"],
    to_step_id: "bigwhy",
    to_menu_id: "BIGWHY_MENU_INTRO",
  },
  ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_INTRO", "BIGWHY_MENU_FROM_GIVE"],
    to_menu_id: "BIGWHY_MENU_FROM_EXPLAIN",
  },
  ACTION_BIGWHY_INTRO_GIVE_EXAMPLE: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_INTRO", "BIGWHY_MENU_FROM_EXPLAIN"],
    to_menu_id: "BIGWHY_MENU_FROM_GIVE",
  },
  ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_FROM_EXPLAIN", "BIGWHY_MENU_FROM_GIVE"],
    to_menu_id: "BIGWHY_MENU_INTRO",
  },
  ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLE: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_FROM_EXPLAIN"],
    to_menu_id: "BIGWHY_MENU_FROM_GIVE",
  },
  ACTION_BIGWHY_REFINE_ADJUST: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_REFINE"],
    to_menu_id: "BIGWHY_MENU_CONFIRM_SINGLE",
  },
  ACTION_BIGWHY_REFINE_CONFIRM: {
    step_id: "bigwhy",
    from_menu_ids: ["BIGWHY_MENU_REFINE", "BIGWHY_MENU_CONFIRM_SINGLE"],
    to_step_id: "role",
    to_menu_id: "ROLE_MENU_INTRO",
  },
  ACTION_ROLE_INTRO_EXPLAIN_MORE: {
    step_id: "role",
    from_menu_ids: ["ROLE_MENU_INTRO"],
    to_menu_id: "ROLE_MENU_ASK",
  },
  ACTION_ROLE_INTRO_GIVE_EXAMPLES: {
    step_id: "role",
    from_menu_ids: ["ROLE_MENU_INTRO"],
    to_menu_id: "ROLE_MENU_EXAMPLES",
  },
  ACTION_ROLE_ASK_GIVE_EXAMPLES: {
    step_id: "role",
    from_menu_ids: ["ROLE_MENU_ASK"],
    to_menu_id: "ROLE_MENU_EXAMPLES",
  },
  ACTION_ROLE_REFINE_ADJUST: {
    step_id: "role",
    from_menu_ids: ["ROLE_MENU_REFINE"],
    to_menu_id: "ROLE_MENU_REFINE",
  },
  ACTION_ROLE_REFINE_CONFIRM: {
    step_id: "role",
    from_menu_ids: ["ROLE_MENU_REFINE", "ROLE_MENU_CONFIRM_SINGLE"],
    to_step_id: "entity",
    to_menu_id: "ENTITY_MENU_INTRO",
  },
  ACTION_ENTITY_INTRO_EXPLAIN_MORE: {
    step_id: "entity",
    from_menu_ids: ["ENTITY_MENU_INTRO"],
    to_menu_id: "ENTITY_MENU_FORMULATE",
  },
  ACTION_ENTITY_INTRO_FORMULATE: {
    step_id: "entity",
    from_menu_ids: ["ENTITY_MENU_INTRO"],
    to_menu_id: "ENTITY_MENU_SUGGESTIONS",
  },
  ACTION_ENTITY_FORMULATE_FOR_ME: {
    step_id: "entity",
    from_menu_ids: ["ENTITY_MENU_FORMULATE"],
    to_menu_id: "ENTITY_MENU_SUGGESTIONS",
  },
  ACTION_ENTITY_EXAMPLE_REFINE: {
    step_id: "entity",
    from_menu_ids: ["ENTITY_MENU_EXAMPLE"],
    to_menu_id: "ENTITY_MENU_CONFIRM_SINGLE",
  },
  ACTION_ENTITY_EXAMPLE_CONFIRM: {
    step_id: "entity",
    from_menu_ids: ["ENTITY_MENU_EXAMPLE", "ENTITY_MENU_CONFIRM_SINGLE"],
    to_step_id: "strategy",
    to_menu_id: "STRATEGY_MENU_INTRO",
  },
  ACTION_STRATEGY_INTRO_EXPLAIN_MORE: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_INTRO"],
    to_menu_id: "STRATEGY_MENU_ASK",
  },
  ACTION_STRATEGY_ASK_3_QUESTIONS: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_ASK"],
    to_menu_id: "STRATEGY_MENU_QUESTIONS",
  },
  ACTION_STRATEGY_ASK_GIVE_EXAMPLES: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_ASK"],
    to_menu_id: "STRATEGY_MENU_EXAMPLES",
  },
  ACTION_STRATEGY_REFINE_EXPLAIN_MORE: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_REFINE", "STRATEGY_MENU_CONFIRM"],
    to_menu_id: "STRATEGY_MENU_ASK",
  },
  ACTION_STRATEGY_CONSOLIDATE: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_CONFIRM"],
    to_menu_id: "STRATEGY_MENU_ASK",
  },
  ACTION_STRATEGY_QUESTIONS_EXPLAIN_MORE: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_QUESTIONS"],
    to_menu_id: "STRATEGY_MENU_ASK",
  },
  ACTION_STRATEGY_CONFIRM_SATISFIED: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_CONFIRM"],
    to_step_id: "targetgroup",
    to_menu_id: "TARGETGROUP_MENU_INTRO",
  },
  ACTION_STRATEGY_FINAL_CONTINUE: {
    step_id: "strategy",
    from_menu_ids: ["STRATEGY_MENU_FINAL_CONFIRM"],
    to_step_id: "targetgroup",
    to_menu_id: "TARGETGROUP_MENU_INTRO",
  },
  ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE: {
    step_id: "targetgroup",
    from_menu_ids: ["TARGETGROUP_MENU_INTRO", "TARGETGROUP_MENU_EXPLAIN_ONLY"],
    to_menu_id: "TARGETGROUP_MENU_EXPLAIN_MORE",
  },
  ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS: {
    step_id: "targetgroup",
    from_menu_ids: ["TARGETGROUP_MENU_INTRO"],
    to_menu_id: "TARGETGROUP_MENU_EXPLAIN_ONLY",
  },
  ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS: {
    step_id: "targetgroup",
    from_menu_ids: ["TARGETGROUP_MENU_EXPLAIN_MORE"],
    to_menu_id: "TARGETGROUP_MENU_EXPLAIN_ONLY",
  },
  ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS: {
    step_id: "targetgroup",
    from_menu_ids: ["TARGETGROUP_MENU_POSTREFINE"],
    to_menu_id: "TARGETGROUP_MENU_EXPLAIN_ONLY",
  },
  ACTION_TARGETGROUP_POSTREFINE_CONFIRM: {
    step_id: "targetgroup",
    from_menu_ids: ["TARGETGROUP_MENU_POSTREFINE"],
    to_step_id: "productsservices",
    to_menu_id: "PRODUCTSSERVICES_MENU_CONFIRM",
  },
  ACTION_RULES_INTRO_EXPLAIN_MORE: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_INTRO", "RULES_MENU_ASK_EXPLAIN", "RULES_MENU_CONFIRM", "RULES_MENU_EXPLAIN_ONLY"],
    to_menu_id: "RULES_MENU_GIVE_EXAMPLE_ONLY",
  },
  ACTION_RULES_INTRO_GIVE_EXAMPLE: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_INTRO", "RULES_MENU_ASK_EXPLAIN", "RULES_MENU_CONFIRM", "RULES_MENU_GIVE_EXAMPLE_ONLY"],
    to_menu_id: "RULES_MENU_EXPLAIN_ONLY",
  },
  ACTION_RULES_ASK_EXPLAIN_MORE: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_ASK_EXPLAIN", "RULES_MENU_CONFIRM", "RULES_MENU_EXPLAIN_ONLY"],
    to_menu_id: "RULES_MENU_GIVE_EXAMPLE_ONLY",
  },
  ACTION_RULES_ASK_GIVE_EXAMPLE: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_ASK_EXPLAIN", "RULES_MENU_CONFIRM", "RULES_MENU_GIVE_EXAMPLE_ONLY"],
    to_menu_id: "RULES_MENU_EXPLAIN_ONLY",
  },
  ACTION_RULES_REFINE_CONFIRM: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_REFINE"],
    to_menu_id: "RULES_MENU_CONFIRM",
  },
  ACTION_RULES_REFINE_ADJUST: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_REFINE"],
    to_menu_id: "RULES_MENU_CONFIRM",
  },
  ACTION_RULES_CONFIRM_ALL: {
    step_id: "rulesofthegame",
    from_menu_ids: ["RULES_MENU_CONFIRM"],
    to_step_id: "presentation",
    to_menu_id: "PRESENTATION_MENU_ASK",
  },
  ACTION_PRODUCTSSERVICES_CONFIRM: {
    step_id: "productsservices",
    from_menu_ids: ["PRODUCTSSERVICES_MENU_CONFIRM"],
    to_step_id: "rulesofthegame",
    to_menu_id: "RULES_MENU_INTRO",
  },
  ACTION_PRESENTATION_MAKE: {
    step_id: "presentation",
    from_menu_ids: ["PRESENTATION_MENU_ASK", "PRESENTATION_MENU_RECREATE"],
    to_step_id: "presentation",
    render_mode: "no_buttons",
  },
  ...CHOOSE_FOR_ME_TRANSITIONS,
};

function buildMenuLabelKey(menuId: string, actionCode: string, index: number): string {
  const safeMenu = String(menuId || "").trim();
  const safeAction = String(actionCode || "").trim().toUpperCase();
  if (safeMenu && safeAction) return `menuLabel.${safeMenu}.${safeAction}`;
  return `menuLabel.${safeMenu || "UNKNOWN_MENU"}.OPTION_${index + 1}`;
}

export const MENU_LABEL_KEYS: Record<string, string[]> = (() => {
  const next: Record<string, string[]> = {};
  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const safeActionCodes = Array.isArray(actionCodes)
      ? actionCodes.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    if (safeActionCodes.length === 0) continue;
    next[menuId] = safeActionCodes.map((actionCode, idx) => buildMenuLabelKey(menuId, actionCode, idx));
  }
  return next;
})();

export function labelKeyForMenuAction(menuId: string, actionCode: string, indexHint?: number): string {
  const safeMenuId = String(menuId || "").trim();
  const safeActionCode = String(actionCode || "").trim().toUpperCase();
  const actionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
    ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim().toUpperCase())
    : [];
  const idx = actionCodes.findIndex((code) => code === safeActionCode);
  if (idx >= 0) return buildMenuLabelKey(safeMenuId, safeActionCode, idx);
  const fallbackIdx = Number.isInteger(indexHint) && Number(indexHint) >= 0 ? Number(indexHint) : 0;
  return buildMenuLabelKey(safeMenuId, safeActionCode, fallbackIdx);
}

export const DEFAULT_MENU_BY_STATUS: Record<string, Record<TurnOutputStatus, string>> = {
  step_0: {
    no_output: "",
    incomplete_output: "",
    valid_output: "STEP0_MENU_READY_START",
  },
  dream: {
    no_output: "DREAM_MENU_INTRO",
    incomplete_output: "DREAM_MENU_INTRO",
    valid_output: "DREAM_MENU_NEXT_STEP",
  },
  purpose: {
    no_output: "PURPOSE_MENU_INTRO",
    incomplete_output: "PURPOSE_MENU_EXPLAIN",
    valid_output: "PURPOSE_MENU_REFINE",
  },
  bigwhy: {
    no_output: "BIGWHY_MENU_INTRO",
    incomplete_output: "BIGWHY_MENU_FROM_EXPLAIN",
    valid_output: "BIGWHY_MENU_REFINE",
  },
  role: {
    no_output: "ROLE_MENU_INTRO",
    incomplete_output: "ROLE_MENU_INTRO",
    valid_output: "ROLE_MENU_REFINE",
  },
  entity: {
    no_output: "ENTITY_MENU_INTRO",
    incomplete_output: "ENTITY_MENU_FORMULATE",
    valid_output: "ENTITY_MENU_EXAMPLE",
  },
  strategy: {
    no_output: "STRATEGY_MENU_INTRO",
    incomplete_output: "STRATEGY_MENU_ASK",
    valid_output: "STRATEGY_MENU_CONFIRM",
  },
  targetgroup: {
    no_output: "TARGETGROUP_MENU_INTRO",
    incomplete_output: "TARGETGROUP_MENU_EXPLAIN_MORE",
    valid_output: "TARGETGROUP_MENU_POSTREFINE",
  },
  productsservices: {
    no_output: "PRODUCTSSERVICES_MENU_CONFIRM",
    incomplete_output: "PRODUCTSSERVICES_MENU_CONFIRM",
    valid_output: "PRODUCTSSERVICES_MENU_CONFIRM",
  },
  rulesofthegame: {
    no_output: "RULES_MENU_INTRO",
    incomplete_output: "RULES_MENU_ASK_EXPLAIN",
    valid_output: "RULES_MENU_CONFIRM",
  },
  presentation: {
    no_output: "PRESENTATION_MENU_ASK",
    incomplete_output: "PRESENTATION_MENU_ASK",
    valid_output: "PRESENTATION_MENU_ASK",
  },
};

export function buildContractId(stepId: string, status: TurnOutputStatus, menuId: string): string {
  return buildUiContractId(stepId, status, menuId);
}

export function buildContractTextKeys(params: {
  stepId: string;
  status: TurnOutputStatus;
  menuId: string;
}): string[] {
  return [
    `step:${params.stepId}`,
    `status:${params.status}`,
    `menu:${params.menuId || "NO_MENU"}`,
    "headline:contract",
    "recap:contract",
    "labels:contract",
  ];
}
