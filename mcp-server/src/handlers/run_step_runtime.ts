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
  createRunStepRouteHelpers,
  createRunStepStateUpdateHelpers,
  createRunStepPipelineHelpers,
  createRunStepPolicyMetaHelpers,
  createRunStepStep0DisplayHelpers,
  createRunStepPresentationHelpers,
  createRunStepPreflightHelpers,
  createTurnResponseEngine,
} from "./run_step_modules.js";
import {
  createRunStepI18nRuntimeHelpers,
  type UiI18nTelemetryCounters,
} from "./run_step_i18n_runtime.js";
import { createRunStepResponseHelpers } from "./run_step_response.js";
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
import type { RunStepContext } from "./run_step_context.js";
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

/**
 * Render order (strict):
 * message -> refined_formulation; if both empty, fallback to question.
 * Only append refined_formulation if it is not already contained in message (prevents duplicate display e.g. Rules REFINE).
 */
export function buildTextForWidget(params: {
  specialist: Record<string, unknown>;
  hasWidgetActions?: boolean;
  questionTextOverride?: string;
}): string {
  const { specialist } = params;
  const parts: string[] = [];

  const wordingPending = String(specialist?.wording_choice_pending || "") === "true";
  const wordingMode = String(specialist?.wording_choice_mode || "text") === "list" ? "list" : "text";
  const wordingSuggestion = String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim();
  const normalizeLine = (value: string): string =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "")
      .trim();
  const suggestionNorm = normalizeLine(wordingSuggestion);
  const contractId = String((specialist as Record<string, unknown>)?.ui_contract_id || "").trim();
  const contractStepId = contractId.split(":")[0] || "";
  const menuId = parseMenuFromContractIdForStep(contractId, contractStepId).toUpperCase();
  const statementLines = Array.isArray(specialist?.statements)
    ? (specialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const dreamBuilderRenderContext =
    statementLines.length > 0 &&
    contractStepId === DREAM_STEP_ID &&
    (
      String(specialist?.suggest_dreambuilder || "").trim() === "true" ||
      menuId.startsWith("DREAM_EXPLAINER_MENU_")
    );

  let msg = String(specialist?.message ?? "").trim();
  if (dreamBuilderRenderContext && msg) {
    const statementKeys = new Set(
      statementLines
        .map((line) => canonicalizeComparableText(String(line || "")))
        .filter(Boolean)
    );
    const stripMarkers = (line: string): string =>
      String(line || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "")
        .trim();
    const cleanedLines = msg
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((lineRaw) => {
        const line = String(lineRaw || "").trim();
        if (!line) return true;
        const stripped = stripMarkers(line);
        const lineKey = canonicalizeComparableText(stripped);
        if (lineKey && statementKeys.has(lineKey)) return false;
        if (/^your dream statements$/i.test(stripped)) return false;
        if (/^your current dream for\b.*\bis:?$/i.test(stripped)) return false;
        if (
          /^\d+\s+statements?\b/i.test(stripped) &&
          /(minimum|so far|out of|at least)/i.test(stripped)
        ) {
          return false;
        }
        const colonIdx = line.indexOf(":");
        if (colonIdx <= 0) return true;
        const prefix = stripMarkers(line.slice(0, colonIdx));
        const suffix = stripMarkers(line.slice(colonIdx + 1));
        const suffixKey = canonicalizeComparableText(suffix);
        if (!suffixKey || !statementKeys.has(suffixKey)) return true;
        return tokenizeWords(prefix).length > 8;
      });
    msg = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (wordingPending && wordingMode === "text" && suggestionNorm) {
    const paragraphs = msg
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const filtered = paragraphs.filter((p) => normalizeLine(p) !== suggestionNorm);
    msg = filtered.join("\n\n").trim();
  }
  if (wordingPending && wordingMode === "list" && msg) {
    const userItems = Array.isArray(specialist?.wording_choice_user_items)
      ? (specialist.wording_choice_user_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const suggestionItems = Array.isArray(specialist?.wording_choice_suggestion_items)
      ? (specialist.wording_choice_suggestion_items as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const knownItems = mergeListItems(userItems, suggestionItems);
    const fallbackItems = knownItems.length > 0 ? knownItems : splitSentenceItems(wordingSuggestion);
    msg = sanitizePendingListMessage(msg, fallbackItems);
  }
  if (wordingPending && isWordingPanelCleanBodyV1Enabled()) {
    msg = compactWordingPanelBody(msg);
  }
  const promptFromSpecialist = String(specialist?.question ?? "").trim();
  const promptOverride = String(params.questionTextOverride || "").trim();
  const prompt = promptOverride || promptFromSpecialist;
  let refined = String(specialist?.refined_formulation ?? "").trim();
  if (!wordingPending) {
    const field = fieldForStep(contractStepId);
    const fieldValue = field ? String((specialist as Record<string, unknown>)?.[field] || "").trim() : "";
    if (!fieldValue && !refined && statementLines.length === 0) {
      msg = stripUnsupportedReformulationClaims(msg);
    }
  }
  if (msg) msg = stripChoiceInstructionNoise(msg);
  if (msg && prompt) msg = stripPromptEchoFromMessage(msg, prompt);
  if (refined) {
    refined = stripChoiceInstructionNoise(refined);
    if (prompt) refined = stripPromptEchoFromMessage(refined, prompt);
  }
  const normalizeForDedupe = (value: string): string =>
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .replace(/^\s*(?:[-*•]|\d+[\).])\s*/gm, "")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  const normalizedLines = (value: string): string[] =>
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean)
      .map((line) => normalizeForDedupe(line))
      .filter(Boolean);
  if (msg) parts.push(msg);
  if (refined && !wordingPending) {
    const statementComparable = statementLines
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const refinedComparableLines = normalizedLines(refined)
      .map((line) => canonicalizeComparableText(line))
      .filter(Boolean);
    const refinedMatchesStatements =
      statementComparable.length > 0 &&
      refinedComparableLines.length === statementComparable.length &&
      refinedComparableLines.every((line, idx) => line === statementComparable[idx]);
    const refinedNormalized = canonicalizeComparableText(refined);
    const messageNormalized = canonicalizeComparableText(msg);
    const messageLineSet = new Set(normalizedLines(msg).map((line) => canonicalizeComparableText(line)).filter(Boolean));
    const refinedLineSet = normalizedLines(refined);
    const duplicateByWhole = Boolean(refinedNormalized) && messageNormalized.includes(refinedNormalized);
    const duplicateByLines =
      refinedLineSet.length > 0 &&
      refinedLineSet.every((line) => {
        const normalized = canonicalizeComparableText(line);
        return Boolean(normalized) && messageLineSet.has(normalized);
      });
    if (!(dreamBuilderRenderContext && refinedMatchesStatements) && !duplicateByWhole && !duplicateByLines) {
      parts.push(refined);
    }
  }
  return parts.join("\n\n").trim();
}

function stripChoiceInstructionNoise(value: string): string {
  const fullLineChoicePatterns = [
    /^(please\s+)?(choose|pick|select)\s+(one|an?)\s+option(s)?(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+between\s+\d+\s+and\s+\d+\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+an?\s+option(\s+below)?(\s+by\s+typing\s+\d+(?:\s*(?:or|\/|,|and)\s*\d+)*)?\.?$/i,
    /^choose\s+an?\s+option\s+by\s+typing\s+.+$/i,
    /^.+\s+or\s+choose\s+an?\s+option(s)?(\s+below)?\.?$/i,
    /^.+\s+or\s+choose\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
  ];
  const inlineNoisePatterns = [
    /\s*choose\s+an?\s+option\s+below\.?/gi,
    /\s*choose\s+an?\s+option\.?/gi,
    /\s*choose\s+one\s+of\s+the\s+options(\s+below)?\.?/gi,
    /\s*choose\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?/gi,
    /\s*choose\s+between\s+\d+\s+and\s+\d+\.?/gi,
    /\s*choose\s+an?\s+option\s+by\s+typing\s+\d+(?:\s*(?:or|\/|,|and)\s*\d+)*(?:,\s*or\s*write\s+your\s+own\s+statement)?\.?/gi,
  ];
  const lines = String(value || "").replace(/\r/g, "\n").split("\n");
  const transformed = lines.map((line) => {
    const normalized = String(line || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (fullLineChoicePatterns.some((pattern) => pattern.test(normalized))) return null;
    if (/\bor\s+choose\s+an?\s+option(s)?(\s+below)?\.?$/i.test(normalized)) return null;
    if (/\bor\s+choose\s+one\s+of\s+the\s+options(\s+below)?\.?$/i.test(normalized)) return null;
    let candidate = String(line || "");
    for (const pattern of inlineNoisePatterns) {
      candidate = candidate.replace(pattern, "");
    }
    return candidate
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  });
  const kept: string[] = [];
  for (const line of transformed) {
    if (line === null) continue;
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      if (kept.length === 0) continue;
      if (kept[kept.length - 1] === "") continue;
      kept.push("");
      continue;
    }
    kept.push(trimmed);
  }
  while (kept.length > 0 && kept[0] === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripPromptEchoFromMessage(messageRaw: string, promptRaw: string): string {
  const message = String(messageRaw || "").replace(/\r/g, "\n");
  const prompt = String(promptRaw || "").replace(/\r/g, "\n");
  if (!message.trim() || !prompt.trim()) return message.trim();

  const normalizeComparableLine = (lineRaw: string): string => {
    const plain = String(lineRaw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return canonicalizeComparableText(plain);
  };

  const optionLabels = new Set<string>();
  const promptLines = prompt
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  for (const line of promptLines) {
    const numbered = line.match(/^[1-9][\)\.]\s*(.+)$/);
    if (!numbered) continue;
    const label = normalizeComparableLine(String(numbered[1] || ""));
    if (label) optionLabels.add(label);
  }

  const promptTextLines = new Set<string>(
    promptLines
      .filter((line) => !/^[1-9][\)\.]\s*/.test(line))
      .map((line) => normalizeComparableLine(line))
      .filter(Boolean)
  );

  const stripped = message
    .split("\n")
    .map((line) => String(line || ""))
    .filter((lineRaw) => {
      const line = String(lineRaw || "").trim();
      if (!line) return true;
      const plainLine = String(lineRaw || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/[*_`~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const withoutNumbering = plainLine.replace(/^[1-9][\)\.]\s*/, "").trim();
      const normalized = normalizeComparableLine(withoutNumbering);
      if (!normalized) return true;
      if (optionLabels.has(normalized)) return false;
      if (promptTextLines.has(normalized)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return stripped;
}

export function pickPrompt(specialist: Record<string, unknown>): string {
  const q = String(specialist?.question ?? "").trim();
  return q || "";
}

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
  value: { specialistResult: unknown; attempts: number; usage: LLMUsage; model: string };
} | { ok: false; payload: RunStepError }> {
  const result = await callSpecialistStrictSafeDispatch(params, routing, stateForError);
  if (!result.ok) {
    return { ok: false as const, payload: result.payload as unknown as RunStepError };
  }
  return result;
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
  const userMessageCandidate = preflight.userMessageCandidate;
  const lastSpecialistResult = preflight.lastSpecialistResult;
  let actionCodeRaw = preflight.actionCodeRaw;
  const isActionCodeTurnForPolicy = preflight.isActionCodeTurnForPolicy;
  let userMessage = preflight.userMessage;
  let submittedUserText = preflight.submittedUserText;
  let clickedLabelForNoRepeat = preflight.clickedLabelForNoRepeat;
  let clickedActionCodeForNoRepeat = preflight.clickedActionCodeForNoRepeat;
  let languageResolvedThisTurn = false;

  const buildRoutingContext = (routeOrText: string) => {
    return {
      enabled: modelRoutingEnabled,
      shadow: modelRoutingShadow,
      actionCode: actionCodeRaw,
      intentType: runStepPreflightHelpers.deriveIntentTypeForRouting(actionCodeRaw, routeOrText),
    };
  };

  const resolveTranslationModel = (routeOrText: string): string => {
    const explicitTranslationModel = String(process.env.UI_TRANSLATION_MODEL || "").trim();
    if (explicitTranslationModel) return explicitTranslationModel;
    if (!isUiTranslationFastModelV1Enabled()) return baselineModel;
    const routing = buildRoutingContext(routeOrText);
    const decision = resolveModelForCall({
      fallbackModel: baselineModel,
      routingEnabled: routing.enabled,
      actionCode: routing.actionCode,
      intentType: routing.intentType,
      purpose: "translation",
    });
    if (
      !decision.applied &&
      routing.shadow &&
      (shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
      decision.candidate_model &&
      decision.candidate_model !== baselineModel
    ) {
      console.log("[model_routing_shadow]", {
        specialist: "UiStrings",
        current_step: String((state as Record<string, unknown>).current_step || ""),
        baseline_model: baselineModel,
        shadow_model: decision.candidate_model,
        source: decision.source,
        config_version: decision.config_version,
        request_id: String((state as Record<string, unknown>).__request_id ?? ""),
        client_action_id: String((state as Record<string, unknown>).__client_action_id ?? ""),
      });
    }
    if (decision.source === "translation_model" && String(decision.model || "").trim()) {
      return String(decision.model || "").trim();
    }
    const candidate = String(decision.candidate_model || "").trim();
    if (decision.applied && candidate) return candidate;
    return "gpt-4o-mini";
  };

  const applyUiClientActionContract = (targetState: CanvasState | null | undefined): void => {
    if (!targetState || typeof targetState !== "object") return;
    const stateRef = targetState as Record<string, unknown>;
    const currentStep = String(stateRef.current_step || "").trim();
    const activeSpecialist = String(stateRef.active_specialist || "").trim();
    const lastSpecialist =
      stateRef.last_specialist_result && typeof stateRef.last_specialist_result === "object"
        ? (stateRef.last_specialist_result as Record<string, unknown>)
        : {};
    const scoringPhase = String(lastSpecialist.scoring_phase || "").trim().toLowerCase() === "true";
    const dreamRuntimeMode = getDreamRuntimeMode(targetState);
    const textSubmitUsesScores =
      currentStep === DREAM_STEP_ID &&
      activeSpecialist === DREAM_EXPLAINER_SPECIALIST &&
      (dreamRuntimeMode === "builder_scoring" || scoringPhase);
    stateRef.ui_action_start = "ACTION_START";
    stateRef.ui_action_text_submit = textSubmitUsesScores
      ? "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES"
      : "ACTION_TEXT_SUBMIT";
    stateRef.ui_action_text_submit_payload_mode = textSubmitUsesScores ? "scores" : "text";
    stateRef.ui_action_wording_pick_user = "ACTION_WORDING_PICK_USER";
    stateRef.ui_action_wording_pick_suggestion = "ACTION_WORDING_PICK_SUGGESTION";
    stateRef.ui_action_dream_start_exercise = "ACTION_DREAM_INTRO_START_EXERCISE";
    stateRef.ui_action_dream_switch_to_self = "ACTION_DREAM_SWITCH_TO_SELF";
  };

  const { finalizeResponse } = createRunStepResponseHelpers({
    applyUiClientActionContract,
    parseMenuFromContractIdForStep,
    labelKeysForMenuActionCodes,
    onUiParityError: () => bumpUiI18nCounter(uiI18nTelemetry, "parity_errors"),
    attachRegistryPayload: (payload, specialist, flagsOverride) =>
      attachRegistryPayload(payload, specialist, flagsOverride),
    uiI18nTelemetry,
    tokenLoggingEnabled,
    baselineModel,
    getMigrationApplied: () => migrationApplied,
    getMigrationFromVersion: () => migrationFromVersion,
    getBlockingMarkerClass: () => blockingMarkerClass,
    resolveTurnTokenUsage: () => ({
      usage: turnUsageFromAccumulator(llmTurnAccumulator),
      attempts: llmTurnAccumulator.attempts,
      models: [...llmTurnAccumulator.models.values()],
    }),
  });
  const turnResponseEngine = createTurnResponseEngine<RunStepSuccess | RunStepError>({
    renderFreeTextTurnPolicy,
    validateRenderedContractOrRecover,
    applyUiPhaseByStep,
    buildTextForWidget: ({ specialist }) => buildTextForWidget({ specialist }),
    pickPrompt: (specialist) => pickPrompt(specialist),
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
    finalizeResponse: (payload) => finalizeResponse(payload),
  });

  const ensureUiStrings = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    return ensureUiStringsForState(targetState, translationModel, uiI18nTelemetry, {
      allowBackgroundFull: isBootstrapPollCall,
    });
  };

  const ensureLanguage = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    const allowBackgroundFull = isBootstrapPollCall || inputMode === "chat";
    if (!isUiI18nV3LangBootstrapEnabled()) {
      return ensureUiStringsForState(targetState, translationModel, uiI18nTelemetry, {
        allowBackgroundFull,
      });
    }
    return resolveLanguageForTurn(
      targetState,
      routeOrText,
      localeHint,
      localeHintSource,
      inputMode,
      translationModel,
      uiI18nTelemetry,
      { allowBackgroundFull }
    );
  };

  const resolveLocaleAndUiStringsReady = async (
    targetState: CanvasState,
    routeOrText: string
  ): Promise<{ state: CanvasState; interactiveReady: boolean }> => {
    const nextState = await ensureLanguage(targetState, routeOrText);
    return {
      state: nextState,
      interactiveReady: isInteractiveLocaleReady(nextState),
    };
  };

  const ensureStartState = async (
    targetState: CanvasState,
    routeOrText: string
  ): Promise<{ state: CanvasState; interactiveReady: boolean }> => {
    const hasResolvedLanguage = Boolean(normalizeLangCode(String((targetState as Record<string, unknown>).language || "")));
    if (languageResolvedThisTurn && hasResolvedLanguage) {
      return {
        state: targetState,
        interactiveReady: isInteractiveLocaleReady(targetState),
      };
    }
    if (!isUiStartTriggerLangResolveV1Enabled()) {
      const stateWithUi = await ensureUiStrings(targetState, routeOrText);
      return {
        state: stateWithUi,
        interactiveReady: isInteractiveLocaleReady(stateWithUi),
      };
    }
    return resolveLocaleAndUiStringsReady(targetState, routeOrText);
  };

  const bootstrapPreflight = await runStepPreflightHelpers.preprocessBootstrapPoll<RunStepSuccess | RunStepError>({
    state,
    isBootstrapPollCall,
    actionCodeRaw,
    userMessage,
    clickedLabelForNoRepeat,
    clickedActionCodeForNoRepeat,
    step0Specialist: STEP_0_SPECIALIST,
    isUiLocaleReadyGateV1Enabled,
    resolveLocaleAndUiStringsReady,
    hasUsableSpecialistForRetry,
    buildTransientFallbackSpecialist,
    deriveBootstrapContract,
    buildTextForWidget,
    pickPrompt,
    attachRegistryPayload: (payload, specialist, flagsOverride) =>
      attachRegistryPayload(payload, specialist, flagsOverride),
    finalizeResponse: (payload) => finalizeResponse(payload),
  });
  if (bootstrapPreflight.response) return bootstrapPreflight.response;
  state = bootstrapPreflight.state;
  actionCodeRaw = bootstrapPreflight.actionCodeRaw;
  userMessage = bootstrapPreflight.userMessage;
  clickedActionCodeForNoRepeat = bootstrapPreflight.clickedActionCodeForNoRepeat;
  clickedLabelForNoRepeat = bootstrapPreflight.clickedLabelForNoRepeat;

  const legacyPreflight = runStepPreflightHelpers.handleLegacyPreflight<RunStepSuccess | RunStepError>({
    state,
    rawLegacyMarkers,
    localeHint,
    buildFailClosedState,
    attachRegistryPayload: (payload, specialist, flagsOverride) =>
      attachRegistryPayload(payload, specialist, flagsOverride),
    finalizeResponse: (payload) => finalizeResponse(payload),
  });
  blockingMarkerClass = legacyPreflight.blockingMarkerClass;
  if (legacyPreflight.response) return legacyPreflight.response;

  const actionCodePreflight = runStepPreflightHelpers.applyActionCodeNormalization({
    state,
    actionCodeRaw,
    userMessage,
    submittedUserText,
    clickedLabelForNoRepeat,
    clickedActionCodeForNoRepeat,
    transientTextSubmit,
    inputMode,
    inferCurrentMenuForStep,
    labelForActionInMenu,
  });
  state = actionCodePreflight.state;
  actionCodeRaw = actionCodePreflight.actionCodeRaw;
  userMessage = actionCodePreflight.userMessage;
  submittedUserText = actionCodePreflight.submittedUserText;
  clickedActionCodeForNoRepeat = actionCodePreflight.clickedActionCodeForNoRepeat;
  clickedLabelForNoRepeat = actionCodePreflight.clickedLabelForNoRepeat;

  // If we're at Step 0 with no final yet and the user just typed real text,
  // reset stale language from previous sessions so language is determined
  // by this first message (not by old widget/browser state).
  const msgForLang = String(userMessage ?? "").trim();
  const isUserTextForLang =
    msgForLang &&
    !/^[0-9]+$/.test(msgForLang) &&
    !msgForLang.startsWith("ACTION_") &&
    !msgForLang.startsWith("__ROUTE__") &&
    !msgForLang.startsWith("choice:");
  if (
    String(state.current_step) === STEP_0_ID &&
    String((state as Record<string, unknown>).step_0_final ?? "").trim() === "" &&
    isUserTextForLang
  ) {
    const hasOverride = String((state as Record<string, unknown>).language_override ?? "false") === "true";
    const stateLanguage = normalizeLangCode(String((state as Record<string, unknown>).language ?? ""));
    const stateLanguageSource = normalizeLanguageSource((state as Record<string, unknown>).language_source);
    const localeHintTrustedSource =
      localeHintSource === "openai_locale" ||
      localeHintSource === "webplus_i18n" ||
      localeHintSource === "request_header" ||
      localeHintSource === "message_detect";
    const skipResetForChatLocaleHint =
      isUiStep0LangResetGuardV1Enabled() &&
      inputMode === "chat" &&
      Boolean(localeHint) &&
      (localeHintTrustedSource || stateLanguageSource === "locale_hint" || stateLanguage === localeHint);
    if (!hasOverride && !skipResetForChatLocaleHint) {
      (state as Record<string, unknown>).language = "";
      (state as Record<string, unknown>).language_locked = "false";
      (state as Record<string, unknown>).language_override = "false";
      (state as Record<string, unknown>).language_source = "";
    }
  }

  let forcedProceed = false;

  function pickFirstNonEmpty(...vals: Array<unknown>): string {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  const BIGWHY_MAX_WORDS = 28;

  function countWords(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function pickBigWhyCandidate(result: Record<string, unknown> | null | undefined): string {
    const fromFinal = typeof result?.bigwhy === "string" ? result.bigwhy.trim() : "";
    if (fromFinal) return fromFinal;
    const fromRefine = typeof result?.refined_formulation === "string" ? result.refined_formulation.trim() : "";
    return fromRefine;
  }

  function buildBigWhyTooLongFeedback(stateForText: CanvasState): Record<string, unknown> {
    const message = uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.message",
      uiDefaultString(
        "bigwhy.tooLong.message",
        "Your formulation is longer than 28 words. Short and clear is better, so please provide a compact version."
      )
    );
    const question = uiStringFromStateMap(
      stateForText,
      "bigwhy.tooLong.question",
      uiDefaultString("bigwhy.tooLong.question", "Can you rewrite it in 28 words or fewer?")
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
  }

  function requireFinalValue(
    stepId: string,
    prev: Record<string, unknown>,
    stateObj: CanvasState
  ): { field: string; value: string } {
    const provisional = provisionalValueForStep(stateObj, stepId);
    if (stepId === STEP_0_ID) {
      return { field: "step_0_final", value: pickFirstNonEmpty(provisional, prev.step_0, (stateObj as Record<string, unknown>).step_0_final) };
    }
    if (stepId === DREAM_STEP_ID) {
      return { field: "dream_final", value: pickFirstNonEmpty(provisional, prev.dream, prev.refined_formulation, (stateObj as Record<string, unknown>).dream_final) };
    }
    if (stepId === PURPOSE_STEP_ID) {
      return { field: "purpose_final", value: pickFirstNonEmpty(provisional, prev.purpose, prev.refined_formulation, (stateObj as Record<string, unknown>).purpose_final) };
    }
    if (stepId === BIGWHY_STEP_ID) {
      return { field: "bigwhy_final", value: pickFirstNonEmpty(provisional, prev.bigwhy, prev.refined_formulation, (stateObj as Record<string, unknown>).bigwhy_final) };
    }
    if (stepId === ROLE_STEP_ID) {
      return { field: "role_final", value: pickFirstNonEmpty(provisional, prev.role, prev.refined_formulation, (stateObj as Record<string, unknown>).role_final) };
    }
    if (stepId === ENTITY_STEP_ID) {
      return { field: "entity_final", value: pickFirstNonEmpty(provisional, prev.entity, prev.refined_formulation, (stateObj as Record<string, unknown>).entity_final) };
    }
    if (stepId === STRATEGY_STEP_ID) {
      return { field: "strategy_final", value: pickFirstNonEmpty(provisional, prev.strategy, prev.refined_formulation, (stateObj as Record<string, unknown>).strategy_final) };
    }
    if (stepId === TARGETGROUP_STEP_ID) {
      return { field: "targetgroup_final", value: pickFirstNonEmpty(provisional, prev.targetgroup, prev.refined_formulation, (stateObj as Record<string, unknown>).targetgroup_final) };
    }
    if (stepId === PRODUCTSSERVICES_STEP_ID) {
      return { field: "productsservices_final", value: pickFirstNonEmpty(provisional, prev.productsservices, prev.refined_formulation, (stateObj as Record<string, unknown>).productsservices_final) };
    }
    if (stepId === RULESOFTHEGAME_STEP_ID) {
      return { field: "rulesofthegame_final", value: pickFirstNonEmpty(provisional, prev.rulesofthegame, prev.refined_formulation, (stateObj as Record<string, unknown>).rulesofthegame_final) };
    }
    if (stepId === PRESENTATION_STEP_ID) {
      return { field: "presentation_brief_final", value: pickFirstNonEmpty(provisional, prev.presentation_brief, prev.refined_formulation, (stateObj as Record<string, unknown>).presentation_brief_final) };
    }
    return { field: "", value: "" };
  }

  const ACTIONCODE_STEP_TRANSITIONS: Record<string, string> = {
    ACTION_STEP0_READY_START: DREAM_STEP_ID,
    ACTION_DREAM_REFINE_CONFIRM: PURPOSE_STEP_ID,
    ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: PURPOSE_STEP_ID,
    ACTION_PURPOSE_REFINE_CONFIRM: BIGWHY_STEP_ID,
    ACTION_PURPOSE_CONFIRM_SINGLE: BIGWHY_STEP_ID,
    ACTION_BIGWHY_REFINE_CONFIRM: ROLE_STEP_ID,
    ACTION_ROLE_REFINE_CONFIRM: ENTITY_STEP_ID,
    ACTION_ENTITY_EXAMPLE_CONFIRM: STRATEGY_STEP_ID,
    ACTION_STRATEGY_CONFIRM_SATISFIED: TARGETGROUP_STEP_ID,
    ACTION_STRATEGY_FINAL_CONTINUE: TARGETGROUP_STEP_ID,
    ACTION_TARGETGROUP_POSTREFINE_CONFIRM: PRODUCTSSERVICES_STEP_ID,
    ACTION_PRODUCTSSERVICES_CONFIRM: RULESOFTHEGAME_STEP_ID,
    ACTION_RULES_CONFIRM_ALL: PRESENTATION_STEP_ID,
  };

  if (actionCodeRaw && ACTIONCODE_STEP_TRANSITIONS[actionCodeRaw]) {
    const stepId = String(state.current_step ?? "");
    const prev = ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    if (
      wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      isWordingChoiceEligibleContext(
        stepId,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        prev,
        getDreamRuntimeMode(state)
      )
    ) {
      const pendingSpecialist = { ...prev };
      const pendingChoice = buildWordingChoiceFromPendingSpecialist(
        pendingSpecialist,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        stepId,
        getDreamRuntimeMode(state)
      );
      const stateWithUi = await ensureUiStrings(state, userMessage);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
        text: buildTextForWidget({ specialist: pendingSpecialist }),
        prompt: pickPrompt(pendingSpecialist),
        specialist: pendingSpecialist,
        state: stateWithUi,
      }, pendingSpecialist, { require_wording_pick: true }, [], [], pendingChoice));
    }
    if (
      wordingChoiceEnabled &&
      String(prev.wording_choice_pending || "") === "true" &&
      !isWordingChoiceEligibleContext(
        stepId,
        String((state as Record<string, unknown>).active_specialist || ""),
        prev,
        prev,
        getDreamRuntimeMode(state)
      )
    ) {
      state = clearStepInteractiveState(state, stepId);
      bumpUiI18nCounter(uiI18nTelemetry, "state_hygiene_resets_count");
    }
    const finalInfo = requireFinalValue(stepId, prev, state);
    const sourceMenuForTransition = inferCurrentMenuForStep(state, stepId);
    const resolvedTransition = resolveActionCodeTransition(
      actionCodeRaw,
      stepId,
      sourceMenuForTransition
    );
    // If we cannot find a required value, fall back to regular actioncode routing.
    if (finalInfo.field && !finalInfo.value) {
    } else {
      if (finalInfo.field && finalInfo.value) {
        (state as Record<string, unknown>)[finalInfo.field] = finalInfo.value;
        state = isUiStateHygieneSwitchV1Enabled()
          ? clearStepInteractiveState(state, stepId)
          : clearProvisionalValue(state, stepId);
      }
      const nextStepForProceed = resolvedTransition?.targetStepId || String(ACTIONCODE_STEP_TRANSITIONS[actionCodeRaw] || stepId);
      (state as Record<string, unknown>).current_step = String(nextStepForProceed || stepId);
      if (resolvedTransition) {
        setUiRenderModeByStep(
          state,
          resolvedTransition.targetStepId,
          resolvedTransition.renderMode
        );
        applyUiPhaseByStep(
          state,
          resolvedTransition.targetStepId,
          buildContractId(
            resolvedTransition.targetStepId,
            "incomplete_output",
            resolvedTransition.renderMode === "no_buttons"
              ? "NO_MENU"
              : resolvedTransition.targetMenuId
          )
        );
      } else {
        setUiRenderModeByStep(state, String((state as Record<string, unknown>).current_step || stepId), "menu");
      }
      (state as Record<string, unknown>).active_specialist = "";
      (state as Record<string, unknown>).last_specialist_result = {};
      if (String((state as Record<string, unknown>).current_step || "") !== DREAM_STEP_ID) {
        setDreamRuntimeMode(state, "self");
      }
      userMessage = "";
      forcedProceed = true;
    }
  }
  // NEW SYSTEM: Check if message is an ActionCode (starts with "ACTION_")
  if (!forcedProceed && userMessage.startsWith("ACTION_")) {
    const actionCodeInput = userMessage;
    const safeActionCodeInput = String(actionCodeInput || "").trim().toUpperCase();
    const currentStepForMenuTransition = String(state.current_step || "").trim();
    const sourceMenuForTransition = inferCurrentMenuForStep(state, currentStepForMenuTransition);
    const transitionSpec = NEXT_MENU_BY_ACTIONCODE[safeActionCodeInput];
    const resolvedTransition = resolveActionCodeTransition(
      safeActionCodeInput,
      currentStepForMenuTransition,
      sourceMenuForTransition
    );
    if (transitionSpec && !resolvedTransition) {
      const specialistSnapshot = (lastSpecialistResult || {}) as Record<string, unknown>;
      return finalizeResponse(attachRegistryPayload({
        ok: false as const,
        tool: "run_step" as const,
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
      }, specialistSnapshot));
    }
    if (resolvedTransition) {
      setUiRenderModeByStep(
        state,
        resolvedTransition.targetStepId,
        resolvedTransition.renderMode
      );
      applyUiPhaseByStep(
        state,
        resolvedTransition.targetStepId,
        buildContractId(
          resolvedTransition.targetStepId,
          "incomplete_output",
          resolvedTransition.renderMode === "no_buttons"
            ? "NO_MENU"
            : resolvedTransition.targetMenuId
        )
      );
    }
    if (currentStepForMenuTransition === DREAM_STEP_ID) {
      if (DREAM_START_EXERCISE_ACTION_CODES.has(safeActionCodeInput)) {
        setDreamRuntimeMode(state, "builder_collect");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST") {
        setDreamRuntimeMode(state, "builder_refine");
      } else if (safeActionCodeInput === "ACTION_DREAM_SWITCH_TO_SELF") {
        setDreamRuntimeMode(state, "self");
      } else if (safeActionCodeInput === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
        setDreamRuntimeMode(state, "builder_scoring");
      }
    }
    const routed = processActionCode(actionCodeInput, state.current_step, state, lastSpecialistResult);
    if (inputMode === "widget" && routed === actionCodeInput) {
      const errorPayload = {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
        text: uiStringFromStateMap(
          state,
          "error.unknownAction",
          uiDefaultString("error.unknownAction", "We could not process this choice. Please refresh and try again.")
        ),
        prompt: "",
        specialist: lastSpecialistResult || {},
        state,
        error: {
          type: "unknown_actioncode",
          action_code: actionCodeInput,
          strict: true,
        },
      };
      return finalizeResponse(attachRegistryPayload(errorPayload, lastSpecialistResult));
    }
    userMessage = routed;
  }
  const pendingBeforeTurn = ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
  const isGeneralOfftopicInput = isClearlyGeneralOfftopicInput(userMessage);
  const shouldKeepPendingOnOfftopic =
    String(state.current_step || "") === DREAM_STEP_ID && isGeneralOfftopicInput;
  if (
    wordingChoiceEnabled &&
    inputMode === "widget" &&
    String(pendingBeforeTurn.wording_choice_pending || "") === "true" &&
    isWordingChoiceEligibleContext(
      String(state.current_step || ""),
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      pendingBeforeTurn,
      getDreamRuntimeMode(state)
    ) &&
    !isWordingPickRouteToken(userMessage) &&
    (!isGeneralOfftopicInput || shouldKeepPendingOnOfftopic)
  ) {
    const stateWithUi = await ensureUiStrings(state, userMessage);
    let pendingSpecialist = {
      ...pendingBeforeTurn,
      ...(isGeneralOfftopicInput ? { is_offtopic: true } : {}),
    };
    if (isGeneralOfftopicInput && String(state.current_step || "") !== STEP_0_ID) {
      pendingSpecialist = normalizeNonStep0OfftopicSpecialist({
        stepId: String(state.current_step || ""),
        activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
        userMessage,
        specialistResult: pendingSpecialist,
        previousSpecialist: pendingBeforeTurn,
        state: stateWithUi,
      });
      if (shouldKeepPendingOnOfftopic) {
        pendingSpecialist = copyPendingWordingChoiceState(pendingSpecialist, pendingBeforeTurn);
      }
    }
    const pendingChoice = buildWordingChoiceFromPendingSpecialist(
      pendingSpecialist,
      String((state as Record<string, unknown>).active_specialist || ""),
      pendingBeforeTurn,
      String(state.current_step || ""),
      getDreamRuntimeMode(state)
    );
    console.log("[wording_choice_pending_blocked]", {
      step: String(state.current_step || ""),
      request_id: String((state as Record<string, unknown>).__request_id ?? ""),
      client_action_id: String((state as Record<string, unknown>).__client_action_id ?? ""),
    });
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(state.current_step),
      active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
      text: buildTextForWidget({ specialist: pendingSpecialist }),
      prompt: pickPrompt(pendingSpecialist),
      specialist: pendingSpecialist,
      state: stateWithUi,
    }, pendingSpecialist, { require_wording_pick: true }, [], [], pendingChoice));
  }
  const wordingSelection = wordingChoiceEnabled
    ? applyWordingPickSelection({
      stepId: String(state.current_step ?? ""),
      routeToken: userMessage,
      state,
      telemetry: uiI18nTelemetry,
    })
    : ({
      handled: false,
      specialist: ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {},
      nextState: state,
    } as const);
  if (wordingSelection.handled) {
    const stateWithUi = await ensureUiStrings(wordingSelection.nextState, userMessage);
    return finalizeResponse(attachRegistryPayload({
      ok: true as const,
      tool: "run_step" as const,
      current_step_id: String(stateWithUi.current_step),
      active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
      text: buildTextForWidget({ specialist: wordingSelection.specialist }),
      prompt: pickPrompt(wordingSelection.specialist),
      specialist: wordingSelection.specialist,
      state: stateWithUi,
    }, wordingSelection.specialist));
  }
  const refineAdjustTurn = isRefineAdjustRouteToken(userMessage);
  if (refineAdjustTurn && wordingChoiceEnabled && inputMode === "widget") {
    const prev = ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    const rebuilt = buildWordingChoiceFromTurn({
      stepId: String(state.current_step || ""),
      activeSpecialist: String((state as Record<string, unknown>).active_specialist || ""),
      previousSpecialist: prev,
      specialistResult: prev,
      userTextRaw: String(prev.wording_choice_user_raw || prev.wording_choice_user_normalized || "").trim(),
      isOfftopic: false,
      forcePending: true,
    });
    if (rebuilt.wordingChoice) {
      const pendingSpecialist = {
        ...rebuilt.specialist,
      };
      (state as Record<string, unknown>).last_specialist_result = pendingSpecialist;
      const stateWithUi = await ensureUiStrings(state, userMessage);
      return finalizeResponse(attachRegistryPayload({
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(state.current_step),
        active_specialist: String((state as Record<string, unknown>).active_specialist || ""),
        text: buildTextForWidget({ specialist: pendingSpecialist }),
        prompt: pickPrompt(pendingSpecialist),
        specialist: pendingSpecialist,
        state: stateWithUi,
      }, pendingSpecialist, { require_wording_pick: true }, [], [], rebuilt.wordingChoice));
    }
  }
  if (refineAdjustTurn) {
    const prev = ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>) || {};
    const agentBase = pickWordingAgentBase(prev);
    if (agentBase) {
      const nextPrev = {
        ...prev,
        refined_formulation: agentBase,
        wording_choice_agent_current: agentBase,
      };
      (state as Record<string, unknown>).last_specialist_result = nextPrev;
    }
  }
  const responseUiFlags = ACTIONCODE_REGISTRY.ui_flags[userMessage] || null;
  // Backend fallback: if Start arrives with empty input, reuse the captured initial message so Step 0 can extract Venture + Name.
  const initialUserMessage = String((state as Record<string, unknown>).initial_user_message ?? "").trim();
  if (
    userMessage.trim() === "" &&
    initialUserMessage &&
    state.current_step === STEP_0_ID &&
    String((state as Record<string, unknown>).step_0_final ?? "").trim() === "" &&
    Object.keys((state as Record<string, unknown>).last_specialist_result ?? {}).length === 0
  ) {
    userMessage = initialUserMessage;
  }
  // Lock language once we see a meaningful user message (prevents mid-flow flips).
  state = await ensureLanguage(state, userMessage);
  languageResolvedThisTurn = true;
  const lang = langFromState(state);
  const uiI18nCounterPort = (telemetry: unknown, key: string) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters
    );
  const pipelinePorts: RunStepPipelinePorts<RunStepSuccess | RunStepError> = {
    ids: { step0Id: STEP_0_ID, dreamStepId: DREAM_STEP_ID, bigwhyStepId: BIGWHY_STEP_ID, strategyStepId: STRATEGY_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, strategySpecialist: STRATEGY_SPECIALIST, dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID },
    policy: { dreamForceRefineRoutePrefix: DREAM_FORCE_REFINE_ROUTE_PREFIX, strategyConsolidateRouteToken: STRATEGY_CONSOLIDATE_ROUTE_TOKEN, bigwhyMaxWords: BIGWHY_MAX_WORDS, uiContractVersion: UI_CONTRACT_VERSION },
    specialist: { buildRoutingContext, callSpecialistStrictSafe },
    normalization: { normalizeEntitySpecialistResult, applyCentralMetaTopicRouter, normalizeNonStep0OfftopicSpecialist, normalizeStep0AskDisplayContract, hasValidStep0Final },
    state: { applyPostSpecialistStateMutations, getDreamRuntimeMode, isMetaOfftopicFallbackTurn, shouldTreatAsStepContributingInput, hasDreamSpecialistCandidate, buildDreamRefineFallbackSpecialist, strategyStatementsForConsolidateGuard, pickBigWhyCandidate, countWords, buildBigWhyTooLongFeedback, enforceDreamBuilderQuestionProgress, applyMotivationQuotesContractV11 },
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
      turnResponseEngine,
    },
    guard: { looksLikeMetaInstruction },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };
  const pipelineHelpers = createRunStepPipelineHelpers<RunStepSuccess | RunStepError>(pipelinePorts);

  const routePorts: RunStepRoutePorts<RunStepSuccess | RunStepError> = {
    ids: { step0Id: STEP_0_ID, step0Specialist: STEP_0_SPECIALIST, dreamStepId: DREAM_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, roleStepId: ROLE_STEP_ID, roleSpecialist: ROLE_SPECIALIST, presentationStepId: PRESENTATION_STEP_ID, presentationSpecialist: PRESENTATION_SPECIALIST },
    tokens: { dreamPickOneRouteToken: DREAM_PICK_ONE_ROUTE_TOKEN, roleChooseForMeRouteToken: ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN, presentationMakeRouteToken: PRESENTATION_MAKE_ROUTE_TOKEN, switchToSelfDreamToken: SWITCH_TO_SELF_DREAM_TOKEN, dreamStartExerciseRouteToken: DREAM_START_EXERCISE_ROUTE_TOKEN },
    wording: { wordingSelectionMessage, pickPrompt, buildTextForWidget },
    state: { applyStateUpdate, setDreamRuntimeMode, getDreamRuntimeMode, isUiStateHygieneSwitchV1Enabled, clearStepInteractiveState },
    contracts: { renderFreeTextTurnPolicy, validateRenderedContractOrRecover, applyUiPhaseByStep, ensureUiStrings, buildContractId },
    step0: { ensureStartState, parseStep0Final, step0ReadinessQuestion, step0CardDescForState, step0QuestionForState },
    presentation: { hasPresentationTemplate, generatePresentationPptx, convertPptxToPdf, convertPdfToPng, cleanupOldPresentationFiles, baseUrlFromEnv, uiStringFromStateMap, uiDefaultString },
    specialist: { callSpecialistStrictSafe, buildRoutingContext, rememberLlmCall },
    response: { attachRegistryPayload, finalizeResponse },
    suggestions: { pickDreamSuggestionFromPreviousState, pickDreamCandidateFromState, pickRoleSuggestionFromPreviousState },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };
  const routeHelpers = createRunStepRouteHelpers<RunStepSuccess | RunStepError>(routePorts);

  const runStepContext: RunStepContext = {
    routing: {
      userMessage, actionCodeRaw, responseUiFlags, inputMode: inputMode === "widget" ? "widget" : "chat",
      wordingChoiceEnabled, languageResolvedThisTurn, isBootstrapPollCall, motivationQuotesEnabled,
    },
    rendering: { uiI18nTelemetry, lang, ensureUiStrings },
    state: { state, transientPendingScores: transientPendingScores as number[][] | null, submittedUserText, rawNormalized, pristineAtEntry },
    specialist: { model, decideOrchestration, rememberLlmCall },
  };

  const specialRouteResponse = await routeHelpers.handleSpecialRouteRegistry(runStepContext);
  if (specialRouteResponse) return specialRouteResponse;
  const pipelinePayload = await pipelineHelpers.runPostSpecialistPipeline(runStepContext);
  return pipelinePayload;
}
