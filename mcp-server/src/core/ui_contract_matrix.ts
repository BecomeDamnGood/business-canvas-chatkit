import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { buildUiContractId } from "./ui_contract_id.js";

export type TurnOutputStatus = "no_output" | "incomplete_output" | "valid_output";

export const UI_CONTRACT_VERSION = "2026-02-21-ux-contract-v3-key-first";

export function labelKeyForActionCode(actionCode: string): string {
  const safeActionCode = String(actionCode || "").trim().toUpperCase() || "UNKNOWN_ACTION";
  return `actionLabel.${safeActionCode}`;
}

export const MENU_LABELS: Record<string, string[]> = {
  STEP0_MENU_META_RETURN: [
    "Continue with business verification now.",
  ],
  STEP0_MENU_READY_START: [
    "Yes, I'm ready. Let's start!",
  ],
  DREAM_MENU_INTRO: [
    "Tell me more about why a dream matters",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_MENU_WHY: [
    "Give me a few dream suggestions",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_MENU_SUGGESTIONS: [
    "Pick one for me and continue",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 3 Purpose",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_EXPLAINER_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 3 Purpose",
    "Refine this formulation",
  ],
  DREAM_EXPLAINER_MENU_SWITCH_SELF: [
    "Switch back to self-formulate the dream",
  ],
  PURPOSE_MENU_INTRO: [
    "Explain more about why a purpose is needed.",
    "Ask 3 questions to help me define the Purpose.",
  ],
  PURPOSE_MENU_EXPLAIN: [
    "Ask 3 questions to help me define the Purpose.",
    "Give 3 examples of how Purpose could sound.",
  ],
  PURPOSE_MENU_POST_ASK: [
    "Explain more about why a purpose is needed.",
    "Give 3 examples of how Purpose could sound.",
  ],
  PURPOSE_MENU_EXAMPLES: [
    "Ask 3 questions to help me define the Purpose.",
    "Choose one for me",
  ],
  PURPOSE_MENU_AFTER_CHOOSE: [
    "Ask 3 questions to help me define the Purpose.",
    "I'm happy with this wording, please continue to step 4 the Big Why.",
  ],
  PURPOSE_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 4 the Big Why.",
    "Refine the wording for me please",
  ],
  PURPOSE_MENU_CONFIRM_SINGLE: [
    "I'm happy with this wording, please continue to step 4 the Big Why.",
  ],
  BIGWHY_MENU_INTRO: [
    "Give me an example of the Big Why",
    "Explain the importance of a Big Why",
  ],
  BIGWHY_MENU_FROM_EXPLAIN: [
    "Ask 3 tough questions to find the Big Why.",
    "Give me an example of the Big Why",
  ],
  BIGWHY_MENU_FROM_GIVE: [
    "Ask 3 tough questions to find the Big Why.",
    "Explain the importance of a Big Why",
  ],
  BIGWHY_MENU_REFINE: [
    "I'm happy with this wording, continue to step 5 Role",
    "Redefine the Big Why for me please",
  ],
  BIGWHY_MENU_CONFIRM_SINGLE: [
    "I'm happy with this wording, continue to step 5 Role",
  ],
  ROLE_MENU_INTRO: ["Give 3 short Role examples", "Explain why a Role matters"],
  ROLE_MENU_ASK: ["Give 3 short Role examples"],
  ROLE_MENU_REFINE: [
    "I'm happy with this wording, continue to step 6 Entity.",
    "Refine this wording for me",
  ],
  ROLE_MENU_CONFIRM_SINGLE: [
    "I'm happy with this wording, continue to step 6 Entity.",
  ],
  ROLE_MENU_EXAMPLES: [
    "Choose one for me",
  ],
  ENTITY_MENU_INTRO: [
    "Give me an example how my entity could sound",
    "Explain why having an Entity matters",
  ],
  ENTITY_MENU_EXAMPLE: [
    "I'm happy with this wording, continue to step 7 Strategy.",
    "Refine the wording for me please",
  ],
  ENTITY_MENU_CONFIRM_SINGLE: [
    "I'm happy with this wording, continue to step 7 Strategy.",
  ],
  ENTITY_MENU_FORMULATE: [
    "Formulate my entity for me",
  ],
  STRATEGY_MENU_INTRO: ["Explain why a Strategy matters"],
  STRATEGY_MENU_ASK: [
    "Ask me some questions to clarify my Strategy",
    "Show me an example of a Strategy for my business",
  ],
  STRATEGY_MENU_REFINE: ["Explain why a Strategy matters"],
  STRATEGY_MENU_QUESTIONS: ["Explain why a Strategy matters"],
  STRATEGY_MENU_CONFIRM: [
    "Explain why a Strategy matters",
    "I'm satisfied with my strategy, continue to step 8 Target Group.",
  ],
  STRATEGY_MENU_FINAL_CONFIRM: [
    "I'm satisfied with my strategy, continue to step 8 Target Group.",
  ],
  TARGETGROUP_MENU_INTRO: [
    "Explain me more about Target Groups",
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_EXPLAIN_MORE: [
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_EXPLAIN_ONLY: [
    "Explain me more about Target Groups",
  ],
  TARGETGROUP_MENU_POSTREFINE: [
    "I'm happy with this wording, continue to next step 9 Products and Services",
    "Ask me some questions to define my specific Target Group",
  ],
  PRODUCTSSERVICES_MENU_CONFIRM: [
    "This is all what we offer, continue to step 10 Rules of the Game",
  ],
  RULES_MENU_INTRO: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_ASK_EXPLAIN: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_GIVE_EXAMPLE_ONLY: [
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_EXPLAIN_ONLY: [
    "Please explain more about Rules of the Game",
  ],
  RULES_MENU_REFINE: [
    "Yes, this fits",
    "I want to adjust it.",
  ],
  RULES_MENU_CONFIRM: [
    "These are all my rules of the game, continue to the final step Presentation",
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  PRESENTATION_MENU_ASK: ["Create my presentation now"],
};

function buildMenuLabelKey(menuId: string, actionCode: string, index: number): string {
  const safeMenu = String(menuId || "").trim();
  const safeAction = String(actionCode || "").trim().toUpperCase();
  if (safeMenu && safeAction) return `menuLabel.${safeMenu}.${safeAction}`;
  return `menuLabel.${safeMenu || "UNKNOWN_MENU"}.OPTION_${index + 1}`;
}

export const MENU_LABEL_KEYS: Record<string, string[]> = (() => {
  const next: Record<string, string[]> = {};
  for (const [menuId, labels] of Object.entries(MENU_LABELS)) {
    const actionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
      ? ACTIONCODE_REGISTRY.menus[menuId]
      : [];
    if (actionCodes.length === labels.length && actionCodes.length > 0) {
      next[menuId] = actionCodes.map((actionCode, idx) => buildMenuLabelKey(menuId, actionCode, idx));
      continue;
    }
    next[menuId] = labels.map((_label, idx) => buildMenuLabelKey(menuId, "", idx));
  }
  return next;
})();

export const MENU_LABEL_DEFAULTS: Record<string, string> = (() => {
  const next: Record<string, string> = {};
  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const safeActionCodes = Array.isArray(actionCodes)
      ? actionCodes.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    if (safeActionCodes.length === 0) continue;
    const labelKeys = Array.isArray(MENU_LABEL_KEYS[menuId])
      ? MENU_LABEL_KEYS[menuId].map((key) => String(key || "").trim())
      : [];
    const labels = Array.isArray(MENU_LABELS[menuId])
      ? MENU_LABELS[menuId].map((label) => String(label || "").trim())
      : [];
    for (let idx = 0; idx < safeActionCodes.length; idx += 1) {
      const actionCode = safeActionCodes[idx];
      const labelKey = String(labelKeys[idx] || "").trim() || buildMenuLabelKey(menuId, actionCode, idx);
      const fallback = String(labels[idx] || "").trim();
      if (!labelKey || !fallback) continue;
      next[labelKey] = fallback;
    }
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

function sameActionCodeList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((code, index) => code === right[index]);
}

export function inferMenuIdForActionCodes(actionCodes: string[], stepIdHint?: string): string {
  const safeActionCodes = actionCodes
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean);
  if (safeActionCodes.length === 0) return "";
  const safeStepId = String(stepIdHint || "").trim();
  const candidates = Object.entries(ACTIONCODE_REGISTRY.menus)
    .filter(([menuId, menuActionCodes]) => {
      const normalizedMenuCodes = Array.isArray(menuActionCodes)
        ? menuActionCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)
        : [];
      if (!sameActionCodeList(normalizedMenuCodes, safeActionCodes)) return false;
      if (!safeStepId) return true;
      return normalizedMenuCodes.every((actionCode) => {
        const actionStep = String(ACTIONCODE_REGISTRY.actions[actionCode]?.step || "").trim();
        return actionStep === safeStepId || actionStep === "system";
      });
    })
    .map(([menuId]) => menuId);
  return candidates.length === 1 ? candidates[0] : "";
}

export type UiContractStateDefinition = {
  owner: string;
  status: TurnOutputStatus;
};

export type UiActionPretransition = {
  targetStepId: string;
  renderMode?: "actions" | "no_buttons";
};

export const ACTION_PRETRANSITION_BY_ACTIONCODE: Record<string, UiActionPretransition> = {
  ACTION_STEP0_READY_START: { targetStepId: "dream" },
  ACTION_DREAM_REFINE_CONFIRM: { targetStepId: "purpose" },
  ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: { targetStepId: "purpose" },
  ACTION_PURPOSE_REFINE_CONFIRM: { targetStepId: "bigwhy" },
  ACTION_PURPOSE_CONFIRM_SINGLE: { targetStepId: "bigwhy" },
  ACTION_BIGWHY_REFINE_CONFIRM: { targetStepId: "role" },
  ACTION_ROLE_REFINE_CONFIRM: { targetStepId: "entity" },
  ACTION_ENTITY_EXAMPLE_CONFIRM: { targetStepId: "strategy" },
  ACTION_STRATEGY_CONFIRM_SATISFIED: { targetStepId: "targetgroup" },
  ACTION_STRATEGY_FINAL_CONTINUE: { targetStepId: "targetgroup" },
  ACTION_TARGETGROUP_POSTREFINE_CONFIRM: { targetStepId: "productsservices" },
  ACTION_PRODUCTSSERVICES_CONFIRM: { targetStepId: "rulesofthegame" },
  ACTION_RULES_CONFIRM_ALL: { targetStepId: "presentation" },
  ACTION_PRESENTATION_MAKE: { targetStepId: "presentation", renderMode: "no_buttons" },
};

export const DEFAULT_ACTION_CODES_BY_STEP_STATUS: Record<string, Record<TurnOutputStatus, string[]>> = {
  step_0: {
    no_output: [],
    incomplete_output: [],
    valid_output: ["ACTION_STEP0_READY_START"],
  },
  dream: {
    no_output: ["ACTION_DREAM_INTRO_EXPLAIN_MORE", "ACTION_DREAM_INTRO_START_EXERCISE"],
    incomplete_output: ["ACTION_DREAM_INTRO_EXPLAIN_MORE", "ACTION_DREAM_INTRO_START_EXERCISE"],
    valid_output: ["ACTION_DREAM_REFINE_CONFIRM", "ACTION_DREAM_REFINE_START_EXERCISE"],
  },
  purpose: {
    no_output: ["ACTION_PURPOSE_INTRO_EXPLAIN_MORE", "ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS"],
    incomplete_output: ["ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS", "ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES"],
    valid_output: ["ACTION_PURPOSE_REFINE_CONFIRM", "ACTION_PURPOSE_REFINE_ADJUST"],
  },
  bigwhy: {
    no_output: ["ACTION_BIGWHY_INTRO_GIVE_EXAMPLE", "ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE"],
    incomplete_output: ["ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS", "ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLE"],
    valid_output: ["ACTION_BIGWHY_REFINE_CONFIRM", "ACTION_BIGWHY_REFINE_ADJUST"],
  },
  role: {
    no_output: ["ACTION_ROLE_INTRO_GIVE_EXAMPLES", "ACTION_ROLE_INTRO_EXPLAIN_MORE"],
    incomplete_output: ["ACTION_ROLE_ASK_GIVE_EXAMPLES"],
    valid_output: ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"],
  },
  entity: {
    no_output: ["ACTION_ENTITY_INTRO_FORMULATE", "ACTION_ENTITY_INTRO_EXPLAIN_MORE"],
    incomplete_output: ["ACTION_ENTITY_FORMULATE_FOR_ME"],
    valid_output: ["ACTION_ENTITY_EXAMPLE_CONFIRM", "ACTION_ENTITY_EXAMPLE_REFINE"],
  },
  strategy: {
    no_output: ["ACTION_STRATEGY_INTRO_EXPLAIN_MORE"],
    incomplete_output: ["ACTION_STRATEGY_ASK_3_QUESTIONS", "ACTION_STRATEGY_ASK_GIVE_EXAMPLES"],
    valid_output: ["ACTION_STRATEGY_REFINE_EXPLAIN_MORE", "ACTION_STRATEGY_CONFIRM_SATISFIED"],
  },
  targetgroup: {
    no_output: ["ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE", "ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS"],
    incomplete_output: ["ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS"],
    valid_output: ["ACTION_TARGETGROUP_POSTREFINE_CONFIRM", "ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS"],
  },
  productsservices: {
    no_output: ["ACTION_PRODUCTSSERVICES_CONFIRM"],
    incomplete_output: ["ACTION_PRODUCTSSERVICES_CONFIRM"],
    valid_output: ["ACTION_PRODUCTSSERVICES_CONFIRM"],
  },
  rulesofthegame: {
    no_output: ["ACTION_RULES_INTRO_EXPLAIN_MORE", "ACTION_RULES_INTRO_GIVE_EXAMPLE"],
    incomplete_output: ["ACTION_RULES_ASK_EXPLAIN_MORE", "ACTION_RULES_ASK_GIVE_EXAMPLE"],
    valid_output: ["ACTION_RULES_CONFIRM_ALL", "ACTION_RULES_ASK_EXPLAIN_MORE", "ACTION_RULES_ASK_GIVE_EXAMPLE"],
  },
  presentation: {
    no_output: ["ACTION_PRESENTATION_MAKE"],
    incomplete_output: ["ACTION_PRESENTATION_MAKE"],
    valid_output: ["ACTION_PRESENTATION_MAKE"],
  },
};

export function buildContractId(stepId: string, status: TurnOutputStatus, owner: string): string {
  return buildUiContractId(stepId, status, owner);
}

export function buildContractTextKeys(params: {
  stepId: string;
  status: TurnOutputStatus;
  owner: string;
}): string[] {
  return [
    `step:${params.stepId}`,
    `status:${params.status}`,
    `owner:${params.owner || "content"}`,
    "headline:contract",
    "recap:contract",
    "labels:contract",
  ];
}
