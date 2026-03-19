import type { OrchestratorOutput } from "../core/orchestrator.js";
import { getFinalFieldForStepId, type CanvasState } from "../core/state.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";
import {
  applyStepStuckSupportAfterSpecialist,
  currentStepStuckCount,
  currentStepSupportMode,
  readStepSupportState,
  resolveSpecialistSupportFamily,
} from "../core/stuck_support.js";
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
import type { UiContractMeta, CompareUiPayload } from "./run_step_ui_payload.js";
import {
  asRecord,
  asStateRecord,
  isTrueFlag,
  readStringArray,
} from "./run_step_type_guards.js";
import { normalizePendingPickerSpecialistContract } from "./run_step_compare_picker_contract.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";
import {
  applyBusinessListTurnResolution,
  isBusinessListStep,
  readBusinessListReferenceItems,
  resolveBusinessListTurn,
  type BusinessListTurnResolution,
} from "./run_step_business_list_turn.js";
import { isSingleValueFeedbackStep } from "../core/feedback_policy.js";
import {
  isInteractiveSupportStep,
  supportsAutoSuggest,
} from "../steps/step_registry.js";
import { deriveStructuredSuggestionsContent } from "../core/structured_suggestions.js";
import {
  attachCompareRuntime,
  clearCompareRuntime,
  patchCompareRuntime,
  readCompareRuntime,
} from "./compare_runtime.js";
type RunPostSpecialistPipelineParams = RunStepPostSpecialistPipelineRequest;

type RunStepPipelineFlatPorts<TPayload> =
  & RunStepPipelinePorts<TPayload>["ids"]
  & RunStepPipelinePorts<TPayload>["policy"]
  & RunStepPipelinePorts<TPayload>["specialist"]
  & RunStepPipelinePorts<TPayload>["normalization"]
  & RunStepPipelinePorts<TPayload>["state"]
  & RunStepPipelinePorts<TPayload>["render"]
  & RunStepPipelinePorts<TPayload>["compare"]
  & RunStepPipelinePorts<TPayload>["response"]
  & RunStepPipelinePorts<TPayload>["guard"]
  & RunStepPipelinePorts<TPayload>["i18n"];

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
    ...ports.compare,
    ...ports.response,
    ...ports.guard,
    ...ports.i18n,
  };
}

function isNonContributingCompareIntent(intentRaw: string): boolean {
  const intent = String(intentRaw || "").trim();
  return (
    intent === "feedback_on_suggestion" ||
    intent === "reject_suggestion_explicit"
  );
}

type StructuredSuggestionRouteSpec = {
  stepId: string;
  menuId: string;
  routeToken: string;
  fieldName: string;
};

function resolveStructuredSuggestionRouteSpec(stepId: string, userMessage: string): StructuredSuggestionRouteSpec | null {
  const route = String(userMessage || "").trim();
  if (!route.startsWith("__ROUTE__")) return null;
  const specs: StructuredSuggestionRouteSpec[] = [
    { stepId: "dream", menuId: "DREAM_MENU_SUGGESTIONS", routeToken: "__ROUTE__DREAM_GIVE_SUGGESTIONS__", fieldName: "dream" },
    { stepId: "purpose", menuId: "PURPOSE_MENU_EXAMPLES", routeToken: "__ROUTE__PURPOSE_GIVE_EXAMPLES__", fieldName: "purpose" },
    { stepId: "bigwhy", menuId: "BIGWHY_MENU_FROM_GIVE", routeToken: "__ROUTE__BIGWHY_GIVE_EXAMPLE__", fieldName: "bigwhy" },
    { stepId: "role", menuId: "ROLE_MENU_EXAMPLES", routeToken: "__ROUTE__ROLE_GIVE_EXAMPLES__", fieldName: "role" },
    { stepId: "entity", menuId: "ENTITY_MENU_SUGGESTIONS", routeToken: "__ROUTE__ENTITY_FORMULATE__", fieldName: "entity" },
    { stepId: "entity", menuId: "ENTITY_MENU_SUGGESTIONS", routeToken: "__ROUTE__ENTITY_FORMULATE_FOR_ME__", fieldName: "entity" },
    { stepId: "strategy", menuId: "STRATEGY_MENU_EXAMPLES", routeToken: "__ROUTE__STRATEGY_GIVE_EXAMPLES__", fieldName: "strategy" },
  ];
  return specs.find((spec) => spec.stepId === stepId && route.startsWith(spec.routeToken)) || null;
}

function renderStructuredSuggestionsTranscript(content: {
  heading?: string;
  items: string[];
  outro?: string;
  item_style: "bullets" | "blocks";
}): string {
  const parts: string[] = [];
  if (content.heading) parts.push(String(content.heading || "").trim());
  if (content.item_style === "blocks") {
    parts.push(content.items.map((item) => String(item || "").trim()).filter(Boolean).join("\n\n"));
  } else {
    parts.push(
      content.items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .map((item) => `- ${item}`)
        .join("\n")
    );
  }
  if (content.outro) parts.push(String(content.outro || "").trim());
  return parts.filter(Boolean).join("\n\n").trim();
}

function parseDreamBuilderRewriteItems(rawValue: string): string[] {
  const raw = String(rawValue || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];
  const lines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;
  return raw
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
}

function canonicalizeDreamBuilderOverlapText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeDreamBuilderOverlapText(input: string): string[] {
  const comparable = canonicalizeDreamBuilderOverlapText(input);
  return comparable ? comparable.split(" ").filter(Boolean) : [];
}

function contentTokensForDreamBuilderOverlap(input: string): string[] {
  return Array.from(
    new Set(
      tokenizeDreamBuilderOverlapText(input).filter((token) => token.length >= 7)
    )
  );
}

