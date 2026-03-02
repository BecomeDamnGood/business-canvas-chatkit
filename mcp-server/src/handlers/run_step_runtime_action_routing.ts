import type { CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import type { RunStepAttachRegistryPayload } from "./run_step_ports.js";
import type { WordingChoiceUiPayload } from "./run_step_runtime_action_helpers.js";
import {
  BIGWHY_MAX_WORDS,
  buildActionCodeStepTransitions,
  countWords,
  pickBigWhyCandidate,
  resolveRequiredFinalValue,
} from "./run_step_runtime_action_routing_policy.js";

export type RunStepRuntimeActionRoutingOutput<TPayload extends Record<string, unknown>> = {
  response: TPayload | null;
  state: CanvasState;
  userMessage: string;
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
    inputMode: "widget" | "chat";
    wordingChoiceEnabled: boolean;
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
    bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
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
    buildTextForWidget: (params: { specialist: Record<string, unknown> }) => string;
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

  const buildBigWhyTooLongFeedback = (stateForText: CanvasState): Record<string, unknown> => {
    const message = behavior.uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.message",
      behavior.uiDefaultString(
        "bigwhy.tooLong.message",
        "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version."
      )
    );
    const question = behavior.uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.question",
      behavior.uiDefaultString("bigwhy.tooLong.question", "Can you rewrite it in 28 words or fewer?")
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
      const pendingSpecialist = { ...prev };
      const pendingChoice = wording.buildWordingChoiceFromPendingSpecialist(
        pendingSpecialist,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        stepId,
        action.getDreamRuntimeMode(state)
      );
      const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
      const payload = behavior.attachRegistryPayload(
        {
          ok: true,
          tool: "run_step",
          current_step_id: String(state.current_step),
          active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
          text: behavior.buildTextForWidget({ specialist: pendingSpecialist }),
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
        responseUiFlags: null,
        bigwhyMaxWords: BIGWHY_MAX_WORDS,
        countWords,
        pickBigWhyCandidate,
        buildBigWhyTooLongFeedback,
      };
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
        state = statePorts.isUiStateHygieneSwitchV1Enabled()
          ? statePorts.clearStepInteractiveState(state, stepId)
          : statePorts.clearProvisionalValue(state, stepId);
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
      const specialistSnapshot = runtime.lastSpecialistResult || {};
      const payload = behavior.attachRegistryPayload(
        {
          ok: false,
          tool: "run_step",
          current_step_id: String(state.current_step),
          active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
          text: "",
          prompt: "",
          specialist: specialistSnapshot,
          state,
          error: {
            type: "contract_violation",
            message: "ActionCode transition violates menu contract.",
            reason: "missing_or_invalid_transition_for_actioncode",
            action_code: safeActionCodeInput,
            step: currentStepForMenuTransition,
            source_menu_id: sourceMenuForTransition || "",
          },
        },
        specialistSnapshot
      );
      return {
        response: behavior.finalizeResponse(payload),
        state,
        userMessage,
        responseUiFlags: null,
        bigwhyMaxWords: BIGWHY_MAX_WORDS,
        countWords,
        pickBigWhyCandidate,
        buildBigWhyTooLongFeedback,
      };
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
      const errorPayload = {
        ok: false,
        tool: "run_step",
        current_step_id: String(state.current_step),
        active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
        text: behavior.uiStringFromStateMap(
          state,
          "error.unknownAction",
          behavior.uiDefaultString(
            "error.unknownAction",
            "We could not process this choice. Please refresh and try again."
          )
        ),
        prompt: "",
        specialist: runtime.lastSpecialistResult,
        state,
        error: {
          type: "unknown_actioncode",
          action_code: actionCodeInput,
          strict: true,
        },
      };
      const payload = behavior.attachRegistryPayload(
        errorPayload,
        runtime.lastSpecialistResult
      );
      return {
        response: behavior.finalizeResponse(payload),
        state,
        userMessage,
        responseUiFlags: null,
        bigwhyMaxWords: BIGWHY_MAX_WORDS,
        countWords,
        pickBigWhyCandidate,
        buildBigWhyTooLongFeedback,
      };
    }

    userMessage = routed;
  }

  const pendingBeforeTurn =
    ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
  const isGeneralOfftopicInput = statePorts.isClearlyGeneralOfftopicInput(userMessage);
  const shouldKeepPendingOnOfftopic =
    String(state.current_step || "") === ids.dreamStepId && isGeneralOfftopicInput;

  if (
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
    !wording.isWordingPickRouteToken(userMessage) &&
    (!isGeneralOfftopicInput || shouldKeepPendingOnOfftopic)
  ) {
    const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
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
      if (shouldKeepPendingOnOfftopic) {
        pendingSpecialist = wording.copyPendingWordingChoiceState(
          pendingSpecialist,
          pendingBeforeTurn
        );
      }
    }

    const pendingChoice = wording.buildWordingChoiceFromPendingSpecialist(
      pendingSpecialist,
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      String(state.current_step || ""),
      action.getDreamRuntimeMode(state)
    );

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
        text: behavior.buildTextForWidget({ specialist: pendingSpecialist }),
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
      responseUiFlags: null,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  }

  const wordingSelection = runtime.wordingChoiceEnabled
    ? wording.applyWordingPickSelection({
        stepId: String(state.current_step ?? ""),
        routeToken: userMessage,
        state,
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
    const payload = behavior.attachRegistryPayload(
      {
        ok: true,
        tool: "run_step",
        current_step_id: String(stateWithUi.current_step),
        active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
        text: behavior.buildTextForWidget({ specialist: wordingSelection.specialist }),
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
      responseUiFlags: null,
      bigwhyMaxWords: BIGWHY_MAX_WORDS,
      countWords,
      pickBigWhyCandidate,
      buildBigWhyTooLongFeedback,
    };
  }

  const refineAdjustTurn = wording.isRefineAdjustRouteToken(userMessage);
  if (refineAdjustTurn && runtime.wordingChoiceEnabled && runtime.inputMode === "widget") {
    const prev =
      ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    const rebuilt = wording.buildWordingChoiceFromTurn({
      stepId: String(state.current_step || ""),
      activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
      previousSpecialist: prev,
      specialistResult: prev,
      userTextRaw: String(prev.wording_choice_user_raw || prev.wording_choice_user_normalized || "").trim(),
      isOfftopic: false,
      forcePending: true,
    });
    if (rebuilt.wordingChoice) {
      const pendingSpecialist = { ...rebuilt.specialist };
      (state as Record<string, unknown>).last_specialist_result = pendingSpecialist;
      const stateWithUi = await behavior.ensureUiStrings(state, userMessage);
      const payload = behavior.attachRegistryPayload(
        {
          ok: true,
          tool: "run_step",
          current_step_id: String(state.current_step),
          active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
          text: behavior.buildTextForWidget({ specialist: pendingSpecialist }),
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
    responseUiFlags,
    bigwhyMaxWords: BIGWHY_MAX_WORDS,
    countWords,
    pickBigWhyCandidate,
    buildBigWhyTooLongFeedback,
  };
}
