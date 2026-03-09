import type { OrchestratorOutput } from "../core/orchestrator.js";
import { getFinalFieldForStepId, type CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import {
  buildUiContractId,
  parseUiContractId,
  validateUiContractIdForStep,
} from "../core/ui_contract_id.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import { STEP_0_TURN_INTENT_SPECIALIST } from "../steps/step_0_turn_intent.js";
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
import { normalizePendingPickerSpecialistContract } from "./run_step_wording_picker_contract.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
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

const ACCEPTED_OUTPUT_SINGLE_VALUE_STEP_IDS = new Set<string>([
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "targetgroup",
]);

function isNonContributingWordingIntent(intentRaw: string): boolean {
  const intent = String(intentRaw || "").trim();
  return (
    intent === "feedback_on_suggestion" ||
    intent === "reject_suggestion_explicit"
  );
}

export function shouldForcePendingWordingChoiceFromIntent(params: {
  submittedTextIntent: string;
  submittedTextAnchor: string;
}): boolean {
  const intent = String(params.submittedTextIntent || "").trim();
  const anchor = String(params.submittedTextAnchor || "").trim();
  if (anchor !== "suggestion") return false;
  return intent === "feedback_on_suggestion" || intent === "reject_suggestion_explicit";
}

export function resolveProvisionalSourceForTurn(params: {
  actionCodeRaw: string;
  submittedTextIntent: string;
}): "action_route" | "user_input" | "system_generated" {
  const actionCodeRaw = String(params.actionCodeRaw || "").trim();
  if (actionCodeRaw) return "action_route";
  if (isNonContributingWordingIntent(params.submittedTextIntent)) return "system_generated";
  return "user_input";
}

export function resolveWordingChoiceSeedUserText(params: {
  submittedTextIntent: string;
  submittedTextAnchor: string;
  submittedUserText: string;
  userMessage: string;
  previousSpecialist: Record<string, unknown>;
}): string {
  const submittedIntent = String(params.submittedTextIntent || "").trim();
  const submittedAnchor = String(params.submittedTextAnchor || "").trim();
  const submittedCanSeedWordingChoice =
    submittedIntent === "" ||
    submittedIntent === "content_input" ||
    (
      (submittedIntent === "feedback_on_suggestion" || submittedIntent === "reject_suggestion_explicit") &&
      submittedAnchor === "suggestion"
    );
  const seedFromSuggestion =
    (
      submittedIntent === "feedback_on_suggestion" ||
      submittedIntent === "reject_suggestion_explicit"
    ) &&
    submittedAnchor === "suggestion";
  if (seedFromSuggestion) {
    return String(
      params.previousSpecialist.wording_choice_agent_current ||
      params.previousSpecialist.refined_formulation ||
      ""
    ).trim();
  }
  const submitted = String(params.submittedUserText || "").trim();
  if (submitted && submittedCanSeedWordingChoice) return submitted;
  if (submitted && !submittedCanSeedWordingChoice) return "";
  const raw = String(params.userMessage || "").trim();
  if (!raw) return "";
  if (!submittedCanSeedWordingChoice) return "";
  if (raw.startsWith("ACTION_")) return "";
  if (raw.startsWith("__ROUTE__")) return "";
  return raw;
}

export function pickCurrentStepValueForFeedback(state: CanvasState, stepId: string): string {
  const provisional = String(((state as Record<string, unknown>).provisional_by_step as Record<string, unknown> | undefined)?.[stepId] || "").trim();
  if (provisional) return provisional;
  if (stepId === "dream") return String((state as Record<string, unknown>).dream_final || "").trim();
  return "";
}

function pickCurrentAcceptedValueForStep(state: CanvasState, stepId: string): string {
  const provisional = String(
    ((state as Record<string, unknown>).provisional_by_step as Record<string, unknown> | undefined)?.[stepId] || ""
  ).trim();
  if (provisional) return provisional;
  const finalField = getFinalFieldForStepId(stepId);
  return finalField ? String((state as Record<string, unknown>)[finalField] || "").trim() : "";
}

function isAcceptedOutputSingleValueStep(stepId: string): boolean {
  return ACCEPTED_OUTPUT_SINGLE_VALUE_STEP_IDS.has(String(stepId || "").trim());
}

export async function shouldTreatTurnAsDreamCurrentValueFeedback(params: {
  state: CanvasState;
  stepId: string;
  userMessage: string;
  model: string;
  language?: string;
  classifyAcceptedOutputUserTurn: (params: {
    model: string;
    stepId: string;
    userMessage: string;
    currentAcceptedValue?: string;
    pendingSuggestion?: string;
    pendingUserVariant?: string;
    language?: string;
  }) => Promise<AcceptedOutputUserTurnClassification>;
  actionCodeRaw?: string;
  submittedTextIntent?: string;
}): Promise<boolean> {
  const stepId = String(params.stepId || "").trim();
  const userMessage = String(params.userMessage || "").trim();
  const actionCodeRaw = String(params.actionCodeRaw || "").trim();
  const submittedTextIntent = String(params.submittedTextIntent || "").trim();
  if (stepId !== "dream" || !userMessage || actionCodeRaw) return false;
  if (submittedTextIntent) return false;
  const currentValue = pickCurrentStepValueForFeedback(params.state, stepId);
  if (!currentValue) return false;
  const classification = await params.classifyAcceptedOutputUserTurn({
    model: params.model,
    stepId,
    userMessage,
    currentAcceptedValue: currentValue,
    language: params.language,
  });
  return (
    classification.turn_kind === "feedback_on_existing_content" ||
    classification.turn_kind === "rejection_without_replacement"
  );
}

function stateWithDreamCurrentValueFeedbackContext(
  state: CanvasState,
  currentValue: string,
  feedbackText: string
): CanvasState {
  const last = ((state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>;
  return {
    ...state,
    last_specialist_result: {
      ...last,
      wording_choice_pending: "true",
      wording_choice_mode: "text",
      wording_choice_target_field: "dream",
      wording_choice_user_raw: currentValue,
      wording_choice_user_normalized: currentValue,
      wording_choice_agent_current: currentValue,
      wording_choice_presentation: "canonical",
      pending_suggestion_intent: "feedback_on_current_value",
      pending_suggestion_anchor: "current_value",
      pending_suggestion_seed_source: "current_value",
      pending_suggestion_feedback_text: feedbackText,
      pending_suggestion_presentation_mode: "canonical",
      refined_formulation: currentValue,
      dream: currentValue,
    },
  };
}

function compactFeedbackReasonFromMessage(messageRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!message) return "";
  const sentences = message
    .split(/(?<=[.!?])\s+/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (sentence.length < 18) continue;
    return sentence;
  }
  return message;
}

type AutoSuggestPlan = {
  eligible: boolean;
  stepId: string;
  forceDreamSpecialist: boolean;
};

function planAutoSuggest(params: {
  stepId: string;
  actionCodeRaw: string;
  step0Id: string;
  dreamStepId: string;
  dreamExplainerSpecialist: string;
  currentSpecialist: string;
  dreamRuntimeMode: string;
}): AutoSuggestPlan {
  const stepId = String(params.stepId || "").trim();
  if (!stepId || stepId === params.step0Id || stepId === "presentation") {
    return { eligible: false, stepId, forceDreamSpecialist: false };
  }
  if (!AUTOSUGGEST_STEP_IDS.has(stepId)) {
    return { eligible: false, stepId, forceDreamSpecialist: false };
  }
  if (String(params.actionCodeRaw || "").trim()) {
    return { eligible: false, stepId, forceDreamSpecialist: false };
  }
  const forceDreamSpecialist =
    stepId === params.dreamStepId &&
    (params.currentSpecialist === params.dreamExplainerSpecialist || params.dreamRuntimeMode !== "self");
  return {
    eligible: true,
    stepId,
    forceDreamSpecialist,
  };
}

function isAutoSuggestIntentFromSpecialist(specialistResult: Record<string, unknown>): boolean {
  const userIntent = String(specialistResult.user_intent || "").trim().toUpperCase();
  return userIntent === "INSPIRATION_REQUEST";
}

function clearPendingWordingChoiceFields(specialistResult: Record<string, unknown>): Record<string, unknown> {
  return {
    ...specialistResult,
    wording_choice_pending: "false",
    wording_choice_selected: "",
    wording_choice_user_raw: "",
    wording_choice_user_normalized: "",
    wording_choice_user_items: [],
    wording_choice_suggestion_items: [],
    wording_choice_base_items: [],
    wording_choice_list_semantics: "delta",
    wording_choice_agent_current: "",
    wording_choice_mode: "",
    wording_choice_target_field: "",
    wording_choice_presentation: "",
    wording_choice_variant: "",
    wording_choice_user_label: "",
    wording_choice_suggestion_label: "",
    wording_choice_user_variant_semantics: "",
    wording_choice_user_variant_stepworthy: "",
    pending_suggestion_intent: "",
    pending_suggestion_anchor: "",
    pending_suggestion_seed_source: "",
    pending_suggestion_feedback_text: "",
    pending_suggestion_presentation_mode: "",
  };
}

export function isWordingChoiceIntentEligible(specialistResult: Record<string, unknown>): boolean {
  const metaTopic = String(specialistResult.meta_topic || "").trim().toUpperCase();
  if (metaTopic && metaTopic !== "NONE") return false;
  const userIntent = String(specialistResult.user_intent || "").trim().toUpperCase();
  if (!userIntent) return true;
  return userIntent === "STEP_INPUT";
}

function autoSuggestPromptKeyForStep(stepId: string): string {
  const keyByStep: Record<string, string> = {
    dream: "autosuggest.prompt.dream",
    purpose: "autosuggest.prompt.purpose",
    bigwhy: "autosuggest.prompt.bigwhy",
    role: "autosuggest.prompt.role",
    entity: "autosuggest.prompt.entity",
    strategy: "autosuggest.prompt.strategy",
    targetgroup: "autosuggest.prompt.targetgroup",
    productsservices: "autosuggest.prompt.productsservices",
    rulesofthegame: "autosuggest.prompt.rulesofthegame",
  };
  return keyByStep[stepId] || "autosuggest.prompt.generic";
}

function autoSuggestPromptFromState(stepId: string, state: CanvasState): string {
  const uiStrings = asRecord((state as Record<string, unknown>).ui_strings);
  const stepKey = autoSuggestPromptKeyForStep(stepId);
  const fromStep = String(uiStrings[stepKey] || "").trim();
  if (fromStep) return fromStep;
  return String(uiStrings["autosuggest.prompt.generic"] || "").trim();
}

function autoSuggestRepairPromptKeyForStep(stepId: string): string {
  const keyByStep: Record<string, string> = {
    strategy: "autosuggest.repair.prompt.strategy",
    productsservices: "autosuggest.repair.prompt.productsservices",
    rulesofthegame: "autosuggest.repair.prompt.rulesofthegame",
  };
  return keyByStep[stepId] || "";
}

function autoSuggestRepairPromptFromState(stepId: string, state: CanvasState): string {
  const key = autoSuggestRepairPromptKeyForStep(stepId);
  if (!key) return "";
  const uiStrings = asRecord((state as Record<string, unknown>).ui_strings);
  return String(uiStrings[key] || "").trim();
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
  return stepId;
}

function withAutoSuggestPrefixedMessage(params: {
  specialist: Record<string, unknown>;
  stepId: string;
  state: CanvasState;
}): Record<string, unknown> {
  const baseMessage = String(params.specialist.message || "").trim();
  const uiStrings = asRecord((params.state as Record<string, unknown>).ui_strings);
  const template = String(uiStrings["autosuggest.prefix.template"] || "").trim();
  if (!template) return params.specialist;
  const stepLabel = stepLabelForAutoSuggest(params.stepId, params.state);
  const prefix = template.includes("{0}")
    ? template.replace(/\{0\}/g, stepLabel).trim()
    : `${template} ${stepLabel}`.trim();
  if (!prefix) return params.specialist;
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
    let submittedTextIntent = String(params.submittedTextIntent || "").trim();
    let submittedTextAnchor = String(params.submittedTextAnchor || "").trim();
    let submittedUserText = String(params.submittedUserText || "").trim();
    const currentStepId = String((state as Record<string, unknown>).current_step || "").trim();
    const currentSpecialistAtTurnStart = String((state as Record<string, unknown>).active_specialist || "").trim();
    const autoSuggestPlan = planAutoSuggest({
      stepId: currentStepId,
      actionCodeRaw: params.actionCodeRaw,
      step0Id: deps.step0Id,
      dreamStepId: deps.dreamStepId,
      dreamExplainerSpecialist: deps.dreamExplainerSpecialist,
      currentSpecialist: currentSpecialistAtTurnStart,
      dreamRuntimeMode: deps.getDreamRuntimeMode(state),
    });
    const currentDreamValueForFeedback = pickCurrentStepValueForFeedback(state, deps.dreamStepId);
    const dreamCurrentValueFeedback = await shouldTreatTurnAsDreamCurrentValueFeedback({
      state,
      stepId: currentStepId,
      userMessage,
      model: params.model,
      language: params.lang,
      classifyAcceptedOutputUserTurn: deps.classifyAcceptedOutputUserTurn,
      actionCodeRaw: params.actionCodeRaw,
      submittedTextIntent,
    });
    if (dreamCurrentValueFeedback) {
      submittedTextIntent = "feedback_on_current_value";
      submittedTextAnchor = "current_value";
      submittedUserText = userMessage;
    }
    const stateForSpecialist = dreamCurrentValueFeedback
      ? stateWithDreamCurrentValueFeedbackContext(state, currentDreamValueForFeedback, userMessage)
      : state;
    let decision1 = params.decideOrchestration(stateForSpecialist, userMessage);
    const showSessionIntro = String(decision1.show_session_intro || "");

    const call1 = await deps.callSpecialistStrictSafe(
      { model: params.model, state: stateForSpecialist, decision: decision1, userMessage },
      deps.buildRoutingContext(userMessage),
      stateForSpecialist
    );
    if (!call1.ok) return finalizePipelinePayload(call1.payload);
    params.rememberLlmCall(call1.value);

    let attempts = call1.value.attempts;
    let specialistResult = asRecord(call1.value.specialistResult);
    const stateRecord = asStateRecord(stateForSpecialist);

    let autoSuggestApplied = false;
    const shouldRunAutoSuggest =
      autoSuggestPlan.eligible &&
      isAutoSuggestIntentFromSpecialist(specialistResult) &&
      !(
        specialistResult?.is_offtopic === true ||
        String(specialistResult?.is_offtopic || "").trim().toLowerCase() === "true"
      );

    if (shouldRunAutoSuggest) {
      state = await params.ensureUiStrings(state, userMessage);
      const autoSuggestPrompt = autoSuggestPromptFromState(autoSuggestPlan.stepId, state);
      if (autoSuggestPrompt) {
        const autoSuggestDecision = autoSuggestPlan.forceDreamSpecialist
          ? {
              ...decision1,
              current_step: deps.dreamStepId as any,
              specialist_to_call: deps.dreamSpecialist as any,
              show_step_intro: "false",
              show_session_intro: "false",
            } as typeof decision1
          : decision1;
        const autoSuggestCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: autoSuggestDecision, userMessage: autoSuggestPrompt },
          deps.buildRoutingContext(autoSuggestPrompt),
          state
        );
        if (autoSuggestCall.ok) {
          params.rememberLlmCall(autoSuggestCall.value);
          attempts = Math.max(attempts, autoSuggestCall.value.attempts);
          specialistResult = asRecord(autoSuggestCall.value.specialistResult);
          decision1 = autoSuggestDecision;
          autoSuggestApplied = true;
        }
      }
    }

    if (autoSuggestApplied) {
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
        const repairPrompt = autoSuggestRepairPromptFromState(autoSuggestPlan.stepId, state);
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
      const policyRequiresRepair =
        String((specialistResult as Record<string, unknown>).__dream_policy_requires_repair || "").trim() === "true";
      const policyRepairSeed = String((specialistResult as Record<string, unknown>).__dream_policy_repair_seed || "").trim();
      if (!isOfftopic && !isMetaFallback && policyRequiresRepair && policyRepairSeed) {
        const repairInput = `${deps.dreamForceRefineRoutePrefix}\n${policyRepairSeed}`;
        const callRepair = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (callRepair.ok) {
          params.rememberLlmCall(callRepair.value);
          attempts = Math.max(attempts, callRepair.value.attempts);
          specialistResult = asRecord(callRepair.value.specialistResult);
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
      userMessage,
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
      let step0TurnIntent: "confirm_start" | "change_name" | "other" = "other";
      const currentStep0Final = String(asStateRecord(state).step_0_final || "").trim();
      if (
        deps.hasValidStep0Final(currentStep0Final) &&
        (sourceActionStep0 === "ASK" || sourceActionStep0 === "ESCAPE") &&
        String(userMessage || "").trim() !== ""
      ) {
        const step0IntentDecision = {
          specialist_to_call: STEP_0_TURN_INTENT_SPECIALIST,
          specialist_input: userMessage,
          current_step: deps.step0Id,
          step0_candidate: String((specialistResult as Record<string, unknown>).step_0 || ""),
          step0_candidate_business_name: String((specialistResult as Record<string, unknown>).business_name || ""),
          intro_shown_for_step: deps.step0Id,
          intro_shown_session:
            String(asStateRecord(state).intro_shown_session || "").trim().toLowerCase() === "true"
              ? "true"
              : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;
        const step0IntentCall = await deps.callSpecialistStrictSafe(
          {
            model: params.model,
            state,
            decision: step0IntentDecision,
            userMessage,
          },
          deps.buildRoutingContext(userMessage),
          state
        );
        if (step0IntentCall.ok) {
          params.rememberLlmCall(step0IntentCall.value);
          const intentRaw = String(asRecord(step0IntentCall.value.specialistResult).intent || "").trim();
          if (intentRaw === "confirm_start" || intentRaw === "change_name" || intentRaw === "other") {
            step0TurnIntent = intentRaw;
          }
        }
      }
      specialistResult = deps.normalizeStep0AskDisplayContract(
        deps.step0Id,
        specialistResult,
        state,
        userMessage,
        step0TurnIntent
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
    if (
      currentStepIdForOfftopic === deps.dreamStepId &&
      (
        submittedTextIntent === "feedback_on_current_value" ||
        Array.isArray((specialistResult as Record<string, unknown>).__dream_policy_violation_codes)
      ) &&
      !String((specialistResult as Record<string, unknown>).feedback_reason_text || "").trim()
    ) {
      const fallbackReason = compactFeedbackReasonFromMessage(String(specialistResult.message || ""));
      if (fallbackReason) {
        specialistResult = {
          ...specialistResult,
          feedback_reason_text: fallbackReason,
        };
      }
    }

    const provisionalSourceForMutation = resolveProvisionalSourceForTurn({
      actionCodeRaw: params.actionCodeRaw,
      submittedTextIntent,
    });

    let nextState = deps.applyPostSpecialistStateMutations({
      prevState: state,
      decision: decision1,
      specialistResult,
      provisionalSource: provisionalSourceForMutation,
    });

    if (autoSuggestApplied) {
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
    const suppressWordingChoiceForAutoSuggest = autoSuggestApplied;
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
    const userTextForWordingChoice = resolveWordingChoiceSeedUserText({
      submittedTextIntent,
      submittedTextAnchor,
      submittedUserText,
      userMessage,
      previousSpecialist: previousSpecialistForWordingChoice,
    });
    const forcePendingWordingChoice = shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent,
      submittedTextAnchor,
    });
    const wordingIntentEligible = isWordingChoiceIntentEligible(asRecord(specialistResult));
    const skipWordingChoiceForTurn =
      submittedTextIntent === "feedback_on_current_value" ||
      String((specialistResult as Record<string, unknown>).__dream_policy_skip_wording_choice || "").trim() === "true";
    if (
      params.wordingChoiceEnabled &&
      !suppressWordingChoiceForAutoSuggest &&
      params.inputMode === "widget" &&
      wordingIntentEligible &&
      eligibleForWordingChoiceTurn &&
      !isCurrentTurnOfftopic &&
      !skipWordingChoiceForTurn &&
      !isTrueFlag(specialistResult.wording_choice_pending)
    ) {
      const acceptedOutputUserTurnClassification =
        !forcePendingWordingChoice &&
        isAcceptedOutputSingleValueStep(currentStepForWordingChoice) &&
        Boolean(String(userTextForWordingChoice || "").trim())
          ? await deps.classifyAcceptedOutputUserTurn({
              model: params.model,
              stepId: currentStepForWordingChoice,
              userMessage: userTextForWordingChoice,
              currentAcceptedValue: pickCurrentAcceptedValueForStep(nextState, currentStepForWordingChoice),
              pendingSuggestion: String((specialistResult as Record<string, unknown>).refined_formulation || "").trim(),
              language: params.lang,
            })
          : null;
      const rebuilt = deps.buildWordingChoiceFromTurn({
        stepId: currentStepForWordingChoice,
        state: nextState,
        activeSpecialist: currentSpecialistForWordingChoice,
        previousSpecialist: previousSpecialistForWordingChoice,
        specialistResult,
        userTextRaw: userTextForWordingChoice,
        isOfftopic: false,
        forcePending: forcePendingWordingChoice,
        dreamRuntimeModeRaw: dreamRuntimeModeForWording,
        submittedTextIntent,
        submittedTextAnchor,
        submittedFeedbackText: submittedUserText,
        acceptedOutputUserTurnClassification,
      });
      specialistResult = rebuilt.specialist;
    }
    asStateRecord(nextState).last_specialist_result = specialistResult;
    if (
      params.wordingChoiceEnabled &&
      params.inputMode === "widget" &&
      !suppressWordingChoiceForAutoSuggest &&
      wordingIntentEligible
    ) {
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
      if (pendingChoice?.enabled) {
        specialistResult = normalizePendingPickerSpecialistContract({
          specialist: asRecord(specialistResult),
          stepIdHint: String(asStateRecord(nextState).current_step || ""),
        });
        wordingChoiceOverride = pendingChoice;
        requireWordingPick = true;
        actionCodesOverride = [];
        renderedActionsOverride = [];
      } else if (isTrueFlag(specialistResult.wording_choice_pending)) {
        const presentation = String(specialistResult.wording_choice_presentation || "").trim();
        if (presentation !== "canonical") {
          specialistResult = clearPendingWordingChoiceFields(asRecord(specialistResult));
        }
      }
    } else if (isTrueFlag(specialistResult.wording_choice_pending)) {
      specialistResult = clearPendingWordingChoiceFields(asRecord(specialistResult));
    }

    const canonicalDreamBuilderStatementsCount =
      readStringArray(asStateRecord(nextState).dream_builder_statements).length;
    specialistResult = deps.enforceDreamBuilderQuestionProgress(specialistResult, {
      currentStepId: String(asStateRecord(nextState).current_step || ""),
      activeSpecialist: String(asStateRecord(nextState).active_specialist || ""),
      canonicalStatementCount: canonicalDreamBuilderStatementsCount,
      wordingChoicePending:
        requireWordingPick ||
        Boolean(wordingChoiceOverride?.enabled) ||
        isTrueFlag((specialistResult as Record<string, unknown>).wording_choice_pending),
      state: nextState,
    });
    // Motivational quote injection feature removed.
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
