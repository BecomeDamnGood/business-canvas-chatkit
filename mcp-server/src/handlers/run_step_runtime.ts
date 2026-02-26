// mcp-server/src/handlers/run_step.ts
import { z } from "zod";

import {
  type LLMUsage,
  type CanvasState,
  type ProvisionalSource,
  type OrchestratorOutput,
  type ValidationAndBusinessNameOutput,
  type DreamOutput,
  type RoleOutput,
  type PresentationOutput,
  type TurnPolicyRenderResult,
  type TurnOutputStatus,
  type RenderedAction,
  resolveModelForCall,
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
  hasPresentationTemplate,
  STEP_0_ID,
  STEP_0_SPECIALIST,
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_EXPLAINER_SPECIALIST,
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  ACTIONCODE_REGISTRY,
  MENU_LABEL_DEFAULTS,
  MENU_LABEL_KEYS,
  labelKeyForMenuAction,
  renderFreeTextTurnPolicy,
  NEXT_MENU_BY_ACTIONCODE,
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
  actionCodeToIntent,
  UI_STRINGS_WITH_MENU_KEYS,
} from "./run_step_dependencies.js";
import {
  buildFailClosedState,
  detectInvalidContractStateMarkers,
  detectLegacySessionMarkers,
  parseRunStepIngressArgs,
  type RunStepArgs,
} from "./ingress.js";
import {
  createBuildRateLimitErrorPayload,
  createBuildTimeoutErrorPayload,
  createBuildTransientFallbackSpecialist,
  createCallSpecialistStrict,
  createCallSpecialistStrictSafe,
  hasUsableSpecialistForRetry as hasUsableSpecialistForRetryDispatch,
} from "./specialist_dispatch.js";
import {
  createRunStepUiPayloadHelpers,
  createRunStepWordingHelpers,
  createRunStepWordingHeuristicHelpers,
  createRunStepStateUpdateHelpers,
  createRunStepPolicyMetaHelpers,
  createRunStepStep0DisplayHelpers,
  createRunStepPresentationHelpers,
  createRunStepPreflightHelpers,
  createRunStepRuntimeFinalizeLayer,
  createRunStepRuntimeTextHelpers,
  runStepRuntimePreflightLayer,
  runStepRuntimeActionRoutingLayer,
  runStepRuntimeSpecialRoutesLayer,
  runStepRuntimePostPipelineLayer,
} from "./run_step_modules.js";
import {
  createRunStepI18nRuntimeHelpers,
  type UiI18nTelemetryCounters,
} from "./run_step_i18n_runtime.js";
import { parseSpecialistOutputById } from "./run_step_specialist_types.js";
import {
  parseStep0Final,
  hasValidStep0Final,
  maybeSeedStep0CandidateFromInitialMessage,
} from "./run_step_step0.js";
import {
  tokenizeWords,
  normalizeLightUserInput,
  normalizeListUserInput,
  isMaterialRewriteCandidate,
  shouldTreatAsStepContributingInput,
  isClearlyGeneralOfftopicInput,
  parseListItems,
  splitSentenceItems,
  canonicalizeComparableText,
  areEquivalentWordingVariants,
} from "./run_step_wording_heuristics.js";
import {
  LANGUAGE_LOCK_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
  OFF_TOPIC_POLICY,
  OFFTOPIC_FLAG_CONTRACT_INSTRUCTION,
  USER_INTENT_CONTRACT_INSTRUCTION,
  META_TOPIC_CONTRACT_INSTRUCTION,
} from "./run_step_policy_meta.js";
import {
  ACTION_BOOTSTRAP_POLL_TOKEN,
  DREAM_EXPLAINER_ESCAPE_MENU_ID,
  DREAM_EXPLAINER_REFINE_MENU_ID,
  DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
  DREAM_FORCE_REFINE_ROUTE_PREFIX,
  DREAM_PICK_ONE_ROUTE_TOKEN,
  DREAM_START_EXERCISE_ACTION_CODES,
  DREAM_START_EXERCISE_ROUTE_TOKEN,
  PRESENTATION_MAKE_ROUTE_TOKEN,
  ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN,
  STRATEGY_CONSOLIDATE_ROUTE_TOKEN,
  SWITCH_TO_SELF_DREAM_TOKEN,
  WIDGET_ESCAPE_LABEL_PATTERNS,
  WIDGET_ESCAPE_MENU_SUFFIX,
  createTurnLlmAccumulator,
  envFlagEnabled,
  getDreamRuntimeMode,
  isForceEnglishLanguageMode,
  isMenuLabelKeysV1Enabled,
  isUiBootstrapEventParityV1Enabled,
  isUiBootstrapPollActionV1Enabled,
  isUiBootstrapStateV1Enabled,
  isUiBootstrapWaitRetryV1Enabled,
  isUiI18nCriticalKeysV1Enabled,
  isUiI18nV2Enabled,
  isUiI18nV3LangBootstrapEnabled,
  isUiLangSourceResolverV1Enabled,
  isUiLocaleMetaV1Enabled,
  isUiLocaleReadyGateV1Enabled,
  isUiNoPendingTextSuppressV1Enabled,
  isUiPendingNoFallbackTextV1Enabled,
  isUiSemanticInvariantsV1Enabled,
  isUiStartTriggerLangResolveV1Enabled,
  isUiStateHygieneSwitchV1Enabled,
  isUiStep0LangResetGuardV1Enabled,
  isUiStrictNonEnPendingV1Enabled,
  isUiTranslationFastModelV1Enabled,
  isUiWaitShellV2Enabled,
  isUiWordingFeedbackKeyedV1Enabled,
  isWordingPanelCleanBodyV1Enabled,
  normalizeDreamRuntimeMode,
  normalizeUsage,
  registerTurnLlmCall,
  resolveHolisticPolicyFlags,
  setDreamRuntimeMode,
  shouldLogLocalDevDiagnostics,
  syncDreamRuntimeMode as syncDreamRuntimeModeState,
  turnUsageFromAccumulator,
} from "./run_step_runtime_backbone.js";
import type { RunStepPipelinePorts, RunStepRoutePorts } from "./run_step_ports.js";
import {
  createRunStepRuntimeStateHelpers,
  RECAP_INSTRUCTION,
} from "./run_step_runtime_state_helpers.js";
import {
  createRunStepRuntimeActionHelpers,
  type WordingChoiceUiPayload,
  type UiViewPayload,
} from "./run_step_runtime_action_helpers.js";
import { createRunStepRuntimeDreamHelpers } from "./run_step_runtime_dream_helpers.js";
export {
  LANGUAGE_LOCK_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
  OFF_TOPIC_POLICY,
  RECAP_INSTRUCTION,
};
const runtimeStateHelpers = createRunStepRuntimeStateHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  purposeStepId: PURPOSE_STEP_ID,
  bigwhyStepId: BIGWHY_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  targetgroupStepId: TARGETGROUP_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  presentationStepId: PRESENTATION_STEP_ID,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  parseStep0Final,
  parseListItems,
  canonicalizeComparableText,
  getFinalsSnapshot,
});
const {
  FINAL_FIELD_BY_STEP_ID,
  normalizedProvisionalByStep,
  provisionalValueForStep,
  provisionalSourceForStep,
  withProvisionalValue,
  clearProvisionalValue,
  clearStepInteractiveState,
  fieldForStep,
  wordingStepLabel,
  wordingSelectionMessage,
  looksLikeMetaInstruction,
  extractUserMessageFromWrappedInput,
  isPristineStateForStart,
  buildSpecialistContextBlock,
} = runtimeStateHelpers;
export const informationalActionMutatesProgress =
  runtimeStateHelpers.informationalActionMutatesProgress;
const runtimeActionHelpers = createRunStepRuntimeActionHelpers({
  step0Id: STEP_0_ID,
  actioncodeRegistry: ACTIONCODE_REGISTRY,
});
const {
  processActionCode,
  deriveUiViewPayload,
  isConfirmActionCode,
  menuHasConfirmAction,
} = runtimeActionHelpers;
const runtimeDreamHelpers = createRunStepRuntimeDreamHelpers({
  strategyStepId: STRATEGY_STEP_ID,
  tokenizeWords,
  parseListItems,
  provisionalValueForStep,
  ensureSentenceEnd,
});

const {
  hasMeaningfulDreamCandidateText,
  pickDreamCandidateFromState,
  hasDreamSpecialistCandidate,
  strategyStatementsForConsolidateGuard,
  fallbackDreamCandidateFromUserInput,
  buildDreamRefineFallbackSpecialist,
} = runtimeDreamHelpers;

