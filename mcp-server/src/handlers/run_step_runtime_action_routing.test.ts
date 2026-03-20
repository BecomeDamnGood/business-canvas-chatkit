import test from "node:test";
import assert from "node:assert/strict";

import { runStepRuntimeActionRoutingLayer as runStepRuntimeActionRoutingLayerBase } from "./run_step_runtime_action_routing.js";
import {
  clearPendingInteractionState,
  createPendingInteractionState,
  hasRenderablePendingInteractionState,
  patchPendingInteractionState,
  readPendingInteractionState,
} from "../core/state.js";
import {
  createDreamBuilderCompareRuntimeState,
  patchDreamBuilderCompareRuntime,
  readDreamBuilderCompareRuntime,
} from "./dream_builder_compare_runtime.js";

function normalizeCompareFixture(raw: Record<string, unknown>): Record<string, unknown> {
  let next = { ...raw };
  const inlineCompareKeys = [
    "status",
    "mode",
    "presentation",
    "resolution",
    "target_field",
    "variant",
    "user_text",
    "user_normalized_text",
    "user_items",
    "suggestion_text",
    "suggestion_items",
    "base_items",
    "list_semantics",
    "user_label",
    "suggestion_label",
    "grouped_mode",
    "grouped_cursor",
    "grouped_units",
    "grouped_segments",
    "user_variant_semantics",
    "user_variant_stepworthy",
    "feedback_reason_key",
    "feedback_reason_text",
    "pending_text_intent",
    "pending_text_anchor",
    "pending_text_seed_source",
    "pending_text_feedback_text",
    "pending_text_presentation_mode",
  ];
  const hasInlineCompare = inlineCompareKeys.some((key) => key in next);
  if (!readPendingInteractionState(next) && hasInlineCompare) {
    const rawStatus = String(next.status || "").trim().toLowerCase();
    next = patchPendingInteractionState(next, {
      kind: String(next.mode || "").trim() === "list" ? "list_compare" : "text_compare",
      status: rawStatus === "true" ? "pending" : rawStatus === "false" ? "resolved" : (next.status as any),
      render_model: {
        mode: String(next.mode || "").trim() === "list" ? "list" : "text",
        instruction: String(next.instruction || "").trim(),
        feedback_reason_text: String(next.feedback_reason_text || "").trim(),
        user_label: String(next.user_label || "").trim(),
        suggestion_label: String(next.suggestion_label || "").trim(),
        user_text: String(next.user_text || "").trim(),
        suggestion_text: String(next.suggestion_text || "").trim(),
        user_items: Array.isArray(next.user_items) ? (next.user_items as unknown[]).map(String) : [],
        suggestion_items: Array.isArray(next.suggestion_items) ? (next.suggestion_items as unknown[]).map(String) : [],
        retained_items: Array.isArray(next.base_items) ? (next.base_items as unknown[]).map(String) : [],
        units: Array.isArray(next.grouped_units)
          ? (next.grouped_units as Array<Record<string, unknown>>).map((unit) => ({
              user_items: Array.isArray(unit.user_items) ? (unit.user_items as unknown[]).map(String) : [],
              suggestion_items: Array.isArray(unit.suggestion_items) ? (unit.suggestion_items as unknown[]).map(String) : [],
              feedback_reason_text: String(unit.feedback_reason_text || "").trim(),
            }))
          : [],
      },
    });
    for (const key of inlineCompareKeys) delete next[key];
  }
  const compare = readPendingInteractionState(next);
  if (compare) {
    if (hasRenderablePendingInteractionState(compare) && !String(next.pending_interaction_id || "").trim()) {
      next.pending_interaction_id = "__TEST_PENDING_INTERACTION__";
    }
  }
  const dreamBuilderKeys = [
    "dream_builder_kind",
    "dream_builder_current_items",
    "dream_builder_suggested_items",
    "dream_builder_segments",
    "dream_builder_rationale",
    "dream_builder_current_label",
    "dream_builder_suggested_label",
    "dream_builder_retained_heading",
    "dream_builder_instruction",
    "dream_builder_committed_statements",
  ];
  const hasInlineDreamBuilderCompare = dreamBuilderKeys.some((key) => key in next);
  if (!readDreamBuilderCompareRuntime(next) && hasInlineDreamBuilderCompare) {
    next = patchDreamBuilderCompareRuntime(next, {
      kind: String(next.dream_builder_kind || "").trim() as any,
      current_items: Array.isArray(next.dream_builder_current_items)
        ? (next.dream_builder_current_items as unknown[]).map(String)
        : [],
      suggested_items: Array.isArray(next.dream_builder_suggested_items)
        ? (next.dream_builder_suggested_items as unknown[]).map(String)
        : [],
      segments: Array.isArray(next.dream_builder_segments) ? (next.dream_builder_segments as Array<Record<string, unknown>>) : [],
      rationale: String(next.dream_builder_rationale || "").trim(),
      current_label: String(next.dream_builder_current_label || "").trim(),
      suggested_label: String(next.dream_builder_suggested_label || "").trim(),
      retained_heading: String(next.dream_builder_retained_heading || "").trim(),
      instruction: String(next.dream_builder_instruction || "").trim(),
      committed_statements: Array.isArray(next.dream_builder_committed_statements)
        ? (next.dream_builder_committed_statements as unknown[]).map(String)
        : [],
    });
    for (const key of dreamBuilderKeys) delete next[key];
  }
  const dreamBuilderCompare = readDreamBuilderCompareRuntime(next);
  if (dreamBuilderCompare) {
    next = patchDreamBuilderCompareRuntime(next, createDreamBuilderCompareRuntimeState(dreamBuilderCompare));
  }
  return next;
}

