/**
 * Mock run_step responses for button-audit tests.
 * Avoids LLM calls: fast, deterministic UI testing.
 */

const DEFAULT_STATE_BASE = {
  state_version: "3",
  current_step: "step_0",
  active_specialist: "",
  intro_shown_for_step: "",
  intro_shown_session: "false",
  language: "en",
  language_locked: "false",
  language_override: "false",
  ui_strings: {},
  ui_strings_lang: "en",
  last_specialist_result: {},
  step_0_final: "",
  dream_final: "",
  purpose_final: "",
  bigwhy_final: "",
  role_final: "",
  entity_final: "",
  strategy_final: "",
  targetgroup_final: "",
  productsservices_final: "",
  rulesofthegame_final: "",
  presentation_brief_final: "",
  business_name: "TBD",
  summary_target: "unknown",
} as const;

function buildState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...DEFAULT_STATE_BASE, ...overrides };
}

function buildStructuredContent(result: Record<string, unknown>): Record<string, unknown> {
  return {
    title: "The Business Strategy Canvas Builder",
    meta: `step: ${(result.state as Record<string, unknown>)?.current_step ?? "step_0"} | specialist: ${result.active_specialist ?? ""}`,
    result,
  };
}

/** API response shape: { structuredContent } */
function apiResponse(structuredContent: Record<string, unknown>): Record<string, unknown> {
  return { structuredContent };
}

/** Step 0: after Start click - matches real backend response */
export const MOCK_STEP0_AFTER_START = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "step_0",
  active_specialist: "ValidationAndBusinessName",
  text: "Just to set the context, we'll start with the basics.\n\nWhat type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'.",
  prompt: "What type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'.",
  specialist: {
    action: "ASK",
    message: "Just to set the context, we'll start with the basics.",
    question: "What type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'.",
    refined_formulation: "",
    confirmation_question: "",
    business_name: "TBD",
    proceed_to_dream: "false",
    step_0: "",
    wants_recap: false,
    is_offtopic: false,
  },
  state: buildState({
    current_step: "step_0",
    active_specialist: "ValidationAndBusinessName",
    started: "true",
  }),
}));

/** Step 0: after entering business name - shows "Yes, I'm ready" choice */
export const MOCK_STEP0_AFTER_NAME = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "step_0",
  active_specialist: "ValidationAndBusinessName",
  text: "I run an advertising agency called Mindd. Is that correct?",
  prompt: "Yes, I'm ready to continue to the Dream step.",
  specialist: {
    action: "CONFIRM",
    question: "Yes, I'm ready to continue to the Dream step.",
    message: "I run an advertising agency called Mindd.",
    confirmation_question: "Yes, I'm ready to continue to the Dream step.",
  },
  state: buildState({
    current_step: "step_0",
    active_specialist: "ValidationAndBusinessName",
    started: "true",
    business_name: "Mindd",
    step_0_final: "I run an advertising agency called Mindd",
  }),
}));

/** Dream: initial - after "Yes, I'm ready" */
export const MOCK_DREAM_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "dream",
  active_specialist: "Dream",
  text: "What world do you want to create with your business?",
  prompt: "Describe the world you want to create.",
  specialist: {
    question: "What world do you want to create with your business?",
    message: "",
  },
  state: buildState({
    current_step: "dream",
    active_specialist: "Dream",
    started: "true",
    business_name: "Mindd",
    step_0_final: "I run an advertising agency called Mindd",
  }),
}));

/** Dream: after entering dream text */
export const MOCK_DREAM_AFTER_INPUT = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "dream",
  active_specialist: "Dream",
  text: "A world where businesses thrive with purpose.",
  prompt: "I'm happy with this formulation, continue to the Purpose step.",
  specialist: {
    question: "I'm happy with this formulation, continue to the Purpose step.",
    message: "A world where businesses thrive with purpose.",
  },
  state: buildState({
    current_step: "dream",
    active_specialist: "Dream",
    started: "true",
    business_name: "Mindd",
    step_0_final: "I run an advertising agency called Mindd",
    dream_final: "A world where businesses thrive with purpose.",
  }),
}));

/** Purpose: initial */
export const MOCK_PURPOSE_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "purpose",
  active_specialist: "Purpose",
  text: "We help companies grow with strategic clarity.",
  prompt: "Describe your purpose.",
  specialist: { question: "Describe your purpose.", message: "" },
  state: buildState({
    current_step: "purpose",
    active_specialist: "Purpose",
    started: "true",
    business_name: "Mindd",
    step_0_final: "I run an advertising agency called Mindd",
    dream_final: "A world where businesses thrive with purpose.",
  }),
}));

