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
      wording_choice_presentation: "picker",
      wording_choice_target_field: "targetgroup",
      wording_choice_user_raw: "I mean all companies that build complex products.",
      wording_choice_user_normalized: "I mean all companies that build complex products.",
      wording_choice_agent_current: "Industrial manufacturers with technical product development.",
      feedback_reason_text: "This makes the target group specific enough to guide the next step.",
      wording_choice_user_variant_semantics: "step_variant",
      wording_choice_user_variant_stepworthy: "true",
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
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null,
    _actionCodes?: unknown,
    _renderedActions?: unknown,
    wordingChoice?: Record<string, unknown> | null
  ) => ({
    ...payload,
    specialist,
    ui: {
      flags: flagsOverride || {},
      ...(wordingChoice ? { wording_choice: wordingChoice } : {}),
    },
    blocked_pending: true,
  });

  return {
    runtime: {
      state: buildBaseState() as any,
      userMessage: "Nee, ik bedoel echt industriële maakbedrijven.",
      actionCodeRaw: "",
      lastSpecialistResult: {},
      model: "gpt-5-mini",
      inputMode: "widget" as const,
      wordingChoiceEnabled: true,
      wordingChoiceIntentV1: intentEnabled,
      uiI18nTelemetry: {},
    },
    ids: {
      step0Id: "step0",
      dreamStepId: "dream",
      dreamSpecialist: "Dream",
      purposeStepId: "purpose",
      purposeSpecialist: "Purpose",
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
      shouldPretransitionActionCode: () => true,
      setDreamRuntimeMode: () => {},
      getDreamRuntimeMode: () => "self" as const,
    },
    state: {
      provisionalValueForStep: () => "",
      clearProvisionalValue: (state: any) => state,
      clearStepInteractiveState,
      applyPostSpecialistStateMutations: ({ prevState, decision, specialistResult }: any) => ({
        ...prevState,
        current_step: String(decision.current_step || ""),
        active_specialist: String(decision.specialist_to_call || ""),
        intro_shown_for_step:
          String(specialistResult?.action || "").trim() === "INTRO"
            ? String(decision.current_step || "")
            : String((prevState as Record<string, unknown>).intro_shown_for_step || ""),
        last_specialist_result: specialistResult,
      }),
      isUiStateHygieneSwitchV1Enabled: () => true,
      isClearlyGeneralOfftopicInput: () => false,
      shouldTreatAsStepContributingInput: () => true,
      resolvePendingWordingChoiceIntent: () => ({ intent: "content_input" as const, anchor: "user_input" as const }),
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "unclear" as const,
        user_variant_is_stepworthy: false,
      }),
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
      buildWordingChoiceFromTurn: (_params: any) => ({
        specialist: {
          ...buildBaseState().last_specialist_result,
          wording_choice_pending: "true",
        },
        wordingChoice: {
          enabled: true,
          mode: "text" as const,
          user_text: "updated user variant",
          suggestion_text: "existing suggestion",
          user_items: [],
          suggestion_items: [],
          instruction: "pick one",
        },
      }),
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
      applyCentralMetaTopicRouter: ({ specialistResult }: any) => specialistResult,
      finalizeResponse: (payload: any) => payload,
      attachRegistryPayload,
      resolveResponseUiFlags: () => null,
      turnResponseEngine: {
        renderValidateRecover: ({ state, specialist }: any) => ({
          ok: true,
          value: {
            state,
            specialist: {
              ...specialist,
              action: "ASK",
            },
            renderedStatus: "incomplete_output",
            actionCodes: [],
            renderedActions: [],
            contractMeta: {
              contractId: "",
              contractVersion: "v1",
              textKeys: [],
            },
          },
        }),
        attachAndFinalize: ({ state, specialist, responseUiFlags, actionCodesOverride, renderedActionsOverride, contractMetaOverride }: any) => ({
          ok: true,
          tool: "run_step",
          current_step_id: String(state.current_step || ""),
          active_specialist: String(state.active_specialist || ""),
          specialist,
          state,
          ui: {
            flags: responseUiFlags || {},
            action_codes: actionCodesOverride || [],
            actions: renderedActionsOverride || [],
            contract_meta: contractMetaOverride || null,
          },
        }),
        finalize: (payload: any) => payload,
      },
    },
  };
}