function compareState(raw: Record<string, unknown>): ReturnType<typeof readPendingInteractionState> {
  return readPendingInteractionState(raw);
}

function dreamBuilderCompareState(raw: Record<string, unknown>) {
  return readDreamBuilderCompareRuntime(raw);
}

function dreamBuilderComparePendingValue(raw: Record<string, unknown>): string {
  return dreamBuilderCompareState(raw) ? "true" : "false";
}

function withCompareRuntime(
  raw: Record<string, unknown>,
  runtime: Partial<Parameters<typeof createPendingInteractionState>[0]>
): Record<string, unknown> {
  const runtimeRecord = runtime as Record<string, unknown>;
  return {
    ...raw,
    pending_interaction_state: createPendingInteractionState({
      kind:
        String(runtimeRecord.kind || "").trim() ||
        (String(runtimeRecord.mode || "").trim() === "list" ? "list_compare" : "text_compare"),
      status: "pending",
      render_model: {
        mode: String(runtimeRecord.mode || "").trim() === "list" ? "list" : "text",
        instruction: String(runtimeRecord.instruction || "").trim(),
        feedback_reason_text: String(runtimeRecord.feedback_reason_text || "").trim(),
        user_label: String(runtimeRecord.user_label || "").trim(),
        suggestion_label: String(runtimeRecord.suggestion_label || "").trim(),
        user_text: String(runtimeRecord.user_text || "").trim(),
        suggestion_text: String(runtimeRecord.suggestion_text || "").trim(),
        user_items: Array.isArray(runtimeRecord.user_items) ? (runtimeRecord.user_items as unknown[]).map(String) : [],
        suggestion_items: Array.isArray(runtimeRecord.suggestion_items)
          ? (runtimeRecord.suggestion_items as unknown[]).map(String)
          : [],
        retained_items: Array.isArray(runtimeRecord.base_items) ? (runtimeRecord.base_items as unknown[]).map(String) : [],
        units: Array.isArray(runtimeRecord.grouped_units)
          ? (runtimeRecord.grouped_units as Array<Record<string, unknown>>).map((unit) => ({
              user_items: Array.isArray(unit.user_items) ? (unit.user_items as unknown[]).map(String) : [],
              suggestion_items: Array.isArray(unit.suggestion_items) ? (unit.suggestion_items as unknown[]).map(String) : [],
              feedback_reason_text: String(unit.feedback_reason_text || "").trim(),
            }))
          : [],
      },
    }),
  };
}

function withDreamBuilderCompareRuntime(
  raw: Record<string, unknown>,
  runtime: Parameters<typeof createDreamBuilderCompareRuntimeState>[0]
): Record<string, unknown> {
  return {
    ...raw,
    dream_builder_compare_runtime: createDreamBuilderCompareRuntimeState(runtime),
  };
}

function comparePendingValue(raw: Record<string, unknown>): string {
  return hasRenderablePendingInteractionState(compareState(raw)) ? "true" : "false";
}

function comparePresentationValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.presentation || "");
}

function compareTargetFieldValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.target_field || "");
}

function compareUserValue(raw: Record<string, unknown>): string {
  const compare = compareState(raw);
  return String(compare?.user_normalized_text || compare?.user_text || "");
}

function compareSuggestionValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.suggestion_text || "");
}

function compareGroupedModeValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.grouped_mode || "");
}

function compareResolutionValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.resolution || "");
}

function compareUserVariantSemanticsValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.user_variant_semantics || "");
}

function compareUserVariantStepworthyValue(raw: Record<string, unknown>): string {
  return compareState(raw)?.user_variant_stepworthy ? "true" : "false";
}

function comparePendingIntentValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.pending_text_intent || "");
}

function comparePendingAnchorValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.pending_text_anchor || "");
}

function comparePendingSeedSourceValue(raw: Record<string, unknown>): string {
  return String(compareState(raw)?.pending_text_seed_source || "");
}

function compareUserItemsValue(raw: Record<string, unknown>): string[] {
  return compareState(raw)?.user_items || [];
}

function normalizeCompareResult(result: Record<string, unknown> | null | undefined) {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  const normalizedNextState =
    record.nextState && typeof record.nextState === "object"
      ? normalizeCompareStateContainer(record.nextState)
      : null;
  return {
    ...record,
    ...(record.specialist && typeof record.specialist === "object"
      ? { specialist: normalizeCompareFixture(record.specialist as Record<string, unknown>) }
      : {}),
    ...(normalizedNextState
      ? {
          nextState: normalizedNextState,
        }
      : {}),
  };
}

function normalizeCompareStateContainer(raw: unknown): Record<string, unknown> {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (record.last_specialist_result && typeof record.last_specialist_result === "object") {
    const normalizedLastSpecialist = normalizeCompareFixture(record.last_specialist_result as Record<string, unknown>);
    return {
      ...record,
      last_specialist_result: clearPendingInteractionState(normalizedLastSpecialist),
      pending_interaction_state:
        readPendingInteractionState(record) ||
        readPendingInteractionState(normalizedLastSpecialist) ||
        {},
    };
  }
  return record;
}