function uiDefaultString(key: string, fallback = ""): string {
  const candidate = String(UI_STRINGS_WITH_MENU_KEYS[key] || "").trim();
  if (candidate) return candidate;
  return String(fallback || "").trim();
}

function formatIndexedTemplate(templateRaw: string, values: string[]): string {
  let out = String(templateRaw || "");
  for (let i = 0; i < values.length; i += 1) {
    out = out.replace(new RegExp(`\\{${i}\\}`, "g"), String(values[i] || ""));
  }
  return out;
}

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function step0CardDescForState(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  return uiStringFromStateMap(state, "step0.carddesc", uiDefaultString("step0.carddesc"));
}

function step0QuestionForState(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  return uiStringFromStateMap(
    state,
    "step0.question.initial",
    uiDefaultString("step0.question.initial")
  );
}

const DREAM_EXPLAINER_ESCAPE_ACTION_CODES = new Set(
  (ACTIONCODE_REGISTRY.menus[DREAM_EXPLAINER_ESCAPE_MENU_ID] || [])
    .map((code) => String(code || "").trim())
    .filter(Boolean)
);
const WIDGET_ESCAPE_ACTION_CODE_BAN = new Set<string>(
  Object.entries(ACTIONCODE_REGISTRY.menus)
    .filter(([menuId]) => String(menuId || "").trim().endsWith(WIDGET_ESCAPE_MENU_SUFFIX))
    .flatMap(([, actionCodes]) => (Array.isArray(actionCodes) ? actionCodes : []))
    .map((code) => String(code || "").trim())
    .filter(Boolean)
    .filter((code) => !DREAM_EXPLAINER_ESCAPE_ACTION_CODES.has(code))
);

function isEscapeMenuId(menuId: string): boolean {
  return String(menuId || "").trim().endsWith(WIDGET_ESCAPE_MENU_SUFFIX);
}

function isWidgetSuppressedEscapeMenuId(menuId: string): boolean {
  const id = String(menuId || "").trim();
  return isEscapeMenuId(id) && id !== DREAM_EXPLAINER_ESCAPE_MENU_ID;
}

