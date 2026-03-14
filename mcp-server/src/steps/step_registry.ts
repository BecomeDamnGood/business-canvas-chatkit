export const STEP_REGISTRY_ORDER = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
  "presentation",
] as const;

export type StepRegistryStepId = (typeof STEP_REGISTRY_ORDER)[number];
export type StepRegistryStepKind = "bootstrap" | "single_value" | "list_value" | "presentation";
export type StepRegistryListSemantics = "none" | "grouped_compare";
export type StepRegistryChooseForMeMode = "suggestions" | "examples";
export type StepRegistryChooseForMeItemKind = "sentence" | "phrase" | "multiline_list";
export type StepRegistryChooseForMeField =
  | "dream"
  | "purpose"
  | "bigwhy"
  | "role"
  | "entity"
  | "strategy";

export type StepRegistryChooseForMe = {
  routeToken: string;
  menuId: string;
  actionCode: string;
  nextMenuId: string;
  mode: StepRegistryChooseForMeMode;
  itemKind: StepRegistryChooseForMeItemKind;
  field: StepRegistryChooseForMeField;
};

export type StepRegistryEntry = {
  stepId: StepRegistryStepId;
  finalField: string;
  specialistId: string;
  stepKind: StepRegistryStepKind;
  listSemantics: StepRegistryListSemantics;
  chooseForMe: StepRegistryChooseForMe | null;
};

export const STEP_REGISTRY_BY_STEP_ID = {
  step_0: {
    stepId: "step_0",
    finalField: "step_0_final",
    specialistId: "ValidationAndBusinessName",
    stepKind: "bootstrap",
    listSemantics: "none",
    chooseForMe: null,
  },
  dream: {
    stepId: "dream",
    finalField: "dream_final",
    specialistId: "Dream",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: {
      routeToken: "__ROUTE__DREAM_PICK_ONE__",
      menuId: "DREAM_MENU_SUGGESTIONS",
      actionCode: "ACTION_DREAM_SUGGESTIONS_PICK_ONE",
      nextMenuId: "DREAM_MENU_REFINE",
      mode: "suggestions",
      itemKind: "sentence",
      field: "dream",
    },
  },
  purpose: {
    stepId: "purpose",
    finalField: "purpose_final",
    specialistId: "Purpose",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: {
      routeToken: "__ROUTE__PURPOSE_CHOOSE_FOR_ME__",
      menuId: "PURPOSE_MENU_EXAMPLES",
      actionCode: "ACTION_PURPOSE_EXAMPLES_CHOOSE_FOR_ME",
      nextMenuId: "PURPOSE_MENU_AFTER_CHOOSE",
      mode: "examples",
      itemKind: "sentence",
      field: "purpose",
    },
  },
  bigwhy: {
    stepId: "bigwhy",
    finalField: "bigwhy_final",
    specialistId: "BigWhy",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: {
      routeToken: "__ROUTE__BIGWHY_CHOOSE_FOR_ME__",
      menuId: "BIGWHY_MENU_FROM_GIVE",
      actionCode: "ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME",
      nextMenuId: "BIGWHY_MENU_REFINE",
      mode: "suggestions",
      itemKind: "sentence",
      field: "bigwhy",
    },
  },
  role: {
    stepId: "role",
    finalField: "role_final",
    specialistId: "Role",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: {
      routeToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      menuId: "ROLE_MENU_EXAMPLES",
      actionCode: "ACTION_ROLE_EXAMPLES_CHOOSE_FOR_ME",
      nextMenuId: "ROLE_MENU_REFINE",
      mode: "examples",
      itemKind: "sentence",
      field: "role",
    },
  },
  entity: {
    stepId: "entity",
    finalField: "entity_final",
    specialistId: "Entity",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: {
      routeToken: "__ROUTE__ENTITY_CHOOSE_FOR_ME__",
      menuId: "ENTITY_MENU_SUGGESTIONS",
      actionCode: "ACTION_ENTITY_SUGGESTIONS_CHOOSE_FOR_ME",
      nextMenuId: "ENTITY_MENU_EXAMPLE",
      mode: "suggestions",
      itemKind: "phrase",
      field: "entity",
    },
  },
  strategy: {
    stepId: "strategy",
    finalField: "strategy_final",
    specialistId: "Strategy",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    chooseForMe: {
      routeToken: "__ROUTE__STRATEGY_CHOOSE_FOR_ME__",
      menuId: "STRATEGY_MENU_EXAMPLES",
      actionCode: "ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME",
      nextMenuId: "STRATEGY_MENU_CONFIRM",
      mode: "examples",
      itemKind: "multiline_list",
      field: "strategy",
    },
  },
  targetgroup: {
    stepId: "targetgroup",
    finalField: "targetgroup_final",
    specialistId: "TargetGroup",
    stepKind: "single_value",
    listSemantics: "none",
    chooseForMe: null,
  },
  productsservices: {
    stepId: "productsservices",
    finalField: "productsservices_final",
    specialistId: "ProductsServices",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    chooseForMe: null,
  },
  rulesofthegame: {
    stepId: "rulesofthegame",
    finalField: "rulesofthegame_final",
    specialistId: "RulesOfTheGame",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    chooseForMe: null,
  },
  presentation: {
    stepId: "presentation",
    finalField: "presentation_brief_final",
    specialistId: "Presentation",
    stepKind: "presentation",
    listSemantics: "none",
    chooseForMe: null,
  },
} as const satisfies Record<StepRegistryStepId, StepRegistryEntry>;

export function getStepRegistryEntry(stepId: string): StepRegistryEntry | null {
  const normalized = String(stepId || "").trim() as StepRegistryStepId;
  return STEP_REGISTRY_BY_STEP_ID[normalized] || null;
}

export function getChooseForMeRegistryEntry(stepId: string): (StepRegistryEntry & {
  chooseForMe: StepRegistryChooseForMe;
}) | null {
  const entry = getStepRegistryEntry(stepId);
  if (!entry || !entry.chooseForMe) return null;
  return entry as StepRegistryEntry & { chooseForMe: StepRegistryChooseForMe };
}
