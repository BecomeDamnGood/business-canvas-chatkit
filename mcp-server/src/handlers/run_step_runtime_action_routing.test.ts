import test from "node:test";
import assert from "node:assert/strict";

import { runStepRuntimeActionRoutingLayer } from "./run_step_runtime_action_routing.js";

function buildBaseState(): Record<string, unknown> {
  return {
    current_step: "targetgroup",
    active_specialist: "TargetGroup",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_mode: "text",
      wording_choice_target_field: "targetgroup",
      wording_choice_user_raw: "I mean all companies that build complex products.",
      wording_choice_user_normalized: "I mean all companies that build complex products.",
      wording_choice_agent_current: "Industrial manufacturers with technical product development.",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
    },
  };
}

function buildParams(intentEnabled: boolean) {
  const clearStepInteractiveState = (state: Record<string, unknown>, _stepId: string) => ({
    ...state,
    last_specialist_result: {
      ...((state.last_specialist_result as Record<string, unknown>) || {}),
      wording_choice_pending: "false",
      wording_choice_selected: "",
      wording_choice_user_raw: "",
      wording_choice_user_normalized: "",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
      wording_choice_agent_current: "",
      wording_choice_mode: "",
      wording_choice_target_field: "",
    },
  });

  const attachRegistryPayload = (
    payload: Record<string, unknown>,
    _specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null
  ) => ({
    ...payload,
    ui: {
      flags: flagsOverride || {},
    },
    blocked_pending: true,
  });

  return {
    runtime: {
      state: buildBaseState() as any,
      userMessage: "Nee, ik bedoel echt industriële maakbedrijven.",
      actionCodeRaw: "",
      lastSpecialistResult: {},
      inputMode: "widget" as const,
      wordingChoiceEnabled: true,
      wordingChoiceIntentV1: intentEnabled,
      uiI18nTelemetry: {},
    },
    ids: {
      step0Id: "step0",
      dreamStepId: "dream",
      purposeStepId: "purpose",
      bigwhyStepId: "bigwhy",
      roleStepId: "role",
      entityStepId: "entity",
      strategyStepId: "strategy",
      targetgroupStepId: "targetgroup",
      productsservicesStepId: "productsservices",
      rulesofthegameStepId: "rulesofthegame",
      presentationStepId: "presentation",
      dreamExplainerSwitchSelfMenuId: "DREAM_SWITCH_SELF",
    },
    action: {
      nextMenuByActionCode: {},
      dreamStartExerciseActionCodes: new Set<string>(),
      resolveActionCodeTransition: () => null,
      inferCurrentMenuForStep: () => "",
      setUiRenderModeByStep: () => {},
      applyUiPhaseByStep: () => {},
      buildContractId: () => "",
      processActionCode: (actionCodeInput: string) => actionCodeInput,
      firstConfirmActionCodeForMenu: () => "",
      firstGuidanceActionCodeForMenu: () => "",
      setDreamRuntimeMode: () => {},
      getDreamRuntimeMode: () => "self" as const,
    },
    state: {
      provisionalValueForStep: () => "",
      clearProvisionalValue: (state: any) => state,
      clearStepInteractiveState,
      isUiStateHygieneSwitchV1Enabled: () => true,
      isClearlyGeneralOfftopicInput: () => false,
      shouldTreatAsStepContributingInput: () => true,
      classifyPendingWordingChoiceTextIntent: () => "content_input" as const,
      bumpUiI18nCounter: () => {},
    },
    wording: {
      isWordingChoiceEligibleContext: () => true,
      buildWordingChoiceFromPendingSpecialist: () => ({
        enabled: true,
        mode: "text" as const,
        user_text: "user",
        suggestion_text: "suggestion",
        user_items: [],
        suggestion_items: [],
        instruction: "pick one",
      }),
      applyWordingPickSelection: () => ({
        handled: false,
        specialist: {},
        nextState: buildBaseState() as any,
      }),
      isWordingPickRouteToken: () => false,
      isRefineAdjustRouteToken: () => false,
      buildWordingChoiceFromTurn: () => ({ specialist: {}, wordingChoice: null }),
      pickWordingAgentBase: () => "",
      copyPendingWordingChoiceState: (specialistResult: Record<string, unknown>) => specialistResult,
    },
    behavior: {
      ensureUiStrings: async (state: any) => state,
      normalizeNonStep0OfftopicSpecialist: (params: any) => params.specialistResult,
      buildTextForWidget: () => "",
      pickPrompt: () => "",
      uiStringFromStateMap: () => "",
      uiDefaultString: () => "",
      finalizeResponse: (payload: any) => payload,
      attachRegistryPayload,
      resolveResponseUiFlags: () => null,
    },
  };
}

