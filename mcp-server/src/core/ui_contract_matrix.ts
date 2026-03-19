import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { buildUiContractId } from "./ui_contract_id.js";
import { MENU_LABEL_DEFAULTS } from "../i18n/menu_label_defaults.js";

export type TurnOutputStatus = "no_output" | "incomplete_output" | "valid_output";

export const UI_CONTRACT_VERSION = "2026-02-21-ux-contract-v3-key-first";

function humanizeActionCode(actionCode: string): string {
  return String(actionCode || "")
    .trim()
    .replace(/^ACTION_/, "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function labelKeyForActionCode(actionCode: string): string {
  const safeActionCode = String(actionCode || "").trim().toUpperCase() || "UNKNOWN_ACTION";
  return `actionLabel.${safeActionCode}`;
}

export const ACTION_LABEL_DEFAULTS: Record<string, string> = (() => {
  const defaults: Record<string, string> = {};
  for (const [menuId, actionCodesRaw] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const actionCodes = Array.isArray(actionCodesRaw)
      ? actionCodesRaw.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    actionCodes.forEach((actionCode) => {
      const labelKey = labelKeyForActionCode(actionCode);
      if (defaults[labelKey]) return;
      const legacyLabelKey = `menuLabel.${menuId}.${String(actionCode || "").trim().toUpperCase()}`;
      defaults[labelKey] = String(MENU_LABEL_DEFAULTS[legacyLabelKey] || "").trim() || humanizeActionCode(actionCode);
    });
  }
  return defaults;
})();

export type UiContractStateDefinition = {
  owner: string;
  status: TurnOutputStatus;
};

export type UiActionPretransition = {
  targetStepId: string;
  renderMode?: "menu" | "no_buttons";
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