/** Big Why: initial */
export const MOCK_BIGWHY_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "bigwhy",
  active_specialist: "BigWhy",
  text: "Because businesses with clear purpose create lasting value.",
  prompt: "Describe your Big Why.",
  specialist: { question: "Describe your Big Why.", message: "" },
  state: buildState({
    current_step: "bigwhy",
    active_specialist: "BigWhy",
    started: "true",
    business_name: "Mindd",
    dream_final: "A world where businesses thrive with purpose.",
    purpose_final: "We help companies grow.",
  }),
}));

/** Role: initial */
export const MOCK_ROLE_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "role",
  active_specialist: "Role",
  text: "Strategic partner and brand advisor.",
  prompt: "Describe your role.",
  specialist: { question: "Describe your role.", message: "" },
  state: buildState({
    current_step: "role",
    active_specialist: "Role",
    started: "true",
    business_name: "Mindd",
    dream_final: "A world where businesses thrive with purpose.",
    purpose_final: "We help companies grow.",
    bigwhy_final: "Because growth matters.",
  }),
}));

/** Entity: initial */
export const MOCK_ENTITY_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "entity",
  active_specialist: "Entity",
  text: "an advertising agency",
  prompt: "Describe your entity.",
  specialist: { question: "Describe your entity.", message: "" },
  state: buildState({
    current_step: "entity",
    active_specialist: "Entity",
    started: "true",
    business_name: "Mindd",
    dream_final: "A world where businesses thrive with purpose.",
    purpose_final: "We help companies grow.",
    bigwhy_final: "Because growth matters.",
    role_final: "Strategic advisor",
  }),
}));

/** Strategy: initial */
export const MOCK_STRATEGY_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "strategy",
  active_specialist: "Strategy",
  text: "Focus on strategic positioning.",
  prompt: "Describe your strategy.",
  specialist: { question: "Describe your strategy.", message: "" },
  state: buildState({
    current_step: "strategy",
    active_specialist: "Strategy",
    started: "true",
    business_name: "Mindd",
    entity_final: "an advertising agency",
  }),
}));

/** Target Group: initial */
export const MOCK_TARGETGROUP_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "targetgroup",
  active_specialist: "TargetGroup",
  text: "Purpose-driven companies.",
  prompt: "Describe your target group.",
  specialist: { question: "Describe your target group.", message: "" },
  state: buildState({
    current_step: "targetgroup",
    active_specialist: "TargetGroup",
    started: "true",
  }),
}));

/** Products and Services: initial */
export const MOCK_PRODUCTSSERVICES_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "productsservices",
  active_specialist: "ProductsServices",
  text: "Brand strategy, creative campaigns.",
  prompt: "Describe your products and services.",
  specialist: { question: "Describe your products and services.", message: "" },
  state: buildState({
    current_step: "productsservices",
    active_specialist: "ProductsServices",
    started: "true",
  }),
}));

/** Rules of the Game: initial */
export const MOCK_RULES_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "rulesofthegame",
  active_specialist: "RulesOfTheGame",
  text: "We maintain a formal and respectful tone.",
  prompt: "Describe your rules.",
  specialist: { question: "Describe your rules.", message: "" },
  state: buildState({
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    started: "true",
  }),
}));

/** Presentation: initial */
export const MOCK_PRESENTATION_INITIAL = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "presentation",
  active_specialist: "Presentation",
  text: "Create the Business Strategy Canvas Presentation.",
  prompt: "Create presentation.",
  specialist: { question: "Create presentation.", message: "" },
  state: buildState({
    current_step: "presentation",
    active_specialist: "Presentation",
    started: "true",
  }),
}));

/** Dream Builder: after exercise choice */
export const MOCK_DREAM_EXPLAINER = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "dream",
  active_specialist: "DreamExplainer",
  text: "Do a small exercise to discover what matters to you.",
  prompt: "Rate each statement.",
  specialist: { question: "Rate each statement.", message: "" },
  state: buildState({
    current_step: "dream",
    active_specialist: "DreamExplainer",
    started: "true",
    business_name: "Mindd",
    dream_awaiting_direction: "true",
  }),
}));