function dreamBuilderTokenJaccard(left: string, right: string): number {
  const leftSet = new Set(tokenizeDreamBuilderOverlapText(left));
  const rightSet = new Set(tokenizeDreamBuilderOverlapText(right));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  const union = leftSet.size + rightSet.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function dreamBuilderContentCoverage(left: string, right: string): {
  overlapCount: number;
  coverage: number;
} {
  const leftSet = new Set(contentTokensForDreamBuilderOverlap(left));
  const rightSet = new Set(contentTokensForDreamBuilderOverlap(right));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return { overlapCount: 0, coverage: 0 };
  }
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  const coverage = overlap > 0 ? overlap / Math.min(leftSet.size, rightSet.size) : 0;
  return { overlapCount: overlap, coverage };
}

function dreamBuilderOverlapRepairScore(left: string, right: string): number {
  const leftComparable = canonicalizeDreamBuilderOverlapText(left);
  const rightComparable = canonicalizeDreamBuilderOverlapText(right);
  if (!leftComparable || !rightComparable) return 0;

  const tokenScore = dreamBuilderTokenJaccard(left, right);
  const containsScore =
    leftComparable.includes(rightComparable) || rightComparable.includes(leftComparable)
      ? 1
      : 0;
  const { overlapCount, coverage } = dreamBuilderContentCoverage(left, right);
  const semanticCoverage =
    overlapCount >= 3
      ? coverage
      : overlapCount >= 2 && coverage >= 0.95
        ? coverage
        : 0;
  return Math.max(tokenScore, containsScore, semanticCoverage);
}

function findDreamBuilderOverlapRepairPair(params: {
  previousStatements: string[];
  nextStatements: string[];
}): { existing: string; incoming: string } | null {
  const previousStatements = readStringArray(params.previousStatements);
  const nextStatements = readStringArray(params.nextStatements);
  if (previousStatements.length === 0 || nextStatements.length === 0) return null;
  const previousKeys = new Set(
    previousStatements
      .map((line) => canonicalizeDreamBuilderOverlapText(line))
      .filter(Boolean)
  );
  const deltaStatements = nextStatements.filter((line) => {
    const key = canonicalizeDreamBuilderOverlapText(line);
    return Boolean(key) && !previousKeys.has(key);
  });
  if (deltaStatements.length !== 1) return null;
  const incoming = deltaStatements[0];
  const incomingComparable = canonicalizeDreamBuilderOverlapText(incoming);
  if (!incomingComparable) return null;
  let bestExisting = "";
  let bestScore = 0;
  for (const existing of previousStatements) {
    const score = dreamBuilderOverlapRepairScore(existing, incoming);
    if (score > bestScore) {
      bestScore = score;
      bestExisting = existing;
    }
  }
  if (!bestExisting) return null;
  return bestScore >= 0.72 ? { existing: bestExisting, incoming } : null;
}

function findDreamBuilderOverlapRepairPairFromUserInput(params: {
  previousStatements: string[];
  userMessage: string;
}): { existing: string; incoming: string } | null {
  const previousStatements = readStringArray(params.previousStatements);
  const incoming = String(params.userMessage || "").replace(/\r/g, "\n").trim();
  if (previousStatements.length === 0 || !incoming) return null;

  const candidateParts = parseDreamBuilderRewriteItems(incoming);
  if (candidateParts.length === 0 || candidateParts.length > 2) return null;

  let bestExisting = "";
  let bestExistingScore = 0;
  for (let index = 0; index < previousStatements.length; index += 1) {
    const existing = previousStatements[index];
    const scores = [
      dreamBuilderOverlapRepairScore(existing, incoming),
      ...candidateParts.map((part) => dreamBuilderOverlapRepairScore(existing, part)),
    ];
    const score = Math.max(...scores);
    if (score > bestExistingScore) {
      bestExistingScore = score;
      bestExisting = existing;
    }
  }
  if (!bestExisting || bestExistingScore < 0.4) return null;

  return { existing: bestExisting, incoming };
}

function didDreamBuilderAppendExactlyOneStatement(params: {
  previousStatements: string[];
  nextStatements: string[];
}): boolean {
  const previousStatements = readStringArray(params.previousStatements);
  const nextStatements = readStringArray(params.nextStatements);
  if (previousStatements.length === 0 || nextStatements.length !== previousStatements.length + 1) {
    return false;
  }
  for (let index = 0; index < previousStatements.length; index += 1) {
    if (nextStatements[index] !== previousStatements[index]) return false;
  }
  return true;
}

type DreamBuilderScoringCluster = {
  theme: string;
  statement_indices: number[];
};

function hasValidDreamBuilderScoringContract(
  specialistResult: Record<string, unknown>,
  minimumStatements: number
): boolean {
  if (!isTrueFlag(specialistResult.scoring_phase)) return false;
  const statements = readStringArray(specialistResult.statements);
  if (statements.length < minimumStatements) return false;
  const clustersRaw = Array.isArray(specialistResult.clusters)
    ? (specialistResult.clusters as unknown[])
    : [];
  if (clustersRaw.length === 0) return false;
  return clustersRaw.every((cluster) => {
    const record = asRecord(cluster);
    const theme = String(record.theme || "").trim();
    const indices = Array.isArray(record.statement_indices)
      ? (record.statement_indices as unknown[])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
      : [];
    return Boolean(theme) && indices.length > 0;
  });
}