function hasEscapeLabelPhrase(input: string): boolean {
  const text = String(input || "");
  if (!text) return false;
  return WIDGET_ESCAPE_LABEL_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeEscapeInWidget(specialist: unknown): Record<string, unknown> {
  const safe = specialist && typeof specialist === "object" ? { ...(specialist as Record<string, unknown>) } : {};
  const contractId = String(safe.ui_contract_id || "").trim();
  const contractStepId = contractId.split(":")[0] || "";
  const menuId = parseMenuFromContractIdForStep(contractId, contractStepId);
  if (menuId === DREAM_EXPLAINER_ESCAPE_MENU_ID) return safe;
  const action = String(safe.action || "").trim().toUpperCase();
  const question = String(safe.question || "");
  const message = String(safe.message || "");
  const hasEscapeSignal =
    isWidgetSuppressedEscapeMenuId(menuId) ||
    action === "ESCAPE" ||
    hasEscapeLabelPhrase(question) ||
    hasEscapeLabelPhrase(message);
  if (!hasEscapeSignal) return safe;

  safe.is_offtopic = true;
  safe.action = "ASK";
  safe.user_intent = "OFFTOPIC";
  safe.meta_topic = "NONE";
  const shouldCleanQuestion =
    isWidgetSuppressedEscapeMenuId(menuId) || hasEscapeLabelPhrase(question);
  if (shouldCleanQuestion) {
    const cleanedQuestion = String(question || "")
      .split(/\r?\n/)
      .filter((line) => !hasEscapeLabelPhrase(line))
      .join("\n")
      .trim();
    safe.question = cleanedQuestion;
  }
  if (hasEscapeLabelPhrase(message)) {
    safe.message = String(message || "")
      .split(/\r?\n/)
      .filter((line) => !hasEscapeLabelPhrase(line))
      .join("\n")
      .trim();
  }
  safe.wording_choice_pending = "false";
  safe.wording_choice_selected = "";
  safe.feedback_reason_key = "";
  safe.feedback_reason_text = "";
  return safe;
}

type SemanticViolationReason =
  | "missing_prompt_for_interactive_ask"
  | "confirm_present_without_accepted_evidence"
  | "intro_mode_must_not_expose_confirm"
  | "wording_choice_mode_requires_instruction_or_context";

const SEMANTIC_VIOLATION_REASONS = new Set<SemanticViolationReason>([
  "missing_prompt_for_interactive_ask",
  "confirm_present_without_accepted_evidence",
  "intro_mode_must_not_expose_confirm",
  "wording_choice_mode_requires_instruction_or_context",
]);

function isSemanticViolationReason(reason: string | null | undefined): reason is SemanticViolationReason {
  if (!reason) return false;
  return SEMANTIC_VIOLATION_REASONS.has(reason as SemanticViolationReason);
}

function hasAcceptedOutputEvidence(state: CanvasState, stepId: string): boolean {
  const finalField = String(FINAL_FIELD_BY_STEP_ID[stepId] || "").trim();
  const committedFinal = finalField ? String((state as Record<string, unknown>)?.[finalField] || "").trim() : "";
  if (committedFinal) return true;
  const provisional = provisionalValueForStep(state as Record<string, unknown>, stepId);
  if (!provisional) return false;
  const source = provisionalSourceForStep(state as Record<string, unknown>, stepId);
  return source === "user_input" || source === "wording_pick" || source === "action_route";
}

function validateRenderedContractTurn(
  stepId: string,
  rendered: TurnPolicyRenderResult,
  state?: CanvasState
): string | null {
  const specialist = (rendered.specialist || {}) as Record<string, unknown>;
  const action = String(specialist.action || "").trim().toUpperCase();
  const contractId = String(rendered.contractId || specialist.ui_contract_id || "").trim();
  const menuId = parseMenuFromContractIdForStep(contractId, stepId);
  const actionCodes = Array.isArray(rendered.uiActionCodes)
    ? rendered.uiActionCodes.map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const uiActions = Array.isArray(rendered.uiActions) ? rendered.uiActions : [];
  const question = String(specialist.question || "").trim();
  const numberedCount = countNumberedOptions(question);

  if (action !== "ASK") return "rendered_action_not_ask";
  if (!contractId) return "missing_contract_id";
  if (menuId && !ACTIONCODE_REGISTRY.menus[menuId]) return "unknown_menu_id";
  if (menuId && actionCodes.length === 0) return "menu_without_action_codes";
  if (actionCodes.length !== uiActions.length) return "ui_action_count_mismatch";
  if (actionCodes.length > 0 && numberedCount !== actionCodes.length) return "numbered_prompt_action_count_mismatch";
  if (stepId === DREAM_STEP_ID && state) {
    const dreamMode = getDreamRuntimeMode(state);
    if (dreamMode === "builder_collect") {
      if (menuId !== DREAM_EXPLAINER_SWITCH_SELF_MENU_ID) return "dream_builder_collect_menu_mismatch";
      if (actionCodes.length !== 1 || actionCodes[0] !== "ACTION_DREAM_SWITCH_TO_SELF") {
        return "dream_builder_collect_action_mismatch";
      }
    }
    if (dreamMode === "builder_refine" && menuId !== DREAM_EXPLAINER_REFINE_MENU_ID) {
      return "dream_builder_refine_menu_mismatch";
    }
    if (dreamMode === "builder_scoring" && actionCodes.length > 0) {
      return "dream_builder_scoring_should_not_render_actions";
    }
  }

  for (const code of actionCodes) {
    if (!ACTIONCODE_REGISTRY.actions[code]) return `unknown_action_code:${code}`;
  }
  if (state) {
    const clickedLabel = String((state as Record<string, unknown>).__last_clicked_label_for_contract || "").trim();
    const clickedActionCode = String((state as Record<string, unknown>).__last_clicked_action_for_contract || "").trim().toUpperCase();
    if (clickedLabel) {
      const clickedKey = clickedLabel.toLowerCase();
      const nextLabels = uiActions
        .map((action) => String((action as Record<string, unknown>)?.label || "").trim().toLowerCase())
        .filter(Boolean);
      const allowRepeatedLabel =
        clickedActionCode === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST";
      if (!allowRepeatedLabel && nextLabels.includes(clickedKey)) {
        return "repeated_clicked_label_after_transition";
      }
    }
  }
  if (menuId) {
    const allowed = new Set((ACTIONCODE_REGISTRY.menus[menuId] || []).map((code) => String(code || "").trim()));
    if (allowed.size === 0) return "menu_has_no_registry_actions";
    for (const code of actionCodes) {
      if (!allowed.has(code)) return `action_code_not_in_menu:${code}`;
    }
  }

  const hasConfirmAction = actionCodes.some((code) => isConfirmActionCode(code));
  if (rendered.status === "no_output" && hasConfirmAction) {
    return "intro_mode_must_not_expose_confirm";
  }
  if (state && hasConfirmAction && !hasAcceptedOutputEvidence(state, stepId)) {
    return "confirm_present_without_accepted_evidence";
  }
  if (
    action === "ASK" &&
    (rendered.status === "no_output" || rendered.status === "incomplete_output")
  ) {
    const renderMode = state ? inferUiRenderModeForStep(state, stepId) : "menu";
    const dreamMode = state && stepId === DREAM_STEP_ID ? getDreamRuntimeMode(state) : "self";
    const promptRequired = !(renderMode === "no_buttons" || (stepId === DREAM_STEP_ID && dreamMode === "builder_scoring"));
    if (promptRequired && !question) {
      return "missing_prompt_for_interactive_ask";
    }
  }
  if (String((specialist as Record<string, unknown>).wording_choice_pending || "").trim() === "true") {
    const hasWordingContext =
      Boolean(String((specialist as Record<string, unknown>).message || "").trim()) ||
      Boolean(question) ||
      Boolean(String((specialist as Record<string, unknown>).wording_choice_user_raw || "").trim()) ||
      Boolean(String((specialist as Record<string, unknown>).wording_choice_user_normalized || "").trim()) ||
      Boolean(String((specialist as Record<string, unknown>).wording_choice_agent_current || "").trim()) ||
      (Array.isArray((specialist as Record<string, unknown>).wording_choice_user_items) &&
        ((specialist as Record<string, unknown>).wording_choice_user_items as unknown[]).length > 0) ||
      (Array.isArray((specialist as Record<string, unknown>).wording_choice_suggestion_items) &&
        ((specialist as Record<string, unknown>).wording_choice_suggestion_items as unknown[]).length > 0);
    if (!hasWordingContext) return "wording_choice_mode_requires_instruction_or_context";
  }

  if (stepId !== STEP_0_ID && rendered.status === "valid_output") {
    if (state && inferUiRenderModeForStep(state, stepId) === "no_buttons") {
      return null;
    }
    const inDreamBuilderMode =
      stepId === DREAM_STEP_ID &&
      state &&
      getDreamRuntimeMode(state) !== "self";
    if (!inDreamBuilderMode) {
      const expectedMenuId = String(DEFAULT_MENU_BY_STATUS[stepId]?.valid_output || "").trim();
      if (expectedMenuId && menuId !== expectedMenuId) {
        return `invalid_valid_output_menu:${menuId || "NO_MENU"}_expected:${expectedMenuId}`;
      }
    }
  }

  if (
    stepId !== STEP_0_ID &&
    rendered.status !== "no_output" &&
    actionCodes.length === 0
  ) {
    if (state && inferUiRenderModeForStep(state, stepId) === "no_buttons") {
      return null;
    }
    return "missing_action_codes_for_interactive_step";
  }

  if (
    rendered.status === "valid_output" &&
    rendered.confirmEligible &&
    menuId &&
    menuHasConfirmAction(menuId)
  ) {
    const hasConfirm = actionCodes.some((code) => isConfirmActionCode(code));
    if (!hasConfirm) return "missing_confirm_action_for_valid_output";
  }

  const offTopicShapeViolation = validateNonStep0OfftopicMessageShape(stepId, specialist, state);
  if (offTopicShapeViolation) return offTopicShapeViolation;

  return null;
}

function semanticFallbackSpecialistForStep(
  stepId: string,
  specialist: Record<string, unknown>,
  reason: SemanticViolationReason,
  state: CanvasState
): Record<string, unknown> {
  const next = { ...specialist };
  if (reason === "missing_prompt_for_interactive_ask") {
    (next as Record<string, unknown>).question = promptFallbackForInteractiveAsk(state, stepId);
  }
  if (reason === "wording_choice_mode_requires_instruction_or_context") {
    const existingMessage = String((next as Record<string, unknown>).message || "").trim();
    if (!existingMessage) {
      (next as Record<string, unknown>).message = uiStringFromStateMap(
        state,
        "wording.choice.context.default",
        uiDefaultString("wording.choice.context.default", "Please choose the wording that fits best.")
      );
    }
  }
  if (reason === "confirm_present_without_accepted_evidence" || reason === "intro_mode_must_not_expose_confirm") {
    const field = fieldForStep(stepId);
    if (field) (next as Record<string, unknown>)[field] = "";
    (next as Record<string, unknown>).refined_formulation = "";
    if (Array.isArray((next as Record<string, unknown>).statements)) {
      (next as Record<string, unknown>).statements = [];
    }
  }
  return next;
}

function validateRenderedContractOrRecover(params: {
  stepId: string;
  rendered: TurnPolicyRenderResult;
  state: CanvasState;
  previousSpecialist: Record<string, unknown>;
  telemetry?: UiI18nTelemetryCounters | null;
}): { rendered: TurnPolicyRenderResult; state: CanvasState; violation: string | null; recovered: boolean } {
  let rendered = params.rendered;
  let state = params.state;
  const stepId = String(params.stepId || "").trim();
  const specialistWithInvariants = enforcePromptInvariants({
    stepId,
    status: rendered.status,
    specialist: (rendered.specialist || {}) as Record<string, unknown>,
    state,
  });
  rendered = {
    ...rendered,
    specialist: specialistWithInvariants,
  };
  const violation = validateRenderedContractTurn(stepId, rendered, state);
  if (!violation) {
    return { rendered, state, violation: null, recovered: false };
  }
  if (!isUiSemanticInvariantsV1Enabled() || !isSemanticViolationReason(violation)) {
    return { rendered, state, violation, recovered: false };
  }
  if (violation === "missing_prompt_for_interactive_ask") {
    bumpUiI18nCounter(params.telemetry, "semantic_prompt_missing_count");
  }
  if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
    bumpUiI18nCounter(params.telemetry, "semantic_confirm_blocked_count");
  }
  let fallbackState = state;
  if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
    fallbackState = clearStepInteractiveState(fallbackState, stepId);
    bumpUiI18nCounter(params.telemetry, "state_hygiene_resets_count");
  }
  const fallbackSpecialist = semanticFallbackSpecialistForStep(
    stepId,
    (rendered.specialist || {}) as Record<string, unknown>,
    violation,
    fallbackState
  );
  let rerendered = renderFreeTextTurnPolicy({
    stepId,
    state: fallbackState,
    specialist: fallbackSpecialist,
    previousSpecialist: params.previousSpecialist || {},
  });
  rerendered = {
    ...rerendered,
    specialist: enforcePromptInvariants({
      stepId,
      status: rerendered.status,
      specialist: (rerendered.specialist || {}) as Record<string, unknown>,
      state: fallbackState,
    }),
  };
  const rerenderViolation = validateRenderedContractTurn(stepId, rerendered, fallbackState);
  if (!rerenderViolation) {
    return { rendered: rerendered, state: fallbackState, violation: null, recovered: true };
  }
  return { rendered, state, violation, recovered: false };
}

function sanitizeWidgetActionCodes(actionCodes: string[]): string[] {
  return actionCodes.filter((code) => !WIDGET_ESCAPE_ACTION_CODE_BAN.has(String(code || "").trim()));
}

const runStepI18nRuntime = createRunStepI18nRuntimeHelpers({
  step0Id: STEP_0_ID,
  isForceEnglishLanguageMode,
  isUiLocaleReadyGateV1Enabled,
  isUiBootstrapPollActionV1Enabled,
  isUiNoPendingTextSuppressV1Enabled,
  isUiPendingNoFallbackTextV1Enabled,
  isUiLocaleMetaV1Enabled,
  isUiLangSourceResolverV1Enabled,
});

const {
  normalizeLangCode,
  normalizeLocaleHint,
  isInteractiveLocaleReady,
  deriveBootstrapContract,
  shouldSuppressFallbackText,
  normalizeLanguageSource,
  bumpUiI18nCounter,
  ensureUiStringsForState,
  resolveLanguageForTurn,
  langFromState,
} = runStepI18nRuntime;

function step0ReadyActionLabel(state: CanvasState | null | undefined): string {
  if (shouldSuppressFallbackText(state)) return "";
  const key = labelKeyForMenuAction("STEP0_MENU_READY_START", "ACTION_STEP0_READY_START", 0);
  const fallback = String(MENU_LABEL_DEFAULTS[key] || "Yes, I'm ready. Let's start!").trim();
  return uiStringFromStateMap(state, key, fallback);
}

