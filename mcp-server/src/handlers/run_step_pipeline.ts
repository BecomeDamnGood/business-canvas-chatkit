import type { CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import {
  buildUiContractId,
  parseUiContractId,
  validateUiContractIdForStep,
} from "../core/ui_contract_id.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import {
  type RunStepContext,
  type RunStepPostSpecialistPipelineRequest,
  toRunPostSpecialistPipelineRequest,
} from "./run_step_context.js";
import type { RunStepPipelinePorts } from "./run_step_ports.js";
import type { TurnResponseRenderFailureContext } from "./run_step_turn_response_engine.js";
import type { UiContractMeta, WordingChoiceUiPayload } from "./run_step_ui_payload.js";
import {
  asRecord,
  asStateRecord,
  isTrueFlag,
  readStringArray,
} from "./run_step_type_guards.js";
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

  function finalizePipelinePayload(payload: TPayload): TPayload {
    return deps.turnResponseEngine.finalize(payload);
  }

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
          category: "contract",
          severity: "fatal",
          retryable: false,
          retry_action: "restart_session",
          message: params.message,
          reason: params.reason,
          step: params.stepId,
          ...(params.extraError || {}),
        },
      },
      params.specialistSnapshot
    );
  }

  function buildFinalizedContractViolationPayload(params: {
    state: CanvasState;
    stepId: string;
    activeSpecialist: string;
    specialistSnapshot: Record<string, unknown>;
    reason: string;
    message: string;
    extraError?: Record<string, unknown>;
  }): TPayload {
    return finalizePipelinePayload(buildContractViolationPayload(params));
  }

  function buildRenderedContractViolationPayload(
    params: TurnResponseRenderFailureContext
  ): TPayload {
    return buildContractViolationPayload({
      state: params.state,
      stepId: params.stepId,
      activeSpecialist: params.activeSpecialist,
      specialistSnapshot: params.rendered.specialist,
      message: "Rendered output violates the UI contract.",
      reason: params.reason,
      extraError: {
        contract_id: params.rendered.contractId,
      },
    });
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
    if (!call1.ok) return finalizePipelinePayload(call1.payload);
    params.rememberLlmCall(call1.value);

    let attempts = call1.value.attempts;
    let specialistResult = asRecord(call1.value.specialistResult);
    const stateRecord = asStateRecord(state);

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      isTrueFlag(specialistResult.scoring_phase) &&
      readStringArray(specialistResult.statements).length === 0
    ) {
      const prevStatements = (() => {
        const canonical = readStringArray(stateRecord.dream_builder_statements);
        if (canonical.length > 0) return canonical;
        const previousSpecialist = asRecord(stateRecord.last_specialist_result);
        return readStringArray(previousSpecialist.statements);
      })();
      if (prevStatements.length > 0) {
        specialistResult = { ...specialistResult, statements: prevStatements };
      }
    }

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      isTrueFlag(specialistResult.scoring_phase)
    ) {
      const stmtCount = readStringArray(specialistResult.statements).length;
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
      const previousCanonicalCount = readStringArray(stateRecord.dream_builder_statements).length;
      const currentStatementCount = readStringArray(specialistResult.statements).length;
      const effectiveStatementCount = Math.max(previousCanonicalCount, currentStatementCount);
      const scoringPhase = isTrueFlag(specialistResult.scoring_phase);
      const hasClusters = Array.isArray(specialistResult.clusters) && specialistResult.clusters.length > 0;
      void modeAtTurnStart;
      void effectiveStatementCount;
      void scoringPhase;
      void hasClusters;
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
          const repaired = asRecord(callRepair.value.specialistResult);
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
        if (!repairCall.ok) return finalizePipelinePayload(repairCall.payload);
        params.rememberLlmCall(repairCall.value);
        attempts = Math.max(attempts, repairCall.value.attempts);
        specialistResult = asRecord(repairCall.value.specialistResult);
      }

      const repairedOfftopic =
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
      const repairedCount = deps.strategyStatementsForConsolidateGuard(specialistResult, state).length;
      void repairedOfftopic;
      void repairedCount;
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
        if (!callShorten.ok) return finalizePipelinePayload(callShorten.payload);
        params.rememberLlmCall(callShorten.value);
        attempts = Math.max(attempts, callShorten.value.attempts);
        specialistResult = asRecord(callShorten.value.specialistResult);
        const shortened = deps.pickBigWhyCandidate(specialistResult);
        if (!shortened || deps.countWords(shortened) > deps.bigwhyMaxWords) {
          specialistResult = deps.buildBigWhyTooLongFeedback(state);
        }
      }
    }

    specialistResult = deps.normalizeEntitySpecialistResult(String(decision1.current_step || ""), specialistResult);
    specialistResult = deps.applyCentralMetaTopicRouter({
      stepId: String(decision1.current_step || ""),
      specialistResult: asRecord(specialistResult),
      previousSpecialist: asRecord(stateRecord.last_specialist_result),
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
      previousSpecialist: asRecord(asStateRecord(state).last_specialist_result),
      state,
    });
    if (currentStepIdForOfftopic === deps.step0Id) {
      const sourceActionStep0 = String(specialistResult.action || "").trim().toUpperCase();
      specialistResult = deps.normalizeStep0AskDisplayContract(
        deps.step0Id,
        specialistResult,
        state,
        userMessage
      );
      const normalizedActionStep0 = String(specialistResult.action || "").trim().toUpperCase();
      if (
        sourceActionStep0 === "ESCAPE" &&
        normalizedActionStep0 === "ASK" &&
        deps.hasValidStep0Final(String(asStateRecord(state).step_0_final || ""))
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
    let renderedActionsOverride: RenderedAction[] | null = null;
    let wordingChoiceOverride: WordingChoiceUiPayload | null = null;
    let contractMetaOverride: UiContractMeta | null = null;
    const initialRender = deps.turnResponseEngine.renderValidateRecover({
      state: nextState,
      specialist: asRecord(specialistResult),
      previousSpecialist: asRecord(asStateRecord(state).last_specialist_result),
      telemetry: params.uiI18nTelemetry,
      onContractViolation: buildRenderedContractViolationPayload,
    });
    if (!initialRender.ok) return initialRender.payload;
    nextState = initialRender.value.state;
    specialistResult = initialRender.value.specialist;
    let renderedStatusForPolicy = initialRender.value.renderedStatus;
    actionCodesOverride = initialRender.value.actionCodes;
    renderedActionsOverride = initialRender.value.renderedActions;
    contractMetaOverride = initialRender.value.contractMeta;
    let requireWordingPick = false;

    const isDreamExplainerOfftopicTurn =
      String(asStateRecord(nextState).current_step || "") === deps.dreamStepId &&
      String(asStateRecord(nextState).active_specialist || "") === deps.dreamExplainerSpecialist &&
      (specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true");
    if (isDreamExplainerOfftopicTurn) {
      const previousSpecialist = asRecord(asStateRecord(state).last_specialist_result);
      specialistResult = deps.normalizeNonStep0OfftopicSpecialist({
        stepId: String(asStateRecord(nextState).current_step || ""),
        activeSpecialist: String(asStateRecord(nextState).active_specialist || ""),
        userMessage,
        specialistResult,
        previousSpecialist,
        state: nextState,
      });
      const currentStepId = String(asStateRecord(nextState).current_step || "");
      const offTopicContractId = deps.buildContractId(
        currentStepId,
        renderedStatusForPolicy as TurnOutputStatus,
        deps.dreamExplainerSwitchSelfMenuId
      );
      deps.applyUiPhaseByStep(nextState, currentStepId, offTopicContractId);
      const rerender = deps.turnResponseEngine.renderValidateRecover({
        state: nextState,
        specialist: asRecord(specialistResult),
        previousSpecialist: asRecord(asStateRecord(state).last_specialist_result),
        telemetry: params.uiI18nTelemetry,
        onContractViolation: buildRenderedContractViolationPayload,
      });
      if (!rerender.ok) return rerender.payload;
      nextState = rerender.value.state;
      specialistResult = rerender.value.specialist;
      renderedStatusForPolicy = rerender.value.renderedStatus;
      actionCodesOverride = rerender.value.actionCodes;
      renderedActionsOverride = rerender.value.renderedActions;
      contractMetaOverride = rerender.value.contractMeta;
    }
    const currentStepForWordingChoice = String(asStateRecord(nextState).current_step || "");
    const currentSpecialistForWordingChoice = String(asStateRecord(nextState).active_specialist || "");
    const previousSpecialistForWordingChoice = asRecord(asStateRecord(state).last_specialist_result);
    const dreamRuntimeModeForWording = deps.getDreamRuntimeMode(nextState);
    const isCurrentTurnOfftopic =
      specialistResult?.is_offtopic === true ||
      String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
    const eligibleForWordingChoiceTurn = deps.isWordingChoiceEligibleContext(
      currentStepForWordingChoice,
      currentSpecialistForWordingChoice,
      asRecord(specialistResult),
      asRecord(asStateRecord(state).last_specialist_result),
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
      !isTrueFlag(specialistResult.wording_choice_pending)
    ) {
      const rebuilt = deps.buildWordingChoiceFromTurn({
        stepId: currentStepForWordingChoice,
        state: nextState,
        activeSpecialist: currentSpecialistForWordingChoice,
        previousSpecialist: previousSpecialistForWordingChoice,
        specialistResult,
        userTextRaw: userTextForWordingChoice,
        isOfftopic: false,
        dreamRuntimeModeRaw: dreamRuntimeModeForWording,
      });
      specialistResult = rebuilt.specialist;
    }
    asStateRecord(nextState).last_specialist_result = specialistResult;
    if (params.wordingChoiceEnabled && params.inputMode === "widget") {
      const pendingEligible = deps.isWordingChoiceEligibleContext(
        String(asStateRecord(nextState).current_step || ""),
        String(asStateRecord(nextState).active_specialist || ""),
        asRecord(specialistResult),
        previousSpecialistForWordingChoice,
        dreamRuntimeModeForWording
      );
      const pendingChoice = pendingEligible
        ? deps.buildWordingChoiceFromPendingSpecialist(
            specialistResult,
            nextState,
            String(asStateRecord(nextState).active_specialist || ""),
            previousSpecialistForWordingChoice,
            String(asStateRecord(nextState).current_step || ""),
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
      readStringArray(asStateRecord(nextState).dream_builder_statements).length;
    specialistResult = deps.enforceDreamBuilderQuestionProgress(specialistResult, {
      currentStepId: String(asStateRecord(nextState).current_step || ""),
      activeSpecialist: String(asStateRecord(nextState).active_specialist || ""),
      canonicalStatementCount: canonicalDreamBuilderStatementsCount,
      wordingChoicePending: requireWordingPick || Boolean(wordingChoiceOverride?.enabled),
      state: nextState,
    });
    if (!requireWordingPick && !wordingChoiceOverride?.enabled) {
      const motivationApplied = deps.applyMotivationQuotesContractV11({
        enabled: params.motivationQuotesEnabled,
        stepId: String(asStateRecord(nextState).current_step || ""),
        userMessage,
        renderedStatus: renderedStatusForPolicy,
        specialistResult: asRecord(specialistResult),
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
    asStateRecord(nextState).last_specialist_result = specialistResult;

    const currentStepForContract = String(asStateRecord(nextState).current_step ?? "");
    const specialistContractIdRaw = specialistResult.ui_contract_id;
    const specialistContractIdParsed = parseUiContractId(specialistContractIdRaw);
    const specialistContractId =
      specialistContractIdParsed &&
      validateUiContractIdForStep(specialistContractIdRaw, currentStepForContract)
        ? buildUiContractId(
            specialistContractIdParsed.stepId,
            specialistContractIdParsed.status,
            specialistContractIdParsed.menuId
          )
        : String(specialistContractIdRaw || "").trim();
    if (currentStepForContract && specialistContractId) {
      deps.applyUiPhaseByStep(nextState, currentStepForContract, specialistContractId);
      if (!contractMetaOverride?.contractId) {
        contractMetaOverride = {
          contractId: specialistContractId,
          contractVersion: String(specialistResult.ui_contract_version || deps.uiContractVersion),
          textKeys: readStringArray(specialistResult.ui_text_keys),
        };
      }
    }

    if (showSessionIntro === "true" && String(asStateRecord(nextState).intro_shown_session) !== "true") {
      asStateRecord(nextState).intro_shown_session = "true";
    }

    const mergedFlags = {
      ...(params.responseUiFlags || {}),
      ...(requireWordingPick ? { require_wording_pick: true } : {}),
    };

    return deps.turnResponseEngine.attachAndFinalize({
      state: nextState,
      specialist: specialistResult,
      responseUiFlags: mergedFlags,
      actionCodesOverride,
      renderedActionsOverride,
      wordingChoiceOverride,
      contractMetaOverride,
      debug: {
        decision: finalDecision,
        attempts,
        language: params.lang,
        meta_user_message_ignored: deps.looksLikeMetaInstruction(params.rawNormalized) && params.pristineAtEntry,
      },
    });
  }

  return {
    runPostSpecialistPipeline,
  };
}
