import type { CanvasState } from "../core/state.js";
import {
  type RunStepContext,
  type RunStepPostSpecialistPipelineRequest,
  toRunPostSpecialistPipelineRequest,
} from "./run_step_context.js";
import type { RunStepPipelinePorts } from "./run_step_ports.js";
import type { UiContractMeta, WordingChoiceUiPayload } from "./run_step_ui_payload.js";
type RunPostSpecialistPipelineParams = RunStepPostSpecialistPipelineRequest;

type RunStepPipelineFlatPorts<TPayload> =
  & RunStepPipelinePorts<TPayload>["ids"]
  & RunStepPipelinePorts<TPayload>["policy"]
  & RunStepPipelinePorts<TPayload>["specialist"]
  & RunStepPipelinePorts<TPayload>["normalization"]
  & RunStepPipelinePorts<TPayload>["state"]
  & RunStepPipelinePorts<TPayload>["render"]
  & RunStepPipelinePorts<TPayload>["wording"]
  & RunStepPipelinePorts<TPayload>["response"]
  & RunStepPipelinePorts<TPayload>["guard"]
  & RunStepPipelinePorts<TPayload>["i18n"];

const POST_SPECIALIST_STAGE_ORDER = [
  "pre_guard_normalization",
  "repair_attempts",
  "state_mutation",
  "render_validate",
  "optional_rerender_recovery",
  "overlay_pass",
  "contract_propagation",
] as const;

function flattenRunStepPipelinePorts<TPayload>(
  ports: RunStepPipelinePorts<TPayload>
): RunStepPipelineFlatPorts<TPayload> {
  return {
    ...ports.ids,
    ...ports.policy,
    ...ports.specialist,
    ...ports.normalization,
    ...ports.state,
    ...ports.render,
    ...ports.wording,
    ...ports.response,
    ...ports.guard,
    ...ports.i18n,
  };
}