async function runStepRuntimeActionRoutingLayer(params: any) {
  if (params?.runtime?.state && typeof params.runtime.state === "object") {
    params.runtime.state = normalizeCompareStateContainer(params.runtime.state);
  }
  if (params?.runtime?.lastSpecialistResult && typeof params.runtime.lastSpecialistResult === "object") {
    params.runtime.lastSpecialistResult = normalizeCompareFixture(params.runtime.lastSpecialistResult);
  }

  if (params?.compare?.applyComparePickSelection) {
    const original = params.compare.applyComparePickSelection;
    params.compare.applyComparePickSelection = (...args: unknown[]) => normalizeCompareResult(original(...args));
  }
  if (params?.compare?.buildCompareFromTurn) {
    const original = params.compare.buildCompareFromTurn;
    params.compare.buildCompareFromTurn = (...args: unknown[]) => normalizeCompareResult(original(...args));
  }
  if (params?.behavior?.normalizeNonStep0OfftopicSpecialist) {
    const original = params.behavior.normalizeNonStep0OfftopicSpecialist;
    params.behavior.normalizeNonStep0OfftopicSpecialist = (...args: unknown[]) =>
      normalizeCompareFixture(original(...args));
  }
  if (params?.behavior?.turnResponseEngine?.renderValidateRecover) {
    const original = params.behavior.turnResponseEngine.renderValidateRecover;
    params.behavior.turnResponseEngine.renderValidateRecover = (...args: unknown[]) => {
      const result = original(...args);
      if (!result || typeof result !== "object" || !("ok" in result) || !(result as { ok?: boolean }).ok) return result;
      const value = (result as { value?: Record<string, unknown> }).value;
      if (!value || typeof value !== "object") return result;
      return {
        ...result,
        value: {
          ...value,
          ...(value.specialist && typeof value.specialist === "object"
            ? { specialist: normalizeCompareFixture(value.specialist as Record<string, unknown>) }
            : {}),
        },
      };
    };
  }
  if (params?.behavior?.turnResponseEngine?.attachAndFinalize) {
    const original = params.behavior.turnResponseEngine.attachAndFinalize;
    params.behavior.turnResponseEngine.attachAndFinalize = (...args: unknown[]) => {
      const result = original(...args);
      if (!result || typeof result !== "object") return result;
      return {
        ...result,
        ...(result.specialist && typeof result.specialist === "object"
          ? { specialist: normalizeCompareFixture(result.specialist as Record<string, unknown>) }
          : {}),
        ...(result.state && typeof result.state === "object"
          ? { state: normalizeCompareStateContainer(result.state) }
          : {}),
      };
    };
  }

  return runStepRuntimeActionRoutingLayerBase(params);
}

function buildBaseState(): Record<string, unknown> {
  return {
    current_step: "targetgroup",
    active_specialist: "TargetGroup",
    last_specialist_result: normalizeCompareFixture({
      status: "true",
      resolution: "",
      mode: "text",
      presentation: "picker",
      target_field: "targetgroup",
      user_text: "I mean all companies that build complex products.",
      user_normalized_text: "I mean all companies that build complex products.",
      suggestion_text: "Industrial manufacturers with technical product development.",
      feedback_reason_text: "This makes the target group specific enough to guide the next step.",
      user_variant_semantics: "step_variant",
      user_variant_stepworthy: "true",
      user_items: [],
      suggestion_items: [],
      base_items: [],
    }),
  };
}