test("runStepRuntimeActionRoutingLayer rebuilds active wording-choice as a third variant for new step content", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(false) as any);
  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(result.submittedTextIntent, "content_input");
  assert.equal(result.submittedTextAnchor, "user_input");
  assert.equal(
    Boolean(((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.flags?.require_wording_pick),
    true
  );
  assert.equal(
    String((((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.wording_choice as Record<string, unknown>)?.user_text || ""),
    "updated user variant"
  );
});

test("runStepRuntimeActionRoutingLayer accepts the pending suggestion explicitly without leaving residual picker state", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Ja, deze past goed.";
  params.state.classifyAcceptedOutputUserTurn = async () => ({
    turn_kind: "accept_existing_suggestion" as const,
    user_variant_is_stepworthy: true,
  });
  params.wording.applyWordingPickSelection = () => ({
    handled: true,
    specialist: {
      action: "ASK",
      message: "We gaan door met deze formulering.",
      wording_choice_pending: "false",
      wording_choice_selected: "suggestion",
    },
    nextState: {
      ...buildBaseState(),
      last_specialist_result: {
        action: "ASK",
        message: "We gaan door met deze formulering.",
        wording_choice_pending: "false",
        wording_choice_selected: "suggestion",
      },
    } as any,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result.response);
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "suggestion");
  assert.equal(
    Boolean(((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.flags?.require_wording_pick),
    false
  );
});

test("runStepRuntimeActionRoutingLayer keeps explicit suggestion rejection inside the wording-choice widget flow", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result.response);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(
    Boolean(((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.flags?.require_wording_pick),
    true
  );
  assert.equal(
    String((((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.wording_choice as Record<string, unknown>)?.suggestion_text || ""),
    "suggestion"
  );
});

test("runStepRuntimeActionRoutingLayer suspends the picker before returning an off-topic response", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Can you explain how this app works?";
  params.state.isClearlyGeneralOfftopicInput = () => true;
  params.state.shouldTreatAsStepContributingInput = () => false;
  params.behavior.normalizeNonStep0OfftopicSpecialist = ({ specialistResult }: any) => ({
    ...specialistResult,
    action: "ASK",
    message: "This is off-topic for the current step.",
    is_offtopic: true,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.is_offtopic || ""), "true");
  assert.equal(
    Boolean(((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.flags?.require_wording_pick),
    false
  );
  assert.equal(
    "wording_choice" in (((result.response as Record<string, unknown>).ui as Record<string, unknown>) || {}),
    false
  );
});

test("runStepRuntimeActionRoutingLayer suspends pending picker state when no picker payload can be rebuilt", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.wording.buildWordingChoiceFromPendingSpecialist = () => null;

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(
    Boolean(((result.response as Record<string, unknown>).ui as Record<string, unknown>)?.flags?.require_wording_pick),
    false
  );
});

test("runStepRuntimeActionRoutingLayer keeps dream scoring free text available for reclustering input", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    __dream_runtime_mode: "builder_scoring",
    last_specialist_result: {
      scoring_phase: "true",
      suggest_dreambuilder: "true",
      statements: Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`),
      clusters: [
        {
          theme: "Future",
          statement_indices: Array.from({ length: 20 }, (_, index) => index),
        },
      ],
    },
  };
  params.runtime.userMessage = "Nog een extra statement over meer vertrouwen tussen mensen.";
  params.action.getDreamRuntimeMode = (state: Record<string, unknown>) =>
    String(state.__dream_runtime_mode || "self") as any;
  params.wording.isWordingChoiceEligibleContext = () => false;
  params.state.shouldTreatAsStepContributingInput = () => true;

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "Nog een extra statement over meer vertrouwen tussen mensen.");
  assert.equal(String((result.state as Record<string, unknown>).__dream_runtime_mode || ""), "builder_scoring");
});

test("runStepRuntimeActionRoutingLayer does not pretransition special-route-owned actions", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    __ui_phase_by_step: {
      dream: "dream:ASK:DREAM_MENU_SUGGESTIONS:v1",
    },
    last_specialist_result: {},
  };
  params.runtime.actionCodeRaw = "ACTION_DREAM_SUGGESTIONS_PICK_ONE";
  params.runtime.userMessage = "ACTION_DREAM_SUGGESTIONS_PICK_ONE";
  params.action.nextMenuByActionCode = {
    ACTION_DREAM_SUGGESTIONS_PICK_ONE: {
      step_id: "dream",
      from_menu_ids: ["DREAM_MENU_SUGGESTIONS"],
      to_menu_id: "DREAM_MENU_REFINE",
    },
  };
  params.action.resolveActionCodeTransition = () => ({
    targetStepId: "dream",
    targetMenuId: "DREAM_MENU_REFINE",
    renderMode: "menu" as const,
  });
  params.action.shouldPretransitionActionCode = (actionCode: string) =>
    actionCode !== "ACTION_DREAM_SUGGESTIONS_PICK_ONE";
  params.action.processActionCode = () => "__ROUTE__DREAM_PICK_ONE__";

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "__ROUTE__DREAM_PICK_ONE__");
  assert.equal(
    String((((result.state as Record<string, unknown>).__ui_phase_by_step as Record<string, unknown>) || {}).dream || ""),
    "dream:ASK:DREAM_MENU_SUGGESTIONS:v1"
  );
});

test("runStepRuntimeActionRoutingLayer returns a deterministic Dream intro response for ACTION_STEP0_READY_START", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_STEP0_READY_START";
  params.runtime.state = {
    current_step: "step0",
    active_specialist: "Step0",
    intro_shown_session: "true",
    intro_shown_for_step: "step0",
    last_specialist_result: {
      action: "ASK",
      message: "Ready to start.",
    },
  };
  params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
    String(specialist.message || "");
  params.behavior.applyCentralMetaTopicRouter = ({ stepId, specialistResult }: any) => ({
    ...specialistResult,
    message: stepId === "dream" ? "Dream intro from catalog." : "",
  });
  params.behavior.turnResponseEngine.renderValidateRecover = ({ state, specialist, previousSpecialist }: any) => {
    assert.equal(String(state.current_step || ""), "dream");
    assert.equal(String(state.active_specialist || ""), "Dream");
    assert.equal(String(previousSpecialist.action || ""), "ASK");
    assert.equal(String(specialist.action || ""), "INTRO");
    assert.equal(String(specialist.message || ""), "Dream intro from catalog.");
    return {
      ok: true,
      value: {
        state,
        specialist: {
          ...specialist,
          action: "ASK",
          ui_show_step_intro_chrome: true,
        },
        renderedStatus: "incomplete_output",
        actionCodes: ["ACTION_DREAM_INTRO_EXPLAIN_MORE", "ACTION_DREAM_INTRO_START_EXERCISE"],
        renderedActions: [],
        contractMeta: {
          contractId: "dream:incomplete_output:DREAM_MENU_INTRO",
          contractVersion: "v1",
          textKeys: ["step.dream.question.with_options"],
        },
      },
    };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result.response);
  assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "dream");
  assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "Dream");
  assert.equal(String(((result.response as Record<string, unknown>).specialist as Record<string, unknown>).message || ""), "Dream intro from catalog.");
  assert.equal(
    String((((result.response as Record<string, unknown>).specialist as Record<string, unknown>).ui_show_step_intro_chrome || "")),
    "true"
  );
});

test("runStepRuntimeActionRoutingLayer returns a deterministic Purpose intro response for Dream confirm actions", async () => {
  const actions = ["ACTION_DREAM_REFINE_CONFIRM", "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM"];

  for (const actionCode of actions) {
    const params = buildParams(true) as any;
    params.runtime.actionCodeRaw = actionCode;
    params.runtime.state = {
      current_step: "dream",
      active_specialist: actionCode === "ACTION_DREAM_REFINE_CONFIRM" ? "Dream" : "DreamExplainer",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      dream_final: "Mindd droomt van een wereld met oprechte verbinding.",
      last_specialist_result: {
        action: "ASK",
        message: "Dream confirmed.",
      },
    };
    params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
      String(specialist.message || "");
    params.behavior.applyCentralMetaTopicRouter = ({ stepId, specialistResult }: any) => ({
      ...specialistResult,
      message: stepId === "purpose" ? "Purpose intro from catalog for Mindd." : "",
    });
    params.behavior.turnResponseEngine.renderValidateRecover = ({ state, specialist, previousSpecialist }: any) => {
      assert.equal(String(state.current_step || ""), "purpose");
      assert.equal(String(state.active_specialist || ""), "Purpose");
      assert.equal(String(previousSpecialist.action || ""), "ASK");
      assert.equal(String(specialist.action || ""), "INTRO");
      assert.equal(String(specialist.message || ""), "Purpose intro from catalog for Mindd.");
      return {
        ok: true,
        value: {
          state,
          specialist: {
            ...specialist,
            action: "ASK",
            ui_show_step_intro_chrome: true,
          },
          renderedStatus: "incomplete_output",
          actionCodes: ["ACTION_PURPOSE_INTRO_EXPLAIN_MORE", "ACTION_PURPOSE_INTRO_START_EXERCISE"],
          renderedActions: [],
          contractMeta: {
            contractId: "purpose:incomplete_output:PURPOSE_MENU_INTRO",
            contractVersion: "v1",
            textKeys: ["step.purpose.question.with_options"],
          },
        },
      };
    };

    const result = await runStepRuntimeActionRoutingLayer(params);

    assert.ok(result.response);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "purpose");
    assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "Purpose");
    assert.equal(
      String((((result.response as Record<string, unknown>).specialist as Record<string, unknown>).message || "")),
      "Purpose intro from catalog for Mindd."
    );
  }
});

test("runStepRuntimeActionRoutingLayer strips stale single-value content before rebuilding a resumed picker payload", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_TARGETGROUP_POSTREFINE_CONFIRM";
  params.runtime.userMessage = "";
  params.runtime.state.last_specialist_result = {
    ...params.runtime.state.last_specialist_result,
    message: [
      "Je voorstel is te algemeen.",
      "",
      "JE HUIDIGE DOELGROEP VOOR MINDD IS",
      "",
      "Industrial manufacturers with technical product development.",
    ].join("\n"),
    refined_formulation: "Industrial manufacturers with technical product development.",
    ui_content: {
      kind: "single_value",
      heading: "JE HUIDIGE DOELGROEP VOOR MINDD IS",
      canonical_text: "Industrial manufacturers with technical product development.",
    },
  };
  params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
    String(specialist.message || "");
  params.behavior.attachRegistryPayload = (
    payload: Record<string, unknown>,
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null
  ) => ({
    ...payload,
    specialist,
    ui: {
      flags: flagsOverride || {},
    },
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(String((result.response as Record<string, unknown>).text || ""), "");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.message || ""), "");
  assert.equal(String(specialist.refined_formulation || ""), "");
  assert.equal("ui_content" in specialist, false);
  const responseSpecialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal("ui_content" in responseSpecialist, false);
});

test("runStepRuntimeActionRoutingLayer reroutes resumed Dream picker to canonical when stored user variant is not stepworthy", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_DREAM_REFINE_CONFIRM";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_target_field: "dream",
      wording_choice_user_raw:
        "Ik zou willen dat mensen gezonder zouden eten met minder bewerkt voedsel en voedsel eten waar minimale tot geen ongezonde toevoegingen in zitten.",
      wording_choice_user_normalized:
        "Ik zou willen dat mensen gezonder zouden eten met minder bewerkt voedsel en voedsel eten waar minimale tot geen ongezonde toevoegingen in zitten.",
      wording_choice_agent_current:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      message: "Ik denk dat ik je begrijp.",
      refined_formulation:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
    },
  };
  params.state.classifyAcceptedOutputUserTurn = async () => ({
    turn_kind: "raw_source_content" as const,
    user_variant_is_stepworthy: false,
  });
  params.behavior.attachRegistryPayload = (payload: Record<string, unknown>, specialist: Record<string, unknown>) => ({
    ...payload,
    specialist,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_presentation || ""), "canonical");
  assert.equal(String(specialist.wording_choice_user_variant_stepworthy || ""), "false");
  assert.equal(String(specialist.wording_choice_user_variant_semantics || ""), "raw_source_content");
});

test("runStepRuntimeActionRoutingLayer proceeds from single-value confirm actions when canonical value only exists in ui content", async () => {
  const cases = [
    {
      actionCode: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
      currentStep: "dream",
      activeSpecialist: "DreamExplainer",
      finalField: "dream_final",
      nextStep: "purpose",
      fieldKey: "dream",
      heading: "JE HUIDIGE DROOM VOOR FLUEROP IS",
      canonical: "FluerOp droomt van een wereld waarin mensen zich verbonden voelen met de natuur.",
    },
    {
      actionCode: "ACTION_DREAM_REFINE_CONFIRM",
      currentStep: "dream",
      activeSpecialist: "Dream",
      finalField: "dream_final",
      nextStep: "purpose",
      fieldKey: "dream",
      heading: "JE HUIDIGE DROOM VOOR FLUEROP IS",
      canonical: "FluerOp droomt van een wereld waarin mensen zich verbonden voelen met de natuur.",
    },
    {
      actionCode: "ACTION_PURPOSE_REFINE_CONFIRM",
      currentStep: "purpose",
      activeSpecialist: "Purpose",
      finalField: "purpose_final",
      nextStep: "bigwhy",
      fieldKey: "purpose",
      heading: "JE HUIDIGE DASEINSREDEN VOOR FLUEROP IS",
      canonical: "FluerOp bestaat om mensen opnieuw verbinding met natuur en rust te laten ervaren.",
    },
    {
      actionCode: "ACTION_BIGWHY_REFINE_CONFIRM",
      currentStep: "bigwhy",
      activeSpecialist: "BigWhy",
      finalField: "bigwhy_final",
      nextStep: "role",
      fieldKey: "bigwhy",
      heading: "JE HUIDIGE BIG WHY VOOR FLUEROP IS",
      canonical: "Mensen verdienen rust, richting en verbondenheid in een druk bestaan.",
    },
    {
      actionCode: "ACTION_ROLE_REFINE_CONFIRM",
      currentStep: "role",
      activeSpecialist: "Role",
      finalField: "role_final",
      nextStep: "entity",
      fieldKey: "role",
      heading: "JE HUIDIGE ROL VOOR FLUEROP IS",
      canonical: "FluerOp is de gids die mensen helpt opnieuw in verbinding te leven met natuur en ritme.",
    },
    {
      actionCode: "ACTION_ENTITY_EXAMPLE_CONFIRM",
      currentStep: "entity",
      activeSpecialist: "Entity",
      finalField: "entity_final",
      nextStep: "strategy",
      fieldKey: "entity",
      heading: "JE HUIDIGE ENTITEIT VOOR FLUEROP IS",
      canonical: "FluerOp is een merk voor natuurlijke ritmes, rust en verbonden leven.",
    },
    {
      actionCode: "ACTION_TARGETGROUP_POSTREFINE_CONFIRM",
      currentStep: "targetgroup",
      activeSpecialist: "TargetGroup",
      finalField: "targetgroup_final",
      nextStep: "productsservices",
      fieldKey: "targetgroup",
      heading: "JE HUIDIGE DOELGROEP VOOR FLUEROP IS",
      canonical: "Mensen die zich vervreemd voelen van natuur en op zoek zijn naar meer rust en eenvoud.",
    },
  ] as const;

  for (const current of cases) {
    const params = buildParams(true) as any;
    params.runtime.actionCodeRaw = current.actionCode;
    params.runtime.userMessage = "";
    params.runtime.state = {
      current_step: current.currentStep,
      active_specialist: current.activeSpecialist,
      [current.finalField]: "",
      provisional_by_step: {},
      provisional_source_by_step: {},
      last_specialist_result: {
        ui_content: {
          kind: "single_value",
          heading: current.heading,
          canonical_text: current.canonical,
        },
        refined_formulation: "",
        [current.fieldKey]: "",
        wording_choice_pending: "false",
      },
    };
    params.state.provisionalValueForStep = () => "";

    const result = await runStepRuntimeActionRoutingLayer(params);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), current.nextStep);
    assert.equal(String((result.state as Record<string, unknown>)[current.finalField] || ""), current.canonical);
    if (
      current.actionCode === "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM" ||
      current.actionCode === "ACTION_DREAM_REFINE_CONFIRM"
    ) {
      assert.ok(result.response);
      assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "Purpose");
      assert.equal(
        String((((result.response as Record<string, unknown>).specialist as Record<string, unknown>).action || "")),
        "ASK"
      );
    } else {
      assert.equal(result.response, null);
      assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "");
    }
  }
});

test("runStepRuntimeActionRoutingLayer proceeds from Dream confirm when canonical pending wording state is hidden behind the card", async () => {
  const cases = [
    {
      actionCode: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
      activeSpecialist: "DreamExplainer",
    },
    {
      actionCode: "ACTION_DREAM_REFINE_CONFIRM",
      activeSpecialist: "Dream",
    },
  ] as const;
  const canonical = "FluerOp droomt van een wereld waarin mensen zich verbonden voelen met de natuur.";

  for (const current of cases) {
    const params = buildParams(true) as any;
    params.runtime.actionCodeRaw = current.actionCode;
    params.runtime.userMessage = "";
    params.runtime.state = {
      current_step: "dream",
      active_specialist: current.activeSpecialist,
      dream_final: "",
      provisional_by_step: {},
      provisional_source_by_step: {},
      last_specialist_result: {
        ui_content: {
          kind: "single_value",
          heading: "JE HUIDIGE DROOM VOOR FLUEROP IS",
          canonical_text: canonical,
        },
        refined_formulation: canonical,
        dream: "",
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_target_field: "dream",
        wording_choice_presentation: "canonical",
        wording_choice_agent_current: canonical,
        wording_choice_user_raw: "Ik wil dat mensen meer verbonden zijn met natuur.",
        wording_choice_user_normalized: "Ik wil dat mensen meer verbonden zijn met natuur.",
        wording_choice_user_variant_semantics: "raw_source_content",
        wording_choice_user_variant_stepworthy: "false",
      },
    };
    params.state.provisionalValueForStep = () => "";
    params.wording.buildWordingChoiceFromPendingSpecialist = () => null;

    const result = await runStepRuntimeActionRoutingLayer(params);
    assert.ok(result.response);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "purpose");
    assert.equal(String((result.state as Record<string, unknown>).dream_final || ""), canonical);
    assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "Purpose");
    const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
    assert.notEqual(String(specialist.wording_choice_pending || ""), "true");
  }
});

test("runStepRuntimeActionRoutingLayer keeps confirm blocked when a visible picker wording choice is still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_target_field: "dream",
      wording_choice_presentation: "picker",
      wording_choice_user_raw: "Ik wil dat mensen gezonder eten.",
      wording_choice_user_normalized: "Ik wil dat mensen gezonder eten.",
      wording_choice_agent_current:
        "FluerOp droomt van een wereld waarin mensen zich gezond en energiek voelen door puur eten.",
      wording_choice_user_variant_semantics: "step_variant",
      wording_choice_user_variant_stepworthy: "true",
      refined_formulation:
        "FluerOp droomt van een wereld waarin mensen zich gezond en energiek voelen door puur eten.",
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "dream");
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
});

test("runStepRuntimeActionRoutingLayer keeps strategy confirm blocked while grouped compare units are still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_STRATEGY_CONFIRM_SATISFIED";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "strategy",
    active_specialist: "Strategy",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_target_field: "strategy",
      wording_choice_presentation: "picker",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_cursor: "0",
      wording_choice_compare_segments: [
        { kind: "retained", items: ["Recurring revenue", "Expert-led delivery"] },
        { kind: "unit", unit_id: "unit_1" },
      ],
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["Operational simplicity"],
          suggestion_items: ["Operational focus"],
          user_text: "Operational simplicity",
          suggestion_text: "Operational focus",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["Operational simplicity"],
      wording_choice_suggestion_items: ["Operational focus"],
      wording_choice_user_normalized: "Operational simplicity",
      wording_choice_agent_current: "Operational focus",
      statements: ["Recurring revenue", "Expert-led delivery"],
      strategy: ["Recurring revenue", "Expert-led delivery"].join("\n"),
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
});

test("runStepRuntimeActionRoutingLayer keeps rules confirm blocked while grouped compare units are still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_RULES_CONFIRM_ALL";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_target_field: "rulesofthegame",
      wording_choice_presentation: "picker",
      wording_choice_compare_mode: "grouped_units",
      wording_choice_compare_cursor: "0",
      wording_choice_compare_segments: [
        { kind: "retained", items: ["We communicate proactively.", "We keep commitments."] },
        { kind: "unit", unit_id: "unit_1" },
      ],
      wording_choice_compare_units: [
        {
          id: "unit_1",
          user_items: ["We resolve blockers quickly."],
          suggestion_items: ["We escalate blockers early and visibly."],
          user_text: "We resolve blockers quickly.",
          suggestion_text: "We escalate blockers early and visibly.",
          resolution: "",
          confidence: "anchored",
        },
      ],
      wording_choice_user_items: ["We resolve blockers quickly."],
      wording_choice_suggestion_items: ["We escalate blockers early and visibly."],
      wording_choice_user_normalized: "We resolve blockers quickly.",
      wording_choice_agent_current: "We escalate blockers early and visibly.",
      statements: ["We communicate proactively.", "We keep commitments."],
      rulesofthegame: ["We communicate proactively.", "We keep commitments."].join("\n"),
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
});

test("runStepRuntimeActionRoutingLayer keeps free-text variants inside the widget wording-choice flow when enabled", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(true) as any);
  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(result.submittedTextIntent, "content_input");
  assert.equal(result.submittedTextAnchor, "user_input");
});

test("runStepRuntimeActionRoutingLayer implicitly accepts suggestion on pending wording choice only for explicit accept text", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Ja, dit is goed zo.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "accept_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.wording.applyWordingPickSelection = ({ state, routeToken }: any) => {
    if (routeToken !== "__WORDING_PICK_SUGGESTION__") {
      return { handled: false, specialist: {}, nextState: state };
    }
    const selectedSpecialist = {
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
    };
    return {
      handled: true,
      specialist: selectedSpecialist,
      nextState: {
        ...state,
        last_specialist_result: selectedSpecialist,
      },
    };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(result.userMessage, "");
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "suggestion");
});

test("runStepRuntimeActionRoutingLayer clears pending wording choice for feedback without implicit accept", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dit raakt me nog niet echt.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "feedback_on_suggestion" as const,
    anchor: "suggestion" as const,
  });
  let implicitPickCalled = false;
  params.wording.applyWordingPickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__WORDING_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.userMessage, "Dit raakt me nog niet echt.");
  assert.equal(result.submittedTextIntent, "feedback_on_suggestion");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(String(specialist.wording_choice_selected || ""), "");
  assert.equal(String(specialist.pending_suggestion_intent || ""), "feedback_on_suggestion");
  assert.equal(String(specialist.pending_suggestion_anchor || ""), "suggestion");
  assert.equal(String(specialist.pending_suggestion_seed_source || ""), "previous_suggestion");
});

test("runStepRuntimeActionRoutingLayer does not implicit-accept suggestion when user explicitly rejects it", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  let implicitPickCalled = false;
  params.wording.applyWordingPickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__WORDING_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(String(specialist.wording_choice_selected || ""), "");
  assert.equal(String(specialist.pending_suggestion_intent || ""), "reject_suggestion_explicit");
  assert.equal(String(specialist.pending_suggestion_anchor || ""), "suggestion");
});

test("runStepRuntimeActionRoutingLayer handles explicit accept correctly in Dream pending flow", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "dream",
      wording_choice_user_raw: "Wij willen bedrijven helpen groeien.",
      wording_choice_user_normalized: "Wij willen bedrijven helpen groeien.",
      wording_choice_agent_current: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      feedback_reason_text: "This version turns the dream into a clearer world-level change.",
      wording_choice_user_variant_semantics: "step_variant",
      wording_choice_user_variant_stepworthy: "true",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
    },
  };
  params.runtime.userMessage = "Ja, dit klopt.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "accept_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.wording.applyWordingPickSelection = ({ state, routeToken }: any) => ({
    handled: routeToken === "__WORDING_PICK_SUGGESTION__",
    specialist: {
      ...((state.last_specialist_result as Record<string, unknown>) || {}),
      wording_choice_pending: "false",
      wording_choice_selected: "suggestion",
    },
    nextState: {
      ...state,
      last_specialist_result: {
        ...state.last_specialist_result,
        wording_choice_pending: "false",
        wording_choice_selected: "suggestion",
      },
    },
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "suggestion");
});

test("runStepRuntimeActionRoutingLayer keeps explicit reject inside the widget in Dream pending flow", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_presentation: "picker",
      wording_choice_target_field: "dream",
      wording_choice_user_raw: "Wij willen bedrijven helpen groeien.",
      wording_choice_user_normalized: "Wij willen bedrijven helpen groeien.",
      wording_choice_agent_current: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      feedback_reason_text: "This version turns the dream into a clearer world-level change.",
      wording_choice_user_variant_semantics: "step_variant",
      wording_choice_user_variant_stepworthy: "true",
      wording_choice_user_items: [],
      wording_choice_suggestion_items: [],
      wording_choice_base_items: [],
    },
  };
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
});

test("runStepRuntimeActionRoutingLayer suspends the picker and renders a normal widget response for off-topic text", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Wat is de hoofdstad van Frankrijk?";
  params.state.isClearlyGeneralOfftopicInput = () => true;
  params.state.shouldTreatAsStepContributingInput = () => false;
  let normalizedOfftopic = false;
  params.behavior.normalizeNonStep0OfftopicSpecialist = (incoming: any) => {
    normalizedOfftopic = true;
    return {
      ...incoming.specialistResult,
      is_offtopic: true,
      wording_choice_pending: "false",
    };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(normalizedOfftopic, true);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.is_offtopic || ""), "true");
});

test("runStepRuntimeActionRoutingLayer suspends pending wording choice for meta/help text instead of trapping it in the picker", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Kun je uitleggen waarom je deze suggestie doet?";
  params.state.shouldTreatAsStepContributingInput = () => false;
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "content_input" as const,
    anchor: "user_input" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "Kun je uitleggen waarom je deze suggestie doet?");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(
    String(specialist.wording_choice_agent_current || ""),
    "Industrial manufacturers with technical product development."
  );
});

test("runStepRuntimeActionRoutingLayer suspends pending wording choice for locale-control text instead of forcing it into compare logic", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Kun je vanaf nu in het Engels antwoorden?";
  params.state.shouldTreatAsStepContributingInput = () => false;
  params.state.resolvePendingWordingChoiceIntent = () => ({
    intent: "content_input" as const,
    anchor: "user_input" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "Kun je vanaf nu in het Engels antwoorden?");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(
    String(specialist.wording_choice_user_normalized || ""),
    "I mean all companies that build complex products."
  );
});

test("runStepRuntimeActionRoutingLayer lets refine-adjust action codes continue as specialist routes", async () => {
  const scenarios = [
    {
      stepId: "dream",
      activeSpecialist: "DreamExplainer",
      actionCode: "ACTION_DREAM_EXPLAINER_REFINE_ADJUST",
      expectedRoute: "__ROUTE__DREAM_EXPLAINER_REFINE__",
      expectedDreamRuntimeMode: "builder_refine",
    },
    {
      stepId: "purpose",
      activeSpecialist: "Purpose",
      actionCode: "ACTION_PURPOSE_REFINE_ADJUST",
      expectedRoute: "__ROUTE__PURPOSE_REFINE__",
    },
    {
      stepId: "bigwhy",
      activeSpecialist: "BigWhy",
      actionCode: "ACTION_BIGWHY_REFINE_ADJUST",
      expectedRoute: "__ROUTE__BIGWHY_REFINE__",
    },
    {
      stepId: "role",
      activeSpecialist: "Role",
      actionCode: "ACTION_ROLE_REFINE_ADJUST",
      expectedRoute: "__ROUTE__ROLE_ADJUST__",
    },
    {
      stepId: "entity",
      activeSpecialist: "Entity",
      actionCode: "ACTION_ENTITY_EXAMPLE_REFINE",
      expectedRoute: "__ROUTE__ENTITY_REFINE__",
    },
    {
      stepId: "rulesofthegame",
      activeSpecialist: "RulesOfTheGame",
      actionCode: "ACTION_RULES_REFINE_ADJUST",
      expectedRoute: "__ROUTE__RULES_ADJUST__",
    },
  ] as const;

  for (const scenario of scenarios) {
    const params = buildParams(true) as any;
    params.runtime.state = {
      current_step: scenario.stepId,
      active_specialist: scenario.activeSpecialist,
      last_specialist_result: {
        refined_formulation: "Current wording",
      },
    };
    params.runtime.actionCodeRaw = scenario.actionCode;
    params.runtime.userMessage = scenario.actionCode;
    let rebuiltWordingChoice = false;
    let pickedAgentBase = false;
    params.wording.buildWordingChoiceFromTurn = () => {
      rebuiltWordingChoice = true;
      return { specialist: {}, wordingChoice: null };
    };
    params.wording.pickWordingAgentBase = () => {
      pickedAgentBase = true;
      return "";
    };
    params.action.processActionCode = (actionCodeInput: string) => {
      if (actionCodeInput === scenario.actionCode) return scenario.expectedRoute;
      return actionCodeInput;
    };
    let dreamRuntimeModeSet = "";
    params.action.setDreamRuntimeMode = (_state: Record<string, unknown>, mode: string) => {
      dreamRuntimeModeSet = mode;
    };

    const result = await runStepRuntimeActionRoutingLayer(params);
    assert.equal(result.response, null);
    assert.equal(result.userMessage, scenario.expectedRoute);
    assert.equal(rebuiltWordingChoice, false);
    assert.equal(pickedAgentBase, false);
    assert.equal(dreamRuntimeModeSet, scenario.expectedDreamRuntimeMode || "");
  }
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

test("runStepRuntimeActionRoutingLayer preserves rules proceed as user intent and stores semantic block reason when too few rules are available", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    business_name: "Mindd",
    provisional_by_step: {
      rulesofthegame: "• We communiceren proactief.\n• We komen afspraken na.",
    },
    provisional_source_by_step: {
      rulesofthegame: "user_input",
    },
    last_specialist_result: {
      rulesofthegame: "• We communiceren proactief.\n• We komen afspraken na.",
      statements: [
        "We communiceren proactief.",
        "We komen afspraken na.",
      ],
    },
  };
  params.runtime.inputMode = "chat";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.firstGuidanceActionCodeForMenu = () => "ACTION_RULES_ASK_EXPLAIN_MORE";
  params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
    [String(specialist.message || ""), String(specialist.rulesofthegame || "")].filter(Boolean).join("\n\n");
  params.behavior.pickPrompt = (specialist: Record<string, unknown>) => String(specialist.question || "");
  params.behavior.uiStringFromStateMap = (state: any, key: string, fallback: string) =>
    String((state?.ui_strings || {})[key] || fallback || "");
  params.behavior.uiDefaultString = (key: string, fallback = "") => {
    const defaults: Record<string, string> = {
      "rules.proceed.block.prefix": "Je kunt nog niet doorgaan.",
      "rules.proceed.block.reason.min.template": "Je hebt minimaal {0} geldige spelregels nodig; nu zijn het er {1}.",
      "rules.proceed.block.question.min.template":
        "Voeg voldoende interne spelregels toe om op minimaal {0} geldige spelregels te komen.",
    };
    return String(defaults[key] || fallback || "");
  };
  params.behavior.attachRegistryPayload = (payload: Record<string, unknown>, specialist: Record<string, unknown>) => ({
    ...payload,
    specialist,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.proceed_request_intent || ""), "next_step");
  assert.deepEqual(specialist.proceed_block_reason_codes, ["rules_min_count"]);
  assert.equal(Number(specialist.proceed_block_rule_count || 0), 2);
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.match(String((result.response as Record<string, unknown>).text || ""), /Je kunt nog niet doorgaan/);
  assert.doesNotMatch(String((result.response as Record<string, unknown>).text || ""), /Op basis van je input stel ik/);
});

test("runStepRuntimeActionRoutingLayer keeps rules proceed out of picker routing and stores semantic reasons when rules are pending choice", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    business_name: "Mindd",
    provisional_by_step: {
      rulesofthegame:
        "• Gratis is gratis voor iedereen.\n• We komen afspraken na.\n• We communiceren proactief.",
    },
    provisional_source_by_step: {
      rulesofthegame: "user_input",
    },
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      feedback_reason_text:
        "Er staat nog een open wording-keuze klaar. Werk eerst naar één definitieve set spelregels toe.",
      wording_choice_target_field: "rulesofthegame",
      wording_choice_user_items: [
        "Gratis is gratis voor iedereen.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
      wording_choice_suggestion_items: [
        "We passen prijsafspraken consequent en transparant toe in iedere samenwerking.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
      statements: [
        "Gratis is gratis voor iedereen.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
    },
  };
  params.runtime.inputMode = "widget";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = true;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.firstGuidanceActionCodeForMenu = () => "ACTION_RULES_ASK_EXPLAIN_MORE";
  params.wording.isWordingChoiceEligibleContext = () => true;
  params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
    [String(specialist.message || ""), String(specialist.rulesofthegame || "")].filter(Boolean).join("\n\n");
  params.behavior.pickPrompt = (specialist: Record<string, unknown>) => String(specialist.question || "");
  params.behavior.uiStringFromStateMap = (state: any, key: string, fallback: string) =>
    String((state?.ui_strings || {})[key] || fallback || "");
  params.behavior.uiDefaultString = (key: string, fallback = "") => {
    const defaults: Record<string, string> = {
      "rules.proceed.block.prefix": "Je kunt nog niet doorgaan.",
      "rules.proceed.block.reason.external":
        "Minstens een zichtbare regel is een externe belofte of marktclaim. Spelregels moeten beschrijven hoe jullie intern samenwerken.",
      "rules.proceed.block.reason.pending_choice":
        "Er staat nog een open wording-keuze klaar. Werk eerst naar één definitieve set spelregels toe.",
      "rules.proceed.block.question.external":
        "Herschrijf alleen de externe belofte of marktclaim naar interne samenwerkingsregels.",
    };
    return String(defaults[key] || fallback || "");
  };
  params.behavior.attachRegistryPayload = (payload: Record<string, unknown>, specialist: Record<string, unknown>) => ({
    ...payload,
    specialist,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(String(specialist.proceed_request_intent || ""), "next_step");
  assert.deepEqual(specialist.proceed_block_reason_codes, ["rules_pending_choice"]);
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.doesNotMatch(String((result.response as Record<string, unknown>).text || ""), /Op basis van je input stel ik/);
});

test("runStepRuntimeActionRoutingLayer routes rules proceed to confirm for accepted 3-5 rule sets even when one rule is externally phrased", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    provisional_by_step: {
      rulesofthegame:
        "• We bewaken kwaliteit.\n• We doen alles met plezier.\n• We maken de klant koning.\n• We geven minder uit dan er binnenkomt.\n• We zijn punctueel.",
    },
    provisional_source_by_step: {
      rulesofthegame: "wording_pick",
    },
    last_specialist_result: {
      rulesofthegame:
        "• We bewaken kwaliteit.\n• We doen alles met plezier.\n• We maken de klant koning.\n• We geven minder uit dan er binnenkomt.\n• We zijn punctueel.",
      statements: [
        "We bewaken kwaliteit.",
        "We doen alles met plezier.",
        "We maken de klant koning.",
        "We geven minder uit dan er binnenkomt.",
        "We zijn punctueel.",
      ],
    },
  };
  params.runtime.inputMode = "chat";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.processActionCode = () => "__ROUTE__RULES_CONFIRM_ALL__";
  params.state.provisionalValueForStep = (state: Record<string, unknown>, stepId: string) =>
    String(((state.provisional_by_step as Record<string, unknown> | undefined) || {})[stepId] || "");

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "__ROUTE__RULES_CONFIRM_ALL__");
});

test("runStepRuntimeActionRoutingLayer routes rules proceed to confirm when the rules gate is valid even without a visible confirm button", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    provisional_by_step: {
      rulesofthegame:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
    },
    provisional_source_by_step: {
      rulesofthegame: "user_input",
    },
    last_specialist_result: {
      rulesofthegame:
        "• We communiceren proactief.\n• We werken met duidelijke scope.\n• We nemen eigenaarschap.",
      statements: [
        "We communiceren proactief.",
        "We werken met duidelijke scope.",
        "We nemen eigenaarschap.",
      ],
    },
  };
  params.runtime.inputMode = "chat";
  params.runtime.userMessage = "Ga door naar de volgende stap";
  params.runtime.wordingChoiceEnabled = false;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.processActionCode = () => "__ROUTE__RULES_CONFIRM_ALL__";
  params.state.provisionalValueForStep = (state: Record<string, unknown>, stepId: string) =>
    String(((state.provisional_by_step as Record<string, unknown> | undefined) || {})[stepId] || "");

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "__ROUTE__RULES_CONFIRM_ALL__");
});
