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
  type RenderedAction,
  resolveModelForCall,
  CURRENT_STATE_VERSION,
  getFinalsSnapshot,
  normalizeState,
  migrateState,
  normalizeStateLanguageSource,
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
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
import {
  createStructuredLogContextFromState,
  logStructuredEvent,
} from "./run_step_response.js";
import { parseSpecialistOutputById } from "./run_step_specialist_types.js";
import {
  parseStep0Final,
  hasValidStep0Final,
  maybeSeedStep0CandidateFromInitialMessage,
  inferStep0SeedFromInitialMessage,
} from "./run_step_step0.js";
import {
  tokenizeWords,
  normalizeLightUserInput,
  normalizeListUserInput,
  normalizeUserInputAgainstSuggestion,
  isMaterialRewriteCandidate,
  shouldTreatAsStepContributingInput,
  isClearlyGeneralOfftopicInput,
  parseListItems,
  splitSentenceItems,
  canonicalizeComparableText,
  areEquivalentWordingVariants,
  classifyPendingWordingChoiceTextIntent,
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
  isWordingChoiceIntentV1Enabled,
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
import { applyRulesRuntimePolicy } from "../steps/rulesofthegame_runtime_policy.js";
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
import { createRunStepRuntimeTextUiHelpers } from "./run_step_runtime_text_ui_helpers.js";
import { createRunStepRuntimeSemanticHelpers } from "./run_step_runtime_semantic_helpers.js";
import { createRunStepRuntimeSpecialistHelpers } from "./run_step_runtime_specialist_helpers.js";
import { runStepRuntimeExecute } from "./run_step_runtime_execute.js";
import { correctUserInputSurface } from "./run_step_surface_correction.js";
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
  uiDefaultString,
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

function logFromState(params: {
  severity: "info" | "warn" | "error";
  event: string;
  state: CanvasState | Record<string, unknown> | null | undefined;
  step_id?: string;
  contract_id?: string;
  details?: Record<string, unknown>;
}): void {
  const context = createStructuredLogContextFromState(
    (params.state || {}) as Record<string, unknown>,
    {
      ...(params.step_id ? { step_id: params.step_id } : {}),
      ...(params.contract_id ? { contract_id: params.contract_id } : {}),
    }
  );
  logStructuredEvent(
    params.severity,
    params.event,
    context,
    params.details || {}
  );
}

const runtimeActionHelpers = createRunStepRuntimeActionHelpers({
  step0Id: STEP_0_ID,
  actioncodeRegistry: ACTIONCODE_REGISTRY,
  onUnknownActionCode: ({ actionCode, currentStep, state }) => {
    logFromState({
      severity: "warn",
      event: "unknown_action_code",
      state,
      step_id: currentStep,
      details: {
        action_code: actionCode,
      },
    });
  },
});
const {
  processActionCode,
  deriveUiViewPayload,
  isConfirmActionCode,
  menuHasConfirmAction,
  firstConfirmActionCodeForMenu,
  firstGuidanceActionCodeForMenu,
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

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
  safe.wording_choice_list_semantics = "delta";
  safe.wording_choice_variant = "";
  safe.wording_choice_user_label = "";
  safe.wording_choice_suggestion_label = "";
  safe.feedback_reason_key = "";
  safe.feedback_reason_text = "";
  return safe;
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

const runStepRuntimeTextUiHelpers = createRunStepRuntimeTextUiHelpers({
  step0Id: STEP_0_ID,
  uiDefaultString,
  menuLabelDefaults: MENU_LABEL_DEFAULTS,
  menuLabelKeys: MENU_LABEL_KEYS,
  labelKeyForMenuAction,
  actioncodeRegistry: ACTIONCODE_REGISTRY,
  actionCodeToIntent,
  shouldSuppressFallbackText,
  isUiSemanticInvariantsV1Enabled,
});

const {
  uiStringFromStateMap,
  step0CardDescForState,
  step0QuestionForState,
  step0ReadinessQuestion,
  countNumberedOptions,
  labelKeysForMenuActionCodes,
  buildRenderedActionsFromMenu,
  buildQuestionTextFromActions,
  promptFallbackForInteractiveAsk,
  enforcePromptInvariants,
} = runStepRuntimeTextUiHelpers;

const runtimeTextHelpers = createRunStepRuntimeTextHelpers({
  dreamStepId: DREAM_STEP_ID,
  parseMenuFromContractIdForStep: (contractIdRaw, stepId) =>
    parseMenuFromContractIdForStep(contractIdRaw, stepId),
  canonicalizeComparableText,
  wordingSelectionMessage,
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

const presentationHelpers = createRunStepPresentationHelpers({
  uiDefaultString,
  uiStringFromStateMap,
});

const {
  generatePresentationAssets,
} = presentationHelpers;

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
      if (normalized.includes("do you mean something like this")) return false;
      if (normalized.includes("or do you mean something like this")) return false;
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

const runStepRuntimeSpecialistHelpers = createRunStepRuntimeSpecialistHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  uiStringFromStateMap,
  uiDefaultString,
  ensureSentenceEnd,
  resolveMotivationUserIntent,
  resolveSpecialistMetaTopic,
});

const {
  normalizeLocalizedConceptTerms,
  normalizeEntityPhrase,
  normalizeEntitySpecialistResult,
  enforceDreamBuilderQuestionProgress,
  isMetaOfftopicFallbackTurn,
} = runStepRuntimeSpecialistHelpers;

export {
  applyMotivationQuotesContractV11,
  applyCentralMetaTopicRouter,
  normalizeNonStep0OfftopicSpecialist,
};
export { isMetaOfftopicFallbackTurn };

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

const runStepRuntimeSemanticHelpers = createRunStepRuntimeSemanticHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
  dreamExplainerRefineMenuId: DREAM_EXPLAINER_REFINE_MENU_ID,
  actioncodeRegistry: ACTIONCODE_REGISTRY,
  defaultMenuByStatus: DEFAULT_MENU_BY_STATUS,
  finalFieldByStepId: FINAL_FIELD_BY_STEP_ID,
  getDreamRuntimeMode,
  parseMenuFromContractIdForStep,
  isConfirmActionCode,
  menuHasConfirmAction,
  inferUiRenderModeForStep,
  fieldForStep,
  provisionalValueForStep,
  provisionalSourceForStep,
  clearStepInteractiveState,
  renderFreeTextTurnPolicy,
  validateNonStep0OfftopicMessageShape,
  enforcePromptInvariants,
  promptFallbackForInteractiveAsk,
  uiStringFromStateMap,
  uiDefaultString,
  countNumberedOptions,
  isUiSemanticInvariantsV1Enabled,
  bumpUiI18nCounter: (telemetry, key) =>
    bumpUiI18nCounter(
      telemetry as UiI18nTelemetryCounters | null | undefined,
      key as keyof UiI18nTelemetryCounters
    ),
});