function buildParams(intentEnabled: boolean) {
  const clearStepInteractiveState = (state: Record<string, unknown>, _stepId: string) => ({
    ...clearPendingInteractionState(state),
    __pending_interaction_id: "",
    last_specialist_result: clearPendingInteractionState({
      ...((state.last_specialist_result as Record<string, unknown>) || {}),
      pending_interaction_id: "",
    }),
  });

  const attachRegistryPayload = (
    payload: Record<string, unknown>,
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null,
    _actionCodes?: unknown,
    _renderedActions?: unknown,
    compare?: Record<string, unknown> | null
  ) => ({
    ...payload,
    specialist: normalizeCompareFixture(specialist),
    ui: {
      flags: flagsOverride || {},
      ...(compare ? { compare: compare } : {}),
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
      compareEnabled: true,
      compareIntentV1: intentEnabled,
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
      pretransitionByActionCode: {},
      nextMenuByActionCode: {},
      dreamStartExerciseActionCodes: new Set<string>(),
      resolveActionCodeTransition: () => null,
      inferCurrentMenuForStep: () => "",
      setUiRenderModeByStep: () => {},
      applyUiPhaseByStep: () => {},
      buildContractId: () => "",
      processActionCode: (actionCodeInput: string) => actionCodeInput,
      firstConfirmActionCodeForStep: () => "",
      firstGuidanceActionCodeForStep: () => "",
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
      applyPostSpecialistStateMutations: ({ prevState, decision, specialistResult, pendingInteractionState }: any) => {
        const normalizedSpecialist = normalizeCompareFixture(specialistResult);
        return {
          ...prevState,
          current_step: String(decision.current_step || ""),
          active_specialist: String(decision.specialist_to_call || ""),
          intro_shown_for_step:
            String(specialistResult?.action || "").trim() === "INTRO"
              ? String(decision.current_step || "")
              : String((prevState as Record<string, unknown>).intro_shown_for_step || ""),
          last_specialist_result: clearPendingInteractionState(normalizedSpecialist),
          pending_interaction_state:
            pendingInteractionState ||
            readPendingInteractionState(normalizedSpecialist) ||
            {},
        };
      },
      isUiStateHygieneSwitchV1Enabled: () => true,
      isClearlyGeneralOfftopicInput: () => false,
      shouldTreatAsStepContributingInput: () => true,
      resolvePendingCompareIntent: () => ({ intent: "content_input" as const, anchor: "user_input" as const }),
      classifyAcceptedOutputUserTurn: async () => ({
        turn_kind: "unclear" as const,
        user_variant_is_stepworthy: false,
      }),
      bumpUiI18nCounter: () => {},
    },
    compare: {
      isCompareEligibleContext: () => true,
      buildCompareFromPendingSpecialist: () => ({
        enabled: true,
        mode: "text" as const,
        user_text: "user",
        suggestion_text: "suggestion",
        user_items: [],
        suggestion_items: [],
        instruction: "pick one",
      }),
      applyComparePickSelection: () =>
        normalizeCompareResult({
          handled: false,
          specialist: {},
          nextState: buildBaseState() as any,
        }),
      isComparePickRouteToken: () => false,
      isRefineAdjustRouteToken: () => false,
      buildCompareFromTurn: (_params: any) =>
        normalizeCompareResult({
          specialist: normalizeCompareFixture({
            ...((buildBaseState().last_specialist_result as Record<string, unknown>) || {}),
            status: "true",
            user_normalized_text: "updated user variant",
            suggestion_text: "suggestion",
          }),
          pendingState: createPendingInteractionState({
            kind: "text_compare",
            render_model: {
              mode: "text",
              user_text: "updated user variant",
              suggestion_text: "existing suggestion",
              feedback_reason_text: "pick one",
            },
          }),
          compare: {
            enabled: true,
            mode: "text" as const,
            user_text: "updated user variant",
            suggestion_text: "existing suggestion",
            user_items: [],
            suggestion_items: [],
            instruction: "pick one",
          },
        }),
      pickCompareAgentBase: () => "",
      copyPendingCompareState: (specialistResult: Record<string, unknown>) => specialistResult,
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
            specialist: normalizeCompareFixture({
              ...specialist,
              action: "ASK",
            }),
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
          specialist: normalizeCompareFixture(specialist),
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

test("runStepRuntimeActionRoutingLayer rebuilds active compare as a third variant for new step content", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(false) as any);
  assert.ok(result);
  const compareStateContainer = (result.state as Record<string, unknown>) || {};
  assert.equal(comparePendingValue(compareStateContainer), "true");
  assert.equal(result.submittedTextIntent, "content_input");
  assert.equal(result.submittedTextAnchor, "user_input");
  assert.ok(result.response);
});

test("runStepRuntimeActionRoutingLayer keeps Dream Builder pending free text out of the ordinary compare runtime path", async () => {
  const params = buildParams(false) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    __dream_runtime_mode: "builder_collect",
    last_specialist_result: {
      status: "true",
      mode: "list",
      grouped_mode: "grouped_units",
      variant: "grouped_list_units",
      dream_builder_kind: "overlap_merge_compare",
      dream_builder_current_items: ["Existing statement", "User variant"],
      dream_builder_suggested_items: ["Merged statement"],
      dream_builder_segments: [{ kind: "retained", items: ["Another committed statement"] }],
    },
  };
  params.runtime.userMessage = "Ik wil dit anders formuleren.";
  params.action.getDreamRuntimeMode = () => "builder_collect" as const;
  params.compare.buildCompareFromPendingSpecialist = () => {
    throw new Error("ordinary compare pending path should be unreachable for Dream Builder");
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(dreamBuilderComparePendingValue(specialist), "true");
});

test("runStepRuntimeActionRoutingLayer keeps widget score-submit turns on the action code instead of the clicked label", async () => {
  const params = buildParams(false) as any;
  const ensureUiStringsInputs: string[] = [];
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    __dream_runtime_mode: "builder_scoring",
    __last_clicked_label_for_contract: "Formulate my dream for me based on what I find important.",
    last_specialist_result: {
      action: "ASK",
      scoring_phase: "true",
      clusters: [{ theme: "Trust", statement_indices: [0] }],
      statements: ["Statement 1"],
    },
  };
  params.runtime.userMessage = "";
  params.runtime.actionCodeRaw = "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES";
  params.action.getDreamRuntimeMode = () => "builder_scoring" as const;
  params.behavior.ensureUiStrings = async (state: any, routeOrText: string) => {
    ensureUiStringsInputs.push(String(routeOrText || ""));
    return state;
  };
  params.behavior.turnResponseEngine.renderValidateRecover = ({ state, specialist }: any) => ({
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
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result);
  assert.notEqual(ensureUiStringsInputs[0], "Formulate my dream for me based on what I find important.");
});

test("runStepRuntimeActionRoutingLayer accepts the pending compare suggestion explicitly without leaving residual picker state", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Ja, deze past goed.";
  params.state.classifyAcceptedOutputUserTurn = async () => ({
    turn_kind: "accept_existing_suggestion" as const,
    user_variant_is_stepworthy: true,
  });
  params.compare.applyComparePickSelection = () => ({
    handled: true,
    specialist: {
      action: "ASK",
      message: "We gaan door met deze formulering.",
      status: "false",
      resolution: "suggestion",
    },
    nextState: {
      ...buildBaseState(),
      last_specialist_result: {
        action: "ASK",
        message: "We gaan door met deze formulering.",
        status: "false",
        resolution: "suggestion",
      },
    } as any,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result);
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "false");
});

test("runStepRuntimeActionRoutingLayer keeps explicit suggestion rejection inside the compare widget flow", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "true");
  assert.ok(result.response);
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

  assert.ok(result);
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "false");
});

