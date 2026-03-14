import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRouteHelpers } from "./run_step_routes.js";

function buildRoutePorts() {
  return {
    ids: {
      step0Id: "step_0",
      step0Specialist: "ValidationAndBusinessName",
      dreamStepId: "dream",
      dreamSpecialist: "Dream",
      dreamExplainerSpecialist: "DreamExplainer",
      purposeStepId: "purpose",
      purposeSpecialist: "Purpose",
      bigwhySpecialist: "BigWhy",
      roleStepId: "role",
      roleSpecialist: "Role",
      strategyStepId: "strategy",
      strategySpecialist: "Strategy",
      entitySpecialist: "Entity",
      presentationStepId: "presentation",
      presentationSpecialist: "Presentation",
    },
    tokens: {
      dreamPickOneRouteToken: "__ROUTE__DREAM_PICK_ONE__",
      purposeChooseForMeRouteToken: "__ROUTE__PURPOSE_CHOOSE_FOR_ME__",
      bigWhyChooseForMeRouteToken: "__ROUTE__BIGWHY_CHOOSE_FOR_ME__",
      roleChooseForMeRouteToken: "__ROUTE__ROLE_CHOOSE_FOR_ME__",
      entityChooseForMeRouteToken: "__ROUTE__ENTITY_CHOOSE_FOR_ME__",
      strategyChooseForMeRouteToken: "__ROUTE__STRATEGY_CHOOSE_FOR_ME__",
      presentationMakeRouteToken: "__ROUTE__PRESENTATION_MAKE__",
      switchToSelfDreamToken: "__SWITCH_TO_SELF_DREAM__",
      dreamStartExerciseRouteToken: "__ROUTE__DREAM_START_EXERCISE__",
    },
    wording: {
      wordingSelectionMessage: (_stepId: string, _state: Record<string, unknown>, _active = "", selected = "") =>
        String(selected || ""),
      pickPrompt: (specialist: Record<string, unknown>) => String(specialist.question || ""),
      buildTextForWidget: ({ specialist }: { specialist: Record<string, unknown> }) => String(specialist.message || ""),
    },
    state: {
      applyStateUpdate: ({
        prev,
        decision,
        specialistResult,
      }: {
        prev: Record<string, unknown>;
        decision: Record<string, unknown>;
        specialistResult: Record<string, unknown>;
      }) => {
        const stepId = String(decision.current_step || "");
        const currentValue =
          String(specialistResult[stepId] || "") ||
          String(specialistResult.dream || "") ||
          String(specialistResult.purpose || "") ||
          String(specialistResult.bigwhy || "") ||
          String(specialistResult.role || "") ||
          String(specialistResult.entity || "") ||
          String(specialistResult.strategy || "");
        return {
          ...prev,
          current_step: stepId,
          last_specialist_result: specialistResult,
          provisional_by_step: {
            ...(((prev as any).provisional_by_step as Record<string, unknown> | undefined) || {}),
            ...(stepId && currentValue ? { [stepId]: currentValue } : {}),
          },
        } as any;
      },
      setDreamRuntimeMode: (state: Record<string, unknown>, mode: string) => {
        state.__dream_runtime_mode = mode;
      },
      getDreamRuntimeMode: () => "self",
      isUiStateHygieneSwitchV1Enabled: () => false,
      clearStepInteractiveState: (state: Record<string, unknown>) => state as any,
    },
    contracts: {
      renderFreeTextTurnPolicy: () => {
        throw new Error("renderFreeTextTurnPolicy should not be called in these tests");
      },
      validateRenderedContractOrRecover: () => {
        throw new Error("validateRenderedContractOrRecover should not be called in these tests");
      },
      applyUiPhaseByStep: () => {},
      ensureUiStrings: async (state: Record<string, unknown>) => state as any,
      buildContractId: () => "",
    },
    step0: {
      ensureStartState: async () => {
        throw new Error("ensureStartState should not be called in these tests");
      },
      parseStep0Final: () => ({ name: "Mindd" }),
      hasValidStep0Final: () => true,
      inferStep0SeedFromInitialMessage: () => "",
      step0ReadinessQuestion: () => "",
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
    },
    presentation: {
      generatePresentationAssets: () => {
        throw new Error("generatePresentationAssets should not be called in these tests");
      },
      uiStringFromStateMap: (_state: Record<string, unknown>, _key: string, fallback: string) => fallback,
      uiDefaultString: (_key: string, fallback = "") => fallback,
    },
    specialist: {
      callSpecialistStrictSafe: async () => {
        throw new Error("callSpecialistStrictSafe should not be called in these tests");
      },
      buildRoutingContext: () => ({}),
      rememberLlmCall: () => {},
    },
    response: {
      attachRegistryPayload: (payload: Record<string, unknown>) => payload,
      finalizeResponse: (payload: Record<string, unknown>) => payload,
      turnResponseEngine: {
        renderValidateRecover: (params: { state: any; specialist: any }) => ({
          ok: true,
          value: {
            state: params.state,
            specialist: params.specialist,
            renderedStatus: "valid_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: String(params.specialist.ui_contract_id || ""),
              contractVersion: "1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: (params: { state: any; specialist: any }) => ({
          ok: true,
          tool: "run_step",
          specialist: params.specialist,
          state: params.state,
        }),
        finalize: (payload: Record<string, unknown>) => payload,
      },
    },
    suggestions: {
      pickDreamSuggestionFromPreviousState: () => "",
      pickDreamCandidateFromState: () => "",
      pickBigWhySuggestionFromPreviousState: () => "",
      pickRoleSuggestionFromPreviousState: () => "",
      pickEntitySuggestionFromPreviousState: () => "",
    },
    i18n: {
      bumpUiI18nCounter: () => {},
    },
  } as any;
}

function buildRouteContext(state: Record<string, unknown>, userMessage: string, actionCodeRaw: string) {
  return {
    routing: {
      userMessage,
      actionCodeRaw,
      responseUiFlags: null,
      inputMode: "widget",
      wordingChoiceEnabled: true,
      languageResolvedThisTurn: true,
      isBootstrapPollCall: false,
      motivationQuotesEnabled: true,
    },
    rendering: {
      uiI18nTelemetry: {},
      lang: "nl",
      ensureUiStrings: async (nextState: Record<string, unknown>) => nextState as any,
    },
    state: {
      state,
      transientPendingScores: null,
      submittedUserText: "",
      rawNormalized: userMessage,
      pristineAtEntry: false,
    },
    specialist: {
      model: "gpt-test",
      decideOrchestration: () => ({} as any),
      rememberLlmCall: () => {},
    },
  } as any;
}

test("dream choose-for-me picks the first structured suggestion without specialist fallback", async () => {
  const helpers = createRunStepRouteHelpers<any>(buildRoutePorts());
  const response = await helpers.handleSpecialRouteRegistry(
    buildRouteContext(
      {
        current_step: "dream",
        active_specialist: "Dream",
        __ui_phase_by_step: {
          dream: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
        },
        last_specialist_result: {
          action: "ASK",
          ui_contract_id: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
          message: "Rendered suggestions screen",
        },
        suggestion_state_by_step: {
          dream: {
            mode: "suggestions",
            items: [
              "Mindd droomt van een wereld waarin creativiteit mensen verbindt en merken betekenisvol contact maken met hun publiek.",
              "Mindd droomt van een wereld waarin bedrijven hun unieke verhaal moeiteloos kunnen delen.",
              "Mindd droomt van een wereld waarin communicatie vertrouwen vergroot.",
            ],
            valid_for_action_codes: ["ACTION_DREAM_SUGGESTIONS_PICK_ONE"],
          },
        },
      },
      "__ROUTE__DREAM_PICK_ONE__",
      "ACTION_DREAM_SUGGESTIONS_PICK_ONE"
    )
  );

  assert.ok(response);
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(
    String(specialist.dream || ""),
    "Mindd droomt van een wereld waarin creativiteit mensen verbindt en merken betekenisvol contact maken met hun publiek."
  );
  assert.equal(
    String((response as Record<string, any>).state?.provisional_by_step?.dream || ""),
    "Mindd droomt van een wereld waarin creativiteit mensen verbindt en merken betekenisvol contact maken met hun publiek."
  );
});

test("dream choose-for-me returns an invalid-state error when the suggestion snapshot is missing", async () => {
  const helpers = createRunStepRouteHelpers<any>(buildRoutePorts());
  const response = await helpers.handleSpecialRouteRegistry(
    buildRouteContext(
      {
        current_step: "dream",
        active_specialist: "Dream",
        __ui_phase_by_step: {
          dream: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
        },
        last_specialist_result: {
          action: "ASK",
          ui_contract_id: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
          message: "Rendered suggestions screen",
        },
      },
      "__ROUTE__DREAM_PICK_ONE__",
      "ACTION_DREAM_SUGGESTIONS_PICK_ONE"
    )
  );

  assert.equal((response as Record<string, any>).ok, false);
  assert.equal((response as Record<string, any>).error?.type, "invalid_state");
  assert.equal(
    (response as Record<string, any>).error?.details?.reason,
    "missing_or_mismatched_suggestion_snapshot"
  );
});

test("strategy choose-for-me keeps the full first example block and canonical statements", async () => {
  const helpers = createRunStepRouteHelpers<any>(buildRoutePorts());
  const firstExample = [
    "Focus on long-term partnerships",
    "Prioritize depth over volume",
    "Select clients that match the mission",
    "Invest in strategic learning",
  ].join("\n");
  const response = await helpers.handleSpecialRouteRegistry(
    buildRouteContext(
      {
        current_step: "strategy",
        active_specialist: "Strategy",
        __ui_phase_by_step: {
          strategy: "strategy:ASK:STRATEGY_MENU_EXAMPLES:v1",
        },
        last_specialist_result: {
          action: "ASK",
          ui_contract_id: "strategy:ASK:STRATEGY_MENU_EXAMPLES:v1",
          message: "Rendered examples screen",
        },
        suggestion_state_by_step: {
          strategy: {
            mode: "examples",
            items: [
              firstExample,
              ["Build a culture of curiosity", "Protect time for reflection"].join("\n"),
            ],
            valid_for_action_codes: ["ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME"],
          },
        },
      },
      "__ROUTE__STRATEGY_CHOOSE_FOR_ME__",
      "ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME"
    )
  );

  assert.ok(response);
  const specialist = (response as Record<string, any>).specialist || {};
  assert.equal(String(specialist.strategy || ""), firstExample);
  assert.deepEqual(specialist.statements || [], [
    "Focus on long-term partnerships",
    "Prioritize depth over volume",
    "Select clients that match the mission",
    "Invest in strategic learning",
  ]);
});

test("choose-for-me guard returns a visible invalid-state error when structured state is missing", async () => {
  const helpers = createRunStepRouteHelpers<any>(buildRoutePorts());
  const response = await helpers.handleSpecialRouteRegistry(
    buildRouteContext(
      {
        current_step: "dream",
        active_specialist: "Dream",
        __ui_phase_by_step: {
          dream: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
        },
        last_specialist_result: {
          action: "ASK",
          ui_contract_id: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
          message: "Hier zijn drie voorbeelden van een Droom voor Mindd.",
        },
      },
      "__ROUTE__DREAM_PICK_ONE__",
      "ACTION_DREAM_SUGGESTIONS_PICK_ONE"
    )
  );

  assert.equal((response as Record<string, any>).ok, false);
  assert.equal((response as Record<string, any>).error?.type, "invalid_state");
  assert.equal(
    (response as Record<string, any>).error?.details?.reason,
    "missing_or_mismatched_suggestion_snapshot"
  );
});
