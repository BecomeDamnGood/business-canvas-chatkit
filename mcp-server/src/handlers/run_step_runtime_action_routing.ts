import type { CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { RunStepAttachRegistryPayload } from "./run_step_ports.js";
import type { TurnResponseEngine } from "./run_step_turn_response_engine.js";
import type { CompareUiPayload } from "./run_step_runtime_action_helpers.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import type {
  PendingCompareIntentResolution,
  PendingCompareTextAnchor,
  PendingCompareTextIntent,
} from "./run_step_compare_heuristics.js";
import {
  BIGWHY_MAX_WORDS,
  buildActionCodeStepTransitions,
  countWords,
  pickBigWhyCandidate,
  resolveRequiredFinalValue,
} from "./run_step_runtime_action_routing_policy.js";
import { normalizePendingPickerSpecialistContract } from "./run_step_compare_picker_contract.js";
import { isSingleValueTextPickerStep } from "./run_step_compare_picker_contract.js";
import {
  evaluateRulesRuntimeGate,
  RULESOFTHEGAME_MIN_RULES,
  RULESOFTHEGAME_MAX_RULES,
} from "../steps/rulesofthegame_runtime_policy.js";
import {
  attachCompareRuntime,
  clearCompareRuntime,
  hasRenderablePendingCompareState,
  patchCompareRuntime,
  readCompareRuntime,
} from "./compare_runtime.js";
import {
  clearDreamBuilderCompareRuntime,
  readDreamBuilderCompareRuntime,
} from "./dream_builder_compare_runtime.js";

export type RunStepRuntimeActionRoutingOutput<TPayload extends Record<string, unknown>> = {
  response: TPayload | null;
  state: CanvasState;
  userMessage: string;
  submittedTextIntent: PendingCompareTextIntent | "";
  submittedTextAnchor: PendingCompareTextAnchor | "";
  acceptedOutputUserTurnClassification: AcceptedOutputUserTurnClassification | null;
  responseUiFlags: Record<string, boolean | string> | null;
  bigwhyMaxWords: number;
  countWords: (text: string) => number;
  pickBigWhyCandidate: (result: Record<string, unknown> | null | undefined) => string;
  buildBigWhyTooLongFeedback: (stateForText: CanvasState) => Record<string, unknown>;
};