test("runStepRuntimeActionRoutingLayer suspends pending picker state when no picker payload can be rebuilt", async () => {
  const params = buildParams(false) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.compare.buildCompareFromPendingSpecialist = () => null;

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.ok(result);
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "false");
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
  params.compare.isCompareEligibleContext = () => false;
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
      to_menu_id: "DREAM_MENU_NEXT_STEP",
    },
  };
  params.action.resolveActionCodeTransition = () => ({
    targetStepId: "dream",
    targetMenuId: "DREAM_MENU_NEXT_STEP",
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
  assert.equal(
    String((((result.state as Record<string, unknown>).last_specialist_result as Record<string, unknown>)?.action || "")),
    "ASK"
  );
  assert.equal(
    String((((result.state as Record<string, unknown>).last_specialist_result as Record<string, unknown>)?.message || "")),
    "Dream intro from catalog."
  );
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
      String((((result.state as Record<string, unknown>).last_specialist_result as Record<string, unknown>)?.action || "")),
      "ASK"
    );
    assert.equal(
      String((((result.state as Record<string, unknown>).last_specialist_result as Record<string, unknown>)?.message || "")),
      "Purpose intro from catalog for Mindd."
    );
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

test("runStepRuntimeActionRoutingLayer keeps resumed Dream picker visible even when stored user variant is not stepworthy", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_DREAM_REFINE_CONFIRM";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      status: "true",
      mode: "text",
      target_field: "dream",
      pending_interaction_id: "__TEST_PENDING_INTERACTION__",
      user_text:
        "Ik zou willen dat mensen gezonder zouden eten met minder bewerkt voedsel en voedsel eten waar minimale tot geen ongezonde toevoegingen in zitten.",
      user_normalized_text:
        "Ik zou willen dat mensen gezonder zouden eten met minder bewerkt voedsel en voedsel eten waar minimale tot geen ongezonde toevoegingen in zitten.",
      suggestion_text:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      feedback_reason_text:
        "Deze formulering maakt de droom concreter en inspirerender zonder de kern van de input te verliezen.",
      message: "Ik denk dat ik je begrijp.",
      refined_formulation:
        "Bart droomt van een wereld waarin mensen zich gezond en energiek voelen doordat zij genieten van puur, onbewerkt voedsel zonder ongezonde toevoegingen.",
      user_items: [],
      suggestion_items: [],
      base_items: [],
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
  assert.equal(comparePendingValue(specialist), "true");
  assert.equal(compareUserVariantStepworthyValue(specialist), "false");
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
        status: "false",
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

test("runStepRuntimeActionRoutingLayer proceeds from Dream confirm when canonical pending compare state is hidden behind the card", async () => {
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
        status: "true",
        mode: "text",
        target_field: "dream",
        presentation: "canonical",
        suggestion_text: canonical,
        user_text: "Ik wil dat mensen meer verbonden zijn met natuur.",
        user_normalized_text: "Ik wil dat mensen meer verbonden zijn met natuur.",
        user_variant_semantics: "raw_source_content",
        user_variant_stepworthy: "false",
      },
    };
    params.state.provisionalValueForStep = () => "";
    params.compare.buildCompareFromPendingSpecialist = () => null;

    const result = await runStepRuntimeActionRoutingLayer(params);
    assert.ok(result.response);
    assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "purpose");
    assert.equal(String((result.state as Record<string, unknown>).dream_final || ""), canonical);
    assert.equal(String((result.state as Record<string, unknown>).active_specialist || ""), "Purpose");
    const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
    assert.notEqual(comparePendingValue(specialist), "true");
  }
});

test("runStepRuntimeActionRoutingLayer keeps confirm blocked when a visible picker compare choice is still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    last_specialist_result: {
      status: "true",
      mode: "text",
      target_field: "dream",
      presentation: "picker",
      feedback_reason_text: "Deze versie maakt de droom concreter en bruikbaar voor de volgende stap.",
      user_text: "Ik wil dat mensen gezonder eten.",
      user_normalized_text: "Ik wil dat mensen gezonder eten.",
      suggestion_text:
        "FluerOp droomt van een wereld waarin mensen zich gezond en energiek voelen door puur eten.",
      user_variant_semantics: "step_variant",
      user_variant_stepworthy: "true",
      refined_formulation:
        "FluerOp droomt van een wereld waarin mensen zich gezond en energiek voelen door puur eten.",
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  assert.equal(String((result.state as Record<string, unknown>).current_step || ""), "dream");
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "true");
});