function buildFallbackDreamBuilderScoringClusters(
  statements: string[],
  categoryTemplate: string
): DreamBuilderScoringCluster[] {
  const safeStatements = readStringArray(statements);
  if (safeStatements.length === 0) return [];
  const clusterCount = Math.max(1, Math.ceil(safeStatements.length / 7));
  const baseSize = Math.floor(safeStatements.length / clusterCount);
  const remainder = safeStatements.length % clusterCount;
  const clusters: DreamBuilderScoringCluster[] = [];
  let cursor = 0;
  for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
    const size = baseSize + (clusterIndex < remainder ? 1 : 0);
    const statementIndices = Array.from({ length: size }, (_, offset) => cursor + offset);
    cursor += size;
    const theme = String(categoryTemplate || "Category {0}").replace("{0}", String(clusterIndex + 1)).trim();
    clusters.push({
      theme: theme || `Category ${clusterIndex + 1}`,
      statement_indices: statementIndices,
    });
  }
  return clusters.filter((cluster) => cluster.statement_indices.length > 0);
}

function buildFallbackDreamBuilderScoringSpecialist(params: {
  specialistResult: Record<string, unknown>;
  state: CanvasState;
  statements: string[];
}): Record<string, unknown> {
  const scoringMessage = resolveUiStringForState(
    params.state,
    "scoringIntro2",
    "Please score each statement from 1 to 10 based on how important it is for your Dream (1 = low, 10 = very important)."
  ).trim();
  const categoryTemplate = resolveUiStringForState(
    params.state,
    "scoring.categoryFallback",
    "Category {0}"
  ).trim();
  return {
    ...params.specialistResult,
    action: "ASK",
    message: scoringMessage || String(params.specialistResult.message || "").trim(),
    question: "",
    feedback_reason_text: "",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    statements: readStringArray(params.statements),
    scoring_phase: "true",
    clusters: buildFallbackDreamBuilderScoringClusters(params.statements, categoryTemplate),
  };
}

export function shouldForcePendingCompareFromIntent(params: {
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
  if (isNonContributingCompareIntent(params.submittedTextIntent)) return "system_generated";
  return "user_input";
}

export function resolveCompareSeedUserText(params: {
  submittedTextIntent: string;
  submittedTextAnchor: string;
  submittedUserText: string;
  userMessage: string;
  previousSpecialist: Record<string, unknown>;
}): string {
  const submittedIntent = String(params.submittedTextIntent || "").trim();
  const submittedAnchor = String(params.submittedTextAnchor || "").trim();
  const submittedCanSeedCompare =
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
    const previousCompare = readCompareRuntime(params.previousSpecialist);
    return String(
      previousCompare?.suggestion_text ||
      params.previousSpecialist.refined_formulation ||
      ""
    ).trim();
  }
  const submitted = String(params.submittedUserText || "").trim();
  if (submitted && submittedCanSeedCompare) return submitted;
  if (submitted && !submittedCanSeedCompare) return "";
  const raw = String(params.userMessage || "").trim();
  if (!raw) return "";
  if (!submittedCanSeedCompare) return "";
  if (raw.startsWith("ACTION_")) return "";
  if (raw.startsWith("__ROUTE__")) return "";
  return raw;
}

export function pickCurrentStepValueForFeedback(state: CanvasState, stepId: string): string {
  const provisional = String(
    ((state as Record<string, unknown>).provisional_by_step as Record<string, unknown> | undefined)?.[stepId] || ""
  ).trim();
  if (provisional) return provisional;
  const finalField = getFinalFieldForStepId(stepId);
  return finalField ? String((state as Record<string, unknown>)[finalField] || "").trim() : "";
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
  return isSingleValueFeedbackStep(stepId);
}

async function resolveEffectiveStepSupportState(params: {
  state: CanvasState;
  stepId: string;
  activeSpecialist: string;
  specialistResult: Record<string, unknown>;
  userMessage: string;
  actionCodeRaw?: string;
  model: string;
  language?: string;
  classifyStepStuckTurn?: (params: {
    model: string;
    stepId: string;
    userMessage: string;
    currentStepStuckCount?: number;
    currentStepSupportMode?: string;
    language?: string;
  }) => Promise<{ is_stuck: boolean }>;
}): Promise<"ok" | "stuck"> {
  const baseState = readStepSupportState(params.specialistResult);
  const stepId = String(params.stepId || "").trim();
  const userMessage = String(params.userMessage || "").trim();
  if (baseState === "stuck") return "stuck";
  if (!stepId || !userMessage || String(params.actionCodeRaw || "").trim()) return baseState;
  if (
    resolveSpecialistSupportFamily({
      stepId,
      activeSpecialist: params.activeSpecialist,
    }) !== "core_step"
  ) {
    return baseState;
  }
  if (!params.classifyStepStuckTurn) return baseState;
  const classification = await params.classifyStepStuckTurn({
    model: params.model,
    stepId,
    userMessage,
    currentStepStuckCount: currentStepStuckCount(params.state, stepId),
    currentStepSupportMode: currentStepSupportMode(params.state, stepId),
    language: params.language,
  });
  return classification?.is_stuck ? "stuck" : baseState;
}