function step0ReadinessStatement(state: CanvasState | null | undefined, parsed: { venture: string; name: string; status: string }): string {
  if (shouldSuppressFallbackText(state)) return "";
  const venture = String(parsed.venture || "venture").trim();
  const name = String(parsed.name || "TBD").trim();
  const existingTemplate = uiStringFromStateMap(
    state,
    "step0.readiness.statement.existing",
    uiDefaultString("step0.readiness.statement.existing", "You have a {0} called {1}.")
  );
  const startingTemplate = uiStringFromStateMap(
    state,
    "step0.readiness.statement.starting",
    uiDefaultString("step0.readiness.statement.starting", "You want to start a {0} called {1}.")
  );
  const template = String(parsed.status || "").toLowerCase() === "existing" ? existingTemplate : startingTemplate;
  return formatIndexedTemplate(template, [venture, name]).trim();
}

function step0ReadinessQuestion(state: CanvasState | null | undefined, parsed: { venture: string; name: string; status: string }): string {
  if (shouldSuppressFallbackText(state)) return "";
  const readyLabel = step0ReadyActionLabel(state);
  const suffix = uiStringFromStateMap(
    state,
    "step0.readiness.suffix",
    uiDefaultString("step0.readiness.suffix", "Are you ready to start with the first step: the Dream?")
  );
  const statement = step0ReadinessStatement(state, parsed);
  if (!readyLabel || !statement || !suffix) return "";
  return `1) ${readyLabel}\n\n${statement} ${suffix}`.trim();
}

const runtimeTextHelpers = createRunStepRuntimeTextHelpers({
  dreamStepId: DREAM_STEP_ID,
  parseMenuFromContractIdForStep: (contractIdRaw, stepId) =>
    parseMenuFromContractIdForStep(contractIdRaw, stepId),
  canonicalizeComparableText,
  mergeListItems: (userItems, suggestionItems) => mergeListItems(userItems, suggestionItems),
  splitSentenceItems,
  sanitizePendingListMessage: (message, fallbackItems) =>
    sanitizePendingListMessage(message, fallbackItems),
  isWordingPanelCleanBodyV1Enabled,
  fieldForStep,
  stripUnsupportedReformulationClaims: (message) =>
    stripUnsupportedReformulationClaims(message),
  tokenizeWords,
  compactWordingPanelBody,
});

export const buildTextForWidget = runtimeTextHelpers.buildTextForWidget;
const stripChoiceInstructionNoise = runtimeTextHelpers.stripChoiceInstructionNoise;
export const pickPrompt = runtimeTextHelpers.pickPrompt;

function countNumberedOptions(prompt: string): number {
  const lines = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const match = line.match(/^([1-9])[\)\.]\s+/);
    if (!match) continue;
    const n = Number(match[1]);
    if (n !== count + 1) break;
    count += 1;
  }
  return count;
}

function labelsForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
  const safeMenuId = String(menuId || "").trim();
  const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  if (!safeMenuId || safeActionCodes.length === 0) return [];
  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
    ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const fullLabelKeys = labelKeysForMenuActionCodes(safeMenuId, fullActionCodes);
  if (fullActionCodes.length === 0 || fullLabelKeys.length !== fullActionCodes.length) return [];
  const usedIndices = new Set<number>();
  const filteredLabels: string[] = [];
  for (const actionCode of safeActionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (fullActionCodes[i] !== actionCode) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
    const label = String(MENU_LABEL_DEFAULTS[labelKey] || "").trim();
    if (!label) return [];
    filteredLabels.push(label);
  }
  return filteredLabels;
}

function uiStringFromStateMap(
  state: CanvasState | null | undefined,
  key: string,
  fallback: string
): string {
  const map = state && typeof (state as Record<string, unknown>).ui_strings === "object"
    ? ((state as Record<string, unknown>).ui_strings as Record<string, unknown>)
    : null;
  if (map) {
    const candidate = String(map[key] || "").trim();
    if (candidate) return candidate;
  }
  if (shouldSuppressFallbackText(state)) return "";
  return String(fallback || "").trim();
}

const presentationHelpers = createRunStepPresentationHelpers({
  uiDefaultString,
  uiStringFromStateMap,
});

const {
  baseUrlFromEnv,
  generatePresentationPptx,
  cleanupOldPresentationFiles,
  convertPptxToPdf,
  convertPdfToPng,
} = presentationHelpers;

function labelKeysForMenuActionCodes(menuId: string, actionCodes: string[]): string[] {
  const safeMenuId = String(menuId || "").trim();
  const safeActionCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  if (!safeMenuId || safeActionCodes.length === 0) return [];
  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
    ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  const fullLabelKeys = Array.isArray(MENU_LABEL_KEYS[safeMenuId])
    ? MENU_LABEL_KEYS[safeMenuId].map((labelKey) => String(labelKey || "").trim())
    : [];
  if (fullActionCodes.length === 0) return [];
  if (fullActionCodes.length !== fullLabelKeys.length) {
    return safeActionCodes.map((actionCode, idx) => labelKeyForMenuAction(safeMenuId, actionCode, idx));
  }
  const usedIndices = new Set<number>();
  const filteredLabelKeys: string[] = [];
  for (const actionCode of safeActionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (fullActionCodes[i] !== actionCode) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    const labelKey = String(fullLabelKeys[matchedIndex] || "").trim();
    if (!labelKey) return [];
    filteredLabelKeys.push(labelKey);
  }
  return filteredLabelKeys;
}

function stripNumberedOptions(prompt: string): string {
  const kept = String(prompt || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s+/.test(line));
  return kept.join("\n").trim();
}

function buildRenderedActionsFromMenu(
  menuId: string,
  actionCodes: string[],
  stateForLabels?: CanvasState | null
): RenderedAction[] {
  const safeCodes = actionCodes.map((code) => String(code || "").trim()).filter(Boolean);
  const labels = labelsForMenuActionCodes(menuId, safeCodes);
  const labelKeys = labelKeysForMenuActionCodes(menuId, safeCodes);
  if (!safeCodes.length || labels.length !== safeCodes.length || labelKeys.length !== safeCodes.length) return [];
  return safeCodes.map((actionCode, idx) => {
    const entry = ACTIONCODE_REGISTRY.actions[actionCode];
    const route = String(entry?.route || actionCode).trim();
    const labelKey = labelKeys[idx] || labelKeyForMenuAction(menuId, actionCode, idx);
    const label = uiStringFromStateMap(stateForLabels || null, labelKey, labels[idx]);
    return {
      id: `${actionCode}:${idx + 1}`,
      label,
      label_key: labelKey,
      action_code: actionCode,
      intent: actionCodeToIntent({ actionCode, route }),
      primary: idx === 0,
    };
  });
}

function buildQuestionTextFromActions(prompt: string): string {
  return stripNumberedOptions(prompt) || String(prompt || "").trim();
}

type PromptInvariantContext = {
  stepId: string;
  status: TurnOutputStatus;
  specialist: Record<string, unknown>;
  state: CanvasState;
};

function promptFallbackForInteractiveAsk(state: CanvasState, stepId: string): string {
  if (stepId === STEP_0_ID) {
    return step0QuestionForState(state);
  }
  return uiStringFromStateMap(
    state,
    "invariant.prompt.ask.default",
    uiDefaultString("invariant.prompt.ask.default", "Share your thoughts or choose an option.")
  );
}

function enforcePromptInvariants(context: PromptInvariantContext): Record<string, unknown> {
  if (!isUiSemanticInvariantsV1Enabled()) return context.specialist;
  const stepId = String(context.stepId || "").trim();
  const status = context.status;
  const specialist = context.specialist || {};
  const action = String((specialist as Record<string, unknown>).action || "").trim().toUpperCase();
  if (action !== "ASK") return specialist;
  const interactiveAsk = status === "no_output" || status === "incomplete_output";
  if (!interactiveAsk) return specialist;

  const currentQuestion = String((specialist as Record<string, unknown>).question || "").trim();
  const currentMessage = String((specialist as Record<string, unknown>).message || "").trim();
  const wordingPending = String((specialist as Record<string, unknown>).wording_choice_pending || "").trim() === "true";
  const next = { ...specialist };
  if (!currentQuestion) {
    (next as Record<string, unknown>).question = promptFallbackForInteractiveAsk(context.state, stepId);
  }
  if (wordingPending && !currentMessage) {
    (next as Record<string, unknown>).message = uiStringFromStateMap(
      context.state,
      "wording.choice.context.default",
      uiDefaultString("wording.choice.context.default", "Please choose the wording that fits best.")
    );
  }
  return next;
}