test("runStepRuntimeActionRoutingLayer strips stale ordinary compare state while Dream Builder mode is active", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    __dream_runtime_mode: "builder_collect",
    dream_builder_statements: ["Statement 1", "Statement 2"],
    last_specialist_result: {
      status: "true",
      mode: "text",
      presentation: "picker",
      target_field: "dream",
      user_text: "I want to help people solve a problem they care about.",
      user_normalized_text: "I want to help people solve a problem they care about.",
      suggestion_text:
        "Over 5 tot 10 jaar zoeken mensen steeds meer naar oplossingen die voor hen echt betekenisvol zijn.",
      feedback_reason_text: "Dream Builder zoekt hier naar bredere maatschappelijke verschuivingen.",
      dream_builder_kind: "batch_rewrite_compare",
      dream_builder_current_items: ["I want to help people solve a problem they care about."],
      dream_builder_suggested_items: [
        "Over 5 tot 10 jaar zoeken mensen steeds meer naar oplossingen die voor hen echt betekenisvol zijn.",
      ],
    },
  };
  params.action.getDreamRuntimeMode = () => "builder_collect";
  params.runtime.userMessage = "";
  params.runtime.inputMode = "widget";
  params.runtime.compareEnabled = true;
  params.behavior.buildTextForWidget = ({ specialist }: { specialist: Record<string, unknown> }) =>
    JSON.stringify({
      pending_interaction_status: comparePendingValue(specialist),
      dream_builder_compare_visible: dreamBuilderComparePendingValue(specialist),
    });

  const result = await runStepRuntimeActionRoutingLayer(params);
  const specialist = (((result.state as Record<string, unknown>).last_specialist_result) || {}) as Record<string, unknown>;
  assert.equal(dreamBuilderComparePendingValue(specialist), "true");
  if (result.response) {
    assert.equal(
      "compare" in ((((result.response as Record<string, unknown>).ui || {}) as Record<string, unknown>)),
      false
    );
  }
});

test("runStepRuntimeActionRoutingLayer keeps strategy confirm blocked while grouped compare units are still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_STRATEGY_CONFIRM_SATISFIED";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "strategy",
    active_specialist: "Strategy",
    last_specialist_result: {
      status: "true",
      mode: "list",
      target_field: "strategy",
      presentation: "picker",
      feedback_reason_text: "Kies welke formulering het beste past als volgende strategische richting.",
      grouped_mode: "grouped_units",
      grouped_cursor: "0",
      grouped_segments: [
        { kind: "retained", items: ["Recurring revenue", "Expert-led delivery"] },
        { kind: "unit", unit_id: "unit_1" },
      ],
      grouped_units: [
        {
          id: "unit_1",
          user_items: ["Operational simplicity"],
          suggestion_items: ["Operational focus"],
          user_text: "Operational simplicity",
          suggestion_text: "Operational focus",
          feedback_reason_text: "Deze keuze bepaalt hoe de strategie scherp wordt geformuleerd.",
          resolution: "",
          confidence: "anchored",
        },
      ],
      user_items: ["Operational simplicity"],
      suggestion_items: ["Operational focus"],
      user_normalized_text: "Operational simplicity",
      suggestion_text: "Operational focus",
      statements: ["Recurring revenue", "Expert-led delivery"],
      strategy: ["Recurring revenue", "Expert-led delivery"].join("\n"),
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "true");
});

test("runStepRuntimeActionRoutingLayer keeps rules confirm blocked while grouped compare units are still pending", async () => {
  const params = buildParams(true) as any;
  params.runtime.actionCodeRaw = "ACTION_RULES_CONFIRM_ALL";
  params.runtime.userMessage = "";
  params.runtime.state = {
    current_step: "rulesofthegame",
    active_specialist: "RulesOfTheGame",
    last_specialist_result: {
      status: "true",
      mode: "list",
      target_field: "rulesofthegame",
      presentation: "picker",
      feedback_reason_text: "Kies welke formulering het beste past als spelregel.",
      grouped_mode: "grouped_units",
      grouped_cursor: "0",
      grouped_segments: [
        { kind: "retained", items: ["We communicate proactively.", "We keep commitments."] },
        { kind: "unit", unit_id: "unit_1" },
      ],
      grouped_units: [
        {
          id: "unit_1",
          user_items: ["We resolve blockers quickly."],
          suggestion_items: ["We escalate blockers early and visibly."],
          user_text: "We resolve blockers quickly.",
          suggestion_text: "We escalate blockers early and visibly.",
          feedback_reason_text: "Deze keuze bepaalt hoe de spelregel concreet wordt vastgelegd.",
          resolution: "",
          confidence: "anchored",
        },
      ],
      user_items: ["We resolve blockers quickly."],
      suggestion_items: ["We escalate blockers early and visibly."],
      user_normalized_text: "We resolve blockers quickly.",
      suggestion_text: "We escalate blockers early and visibly.",
      statements: ["We communicate proactively.", "We keep commitments."],
      rulesofthegame: ["We communicate proactively.", "We keep commitments."].join("\n"),
    },
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.response as Record<string, unknown>).specialist || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "true");
});

test("runStepRuntimeActionRoutingLayer keeps free-text variants inside the widget compare flow when enabled", async () => {
  const result = await runStepRuntimeActionRoutingLayer(buildParams(true) as any);
  assert.ok(result);
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "true");
  assert.equal(result.submittedTextIntent, "content_input");
  assert.equal(result.submittedTextAnchor, "user_input");
});

test("runStepRuntimeActionRoutingLayer implicitly accepts suggestion on pending compare choice only for explicit accept text", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Ja, dit is goed zo.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "accept_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.compare.applyComparePickSelection = ({ state, routeToken }: any) => {
    if (routeToken !== "__COMPARE_PICK_SUGGESTION__") {
      return { handled: false, specialist: {}, nextState: state };
    }
    const selectedSpecialist = {
      ...((state.last_specialist_result as Record<string, unknown>) || {}),
      status: "false",
      resolution: "suggestion",
      mode: "",
      target_field: "",
      user_text: "",
      user_normalized_text: "",
      user_items: [],
      suggestion_items: [],
      base_items: [],
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
  assert.equal(comparePendingValue(specialist), "false");
});