export async function runStepRuntimeActionRoutingLayer<TPayload extends Record<string, unknown>>(params: {
  runtime: {
    state: CanvasState;
    userMessage: string;
    actionCodeRaw: string;
    lastSpecialistResult: Record<string, unknown>;
    model: string;
    inputMode: "widget" | "chat";
    compareEnabled: boolean;
    compareIntentV1: boolean;
    uiI18nTelemetry: unknown;
  };
  ids: {
    step0Id: string;
    dreamStepId: string;
    dreamSpecialist: string;
    purposeStepId: string;
    purposeSpecialist: string;
    bigwhyStepId: string;
    roleStepId: string;
    entityStepId: string;
    strategyStepId: string;
    targetgroupStepId: string;
    productsservicesStepId: string;
    rulesofthegameStepId: string;
    presentationStepId: string;
    dreamExplainerSwitchSelfMenuId: string;
  };
  action: {
    nextMenuByActionCode: Record<string, unknown>;
    dreamStartExerciseActionCodes: Set<string>;
    resolveActionCodeTransition: (
      actionCode: string,
      currentStepId: string,
      sourceMenuId: string
    ) =>
      | {
          targetStepId: string;
          targetMenuId: string;
          renderMode: "menu" | "no_buttons";
        }
      | null;
    inferCurrentMenuForStep: (state: CanvasState, stepId: string) => string;
    setUiRenderModeByStep: (
      state: CanvasState,
      stepId: string,
      renderMode: "menu" | "no_buttons"
    ) => void;
    applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
    buildContractId: (stepId: string, status: TurnOutputStatus, menuId: string) => string;
    processActionCode: (
      actionCodeInput: string,
      currentStep: string,
      state: CanvasState,
      lastSpecialistResult: Record<string, unknown>
    ) => string;
    firstConfirmActionCodeForMenu: (menuId: string) => string;
    firstGuidanceActionCodeForMenu: (menuId: string) => string;
    shouldPretransitionActionCode: (actionCode: string) => boolean;
    setDreamRuntimeMode: (
      state: CanvasState,
      mode: "self" | "builder_collect" | "builder_scoring" | "builder_refine"
    ) => void;
    getDreamRuntimeMode: (
      state: CanvasState
    ) => "self" | "builder_collect" | "builder_scoring" | "builder_refine";
  };
  state: {
    provisionalValueForStep: (state: Record<string, unknown>, stepId: string) => string;
    clearProvisionalValue: (state: CanvasState, stepId: string) => CanvasState;
    clearStepInteractiveState: (state: CanvasState, stepId: string) => CanvasState;
    applyPostSpecialistStateMutations: (params: {
      prevState: CanvasState;
      decision: OrchestratorOutput;
      specialistResult: Record<string, unknown>;
      provisionalSource: "action_route" | "system_generated" | "user_input";
    }) => CanvasState;
    isUiStateHygieneSwitchV1Enabled: () => boolean;
    isClearlyGeneralOfftopicInput: (userMessage: string) => boolean;
    shouldTreatAsStepContributingInput: (userMessage: string, stepId: string) => boolean;
    resolvePendingCompareIntent: (params: {
      userMessage: string;
      stepId: string;
      pendingSuggestion: string;
      pendingUserInput: string;
    }) => Promise<PendingCompareIntentResolution> | PendingCompareIntentResolution;
    bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
    classifyAcceptedOutputUserTurn: (params: {
      model: string;
      stepId: string;
      userMessage: string;
      currentAcceptedValue?: string;
      pendingSuggestion?: string;
      pendingUserVariant?: string;
      language?: string;
    }) => Promise<AcceptedOutputUserTurnClassification>;
  };
  compare: {
    isCompareEligibleContext: (
      stepId: string,
      activeSpecialist: string,
      specialist?: Record<string, unknown> | null,
      previousSpecialist?: Record<string, unknown> | null,
      dreamRuntimeModeRaw?: unknown
    ) => boolean;
    buildCompareFromPendingSpecialist: (
      specialistResult: Record<string, unknown>,
      state: CanvasState | null | undefined,
      activeSpecialist: string,
      previousSpecialist: Record<string, unknown>,
      stepId: string,
      dreamRuntimeModeRaw?: unknown
    ) => CompareUiPayload | null;
    applyComparePickSelection: (params: {
      stepId: string;
      routeToken: string;
      state: CanvasState;
      telemetry: unknown;
    }) => {
      handled: boolean;
      specialist: Record<string, unknown>;
      nextState: CanvasState;
    };
    isComparePickRouteToken: (raw: string) => boolean;
    isRefineAdjustRouteToken: (raw: string) => boolean;
    buildCompareFromTurn: (params: {
      stepId: string;
      state: CanvasState;
      activeSpecialist: string;
      previousSpecialist: Record<string, unknown>;
      specialistResult: Record<string, unknown>;
      userTextRaw: string;
      isOfftopic: boolean;
      forcePending?: boolean;
      dreamRuntimeModeRaw?: unknown;
    }) => {
      specialist: Record<string, unknown>;
      compare?: CompareUiPayload | null;
    };
    pickCompareAgentBase: (specialist: Record<string, unknown>) => string;
    copyPendingCompareState: (
      specialistResult: Record<string, unknown>,
      previousSpecialist: Record<string, unknown>
    ) => Record<string, unknown>;
  };
  behavior: {
    ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
    normalizeNonStep0OfftopicSpecialist: (params: {
      stepId: string;
      activeSpecialist: string;
      userMessage: string;
      specialistResult: Record<string, unknown>;
      previousSpecialist: Record<string, unknown>;
      state: CanvasState;
    }) => Record<string, unknown>;
    buildTextForWidget: (params: { specialist: Record<string, unknown>; state?: CanvasState | null }) => string;
    pickPrompt: (specialist: Record<string, unknown>) => string;
    uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
    uiDefaultString: (key: string, fallback?: string) => string;
    applyCentralMetaTopicRouter: (params: {
      stepId: string;
      specialistResult: Record<string, unknown>;
      previousSpecialist?: Record<string, unknown>;
      state: CanvasState;
      userMessage?: string;
    }) => Record<string, unknown>;
    finalizeResponse: (payload: TPayload) => TPayload;
    attachRegistryPayload: RunStepAttachRegistryPayload<TPayload>;
    resolveResponseUiFlags: (actionCodeOrRouteToken: string) => Record<string, boolean | string> | null;
    turnResponseEngine: TurnResponseEngine<TPayload>;
  };
}): Promise<RunStepRuntimeActionRoutingOutput<TPayload>> {
  const {
    runtime,
    ids,
    action,
    state: statePorts,
    compare,
    behavior,
  } = params;

  let state = runtime.state;
  let userMessage = runtime.userMessage;
  let forcedProceed = false;
  let forcedProceedPreviousSpecialist: Record<string, unknown> = {};
  let submittedTextIntent: PendingCompareTextIntent | "" = "";
  let submittedTextAnchor: PendingCompareTextAnchor | "" = "";
  let acceptedOutputUserTurnClassification: AcceptedOutputUserTurnClassification | null = null;

  const normalizeItems = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.map((line) => String(line || "").trim()).filter(Boolean)
      : [];

  const readLastSpecialist = (stateValue: CanvasState): Record<string, unknown> =>
    ({ ...((((stateValue as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {})) });

  const writeLastSpecialist = (stateValue: CanvasState, specialist: Record<string, unknown>): void => {
    (stateValue as Record<string, unknown>).last_specialist_result = attachCompareRuntime(specialist);
  };

  const clearDreamBuilderLegacyCompareFields = (
    specialist: Record<string, unknown>
  ): Record<string, unknown> => ({
    ...clearCompareRuntime(specialist),
  });

  const hasRenderablePendingCompare = (specialist: Record<string, unknown>): boolean => {
    const compareState = readCompareRuntime(specialist);
    if (!compareState) return false;
    const mode = compareState.mode === "list" ? "list" : "text";
    const stepId = String(state.current_step || "").trim();
    const dreamRuntimeMode = action.getDreamRuntimeMode(state);
    const dreamBuilderFlowActive = String(state.current_step || "") === ids.dreamStepId && dreamRuntimeMode !== "self";
    if (dreamBuilderFlowActive && stepId === ids.dreamStepId) return false;
    if (!hasRenderablePendingCompareState(compareState)) return false;
    if (mode === "list") return true;
    const suggestionText = String(compareState.suggestion_text || specialist.refined_formulation || "").trim();
    return Boolean(suggestionText && String(compareState.user_normalized_text || compareState.user_text || "").trim());
  };

  const hasPickerPendingCompare = (specialist: Record<string, unknown>): boolean =>
    hasRenderablePendingCompare(specialist);

  const normalizeAcceptedOutputPendingSpecialist = async (
    specialist: Record<string, unknown>,
    stepId: string
  ): Promise<Record<string, unknown>> => {
    const compareState = readCompareRuntime(specialist);
    if (compareState?.status !== "pending") return specialist;
    const dreamRuntimeMode = action.getDreamRuntimeMode(state);
    const dreamBuilderFlowActive = String(state.current_step || "") === ids.dreamStepId && dreamRuntimeMode !== "self";
    if (dreamBuilderFlowActive && stepId === ids.dreamStepId) {
      return clearDreamBuilderLegacyCompareFields(specialist);
    }
    return specialist;
  };

  const tokenizeIntent = (raw: string): string[] =>
    String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);

  const looksLikeProceedTextIntent = (raw: string): boolean => {
    const tokens = tokenizeIntent(raw);
    if (tokens.length === 0) return false;
    if (tokens.length === 1) {
      return tokens[0] === "next" || tokens[0] === "continue";
    }
    if (tokens.length > 14) return false;
    const progressVerbs = new Set([
      "continue",
      "proceed",
      "advance",
      "next",
      "go",
      "going",
      "doorgaan",
      "verder",
      "ga",
      "gaan",
    ]);
    const stepSignals = new Set([
      "step",
      "steps",
      "stap",
      "stappen",
      "next",
      "volgende",
      "hierna",
      "daarna",
      "further",
    ]);
    const hasProgressVerb = tokens.some((token) => progressVerbs.has(token));
    const hasStepSignal = tokens.some((token) => stepSignals.has(token));
    return hasProgressVerb && hasStepSignal;
  };

  const acceptedRulesOutput = (stateForRules: CanvasState): boolean => {
    const committedFinal = String((stateForRules as Record<string, unknown>).rulesofthegame_final || "").trim();
    if (committedFinal) return true;
    const provisional =
      statePorts.provisionalValueForStep(stateForRules as Record<string, unknown>, ids.rulesofthegameStepId);
    if (!provisional) return false;
    const rawMap =
      (stateForRules as Record<string, unknown>).provisional_source_by_step &&
      typeof (stateForRules as Record<string, unknown>).provisional_source_by_step === "object"
        ? ((stateForRules as Record<string, unknown>).provisional_source_by_step as Record<string, unknown>)
        : {};
    const source = String(rawMap[ids.rulesofthegameStepId] || "").trim();
    return source === "user_input" || source === "compare_pick" || source === "action_route";
  };

  const acceptedRulesValue = (stateForRules: CanvasState): string => {
    const committedFinal = String((stateForRules as Record<string, unknown>).rulesofthegame_final || "").trim();
    if (committedFinal) return committedFinal;
    return acceptedRulesOutput(stateForRules)
      ? statePorts.provisionalValueForStep(stateForRules as Record<string, unknown>, ids.rulesofthegameStepId)
      : "";
  };

  const rulesProceedBlockCodes = (
    stateForRules: CanvasState,
    pendingSpecialist: Record<string, unknown>
  ): string[] => {
    const acceptedOutput = acceptedRulesOutput(stateForRules);
    const acceptedValue = acceptedRulesValue(stateForRules);
    const visibleValue =
      String(pendingSpecialist.rulesofthegame || "").trim() ||
      String(pendingSpecialist.refined_formulation || "").trim() ||
      acceptedValue;
    const comparePending = readCompareRuntime(pendingSpecialist)?.status === "pending";
    const gate = evaluateRulesRuntimeGate({
      acceptedOutput,
      acceptedValue,
      visibleValue,
      statements: pendingSpecialist.statements,
      comparePending,
    });
    const codes: string[] = [];
    if (gate.count < RULESOFTHEGAME_MIN_RULES) codes.push("rules_min_count");
    if (gate.count > RULESOFTHEGAME_MAX_RULES) codes.push("rules_max_count");
    if (comparePending) codes.push("rules_pending_choice");
    if (
      !acceptedOutput &&
      gate.count >= RULESOFTHEGAME_MIN_RULES &&
      gate.count <= RULESOFTHEGAME_MAX_RULES &&
      !comparePending
    ) {
      codes.push("rules_missing_accepted_output");
    }
    return codes;
  };

  const formatUiTemplate = (templateRaw: string, values: Array<string | number>): string =>
    values.reduce(
      (acc: string, value, index) => acc.replace(new RegExp(`\\{${index}\\}`, "g"), String(value)),
      String(templateRaw || "")
    ).trim();

  const rulesProceedUiText = (
    stateForText: CanvasState,
    key: string
  ): string =>
    behavior.uiStringFromStateMap(
      stateForText,
      key,
      behavior.uiDefaultString(key)
    );

  const buildRulesProceedBlockedSpecialist = (
    stateForText: CanvasState,
    pendingSpecialist: Record<string, unknown>
  ): Record<string, unknown> => {
    const acceptedOutput = acceptedRulesOutput(stateForText);
    const acceptedValue = acceptedRulesValue(stateForText);
    const visibleValue =
      String(pendingSpecialist.rulesofthegame || "").trim() ||
      String(pendingSpecialist.refined_formulation || "").trim() ||
      acceptedValue;
    const comparePending = readCompareRuntime(pendingSpecialist)?.status === "pending";
    const gate = evaluateRulesRuntimeGate({
      acceptedOutput,
      acceptedValue,
      visibleValue,
      statements: pendingSpecialist.statements,
      comparePending,
    });
    const blockCodes = rulesProceedBlockCodes(stateForText, pendingSpecialist);
    const reasonLines = [
      blockCodes.includes("rules_min_count")
        ? formatUiTemplate(
            rulesProceedUiText(stateForText, "rules.proceed.block.reason.min.template"),
            [RULESOFTHEGAME_MIN_RULES, gate.count]
          )
        : "",
      blockCodes.includes("rules_max_count")
        ? formatUiTemplate(
            rulesProceedUiText(stateForText, "rules.proceed.block.reason.max.template"),
            [gate.count, RULESOFTHEGAME_MAX_RULES]
          )
        : "",
      blockCodes.includes("rules_pending_choice")
        ? rulesProceedUiText(stateForText, "rules.proceed.block.reason.pending_choice")
        : "",
      blockCodes.includes("rules_missing_accepted_output")
        ? rulesProceedUiText(stateForText, "rules.proceed.block.reason.missing_accepted_output")
        : "",
    ].filter(Boolean);
    const prefix = rulesProceedUiText(stateForText, "rules.proceed.block.prefix");
    const question = blockCodes.includes("rules_pending_choice")
      ? rulesProceedUiText(stateForText, "rules.proceed.block.question.pending_choice")
      : blockCodes.includes("rules_max_count")
        ? formatUiTemplate(
            rulesProceedUiText(stateForText, "rules.proceed.block.question.max.template"),
            [RULESOFTHEGAME_MAX_RULES]
          )
        : blockCodes.includes("rules_missing_accepted_output")
          ? rulesProceedUiText(stateForText, "rules.proceed.block.question.missing_accepted_output")
          : formatUiTemplate(
              rulesProceedUiText(stateForText, "rules.proceed.block.question.min.template"),
              [RULESOFTHEGAME_MIN_RULES]
            );
    const bulletList = gate.items.map((line) => `• ${line}`).join("\n");
    const rulesText = bulletList || visibleValue;
    return {
      action: "ASK",
      message: [prefix, ...reasonLines].join(" ").trim(),
      question,
      refined_formulation: rulesText,
      rulesofthegame: rulesText,
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
      statements: gate.items,
      proceed_request_intent: "next_step",
      proceed_block_reason_codes: blockCodes,
      proceed_block_rule_count: gate.count,
      feedback_reason_key: "",
      feedback_reason_text: "",
    };
  };

  const buildBigWhyTooLongFeedback = (stateForText: CanvasState): Record<string, unknown> => {
    const message = behavior.uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.message",
      behavior.uiDefaultString("bigwhy.tooLong.message")
    );
    const question = behavior.uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.question",
      behavior.uiDefaultString("bigwhy.tooLong.question")
    );
    return {
      action: "REFINE",
      message,
      question,
      refined_formulation: "",
      bigwhy: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };
  };

  const actionCodeStepTransitions = buildActionCodeStepTransitions({
    dreamStepId: ids.dreamStepId,
    purposeStepId: ids.purposeStepId,
    bigwhyStepId: ids.bigwhyStepId,
    roleStepId: ids.roleStepId,
    entityStepId: ids.entityStepId,
    strategyStepId: ids.strategyStepId,
    targetgroupStepId: ids.targetgroupStepId,
    productsservicesStepId: ids.productsservicesStepId,
    rulesofthegameStepId: ids.rulesofthegameStepId,
    presentationStepId: ids.presentationStepId,
  });

  if (runtime.actionCodeRaw && actionCodeStepTransitions[runtime.actionCodeRaw]) {
    const stepId = String(state.current_step ?? "");
    const prev = readLastSpecialist(state);

    if (
      runtime.compareEnabled &&
      readCompareRuntime(prev)?.status === "pending" &&
      compare.isCompareEligibleContext(
        stepId,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        prev,
        action.getDreamRuntimeMode(state)
      )
    ) {
      const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
      state = stateWithUi;
      const pendingSpecialistSeed = await normalizeAcceptedOutputPendingSpecialist(prev, stepId);
      const pendingSpecialist = normalizePendingPickerSpecialistContract({
        specialist: pendingSpecialistSeed,
        stepIdHint: stepId,
      });
      writeLastSpecialist(state, pendingSpecialist);
      const pendingChoice = compare.buildCompareFromPendingSpecialist(
        pendingSpecialist,
        stateWithUi,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        stepId,
        action.getDreamRuntimeMode(state)
      );
      if (pendingChoice?.enabled) {
        const payload = behavior.attachRegistryPayload(
          {
            ok: true,
            tool: "run_step",
            current_step_id: String(state.current_step),
            active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
            text: behavior.buildTextForWidget({ specialist: pendingSpecialist, state: stateWithUi }),
            prompt: behavior.pickPrompt(pendingSpecialist),
            specialist: pendingSpecialist,
            state: stateWithUi,
          },
          pendingSpecialist,
          null,
          [],
          [],
          pendingChoice
        );
        return {
          response: behavior.finalizeResponse(payload),
          state,
          userMessage,
          submittedTextIntent,
          submittedTextAnchor,
          acceptedOutputUserTurnClassification,
          responseUiFlags: null,
          bigwhyMaxWords: BIGWHY_MAX_WORDS,
          countWords,
          pickBigWhyCandidate,
          buildBigWhyTooLongFeedback,
        };
      }
    }

    if (
      runtime.compareEnabled &&
      readCompareRuntime(prev)?.status === "pending" &&
      !compare.isCompareEligibleContext(
        stepId,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        prev,
        action.getDreamRuntimeMode(state)
      )
    ) {
      state = statePorts.clearStepInteractiveState(state, stepId);
      statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
    }

    const finalInfo = resolveRequiredFinalValue({
      stepId,
      previousSpecialist: prev,
      state: state as Record<string, unknown>,
      provisionalValue: statePorts.provisionalValueForStep(state as Record<string, unknown>, stepId),
      step0Id: ids.step0Id,
      presentationStepId: ids.presentationStepId,
    });
    const sourceMenuForTransition = action.inferCurrentMenuForStep(state, stepId);
    const resolvedTransition = action.resolveActionCodeTransition(
      runtime.actionCodeRaw,
      stepId,
      sourceMenuForTransition
    );

    if (!(finalInfo.field && !finalInfo.value)) {
      if (finalInfo.field && finalInfo.value) {
        (state as Record<string, unknown>)[finalInfo.field] = finalInfo.value;
        state = statePorts.clearProvisionalValue(state, stepId);
        if (statePorts.isUiStateHygieneSwitchV1Enabled()) {
          state = statePorts.clearStepInteractiveState(state, stepId);
        }
      }

      const nextStepForProceed =
        resolvedTransition?.targetStepId || String(actionCodeStepTransitions[runtime.actionCodeRaw] || stepId);
      (state as Record<string, unknown>).current_step = String(nextStepForProceed || stepId);

      if (resolvedTransition) {
        action.setUiRenderModeByStep(
          state,
          resolvedTransition.targetStepId,
          resolvedTransition.renderMode
        );
        action.applyUiPhaseByStep(
          state,
          resolvedTransition.targetStepId,
          action.buildContractId(
            resolvedTransition.targetStepId,
            "incomplete_output",
            resolvedTransition.renderMode === "no_buttons" ? "NO_MENU" : resolvedTransition.targetMenuId
          )
        );
      } else {
        action.setUiRenderModeByStep(
          state,
          String((state as Record<string, unknown>).current_step || stepId),
          "menu"
        );
      }

      (state as Record<string, unknown>).active_specialist = "";
      writeLastSpecialist(state, {});
      if (String((state as Record<string, unknown>).current_step || "") !== ids.dreamStepId) {
        action.setDreamRuntimeMode(state, "self");
      }
      forcedProceedPreviousSpecialist = prev;
      userMessage = "";
      forcedProceed = true;
    }
  }

  if (!forcedProceed && !userMessage.startsWith("ACTION_")) {
    const stepId = String(state.current_step || "").trim();
    if (stepId) {
      const pending = readLastSpecialist(state);
      if (readCompareRuntime(pending)?.status === "pending" && !hasRenderablePendingCompare(pending)) {
        state = statePorts.clearStepInteractiveState(state, stepId);
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
      }
    }
  }

  if (!forcedProceed && !userMessage.startsWith("ACTION_") && !compare.isComparePickRouteToken(userMessage)) {
    const stepId = String(state.current_step || "").trim();
    if (stepId) {
      const sourceMenuId = action.inferCurrentMenuForStep(state, stepId);
      const confirmActionCode = action.firstConfirmActionCodeForMenu(String(sourceMenuId || "").trim());
      if (confirmActionCode && looksLikeProceedTextIntent(userMessage)) {
        userMessage = confirmActionCode;
      } else if (stepId === ids.rulesofthegameStepId && looksLikeProceedTextIntent(userMessage)) {
        const pendingSpecialist = readLastSpecialist(state);
        const blockCodes = rulesProceedBlockCodes(state, pendingSpecialist);
        if (blockCodes.length === 0) {
          userMessage = "ACTION_RULES_CONFIRM_ALL";
        } else {
          state = await behavior.ensureUiStrings(state, userMessage);
          state = statePorts.clearStepInteractiveState(state, ids.rulesofthegameStepId);
          const blockedSpecialist = buildRulesProceedBlockedSpecialist(state, pendingSpecialist);
          writeLastSpecialist(state, blockedSpecialist);
          const payload = behavior.attachRegistryPayload(
            ({
              ok: true,
              tool: "run_step",
              current_step_id: String(state.current_step),
              active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
              text: behavior.buildTextForWidget({ specialist: blockedSpecialist, state }),
              prompt: behavior.pickPrompt(blockedSpecialist),
              specialist: blockedSpecialist,
              state,
            } as unknown as TPayload),
            blockedSpecialist
          );
          return {
            response: behavior.finalizeResponse(payload),
            state,
            userMessage,
            submittedTextIntent,
            submittedTextAnchor,
            acceptedOutputUserTurnClassification,
            responseUiFlags: null,
            bigwhyMaxWords: BIGWHY_MAX_WORDS,
            countWords,
            pickBigWhyCandidate,
            buildBigWhyTooLongFeedback,
          };
        }
      } else if (looksLikeProceedTextIntent(userMessage)) {
        const pendingSpecialist = readLastSpecialist(state);
        const hasPendingCompare =
          runtime.compareEnabled &&
          readCompareRuntime(pendingSpecialist)?.status === "pending" &&
          compare.isCompareEligibleContext(
            stepId,
            String((state as Record<string, unknown>).active_specialist || ""),
            pendingSpecialist,
            pendingSpecialist,
            action.getDreamRuntimeMode(state)
          ) &&
          hasPickerPendingCompare(pendingSpecialist);
        if (hasPendingCompare) {
          userMessage = "__COMPARE_PICK_SUGGESTION__";
        } else {
          const guidanceActionCode = action.firstGuidanceActionCodeForMenu(String(sourceMenuId || "").trim());
          if (guidanceActionCode) {
            userMessage = guidanceActionCode;
          }
        }
      }
    }
  }

  if (!forcedProceed && userMessage.startsWith("ACTION_")) {
    const actionCodeInput = userMessage;
    const safeActionCodeInput = String(actionCodeInput || "").trim().toUpperCase();
    const currentStepForMenuTransition = String(state.current_step || "").trim();
    const sourceMenuForTransition = action.inferCurrentMenuForStep(state, currentStepForMenuTransition);
    const transitionSpec = params.action.nextMenuByActionCode[safeActionCodeInput];
    const resolvedTransition = action.resolveActionCodeTransition(
      safeActionCodeInput,
      currentStepForMenuTransition,
      sourceMenuForTransition
    );

    if (transitionSpec && !resolvedTransition) {
      // Keep the turn alive and let processActionCode/text flow decide next behavior.
    }

    if (resolvedTransition && action.shouldPretransitionActionCode(safeActionCodeInput)) {
      action.setUiRenderModeByStep(
        state,
        resolvedTransition.targetStepId,
        resolvedTransition.renderMode
      );
      action.applyUiPhaseByStep(
        state,
        resolvedTransition.targetStepId,
        action.buildContractId(
          resolvedTransition.targetStepId,
          "incomplete_output",
          resolvedTransition.renderMode === "no_buttons" ? "NO_MENU" : resolvedTransition.targetMenuId
        )
      );
    }

    if (currentStepForMenuTransition === ids.dreamStepId) {
      if (action.dreamStartExerciseActionCodes.has(safeActionCodeInput)) {
        action.setDreamRuntimeMode(state, "builder_collect");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST") {
        action.setDreamRuntimeMode(state, "builder_refine");
      } else if (safeActionCodeInput === "ACTION_DREAM_SWITCH_TO_SELF") {
        action.setDreamRuntimeMode(state, "self");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
        action.setDreamRuntimeMode(state, "builder_scoring");
      }
    }

    const routed = action.processActionCode(
      actionCodeInput,
      String(state.current_step || ""),
      state,
      runtime.lastSpecialistResult
    );

    if (runtime.inputMode === "widget" && actionCodeInput) {
      userMessage = routed;
    } else if (runtime.inputMode === "widget" && routed === actionCodeInput) {
      const clickedLabel = String((state as Record<string, unknown>).__last_clicked_label_for_contract || "").trim();
      userMessage = clickedLabel;
    } else {
      userMessage = routed;
    }
  }

  let pendingBeforeTurn = readLastSpecialist(state);
  const currentStepId = String(state.current_step || "");
  const dreamRuntimeModeBeforeTurn = action.getDreamRuntimeMode(state);
  const dreamBuilderModeActive =
    currentStepId === ids.dreamStepId && dreamRuntimeModeBeforeTurn !== "self";
  if (dreamBuilderModeActive && readCompareRuntime(pendingBeforeTurn)?.status === "pending") {
    pendingBeforeTurn = clearDreamBuilderLegacyCompareFields(pendingBeforeTurn);
    writeLastSpecialist(state, pendingBeforeTurn);
  }
  const isRulesProceedBlockTurn =
    currentStepId === ids.rulesofthegameStepId &&
    looksLikeProceedTextIntent(userMessage) &&
    String((pendingBeforeTurn as Record<string, unknown>).proceed_request_intent || "").trim() === "next_step";
  const isGeneralOfftopicInput = statePorts.isClearlyGeneralOfftopicInput(userMessage);
  const isStepContributingInput = statePorts.shouldTreatAsStepContributingInput(userMessage, currentStepId);
  const hasFreeTextWhilePending =
    Boolean(String(userMessage || "").trim()) &&
    !String(userMessage || "").trim().startsWith("ACTION_") &&
    !String(userMessage || "").trim().startsWith("__ROUTE__") &&
    !compare.isComparePickRouteToken(userMessage);
  const suspendPendingCompareSpecialist = (
    specialist: Record<string, unknown>
  ): Record<string, unknown> =>
    normalizePendingPickerSpecialistContract({
      specialist: clearCompareRuntime(specialist),
      stepIdHint: String(state.current_step || ""),
    });
  const suspendPendingDreamBuilderCompareSpecialist = (
    specialist: Record<string, unknown>
  ): Record<string, unknown> => ({
    ...normalizePendingPickerSpecialistContract({
      specialist: clearCompareRuntime(specialist),
      stepIdHint: String(state.current_step || ""),
    }),
    ...clearDreamBuilderCompareRuntime(specialist),
  });
  const buildWidgetResponse = async (params: {
    nextState: CanvasState;
    specialist: Record<string, unknown>;
    compare?: CompareUiPayload | null;
  }): Promise<RunStepRuntimeActionRoutingOutput<TPayload>> => {
    const stateWithUi = await behavior.ensureUiStrings(params.nextState, userMessage);
    const shouldSuspendPendingPicker =
      (!params.compare || params.compare.enabled !== true) &&
      readCompareRuntime(params.specialist)?.status === "pending";
    const responseSpecialistBase = shouldSuspendPendingPicker
      ? suspendPendingCompareSpecialist(params.specialist)
      : params.specialist;
    const responseSpecialist =
      dreamBuilderModeActive
        ? clearDreamBuilderLegacyCompareFields(responseSpecialistBase)
        : responseSpecialistBase;
    writeLastSpecialist(stateWithUi, responseSpecialist);
    state = stateWithUi;
    const payload = params.compare && params.compare.enabled === true
      ? behavior.attachRegistryPayload(
          {
            ok: true,
            tool: "run_step",
            current_step_id: String(stateWithUi.current_step),
            active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
            text: behavior.buildTextForWidget({ specialist: responseSpecialist, state: stateWithUi }),
            prompt: behavior.pickPrompt(responseSpecialist),
            specialist: responseSpecialist,
            state: stateWithUi,
          },
          responseSpecialist,
          null,
          [],
          [],
          params.compare
        )
      : behavior.attachRegistryPayload(
          {
            ok: true,
            tool: "run_step",
            current_step_id: String(stateWithUi.current_step),
            active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
            text: behavior.buildTextForWidget({ specialist: responseSpecialist, state: stateWithUi }),
            prompt: behavior.pickPrompt(responseSpecialist),
            specialist: responseSpecialist,
            state: stateWithUi,
          },
          responseSpecialist
        );

    return {
      response: behavior.finalizeResponse(payload),
      state,
      userMessage,
      submittedTextIntent,
      submittedTextAnchor,
      acceptedOutputUserTurnClassification,
      responseUiFlags: null,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  };
  const deterministicIntroTargetForAction = (
    actionCode: string
  ): { stepId: string; specialistId: string } | null => {
    const normalized = String(actionCode || "").trim().toUpperCase();
    if (normalized === "ACTION_STEP0_READY_START") {
      return {
        stepId: ids.dreamStepId,
        specialistId: ids.dreamSpecialist,
      };
    }
    if (
      normalized === "ACTION_DREAM_REFINE_CONFIRM" ||
      normalized === "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM"
    ) {
      return {
        stepId: ids.purposeStepId,
        specialistId: ids.purposeSpecialist,
      };
    }
    return null;
  };
  const buildDeterministicIntroResponse = async (): Promise<
    RunStepRuntimeActionRoutingOutput<TPayload> | null
  > => {
    if (!forcedProceed) return null;
    const target = deterministicIntroTargetForAction(runtime.actionCodeRaw);
    if (!target) return null;
    if (String((state as Record<string, unknown>).current_step || "").trim() !== target.stepId) return null;

    const responseUiFlags = behavior.resolveResponseUiFlags(runtime.actionCodeRaw);
    const stateWithUi = await behavior.ensureUiStrings(state, runtime.actionCodeRaw || userMessage);
    const introSpecialistSeed = behavior.applyCentralMetaTopicRouter({
      stepId: target.stepId,
      specialistResult: {
        action: "INTRO",
        message: "",
        question: "",
        wants_recap: false,
        is_offtopic: false,
        user_intent: "STEP_INPUT",
        meta_topic: "NONE",
      },
      previousSpecialist: forcedProceedPreviousSpecialist,
      state: stateWithUi,
      userMessage: "",
    });
    const forcedDecision = {
      specialist_to_call: target.specialistId,
      specialist_input: `CURRENT_STEP_ID: ${target.stepId} | USER_MESSAGE: ${runtime.actionCodeRaw}`,
      current_step: target.stepId,
      intro_shown_for_step: String((stateWithUi as Record<string, unknown>).intro_shown_for_step ?? ""),
      intro_shown_session:
        String((stateWithUi as Record<string, unknown>).intro_shown_session ?? "").trim() === "true"
          ? "true"
          : "false",
      show_step_intro: "true",
      show_session_intro: "false",
    } as OrchestratorOutput;
    const nextState = statePorts.applyPostSpecialistStateMutations({
      prevState: stateWithUi,
      decision: forcedDecision,
      specialistResult: introSpecialistSeed,
      provisionalSource: "action_route",
    });
    const renderedResult = behavior.turnResponseEngine.renderValidateRecover({
      state: nextState,
      specialist: introSpecialistSeed,
      previousSpecialist: forcedProceedPreviousSpecialist,
      telemetry: runtime.uiI18nTelemetry,
      onContractViolation: () =>
        behavior.finalizeResponse(
          behavior.attachRegistryPayload(
            {
              ok: true,
              tool: "run_step",
              current_step_id: String(nextState.current_step || ""),
              active_specialist: String((nextState as Record<string, unknown>).active_specialist || ""),
              text: behavior.buildTextForWidget({ specialist: introSpecialistSeed, state: nextState }),
              prompt: behavior.pickPrompt(introSpecialistSeed),
              specialist: introSpecialistSeed,
              state: nextState,
            },
            introSpecialistSeed,
            responseUiFlags
          )
        ),
    });
    if (!renderedResult.ok) {
      return {
        response: renderedResult.payload,
        state: nextState,
        userMessage,
        submittedTextIntent,
        submittedTextAnchor,
        acceptedOutputUserTurnClassification,
        responseUiFlags,
        bigwhyMaxWords: BIGWHY_MAX_WORDS,
        countWords,
        pickBigWhyCandidate,
        buildBigWhyTooLongFeedback,
      };
    }
    const renderedState = await behavior.ensureUiStrings(
      {
        ...renderedResult.value.state,
        last_specialist_result: attachCompareRuntime(renderedResult.value.specialist),
      },
      runtime.actionCodeRaw || userMessage
    );
    state = renderedState;
    return {
      response: behavior.turnResponseEngine.attachAndFinalize({
        state: renderedState,
        specialist: renderedResult.value.specialist,
        responseUiFlags,
        actionCodesOverride: renderedResult.value.actionCodes,
        renderedActionsOverride: renderedResult.value.renderedActions,
        contractMetaOverride: renderedResult.value.contractMeta,
      }),
      state: renderedState,
      userMessage,
      submittedTextIntent,
      submittedTextAnchor,
      acceptedOutputUserTurnClassification,
      responseUiFlags,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  };
  const deterministicIntroResponse = await buildDeterministicIntroResponse();
  if (deterministicIntroResponse) {
    return deterministicIntroResponse;
  }
  const dreamBuilderComparePending =
    runtime.inputMode === "widget" &&
    dreamBuilderModeActive &&
    Boolean(readDreamBuilderCompareRuntime(pendingBeforeTurn));
  let hasPendingCompare =
    runtime.compareEnabled &&
    runtime.inputMode === "widget" &&
    !dreamBuilderModeActive &&
    readCompareRuntime(pendingBeforeTurn)?.status === "pending" &&
    compare.isCompareEligibleContext(
      String(state.current_step || ""),
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      pendingBeforeTurn,
      action.getDreamRuntimeMode(state)
    ) &&
    hasRenderablePendingCompare(pendingBeforeTurn);
  const suspendPendingCompare = (specialist: Record<string, unknown>) => {
    const suspended = suspendPendingCompareSpecialist(specialist);
    writeLastSpecialist(state, suspended);
    pendingBeforeTurn = suspended;
    hasPendingCompare = false;
  };
  const shouldResolvePendingCompareFromTextIntent =
    hasPendingCompare &&
    hasFreeTextWhilePending &&
    !isRulesProceedBlockTurn &&
    !dreamBuilderComparePending;
  if (dreamBuilderComparePending && hasFreeTextWhilePending) {
    const suspended = suspendPendingDreamBuilderCompareSpecialist(pendingBeforeTurn);
    writeLastSpecialist(state, suspended);
    pendingBeforeTurn = suspended;
  }
  if (shouldResolvePendingCompareFromTextIntent) {
    const pendingCompareState = readCompareRuntime(pendingBeforeTurn);
    const pendingSuggestion = String(
      pendingCompareState?.suggestion_text || pendingBeforeTurn.refined_formulation || ""
    ).trim();
    const pendingUserInput = String(
      pendingCompareState?.user_normalized_text || pendingCompareState?.user_text || ""
    ).trim();
    acceptedOutputUserTurnClassification = await statePorts.classifyAcceptedOutputUserTurn({
      model: runtime.model,
      stepId: currentStepId,
      userMessage,
      pendingSuggestion,
      pendingUserVariant: pendingUserInput,
    });
    const pendingIntentResolution =
      acceptedOutputUserTurnClassification.turn_kind === "accept_existing_suggestion"
        ? { intent: "accept_suggestion_explicit" as const, anchor: "suggestion" as const }
        : acceptedOutputUserTurnClassification.turn_kind === "feedback_on_existing_content"
          ? { intent: "feedback_on_suggestion" as const, anchor: "suggestion" as const }
          : acceptedOutputUserTurnClassification.turn_kind === "rejection_without_replacement"
            ? { intent: "reject_suggestion_explicit" as const, anchor: "suggestion" as const }
            : await statePorts.resolvePendingCompareIntent({
                userMessage,
                stepId: currentStepId,
                pendingSuggestion,
                pendingUserInput,
              });
    submittedTextIntent = pendingIntentResolution.intent;
    submittedTextAnchor = pendingIntentResolution.anchor;
    if (pendingIntentResolution.intent !== "accept_suggestion_explicit") {
      const pendingFeedbackText = String(userMessage || "").trim();
      const preservedPresentation = String(readCompareRuntime(pendingBeforeTurn)?.presentation || "").trim();
      const nextPending = patchCompareRuntime(pendingBeforeTurn, {
        pending_text_intent: pendingIntentResolution.intent,
        pending_text_anchor: pendingIntentResolution.anchor,
        pending_text_seed_source:
          pendingIntentResolution.anchor === "suggestion" &&
          (
            pendingIntentResolution.intent === "feedback_on_suggestion" ||
            pendingIntentResolution.intent === "reject_suggestion_explicit"
          )
            ? "previous_suggestion"
            : "user_input",
        pending_text_feedback_text:
          pendingIntentResolution.anchor === "suggestion" ? pendingFeedbackText : "",
        pending_text_presentation_mode:
          pendingIntentResolution.anchor === "suggestion" &&
          (
            pendingIntentResolution.intent === "feedback_on_suggestion" ||
            pendingIntentResolution.intent === "reject_suggestion_explicit"
          )
            ? "canonical"
            : (preservedPresentation || "picker"),
      });
      writeLastSpecialist(state, nextPending);
      pendingBeforeTurn = nextPending;
    }
    if (pendingIntentResolution.intent === "accept_suggestion_explicit") {
      const implicitSelection = compare.applyComparePickSelection({
        stepId: currentStepId,
        routeToken: "__COMPARE_PICK_SUGGESTION__",
        state,
        telemetry: runtime.uiI18nTelemetry,
      });
      if (implicitSelection.handled) {
        state = implicitSelection.nextState;
        userMessage = "";
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "compare_implicit_accept_count");
        return buildWidgetResponse({
          nextState: state,
          specialist: implicitSelection.specialist,
        });
      } else {
        state = statePorts.clearStepInteractiveState(state, currentStepId);
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
      }
    }
    pendingBeforeTurn = readLastSpecialist(state);
    hasPendingCompare =
      runtime.compareEnabled &&
      runtime.inputMode === "widget" &&
      !dreamBuilderModeActive &&
      readCompareRuntime(pendingBeforeTurn)?.status === "pending" &&
      compare.isCompareEligibleContext(
        String(state.current_step || ""),
        String((state as Record<string, unknown>).active_specialist || ""),
        pendingBeforeTurn,
        pendingBeforeTurn,
        action.getDreamRuntimeMode(state)
      ) &&
      hasRenderablePendingCompare(pendingBeforeTurn);
    if (hasPendingCompare) {
      if (isGeneralOfftopicInput) {
        const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
        state = stateWithUi;
        const suspendedOfftopicSpecialist = behavior.normalizeNonStep0OfftopicSpecialist({
          stepId: String(state.current_step || ""),
          activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
          userMessage,
          specialistResult: {
            ...pendingBeforeTurn,
            is_offtopic: true,
          },
          previousSpecialist: pendingBeforeTurn,
          state: stateWithUi,
        });
        writeLastSpecialist(state, suspendedOfftopicSpecialist);
        return buildWidgetResponse({
          nextState: state,
          specialist: suspendedOfftopicSpecialist,
        });
      }

      if (
        pendingIntentResolution.intent === "content_input" &&
        pendingIntentResolution.anchor === "user_input" &&
        isStepContributingInput
      ) {
        const rebuilt = compare.buildCompareFromTurn({
          stepId: currentStepId,
          state,
          activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
          previousSpecialist: pendingBeforeTurn,
          specialistResult: compare.copyPendingCompareState(
            {
              ...pendingBeforeTurn,
              refined_formulation: String(
                pendingCompareState?.suggestion_text || pendingBeforeTurn.refined_formulation || ""
              ).trim(),
            },
            pendingBeforeTurn
          ),
          userTextRaw: userMessage,
          isOfftopic: false,
          dreamRuntimeModeRaw: action.getDreamRuntimeMode(state),
        });
        const rebuiltSpecialist = rebuilt.compare
          ? normalizePendingPickerSpecialistContract({
              specialist: rebuilt.specialist,
              stepIdHint: currentStepId,
            })
          : rebuilt.specialist;
        writeLastSpecialist(state, rebuiltSpecialist);
        return buildWidgetResponse({
          nextState: state,
          specialist: rebuiltSpecialist,
          compare: rebuilt.compare || null,
        });
      }

      if (
        pendingIntentResolution.anchor === "user_input" &&
        !isStepContributingInput
      ) {
        suspendPendingCompare(pendingBeforeTurn);
      } else {
        const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
        state = stateWithUi;
        let pendingSpecialist = {
          ...pendingBeforeTurn,
          ...(isGeneralOfftopicInput ? { is_offtopic: true } : {}),
        };

        if (isGeneralOfftopicInput && String(state.current_step || "") !== ids.step0Id) {
          pendingSpecialist = behavior.normalizeNonStep0OfftopicSpecialist({
            stepId: String(state.current_step || ""),
            activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
            userMessage,
            specialistResult: pendingSpecialist,
            previousSpecialist: pendingBeforeTurn,
            state: stateWithUi,
          });
        }

        pendingSpecialist = normalizePendingPickerSpecialistContract({
          specialist: pendingSpecialist,
          stepIdHint: String(state.current_step || ""),
        });

        let pendingChoice = compare.buildCompareFromPendingSpecialist(
          pendingSpecialist,
          stateWithUi,
          String((state as Record<string, unknown>).active_specialist || ""),
          pendingBeforeTurn,
          String(state.current_step || ""),
          action.getDreamRuntimeMode(state)
        );
        if (!pendingChoice || pendingChoice.enabled !== true) {
          pendingSpecialist = normalizePendingPickerSpecialistContract({
            specialist: pendingBeforeTurn,
            stepIdHint: String(state.current_step || ""),
          });
          pendingChoice = compare.buildCompareFromPendingSpecialist(
            pendingSpecialist,
            stateWithUi,
            String((state as Record<string, unknown>).active_specialist || ""),
            pendingBeforeTurn,
            String(state.current_step || ""),
            action.getDreamRuntimeMode(state)
          );
        }

        writeLastSpecialist(state, pendingSpecialist);
        return buildWidgetResponse({
          nextState: state,
          specialist: pendingSpecialist,
          compare: pendingChoice,
        });
      }
    }
  }

  const hasPickerPendingCompareForTurn =
    hasPendingCompare;

  if (
    hasPickerPendingCompareForTurn &&
    !hasFreeTextWhilePending &&
    !compare.isComparePickRouteToken(userMessage) &&
    isStepContributingInput
  ) {
    const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
    state = stateWithUi;
    let pendingSpecialist = {
      ...pendingBeforeTurn,
      ...(isGeneralOfftopicInput ? { is_offtopic: true } : {}),
    };

    if (isGeneralOfftopicInput && String(state.current_step || "") !== ids.step0Id) {
      pendingSpecialist = behavior.normalizeNonStep0OfftopicSpecialist({
        stepId: String(state.current_step || ""),
        activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
        userMessage,
        specialistResult: pendingSpecialist,
        previousSpecialist: pendingBeforeTurn,
        state: stateWithUi,
      });
    }

    pendingSpecialist = normalizePendingPickerSpecialistContract({
      specialist: pendingSpecialist,
      stepIdHint: String(state.current_step || ""),
    });
    writeLastSpecialist(state, pendingSpecialist);

    const pendingChoice = compare.buildCompareFromPendingSpecialist(
      pendingSpecialist,
      stateWithUi,
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      String(state.current_step || ""),
      action.getDreamRuntimeMode(state)
    );
    if (!pendingChoice || pendingChoice.enabled !== true) {
      state = statePorts.clearStepInteractiveState(stateWithUi, String(state.current_step || ""));
      statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
      return {
        response: null,
        state,
        userMessage,
        submittedTextIntent,
        submittedTextAnchor,
        acceptedOutputUserTurnClassification,
        responseUiFlags: null,
        bigwhyMaxWords: BIGWHY_MAX_WORDS,
        countWords,
        pickBigWhyCandidate,
        buildBigWhyTooLongFeedback,
      };
    }

    console.log("[compare_blocked]", {
      step: String(state.current_step || ""),
      request_id: String((state as Record<string, unknown>).__request_id ?? ""),
      client_action_id: String((state as Record<string, unknown>).__client_action_id ?? ""),
    });

    const payload = behavior.attachRegistryPayload(
      {
        ok: true,
        tool: "run_step",
        current_step_id: String(state.current_step),
        active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
        text: behavior.buildTextForWidget({ specialist: pendingSpecialist, state: stateWithUi }),
        prompt: behavior.pickPrompt(pendingSpecialist),
        specialist: pendingSpecialist,
        state: stateWithUi,
      },
      pendingSpecialist,
      null,
      [],
      [],
      pendingChoice
    );

    return {
      response: behavior.finalizeResponse(payload),
      state,
      userMessage,
      submittedTextIntent,
      submittedTextAnchor,
      acceptedOutputUserTurnClassification,
      responseUiFlags: null,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  }

  let stateForCompareSelection = state;
  const activePendingSpecialist =
    readLastSpecialist(stateForCompareSelection);
  const submittedPendingInteractionId = String(
    (stateForCompareSelection as Record<string, unknown>).__submitted_pending_interaction_id || ""
  ).trim();
  const activePendingInteractionId = String(
    (stateForCompareSelection as Record<string, unknown>).__pending_interaction_id ||
    activePendingSpecialist.pending_interaction_id ||
    ""
  ).trim();
  const hasSubmittedPendingInteractionMismatch =
    runtime.compareEnabled &&
    compare.isComparePickRouteToken(userMessage) &&
    Boolean(submittedPendingInteractionId) &&
    Boolean(activePendingInteractionId) &&
    submittedPendingInteractionId !== activePendingInteractionId;
  if (hasSubmittedPendingInteractionMismatch) {
    stateForCompareSelection = await behavior.ensureUiStrings(stateForCompareSelection, userMessage);
    state = stateForCompareSelection;
    const pendingSpecialist = readLastSpecialist(stateForCompareSelection);
    const pendingChoice = compare.buildCompareFromPendingSpecialist(
      pendingSpecialist,
      stateForCompareSelection,
      String((stateForCompareSelection as Record<string, unknown>).active_specialist || ""),
      pendingSpecialist,
      String(stateForCompareSelection.current_step || ""),
      action.getDreamRuntimeMode(stateForCompareSelection)
    );
    console.warn("[pending_interaction_id_mismatch]", {
      step: String(stateForCompareSelection.current_step || ""),
      submitted_interaction_id: submittedPendingInteractionId,
      active_interaction_id: activePendingInteractionId,
      client_action_id: String((stateForCompareSelection as Record<string, unknown>).__client_action_id || ""),
    });
    if (pendingChoice && pendingChoice.enabled === true) {
      return buildWidgetResponse({
        nextState: stateForCompareSelection,
        specialist: pendingSpecialist,
        compare: pendingChoice,
      });
    }
  }
  if (runtime.compareEnabled && compare.isComparePickRouteToken(userMessage)) {
    stateForCompareSelection = await behavior.ensureUiStrings(stateForCompareSelection, userMessage);
    state = stateForCompareSelection;
  }
  const compareSelection = runtime.compareEnabled
    ? compare.applyComparePickSelection({
        stepId: String(stateForCompareSelection.current_step ?? ""),
        routeToken: userMessage,
        state: stateForCompareSelection,
        telemetry: runtime.uiI18nTelemetry,
      })
    : {
        handled: false,
        specialist: readLastSpecialist(state),
        nextState: state,
      };

  if (compareSelection.handled) {
    const stateWithUi = await behavior.ensureUiStrings(compareSelection.nextState, userMessage);
    state = stateWithUi;
    const payload = behavior.attachRegistryPayload(
      {
        ok: true,
        tool: "run_step",
        current_step_id: String(stateWithUi.current_step),
        active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
        text: behavior.buildTextForWidget({ specialist: compareSelection.specialist, state: stateWithUi }),
        prompt: behavior.pickPrompt(compareSelection.specialist),
        specialist: compareSelection.specialist,
        state: stateWithUi,
      },
      compareSelection.specialist
    );

    return {
      response: behavior.finalizeResponse(payload),
      state,
      userMessage,
      submittedTextIntent,
      submittedTextAnchor,
      acceptedOutputUserTurnClassification,
      responseUiFlags: null,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  }

  const responseUiFlags = behavior.resolveResponseUiFlags(userMessage);
  const initialUserMessage = String((state as Record<string, unknown>).initial_user_message ?? "").trim();
  if (
    userMessage.trim() === "" &&
    initialUserMessage &&
    state.current_step === ids.step0Id &&
    String((state as Record<string, unknown>).step_0_final ?? "").trim() === ""
  ) {
    userMessage = initialUserMessage;
  }

  return {
    response: null,
    state,
    userMessage,
    submittedTextIntent,
    submittedTextAnchor,
    acceptedOutputUserTurnClassification,
    responseUiFlags,
    bigwhyMaxWords: BIGWHY_MAX_WORDS,
    countWords,
    pickBigWhyCandidate,
    buildBigWhyTooLongFeedback,
  };
}
