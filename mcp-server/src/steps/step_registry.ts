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
export type StepRegistrySectionTitleMode = "plain_key" | "business_name_template" | "presentation_key";
export type StepRegistryChooseForMeMode = "suggestions" | "examples";
export type StepRegistryChooseForMeItemKind = "sentence" | "phrase" | "multiline_list";
export type StepRegistryChooseForMeField =
  | "dream"
  | "purpose"
  | "bigwhy"
  | "role"
  | "entity"
  | "strategy";
export type StepRegistryUiMode =
  | "no_feedback"
  | "text_compare"
  | "list_compare"
  | "dream_builder"
  | "terminal";

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
  titleKey: string;
  stepperLabelKey: string;
  sectionTitleMode: StepRegistrySectionTitleMode;
  sectionTitleKey: string;
  sectionTitleWithBusinessKey: string;
  sectionTitleWithoutBusinessKey: string;
  finalField: string;
  specialistId: string;
  uiMode: StepRegistryUiMode;
  chooseForMe: StepRegistryChooseForMe | null;
};

export type StepRegistryChooseForMeEntry = StepRegistryEntry & {
  chooseForMe: StepRegistryChooseForMe;
};

export const STEP_REGISTRY_BY_STEP_ID = {
  step_0: {
    stepId: "step_0",
    orderIndex: 0,
    titleKey: "title.step_0",
    stepperLabelKey: "stepLabel.validation",
    sectionTitleMode: "plain_key",
    sectionTitleKey: "sectionTitle.step_0",
    sectionTitleWithBusinessKey: "",
    sectionTitleWithoutBusinessKey: "",
    finalField: "step_0_final",
    specialistId: "ValidationAndBusinessName",
    uiMode: "no_feedback",
    chooseForMe: null,
  },
  dream: {
    stepId: "dream",
    orderIndex: 1,
    titleKey: "title.dream",
    stepperLabelKey: "title.dream",
    sectionTitleMode: "plain_key",
    sectionTitleKey: "sectionTitle.dream",
    sectionTitleWithBusinessKey: "",
    sectionTitleWithoutBusinessKey: "",
    finalField: "dream_final",
    specialistId: "Dream",
    uiMode: "text_compare",
    chooseForMe: {
      routeToken: "__ROUTE__DREAM_PICK_ONE__",
      menuId: "DREAM_MENU_SUGGESTIONS",
      actionCode: "ACTION_DREAM_SUGGESTIONS_PICK_ONE",
      nextMenuId: "DREAM_MENU_CONFIRM_SINGLE",
      mode: "suggestions",
      itemKind: "sentence",
      field: "dream",
    },
  },
  purpose: {
    stepId: "purpose",
    orderIndex: 2,
    titleKey: "title.purpose",
    stepperLabelKey: "title.purpose",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.purposeOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.purposeOfFuture",
    finalField: "purpose_final",
    specialistId: "Purpose",
    uiMode: "text_compare",
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
    titleKey: "title.bigwhy",
    stepperLabelKey: "title.bigwhy",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.bigwhyOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.bigwhyOfFuture",
    finalField: "bigwhy_final",
    specialistId: "BigWhy",
    uiMode: "text_compare",
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
    titleKey: "title.role",
    stepperLabelKey: "title.role",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.roleOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.roleOfFuture",
    finalField: "role_final",
    specialistId: "Role",
    uiMode: "text_compare",
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
    titleKey: "title.entity",
    stepperLabelKey: "title.entity",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.entityOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.entityOfFuture",
    finalField: "entity_final",
    specialistId: "Entity",
    uiMode: "text_compare",
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
    titleKey: "title.strategy",
    stepperLabelKey: "title.strategy",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.strategyOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.strategyOfFuture",
    finalField: "strategy_final",
    specialistId: "Strategy",
    uiMode: "list_compare",
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
    titleKey: "title.targetgroup",
    stepperLabelKey: "title.targetgroup",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.targetgroupOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.targetgroupOfFuture",
    finalField: "targetgroup_final",
    specialistId: "TargetGroup",
    uiMode: "text_compare",
    chooseForMe: null,
  },
  productsservices: {
    stepId: "productsservices",
    orderIndex: 8,
    titleKey: "title.productsservices",
    stepperLabelKey: "title.productsservices",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.productsservicesOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.productsservicesOfFuture",
    finalField: "productsservices_final",
    specialistId: "ProductsServices",
    uiMode: "list_compare",
    chooseForMe: null,
  },
  rulesofthegame: {
    stepId: "rulesofthegame",
    orderIndex: 9,
    titleKey: "title.rulesofthegame",
    stepperLabelKey: "title.rulesofthegame",
    sectionTitleMode: "business_name_template",
    sectionTitleKey: "",
    sectionTitleWithBusinessKey: "sectionTitle.rulesofthegameOf",
    sectionTitleWithoutBusinessKey: "sectionTitle.rulesofthegameOfFuture",
    finalField: "rulesofthegame_final",
    specialistId: "RulesOfTheGame",
    uiMode: "list_compare",
    chooseForMe: null,
  },
  presentation: {
    stepId: "presentation",
    orderIndex: 10,
    titleKey: "title.presentation",
    stepperLabelKey: "title.presentation",
    sectionTitleMode: "presentation_key",
    sectionTitleKey: "sectionTitle.presentation",
    sectionTitleWithBusinessKey: "",
    sectionTitleWithoutBusinessKey: "",
    finalField: "presentation_brief_final",
    specialistId: "Presentation",
    uiMode: "terminal",
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

export function getStepTitleKey(stepId: string): string {
  return getStepRegistryEntry(stepId)?.titleKey || "";
}

export function getStepStepperLabelKey(stepId: string): string {
  return getStepRegistryEntry(stepId)?.stepperLabelKey || "";
}

function hasKnownBusinessName(rawBusinessName: string | null | undefined): boolean {
  const businessName = String(rawBusinessName || "").trim();
  return Boolean(businessName) && businessName !== "TBD";
}

export function formatStepSectionTitle(params: {
  stepId: string;
  businessName?: string | null;
  getString: (key: string) => string;
}): string {
  const entry = getStepRegistryEntry(params.stepId);
  if (!entry) return "";
  if (entry.sectionTitleMode === "business_name_template") {
    const businessName = String(params.businessName || "").trim();
    if (hasKnownBusinessName(businessName)) {
      const template = String(params.getString(entry.sectionTitleWithBusinessKey) || "").trim();
      if (template) return template.replace(/\{0\}/g, businessName);
    }
    return String(params.getString(entry.sectionTitleWithoutBusinessKey) || "").trim();
  }
  return String(params.getString(entry.sectionTitleKey) || "").trim();
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
  return getStepRegistryEntry(stepId)?.uiMode === "text_compare";
}

export function isSingleValueCompareStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.uiMode === "text_compare";
}

export function isGroupedListCompareStep(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.uiMode === "list_compare";
}

export function hasGroupedCompareListSemantics(stepId: string): boolean {
  return getStepRegistryEntry(stepId)?.uiMode === "list_compare";
}

export function isInteractiveSupportStep(stepId: string): boolean {
  const uiMode = getStepRegistryEntry(stepId)?.uiMode;
  return uiMode === "text_compare" || uiMode === "list_compare";
}

export function supportsAutoSuggest(stepId: string): boolean {
  const entry = getStepRegistryEntry(stepId);
  if (!entry) return false;
  return entry.uiMode === "text_compare" || entry.uiMode === "list_compare";
}