test("runStepRuntimeActionRoutingLayer clears pending compare choice for feedback without implicit accept", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dit raakt me nog niet echt.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "feedback_on_suggestion" as const,
    anchor: "suggestion" as const,
  });
  let implicitPickCalled = false;
  params.compare.applyComparePickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__COMPARE_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.userMessage, "Dit raakt me nog niet echt.");
  assert.equal(result.submittedTextIntent, "feedback_on_suggestion");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "true");
  assert.equal(compareResolutionValue((result.state as Record<string, unknown>) || {}), "");
});

test("runStepRuntimeActionRoutingLayer does not implicit-accept suggestion when user explicitly rejects it", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  let implicitPickCalled = false;
  params.compare.applyComparePickSelection = ({ routeToken, state }: any) => {
    if (routeToken === "__COMPARE_PICK_SUGGESTION__") {
      implicitPickCalled = true;
    }
    return { handled: false, specialist: {}, nextState: state };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result);
  assert.equal(implicitPickCalled, false);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "true");
  assert.equal(compareResolutionValue((result.state as Record<string, unknown>) || {}), "");
});

test("runStepRuntimeActionRoutingLayer handles explicit accept correctly in Dream pending flow", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      status: "true",
      mode: "text",
      presentation: "picker",
      target_field: "dream",
      user_text: "Wij willen bedrijven helpen groeien.",
      user_normalized_text: "Wij willen bedrijven helpen groeien.",
      suggestion_text: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      feedback_reason_text: "This version turns the dream into a clearer world-level change.",
      user_variant_semantics: "step_variant",
      user_variant_stepworthy: "true",
      user_items: [],
      suggestion_items: [],
      base_items: [],
    },
  };
  params.runtime.userMessage = "Ja, dit klopt.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "accept_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });
  params.compare.applyComparePickSelection = ({ state, routeToken }: any) => ({
    handled: routeToken === "__COMPARE_PICK_SUGGESTION__",
    specialist: {
      ...((state.last_specialist_result as Record<string, unknown>) || {}),
      status: "false",
      resolution: "suggestion",
    },
    nextState: {
      ...state,
      last_specialist_result: {
        ...state.last_specialist_result,
        status: "false",
        resolution: "suggestion",
      },
    },
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result.response);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(result.submittedTextIntent, "accept_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(comparePendingValue(specialist), "false");
});

test("runStepRuntimeActionRoutingLayer keeps explicit reject inside the widget in Dream pending flow", async () => {
  const params = buildParams(true) as any;
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "Dream",
    last_specialist_result: {
      status: "true",
      mode: "text",
      presentation: "picker",
      target_field: "dream",
      user_text: "Wij willen bedrijven helpen groeien.",
      user_normalized_text: "Wij willen bedrijven helpen groeien.",
      suggestion_text: "Mindd droomt van een wereld waarin ondernemers rust ervaren in hun keuzes.",
      feedback_reason_text: "This version turns the dream into a clearer world-level change.",
      user_variant_semantics: "step_variant",
      user_variant_stepworthy: "true",
      user_items: [],
      suggestion_items: [],
      base_items: [],
    },
  };
  params.runtime.userMessage = "Dat is niet wat ik bedoel.";
  params.state.resolvePendingCompareIntent = () => ({
    intent: "reject_suggestion_explicit" as const,
    anchor: "suggestion" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result);
  assert.equal(result.submittedTextIntent, "reject_suggestion_explicit");
  assert.equal(result.submittedTextAnchor, "suggestion");
  assert.equal(comparePendingValue((result.state as Record<string, unknown>) || {}), "true");
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
      status: "false",
    };
  };

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.ok(result);
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "false");
});

test("runStepRuntimeActionRoutingLayer suspends pending compare choice for meta/help text instead of trapping it in the picker", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Kun je uitleggen waarom je deze suggestie doet?";
  params.state.shouldTreatAsStepContributingInput = () => false;
  params.state.resolvePendingCompareIntent = () => ({
    intent: "content_input" as const,
    anchor: "user_input" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "Kun je uitleggen waarom je deze suggestie doet?");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "false");
  assert.equal(compareSuggestionValue(specialist), "");
});