/** Dream Builder: after scoring - show formulate button */
export const MOCK_DREAM_AFTER_SCORING = apiResponse(buildStructuredContent({
  ok: true,
  tool: "run_step",
  current_step_id: "dream",
  active_specialist: "DreamExplainer",
  text: "Formulate my dream based on what I find important.",
  prompt: "Formulate my dream based on what I find important.",
  specialist: {
    question: "Formulate my dream based on what I find important.",
    message: "",
  },
  state: buildState({
    current_step: "dream",
    active_specialist: "DreamExplainer",
    started: "true",
    business_name: "Mindd",
    dream_builder_statements: [],
  }),
}));

/**
 * Get mock responses for a path, in call order.
 * Each action (click/fill) triggers one run_step; we return the matching mock.
 */
export function getMockSequenceForPath(pathId: string): Record<string, unknown>[] {
  const sequences: Record<string, Record<string, unknown>[]> = {
    prestart: [],
    "step0-initial": [MOCK_STEP0_AFTER_START],
    "step0-after-name": [MOCK_STEP0_AFTER_START, MOCK_STEP0_AFTER_NAME],
    "dream-initial": [MOCK_STEP0_AFTER_START, MOCK_STEP0_AFTER_NAME, MOCK_DREAM_INITIAL],
    "dream-after-input": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
    ],
    "dream-builder-scoring": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_EXPLAINER,
      MOCK_DREAM_EXPLAINER, // fill "Yes"
      ...Array(20).fill(MOCK_DREAM_EXPLAINER), // 20 statements
      ...Array(20).fill(MOCK_DREAM_EXPLAINER), // 20 score inputs
      MOCK_DREAM_AFTER_SCORING,
    ],
    "purpose-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
    ],
    "bigwhy-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
    ],
    "role-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
    ],
    "entity-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
    ],
    "strategy-with-choices": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
      MOCK_STRATEGY_INITIAL,
    ],
    "targetgroup-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_TARGETGROUP_INITIAL,
    ],
    "productsservices-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_TARGETGROUP_INITIAL,
      MOCK_PRODUCTSSERVICES_INITIAL,
    ],
    "rules-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_TARGETGROUP_INITIAL,
      MOCK_PRODUCTSSERVICES_INITIAL,
      MOCK_RULES_INITIAL,
    ],
    "presentation-initial": [
      MOCK_STEP0_AFTER_START,
      MOCK_STEP0_AFTER_NAME,
      MOCK_DREAM_INITIAL,
      MOCK_DREAM_AFTER_INPUT,
      MOCK_PURPOSE_INITIAL,
      MOCK_BIGWHY_INITIAL,
      MOCK_ROLE_INITIAL,
      MOCK_ENTITY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_STRATEGY_INITIAL,
      MOCK_TARGETGROUP_INITIAL,
      MOCK_PRODUCTSSERVICES_INITIAL,
      MOCK_RULES_INITIAL,
      MOCK_RULES_INITIAL,
      MOCK_RULES_INITIAL,
      MOCK_RULES_INITIAL,
      MOCK_PRESENTATION_INITIAL,
    ],
  };

  return sequences[pathId] ?? [];
}

/** Mock response for the run_step call triggered by fillAndSend (input submit) */
export function getMockAfterInputForPath(pathId: string): Record<string, unknown> {
  const mocks: Record<string, Record<string, unknown>> = {
    'step0-initial': MOCK_STEP0_AFTER_NAME as Record<string, unknown>,
    'step0-after-name': MOCK_STEP0_AFTER_NAME as Record<string, unknown>,
    'dream-initial': MOCK_DREAM_AFTER_INPUT as Record<string, unknown>,
    'dream-after-input': MOCK_DREAM_AFTER_INPUT as Record<string, unknown>,
    'purpose-initial': MOCK_PURPOSE_INITIAL as Record<string, unknown>,
    'bigwhy-initial': MOCK_BIGWHY_INITIAL as Record<string, unknown>,
    'role-initial': MOCK_ROLE_INITIAL as Record<string, unknown>,
    'entity-initial': MOCK_ENTITY_INITIAL as Record<string, unknown>,
    'strategy-with-choices': MOCK_STRATEGY_INITIAL as Record<string, unknown>,
    'targetgroup-initial': MOCK_TARGETGROUP_INITIAL as Record<string, unknown>,
    'productsservices-initial': MOCK_PRODUCTSSERVICES_INITIAL as Record<string, unknown>,
    'rules-initial': MOCK_RULES_INITIAL as Record<string, unknown>,
    'presentation-initial': MOCK_PRESENTATION_INITIAL as Record<string, unknown>,
  };
  return mocks[pathId] ?? MOCK_STEP0_AFTER_NAME as Record<string, unknown>;
}