export function createRunStepPipelineHelpers<TPayload>(ports: RunStepPipelinePorts<TPayload>) {
  const deps = flattenRunStepPipelinePorts(ports);
  function buildContractViolationPayload(params: {
    state: CanvasState;
    stepId: string;
    activeSpecialist: string;
    specialistSnapshot: Record<string, unknown>;
    reason: string;
    message: string;
    extraError?: Record<string, unknown>;
  }): TPayload {
    return deps.attachRegistryPayload(
      {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(params.state.current_step),
        active_specialist: params.activeSpecialist,
        text: "",
        prompt: "",
        specialist: params.specialistSnapshot,
        state: params.state,
        error: {
          type: "contract_violation",
          message: params.message,
          reason: params.reason,
          step: params.stepId,
          ...(params.extraError || {}),
        },
      },
      params.specialistSnapshot
    );
  }

  async function runPostSpecialistPipeline(context: RunStepContext): Promise<TPayload> {
    const params: RunPostSpecialistPipelineParams = toRunPostSpecialistPipelineRequest(context);
    void POST_SPECIALIST_STAGE_ORDER;

    let state = params.state;
    let userMessage = params.userMessage;
    const decision1 = params.decideOrchestration(state, userMessage);
    const showSessionIntro = String(decision1.show_session_intro || "");

    const call1 = await deps.callSpecialistStrictSafe(
      { model: params.model, state, decision: decision1, userMessage },
      deps.buildRoutingContext(userMessage),
      state
    );
    if (!call1.ok) return call1.payload;
    params.rememberLlmCall(call1.value);

    let attempts = call1.value.attempts;
    let specialistResult: any = call1.value.specialistResult;

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      specialistResult &&
      String(specialistResult.scoring_phase ?? "") === "true" &&
      (!Array.isArray(specialistResult.statements) || specialistResult.statements.length === 0)
    ) {
      const prevStatements = Array.isArray((state as any).dream_builder_statements)
        ? (state as any).dream_builder_statements
        : Array.isArray((state as any).last_specialist_result?.statements)
          ? (state as any).last_specialist_result.statements
          : [];
      if (prevStatements.length > 0) {
        specialistResult = { ...specialistResult, statements: prevStatements };
      }
    }

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      specialistResult &&
      String(specialistResult.scoring_phase ?? "") === "true"
    ) {
      const stmtCount = Array.isArray(specialistResult.statements) ? specialistResult.statements.length : 0;
      if (stmtCount < 20) {
        specialistResult = {
          ...specialistResult,
          scoring_phase: "false",
          clusters: [],
        };
      }
    }
    if (decision1.specialist_to_call === deps.dreamExplainerSpecialist) {
      const modeAtTurnStart = deps.getDreamRuntimeMode(state);
      const previousCanonicalCount = Array.isArray((state as any).dream_builder_statements)
        ? ((state as any).dream_builder_statements as unknown[]).length
        : 0;
      const currentStatementCount = Array.isArray(specialistResult?.statements)
        ? (specialistResult.statements as unknown[]).length
        : 0;
      const effectiveStatementCount = Math.max(previousCanonicalCount, currentStatementCount);
      const scoringPhase = String(specialistResult?.scoring_phase ?? "") === "true";
      const hasClusters =
        Array.isArray(specialistResult?.clusters) &&
        (specialistResult.clusters as unknown[]).length > 0;
      if (
        (modeAtTurnStart === "builder_collect" || modeAtTurnStart === "builder_scoring") &&
        effectiveStatementCount >= 20 &&
        (!scoringPhase || !hasClusters)
      ) {
        const specialistSnapshot =
          specialistResult && typeof specialistResult === "object" ? specialistResult : {};
        return buildContractViolationPayload({
          state,
          stepId: String(state.current_step || ""),
          activeSpecialist: String((state as any).active_specialist || ""),
          specialistSnapshot,
          message: "DreamBuilder reached scoring threshold without scoring view.",
          reason: "dreambuilder_scoring_required_after_threshold",
          extraError: {
            statement_count: effectiveStatementCount,
            runtime_mode: modeAtTurnStart,
          },
        });
      }
    }

    if (
      String(decision1.current_step || "") === deps.dreamStepId &&
      String(decision1.specialist_to_call || "") === deps.dreamSpecialist
    ) {
      const isOfftopic =
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
      const isMetaFallback = deps.isMetaOfftopicFallbackTurn({
        stepId: deps.dreamStepId,
        userMessage,
        specialistResult,
      });
      const hasContributingInput = deps.shouldTreatAsStepContributingInput(String(userMessage || ""), deps.dreamStepId);
      const candidateMissing = !deps.hasDreamSpecialistCandidate(specialistResult);
      if (!isOfftopic && !isMetaFallback && hasContributingInput && candidateMissing) {
        const repairSeed = String(userMessage || "").trim();
        const repairInput = repairSeed
          ? `${deps.dreamForceRefineRoutePrefix}\n${repairSeed}`
          : deps.dreamForceRefineRoutePrefix;
        const callRepair = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (callRepair.ok) {
          params.rememberLlmCall(callRepair.value);
          attempts = Math.max(attempts, callRepair.value.attempts);
          const repaired = callRepair.value.specialistResult;
          const repairedOfftopic =
            repaired?.is_offtopic === true ||
            String(repaired?.is_offtopic || "").trim().toLowerCase() === "true";
          if (!repairedOfftopic && deps.hasDreamSpecialistCandidate(repaired)) {
            specialistResult = repaired;
          } else {
            specialistResult = deps.buildDreamRefineFallbackSpecialist(specialistResult, userMessage, state);
          }
        } else {
          specialistResult = deps.buildDreamRefineFallbackSpecialist(specialistResult, userMessage, state);
        }
      }
    }

    if (
      String(decision1.current_step || "") === deps.strategyStepId &&
      String(decision1.specialist_to_call || "") === deps.strategySpecialist &&
      String(userMessage || "").trim().startsWith(deps.strategyConsolidateRouteToken)
    ) {
      const initialOfftopic =
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
      const initialCount = deps.strategyStatementsForConsolidateGuard(specialistResult, state).length;
      if (!initialOfftopic && initialCount > 7) {
        const seedStatements = deps.strategyStatementsForConsolidateGuard(specialistResult, state);
        const repairInput = seedStatements.length > 0
          ? `${deps.strategyConsolidateRouteToken}\n${seedStatements.join("\n")}`
          : deps.strategyConsolidateRouteToken;
        const repairCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (!repairCall.ok) return repairCall.payload;
        params.rememberLlmCall(repairCall.value);
        attempts = Math.max(attempts, repairCall.value.attempts);
        specialistResult = repairCall.value.specialistResult;
      }

      const repairedOfftopic =
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
      const repairedCount = deps.strategyStatementsForConsolidateGuard(specialistResult, state).length;
      if (!repairedOfftopic && repairedCount > 7) {
        const specialistSnapshot =
          specialistResult && typeof specialistResult === "object" ? specialistResult : {};
        return buildContractViolationPayload({
          state,
          stepId: String(state.current_step || ""),
          activeSpecialist: String((state as any).active_specialist || ""),
          specialistSnapshot,
          message: "Strategy consolidate route returned more than 7 focus points.",
          reason: "strategy_consolidate_overflow_after_repair",
          extraError: {
            statement_count: repairedCount,
          },
        });
      }
    }

    if (String(decision1.current_step || "") === deps.bigwhyStepId) {
      const candidate = deps.pickBigWhyCandidate(specialistResult);
      if (candidate && deps.countWords(candidate) > deps.bigwhyMaxWords) {
        const shortenRequest = `__SHORTEN_BIGWHY__ ${candidate}`;
        const callShorten = await deps.callSpecialistStrictSafe(
          {
            model: params.model,
            state,
            decision: decision1,
            userMessage: shortenRequest,
          },
          deps.buildRoutingContext(shortenRequest),
          state
        );
        if (!callShorten.ok) return callShorten.payload;
        params.rememberLlmCall(callShorten.value);
        attempts = Math.max(attempts, callShorten.value.attempts);
        specialistResult = callShorten.value.specialistResult;
        const shortened = deps.pickBigWhyCandidate(specialistResult);
        if (!shortened || deps.countWords(shortened) > deps.bigwhyMaxWords) {
          specialistResult = deps.buildBigWhyTooLongFeedback(state);
        }
      }
    }

    specialistResult = deps.normalizeEntitySpecialistResult(String(decision1.current_step || ""), specialistResult);
    specialistResult = deps.applyCentralMetaTopicRouter({
      stepId: String(decision1.current_step || ""),
      specialistResult: (specialistResult || {}) as Record<string, unknown>,
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      state,
    });
    const currentStepIdForOfftopic = String(decision1.current_step || "");
    const currentSpecialistId = String(decision1.specialist_to_call || "");
    const isOfftopicTurnAfterFallback =
      specialistResult?.is_offtopic === true ||
      String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
    if (currentStepIdForOfftopic !== deps.step0Id && isOfftopicTurnAfterFallback) {
      state = await params.ensureUiStrings(state, userMessage);
    }
    specialistResult = deps.normalizeNonStep0OfftopicSpecialist({
      stepId: currentStepIdForOfftopic,
      activeSpecialist: currentSpecialistId,
      userMessage,
      specialistResult,
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      state,
    });
    if (currentStepIdForOfftopic === deps.step0Id) {
      const sourceActionStep0 = String((specialistResult as any)?.action || "").trim().toUpperCase();
      specialistResult = deps.normalizeStep0AskDisplayContract(
        deps.step0Id,
        specialistResult,
        state,
        userMessage
      );
      const normalizedActionStep0 = String((specialistResult as any)?.action || "").trim().toUpperCase();
      if (
        sourceActionStep0 === "ESCAPE" &&
        normalizedActionStep0 === "ASK" &&
        deps.hasValidStep0Final(String((state as any).step_0_final || ""))
      ) {
        deps.bumpUiI18nCounter(params.uiI18nTelemetry, "step0_escape_ready_recovered_count");
      }
    }

    let nextState = deps.applyPostSpecialistStateMutations({
      prevState: state,
      decision: decision1,
      specialistResult,
      provisionalSource: params.actionCodeRaw ? "action_route" : "user_input",
    });

    const finalDecision = decision1;
    let actionCodesOverride: string[] | null = null;
    let renderedActionsOverride: unknown[] | null = null;
    let wordingChoiceOverride: WordingChoiceUiPayload | null = null;
    let contractMetaOverride: UiContractMeta | null = null;
    const renderedRaw = deps.renderFreeTextTurnPolicy({
      stepId: String((nextState as any).current_step ?? ""),
      state: nextState,
      specialist: (specialistResult || {}) as Record<string, unknown>,
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
    });
    const validatedRendered = deps.validateRenderedContractOrRecover({
      stepId: String((nextState as any).current_step ?? ""),
      rendered: renderedRaw,
      state: nextState,
      previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      telemetry: params.uiI18nTelemetry,
    });
    nextState = validatedRendered.state;
    const rendered = validatedRendered.rendered;
    const contractViolation = validatedRendered.violation;
    if (contractViolation) {
      return buildContractViolationPayload({
        state: nextState,
        stepId: String((nextState as any).current_step ?? ""),
        activeSpecialist: String((nextState as any).active_specialist || ""),
        specialistSnapshot: rendered.specialist,
        message: "Rendered output violates the UI contract.",
        reason: contractViolation,
        extraError: {
          contract_id: rendered.contractId,
        },
      });
    }
    specialistResult = rendered.specialist;
    let renderedStatusForPolicy = rendered.status;
    actionCodesOverride = rendered.uiActionCodes;
    renderedActionsOverride = rendered.uiActions;
    contractMetaOverride = {
      contractId: rendered.contractId,
      contractVersion: rendered.contractVersion,
      textKeys: rendered.textKeys,
    };
    deps.applyUiPhaseByStep(nextState, String((nextState as any).current_step ?? ""), rendered.contractId);
    (nextState as any).last_specialist_result = specialistResult;
    let requireWordingPick = false;

    const isDreamExplainerOfftopicTurn =
      String((nextState as any).current_step || "") === deps.dreamStepId &&
      String((nextState as any).active_specialist || "") === deps.dreamExplainerSpecialist &&
      (specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true");
    if (isDreamExplainerOfftopicTurn) {
      const previousSpecialist = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
      specialistResult = deps.normalizeNonStep0OfftopicSpecialist({
        stepId: String((nextState as any).current_step || ""),
        activeSpecialist: String((nextState as any).active_specialist || ""),
        userMessage,
        specialistResult,
        previousSpecialist,
        state: nextState,
      });
      const currentStepId = String((nextState as any).current_step || "");
      const offTopicContractId = deps.buildContractId(
        currentStepId,
        rendered.status,
        deps.dreamExplainerSwitchSelfMenuId
      );
      deps.applyUiPhaseByStep(nextState, currentStepId, offTopicContractId);
      const rerenderedRaw = deps.renderFreeTextTurnPolicy({
        stepId: currentStepId,
        state: nextState,
        specialist: (specialistResult || {}) as Record<string, unknown>,
        previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      });
      const validatedRerendered = deps.validateRenderedContractOrRecover({
        stepId: currentStepId,
        rendered: rerenderedRaw,
        state: nextState,
        previousSpecialist: ((state as any).last_specialist_result || {}) as Record<string, unknown>,
        telemetry: params.uiI18nTelemetry,
      });
      nextState = validatedRerendered.state;
      const rerendered = validatedRerendered.rendered;
      const rerenderViolation = validatedRerendered.violation;
      if (rerenderViolation) {
        return buildContractViolationPayload({
          state: nextState,
          stepId: currentStepId,
          activeSpecialist: String((nextState as any).active_specialist || ""),
          specialistSnapshot: rerendered.specialist,
          message: "Rendered output violates the UI contract.",
          reason: rerenderViolation,
          extraError: {
            contract_id: rerendered.contractId,
          },
        });
      }
      specialistResult = rerendered.specialist;
      renderedStatusForPolicy = rerendered.status;
      actionCodesOverride = rerendered.uiActionCodes;
      renderedActionsOverride = rerendered.uiActions;
      contractMetaOverride = {
        contractId: rerendered.contractId,
        contractVersion: rerendered.contractVersion,
        textKeys: rerendered.textKeys,
      };
      deps.applyUiPhaseByStep(nextState, currentStepId, rerendered.contractId);
      (nextState as any).last_specialist_result = specialistResult;
    }
    const currentStepForWordingChoice = String((nextState as any).current_step || "");
    const currentSpecialistForWordingChoice = String((nextState as any).active_specialist || "");
    const previousSpecialistForWordingChoice = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    const dreamRuntimeModeForWording = deps.getDreamRuntimeMode(nextState);
    const isCurrentTurnOfftopic =
      specialistResult?.is_offtopic === true ||
      String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
    const eligibleForWordingChoiceTurn = deps.isWordingChoiceEligibleContext(
      currentStepForWordingChoice,
      currentSpecialistForWordingChoice,
      (specialistResult || {}) as Record<string, unknown>,
      ((state as any).last_specialist_result || {}) as Record<string, unknown>,
      dreamRuntimeModeForWording
    );
    const userTextForWordingChoice = (() => {
      const submitted = String(params.submittedUserText || "").trim();
      if (submitted) return submitted;
      const raw = String(userMessage || "").trim();
      if (!raw) return "";
      if (raw.startsWith("ACTION_")) return "";
      if (raw.startsWith("__ROUTE__")) return "";
      return raw;
    })();
    if (
      params.wordingChoiceEnabled &&
      params.inputMode === "widget" &&
      eligibleForWordingChoiceTurn &&
      !isCurrentTurnOfftopic &&
      String((specialistResult as any)?.wording_choice_pending || "") !== "true"
    ) {
      const rebuilt = deps.buildWordingChoiceFromTurn({
        stepId: currentStepForWordingChoice,
        activeSpecialist: currentSpecialistForWordingChoice,
        previousSpecialist: previousSpecialistForWordingChoice,
        specialistResult,
        userTextRaw: userTextForWordingChoice,
        isOfftopic: false,
        dreamRuntimeModeRaw: dreamRuntimeModeForWording,
      });
      specialistResult = rebuilt.specialist;
    }
    (nextState as any).last_specialist_result = specialistResult;
    if (params.wordingChoiceEnabled && params.inputMode === "widget") {
      const pendingEligible = deps.isWordingChoiceEligibleContext(
        String((nextState as any).current_step || ""),
        String((nextState as any).active_specialist || ""),
        (specialistResult || {}) as Record<string, unknown>,
        previousSpecialistForWordingChoice,
        dreamRuntimeModeForWording
      );
      const pendingChoice = pendingEligible
        ? deps.buildWordingChoiceFromPendingSpecialist(
            specialistResult,
            String((nextState as any).active_specialist || ""),
            previousSpecialistForWordingChoice,
            String((nextState as any).current_step || ""),
            dreamRuntimeModeForWording
          )
        : null;
      if (pendingChoice) {
        wordingChoiceOverride = pendingChoice;
        requireWordingPick = true;
        actionCodesOverride = [];
        renderedActionsOverride = [];
      }
    }

    const canonicalDreamBuilderStatementsCount =
      Array.isArray((nextState as any).dream_builder_statements)
        ? ((nextState as any).dream_builder_statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
        : 0;
    specialistResult = deps.enforceDreamBuilderQuestionProgress(specialistResult, {
      currentStepId: String((nextState as any).current_step || ""),
      activeSpecialist: String((nextState as any).active_specialist || ""),
      canonicalStatementCount: canonicalDreamBuilderStatementsCount,
      wordingChoicePending: requireWordingPick || Boolean(wordingChoiceOverride?.enabled),
      state: nextState,
    });
    if (!requireWordingPick && !wordingChoiceOverride?.enabled) {
      const motivationApplied = deps.applyMotivationQuotesContractV11({
        enabled: params.motivationQuotesEnabled,
        stepId: String((nextState as any).current_step || ""),
        userMessage,
        renderedStatus: renderedStatusForPolicy,
        specialistResult: (specialistResult || {}) as Record<string, unknown>,
        previousSpecialist: previousSpecialistForWordingChoice,
        state: nextState,
        requireWordingPick,
      });
      specialistResult = motivationApplied.specialistResult;
      if (motivationApplied.suppressChoices) {
        actionCodesOverride = [];
        renderedActionsOverride = [];
      }
    }
    (nextState as any).last_specialist_result = specialistResult;

    const currentStepForContract = String((nextState as any).current_step ?? "");
    const specialistContractId = String((specialistResult as any)?.ui_contract_id || "").trim();
    if (currentStepForContract && specialistContractId) {
      deps.applyUiPhaseByStep(nextState, currentStepForContract, specialistContractId);
      if (!contractMetaOverride?.contractId) {
        contractMetaOverride = {
          contractId: specialistContractId,
          contractVersion: String((specialistResult as any)?.ui_contract_version || deps.uiContractVersion),
          textKeys: Array.isArray((specialistResult as any)?.ui_text_keys)
            ? (specialistResult as any)?.ui_text_keys
            : [],
        };
      }
    }

    const text = deps.buildTextForWidget({ specialist: specialistResult });
    const prompt = deps.pickPrompt(specialistResult);

    if (showSessionIntro === "true" && String((nextState as any).intro_shown_session) !== "true") {
      (nextState as any).intro_shown_session = "true";
    }

    const mergedFlags = {
      ...(params.responseUiFlags || {}),
      ...(requireWordingPick ? { require_wording_pick: true } : {}),
    };

    return deps.attachRegistryPayload(
      {
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(nextState.current_step),
        active_specialist: String((nextState as any).active_specialist || ""),
        text,
        prompt,
        specialist: specialistResult,
        state: nextState,
        debug: {
          decision: finalDecision,
          attempts,
          language: params.lang,
          meta_user_message_ignored: deps.looksLikeMetaInstruction(params.rawNormalized) && params.pristineAtEntry,
        },
      },
      specialistResult,
      mergedFlags,
      actionCodesOverride,
      renderedActionsOverride,
      wordingChoiceOverride,
      contractMetaOverride
    );
  }

  return {
    runPostSpecialistPipeline,
  };
}
