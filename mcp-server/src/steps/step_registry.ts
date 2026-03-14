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
export type StepRegistryWordingFamily = "none" | "single_value" | "grouped_list";
export type StepRegistrySupportFamily = "none" | "interactive_step";
export type StepRegistryPresentationMode = "bootstrap" | "interactive" | "presentation";
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
  orderIndex: number;
  finalField: string;
  specialistId: string;
  stepKind: StepRegistryStepKind;
  listSemantics: StepRegistryListSemantics;
  wordingFamily: StepRegistryWordingFamily;
  supportFamily: StepRegistrySupportFamily;
  presentationMode: StepRegistryPresentationMode;
  chooseForMe: StepRegistryChooseForMe | null;
};

export type StepRegistryChooseForMeEntry = StepRegistryEntry & {
  chooseForMe: StepRegistryChooseForMe;
};

export const STEP_REGISTRY_BY_STEP_ID = {
  step_0: {
    stepId: "step_0",
    orderIndex: 0,
    finalField: "step_0_final",
    specialistId: "ValidationAndBusinessName",
    stepKind: "bootstrap",
    listSemantics: "none",
    wordingFamily: "none",
    supportFamily: "none",
    presentationMode: "bootstrap",
    chooseForMe: null,
  },
  dream: {
    stepId: "dream",
    orderIndex: 1,
    finalField: "dream_final",
    specialistId: "Dream",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 2,
    finalField: "purpose_final",
    specialistId: "Purpose",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 3,
    finalField: "bigwhy_final",
    specialistId: "BigWhy",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 4,
    finalField: "role_final",
    specialistId: "Role",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 5,
    finalField: "entity_final",
    specialistId: "Entity",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 6,
    finalField: "strategy_final",
    specialistId: "Strategy",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    wordingFamily: "grouped_list",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
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
    orderIndex: 7,
    finalField: "targetgroup_final",
    specialistId: "TargetGroup",
    stepKind: "single_value",
    listSemantics: "none",
    wordingFamily: "single_value",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
    chooseForMe: null,
  },
  productsservices: {
    stepId: "productsservices",
    orderIndex: 8,
    finalField: "productsservices_final",
    specialistId: "ProductsServices",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    wordingFamily: "grouped_list",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
    chooseForMe: null,
  },
  rulesofthegame: {
    stepId: "rulesofthegame",
    orderIndex: 9,
    finalField: "rulesofthegame_final",
    specialistId: "RulesOfTheGame",
    stepKind: "list_value",
    listSemantics: "grouped_compare",
    wordingFamily: "grouped_list",
    supportFamily: "interactive_step",
    presentationMode: "interactive",
    chooseForMe: null,
  },
  presentation: {
    stepId: "presentation",
    orderIndex: 10,
    finalField: "presentation_brief_final",
    specialistId: "Presentation",
    stepKind: "presentation",
    listSemantics: "none",
    wordingFamily: "none",
    supportFamily: "none",
    presentationMode: "presentation",
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
  return entry as StepRegistryChooseForMeEntry;
}

export const CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES: readonly StepRegistryChooseForMeEntry[] = STEP_REGISTRY_ORDER
  .map((stepId) => getChooseForMeRegistryEntry(stepId))
  .filter((entry): entry is StepRegistryChooseForMeEntry => Boolean(entry));

export function getChooseForMeActionCodeForStep(stepId: string): string {
  return getChooseForMeRegistryEntry(stepId)?.chooseForMe.actionCode || "";
}

export function getChooseForMeRouteTokenForStep(stepId: string): string {
  return getChooseForMeRegistryEntry(stepId)?.chooseForMe.routeToken || "";
}

export function getChooseForMeRegistryEntryForMenu(
  stepId: string,
  menuId: string
): StepRegistryChooseForMeEntry | null {
  const normalizedStepId = String(stepId || "").trim();
  const normalizedMenuId = String(menuId || "").trim().toUpperCase();
  const entry = getChooseForMeRegistryEntry(normalizedStepId);
  if (!entry) return null;
  return entry.chooseForMe.menuId === normalizedMenuId ? entry : null;
}

export function isSingleValueStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.stepKind === "single_value";
}

export function isSingleValueWordingStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.wordingFamily === "single_value";
}

export function isGroupedListWordingStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.wordingFamily === "grouped_list";
}

export function hasGroupedCompareListSemantics(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.listSemantics === "grouped_compare";
}

export function isInteractiveSupportStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.supportFamily === "interactive_step";
}

export function supportsAutoSuggest(stepId: string): boolean {
  const entry = getStepRegistryEntry(stepId);
  if (!entry) return false;
  if (entry.presentationMode !== "interactive") return false;
  return entry.stepKind === "single_value" || entry.stepKind === "list_value";
}
