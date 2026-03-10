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
      model: "gpt-5-mini",
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
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
  assert.equal(result.submittedTextIntent, "content_input");
  assert.equal(result.submittedTextAnchor, "user_input");
});

test("runStepRuntimeActionRoutingLayer keeps pending state for free-text turns when picker payload is unavailable", async () => {
  const params = buildParams(false) as any;
  params.wording.buildWordingChoiceFromPendingSpecialist = () => null;

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
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
    assert.equal(result.response, null);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), current.nextStep);
    assert.equal(String((result.state as Record<string, unknown>)[current.finalField] || ""), current.canonical);
    assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "");
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
    assert.equal(result.response, null);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "purpose");
    assert.equal(String((result.state as Record<string, unknown>).dream_final || ""), canonical);
    assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "");
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

test("runStepRuntimeActionRoutingLayer releases pending wording choice for free-text intent when enabled", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(true) as any);
  assert.equal(result.response, null);
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
  assert.equal(result.response, null);
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
  assert.equal(result.response, null);
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
      wording_choice_target_field: "dream",
      wording_choice_user_raw: "Wij willen bedrijven helpen groeien.",
      wording_choice_user_normalized: "Wij willen bedrijven helpen groeien.",
      wording_choice_agent_current: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
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
    specialist: {},
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
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(String(specialist.wording_choice_pending || ""), "false");
  assert.equal(String(specialist.wording_choice_selected || ""), "suggestion");
});

test("runStepRuntimeActionRoutingLayer keeps specialist path open for explicit reject in Dream pending flow", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_target_field: "dream",
      wording_choice_user_raw: "Wij willen bedrijven helpen groeien.",
      wording_choice_user_normalized: "Wij willen bedrijven helpen groeien.",
      wording_choice_agent_current: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
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
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(String(specialist.wording_choice_pending || ""), "true");
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
