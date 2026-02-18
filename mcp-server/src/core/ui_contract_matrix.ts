export type TurnOutputStatus = "no_output" | "incomplete_output" | "valid_output";

export const UI_CONTRACT_VERSION = "2026-02-18-ux-contract-v1";

export type UiContractStateDefinition = {
  menu_id: string;
  status: TurnOutputStatus;
};

export const MENU_LABELS: Record<string, string[]> = {
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
  PURPOSE_MENU_INTRO: ["Explain more about why a purpose is needed."],
  PURPOSE_MENU_EXPLAIN: [
    "Ask 3 questions to help me define the Purpose.",
    "Give 3 examples of how Purpose could sound.",
  ],
  PURPOSE_MENU_EXAMPLES: [
    "Ask 3 questions to help me define the Purpose.",
    "Choose one for me",
  ],
  PURPOSE_MENU_REFINE: [
    "I'm happy with this wording, please continue to next step Big Why.",
    "Refine the wording",
  ],
  PURPOSE_MENU_CONFIRM_SINGLE: [
    "I'm happy with this wording, please continue to next step Big Why.",
  ],
  BIGWHY_MENU_INTRO: [
    "Give me an example of the Big Why",
    "Explain the importance of a Big Why",
  ],
  BIGWHY_MENU_A: [
    "Ask 3 tough questions to find the Big Why.",
    "Give 3 examples of what a Big Why sounds like (universal meaning-layer, not rules, not industry slogans).",
    "Give me an example of the Big Why",
  ],
  BIGWHY_MENU_REFINE: [
    "I'm happy with this wording, continue to step 5 Role",
    "Redefine the Big Why for me please",
  ],
  ROLE_MENU_INTRO: ["Give 3 short Role examples", "Explain why a Role matters"],
  ROLE_MENU_ASK: ["Give 3 short Role examples"],
  ROLE_MENU_REFINE: ["Yes, this fits.", "I want to adjust it."],
  ROLE_MENU_EXAMPLES: ["Choose one for me"],
  ENTITY_MENU_INTRO: [
    "Give me an example how my entity could sound",
    "Explain why having an Entity matters",
  ],
  ENTITY_MENU_FORMULATE: ["Formulate my entity for me"],
  ENTITY_MENU_EXAMPLE: [
    "I'm happy with this wording, go to the next step Strategy.",
    "Refine the wording for me please",
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
    "I'm satisfied with my Strategy. Let's go to Rules of the Game",
  ],
  STRATEGY_MENU_FINAL_CONFIRM: [
    "I'm satisfied with my Strategy. Let's go to Rules of the Game",
  ],
  TARGETGROUP_MENU_INTRO: [
    "Explain me more about Target Groups",
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_EXPLAIN_MORE: [
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_POSTREFINE: [
    "I'm happy with this wording, continue to next step Products and Services",
    "Ask me some questions to define my specific Target Group",
  ],
  PRODUCTSSERVICES_MENU_CONFIRM: [
    "This is all what we offer, continue to step Rules of the Game",
  ],
  RULES_MENU_INTRO: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_ASK_EXPLAIN: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_EXAMPLE_ONLY: [
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_REFINE: ["Yes, this fits", "I want to adjust it."],
  RULES_MENU_CONFIRM: [
    "These are all my rules of the game, continue to Presentation",
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  PRESENTATION_MENU_ASK: ["Create my presentation now"],
};

export const DEFAULT_MENU_BY_STATUS: Record<string, Record<TurnOutputStatus, string>> = {
  dream: {
    no_output: "DREAM_MENU_INTRO",
    incomplete_output: "DREAM_MENU_INTRO",
    valid_output: "DREAM_MENU_REFINE",
  },
  purpose: {
    no_output: "PURPOSE_MENU_INTRO",
    incomplete_output: "PURPOSE_MENU_EXPLAIN",
    valid_output: "PURPOSE_MENU_REFINE",
  },
  bigwhy: {
    no_output: "BIGWHY_MENU_INTRO",
    incomplete_output: "BIGWHY_MENU_A",
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
  const safeStep = String(stepId || "").trim() || "unknown_step";
  const safeStatus = String(status || "").trim() || "unknown_status";
  const safeMenu = String(menuId || "").trim() || "NO_MENU";
  return `${safeStep}:${safeStatus}:${safeMenu}`;
}

export function buildNoOutputRecap(stepLabel: string): string {
  return `We have not yet defined the ${String(stepLabel || "current step").trim()}.`;
}

function headlinePrefixForStatus(status: TurnOutputStatus): "Define" | "Refine" {
  return status === "no_output" ? "Define" : "Refine";
}

export function buildHeadlineForContract(params: {
  stepLabel: string;
  companyName: string;
  status: TurnOutputStatus;
  hasOptions: boolean;
}): string {
  const prefix = headlinePrefixForStatus(params.status);
  const base = `${prefix} your ${params.stepLabel} for ${params.companyName}`;
  return params.hasOptions ? `${base} or choose an option.` : `${base}.`;
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