test("runStepRuntimeActionRoutingLayer releases pending wording choice for free-text intent even when intent flow flag is disabled", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(false) as any);
  assert.equal(result.response, null);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(result.submittedTextIntent, "content_input");
});

test("runStepRuntimeActionRoutingLayer clears stale pending block when pending wording payload is not renderable", async () => {
  const params = buildParams(false) as any;
  params.wording.buildWordingChoiceFromPendingSpecialist = () => null;

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
});

test("runStepRuntimeActionRoutingLayer releases pending wording choice for free-text intent when enabled", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(true) as any);
  assert.equal(result.response, null);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(result.submittedTextIntent, "content_input");
});

test("runStepRuntimeActionRoutingLayer implicitly accepts suggestion on pending wording choice only for explicit accept text", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Ja, dit is goed zo.";
  params.state.classifyPendingWordingChoiceTextIntent = () => "accept_suggestion_explicit";
  params.wording.applyWordingPickSelection = ({ state, routeToken }: any) => {
    if (routeToken !== "__WORDING_PICK_SUGGESTION__") {
      return { handled: false, specialist: {}, nextState: state };
    }
    return {
      handled: true,
      specialist: {},
      nextState: {
        ...state,
        last_specialist_result: {
          ...((state.last_specialist_result as Record<string, unknown>) || {}),
          wording_choice_pending: "false",
          wording_choice_selected: "suggestion",
          wording_choice_mode: "",
          wording_choice_target_field: "",
          wording_choice_user_raw: "",
          wording_choice_user_normalized: "",
          wording_choice_user_items: [],
          wording_choice_suggestion_items: [],
          wording_choice_base_items: [],
        },
      },
    };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "");
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "suggestion");
});

test("runStepRuntimeActionRoutingLayer clears pending wording choice for feedback without implicit accept", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dit raakt me nog niet echt.";
  params.state.classifyPendingWordingChoiceTextIntent = () => "feedback_on_suggestion";
  let implicitPickCalled = false;
  params.wording.applyWordingPickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__WORDING_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.userMessage, "Dit raakt me nog niet echt.");
  assert.equal(result.submittedTextIntent, "feedback_on_suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "");
});

test("runStepRuntimeActionRoutingLayer does not implicit-accept suggestion when user explicitly rejects it", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.classifyPendingWordingChoiceTextIntent = () => "reject_suggestion_explicit";
  let implicitPickCalled = false;
  params.wording.applyWordingPickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__WORDING_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "");
});

test("runStepRuntimeActionRoutingLayer maps proceed text intent to current confirm action in widget mode", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "strategy",
    active_specialist: "Strategy",
    last_specialist_result: {},
  };
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "STRATEGY_MENU_CONFIRM";
  params.action.firstConfirmActionCodeForMenu = () => "ACTION_STRATEGY_CONFIRM_SATISFIED";
  params.action.resolveActionCodeTransition = () => null;
  params.action.processActionCode = () => "yes";

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "yes");
});

test("runStepRuntimeActionRoutingLayer maps proceed text intent to current confirm action in chat mode", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "strategy",
    active_specialist: "Strategy",
    last_specialist_result: {},
  };
  params.runtime.inputMode = "chat";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "STRATEGY_MENU_CONFIRM";
  params.action.firstConfirmActionCodeForMenu = () => "ACTION_STRATEGY_CONFIRM_SATISFIED";
  params.action.resolveActionCodeTransition = () => null;
  params.action.processActionCode = () => "yes";

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "yes");
});

test("runStepRuntimeActionRoutingLayer maps proceed text intent to guidance action when confirm is unavailable", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "strategy",
    active_specialist: "Strategy",
    last_specialist_result: {},
  };
  params.runtime.inputMode = "chat";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "STRATEGY_MENU_ASK";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.firstGuidanceActionCodeForMenu = () => "ACTION_STRATEGY_ASK_3_QUESTIONS";
  params.action.resolveActionCodeTransition = () => null;
  params.action.processActionCode = () => "__ROUTE__STRATEGY_ASK_3_QUESTIONS__";

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "__ROUTE__STRATEGY_ASK_3_QUESTIONS__");
});
