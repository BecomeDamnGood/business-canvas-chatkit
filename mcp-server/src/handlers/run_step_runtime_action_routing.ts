import type { CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import type { RunStepAttachRegistryPayload } from "./run_step_ports.js";
import type { WordingChoiceUiPayload } from "./run_step_runtime_action_helpers.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import type {
  PendingWordingChoiceIntentResolution,
  PendingWordingChoiceTextAnchor,
  PendingWordingChoiceTextIntent,
} from "./run_step_wording_heuristics.js";
import {
  BIGWHY_MAX_WORDS,
  buildActionCodeStepTransitions,
  countWords,
  pickBigWhyCandidate,
  resolveRequiredFinalValue,
} from "./run_step_runtime_action_routing_policy.js";
import { normalizePendingPickerSpecialistContract } from "./run_step_wording_picker_contract.js";
import { isSingleValueTextPickerStep } from "./run_step_wording_picker_contract.js";

export type RunStepRuntimeActionRoutingOutput<TPayload extends Record<string, unknown>> = {
  response: TPayload | null;
  state: CanvasState;
  userMessage: string;
  submittedTextIntent: PendingWordingChoiceTextIntent | "";
  submittedTextAnchor: PendingWordingChoiceTextAnchor | "";
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
    wordingChoiceEnabled: boolean;
    wordingChoiceIntentV1: boolean;
    uiI18nTelemetry: unknown;
  };
  ids: {
    step0Id: string;
    dreamStepId: string;
    purposeStepId: string;
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
    isUiStateHygieneSwitchV1Enabled: () => boolean;
    isClearlyGeneralOfftopicInput: (userMessage: string) => boolean;
    shouldTreatAsStepContributingInput: (userMessage: string, stepId: string) => boolean;
    resolvePendingWordingChoiceIntent: (params: {
      userMessage: string;
      stepId: string;
      pendingSuggestion: string;
      pendingUserInput: string;
    }) => Promise<PendingWordingChoiceIntentResolution> | PendingWordingChoiceIntentResolution;
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
  wording: {
    isWordingChoiceEligibleContext: (
      stepId: string,
      activeSpecialist: string,
      specialist?: Record<string, unknown> | null,
      previousSpecialist?: Record<string, unknown> | null,
      dreamRuntimeModeRaw?: unknown
    ) => boolean;
    buildWordingChoiceFromPendingSpecialist: (
      specialistResult: Record<string, unknown>,
      state: CanvasState | null | undefined,
      activeSpecialist: string,
      previousSpecialist: Record<string, unknown>,
      stepId: string,
      dreamRuntimeModeRaw?: unknown
    ) => WordingChoiceUiPayload | null;
    applyWordingPickSelection: (params: {
      stepId: string;
      routeToken: string;
      state: CanvasState;
      telemetry: unknown;
    }) => {
      handled: boolean;
      specialist: Record<string, unknown>;
      nextState: CanvasState;
    };
    isWordingPickRouteToken: (raw: string) => boolean;
    isRefineAdjustRouteToken: (raw: string) => boolean;
    buildWordingChoiceFromTurn: (params: {
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
      wordingChoice?: WordingChoiceUiPayload | null;
    };
    pickWordingAgentBase: (specialist: Record<string, unknown>) => string;
    copyPendingWordingChoiceState: (
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
    finalizeResponse: (payload: TPayload) => TPayload;
    attachRegistryPayload: RunStepAttachRegistryPayload<TPayload>;
    resolveResponseUiFlags: (actionCodeOrRouteToken: string) => Record<string, boolean | string> | null;
  };
}): Promise<RunStepRuntimeActionRoutingOutput<TPayload>> {
  const {
    runtime,
    ids,
    action,
    state: statePorts,
    wording,
    behavior,
  } = params;

  let state = runtime.state;
  let userMessage = runtime.userMessage;
  let forcedProceed = false;
  let submittedTextIntent: PendingWordingChoiceTextIntent | "" = "";
  let submittedTextAnchor: PendingWordingChoiceTextAnchor | "" = "";
  let acceptedOutputUserTurnClassification: AcceptedOutputUserTurnClassification | null = null;

  const normalizeItems = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.map((line) => String(line || "").trim()).filter(Boolean)
      : [];

  const hasRenderablePendingWordingChoice = (specialist: Record<string, unknown>): boolean => {
    if (String(specialist.wording_choice_pending || "").trim() !== "true") return false;
    const mode = String(specialist.wording_choice_mode || "text").trim() === "list" ? "list" : "text";
    const stepId = String(specialist.wording_choice_target_field || "").trim();
    const userText = String(specialist.wording_choice_user_normalized || specialist.wording_choice_user_raw || "").trim();
    const suggestionText = String(specialist.wording_choice_agent_current || specialist.refined_formulation || "").trim();
    const userItems = normalizeItems(specialist.wording_choice_user_items);
    const suggestionItems = normalizeItems(specialist.wording_choice_suggestion_items);
    if (mode === "list") {
      const hasUser = userItems.length > 0 || Boolean(userText);
      const hasSuggestion = suggestionItems.length > 0 || Boolean(suggestionText);
      return hasUser && hasSuggestion;
    }
    if (
      pendingWordingChoicePresentation(specialist) === "picker" &&
      isSingleValueTextPickerStep(stepId, mode) &&
      String(specialist.wording_choice_user_variant_stepworthy || "").trim() !== "true"
    ) {
      return false;
    }
    return Boolean(userText && suggestionText);
  };

  const pendingWordingChoicePresentation = (specialist: Record<string, unknown>): "picker" | "canonical" =>
    String(specialist.wording_choice_presentation || "").trim() === "canonical" ? "canonical" : "picker";

  const hasPickerPendingWordingChoice = (specialist: Record<string, unknown>): boolean =>
    pendingWordingChoicePresentation(specialist) === "picker" && hasRenderablePendingWordingChoice(specialist);

  const normalizeAcceptedOutputPendingSpecialist = async (
    specialist: Record<string, unknown>,
    stepId: string
  ): Promise<Record<string, unknown>> => {
    if (String(specialist.wording_choice_pending || "").trim() !== "true") return specialist;
    const mode = String(specialist.wording_choice_mode || "text").trim() === "list" ? "list" : "text";
    if (!isSingleValueTextPickerStep(stepId, mode)) return specialist;
    if (pendingWordingChoicePresentation(specialist) !== "picker") return specialist;
    if (String(specialist.wording_choice_user_variant_stepworthy || "").trim() === "true") return specialist;
    const userVariant = String(specialist.wording_choice_user_normalized || specialist.wording_choice_user_raw || "").trim();
    const suggestion = String(specialist.wording_choice_agent_current || specialist.refined_formulation || "").trim();
    if (!userVariant || !suggestion) return specialist;
    const classification = await statePorts.classifyAcceptedOutputUserTurn({
      model: runtime.model,
      stepId,
      userMessage: userVariant,
      pendingSuggestion: suggestion,
      pendingUserVariant: userVariant,
    });
    return {
      ...specialist,
      wording_choice_user_variant_semantics: classification.turn_kind,
      wording_choice_user_variant_stepworthy: classification.user_variant_is_stepworthy ? "true" : "false",
      wording_choice_presentation: classification.user_variant_is_stepworthy ? "picker" : "canonical",
    };
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
    const prev =
      ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};

    if (
      runtime.wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      wording.isWordingChoiceEligibleContext(
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
      (state as Record<string, unknown>).last_specialist_result = pendingSpecialist;
      const pendingChoice = wording.buildWordingChoiceFromPendingSpecialist(
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
          { require_wording_pick: true },
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
      if (
        String(pendingSpecialist.wording_choice_pending || "").trim() === "true" &&
        pendingWordingChoicePresentation(pendingSpecialist) === "canonical" &&
        hasRenderablePendingWordingChoice(pendingSpecialist)
      ) {
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
          pendingSpecialist
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
      runtime.wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      !wording.isWordingChoiceEligibleContext(
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
      (state as Record<string, unknown>).last_specialist_result = {};
      if (String((state as Record<string, unknown>).current_step || "") !== ids.dreamStepId) {
        action.setDreamRuntimeMode(state, "self");
      }
      userMessage = "";
      forcedProceed = true;
    }
  }

  if (!forcedProceed && !userMessage.startsWith("ACTION_")) {
    const stepId = String(state.current_step || "").trim();
    if (stepId) {
      const pending = (((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) ||
        {}) as Record<string, unknown>;
      if (String(pending.wording_choice_pending || "").trim() === "true" && !hasRenderablePendingWordingChoice(pending)) {
        state = statePorts.clearStepInteractiveState(state, stepId);
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
      }
    }
  }

  if (!forcedProceed && !userMessage.startsWith("ACTION_") && !wording.isWordingPickRouteToken(userMessage)) {
    const stepId = String(state.current_step || "").trim();
    if (stepId) {
      const sourceMenuId = action.inferCurrentMenuForStep(state, stepId);
      const confirmActionCode = action.firstConfirmActionCodeForMenu(String(sourceMenuId || "").trim());
      if (confirmActionCode && looksLikeProceedTextIntent(userMessage)) {
        userMessage = confirmActionCode;
      } else if (looksLikeProceedTextIntent(userMessage)) {
        const pendingSpecialist =
          (((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) ||
            {}) as Record<string, unknown>;
        const hasPendingWordingChoice =
          runtime.wordingChoiceEnabled &&
          String(pendingSpecialist.wording_choice_pending || "").trim() === "true" &&
          wording.isWordingChoiceEligibleContext(
            stepId,
            String((state as Record<string, unknown>).active_specialist || ""),
            pendingSpecialist,
            pendingSpecialist,
            action.getDreamRuntimeMode(state)
          ) &&
          hasPickerPendingWordingChoice(pendingSpecialist);
        if (hasPendingWordingChoice) {
          userMessage = "__WORDING_PICK_SUGGESTION__";
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

    if (runtime.inputMode === "widget" && routed === actionCodeInput) {
      const clickedLabel = String((state as Record<string, unknown>).__last_clicked_label_for_contract || "").trim();
      userMessage = clickedLabel;
    } else {
      userMessage = routed;
    }
  }

  let pendingBeforeTurn =
    ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
  const currentStepId = String(state.current_step || "");
  const isGeneralOfftopicInput = statePorts.isClearlyGeneralOfftopicInput(userMessage);
  const isStepContributingInput = statePorts.shouldTreatAsStepContributingInput(userMessage, currentStepId);
  const hasFreeTextWhilePending =
    Boolean(String(userMessage || "").trim()) &&
    !String(userMessage || "").trim().startsWith("ACTION_") &&
    !String(userMessage || "").trim().startsWith("__ROUTE__") &&
    !wording.isWordingPickRouteToken(userMessage);
  let hasPendingWordingChoice =
    runtime.wordingChoiceEnabled &&
    runtime.inputMode === "widget" &&
    String(pendingBeforeTurn.wording_choice_pending || "") === "true" &&
    wording.isWordingChoiceEligibleContext(
      String(state.current_step || ""),
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      pendingBeforeTurn,
      action.getDreamRuntimeMode(state)
    ) &&
    hasRenderablePendingWordingChoice(pendingBeforeTurn);
  const shouldResolvePendingWordingFromTextIntent =
    hasPendingWordingChoice &&
    hasFreeTextWhilePending;
  if (shouldResolvePendingWordingFromTextIntent) {
    const pendingSuggestion = String(
      pendingBeforeTurn.wording_choice_agent_current || pendingBeforeTurn.refined_formulation || ""
    ).trim();
    const pendingUserInput = String(
      pendingBeforeTurn.wording_choice_user_normalized || pendingBeforeTurn.wording_choice_user_raw || ""
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
            : await statePorts.resolvePendingWordingChoiceIntent({
                userMessage,
                stepId: currentStepId,
                pendingSuggestion,
                pendingUserInput,
              });
    submittedTextIntent = pendingIntentResolution.intent;
    submittedTextAnchor = pendingIntentResolution.anchor;
    if (pendingIntentResolution.intent !== "accept_suggestion_explicit") {
      const pendingFeedbackText = String(userMessage || "").trim();
      const preservedPresentation = String(pendingBeforeTurn.wording_choice_presentation || "").trim();
      const nextPending = {
        ...pendingBeforeTurn,
        pending_suggestion_intent: pendingIntentResolution.intent,
        pending_suggestion_anchor: pendingIntentResolution.anchor,
        pending_suggestion_seed_source:
          pendingIntentResolution.anchor === "suggestion" &&
          (
            pendingIntentResolution.intent === "feedback_on_suggestion" ||
            pendingIntentResolution.intent === "reject_suggestion_explicit"
          )
            ? "previous_suggestion"
            : "user_input",
        pending_suggestion_feedback_text:
          pendingIntentResolution.anchor === "suggestion" ? pendingFeedbackText : "",
        pending_suggestion_presentation_mode:
          pendingIntentResolution.anchor === "suggestion" &&
          (
            pendingIntentResolution.intent === "feedback_on_suggestion" ||
            pendingIntentResolution.intent === "reject_suggestion_explicit"
          )
            ? "canonical"
            : (preservedPresentation || "picker"),
      };
      (state as Record<string, unknown>).last_specialist_result = nextPending;
      pendingBeforeTurn = nextPending;
    }
    if (pendingIntentResolution.intent === "accept_suggestion_explicit") {
      const implicitSelection = wording.applyWordingPickSelection({
        stepId: currentStepId,
        routeToken: "__WORDING_PICK_SUGGESTION__",
        state,
        telemetry: runtime.uiI18nTelemetry,
      });
      if (implicitSelection.handled) {
        state = implicitSelection.nextState;
        userMessage = "";
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "wording_choice_implicit_accept_count");
      } else {
        state = statePorts.clearStepInteractiveState(state, currentStepId);
        statePorts.bumpUiI18nCounter(runtime.uiI18nTelemetry, "state_hygiene_resets_count");
      }
    }
    pendingBeforeTurn =
      ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    hasPendingWordingChoice =
      runtime.wordingChoiceEnabled &&
      runtime.inputMode === "widget" &&
      String(pendingBeforeTurn.wording_choice_pending || "") === "true" &&
      wording.isWordingChoiceEligibleContext(
        String(state.current_step || ""),
        String((state as Record<string, unknown>).active_specialist || ""),
        pendingBeforeTurn,
        pendingBeforeTurn,
        action.getDreamRuntimeMode(state)
      ) &&
      hasRenderablePendingWordingChoice(pendingBeforeTurn);
  }

  const hasPickerPendingWordingChoiceForTurn =
    hasPendingWordingChoice &&
    pendingWordingChoicePresentation(pendingBeforeTurn) === "picker";

  if (
    hasPickerPendingWordingChoiceForTurn &&
    !hasFreeTextWhilePending &&
    !wording.isWordingPickRouteToken(userMessage) &&
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
    (state as Record<string, unknown>).last_specialist_result = pendingSpecialist;

    const pendingChoice = wording.buildWordingChoiceFromPendingSpecialist(
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

    console.log("[wording_choice_pending_blocked]", {
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
      { require_wording_pick: true },
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

  let stateForWordingSelection = state;
  if (runtime.wordingChoiceEnabled && wording.isWordingPickRouteToken(userMessage)) {
    stateForWordingSelection = await behavior.ensureUiStrings(stateForWordingSelection, userMessage);
    state = stateForWordingSelection;
  }
  const wordingSelection = runtime.wordingChoiceEnabled
    ? wording.applyWordingPickSelection({
        stepId: String(stateForWordingSelection.current_step ?? ""),
        routeToken: userMessage,
        state: stateForWordingSelection,
        telemetry: runtime.uiI18nTelemetry,
      })
    : {
        handled: false,
        specialist:
          ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {},
        nextState: state,
      };

  if (wordingSelection.handled) {
    const stateWithUi = await behavior.ensureUiStrings(wordingSelection.nextState, userMessage);
    state = stateWithUi;
    const payload = behavior.attachRegistryPayload(
      {
        ok: true,
        tool: "run_step",
        current_step_id: String(stateWithUi.current_step),
        active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
        text: behavior.buildTextForWidget({ specialist: wordingSelection.specialist, state: stateWithUi }),
        prompt: behavior.pickPrompt(wordingSelection.specialist),
        specialist: wordingSelection.specialist,
        state: stateWithUi,
      },
      wordingSelection.specialist
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

  const refineAdjustTurn = wording.isRefineAdjustRouteToken(userMessage);
  if (refineAdjustTurn && runtime.wordingChoiceEnabled && runtime.inputMode === "widget") {
    const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
    state = stateWithUi;
    const prev =
      ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    const rebuilt = wording.buildWordingChoiceFromTurn({
      stepId: String(state.current_step || ""),
      state,
      activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
      previousSpecialist: prev,
      specialistResult: prev,
      userTextRaw: String(prev.wording_choice_user_normalized || prev.wording_choice_user_raw || "").trim(),
      isOfftopic: false,
      forcePending: true,
    });
    if (rebuilt.wordingChoice) {
      const pendingSpecialist = normalizePendingPickerSpecialistContract({
        specialist: rebuilt.specialist,
        stepIdHint: String(state.current_step || ""),
      });
      (state as Record<string, unknown>).last_specialist_result = pendingSpecialist;
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
        { require_wording_pick: true },
        [],
        [],
        rebuilt.wordingChoice
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

  if (refineAdjustTurn) {
    const prev =
      ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    const agentBase = wording.pickWordingAgentBase(prev);
    if (agentBase) {
      const nextPrev = {
        ...prev,
        refined_formulation: agentBase,
        wording_choice_agent_current: agentBase,
      };
      (state as Record<string, unknown>).last_specialist_result = nextPrev;
    }
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
