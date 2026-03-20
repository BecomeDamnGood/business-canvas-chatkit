import {
  CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES,
  getChooseForMeActionCodeForStep,
} from "../steps/step_registry.js";

export type ActionCodeEntry = {
  route: string;
  step: string;
  dispatch_owner?: "action_routing" | "special_route" | "state_action";
  flags?: string[];
  status?: "active" | "legacy" | "system";
};

export type ActionCodeRegistryShape = {
  version: string;
  actions: Record<string, ActionCodeEntry>;
  ui_flags: Record<string, { showPurposeHint?: boolean }>;
};

export const ACTIONCODE_REGISTRY_VERSION =
  (process.env.ACTIONCODE_REGISTRY_VERSION || "").trim() || "dev";

const CHOOSE_FOR_ME_ACTIONS = Object.fromEntries(
  CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES.map((entry) => [
    entry.chooseForMe.actionCode,
    { route: entry.chooseForMe.routeToken, step: entry.stepId, dispatch_owner: "special_route" },
  ])
) as Record<string, ActionCodeEntry>;

export const ACTIONCODE_REGISTRY: ActionCodeRegistryShape = {
  version: ACTIONCODE_REGISTRY_VERSION,
  actions: {
    // Step 0
    ACTION_STEP0_META_RETURN: { route: "__ROUTE__STEP0_META_RETURN__", step: "step_0" },
    ACTION_STEP0_READY_START: { route: "__ROUTE__STEP0_READY_START__", step: "step_0" },

    // Dream
    ACTION_DREAM_INTRO_EXPLAIN_MORE: { route: "__ROUTE__DREAM_EXPLAIN_MORE__", step: "dream" },
    ACTION_DREAM_INTRO_START_EXERCISE: {
      route: "__ROUTE__DREAM_START_EXERCISE__",
      step: "dream",
      dispatch_owner: "special_route",
    },
    ACTION_DREAM_WHY_GIVE_SUGGESTIONS: { route: "__ROUTE__DREAM_GIVE_SUGGESTIONS__", step: "dream" },
    ACTION_DREAM_WHY_START_EXERCISE: {
      route: "__ROUTE__DREAM_START_EXERCISE__",
      step: "dream",
      dispatch_owner: "special_route",
    },
    ACTION_DREAM_SUGGESTIONS_START_EXERCISE: {
      route: "__ROUTE__DREAM_START_EXERCISE__",
      step: "dream",
      dispatch_owner: "special_route",
    },
    ACTION_DREAM_REFINE_CONFIRM: { route: "yes", step: "dream", flags: ["confirm"] },
    ACTION_DREAM_REFINE_START_EXERCISE: {
      route: "__ROUTE__DREAM_START_EXERCISE__",
      step: "dream",
      dispatch_owner: "special_route",
    },
    ACTION_DREAM_ESCAPE_CONTINUE: { route: "__ROUTE__DREAM_CONTINUE__", step: "dream" },
    ACTION_DREAM_ESCAPE_FINISH_LATER: { route: "__ROUTE__DREAM_FINISH_LATER__", step: "dream" },
    ACTION_DREAM_SWITCH_TO_SELF: {
      route: "__SWITCH_TO_SELF_DREAM__",
      step: "dream",
      dispatch_owner: "special_route",
    },

    // DreamExplainer
    ACTION_DREAM_EXPLAINER_CONTINUE: { route: "__ROUTE__DREAM_EXPLAINER_CONTINUE__", step: "dream" },
    ACTION_DREAM_EXPLAINER_FINISH_LATER: { route: "__ROUTE__DREAM_EXPLAINER_FINISH_LATER__", step: "dream" },
    ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: { route: "__ROUTE__DREAM_EXPLAINER_CONTINUE_TO_PURPOSE__", step: "dream" },
    ACTION_DREAM_EXPLAINER_REFINE_ADJUST: { route: "__ROUTE__DREAM_EXPLAINER_REFINE__", step: "dream" },
    ACTION_DREAM_EXPLAINER_NEXT_STEP: { route: "Next step", step: "dream" },
    ACTION_DREAM_EXPLAINER_SUBMIT_SCORES: {
      route: "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES",
      step: "dream",
      dispatch_owner: "special_route",
    },

    // Purpose
    ACTION_PURPOSE_INTRO_EXPLAIN_MORE: { route: "__ROUTE__PURPOSE_EXPLAIN_MORE__", step: "purpose" },
    ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS: { route: "__ROUTE__PURPOSE_ASK_3_QUESTIONS__", step: "purpose" },
    ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES: { route: "__ROUTE__PURPOSE_GIVE_EXAMPLES__", step: "purpose" },
    ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS: { route: "__ROUTE__PURPOSE_ASK_3_QUESTIONS__", step: "purpose" },
    ACTION_PURPOSE_REFINE_CONFIRM: { route: "yes", step: "purpose", flags: ["confirm"] },
    ACTION_PURPOSE_REFINE_ADJUST: { route: "__ROUTE__PURPOSE_REFINE__", step: "purpose" },
    ACTION_PURPOSE_CONFIRM_SINGLE: { route: "yes", step: "purpose", flags: ["confirm"] },
    ACTION_PURPOSE_ESCAPE_CONTINUE: { route: "__ROUTE__PURPOSE_CONTINUE__", step: "purpose" },
    ACTION_PURPOSE_ESCAPE_FINISH_LATER: { route: "__ROUTE__PURPOSE_FINISH_LATER__", step: "purpose" },

    // Big Why
    ACTION_BIGWHY_INTRO_GIVE_EXAMPLE: { route: "__ROUTE__BIGWHY_GIVE_EXAMPLE__", step: "bigwhy" },
    ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE: { route: "__ROUTE__BIGWHY_EXPLAIN_IMPORTANCE__", step: "bigwhy" },
    ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS: { route: "__ROUTE__BIGWHY_ASK_3_QUESTIONS__", step: "bigwhy" },
    ACTION_BIGWHY_EXPLAIN_GIVE_EXAMPLE: { route: "__ROUTE__BIGWHY_GIVE_EXAMPLE__", step: "bigwhy" },
    ACTION_BIGWHY_REFINE_CONFIRM: { route: "yes", step: "bigwhy", flags: ["confirm"] },
    ACTION_BIGWHY_REFINE_ADJUST: { route: "__ROUTE__BIGWHY_REFINE__", step: "bigwhy" },
    ACTION_BIGWHY_ESCAPE_CONTINUE: { route: "__ROUTE__BIGWHY_CONTINUE__", step: "bigwhy" },
    ACTION_BIGWHY_ESCAPE_FINISH_LATER: { route: "__ROUTE__BIGWHY_FINISH_LATER__", step: "bigwhy" },

    // Role
    ACTION_ROLE_INTRO_GIVE_EXAMPLES: { route: "__ROUTE__ROLE_GIVE_EXAMPLES__", step: "role" },
    ACTION_ROLE_INTRO_EXPLAIN_MORE: { route: "__ROUTE__ROLE_EXPLAIN_MORE__", step: "role" },
    ACTION_ROLE_ASK_GIVE_EXAMPLES: { route: "__ROUTE__ROLE_GIVE_EXAMPLES__", step: "role" },
    ACTION_ROLE_REFINE_CONFIRM: { route: "yes", step: "role", flags: ["confirm"] },
    ACTION_ROLE_REFINE_ADJUST: { route: "__ROUTE__ROLE_ADJUST__", step: "role" },
    ACTION_ROLE_ESCAPE_CONTINUE: { route: "__ROUTE__ROLE_CONTINUE__", step: "role" },
    ACTION_ROLE_ESCAPE_FINISH_LATER: { route: "__ROUTE__ROLE_FINISH_LATER__", step: "role" },

    // Entity
    ACTION_ENTITY_INTRO_FORMULATE: { route: "__ROUTE__ENTITY_FORMULATE__", step: "entity" },
    ACTION_ENTITY_INTRO_EXPLAIN_MORE: { route: "__ROUTE__ENTITY_EXPLAIN_MORE__", step: "entity" },
    ACTION_ENTITY_EXAMPLE_CONFIRM: { route: "yes", step: "entity", flags: ["confirm"] },
    ACTION_ENTITY_EXAMPLE_REFINE: { route: "__ROUTE__ENTITY_REFINE__", step: "entity" },
    ACTION_ENTITY_FORMULATE_FOR_ME: { route: "__ROUTE__ENTITY_FORMULATE_FOR_ME__", step: "entity" },
    ACTION_ENTITY_ESCAPE_CONTINUE: { route: "__ROUTE__ENTITY_CONTINUE__", step: "entity" },
    ACTION_ENTITY_ESCAPE_FINISH_LATER: { route: "__ROUTE__ENTITY_FINISH_LATER__", step: "entity" },

    // Strategy
    ACTION_STRATEGY_INTRO_FORMULATE: { route: "__ROUTE__STRATEGY_FORMULATE__", step: "strategy", status: "active" },
    ACTION_STRATEGY_INTRO_EXPLAIN_MORE: { route: "__ROUTE__STRATEGY_EXPLAIN_MORE__", step: "strategy" },
    ACTION_STRATEGY_REFINE_EXPLAIN_MORE: { route: "__ROUTE__STRATEGY_EXPLAIN_MORE__", step: "strategy" },
    ACTION_STRATEGY_QUESTIONS_EXPLAIN_MORE: { route: "__ROUTE__STRATEGY_EXPLAIN_MORE__", step: "strategy" },
    ACTION_STRATEGY_ASK_3_QUESTIONS: { route: "__ROUTE__STRATEGY_ASK_3_QUESTIONS__", step: "strategy" },
    ACTION_STRATEGY_ASK_GIVE_EXAMPLES: { route: "__ROUTE__STRATEGY_GIVE_EXAMPLES__", step: "strategy" },
    ACTION_STRATEGY_ASK_WRITE: { route: "__ROUTE__STRATEGY_FORMULATE__", step: "strategy", status: "active" },
    ACTION_STRATEGY_CONSOLIDATE: { route: "__ROUTE__STRATEGY_CONSOLIDATE__", step: "strategy" },
    ACTION_STRATEGY_CONFIRM_SATISFIED: { route: "__ROUTE__STRATEGY_CONFIRM_SATISFIED__", step: "strategy" },
    ACTION_STRATEGY_FINAL_CONTINUE: { route: "__ROUTE__STRATEGY_FINAL_CONTINUE__", step: "strategy" },
    ACTION_STRATEGY_ESCAPE_CONTINUE: { route: "__ROUTE__STRATEGY_CONTINUE__", step: "strategy" },
    ACTION_STRATEGY_ESCAPE_FINISH_LATER: { route: "__ROUTE__STRATEGY_FINISH_LATER__", step: "strategy" },

    // Target Group
    ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE: { route: "__ROUTE__TARGETGROUP_EXPLAIN_MORE__", step: "targetgroup" },
    ACTION_TARGETGROUP_INTRO_ASK_QUESTIONS: { route: "__ROUTE__TARGETGROUP_ASK_QUESTIONS__", step: "targetgroup" },
    ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS: { route: "__ROUTE__TARGETGROUP_ASK_QUESTIONS__", step: "targetgroup" },
    ACTION_TARGETGROUP_POSTREFINE_CONFIRM: { route: "yes", step: "targetgroup", flags: ["confirm"] },
    ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS: { route: "__ROUTE__TARGETGROUP_ASK_QUESTIONS__", step: "targetgroup" },

    // Products and Services
    ACTION_PRODUCTSSERVICES_CONFIRM: { route: "__ROUTE__PRODUCTSSERVICES_CONFIRM__", step: "productsservices", flags: ["confirm"] },

    // Rules of the Game
    ACTION_RULES_INTRO_WRITE: { route: "__ROUTE__RULES_WRITE__", step: "rulesofthegame", status: "active" },
    ACTION_RULES_INTRO_EXPLAIN_MORE: { route: "__ROUTE__RULES_EXPLAIN_MORE__", step: "rulesofthegame" },
    ACTION_RULES_INTRO_GIVE_EXAMPLE: { route: "__ROUTE__RULES_GIVE_EXAMPLE__", step: "rulesofthegame" },
    ACTION_RULES_ASK_WRITE: { route: "__ROUTE__RULES_WRITE__", step: "rulesofthegame", status: "active" },
    ACTION_RULES_ASK_EXPLAIN_MORE: { route: "__ROUTE__RULES_EXPLAIN_MORE__", step: "rulesofthegame" },
    ACTION_RULES_ASK_GIVE_EXAMPLE: { route: "__ROUTE__RULES_GIVE_EXAMPLE__", step: "rulesofthegame" },
    ACTION_RULES_CONFIRM_ALL: { route: "__ROUTE__RULES_CONFIRM_ALL__", step: "rulesofthegame" },
    ACTION_RULES_REFINE_CONFIRM: { route: "yes", step: "rulesofthegame", flags: ["confirm"] },
    ACTION_RULES_REFINE_ADJUST: { route: "__ROUTE__RULES_ADJUST__", step: "rulesofthegame" },
    ACTION_RULES_ESCAPE_CONTINUE: { route: "__ROUTE__RULES_CONTINUE__", step: "rulesofthegame" },
    ACTION_RULES_ESCAPE_FINISH_LATER: { route: "__ROUTE__RULES_FINISH_LATER__", step: "rulesofthegame" },

    // Presentation
    ACTION_PRESENTATION_CHANGE: { route: "__ROUTE__PRESENTATION_CHANGE__", step: "presentation", status: "active" },
    ACTION_PRESENTATION_MAKE: {
      route: "__ROUTE__PRESENTATION_MAKE__",
      step: "presentation",
      dispatch_owner: "special_route",
    },
    ACTION_PRESENTATION_ESCAPE_CONTINUE: { route: "__ROUTE__PRESENTATION_CONTINUE__", step: "presentation" },
    ACTION_PRESENTATION_ESCAPE_FINISH_LATER: { route: "__ROUTE__PRESENTATION_FINISH_LATER__", step: "presentation" },

    // Generic/system
    ACTION_START: { route: "", step: "system", dispatch_owner: "state_action", status: "system" },
    ACTION_TEXT_SUBMIT: { route: "", step: "system", dispatch_owner: "state_action", status: "system" },
    ACTION_COMPARE_PICK_USER: {
      route: "__COMPARE_PICK_USER__",
      step: "system",
      dispatch_owner: "state_action",
      status: "system",
    },
    ACTION_COMPARE_PICK_SUGGESTION: {
      route: "__COMPARE_PICK_SUGGESTION__",
      step: "system",
      dispatch_owner: "state_action",
      status: "system",
    },

    ...CHOOSE_FOR_ME_ACTIONS,
  },
  ui_flags: {},
};