const { validateRenderedContractOrRecover } = runStepRuntimeSemanticHelpers;

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
  normalizeUserInputAgainstSuggestion,
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
  isWordingChoiceIntentV1Enabled,
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
  classifyPendingWordingChoiceTextIntent,
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
  parseListItems,
  applyRulesRuntimePolicy,
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
  logFromState,
});

const buildTimeoutErrorPayload = createBuildTimeoutErrorPayload({
  resolveHolisticPolicyFlags,
  buildTransientFallbackSpecialist,
  attachRegistryPayload,
  uiStringFromStateMap,
  uiDefaultString,
  logFromState,
});

const callSpecialistStrictSafeDispatch = createCallSpecialistStrictSafe({
  callSpecialistStrict,
  shouldLogLocalDevDiagnostics,
  buildRateLimitErrorPayload,
  buildTimeoutErrorPayload,
  logFromState,
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
  logStructuredEvent: logFromState,
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

const runStepRuntimeExecuteDeps = {
  parseRunStepIngressArgs, STEP_0_ID, ACTIONCODE_REGISTRY, normalizeState, normalizeLocaleHint,
  resolveHolisticPolicyFlags,
  normalizeStateLanguageSource, logStructuredEvent, createStructuredLogContextFromState,
  deriveTransitionEventFromLegacy, orchestrateFromTransition, envFlagEnabled, createTurnLlmAccumulator,
  registerTurnLlmCall, normalizeUsage, runStepPreflightHelpers, createRunStepRuntimeFinalizeLayer,
  resolveModelForCall, shouldLogLocalDevDiagnostics, isUiTranslationFastModelV1Enabled,
  isUiI18nV3LangBootstrapEnabled, isUiStartTriggerLangResolveV1Enabled, isInteractiveLocaleReady,
  normalizeLangCode, ensureUiStringsForState, resolveLanguageForTurn, parseMenuFromContractIdForStep,
  labelKeysForMenuActionCodes, bumpUiI18nCounter, turnUsageFromAccumulator, getDreamRuntimeMode,
  DREAM_STEP_ID, DREAM_EXPLAINER_SPECIALIST, buildTextForWidget, pickPrompt, renderFreeTextTurnPolicy,
  validateRenderedContractOrRecover, applyUiPhaseByStep, runStepRuntimePreflightLayer, STEP_0_SPECIALIST,
  isUiLocaleReadyGateV1Enabled, hasUsableSpecialistForRetry, buildTransientFallbackSpecialist,
  deriveBootstrapContract, buildFailClosedState, inferCurrentMenuForStep, labelForActionInMenu,
  normalizeLanguageSource, isUiStep0LangResetGuardV1Enabled, runStepRuntimeActionRoutingLayer,
  PURPOSE_STEP_ID, BIGWHY_STEP_ID, ROLE_STEP_ID, ENTITY_STEP_ID, STRATEGY_STEP_ID, TARGETGROUP_STEP_ID,
  PRODUCTSSERVICES_STEP_ID, RULESOFTHEGAME_STEP_ID, PRESENTATION_STEP_ID, DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
  NEXT_MENU_BY_ACTIONCODE, DREAM_START_EXERCISE_ACTION_CODES, resolveActionCodeTransition,
  setUiRenderModeByStep, buildContractId, processActionCode, firstConfirmActionCodeForMenu, firstGuidanceActionCodeForMenu, setDreamRuntimeMode, provisionalValueForStep,
  clearProvisionalValue, clearStepInteractiveState, isUiStateHygieneSwitchV1Enabled,
  isClearlyGeneralOfftopicInput, isWordingChoiceEligibleContext, buildWordingChoiceFromPendingSpecialist,
  applyWordingPickSelection, isWordingPickRouteToken, isRefineAdjustRouteToken, buildWordingChoiceFromTurn,
  pickWordingAgentBase, copyPendingWordingChoiceState, normalizeNonStep0OfftopicSpecialist,
  uiStringFromStateMap, uiDefaultString, attachRegistryPayload, langFromState, UI_CONTRACT_VERSION,
  DREAM_FORCE_REFINE_ROUTE_PREFIX, STRATEGY_CONSOLIDATE_ROUTE_TOKEN, DREAM_SPECIALIST, STRATEGY_SPECIALIST,
  callSpecialistStrictSafe, normalizeLocalizedConceptTerms, normalizeEntitySpecialistResult, applyCentralMetaTopicRouter,
  normalizeStep0AskDisplayContract, hasValidStep0Final, applyPostSpecialistStateMutations,
  isMetaOfftopicFallbackTurn, shouldTreatAsStepContributingInput, classifyPendingWordingChoiceTextIntent, hasDreamSpecialistCandidate,
  buildDreamRefineFallbackSpecialist, strategyStatementsForConsolidateGuard, enforceDreamBuilderQuestionProgress,
  applyMotivationQuotesContractV11, wordingSelectionMessage, applyStateUpdate, parseStep0Final,
  inferStep0SeedFromInitialMessage, step0ReadinessQuestion, step0CardDescForState, step0QuestionForState, generatePresentationAssets,
  pickDreamSuggestionFromPreviousState, pickDreamCandidateFromState, pickRoleSuggestionFromPreviousState,
  runStepRuntimeSpecialRoutesLayer, runStepRuntimePostPipelineLayer,
  looksLikeMetaInstruction, ROLE_SPECIALIST, PRESENTATION_SPECIALIST, DREAM_PICK_ONE_ROUTE_TOKEN,
  ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN, PRESENTATION_MAKE_ROUTE_TOKEN, SWITCH_TO_SELF_DREAM_TOKEN,
  DREAM_START_EXERCISE_ROUTE_TOKEN,
  correctUserInputSurface,
};

export async function run_step(rawArgs: unknown): Promise<RunStepSuccess | RunStepError> {
  return runStepRuntimeExecute(rawArgs, runStepRuntimeExecuteDeps);
}
