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

const AUTOSUGGEST_STEP_IDS = new Set<string>([
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
]);

type AutoSuggestPlan = {
  active: boolean;
  stepId: string;
  promptForCall: string;
  forceDreamSpecialist: boolean;
};

function normalizeSuggestIntentText(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isSuggestForMeIntent(raw: string): boolean {
  const text = normalizeSuggestIntentText(raw);
  if (!text) return false;
  if (text.startsWith("action_") || text.startsWith("__route__") || text.startsWith("choice:")) return false;

  const patterns = [
    /\bi\s*(?:do\s*not|don't)\s*know\b/i,
    /\bidk\b/i,
    /\b(?:give|do|make)\s+(?:me\s+)?(?:a\s+)?suggestion\b/i,
    /\btell\s+me\s+what\s+it\s+could\s+be\b/i,
    /\bchoose\s+for\s+me\b/i,
    /\byou\s+decide\b/i,
    /\bik\s+weet\s+het\s+niet\b/i,
    /\bgeen\s+idee\b/i,
    /\b(?:doe|geef|maak)\s+(?:mij\s+)?(?:een\s+)?suggestie\b/i,
    /\bvertel\s+(?:me|mij)\s+wat\s+het\s+kan\s+zijn\b/i,
    /\bkies\s+(?:maar\s+)?voor\s+mij\b/i,
    /\bjij\s+mag\s+(?:het\s+)?(?:bedenken|verzinnen|invullen)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function buildAutoSuggestPrompt(stepId: string): string {
  if (stepId === "dream") {
    return "Please propose one clear Dream sentence for this business based on the known context. Keep it concise and ready to confirm.";
  }
  if (stepId === "purpose") {
    return "Please propose one clear Purpose sentence for this business based on the known context. Keep it concise and ready to confirm.";
  }
  if (stepId === "bigwhy") {
    return "Please propose one concise Big Why sentence for this business based on the known context. Keep it meaningful and ready to confirm.";
  }
  if (stepId === "role") {
    return "Please propose one clear Role sentence for this business based on the known context. Keep it concise and ready to confirm.";
  }
  if (stepId === "entity") {
    return "Please propose one clear Entity sentence for this business based on the known context. Keep it concise and ready to confirm.";
  }
  if (stepId === "strategy") {
    return "Please draft a strategy for this business with at least 4 concise strategic focus points, one per line, based on the known context.";
  }
  if (stepId === "targetgroup") {
    return "Please propose one clear target group formulation for this business based on the known context. Keep it concise and ready to confirm.";
  }
  if (stepId === "productsservices") {
    return "Please draft products and services for this business with at least 3 concrete bullet items, based on the known context.";
  }
  if (stepId === "rulesofthegame") {
    return "Please draft rules of the game for this business with at least 3 distinct bullet rules, based on the known context.";
  }
  return "Please propose a concrete formulation for this step based on the known context.";
}

function planAutoSuggest(params: {
  stepId: string;
  userMessage: string;
  actionCodeRaw: string;
  step0Id: string;
  dreamStepId: string;
  dreamExplainerSpecialist: string;
  currentSpecialist: string;
  dreamRuntimeMode: string;
}): AutoSuggestPlan {
  const stepId = String(params.stepId || "").trim();
  if (!stepId || stepId === params.step0Id || stepId === "presentation") {
    return { active: false, stepId, promptForCall: "", forceDreamSpecialist: false };
  }
  if (!AUTOSUGGEST_STEP_IDS.has(stepId)) {
    return { active: false, stepId, promptForCall: "", forceDreamSpecialist: false };
  }
  if (String(params.actionCodeRaw || "").trim()) {
    return { active: false, stepId, promptForCall: "", forceDreamSpecialist: false };
  }
  if (!isSuggestForMeIntent(params.userMessage)) {
    return { active: false, stepId, promptForCall: "", forceDreamSpecialist: false };
  }
  const forceDreamSpecialist =
    stepId === params.dreamStepId &&
    (params.currentSpecialist === params.dreamExplainerSpecialist || params.dreamRuntimeMode !== "self");
  return {
    active: true,
    stepId,
    promptForCall: buildAutoSuggestPrompt(stepId),
    forceDreamSpecialist,
  };
}

function parseLooseItems(raw: string): string[] {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return lines[0].split(/\s*,\s*/).map((line) => String(line || "").trim()).filter(Boolean);
}

function productsServicesItemCount(specialistResult: Record<string, unknown>): number {
  const candidates = [
    String(specialistResult.productsservices || "").trim(),
    String(specialistResult.refined_formulation || "").trim(),
    String(specialistResult.message || "").trim(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const count = parseLooseItems(candidate).length;
    if (count > 0) return count;
  }
  return 0;
}

function rulesItemCount(specialistResult: Record<string, unknown>): number {
  if (Array.isArray(specialistResult.statements)) {
    const count = (specialistResult.statements as unknown[])
      .map((line) => String(line || "").trim())
      .filter(Boolean).length;
    if (count > 0) return count;
  }
  const candidates = [
    String(specialistResult.rulesofthegame || "").trim(),
    String(specialistResult.refined_formulation || "").trim(),
    String(specialistResult.message || "").trim(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const count = parseLooseItems(candidate).length;
    if (count > 0) return count;
  }
  return 0;
}

function stepLabelForAutoSuggest(stepId: string, state: CanvasState): string {
  const uiStrings = asRecord((state as Record<string, unknown>).ui_strings);
  const keyByStep: Record<string, string> = {
    dream: "offtopic.step.dream",
    purpose: "offtopic.step.purpose",
    bigwhy: "offtopic.step.bigwhy",
    role: "offtopic.step.role",
    entity: "offtopic.step.entity",
    strategy: "offtopic.step.strategy",
    targetgroup: "offtopic.step.targetgroup",
    productsservices: "offtopic.step.productsservices",
    rulesofthegame: "offtopic.step.rulesofthegame",
  };
  const localized = String(uiStrings[keyByStep[stepId] || ""] || "").trim();
  if (localized) return localized;
  const fallbackByStep: Record<string, string> = {
    dream: "dream",
    purpose: "purpose",
    bigwhy: "big why",
    role: "role",
    entity: "entity",
    strategy: "strategy",
    targetgroup: "target group",
    productsservices: "products and services",
    rulesofthegame: "rules of the game",
  };
  return fallbackByStep[stepId] || stepId;
}

function withAutoSuggestPrefixedMessage(params: {
  specialist: Record<string, unknown>;
  stepId: string;
  state: CanvasState;
}): Record<string, unknown> {
  const baseMessage = String(params.specialist.message || "").trim();
  const stepLabel = stepLabelForAutoSuggest(params.stepId, params.state);
  const prefix = `Based on your input I suggest the following ${stepLabel}:`;
  return {
    ...params.specialist,
    message: baseMessage ? `${prefix}\n\n${baseMessage}` : prefix,
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
    const currentStepId = String((state as Record<string, unknown>).current_step || "").trim();
    const currentSpecialistAtTurnStart = String((state as Record<string, unknown>).active_specialist || "").trim();
    const autoSuggestPlan = planAutoSuggest({
      stepId: currentStepId,
      userMessage,
      actionCodeRaw: params.actionCodeRaw,
      step0Id: deps.step0Id,
      dreamStepId: deps.dreamStepId,
      dreamExplainerSpecialist: deps.dreamExplainerSpecialist,
      currentSpecialist: currentSpecialistAtTurnStart,
      dreamRuntimeMode: deps.getDreamRuntimeMode(state),
    });
    if (autoSuggestPlan.active) {
      userMessage = autoSuggestPlan.promptForCall;
    }
    let decision1 = params.decideOrchestration(state, userMessage);
    if (autoSuggestPlan.forceDreamSpecialist) {
      decision1 = {
        ...decision1,
        current_step: deps.dreamStepId as any,
        specialist_to_call: deps.dreamSpecialist as any,
        show_step_intro: "false",
        show_session_intro: "false",
      } as typeof decision1;
    }
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

    if (autoSuggestPlan.active) {
      const shouldRepairMinimum = (): boolean => {
        if (autoSuggestPlan.stepId === deps.strategyStepId) {
          return deps.strategyStatementsForConsolidateGuard(specialistResult, state).length < 4;
        }
        if (autoSuggestPlan.stepId === "productsservices") {
          return productsServicesItemCount(specialistResult) < 3;
        }
        if (autoSuggestPlan.stepId === "rulesofthegame") {
          return rulesItemCount(specialistResult) < 3;
        }
        return false;
      };

      if (shouldRepairMinimum()) {
        const repairPromptByStep: Record<string, string> = {
          strategy:
            "Please provide a finalized strategy draft with at least 4 distinct strategic focus points, one per line, based on known context.",
          productsservices:
            "Please provide a finalized products and services draft with at least 3 concrete bullet items based on known context.",
          rulesofthegame:
            "Please provide a finalized rules of the game draft with at least 3 distinct and concrete rules in bullet form based on known context.",
        };
        const repairPrompt = String(repairPromptByStep[autoSuggestPlan.stepId] || "").trim();
        if (repairPrompt) {
          const repairCall = await deps.callSpecialistStrictSafe(
            { model: params.model, state, decision: decision1, userMessage: repairPrompt },
            deps.buildRoutingContext(repairPrompt),
            state
          );
          if (repairCall.ok) {
            params.rememberLlmCall(repairCall.value);
            attempts = Math.max(attempts, repairCall.value.attempts);
            specialistResult = asRecord(repairCall.value.specialistResult);
          }
        }
      }
    }

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

    state = await params.ensureUiStrings(state, userMessage);

    specialistResult = asRecord(
      deps.normalizeLocalizedConceptTerms(specialistResult, state) || specialistResult
    );
    specialistResult = deps.normalizeEntitySpecialistResult(
      String(decision1.current_step || ""),
      specialistResult,
      state
    );
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

    if (autoSuggestPlan.active) {
      const isOfftopicAfterSuggest =
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true";
      if (!isOfftopicAfterSuggest) {
        specialistResult = withAutoSuggestPrefixedMessage({
          specialist: specialistResult,
          stepId: autoSuggestPlan.stepId,
          state: nextState,
        });
        nextState = {
          ...nextState,
          last_specialist_result: specialistResult,
        };
      }
    }

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