test("runStepRuntimeActionRoutingLayer suspends pending compare choice for locale-control text instead of forcing it into compare logic", async () => {
  const params = buildParams(true) as any;
  params.runtime.userMessage = "Kun je vanaf nu in het Engels antwoorden?";
  params.state.shouldTreatAsStepContributingInput = () => false;
  params.state.resolvePendingCompareIntent = () => ({
    intent: "content_input" as const,
    anchor: "user_input" as const,
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(result.response, null);
  assert.equal(result.userMessage, "Kun je vanaf nu in het Engels antwoorden?");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.equal(comparePendingValue(specialist), "false");
  assert.equal(compareUserValue(specialist), "");
});

test("runStepRuntimeActionRoutingLayer treats new Dream Builder text as fresh input instead of pending compare feedback", async () => {
  const params = buildParams(true) as any;
  let classifyCalls = 0;
  let resolveIntentCalls = 0;
  params.runtime.userMessage =
    "I want to build a community around a shared belief or movement.\nI want to create opportunities for others.";
  params.runtime.state = {
    current_step: "dream",
    active_specialist: "DreamExplainer",
    __dream_runtime_mode: "builder_collect",
    last_specialist_result: {
      dream_builder_kind: "batch_rewrite_compare",
      dream_builder_current_items: [
        "I want to help people solve a problem they truly care about.",
      ],
      dream_builder_suggested_items: [
        "Over 5 tot 10 jaar zullen meer mensen vooral problemen willen oplossen die voor henzelf en hun omgeving echt betekenisvol zijn.",
      ],
      dream_builder_segments: [{ kind: "unit", unit_id: "unit_1" }],
      dream_builder_rationale: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
      feedback_reason_text: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
    },
  };
  params.action.getDreamRuntimeMode = () => "builder_collect";
  params.state.classifyAcceptedOutputUserTurn = async () => {
    classifyCalls += 1;
    return {
      turn_kind: "feedback_on_existing_content" as const,
      user_variant_is_stepworthy: false,
    };
  };
  params.state.resolvePendingCompareIntent = async () => {
    resolveIntentCalls += 1;
    return { intent: "feedback_on_suggestion" as const, anchor: "suggestion" as const };
  };
  params.compare.buildCompareFromTurn = () => ({
    specialist: {
      action: "ASK",
      status: "false",
      dream_builder_kind: "batch_rewrite_compare",
      dream_builder_current_items: [
        "I want to build a community around a shared belief or movement.",
        "I want to create opportunities for others.",
      ],
      dream_builder_suggested_items: [
        "Mensen zullen zich vaker verbinden rond gedeelde overtuigingen en bewegingen die groter zijn dan henzelf.",
        "Er zal meer waarde worden gehecht aan ondernemingen die kansen creëren voor anderen.",
      ],
      dream_builder_segments: [{ kind: "unit", unit_id: "unit_1" }],
      dream_builder_rationale: "Dream Builder zoekt naar bredere maatschappelijke verschuivingen.",
    },
    compare: {
      enabled: true,
      mode: "list" as const,
      variant: "grouped_list_units" as const,
      user_items: [
        "I want to build a community around a shared belief or movement.",
        "I want to create opportunities for others.",
      ],
      suggestion_items: [
        "Mensen zullen zich vaker verbinden rond gedeelde overtuigingen en bewegingen die groter zijn dan henzelf.",
        "Er zal meer waarde worden gehecht aan ondernemingen die kansen creëren voor anderen.",
      ],
      instruction: "Choose the version that fits best.",
    },
  });

  const result = await runStepRuntimeActionRoutingLayer(params);

  assert.equal(classifyCalls, 0);
  assert.equal(resolveIntentCalls, 0);
  assert.equal(result.submittedTextIntent, "");
  const specialist = ((result.state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  assert.notEqual(comparePendingValue(specialist), "true");
  assert.equal(dreamBuilderComparePendingValue(specialist), "true");
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
    let rebuiltCompare = false;
    let pickedAgentBase = false;
    params.compare.buildCompareFromTurn = () => {
      rebuiltCompare = true;
      return { specialist: {}, compare: null };
    };
    params.compare.pickCompareAgentBase = () => {
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
    assert.equal(rebuiltCompare, false);
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
  params.runtime.compareEnabled = false;
  params.action.firstConfirmActionCodeForStep = () => "ACTION_STRATEGY_CONFIRM_SATISFIED";
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
  params.runtime.compareEnabled = false;
  params.action.firstConfirmActionCodeForStep = () => "ACTION_STRATEGY_CONFIRM_SATISFIED";
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
  params.runtime.compareEnabled = false;
  params.action.firstConfirmActionCodeForStep = () => "";
  params.action.firstGuidanceActionCodeForStep = () => "ACTION_STRATEGY_ASK_3_QUESTIONS";
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
  params.runtime.compareEnabled = false;
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
  assert.equal(comparePendingValue(specialist), "false");
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
      status: "true",
      mode: "list",
      feedback_reason_text:
        "Er staat nog een open wording-keuze klaar. Werk eerst naar één definitieve set spelregels toe.",
      target_field: "rulesofthegame",
      user_items: [
        "Gratis is gratis voor iedereen.",
        "We komen afspraken na.",
        "We communiceren proactief.",
      ],
      suggestion_items: [
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
  params.runtime.compareEnabled = true;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.firstGuidanceActionCodeForMenu = () => "ACTION_RULES_ASK_EXPLAIN_MORE";
  params.compare.isCompareEligibleContext = () => true;
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
  assert.equal(comparePendingValue(specialist), "false");
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
      rulesofthegame: "compare_pick",
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
  params.runtime.compareEnabled = false;
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
  params.runtime.compareEnabled = false;
  params.action.inferCurrentMenuForStep = () => "RULES_MENU_ASK_EXPLAIN";
  params.action.firstConfirmActionCodeForMenu = () => "";
  params.action.processActionCode = () => "__ROUTE__RULES_CONFIRM_ALL__";
  params.state.provisionalValueForStep = (state: Record<string, unknown>, stepId: string) =>
    String(((state.provisional_by_step as Record<string, unknown> | undefined) || {})[stepId] || "");

  const result = await runStepRuntimeActionRoutingLayer(params);
  assert.equal(result.response, null);
  assert.equal(result.userMessage, "__ROUTE__RULES_CONFIRM_ALL__");
});