export async function shouldTreatTurnAsCurrentValueFeedback(params: {
  state: CanvasState;
  stepId: string;
  userMessage: string;
  model: string;
  language?: string;
  dreamRuntimeModeRaw?: unknown;
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
  if (!isSingleValueFeedbackStep(stepId) || !userMessage || actionCodeRaw) return false;
  if (submittedTextIntent) return false;
  if (stepId === "dream") {
    const dreamRuntimeMode = String(params.dreamRuntimeModeRaw || "").trim();
    if (dreamRuntimeMode && dreamRuntimeMode !== "self") return false;
  }
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

function stateWithCurrentValueFeedbackContext(
  state: CanvasState,
  stepId: string,
  currentValue: string,
  feedbackText: string
): CanvasState {
  const last = {
    ...(((state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>),
  };
  return {
    ...state,
    last_specialist_result: patchCompareRuntime({
      ...last,
      feedback_mode: "refine_current",
      current_value_refinement_pending: "true",
      current_value_refinement_target_field: stepId,
      current_value_refinement_feedback_text: "",
      current_value_refinement_anchor_value: currentValue,
      refined_formulation: currentValue,
      [stepId]: currentValue,
    }, {
      pending_text_intent: "feedback_on_current_value",
      pending_text_anchor: "current_value",
      pending_text_seed_source: "current_value",
      pending_text_feedback_text: feedbackText,
      pending_text_presentation_mode: "",
    }),
  };
}

function withCurrentValueRefinementFields(params: {
  specialistResult: Record<string, unknown>;
  stepId: string;
  anchorValue: string;
}): Record<string, unknown> {
  const { specialistResult, stepId, anchorValue } = params;
  const targetValue =
    String((specialistResult as Record<string, unknown>)[stepId] || "").trim() ||
    String((specialistResult as Record<string, unknown>).refined_formulation || "").trim();
  return {
    ...clearPendingCompareFields(specialistResult),
    current_value_refinement_pending: "true",
    current_value_refinement_target_field: stepId,
    current_value_refinement_feedback_text: String((specialistResult as Record<string, unknown>).feedback_reason_text || "").trim(),
    current_value_refinement_anchor_value: anchorValue,
    feedback_mode: "refine_current",
    ...(targetValue ? { [stepId]: targetValue } : {}),
    ...(targetValue ? { refined_formulation: targetValue } : {}),
  };
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
  if (!supportsAutoSuggest(stepId) || !isInteractiveSupportStep(stepId)) {
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

function clearPendingCompareFields(specialistResult: Record<string, unknown>): Record<string, unknown> {
  return {
    ...clearCompareRuntime(specialistResult),
    feedback_mode: "none",
    current_value_refinement_pending: "false",
    current_value_refinement_target_field: "",
    current_value_refinement_feedback_text: "",
    current_value_refinement_anchor_value: "",
  };
}

function clearDreamBuilderLegacyCompareFields(specialistResult: Record<string, unknown>): Record<string, unknown> {
  return {
    ...specialistResult,
    ...clearPendingCompareFields(specialistResult),
  };
}

export function isCompareIntentEligible(specialistResult: Record<string, unknown>): boolean {
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
      message: resolveUiStringForState(params.state as Record<string, unknown>, "runtime.error.contract_violation"),
      reason: params.reason,
      extraError: {
        contract_id: params.rendered.contractId,
      },
    });
  }

  async function runPostSpecialistPipeline(context: RunStepContext): Promise<TPayload> {
    const params: RunPostSpecialistPipelineParams = toRunPostSpecialistPipelineRequest(context);

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
    const currentValueForFeedback = pickCurrentStepValueForFeedback(state, currentStepId);
    const currentValueFeedback = await shouldTreatTurnAsCurrentValueFeedback({
      state,
      stepId: currentStepId,
      userMessage,
      model: params.model,
      language: params.lang,
      dreamRuntimeModeRaw: deps.getDreamRuntimeMode(state),
      classifyAcceptedOutputUserTurn: deps.classifyAcceptedOutputUserTurn,
      actionCodeRaw: params.actionCodeRaw,
      submittedTextIntent,
    });
    if (currentValueFeedback) {
      submittedTextIntent = "feedback_on_current_value";
      submittedTextAnchor = "current_value";
      submittedUserText = userMessage;
    }
    const stateForSpecialist = currentValueFeedback
      ? stateWithCurrentValueFeedbackContext(state, currentStepId, currentValueForFeedback, userMessage)
      : state;
    const preclassifiedStepSupportState = await resolveEffectiveStepSupportState({
      state: stateForSpecialist,
      stepId: currentStepId,
      activeSpecialist: currentSpecialistAtTurnStart,
      specialistResult: {},
      userMessage,
      actionCodeRaw: params.actionCodeRaw,
      model: params.model,
      language: params.lang,
      classifyStepStuckTurn: deps.classifyStepStuckTurn,
    });
    const stateForSpecialistWithSupportContext =
      preclassifiedStepSupportState === "stuck"
        ? ({
            ...stateForSpecialist,
            __current_turn_step_support_state: "stuck",
          } as CanvasState)
        : stateForSpecialist;
    const businessListTurnResolution: BusinessListTurnResolution | null =
      isBusinessListStep(currentStepId) &&
      !String(params.actionCodeRaw || "").trim() &&
      String(userMessage || "").trim() !== ""
        ? resolveBusinessListTurn({
            stepId: currentStepId,
            userMessage,
            referenceItems: readBusinessListReferenceItems(stateForSpecialistWithSupportContext, currentStepId),
          })
        : null;
    const userMessageForSpecialist =
      businessListTurnResolution &&
      businessListTurnResolution.kind !== "add"
        ? businessListTurnResolution.routePrompt
        : userMessage;
    let decision1 = params.decideOrchestration(stateForSpecialistWithSupportContext, userMessage);
    const showSessionIntro = String(decision1.show_session_intro || "");

    const call1 = await deps.callSpecialistStrictSafe(
      {
        model: params.model,
        state: stateForSpecialistWithSupportContext,
        decision: decision1,
        userMessage: userMessageForSpecialist,
      },
      deps.buildRoutingContext(userMessageForSpecialist),
      stateForSpecialistWithSupportContext
    );
    if (!call1.ok) return finalizePipelinePayload(call1.payload);
    params.rememberLlmCall(call1.value);

    let attempts = call1.value.attempts;
    let specialistResult = asRecord(call1.value.specialistResult);
    let dreamBuilderOverlapRepairApplied = false;
    const stateRecord = asStateRecord(stateForSpecialist);
    if (
      businessListTurnResolution &&
      businessListTurnResolution.kind !== "add" &&
      String(decision1.current_step || "").trim() === currentStepId
    ) {
      specialistResult = applyBusinessListTurnResolution({
        stepId: currentStepId,
        resolution: businessListTurnResolution,
        specialistResult,
      });
      specialistResult.__business_list_turn_preclassified = "true";
    }

    let autoSuggestApplied = false;
    const shouldRunAutoSuggest =
      autoSuggestPlan.eligible &&
      isAutoSuggestIntentFromSpecialist(specialistResult) &&
      !isTrueFlag(specialistResult?.is_offtopic);

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

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      String(decision1.current_step || "") === deps.dreamStepId &&
      !isTrueFlag(specialistResult.is_offtopic) &&
      String(specialistResult.action || "").trim() === "REFINE"
    ) {
      const previousStatements = (() => {
        const canonical = readStringArray(stateRecord.dream_builder_statements);
        if (canonical.length > 0) return canonical;
        const previousSpecialist = asRecord(stateRecord.last_specialist_result);
        return readStringArray(previousSpecialist.statements);
      })();
      const overlapRepairPairFromUserInput = findDreamBuilderOverlapRepairPairFromUserInput({
        previousStatements,
        userMessage,
      });
      const expectedRewriteItems = parseDreamBuilderRewriteItems(String(userMessage || "").trim());
      const actualRewriteItems = parseDreamBuilderRewriteItems(
        String(specialistResult.refined_formulation || "").trim()
      );
      if (
        !overlapRepairPairFromUserInput &&
        !dreamBuilderOverlapRepairApplied &&
        expectedRewriteItems.length >= 2 &&
        actualRewriteItems.length > 0 &&
        actualRewriteItems.length < expectedRewriteItems.length
      ) {
        const repairInput = [
          deps.dreamExplainerMultiRewriteRepairRoutePrefix,
          `EXPECTED_COUNT: ${expectedRewriteItems.length}`,
          "USER_MESSAGE:",
          String(userMessage || "").trim(),
          "CURRENT_REWRITE:",
          String(specialistResult.refined_formulation || "").trim(),
        ]
          .filter(Boolean)
          .join("\n");
        const repairCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (repairCall.ok) {
          params.rememberLlmCall(repairCall.value);
          attempts = Math.max(attempts, repairCall.value.attempts);
          const repaired = asRecord(repairCall.value.specialistResult);
          const repairedItems = parseDreamBuilderRewriteItems(
            String(repaired.refined_formulation || "").trim()
          );
          if (
            String(repaired.action || "").trim() === "REFINE" &&
            repairedItems.length >= expectedRewriteItems.length
          ) {
            specialistResult = repaired;
          }
        }
      }
    }

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      String(decision1.current_step || "") === deps.dreamStepId &&
      !isTrueFlag(specialistResult.is_offtopic) &&
      !(readCompareRuntime(specialistResult)?.status === "pending") &&
      String(specialistResult.action || "").trim() === "ASK" &&
      !String(specialistResult.refined_formulation || "").trim()
    ) {
      const previousStatements = (() => {
        const canonical = readStringArray(stateRecord.dream_builder_statements);
        if (canonical.length > 0) return canonical;
        const previousSpecialist = asRecord(stateRecord.last_specialist_result);
        return readStringArray(previousSpecialist.statements);
      })();
      const nextStatements = readStringArray(specialistResult.statements);
      const overlapRepairPair =
        findDreamBuilderOverlapRepairPair({
          previousStatements,
          nextStatements,
        }) ||
        (
          didDreamBuilderAppendExactlyOneStatement({
            previousStatements,
            nextStatements,
          })
            ? findDreamBuilderOverlapRepairPairFromUserInput({
                previousStatements,
                userMessage,
              })
            : null
        );
      if (overlapRepairPair) {
        const repairInput = [
          deps.dreamExplainerOverlapRepairRoutePrefix,
          `EXISTING_STATEMENT: ${overlapRepairPair.existing}`,
          `NEW_STATEMENT: ${overlapRepairPair.incoming}`,
        ].join("\n");
        const overlapRepairCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (overlapRepairCall.ok) {
          params.rememberLlmCall(overlapRepairCall.value);
          attempts = Math.max(attempts, overlapRepairCall.value.attempts);
          specialistResult = {
            ...asRecord(overlapRepairCall.value.specialistResult),
            __dream_builder_overlap_existing_statement: overlapRepairPair.existing,
            __dream_builder_overlap_incoming_statement: overlapRepairPair.incoming,
          };
          dreamBuilderOverlapRepairApplied = true;
        }
      }
    }

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      String(decision1.current_step || "") === deps.dreamStepId &&
      !isTrueFlag(specialistResult.is_offtopic) &&
      !dreamBuilderOverlapRepairApplied &&
      !(readCompareRuntime(specialistResult)?.status === "pending") &&
      String(specialistResult.action || "").trim() === "REFINE" &&
      String(specialistResult.refined_formulation || "").trim()
    ) {
      const previousStatements = (() => {
        const canonical = readStringArray(stateRecord.dream_builder_statements);
        if (canonical.length > 0) return canonical;
        const previousSpecialist = asRecord(stateRecord.last_specialist_result);
        return readStringArray(previousSpecialist.statements);
      })();
      const unchangedStatements = (() => {
        const currentStatements = readStringArray(specialistResult.statements);
        return (
          currentStatements.length === previousStatements.length &&
          currentStatements.every((item, index) => item === previousStatements[index])
        );
      })();
      const overlapRepairPair = unchangedStatements
        ? findDreamBuilderOverlapRepairPairFromUserInput({
            previousStatements,
            userMessage,
          })
        : null;
      if (overlapRepairPair) {
        const repairInput = [
          deps.dreamExplainerOverlapRepairRoutePrefix,
          `EXISTING_STATEMENT: ${overlapRepairPair.existing}`,
          `NEW_STATEMENT: ${overlapRepairPair.incoming}`,
        ].join("\n");
        const overlapRepairCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (overlapRepairCall.ok) {
          params.rememberLlmCall(overlapRepairCall.value);
          attempts = Math.max(attempts, overlapRepairCall.value.attempts);
          specialistResult = {
            ...asRecord(overlapRepairCall.value.specialistResult),
            __dream_builder_overlap_existing_statement: overlapRepairPair.existing,
            __dream_builder_overlap_incoming_statement: overlapRepairPair.incoming,
          };
          dreamBuilderOverlapRepairApplied = true;
        }
      }
    }

    if (
      String(decision1.current_step || "") === deps.dreamStepId &&
      String(decision1.specialist_to_call || "") === deps.dreamSpecialist
    ) {
      const isOfftopic = isTrueFlag(specialistResult?.is_offtopic);
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
          const repairedOfftopic = isTrueFlag(repaired?.is_offtopic);
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
      const initialOfftopic = isTrueFlag(specialistResult?.is_offtopic);
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
    }

    const structuredSuggestionRouteSpec = resolveStructuredSuggestionRouteSpec(
      String(decision1.current_step || ""),
      userMessage
    );
    if (structuredSuggestionRouteSpec && !isTrueFlag(specialistResult?.is_offtopic)) {
      const normalizeStructuredSuggestionRouteResult = (candidateResult: Record<string, unknown>) => {
        const content = deriveStructuredSuggestionsContent({
          stepId: structuredSuggestionRouteSpec.stepId,
          menuId: structuredSuggestionRouteSpec.menuId,
          message: String(candidateResult.message || "").trim(),
          uiStrings:
            state && typeof (state as Record<string, unknown>).ui_strings === "object"
              ? ((state as Record<string, unknown>).ui_strings as Record<string, unknown>)
              : null,
          specialist: candidateResult,
        });
        if (!content || content.items.length !== 3) return null;
        return {
          ...candidateResult,
          message: renderStructuredSuggestionsTranscript(content),
          refined_formulation: "",
          feedback_reason_text: "",
          [structuredSuggestionRouteSpec.fieldName]: "",
          suggestion_intro: String(content.heading || "").trim(),
          suggestion_items: content.items,
          suggestion_outro: String(content.outro || "").trim(),
          suggestion_item_style: content.item_style,
        } as Record<string, unknown>;
      };

      let normalizedSuggestionRouteResult = normalizeStructuredSuggestionRouteResult(specialistResult);
      if (!normalizedSuggestionRouteResult) {
        const repairInput = [
          structuredSuggestionRouteSpec.routeToken,
          "STRUCTURED_SUGGESTIONS_CONTRACT",
          "- return action=\"ASK\"",
          "- keep suggestion_intro non-empty and route-standard",
          "- return exactly 3 suggestions in suggestion_items",
          "- keep suggestion_outro non-empty",
          "- keep refined_formulation=\"\"",
          `- keep ${structuredSuggestionRouteSpec.fieldName}=\"\"`,
          "- keep feedback_reason_text=\"\"",
        ].join("\n");
        const repairCall = await deps.callSpecialistStrictSafe(
          { model: params.model, state, decision: decision1, userMessage: repairInput },
          deps.buildRoutingContext(repairInput),
          state
        );
        if (!repairCall.ok) return finalizePipelinePayload(repairCall.payload);
        params.rememberLlmCall(repairCall.value);
        attempts = Math.max(attempts, repairCall.value.attempts);
        specialistResult = asRecord(repairCall.value.specialistResult);
        normalizedSuggestionRouteResult = normalizeStructuredSuggestionRouteResult(specialistResult);
      }
      if (normalizedSuggestionRouteResult) {
        specialistResult = normalizedSuggestionRouteResult;
      }
    }

    if (
      String(decision1.current_step || "") === deps.bigwhyStepId &&
      !structuredSuggestionRouteSpec
    ) {
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
    const isOfftopicTurnAfterFallback = isTrueFlag(specialistResult?.is_offtopic);
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
    if (submittedTextIntent === "feedback_on_current_value" && currentStepId) {
      specialistResult = withCurrentValueRefinementFields({
        specialistResult: asRecord(specialistResult),
        stepId: currentStepId,
        anchorValue: currentValueForFeedback,
      });
    }
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

    if (
      decision1.specialist_to_call === deps.dreamExplainerSpecialist &&
      String(decision1.current_step || "") === deps.dreamStepId &&
      !isTrueFlag(specialistResult.is_offtopic) &&
      String((specialistResult as Record<string, unknown>).__dream_builder_compare_pending || "").trim() !== "true" &&
      String((nextState as Record<string, unknown>).dream_awaiting_direction ?? "").trim() !== "true"
    ) {
      const canonicalDreamBuilderStatements = readStringArray((nextState as Record<string, unknown>).dream_builder_statements);
      if (
        canonicalDreamBuilderStatements.length >= 20 &&
        !hasValidDreamBuilderScoringContract(asRecord(specialistResult), 20)
      ) {
        const scoringRecoveryRoute = "__ROUTE__DREAM_EXPLAINER_CONTINUE__";
        const scoringRecoveryCall = await deps.callSpecialistStrictSafe(
          {
            model: params.model,
            state: nextState,
            decision: decision1,
            userMessage: scoringRecoveryRoute,
          },
          deps.buildRoutingContext(scoringRecoveryRoute),
          nextState
        );

        if (scoringRecoveryCall.ok) {
          params.rememberLlmCall(scoringRecoveryCall.value);
          attempts = Math.max(attempts, scoringRecoveryCall.value.attempts);
          specialistResult = asRecord(scoringRecoveryCall.value.specialistResult);
          nextState = deps.applyPostSpecialistStateMutations({
            prevState: nextState,
            decision: decision1,
            specialistResult,
            provisionalSource: provisionalSourceForMutation,
          });
        }

        if (
          !hasValidDreamBuilderScoringContract(asRecord(specialistResult), 20)
        ) {
          specialistResult = buildFallbackDreamBuilderScoringSpecialist({
            specialistResult: asRecord(specialistResult),
            state: nextState,
            statements: canonicalDreamBuilderStatements,
          });
          nextState = deps.applyPostSpecialistStateMutations({
            prevState: nextState,
            decision: decision1,
            specialistResult,
            provisionalSource: provisionalSourceForMutation,
          });
        }
      }
    }

    let effectiveStepSupportState = await resolveEffectiveStepSupportState({
      state: nextState,
      stepId: String(decision1.current_step || ""),
      activeSpecialist: String(nextState.active_specialist || decision1.specialist_to_call || ""),
      specialistResult,
      userMessage,
      actionCodeRaw: params.actionCodeRaw,
      model: params.model,
      language: params.lang,
      classifyStepStuckTurn: deps.classifyStepStuckTurn,
    });
    if (effectiveStepSupportState === "stuck" && readStepSupportState(specialistResult) !== "stuck") {
      const stuckRecoveryState = {
        ...stateForSpecialist,
        __current_turn_step_support_state: "stuck",
      } as CanvasState;
      const stuckRecoveryCall = await deps.callSpecialistStrictSafe(
        {
          model: params.model,
          state: stuckRecoveryState,
          decision: decision1,
          userMessage: userMessageForSpecialist,
        },
        deps.buildRoutingContext(userMessageForSpecialist),
        stuckRecoveryState
      );
      if (stuckRecoveryCall.ok) {
        params.rememberLlmCall(stuckRecoveryCall.value);
        attempts = Math.max(attempts, stuckRecoveryCall.value.attempts);
        const recoveredSpecialistResult = asRecord(stuckRecoveryCall.value.specialistResult);
        if (readStepSupportState(recoveredSpecialistResult) === "stuck") {
          specialistResult = recoveredSpecialistResult;
          nextState = deps.applyPostSpecialistStateMutations({
            prevState: state,
            decision: decision1,
            specialistResult,
            provisionalSource: provisionalSourceForMutation,
          });
        } else {
          effectiveStepSupportState = "ok";
        }
      } else {
        effectiveStepSupportState = "ok";
      }
    }
    if (effectiveStepSupportState === "stuck" && readStepSupportState(specialistResult) !== "stuck") {
      specialistResult = {
        ...asRecord(specialistResult),
        step_support_state: "stuck",
      };
      nextState = {
        ...nextState,
        last_specialist_result: specialistResult,
      };
    }

    applyStepStuckSupportAfterSpecialist({
      state: nextState,
      stepId: String(decision1.current_step || ""),
      activeSpecialist: String(nextState.active_specialist || decision1.specialist_to_call || ""),
      specialist: specialistResult,
      actionCodeRaw: params.actionCodeRaw,
    });

    if (autoSuggestApplied) {
      const isOfftopicAfterSuggest = isTrueFlag(specialistResult?.is_offtopic);
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
    let compareOverride: CompareUiPayload | null = null;
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
    let requireComparePick = false;

    const isDreamExplainerOfftopicTurn =
      String(asStateRecord(nextState).current_step || "") === deps.dreamStepId &&
      String(asStateRecord(nextState).active_specialist || "") === deps.dreamExplainerSpecialist &&
      isTrueFlag(specialistResult?.is_offtopic);
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
    const currentStepForCompare = String(asStateRecord(nextState).current_step || "");
    const currentSpecialistForCompare = String(asStateRecord(nextState).active_specialist || "");
    const previousSpecialistForCompare = asRecord(asStateRecord(state).last_specialist_result);
    const dreamRuntimeModeForCompare = deps.getDreamRuntimeMode(nextState);
    const dreamBuilderFlowActiveForCompare =
      currentStepForCompare === deps.dreamStepId && dreamRuntimeModeForCompare !== "self";
    const suppressCompareForAutoSuggest = autoSuggestApplied;
    const isCurrentTurnOfftopic = isTrueFlag(specialistResult?.is_offtopic);
    const eligibleForCompareTurn = deps.isCompareEligibleContext(
      currentStepForCompare,
      currentSpecialistForCompare,
      asRecord(specialistResult),
      asRecord(asStateRecord(state).last_specialist_result),
      dreamRuntimeModeForCompare
    );
    const userTextForCompare = resolveCompareSeedUserText({
      submittedTextIntent,
      submittedTextAnchor,
      submittedUserText,
      userMessage,
      previousSpecialist: previousSpecialistForCompare,
    });
    const forcePendingCompare = shouldForcePendingCompareFromIntent({
      submittedTextIntent,
      submittedTextAnchor,
    });
    const wordingIntentEligible = isCompareIntentEligible(asRecord(specialistResult));
    const skipCompareForTurn =
      submittedTextIntent === "feedback_on_current_value" ||
      String((specialistResult as Record<string, unknown>).__dream_policy_skip_compare || "").trim() === "true" ||
      String((specialistResult as Record<string, unknown>).__business_list_turn_preclassified || "").trim() === "true";
    if (
      params.compareEnabled &&
      !suppressCompareForAutoSuggest &&
      params.inputMode === "widget" &&
      wordingIntentEligible &&
      eligibleForCompareTurn &&
      !isCurrentTurnOfftopic &&
      !skipCompareForTurn &&
      !(readCompareRuntime(specialistResult)?.status === "pending")
    ) {
      const acceptedOutputUserTurnClassification =
        !forcePendingCompare &&
        isAcceptedOutputSingleValueStep(currentStepForCompare) &&
        Boolean(String(userTextForCompare || "").trim())
          ? await deps.classifyAcceptedOutputUserTurn({
              model: params.model,
              stepId: currentStepForCompare,
              userMessage: userTextForCompare,
              currentAcceptedValue: pickCurrentAcceptedValueForStep(nextState, currentStepForCompare),
              pendingSuggestion: String((specialistResult as Record<string, unknown>).refined_formulation || "").trim(),
              language: params.lang,
            })
          : null;
      const rebuilt = deps.buildCompareFromTurn({
        stepId: currentStepForCompare,
        state: nextState,
        activeSpecialist: currentSpecialistForCompare,
        previousSpecialist: previousSpecialistForCompare,
        specialistResult,
        userTextRaw: userTextForCompare,
        isOfftopic: false,
        forcePending: forcePendingCompare,
        dreamRuntimeModeRaw: dreamRuntimeModeForCompare,
        submittedTextIntent,
        submittedTextAnchor,
        submittedFeedbackText: submittedUserText,
        acceptedOutputUserTurnClassification,
      });
      specialistResult = rebuilt.specialist;
      nextState = deps.applyPostSpecialistStateMutations({
        prevState: nextState,
        decision: finalDecision,
        specialistResult,
        provisionalSource: provisionalSourceForMutation,
      });
    }
    if (dreamBuilderFlowActiveForCompare) {
      specialistResult = clearDreamBuilderLegacyCompareFields(asRecord(specialistResult));
      compareOverride = null;
      requireComparePick = false;
    }
    asStateRecord(nextState).last_specialist_result = attachCompareRuntime(specialistResult);
    if (
      params.compareEnabled &&
      !dreamBuilderFlowActiveForCompare &&
      params.inputMode === "widget" &&
      !suppressCompareForAutoSuggest &&
      wordingIntentEligible
    ) {
      const pendingEligible = deps.isCompareEligibleContext(
        String(asStateRecord(nextState).current_step || ""),
        String(asStateRecord(nextState).active_specialist || ""),
        asRecord(specialistResult),
        previousSpecialistForCompare,
        dreamRuntimeModeForCompare
      );
      const pendingChoice = pendingEligible
        ? deps.buildCompareFromPendingSpecialist(
            specialistResult,
            nextState,
            String(asStateRecord(nextState).active_specialist || ""),
            previousSpecialistForCompare,
            String(asStateRecord(nextState).current_step || ""),
            dreamRuntimeModeForCompare
          )
        : null;
      if (pendingChoice?.enabled) {
        specialistResult = normalizePendingPickerSpecialistContract({
          specialist: asRecord(specialistResult),
          stepIdHint: String(asStateRecord(nextState).current_step || ""),
        });
        compareOverride = pendingChoice;
        requireComparePick = true;
        actionCodesOverride = [];
        renderedActionsOverride = [];
      } else if (readCompareRuntime(specialistResult)?.status === "pending") {
        const presentation = String(readCompareRuntime(specialistResult)?.presentation || "").trim();
        if (presentation !== "canonical") {
          specialistResult = clearPendingCompareFields(asRecord(specialistResult));
        }
      }
    } else if (dreamBuilderFlowActiveForCompare) {
      specialistResult = clearDreamBuilderLegacyCompareFields(asRecord(specialistResult));
      compareOverride = null;
      requireComparePick = false;
    } else if (readCompareRuntime(specialistResult)?.status === "pending") {
      specialistResult = clearPendingCompareFields(asRecord(specialistResult));
    }

    const canonicalDreamBuilderStatementsCount =
      readStringArray(asStateRecord(nextState).dream_builder_statements).length;
    specialistResult = deps.enforceDreamBuilderQuestionProgress(specialistResult, {
      currentStepId: String(asStateRecord(nextState).current_step || ""),
      activeSpecialist: String(asStateRecord(nextState).active_specialist || ""),
      canonicalStatementCount: canonicalDreamBuilderStatementsCount,
      comparePending:
        dreamBuilderFlowActiveForCompare
          ? String((specialistResult as Record<string, unknown>).__dream_builder_compare_pending || "").trim() === "true"
          : (
            requireComparePick ||
            Boolean(compareOverride?.enabled) ||
            readCompareRuntime(specialistResult as Record<string, unknown>)?.status === "pending"
          ),
      state: nextState,
    });
    // Motivational quote injection feature removed.
    specialistResult = attachCompareRuntime(specialistResult);
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
      ...(requireComparePick ? { require_compare_pick: true } : {}),
    };

    return deps.turnResponseEngine.attachAndFinalize({
      state: nextState,
      specialist: specialistResult,
      responseUiFlags: mergedFlags,
      actionCodesOverride,
      renderedActionsOverride,
      compareOverride,
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