function normalizeEntityPhrase(raw: string): string {
  let next = String(raw || "").replace(/\r/g, "\n").trim();
  if (!next) return "";
  next = next.split(/\n{2,}/)[0].trim();
  next = next.replace(/\s+/g, " ").trim();
  next = next.replace(/\s*How does that sound to you\?.*$/i, "").trim();
  next = next.replace(/^we\s+are\s+/i, "");
  next = next.replace(/^we['’]re\s+/i, "");
  next = next.replace(/^it\s+is\s+/i, "");
  next = next.replace(/^it['’]s\s+/i, "");
  next = next.replace(/[“”"']+/g, "").trim();
  next = next.replace(/[.!?]+$/g, "").trim();
  return next;
}

function normalizeEntitySpecialistResult(
  stepId: string,
  specialist: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (stepId !== ENTITY_STEP_ID || !specialist || typeof specialist !== "object") return specialist;
  const normalizedRefined = normalizeEntityPhrase(String(specialist.refined_formulation || ""));
  const normalizedEntity = normalizeEntityPhrase(String(specialist.entity || ""));
  const canonical = normalizedEntity || normalizedRefined;
  if (!canonical) return specialist;
  const next = { ...specialist };
  if (normalizedRefined) next.refined_formulation = normalizedRefined;
  next.entity = canonical;
  return next;
}

function enforceDreamBuilderQuestionProgress(
  specialistResult: Record<string, unknown> | null | undefined,
  params: {
    currentStepId: string;
    activeSpecialist: string;
    canonicalStatementCount: number;
    wordingChoicePending: boolean;
    state: CanvasState;
  }
): Record<string, unknown> {
  const currentStepId = String(params.currentStepId || "").trim();
  const activeSpecialist = String(params.activeSpecialist || "").trim();
  const specialist =
    specialistResult && typeof specialistResult === "object" ? specialistResult : {};
  if (currentStepId !== DREAM_STEP_ID || activeSpecialist !== DREAM_EXPLAINER_SPECIALIST) {
    return specialist;
  }
  const isOfftopic =
    specialist.is_offtopic === true ||
    String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
  if (isOfftopic) return specialist;
  const scoringPhase = String(specialist.scoring_phase || "").trim() === "true";
  if (scoringPhase) return specialist;

  const currentQuestion = String(specialist.question || "").trim();
  if (!currentQuestion) return specialist;

  const specialistStatementsCount = Array.isArray(specialist.statements)
    ? (specialist.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
    : 0;
  const hasCollectedInput =
    params.canonicalStatementCount > 0 ||
    specialistStatementsCount > 0 ||
    params.wordingChoicePending ||
    String(specialist.wording_choice_pending || "").trim() === "true";
  if (!hasCollectedInput) return specialist;

  const stage = String((params.state as Record<string, unknown>).__dream_builder_prompt_stage || "").trim();
  if (stage === "more") return specialist;
  const nextQuestion = uiStringFromStateMap(
    params.state,
    "dreamBuilder.question.more",
    uiDefaultString(
      "dreamBuilder.question.more",
      "What more do you see changing in the future, positive or negative? Let your imagination run free."
    )
  );
  if (!nextQuestion || nextQuestion === currentQuestion) return specialist;
  (params.state as Record<string, unknown>).__dream_builder_prompt_stage = "more";
  return {
    ...specialist,
    question: nextQuestion,
  };
}

export function isMetaOfftopicFallbackTurn(params: {
  stepId: string;
  userMessage: string;
  specialistResult: unknown;
}): boolean {
  void params.userMessage;
  const stepId = String(params.stepId || "").trim();
  if (!stepId || stepId === STEP_0_ID) return false;
  const specialist: Record<string, unknown> =
    params.specialistResult && typeof params.specialistResult === "object"
      ? (params.specialistResult as Record<string, unknown>)
      : {};
  const offTopicFlag = specialist.is_offtopic === true || String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
  if (offTopicFlag) return false;

  const userIntent = resolveMotivationUserIntent(specialist);
  if (
    userIntent === "META_QUESTION" ||
    userIntent === "RECAP_REQUEST" ||
    userIntent === "WHY_NEEDED" ||
    userIntent === "RESISTANCE"
  ) {
    return true;
  }
  const metaTopic = resolveSpecialistMetaTopic(specialist);
  return metaTopic !== "NONE";
}

function compactWordingPanelBody(messageRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
  if (!message) return "";
  const lines = message
    .split("\n")
    .map((line) => String(line || "").replace(/<[^>]+>/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^\s*(?:[-*•]|\d+[\).])\s+/.test(line))
    .filter((line) => {
      const normalized = line.toLowerCase();
      if (!normalized) return false;
      if (normalized.includes("this is your input")) return false;
      if (normalized.includes("this would be my suggestion")) return false;
      if (normalized.includes("if you meant something different")) return false;
      if (/\b(i['’]?ve|i have)\s+(reformulat\w*|rewritten|broadened|converted)\b/i.test(normalized)) return false;
      if (/^statement\s*\d+\s*:/i.test(normalized)) return false;
      if (/^statements?\s+\d+\s*(?:to|-)\s*\d+/i.test(normalized)) return false;
      return true;
    });
  if (lines.length === 0) return "";
  const firstLine = String(lines[0] || "").trim();
  if (!firstLine) return "";
  const firstSentence = firstLine
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || "";
  return ensureSentenceEnd(firstSentence || firstLine);
}

const policyMetaHelpers = createRunStepPolicyMetaHelpers({
  fieldForStep,
  wordingStepLabel,
  finalFieldByStepId: FINAL_FIELD_BY_STEP_ID,
  provisionalValueForStep,
  parseStep0Final,
  stripChoiceInstructionNoise,
  uiDefaultString,
  uiStringFromStateMap,
});

const {
  resolveMotivationUserIntent,
  resolveSpecialistMetaTopic,
  buildBenProfileMessage,
  applyMotivationQuotesContractV11,
  applyCentralMetaTopicRouter,
  normalizeNonStep0OfftopicSpecialist,
  validateNonStep0OfftopicMessageShape,
} = policyMetaHelpers;

export {
  applyMotivationQuotesContractV11,
  applyCentralMetaTopicRouter,
  normalizeNonStep0OfftopicSpecialist,
};

const step0DisplayHelpers = createRunStepStep0DisplayHelpers({
  step0Id: STEP_0_ID,
  resolveSpecialistMetaTopic,
  buildBenProfileMessage,
  step0ReadinessQuestion,
  step0CardDescForState,
  step0QuestionForState,
  stripChoiceInstructionNoise,
});

export const normalizeStep0AskDisplayContract = step0DisplayHelpers.normalizeStep0AskDisplayContract;
export const normalizeStep0OfftopicToAsk = step0DisplayHelpers.normalizeStep0OfftopicToAsk;

const wordingHeuristicHelpers = createRunStepWordingHeuristicHelpers({
  entityStepId: ENTITY_STEP_ID,
  dreamStepId: DREAM_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  fieldForStep,
  normalizeEntityPhrase,
  ensureSentenceEnd,
});

const pickDualChoiceSuggestion = wordingHeuristicHelpers.pickDualChoiceSuggestion;
const { pickDreamSuggestionFromPreviousState, pickRoleSuggestionFromPreviousState } = wordingHeuristicHelpers;

const uiPayloadHelpers = createRunStepUiPayloadHelpers({
  shouldLogLocalDevDiagnostics,
  pickPrompt,
  buildTextForWidget,
  deriveBootstrapContract,
  deriveUiViewPayload,
  sanitizeWidgetActionCodes,
  buildRenderedActionsFromMenu,
  buildQuestionTextFromActions,
  sanitizeEscapeInWidget,
  isWidgetSuppressedEscapeMenuId,
  enforcePromptInvariants,
  isUiI18nV2Enabled,
  isMenuLabelKeysV1Enabled,
  isUiI18nV3LangBootstrapEnabled,
  isUiLocaleMetaV1Enabled,
  isUiLangSourceResolverV1Enabled,
  isUiStrictNonEnPendingV1Enabled,
  isUiStep0LangResetGuardV1Enabled,
  isUiBootstrapStateV1Enabled,
  isUiPendingNoFallbackTextV1Enabled,
  isUiStartTriggerLangResolveV1Enabled,
  isUiLocaleReadyGateV1Enabled,
  isUiNoPendingTextSuppressV1Enabled,
  isUiBootstrapWaitRetryV1Enabled,
  isUiBootstrapEventParityV1Enabled,
  isUiBootstrapPollActionV1Enabled,
  isUiWaitShellV2Enabled,
  isUiTranslationFastModelV1Enabled,
  isUiI18nCriticalKeysV1Enabled,
});

const {
  applyUiPhaseByStep,
  setUiRenderModeByStep,
  inferUiRenderModeForStep,
  parseMenuFromContractIdForStep,
  inferCurrentMenuForStep,
  resolveActionCodeTransition,
  labelForActionInMenu,
  attachRegistryPayload,
} = uiPayloadHelpers;

function syncDreamRuntimeMode(state: CanvasState): void {
  syncDreamRuntimeModeState({
    state,
    dreamStepId: DREAM_STEP_ID,
    dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
    dreamExplainerRefineMenuId: DREAM_EXPLAINER_REFINE_MENU_ID,
    parseMenuFromContractIdForStep,
  });
}

const wordingHelpers = createRunStepWordingHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  normalizeDreamRuntimeMode,
  uiDefaultString,
  uiStringFromStateMap,
  fieldForStep,
  parseListItems,
  splitSentenceItems,
  normalizeListUserInput,
  normalizeLightUserInput,
  canonicalizeComparableText,
  stripChoiceInstructionNoise,
  tokenizeWords,
  isMaterialRewriteCandidate,
  shouldTreatAsStepContributingInput,
  pickDualChoiceSuggestion,
  areEquivalentWordingVariants,
  normalizeEntityPhrase,
  withProvisionalValue,
  renderFreeTextTurnPolicy,
  applyUiPhaseByStep,
  isUiWordingFeedbackKeyedV1Enabled,
  bumpUiI18nCounter: (telemetry, key, amount) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters,
      amount
    ),
  wordingSelectionMessage,
});

const {
  mergeListItems,
  sanitizePendingListMessage,
  copyPendingWordingChoiceState,
  pickWordingAgentBase,
  isRefineAdjustRouteToken,
  isWordingPickRouteToken,
  applyWordingPickSelection,
  buildWordingChoiceFromPendingSpecialist,
} = wordingHelpers;

export const isWordingChoiceEligibleStep = wordingHelpers.isWordingChoiceEligibleStep;
export const isWordingChoiceEligibleContext = wordingHelpers.isWordingChoiceEligibleContext;
export const isListChoiceScope = wordingHelpers.isListChoiceScope;
export const stripUnsupportedReformulationClaims = wordingHelpers.stripUnsupportedReformulationClaims;
export const buildWordingChoiceFromTurn = wordingHelpers.buildWordingChoiceFromTurn;
export {
  isMaterialRewriteCandidate,
  areEquivalentWordingVariants,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
};

const resolveActionCodeMenuTransition = uiPayloadHelpers.resolveActionCodeMenuTransition;

const SPECIALIST_INSTRUCTION_BLOCKS = {
  languageLockInstruction: LANGUAGE_LOCK_INSTRUCTION,
  recapInstruction: RECAP_INSTRUCTION,
  universalMetaOfftopicPolicy: UNIVERSAL_META_OFFTOPIC_POLICY,
  userIntentContractInstruction: USER_INTENT_CONTRACT_INSTRUCTION,
  metaTopicContractInstruction: META_TOPIC_CONTRACT_INSTRUCTION,
  offtopicFlagContractInstruction: OFFTOPIC_FLAG_CONTRACT_INSTRUCTION,
};

const stateUpdateHelpers = createRunStepStateUpdateHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  purposeStepId: PURPOSE_STEP_ID,
  bigwhyStepId: BIGWHY_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  targetgroupStepId: TARGETGROUP_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  presentationStepId: PRESENTATION_STEP_ID,
  dreamSpecialist: DREAM_SPECIALIST,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  withProvisionalValue,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  setDreamRuntimeMode,
  getDreamRuntimeMode,
});

const { applyPostSpecialistStateMutations } = stateUpdateHelpers;
const applyStateUpdate = stateUpdateHelpers.applyStateUpdate;

const callSpecialistStrict = createCallSpecialistStrict({
  instructionBlocks: SPECIALIST_INSTRUCTION_BLOCKS,
  buildSpecialistContextBlock,
  langFromState,
  getDreamRuntimeMode,
});

const hasUsableSpecialistForRetry = (specialist: unknown): boolean =>
  hasUsableSpecialistForRetryDispatch(specialist, pickPrompt);

const buildTransientFallbackSpecialist = createBuildTransientFallbackSpecialist({
  step0CardDescForState,
  step0QuestionForState,
  pickPrompt,
  renderFreeTextTurnPolicy,
});

const buildRateLimitErrorPayload = createBuildRateLimitErrorPayload({
  resolveHolisticPolicyFlags,
  buildTransientFallbackSpecialist,
  attachRegistryPayload,
  uiStringFromStateMap,
  uiDefaultString,
});

const buildTimeoutErrorPayload = createBuildTimeoutErrorPayload({
  resolveHolisticPolicyFlags,
  buildTransientFallbackSpecialist,
  attachRegistryPayload,
  uiStringFromStateMap,
  uiDefaultString,
});

const callSpecialistStrictSafeDispatch = createCallSpecialistStrictSafe({
  callSpecialistStrict,
  shouldLogLocalDevDiagnostics,
  buildRateLimitErrorPayload,
  buildTimeoutErrorPayload,
});

async function callSpecialistStrictSafe(
  params: { model: string; state: CanvasState; decision: OrchestratorOutput; userMessage: string },
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState
): Promise<{
  ok: true;
  value: { specialistResult: Record<string, unknown>; attempts: number; usage: LLMUsage; model: string };
} | { ok: false; payload: RunStepError }> {
  const result = await callSpecialistStrictSafeDispatch(params, routing, stateForError);
  if (!result.ok) {
    return { ok: false as const, payload: result.payload as unknown as RunStepError };
  }
  return {
    ok: true as const,
    value: {
      ...result.value,
      specialistResult: parseSpecialistOutputById(
        String(params.decision.specialist_to_call || ""),
        result.value.specialistResult
      ),
    },
  };
}

const runStepPreflightHelpers = createRunStepPreflightHelpers({
  step0Id: STEP_0_ID,
  currentStateVersion: CURRENT_STATE_VERSION,
  actionBootstrapPollToken: ACTION_BOOTSTRAP_POLL_TOKEN,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  detectLegacySessionMarkers,
  detectInvalidContractStateMarkers,
  syncDreamRuntimeMode,
  isPristineStateForStart,
  extractUserMessageFromWrappedInput,
  looksLikeMetaInstruction,
  maybeSeedStep0CandidateFromInitialMessage,
  bumpUiI18nCounter: (telemetry, key) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters
    ),
});

/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT:
 * - Pre-start UI owns the welcome text.
 * - Start calls this tool with empty user_message; we respond with Step 0 question without calling the specialist.
 */
type RunStepBase = {
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: Record<string, unknown>;
  registry_version: string;
  ui?: {
    action_codes?: string[];
    expected_choice_count?: number;
    actions?: RenderedAction[];
    questionText?: string;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
    wording_choice?: WordingChoiceUiPayload;
  };
  presentation_assets?: {
    pdf_url: string;
    png_url: string;
    base_name: string;
  };
  state: CanvasState;
  debug?: Record<string, unknown>;
};
type RunStepSuccess = RunStepBase & { ok: true };
type RunStepError = RunStepBase & { ok: false; error: Record<string, unknown> };

export async function run_step(rawArgs: unknown): Promise<RunStepSuccess | RunStepError> {
  const ingressParsed = parseRunStepIngressArgs(rawArgs, { defaultStepId: STEP_0_ID });
  const incomingLanguageSourceRaw = ingressParsed.incomingLanguageSourceRaw;
  if (!ingressParsed.ok) {
    return {
      ok: false,
      tool: "run_step",
      current_step_id: ingressParsed.currentStep,
      active_specialist: String((ingressParsed.blockedState as Record<string, unknown>).active_specialist || ""),
      text: "",
      prompt: "",
      specialist: {},
      registry_version: ACTIONCODE_REGISTRY.version,
      state: ingressParsed.blockedState,
      error: {
        type: "invalid_state",
        message: "Input validation error for run_step.",
        required_action: "restart_session",
        details: ingressParsed.issues,
      },
    };
  }
  const args: RunStepArgs = ingressParsed.args;
  const inputMode = args.input_mode || "chat";
  const localeHint = normalizeLocaleHint(String(args.locale_hint ?? ""));
  const localeHintSourceRaw = String(args.locale_hint_source ?? "none").trim();
  const localeHintSource =
  localeHintSourceRaw === "openai_locale" ||
  localeHintSourceRaw === "webplus_i18n" ||
  localeHintSourceRaw === "request_header" ||
  localeHintSourceRaw === "message_detect"
    ? localeHintSourceRaw
    : "none";
  // Runtime contract marker: BSC_WORDING_CHOICE_V2 remains the single-path runtime flag.
  const policyFlags = resolveHolisticPolicyFlags();
  const wordingChoiceEnabled = policyFlags.wordingChoiceV2;
  const motivationQuotesEnabled = policyFlags.motivationQuotesV11;
  if (process.env.ACTIONCODE_LOG_INPUT_MODE === "1") {
    const incomingLanguageSourceNormalized = normalizeStateLanguageSource((args.state as Record<string, unknown>)?.language_source);
    console.log("[run_step] input_mode", {
      inputMode,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      incoming_language_source_raw: incomingLanguageSourceRaw,
      incoming_language_source_normalized: incomingLanguageSourceNormalized,
    });
  }
  const decideOrchestration = (routeState: CanvasState, routeUserMessage: string): OrchestratorOutput => {
    const event = deriveTransitionEventFromLegacy({ state: routeState, userMessage: routeUserMessage });
    return orchestrateFromTransition({
      state: routeState,
      userMessage: routeUserMessage,
      event,
    });
  };

  const baselineModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
  const model = baselineModel;
  const modelRoutingEnabled = envFlagEnabled("BSC_MODEL_ROUTING_V1", false);
  const modelRoutingShadow = envFlagEnabled("BSC_MODEL_ROUTING_SHADOW", true);
  const tokenLoggingEnabled = envFlagEnabled("BSC_TOKEN_LOGGING_V1", process.env.LOCAL_DEV === "1");
  const llmTurnAccumulator = createTurnLlmAccumulator();
  const uiI18nTelemetry: UiI18nTelemetryCounters = {
    legacy_i18n_migration_count: 0,
    ui_strings_missing_keys: 0,
    translation_fallbacks: 0,
    translation_missing_keys: 0,
    translation_html_violations: 0,
    locale_hint_used_count: 0,
    locale_hint_missing_count: 0,
    language_source_overridden_count: 0,
    ui_strings_pending_count: 0,
    parity_errors: 0,
    parity_recovered: 0,
    confirm_gate_blocked_count: 0,
    step0_escape_ready_recovered_count: 0,
    wording_body_sanitized_count: 0,
    semantic_prompt_missing_count: 0,
    semantic_confirm_blocked_count: 0,
    state_hygiene_resets_count: 0,
    wording_feedback_fallback_count: 0,
  };
  let migrationApplied = false;
  let migrationFromVersion = "";
  let blockingMarkerClass = "none";

  const rememberLlmCall = (value: { attempts: number; usage: LLMUsage; model: string }) => {
    registerTurnLlmCall(llmTurnAccumulator, {
      attempts: value.attempts,
      usage: normalizeUsage(value.usage),
      model: value.model,
    });
  };

  const preflight = runStepPreflightHelpers.initializeRunStepPreflight({
    args,
    localeHint,
    localeHintSource,
    inputMode,
    uiI18nTelemetry,
  });
  migrationApplied = preflight.migrationApplied;
  migrationFromVersion = preflight.migrationFromVersion;
  let state = preflight.state;
  let rawLegacyMarkers = preflight.rawLegacyMarkers;
  const transientTextSubmit = preflight.transientTextSubmit;
  const transientPendingScores = preflight.transientPendingScores;
  const isBootstrapPollCall = preflight.isBootstrapPollCall;
  const pristineAtEntry = preflight.pristineAtEntry;
  const rawNormalized = preflight.rawNormalized;
  const lastSpecialistResult =
    (preflight.lastSpecialistResult as Record<string, unknown> | null | undefined) || {};
  let actionCodeRaw = preflight.actionCodeRaw;
  let userMessage = preflight.userMessage;
  let submittedUserText = preflight.submittedUserText;
  let clickedLabelForNoRepeat = preflight.clickedLabelForNoRepeat;
  let clickedActionCodeForNoRepeat = preflight.clickedActionCodeForNoRepeat;
  let languageResolvedThisTurn = false;
  const finalizeLayer = createRunStepRuntimeFinalizeLayer<RunStepSuccess | RunStepError>({
    routing: {
      baselineModel,
      modelRoutingEnabled,
      modelRoutingShadow,
      getState: () => state,
      getActionCodeRaw: () => actionCodeRaw,
      deriveIntentTypeForRouting: runStepPreflightHelpers.deriveIntentTypeForRouting,
      resolveModelForCall,
      shouldLogLocalDevDiagnostics,
      isUiTranslationFastModelV1Enabled,
    },
    i18n: {
      localeHint,
      localeHintSource,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      isBootstrapPollCall,
      uiI18nTelemetry,
      isUiI18nV3LangBootstrapEnabled,
      isUiStartTriggerLangResolveV1Enabled,
      isInteractiveLocaleReady,
      normalizeLangCode,
      ensureUiStringsForState,
      resolveLanguageForTurn,
      isLanguageResolvedThisTurn: () => languageResolvedThisTurn,
    },
    response: {
      tokenLoggingEnabled,
      baselineModel,
      parseMenuFromContractIdForStep,
      labelKeysForMenuActionCodes,
      onUiParityError: () => bumpUiI18nCounter(uiI18nTelemetry, "parity_errors"),
      attachRegistryPayload: (payload, specialist, flagsOverride, actionCodesOverride, renderedActionsOverride, wordingChoiceOverride, contractMetaOverride) =>
        attachRegistryPayload(
          payload,
          specialist,
          flagsOverride,
          actionCodesOverride,
          renderedActionsOverride,
          wordingChoiceOverride,
          contractMetaOverride
        ) as RunStepSuccess | RunStepError,
      uiI18nTelemetry,
      getMigrationApplied: () => migrationApplied,
      getMigrationFromVersion: () => migrationFromVersion,
      getBlockingMarkerClass: () => blockingMarkerClass,
      resolveTurnTokenUsage: () => ({
        usage: turnUsageFromAccumulator(llmTurnAccumulator),
        attempts: llmTurnAccumulator.attempts,
        models: [...llmTurnAccumulator.models.values()],
      }),
      getDreamRuntimeMode,
      getDreamStepId: () => DREAM_STEP_ID,
      getDreamExplainerSpecialist: () => DREAM_EXPLAINER_SPECIALIST,
      buildTextForWidget,
      pickPrompt,
      renderFreeTextTurnPolicy,
      validateRenderedContractOrRecover,
      applyUiPhaseByStep,
    },
  });

  const preflightLayer = await runStepRuntimePreflightLayer<RunStepSuccess | RunStepError>({
    ports: runStepPreflightHelpers,
    runtime: {
      state,
      rawLegacyMarkers,
      isBootstrapPollCall,
      actionCodeRaw,
      userMessage,
      submittedUserText,
      clickedLabelForNoRepeat,
      clickedActionCodeForNoRepeat,
      transientTextSubmit,
    },
    constants: {
      step0Id: STEP_0_ID,
      step0Specialist: STEP_0_SPECIALIST,
      localeHint,
      localeHintSource,
      inputMode: inputMode === "widget" ? "widget" : "chat",
    },
    finalize: {
      isUiLocaleReadyGateV1Enabled,
      resolveLocaleAndUiStringsReady: finalizeLayer.resolveLocaleAndUiStringsReady,
      ensureUiStrings: finalizeLayer.ensureUiStrings,
      finalizeResponse: finalizeLayer.finalizeResponse,
      attachRegistryPayload: (payload, specialist, flagsOverride) =>
        attachRegistryPayload(payload, specialist, flagsOverride) as RunStepSuccess | RunStepError,
    },
    behavior: {
      hasUsableSpecialistForRetry,
      buildTransientFallbackSpecialist,
      deriveBootstrapContract,
      buildTextForWidget,
      pickPrompt,
      buildFailClosedState,
      inferCurrentMenuForStep,
      labelForActionInMenu,
    },
    language: {
      normalizeLangCode,
      normalizeLanguageSource,
      isUiStep0LangResetGuardV1Enabled,
    },
  });
  if (preflightLayer.response) return preflightLayer.response as RunStepSuccess | RunStepError;

  state = preflightLayer.state;
  actionCodeRaw = preflightLayer.actionCodeRaw;
  userMessage = preflightLayer.userMessage;
  submittedUserText = preflightLayer.submittedUserText;
  clickedLabelForNoRepeat = preflightLayer.clickedLabelForNoRepeat;
  clickedActionCodeForNoRepeat = preflightLayer.clickedActionCodeForNoRepeat;
  blockingMarkerClass = preflightLayer.blockingMarkerClass;

  const actionRoutingLayer = await runStepRuntimeActionRoutingLayer<RunStepSuccess | RunStepError>({
    runtime: {
      state,
      userMessage,
      actionCodeRaw,
      lastSpecialistResult,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      wordingChoiceEnabled,
      uiI18nTelemetry,
    },
    ids: {
      step0Id: STEP_0_ID,
      dreamStepId: DREAM_STEP_ID,
      purposeStepId: PURPOSE_STEP_ID,
      bigwhyStepId: BIGWHY_STEP_ID,
      roleStepId: ROLE_STEP_ID,
      entityStepId: ENTITY_STEP_ID,
      strategyStepId: STRATEGY_STEP_ID,
      targetgroupStepId: TARGETGROUP_STEP_ID,
      productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
      rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
      presentationStepId: PRESENTATION_STEP_ID,
      dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
    },
    action: {
      nextMenuByActionCode: NEXT_MENU_BY_ACTIONCODE as unknown as Record<string, unknown>,
      dreamStartExerciseActionCodes: DREAM_START_EXERCISE_ACTION_CODES,
      resolveActionCodeTransition,
      inferCurrentMenuForStep,
      setUiRenderModeByStep,
      applyUiPhaseByStep,
      buildContractId,
      processActionCode,
      setDreamRuntimeMode,
      getDreamRuntimeMode,
    },
    state: {
      provisionalValueForStep,
      clearProvisionalValue,
      clearStepInteractiveState,
      isUiStateHygieneSwitchV1Enabled,
      isClearlyGeneralOfftopicInput,
      bumpUiI18nCounter: (telemetry, key) =>
        bumpUiI18nCounter(
          telemetry as UiI18nTelemetryCounters | null | undefined,
          key as keyof UiI18nTelemetryCounters
        ),
    },
    wording: {
      isWordingChoiceEligibleContext,
      buildWordingChoiceFromPendingSpecialist,
      applyWordingPickSelection,
      isWordingPickRouteToken,
      isRefineAdjustRouteToken,
      buildWordingChoiceFromTurn,
      pickWordingAgentBase,
      copyPendingWordingChoiceState,
    },
    behavior: {
      ensureUiStrings: finalizeLayer.ensureUiStrings,
      normalizeNonStep0OfftopicSpecialist,
      buildTextForWidget,
      pickPrompt,
      uiStringFromStateMap,
      uiDefaultString,
      finalizeResponse: finalizeLayer.finalizeResponse,
      attachRegistryPayload: (payload, specialist, flagsOverride, actionCodesOverride, renderedActionsOverride, wordingChoiceOverride, contractMetaOverride) =>
        attachRegistryPayload(
          payload,
          specialist,
          flagsOverride,
          actionCodesOverride,
          renderedActionsOverride,
          wordingChoiceOverride,
          contractMetaOverride
        ) as RunStepSuccess | RunStepError,
      resolveResponseUiFlags: (routeToken) => ACTIONCODE_REGISTRY.ui_flags[routeToken] || null,
    },
  });
  if (actionRoutingLayer.response) return actionRoutingLayer.response as RunStepSuccess | RunStepError;

  state = actionRoutingLayer.state;
  userMessage = actionRoutingLayer.userMessage;
  const responseUiFlags = actionRoutingLayer.responseUiFlags;

  state = await finalizeLayer.ensureLanguage(state, userMessage);
  languageResolvedThisTurn = true;
  const lang = langFromState(state);
  const uiI18nCounterPort = (telemetry: unknown, key: string) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters
    );
  const pipelinePorts: RunStepPipelinePorts<RunStepSuccess | RunStepError> = {
    ids: { step0Id: STEP_0_ID, dreamStepId: DREAM_STEP_ID, bigwhyStepId: BIGWHY_STEP_ID, strategyStepId: STRATEGY_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, strategySpecialist: STRATEGY_SPECIALIST, dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID },
    policy: { dreamForceRefineRoutePrefix: DREAM_FORCE_REFINE_ROUTE_PREFIX, strategyConsolidateRouteToken: STRATEGY_CONSOLIDATE_ROUTE_TOKEN, bigwhyMaxWords: actionRoutingLayer.bigwhyMaxWords, uiContractVersion: UI_CONTRACT_VERSION },
    specialist: { buildRoutingContext: finalizeLayer.buildRoutingContext, callSpecialistStrictSafe },
    normalization: { normalizeEntitySpecialistResult, applyCentralMetaTopicRouter, normalizeNonStep0OfftopicSpecialist, normalizeStep0AskDisplayContract, hasValidStep0Final },
    state: { applyPostSpecialistStateMutations, getDreamRuntimeMode, isMetaOfftopicFallbackTurn, shouldTreatAsStepContributingInput, hasDreamSpecialistCandidate, buildDreamRefineFallbackSpecialist, strategyStatementsForConsolidateGuard, pickBigWhyCandidate: actionRoutingLayer.pickBigWhyCandidate, countWords: actionRoutingLayer.countWords, buildBigWhyTooLongFeedback: actionRoutingLayer.buildBigWhyTooLongFeedback, enforceDreamBuilderQuestionProgress, applyMotivationQuotesContractV11 },
    render: { renderFreeTextTurnPolicy, validateRenderedContractOrRecover, applyUiPhaseByStep, buildContractId },
    wording: { isWordingChoiceEligibleContext, buildWordingChoiceFromTurn, buildWordingChoiceFromPendingSpecialist },
    response: {
      attachRegistryPayload: (payload, specialist, flagsOverride, actionCodesOverride, renderedActionsOverride, wordingChoiceOverride, contractMetaOverride) =>
        attachRegistryPayload(
          payload,
          specialist,
          flagsOverride,
          actionCodesOverride,
          renderedActionsOverride,
          wordingChoiceOverride,
          contractMetaOverride
        ) as RunStepSuccess | RunStepError,
      turnResponseEngine: finalizeLayer.turnResponseEngine,
    },
    guard: { looksLikeMetaInstruction },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };

  const routePorts: RunStepRoutePorts<RunStepSuccess | RunStepError> = {
    ids: { step0Id: STEP_0_ID, step0Specialist: STEP_0_SPECIALIST, dreamStepId: DREAM_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, roleStepId: ROLE_STEP_ID, roleSpecialist: ROLE_SPECIALIST, presentationStepId: PRESENTATION_STEP_ID, presentationSpecialist: PRESENTATION_SPECIALIST },
    tokens: { dreamPickOneRouteToken: DREAM_PICK_ONE_ROUTE_TOKEN, roleChooseForMeRouteToken: ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN, presentationMakeRouteToken: PRESENTATION_MAKE_ROUTE_TOKEN, switchToSelfDreamToken: SWITCH_TO_SELF_DREAM_TOKEN, dreamStartExerciseRouteToken: DREAM_START_EXERCISE_ROUTE_TOKEN },
    wording: { wordingSelectionMessage, pickPrompt, buildTextForWidget },
    state: { applyStateUpdate, setDreamRuntimeMode, getDreamRuntimeMode, isUiStateHygieneSwitchV1Enabled, clearStepInteractiveState },
    contracts: { renderFreeTextTurnPolicy, validateRenderedContractOrRecover, applyUiPhaseByStep, ensureUiStrings: finalizeLayer.ensureUiStrings, buildContractId },
    step0: { ensureStartState: finalizeLayer.ensureStartState, parseStep0Final, step0ReadinessQuestion, step0CardDescForState, step0QuestionForState },
    presentation: { hasPresentationTemplate, generatePresentationPptx, convertPptxToPdf, convertPdfToPng, cleanupOldPresentationFiles, baseUrlFromEnv, uiStringFromStateMap, uiDefaultString },
    specialist: { callSpecialistStrictSafe, buildRoutingContext: finalizeLayer.buildRoutingContext, rememberLlmCall },
    response: { attachRegistryPayload, finalizeResponse: finalizeLayer.finalizeResponse, turnResponseEngine: finalizeLayer.turnResponseEngine },
    suggestions: { pickDreamSuggestionFromPreviousState, pickDreamCandidateFromState, pickRoleSuggestionFromPreviousState },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };

  const specialRoutesLayer = await runStepRuntimeSpecialRoutesLayer<RunStepSuccess | RunStepError>({
    runtime: {
      state,
      userMessage,
      actionCodeRaw,
      responseUiFlags,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      wordingChoiceEnabled,
      languageResolvedThisTurn,
      isBootstrapPollCall,
      motivationQuotesEnabled,
      uiI18nTelemetry,
      transientPendingScores: transientPendingScores as number[][] | null,
      submittedUserText,
      rawNormalized,
      pristineAtEntry,
      lang,
      model,
    },
    specialist: { decideOrchestration, rememberLlmCall },
    routePorts,
  });
  if (specialRoutesLayer.response) return specialRoutesLayer.response as RunStepSuccess | RunStepError;

  return runStepRuntimePostPipelineLayer<RunStepSuccess | RunStepError>({
    context: specialRoutesLayer.context,
    pipelinePorts,
  });
}
