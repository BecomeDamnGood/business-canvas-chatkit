import {
  clearPendingInteractionState,
  patchPendingInteractionState,
  readPendingInteractionState,
  type CanvasState,
  type PersistedPendingInteractionState,
  type ProvisionalSource,
} from "../core/state.js";
import { isSingleValueCompareStep } from "../steps/step_registry.js";
import {
  formatCompareFeedbackForDisplay,
  formatUserPickFeedbackForDisplay,
  isMeaningfulUserPickFeedbackText,
  sanitizeFeedbackReasonForDisplay,
  sanitizeUserPickFeedbackTextForDisplay,
  userPickAcknowledgmentForDisplay,
  userPickFeedbackReasonForDisplay,
} from "../core/feedback_display.js";
import type { TurnPolicyRenderResult } from "../core/turn_policy_renderer.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import type { CompareUiPayload, UiContractMeta } from "./run_step_ui_payload.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import type { PendingInteractionCompareRenderModel } from "./run_step_runtime_types.js";
import { resolveBusinessListTurn } from "./run_step_business_list_turn.js";
import {
  clearDreamBuilderCompareRuntime,
  readDreamBuilderCompareRuntime,
} from "./dream_builder_compare_runtime.js";

type CompareMode = "text" | "list";
type CompareListSemantics = "delta" | "full" | "overlap_merge";
type FeedbackMode = "none" | "affirm_input" | "compare_suggestion" | "refine_current";
type CompareCompareMode = "" | "grouped";
type CompareCompareResolution = "user" | "suggestion" | "";
type CompareCompareConfidence = "anchored" | "fallback";
type PendingSuggestionIntent =
  | "accept_suggestion_explicit"
  | "reject_suggestion_explicit"
  | "feedback_on_suggestion"
  | "content_input"
  | "";
type PendingSuggestionAnchor = "suggestion" | "user_input" | "";

type EquivalentCompareVariantsParams = {
  mode: CompareMode;
  userRaw: string;
  suggestionRaw: string;
  userItems: string[];
  suggestionItems: string[];
};

type BuildCompareFromTurnParams = {
  stepId: string;
  state: CanvasState;
  activeSpecialist: string;
  previousSpecialist: Record<string, unknown>;
  specialistResult: Record<string, unknown>;
  userTextRaw: string;
  isOfftopic: boolean;
  forcePending?: boolean;
  dreamRuntimeModeRaw?: unknown;
  submittedTextIntent?: string;
  submittedTextAnchor?: string;
  submittedFeedbackText?: string;
  acceptedOutputUserTurnClassification?: AcceptedOutputUserTurnClassification | null;
};

type ComparePickSelectionParams = {
  stepId: string;
  routeToken: string;
  state: CanvasState;
  telemetry?: unknown;
};

type ComparePickSelectionResult = {
  handled: boolean;
  specialist: Record<string, unknown>;
  nextState: CanvasState;
  actionCodes?: string[];
  renderedActions?: RenderedAction[];
  contractMeta?: UiContractMeta | null;
  continueUserMessage?: string;
};

type CompareCompareUnit = {
  id: string;
  user_items: string[];
  suggestion_items: string[];
  user_text: string;
  suggestion_text: string;
  feedback_reason_text?: string;
  resolution: CompareCompareResolution;
  confidence: CompareCompareConfidence;
};

type PendingInteractionUnitRender = NonNullable<PendingInteractionCompareRenderModel["units"]>[number];

type CompareCompareSegment =
  | {
      kind: "retained";
      items: string[];
    }
  | {
      kind: "unit";
      unit_id: string;
    };

type BusinessListComparePlan = {
  mode: "grouped";
  units: CompareCompareUnit[];
  segments: CompareCompareSegment[];
  initialUnit: CompareCompareUnit;
};

type RunStepCompareDeps = {
  step0Id: string;
  presentationStepId: string;
  dreamStepId: string;
  strategyStepId: string;
  productsservicesStepId: string;
  rulesofthegameStepId: string;
  entityStepId: string;
  dreamExplainerSpecialist: string;
  normalizeDreamRuntimeMode: (raw: unknown) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
  uiStringFromStateMap: (
    state: CanvasState | null | undefined,
    key: string,
    fallback: string
  ) => string;
  fieldForStep: (stepId: string) => string;
  parseListItems: (input: string) => string[];
  splitSentenceItems: (input: string) => string[];
  normalizeListUserInput: (input: string) => string;
  normalizeLightUserInput: (input: string) => string;
  normalizeUserInputAgainstSuggestion: (userRaw: string, suggestionRaw: string) => string;
  canonicalizeComparableText: (input: string) => string;
  stripChoiceInstructionNoise: (input: string) => string;
  tokenizeWords: (input: string) => string[];
  isMaterialRewriteCandidate: (userRaw: string, suggestionRaw: string) => boolean;
  pickDualChoiceSuggestion: (
    stepId: string,
    specialistResult: unknown,
    previousSpecialist: unknown,
    userRaw?: string,
    options?: {
      allowDreamBuilderSuggestionShape?: boolean;
    }
  ) => string;
  areEquivalentCompareVariants: (params: EquivalentCompareVariantsParams) => boolean;
  normalizeEntityPhrase: (input: string) => string;
  withProvisionalValue: (
    state: CanvasState,
    stepId: string,
    value: string,
    source: ProvisionalSource
  ) => CanvasState;
  renderFreeTextTurnPolicy: (params: {
    stepId: string;
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist: Record<string, unknown>;
  }) => TurnPolicyRenderResult;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  isUiCompareFeedbackKeyedV1Enabled: () => boolean;
  isCompareIntentV1Enabled: () => boolean;
  bumpUiI18nCounter: (telemetry: unknown, key: string, amount?: number) => void;
  compareSelectionMessage: (
    stepId: string,
    state: CanvasState,
    activeSpecialist?: string,
    selectedValue?: string
  ) => string;
};

const LIST_NO_CHANGE_SIGNAL =
  /\b(niets\s+meer|niet\s+meer|no\s+more|nothing\s+else|that(?:'| i)?s\s+all|dit\s+is\s+het|alleen\s+dit|meer\s+hebben\s+we\s+niet)\b/i;

function toTrimmedStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((line) => String(line || "").trim()).filter(Boolean);
}

function stripMarkupPreserveLines(input: string): string {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCompareResolution(raw: unknown): CompareCompareResolution {
  const value = String(raw || "").trim();
  if (value === "user" || value === "suggestion") return value;
  return "";
}

function normalizeCompareConfidence(raw: unknown): CompareCompareConfidence {
  return String(raw || "").trim() === "fallback" ? "fallback" : "anchored";
}

function normalizeCompareUnits(raw: unknown): CompareCompareUnit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index): CompareCompareUnit | null => {
      const record = entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
      const userItems = toTrimmedStringArray(record.user_items);
      const suggestionItems = toTrimmedStringArray(record.suggestion_items);
      const userText = stripMarkupPreserveLines(String(record.user_text || userItems.join("\n")));
      const suggestionText = stripMarkupPreserveLines(
        String(record.suggestion_text || suggestionItems.join("\n"))
      );
      if (!userText && !suggestionText && userItems.length === 0 && suggestionItems.length === 0) {
        return null;
      }
      return {
        id: String(record.id || `unit_${index + 1}`).trim() || `unit_${index + 1}`,
        user_items: userItems,
        suggestion_items: suggestionItems,
        user_text: userText,
        suggestion_text: suggestionText,
        feedback_reason_text: String(record.feedback_reason_text || "").trim(),
        resolution: normalizeCompareResolution(record.resolution),
        confidence: normalizeCompareConfidence(record.confidence),
      } satisfies CompareCompareUnit;
    })
    .filter((entry): entry is CompareCompareUnit => Boolean(entry));
}

function normalizeCompareSegments(raw: unknown): CompareCompareSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const record = entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
      const kind = String(record.kind || "").trim();
      if (kind === "retained") {
        const items = toTrimmedStringArray(record.items);
        return items.length > 0 ? ({ kind: "retained", items } as CompareCompareSegment) : null;
      }
      if (kind === "unit") {
        const unitId = String(record.unit_id || "").trim();
        return unitId ? ({ kind: "unit", unit_id: unitId } as CompareCompareSegment) : null;
      }
      return null;
    })
    .filter((entry): entry is CompareCompareSegment => Boolean(entry));
}

export function createRunStepCompareHelpers(deps: RunStepCompareDeps) {
  function canonicalHeadingComparable(value: string): string {
    const compact = String(value || "")
      .trim()
      .replace(/[.!?]+$/g, "")
      .replace(/\s*:\s*$/g, "")
      .trim();
    return deps.canonicalizeComparableText(compact);
  }

  function selectionHeadingForStep(
    stepId: string,
    state: CanvasState | null | undefined,
    activeSpecialist: string
  ): string[] {
    if (!state || typeof state !== "object") return [];
    const marker = "__BSC_CURRENT_VALUE_MARKER__";
    const selection = stripMarkupPreserveLines(
      deps.compareSelectionMessage(stepId, state, activeSpecialist, marker)
    );
    const headings: string[] = [];
    if (selection && selection.includes(marker)) {
      const prefix = String(selection.split(marker)[0] || "");
      const lines = prefix
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      while (lines.length > 0) {
        const tail = String(lines[lines.length - 1] || "").trim();
        if (!tail) {
          lines.pop();
          continue;
        }
        if (/^(?:[-*•]|\d+[\).])\s*$/.test(tail) || /^[:;,.!?-]+$/.test(tail)) {
          lines.pop();
          continue;
        }
        break;
      }
      const currentHeading = String(lines[0] || "").trim();
      if (currentHeading) headings.push(currentHeading);
    }

    const template = deps.uiStringFromStateMap(
      state,
      "autosuggest.prefix.template",
      deps.uiDefaultString("autosuggest.prefix.template")
    );
    const stepLabelKeyByStep: Record<string, string> = {
      dream: "offtopic.step.dream",
      purpose: "offtopic.step.purpose",
      bigwhy: "offtopic.step.bigwhy",
      role: "offtopic.step.role",
      entity: "offtopic.step.entity",
      strategy: "offtopic.step.strategy",
      targetgroup: "offtopic.step.targetgroup",
      productsservices: "offtopic.step.productsservices",
      rulesofthegame: "offtopic.step.rulesofthegame",
      presentation: "offtopic.step.presentation",
    };
    const stepLabelKey = stepLabelKeyByStep[stepId] || "";
    const stepLabel = stepLabelKey
      ? deps.uiStringFromStateMap(state, stepLabelKey, deps.uiDefaultString(stepLabelKey))
      : stepId;
    const suggestionHeading = String(template || "").includes("{0}")
      ? String(template || "").replace(/\{0\}/g, String(stepLabel || "").trim()).trim()
      : `${String(template || "").trim()} ${String(stepLabel || "").trim()}`.trim();
    if (suggestionHeading) headings.push(suggestionHeading);

    return Array.from(new Set(headings.map((line) => String(line || "").trim()).filter(Boolean)));
  }

  function unwrapSelectionHeadingFromText(
    stepId: string,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    rawValue: string
  ): string {
    const value = stripMarkupPreserveLines(rawValue);
    if (!value) return "";
    const headingComparables = selectionHeadingForStep(stepId, state, activeSpecialist)
      .map((heading) => canonicalHeadingComparable(heading))
      .filter(Boolean);
    if (headingComparables.length === 0) return value;

    const paragraphs = value
      .split(/\n{2,}/)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    if (paragraphs.length >= 2) {
      const firstComparable = canonicalHeadingComparable(String(paragraphs[0] || ""));
      if (firstComparable && headingComparables.includes(firstComparable)) {
        const body = paragraphs.slice(1).join("\n\n").trim();
        if (body) return body;
      }
    }

    const lines = value
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (lines.length >= 2) {
      const firstComparable = canonicalHeadingComparable(String(lines[0] || ""));
      if (firstComparable && headingComparables.includes(firstComparable)) {
        const body = lines.slice(1).join("\n").trim();
        if (body) return body;
      }
    }

    const colonIndex = value.indexOf(":");
    if (colonIndex > 0) {
      const prefixComparable = canonicalHeadingComparable(value.slice(0, colonIndex));
      if (prefixComparable && headingComparables.includes(prefixComparable)) {
        const body = value.slice(colonIndex + 1).trim();
        if (body) return body;
      }
    }

    return value;
  }

  function shouldUseDefaultFallback(state: CanvasState | null | undefined): boolean {
    const raw = String(
      (state as any)?.ui_strings_lang ||
      (state as any)?.ui_strings_requested_lang ||
      (state as any)?.language ||
      ""
    )
      .trim()
      .toLowerCase();
    const base = raw.split("-")[0] || "";
    return !base || base === "en";
  }

  function uiStringLocaleFirst(state: CanvasState | null | undefined, key: string): string {
    const fallback = shouldUseDefaultFallback(state) ? deps.uiDefaultString(key) : "";
    return deps.uiStringFromStateMap(state, key, fallback);
  }

  function compareInstructionForState(state: CanvasState | null | undefined): string {
    return uiStringLocaleFirst(state, "compareInstruction");
  }

  function clarifyUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareHeading").trim();
    return localized || deps.uiDefaultString("compareHeading", "");
  }

  function clarifySuggestionLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareSuggestionLabel").trim();
    return localized || deps.uiDefaultString("compareSuggestionLabel", "");
  }

  function interpretedListUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareInterpretedListHeading").trim();
    if (localized) return localized;
    return clarifyUserLabelForState(state);
  }

  function groupedListUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareGroupedUserLabel").trim();
    if (localized) return localized;
    return interpretedListUserLabelForState(state);
  }

  function groupedListSuggestionLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareGroupedCompareSuggestionLabel").trim();
    if (localized) return localized;
    return clarifySuggestionLabelForState(state);
  }

  function dreamBuilderKeepBothLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareDreamBuilderKeepBothLabel").trim();
    if (localized) return localized;
    return groupedListUserLabelForState(state);
  }

  function dreamBuilderMergeLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "compareDreamBuilderMergeLabel").trim();
    if (localized) return localized;
    return groupedListSuggestionLabelForState(state);
  }

  function groupedListBaseInstructionForState(state: CanvasState | null | undefined): string {
    return (
      uiStringLocaleFirst(state, "compareGroupedCompareInstruction").trim() ||
      compareInstructionForState(state)
    );
  }

  function dreamBuilderMergeInstructionForState(
    state: CanvasState | null | undefined
  ): string {
    const localized = uiStringLocaleFirst(state, "compareDreamBuilderMergeInstruction").trim();
    if (localized) return localized;
    return groupedListBaseInstructionForState(state);
  }

  function groupedListInstructionForState(
    state: CanvasState | null | undefined,
    retainedItems: string[]
  ): string {
    const baseInstruction = groupedListBaseInstructionForState(state);
    const retained = retainedItems.map((line) => String(line || "").trim()).filter(Boolean);
    if (retained.length === 0) return baseInstruction;
    const retainedHeading = uiStringLocaleFirst(state, "compareGroupedCompareRetainedHeading").trim();
    const retainedBlock = retained.map((line) => `• ${line}`).join("\n");
    return [retainedHeading, retainedBlock, baseInstruction].filter(Boolean).join("\n\n").trim();
  }

  function compareLabelsForStep(params: {
    stepId: string;
    mode: CompareMode;
    state: CanvasState | null | undefined;
    grouped?: boolean;
    clarify?: boolean;
  }): { userLabel?: string; suggestionLabel?: string } {
    const { stepId, mode, state, grouped, clarify } = params;
    if (clarify) {
      return {
        userLabel: clarifyUserLabelForState(state),
        suggestionLabel: clarifySuggestionLabelForState(state),
      };
    }
    if (grouped) {
      return {
        userLabel: groupedListUserLabelForState(state),
        suggestionLabel: groupedListSuggestionLabelForState(state),
      };
    }
    if (mode === "list" && isBusinessListIntentScope(stepId)) {
      return {
        userLabel: interpretedListUserLabelForState(state),
        suggestionLabel: clarifySuggestionLabelForState(state),
      };
    }
    return {};
  }

  function compareScaffoldComparables(state: CanvasState | null | undefined): Set<string> {
    const labels = [
      uiStringLocaleFirst(state, "compareHeading"),
      uiStringLocaleFirst(state, "compareSuggestionLabel"),
      uiStringLocaleFirst(state, "compareInstruction"),
      uiStringLocaleFirst(state, "compare.choice.context.default"),
      uiStringLocaleFirst(state, "compare.chooseVersion"),
      uiStringLocaleFirst(state, "compare.useInputFallback"),
      interpretedListUserLabelForState(state),
      groupedListUserLabelForState(state),
      groupedListSuggestionLabelForState(state),
      uiStringLocaleFirst(state, "compareGroupedCompareInstruction"),
      uiStringLocaleFirst(state, "compareGroupedCompareRetainedHeading"),
      clarifyUserLabelForState(state),
      clarifySuggestionLabelForState(state),
    ];
    return new Set(
      labels
        .map((label) => canonicalHeadingComparable(label))
        .filter(Boolean)
    );
  }

  function isCompareScaffoldLine(
    lineRaw: string,
    blockedComparables: Set<string>
  ): boolean {
    const cleaned = String(lineRaw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return true;
    const withoutMarker = cleaned.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim();
    const comparable = canonicalHeadingComparable(withoutMarker);
    if (!comparable) return false;
    return blockedComparables.has(comparable);
  }

  function pickCompareAgentBase(lastSpecialistResult: unknown): string {
    const result = lastSpecialistResult && typeof lastSpecialistResult === "object"
      ? (lastSpecialistResult as Record<string, unknown>)
      : {};
    return stripMarkupPreserveLines(String(result.refined_formulation || "").trim());
  }

  function isCompareEligibleStep(stepId: string): boolean {
    const normalized = String(stepId || "").trim();
    if (!normalized) return false;
    if (normalized === deps.step0Id) return false;
    if (normalized === deps.presentationStepId) return false;
    return true;
  }

  function isDreamBuilderContext(stepId: string, dreamRuntimeModeRaw?: unknown): boolean {
    const step = String(stepId || "").trim();
    if (step !== deps.dreamStepId) return false;
    return deps.normalizeDreamRuntimeMode(dreamRuntimeModeRaw) !== "self";
  }

  function isCompareEligibleContext(
    stepId: string,
    activeSpecialist: string,
    specialist?: Record<string, unknown> | null,
    previousSpecialist?: Record<string, unknown> | null,
    dreamRuntimeModeRaw?: unknown
  ): boolean {
    void activeSpecialist;
    void specialist;
    void previousSpecialist;
    if (!isCompareEligibleStep(stepId)) return false;
    if (!isDreamBuilderContext(stepId, dreamRuntimeModeRaw)) return true;
    return true;
  }

  function isCompareIntentEligibleSpecialist(specialist: Record<string, unknown>): boolean {
    const metaTopic = String(specialist.meta_topic || "").trim().toUpperCase();
    if (metaTopic && metaTopic !== "NONE") return false;
    const userIntent = String(specialist.user_intent || "").trim().toUpperCase();
    if (!userIntent) return true;
    return userIntent === "STEP_INPUT";
  }

  function isListChoiceScope(stepId: string, activeSpecialist: string): boolean {
    if (
      stepId === deps.dreamStepId &&
      String(activeSpecialist || "").trim() === deps.dreamExplainerSpecialist
    ) {
      return true;
    }
    if (
      stepId === deps.strategyStepId ||
      stepId === deps.productsservicesStepId ||
      stepId === deps.rulesofthegameStepId
    ) {
      return true;
    }
    return false;
  }

  function isSingleValueTextChoiceStep(stepId: string, mode: CompareMode): boolean {
    if (mode !== "text") return false;
    return (
      stepId === deps.dreamStepId ||
      stepId === "purpose" ||
      stepId === "bigwhy" ||
      stepId === "role" ||
      stepId === deps.entityStepId ||
      stepId === "targetgroup"
    );
  }

  function normalizePendingSuggestionIntent(raw: unknown): PendingSuggestionIntent {
    const value = String(raw || "").trim();
    if (
      value === "accept_suggestion_explicit" ||
      value === "reject_suggestion_explicit" ||
      value === "feedback_on_suggestion" ||
      value === "content_input"
    ) {
      return value;
    }
    return "";
  }

  function normalizePendingSuggestionAnchor(raw: unknown): PendingSuggestionAnchor {
    const value = String(raw || "").trim();
    if (value === "suggestion" || value === "user_input") return value;
    return "";
  }

  function normalizeFeedbackMode(raw: unknown): FeedbackMode {
    const value = String(raw || "").trim();
    if (
      value === "none" ||
      value === "affirm_input" ||
      value === "compare_suggestion" ||
      value === "refine_current"
    ) {
      return value;
    }
    return "none";
  }

  function seedSourceForPendingSuggestion(params: {
    intent: PendingSuggestionIntent;
    anchor: PendingSuggestionAnchor;
  }): string {
    const { intent, anchor } = params;
    if (
      anchor === "suggestion" &&
      (intent === "feedback_on_suggestion" || intent === "reject_suggestion_explicit")
    ) {
      return "previous_suggestion";
    }
    if (anchor === "suggestion" && intent === "accept_suggestion_explicit") {
      return "accepted_suggestion";
    }
    return "user_input";
  }

  function copyPendingCompareState(current: unknown, previous: Record<string, unknown>): Record<string, unknown> {
    const currentRecord = current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
    void previous;
    return clearPendingInteractionState(currentRecord);
  }

  function clearedResolvedCompareTransientFields(): Record<string, unknown> {
    return {
      feedback_reason_text: "",
      feedback_mode: "none",
    };
  }

  function clearCompareForResolvedDisplay(base: Record<string, unknown>): Record<string, unknown> {
    return {
      ...clearPendingInteractionState(base),
      ...clearedResolvedCompareTransientFields(),
    };
  }

  function looksLikeDualClarificationPrompt(previousSpecialist: Record<string, unknown>): boolean {
    const combined = [
      String(previousSpecialist.question || ""),
      String(previousSpecialist.message || ""),
    ]
      .join("\n")
      .replace(/\r/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .trim();
    if (!combined) return false;
    const questionMarks = (combined.match(/\?/g) || []).length;
    if (questionMarks >= 2) return true;
    if (questionMarks < 1) return false;
    const bulletCount = combined
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter((line) => /^(?:[-*•]|\d+[\).])\s+/.test(line))
      .length;
    if (bulletCount >= 2) return true;
    const quotedCount = (combined.match(/["“”'‘’][^"“”'‘’\n]{4,}["“”'‘’]/g) || []).length;
    return quotedCount >= 2;
  }

  function parseUserListItemsForStep(stepId: string, userRaw: string, suggestionItems: string[]): string[] {
    const items = deps.parseListItems(userRaw)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (isBusinessListIntentScope(stepId) && items.length <= 1) {
      const sentenceItems = deps.splitSentenceItems(userRaw)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (sentenceItems.length >= 2) return mergeListItems([], sentenceItems);
      if (stepId !== deps.productsservicesStepId) {
        const commaItems = String(userRaw || "")
          .replace(/\r/g, "\n")
          .split(/\s*,\s*/)
          .map((line) => String(line || "").trim())
          .filter(Boolean);
        if (commaItems.length >= 2 && (suggestionItems.length >= 2 || commaItems.length >= 3)) {
          return mergeListItems([], commaItems);
        }
      }
    }
    if (stepId !== deps.dreamStepId || items.length !== 1) return items;
    const sentenceItems = deps.splitSentenceItems(userRaw);
    if (sentenceItems.length < 2) return items;
    if (suggestionItems.length > 0) return sentenceItems;
    return items;
  }

  function isBusinessListIntentScope(stepId: string): boolean {
    return (
      stepId === deps.strategyStepId ||
      stepId === deps.productsservicesStepId ||
      stepId === deps.rulesofthegameStepId
    );
  }

  function shouldUseGroupedListCompare(params: {
    stepId: string;
    dreamBuilderContext: boolean;
    baseItems: string[];
    userItems: string[];
    suggestionItems: string[];
  }): boolean {
    if (isBusinessListIntentScope(params.stepId)) return true;
    return params.dreamBuilderContext;
  }

  function resolveBusinessListIntent(params: {
    stepId: string;
    userRaw: string;
    baseItems: string[];
    suggestionItems: string[];
  }): {
    semantics: CompareListSemantics;
    userItems: string[];
    suggestionItems: string[];
    normalizedUser: string;
  } | null {
    const stepId = String(params.stepId || "").trim();
    if (!isBusinessListIntentScope(stepId)) return null;
    const userRaw = String(params.userRaw || "").trim();
    if (!userRaw) return null;
    const referenceItems = params.baseItems.length > 0 ? params.baseItems : params.suggestionItems;
    if (referenceItems.length === 0) return null;
    const implicitRewrite = (() => {
      const explicitItems = deps.parseListItems(userRaw)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (explicitItems.length > 1) return null;
      const sentenceItems = deps.splitSentenceItems(userRaw)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (sentenceItems.length < 2 || sentenceItems.length > 3) return null;

      let matchedSentenceIndex = -1;
      let matchedReferenceIndex = -1;
      let matchedScore = 0;
      let strongMatchCount = 0;
      for (let sentenceIndex = 0; sentenceIndex < sentenceItems.length; sentenceIndex += 1) {
        let bestReferenceIndex = -1;
        let bestSentenceScore = 0;
        for (let referenceIndex = 0; referenceIndex < referenceItems.length; referenceIndex += 1) {
          const score = itemSimilarity(sentenceItems[sentenceIndex], referenceItems[referenceIndex]);
          if (score > bestSentenceScore) {
            bestSentenceScore = score;
            bestReferenceIndex = referenceIndex;
          }
        }
        if (bestSentenceScore >= 0.72) {
          strongMatchCount += 1;
          if (bestSentenceScore > matchedScore) {
            matchedScore = bestSentenceScore;
            matchedSentenceIndex = sentenceIndex;
            matchedReferenceIndex = bestReferenceIndex;
          }
        }
      }
      if (strongMatchCount !== 1 || matchedSentenceIndex < 0 || matchedReferenceIndex < 0) return null;

      const unmatchedSentenceItems = sentenceItems.filter((_, index) => index !== matchedSentenceIndex);
      if (unmatchedSentenceItems.length === 0) return null;
      const unmatchedStayDistinct = unmatchedSentenceItems.every((sentence) => {
        let bestScore = 0;
        for (const referenceItem of referenceItems) {
          bestScore = Math.max(bestScore, itemSimilarity(sentence, referenceItem));
        }
        return bestScore < 0.58;
      });
      if (!unmatchedStayDistinct) return null;

      return {
        updatedItems: mergeListItems(
          [],
          [
            ...referenceItems.slice(0, matchedReferenceIndex),
            ...sentenceItems,
            ...referenceItems.slice(matchedReferenceIndex + 1),
          ]
        ),
      };
    })();

    if (LIST_NO_CHANGE_SIGNAL.test(userRaw)) {
      const stable = mergeListItems([], referenceItems);
      return {
        semantics: "full",
        userItems: stable,
        suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
        normalizedUser: stable.join("\n"),
      };
    }
    const turnResolution = resolveBusinessListTurn({
      stepId,
      userMessage: userRaw,
      referenceItems,
    });
    if (turnResolution.kind === "remove") {
      return {
        semantics: "full",
        userItems: mergeListItems([], turnResolution.updatedItems),
        suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
        normalizedUser: mergeListItems([], turnResolution.updatedItems).join("\n"),
      };
    }
    if (turnResolution.kind === "edit" && Array.isArray(turnResolution.updatedItems)) {
      return {
        semantics: "full",
        userItems: mergeListItems([], turnResolution.updatedItems),
        suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
        normalizedUser: mergeListItems([], turnResolution.updatedItems).join("\n"),
      };
    }
    if (turnResolution.kind === "add" && implicitRewrite) {
      return {
        semantics: "full",
        userItems: implicitRewrite.updatedItems,
        suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
        normalizedUser: implicitRewrite.updatedItems.join("\n"),
      };
    }

    return null;
  }

  function extractCommittedListItems(stepId: string, previousSpecialist: unknown): string[] {
    const previous = previousSpecialist && typeof previousSpecialist === "object"
      ? (previousSpecialist as Record<string, unknown>)
      : {};
    if (Array.isArray(previous.statements)) {
      return toTrimmedStringArray(previous.statements);
    }
    const field = deps.fieldForStep(stepId);
    const raw = field ? String(previous[field] || "").trim() : "";
    return deps.parseListItems(raw);
  }

  function diffListItems(baseItems: string[], candidateItems: string[]): string[] {
    const base = baseItems.map((line) => deps.canonicalizeComparableText(line));
    const used = new Array(base.length).fill(false);
    const delta: string[] = [];
    for (const rawCandidate of candidateItems) {
      const candidate = String(rawCandidate || "").trim();
      if (!candidate) continue;
      const normalized = deps.canonicalizeComparableText(candidate);
      let matchedIndex = -1;
      for (let i = 0; i < base.length; i += 1) {
        if (used[i]) continue;
        if (base[i] !== normalized) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex >= 0) {
        used[matchedIndex] = true;
        continue;
      }
      delta.push(candidate);
    }
    return delta;
  }

  function mergeListItems(baseItems: string[], candidateItems: string[]): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const raw of [...baseItems, ...candidateItems]) {
      const line = String(raw || "").trim();
      if (!line) continue;
      const key = deps.canonicalizeComparableText(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(line);
    }
    return merged;
  }

  function createCompareUnit(params: {
    id: string;
    userItems: string[];
    suggestionItems: string[];
    confidence: CompareCompareConfidence;
    feedbackReasonText?: string;
  }): CompareCompareUnit {
    const userItems = params.userItems.map((line) => String(line || "").trim()).filter(Boolean);
    const suggestionItems = params.suggestionItems.map((line) => String(line || "").trim()).filter(Boolean);
    return {
      id: String(params.id || "").trim(),
      user_items: userItems,
      suggestion_items: suggestionItems,
      user_text: userItems.join("\n"),
      suggestion_text: suggestionItems.join("\n"),
      feedback_reason_text: String(params.feedbackReasonText || "").trim(),
      resolution: "",
      confidence: params.confidence,
    };
  }

  function comparableTokens(input: string): string[] {
    return Array.from(
      new Set(
        deps
          .tokenizeWords(deps.canonicalizeComparableText(input))
          .map((token) => String(token || "").trim())
          .filter((token) => token.length >= 2)
      )
    );
  }

  function tokenJaccard(left: string[], right: string[]): number {
    if (left.length === 0 || right.length === 0) return 0;
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let overlap = 0;
    for (const token of leftSet) {
      if (rightSet.has(token)) overlap += 1;
    }
    if (overlap === 0) return 0;
    const union = leftSet.size + rightSet.size - overlap;
    return union > 0 ? overlap / union : 0;
  }

  function comparableSliceTokens(items: string[]): string[] {
    return comparableTokens(items.join(" "));
  }

  function itemSimilarity(leftRaw: string, rightRaw: string): number {
    const left = String(leftRaw || "").trim();
    const right = String(rightRaw || "").trim();
    if (!left || !right) return 0;
    const leftCanonical = deps.canonicalizeComparableText(left);
    const rightCanonical = deps.canonicalizeComparableText(right);
    if (!leftCanonical || !rightCanonical) return 0;
    if (leftCanonical === rightCanonical) return 1;
    if (leftCanonical.includes(rightCanonical) || rightCanonical.includes(leftCanonical)) return 0.92;
    return tokenJaccard(comparableTokens(leftCanonical), comparableTokens(rightCanonical));
  }

  function averageBestDirectionalSimilarity(sourceItems: string[], targetItems: string[]): number {
    if (sourceItems.length === 0 || targetItems.length === 0) return 0;
    let total = 0;
    for (const source of sourceItems) {
      let best = 0;
      for (const target of targetItems) {
        best = Math.max(best, itemSimilarity(source, target));
      }
      total += best;
    }
    return total / sourceItems.length;
  }

  function sliceSimilarity(userItems: string[], suggestionItems: string[]): number {
    if (userItems.length === 0 || suggestionItems.length === 0) return 0;
    const userToSuggestion = averageBestDirectionalSimilarity(userItems, suggestionItems);
    const suggestionToUser = averageBestDirectionalSimilarity(suggestionItems, userItems);
    const tokenScore = tokenJaccard(comparableSliceTokens(userItems), comparableSliceTokens(suggestionItems));
    return Math.max(tokenScore, (userToSuggestion + suggestionToUser) / 2);
  }

  function semanticWholeSetConfidence(userItems: string[], suggestionItems: string[]): {
    coverage: number;
    strongestPair: number;
    tokenScore: number;
  } {
    let strongestPair = 0;
    for (const userItem of userItems) {
      for (const suggestionItem of suggestionItems) {
        strongestPair = Math.max(strongestPair, itemSimilarity(userItem, suggestionItem));
      }
    }
    return {
      coverage: sliceSimilarity(userItems, suggestionItems),
      strongestPair,
      tokenScore: tokenJaccard(comparableSliceTokens(userItems), comparableSliceTokens(suggestionItems)),
    };
  }

  function buildSemanticAnchorlessComparePlan(params: {
    userItems: string[];
    suggestionItems: string[];
  }): BusinessListComparePlan | null {
    const userItems = params.userItems.map((line) => String(line || "").trim()).filter(Boolean);
    const suggestionItems = params.suggestionItems.map((line) => String(line || "").trim()).filter(Boolean);
    if (userItems.length < 2 || suggestionItems.length < 2) return null;
    if (Math.max(userItems.length, suggestionItems.length) > 5) return null;

    const pairCandidates: Array<{ userIndex: number; suggestionIndex: number; score: number }> = [];
    for (let userIndex = 0; userIndex < userItems.length; userIndex += 1) {
      for (let suggestionIndex = 0; suggestionIndex < suggestionItems.length; suggestionIndex += 1) {
        const score = itemSimilarity(userItems[userIndex], suggestionItems[suggestionIndex]);
        if (score >= 0.45) {
          pairCandidates.push({ userIndex, suggestionIndex, score });
        }
      }
    }

    pairCandidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.userIndex !== right.userIndex) return left.userIndex - right.userIndex;
      return left.suggestionIndex - right.suggestionIndex;
    });

    const usedUser = new Set<number>();
    const usedSuggestion = new Set<number>();
    const semanticAnchors: Array<{ userIndex: number; suggestionIndex: number; score: number }> = [];
    for (const candidate of pairCandidates) {
      if (usedUser.has(candidate.userIndex) || usedSuggestion.has(candidate.suggestionIndex)) continue;
      usedUser.add(candidate.userIndex);
      usedSuggestion.add(candidate.suggestionIndex);
      semanticAnchors.push(candidate);
    }
    semanticAnchors.sort((left, right) => {
      if (left.userIndex !== right.userIndex) return left.userIndex - right.userIndex;
      return left.suggestionIndex - right.suggestionIndex;
    });

    const monotonicAnchors: Array<{ userIndex: number; suggestionIndex: number; score: number }> = [];
    let previousSuggestionIndex = -1;
    for (const anchor of semanticAnchors) {
      if (anchor.suggestionIndex <= previousSuggestionIndex) continue;
      monotonicAnchors.push(anchor);
      previousSuggestionIndex = anchor.suggestionIndex;
    }

    const wholeSet = semanticWholeSetConfidence(userItems, suggestionItems);
    const unitThreshold = 0.34;
    const strongWholeSet =
      (wholeSet.coverage >= 0.34 && wholeSet.strongestPair >= 0.5) ||
      (wholeSet.coverage >= 0.3 && wholeSet.tokenScore >= 0.22);
    if (!strongWholeSet) return null;

    const anchoredUnits: CompareCompareUnit[] = [];
    const anchoredSegments: CompareCompareSegment[] = [];
    let lastUserIndex = 0;
    let lastSuggestionIndex = 0;
    let unitCount = 0;
    for (const anchor of monotonicAnchors) {
      const userSlice = userItems.slice(lastUserIndex, anchor.userIndex + 1);
      const suggestionSlice = suggestionItems.slice(lastSuggestionIndex, anchor.suggestionIndex + 1);
      const score = sliceSimilarity(userSlice, suggestionSlice);
      if (score < unitThreshold) continue;
      unitCount += 1;
      const unit = createCompareUnit({
        id: `unit_${unitCount}`,
        userItems: userSlice,
        suggestionItems: suggestionSlice,
        confidence: "fallback",
      });
      anchoredUnits.push(unit);
      anchoredSegments.push({ kind: "unit", unit_id: unit.id });
      lastUserIndex = anchor.userIndex + 1;
      lastSuggestionIndex = anchor.suggestionIndex + 1;
    }

    const trailingUserSlice = userItems.slice(lastUserIndex);
    const trailingSuggestionSlice = suggestionItems.slice(lastSuggestionIndex);
    if (trailingUserSlice.length > 0 || trailingSuggestionSlice.length > 0) {
      const trailingScore = sliceSimilarity(trailingUserSlice, trailingSuggestionSlice);
      if (trailingScore >= unitThreshold) {
        unitCount += 1;
        const unit = createCompareUnit({
          id: `unit_${unitCount}`,
          userItems: trailingUserSlice,
          suggestionItems: trailingSuggestionSlice,
          confidence: "fallback",
        });
        anchoredUnits.push(unit);
        anchoredSegments.push({ kind: "unit", unit_id: unit.id });
      }
    }

    if (anchoredUnits.length >= 2) {
      return {
        mode: "grouped",
        units: anchoredUnits,
        segments: anchoredSegments,
        initialUnit: anchoredUnits[0],
      };
    }

    const singleUnit = createCompareUnit({
      id: "unit_1",
      userItems,
      suggestionItems,
      confidence: "fallback",
    });
    return {
      mode: "grouped",
      units: [singleUnit],
      segments: [{ kind: "unit", unit_id: singleUnit.id }],
      initialUnit: singleUnit,
    };
  }

  function buildOverlapConsolidationComparePlan(params: {
    baseItems: string[];
    userItems: string[];
    suggestionItems: string[];
    deltaUserItems: string[];
    preferDeltaGrouping: boolean;
  }): BusinessListComparePlan | null {
    if (!params.preferDeltaGrouping) return null;
    const baseItems = mergeListItems([], params.baseItems);
    const userItems = mergeListItems([], params.userItems);
    const suggestionItems = mergeListItems([], params.suggestionItems);
    const deltaUserItems = mergeListItems([], params.deltaUserItems);
    if (baseItems.length === 0 || userItems.length < 2 || suggestionItems.length === 0 || deltaUserItems.length === 0) {
      return null;
    }

    const baseKeys = new Set(baseItems.map((line) => deps.canonicalizeComparableText(line)).filter(Boolean));
    const deltaKeys = new Set(deltaUserItems.map((line) => deps.canonicalizeComparableText(line)).filter(Boolean));
    if (baseKeys.size === 0 || deltaKeys.size === 0) return null;

    let best:
      | {
          suggestionIndex: number;
          userIndexes: number[];
          averageScore: number;
          strongestBaseScore: number;
        }
      | null = null;

    for (let suggestionIndex = 0; suggestionIndex < suggestionItems.length; suggestionIndex += 1) {
      const suggestion = suggestionItems[suggestionIndex];
      const suggestionComparable = deps.canonicalizeComparableText(suggestion);
      if (!suggestionComparable || baseKeys.has(suggestionComparable)) continue;
      const matchedBaseIndexes: number[] = [];
      const matchedDeltaIndexes: number[] = [];
      let scoreTotal = 0;
      let scoreCount = 0;
      let strongestBaseScore = 0;

      for (let userIndex = 0; userIndex < userItems.length; userIndex += 1) {
        const userItem = userItems[userIndex];
        const comparable = deps.canonicalizeComparableText(userItem);
        if (!comparable) continue;
        const score = itemSimilarity(userItem, suggestion);
        if (score < 0.38) continue;
        if (baseKeys.has(comparable)) {
          matchedBaseIndexes.push(userIndex);
          strongestBaseScore = Math.max(strongestBaseScore, score);
        }
        if (deltaKeys.has(comparable)) {
          matchedDeltaIndexes.push(userIndex);
        }
        scoreTotal += score;
        scoreCount += 1;
      }

      const userIndexes = Array.from(new Set([...matchedBaseIndexes, ...matchedDeltaIndexes])).sort((a, b) => a - b);
      if (matchedBaseIndexes.length === 0 || matchedDeltaIndexes.length === 0 || userIndexes.length < 2) continue;

      const averageScore = scoreCount > 0 ? scoreTotal / scoreCount : 0;
      if (strongestBaseScore < 0.45 || averageScore < 0.42) continue;

      if (
        !best ||
        userIndexes.length > best.userIndexes.length ||
        (userIndexes.length === best.userIndexes.length && averageScore > best.averageScore)
      ) {
        best = {
          suggestionIndex,
          userIndexes,
          averageScore,
          strongestBaseScore,
        };
      }
    }

    if (!best) return null;

    const clusteredUserIndexes = new Set(best.userIndexes);
    const unit = createCompareUnit({
      id: "unit_1",
      userItems: best.userIndexes.map((index) => userItems[index]).filter(Boolean),
      suggestionItems: [suggestionItems[best.suggestionIndex]].filter(Boolean),
      confidence: "fallback",
    });
    if (unit.user_items.length < 2 || unit.suggestion_items.length === 0) return null;

    const segments: CompareCompareSegment[] = [];
    let retainedBuffer: string[] = [];
    let unitInserted = false;
    const flushRetained = () => {
      if (retainedBuffer.length === 0) return;
      segments.push({ kind: "retained", items: retainedBuffer });
      retainedBuffer = [];
    };

    for (let index = 0; index < userItems.length; index += 1) {
      const item = userItems[index];
      if (!item) continue;
      if (clusteredUserIndexes.has(index)) {
        flushRetained();
        if (!unitInserted) {
          segments.push({ kind: "unit", unit_id: unit.id });
          unitInserted = true;
        }
        continue;
      }
      retainedBuffer.push(item);
    }
    flushRetained();
    if (!unitInserted) return null;

    return {
      mode: "grouped",
      units: [unit],
      segments,
      initialUnit: unit,
    };
  }

  function longestCommonListAnchors(
    userItems: string[],
    suggestionItems: string[]
  ): Array<{ userIndex: number; suggestionIndex: number; item: string }> {
    const left = userItems.map((line) => deps.canonicalizeComparableText(line));
    const right = suggestionItems.map((line) => deps.canonicalizeComparableText(line));
    const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        if (left[i] && left[i] === right[j]) {
          matrix[i][j] = matrix[i + 1][j + 1] + 1;
        } else {
          matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
        }
      }
    }

    const matches: Array<{ userIndex: number; suggestionIndex: number; item: string }> = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] && left[i] === right[j]) {
        matches.push({
          userIndex: i,
          suggestionIndex: j,
          item: String(userItems[i] || "").trim(),
        });
        i += 1;
        j += 1;
        continue;
      }
      if (matrix[i + 1][j] >= matrix[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    return matches;
  }

  function buildBusinessListComparePlan(params: {
    baseItems: string[];
    userItems: string[];
    suggestionItems: string[];
    deltaUserItems: string[];
    preferDeltaGrouping: boolean;
  }): BusinessListComparePlan | null {
    const userItems = mergeListItems([], params.userItems.map((line) => String(line || "").trim()).filter(Boolean));
    const suggestionItems = mergeListItems(
      [],
      params.suggestionItems.map((line) => String(line || "").trim()).filter(Boolean)
    );
    if (userItems.length === 0 || suggestionItems.length === 0) return null;

    const overlapConsolidationPlan = buildOverlapConsolidationComparePlan({
      baseItems: params.baseItems,
      userItems,
      suggestionItems,
      deltaUserItems: params.deltaUserItems,
      preferDeltaGrouping: params.preferDeltaGrouping,
    });
    if (overlapConsolidationPlan) return overlapConsolidationPlan;

    const anchors = longestCommonListAnchors(userItems, suggestionItems);
    if (anchors.length === 0 && userItems.length > 1 && suggestionItems.length > 1) {
      return buildSemanticAnchorlessComparePlan({
        userItems,
        suggestionItems,
      });
    }

    const segments: CompareCompareSegment[] = [];
    const units: CompareCompareUnit[] = [];
    let previousUserIndex = -1;
    let previousSuggestionIndex = -1;
    let unitCount = 0;

    const pushGapUnit = (nextUserIndex: number, nextSuggestionIndex: number, confidence: CompareCompareConfidence) => {
      const userSlice = userItems.slice(previousUserIndex + 1, nextUserIndex);
      const suggestionSlice = suggestionItems.slice(previousSuggestionIndex + 1, nextSuggestionIndex);
      if (userSlice.length === 0 && suggestionSlice.length === 0) return;
      unitCount += 1;
      const unit = createCompareUnit({
        id: `unit_${unitCount}`,
        userItems: userSlice,
        suggestionItems: suggestionSlice,
        confidence,
      });
      units.push(unit);
      segments.push({ kind: "unit", unit_id: unit.id });
    };

    for (const anchor of anchors) {
      pushGapUnit(anchor.userIndex, anchor.suggestionIndex, "anchored");
      segments.push({ kind: "retained", items: [anchor.item] });
      previousUserIndex = anchor.userIndex;
      previousSuggestionIndex = anchor.suggestionIndex;
    }
    pushGapUnit(userItems.length, suggestionItems.length, anchors.length > 0 ? "anchored" : "fallback");

    const retainedItems = segments.flatMap((segment) => (segment.kind === "retained" ? segment.items : []));
    if (units.length === 0) return null;
    return {
      mode: "grouped",
      units,
      segments,
      initialUnit: units[0],
    };
  }

  function buildDreamBuilderComparePlan(params: {
    baseItems: string[];
    userItems: string[];
    suggestionItems: string[];
    deltaUserItems: string[];
  }): BusinessListComparePlan | null {
    const baseItems = mergeListItems([], params.baseItems);
    const userItems = mergeListItems([], params.userItems);
    const suggestionItems = mergeListItems([], params.suggestionItems);
    const deltaUserItems = mergeListItems([], params.deltaUserItems);
    if (userItems.length === 0 || suggestionItems.length === 0) return null;

    const baseKeys = new Set(baseItems.map((line) => deps.canonicalizeComparableText(line)).filter(Boolean));
    const suggestionDeltaItems = suggestionItems.filter((line) => {
      const key = deps.canonicalizeComparableText(line);
      return Boolean(key) && !baseKeys.has(key);
    });

    const compareUserItems = deltaUserItems.length > 0 ? deltaUserItems : userItems;
    const compareSuggestionItems = suggestionDeltaItems.length > 0 ? suggestionDeltaItems : suggestionItems;
    if (compareUserItems.length === 0 || compareSuggestionItems.length === 0) return null;

    let retainedItems = mergeListItems([], baseItems);
    if (compareUserItems.length === 1 && compareSuggestionItems.length === 1 && baseItems.length > 0) {
      const overlapSeed = compareSuggestionItems[0];
      let bestBaseIndex = -1;
      let bestBaseScore = 0;
      for (let index = 0; index < baseItems.length; index += 1) {
        const score = Math.max(
          itemSimilarity(baseItems[index], overlapSeed),
          itemSimilarity(baseItems[index], compareUserItems[0])
        );
        if (score > bestBaseScore) {
          bestBaseScore = score;
          bestBaseIndex = index;
        }
      }
      if (bestBaseIndex >= 0 && bestBaseScore >= 0.3) {
        retainedItems = baseItems.filter((_, index) => index !== bestBaseIndex);
      }
    }

    const unit = createCompareUnit({
      id: "unit_1",
      userItems: compareUserItems,
      suggestionItems: compareSuggestionItems,
      confidence: "fallback",
    });
    const segments: CompareCompareSegment[] = [];
    if (retainedItems.length > 0) {
      segments.push({ kind: "retained", items: retainedItems });
    }
    segments.push({ kind: "unit", unit_id: unit.id });
    return {
      mode: "grouped",
      units: [unit],
      segments,
      initialUnit: unit,
    };
  }

  function buildDreamBuilderOverlapComparePlan(params: {
    baseItems: string[];
    existingItem: string;
    incomingItem: string;
    suggestionItem: string;
  }): BusinessListComparePlan | null {
    const baseItems = mergeListItems([], params.baseItems);
    const existingItem = String(params.existingItem || "").trim();
    const incomingItem = String(params.incomingItem || "").trim();
    const suggestionItem = String(params.suggestionItem || "").trim();
    if (!existingItem || !incomingItem || !suggestionItem || baseItems.length === 0) return null;

    const existingComparable = deps.canonicalizeComparableText(existingItem);
    if (!existingComparable) return null;
    const existingIndex = baseItems.findIndex(
      (item) => deps.canonicalizeComparableText(item) === existingComparable
    );
    if (existingIndex < 0) return null;

    const unit = createCompareUnit({
      id: "unit_1",
      userItems: [existingItem, incomingItem],
      suggestionItems: [suggestionItem],
      confidence: "fallback",
    });

    const segments: CompareCompareSegment[] = [];
    let retainedBuffer: string[] = [];
    const flushRetained = () => {
      if (retainedBuffer.length === 0) return;
      segments.push({ kind: "retained", items: retainedBuffer });
      retainedBuffer = [];
    };

    for (let index = 0; index < baseItems.length; index += 1) {
      const item = baseItems[index];
      if (!item) continue;
      if (index === existingIndex) {
        flushRetained();
        segments.push({ kind: "unit", unit_id: unit.id });
        continue;
      }
      retainedBuffer.push(item);
    }
    flushRetained();

    return {
      mode: "grouped",
      units: [unit],
      segments,
      initialUnit: unit,
    };
  }

  function buildBusinessListOverlapComparePlan(params: {
    baseItems: string[];
    incomingItems: string[];
    suggestionItems: string[];
  }): BusinessListComparePlan | null {
    const baseItems = mergeListItems([], params.baseItems);
    const incomingItems = mergeListItems([], params.incomingItems);
    const suggestionItems = mergeListItems([], params.suggestionItems);
    if (baseItems.length === 0 || incomingItems.length !== 1 || suggestionItems.length !== 1) return null;

    const incomingItem = incomingItems[0];
    const suggestionItem = suggestionItems[0];
    const suggestionComparable = deps.canonicalizeComparableText(suggestionItem);
    if (!suggestionComparable) return null;

    let bestIndex = -1;
    let bestScore = 0;
    let secondBestScore = 0;
    for (let index = 0; index < baseItems.length; index += 1) {
      const baseItem = baseItems[index];
      const baseComparable = deps.canonicalizeComparableText(baseItem);
      if (!baseComparable) continue;
      if (baseComparable === suggestionComparable) return null;
      const score = Math.max(
        itemSimilarity(baseItem, suggestionItem),
        itemSimilarity(baseItem, incomingItem)
      );
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestIndex = index;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    if (bestIndex < 0 || bestScore < 0.42) return null;
    if (secondBestScore > 0 && bestScore - secondBestScore < 0.08) return null;

    return buildDreamBuilderOverlapComparePlan({
      baseItems,
      existingItem: baseItems[bestIndex],
      incomingItem,
      suggestionItem,
    });
  }

  function hasDreamBuilderPendingCompare(specialist: Record<string, unknown>): boolean {
    return Boolean(readDreamBuilderCompareRuntime(specialist));
  }

  function composeDreamBuilderCompareSelection(params: {
    segments: CompareCompareSegment[];
    currentItems: string[];
    suggestedItems: string[];
    pickedUser: boolean;
  }): string[] {
    const selectedItems = params.pickedUser ? params.currentItems : params.suggestedItems;
    const composed: string[] = [];
    for (const segment of params.segments) {
      if (!segment || typeof segment !== "object") continue;
      if (segment.kind === "retained") {
        composed.push(...segment.items.map((item) => String(item || "").trim()).filter(Boolean));
        continue;
      }
      if (segment.kind === "unit") {
        composed.push(...selectedItems.map((item) => String(item || "").trim()).filter(Boolean));
      }
    }
    return mergeListItems([], composed);
  }

  function selectedItemsForCompareUnit(unit: CompareCompareUnit): string[] {
    if (unit.resolution === "user") return unit.user_items;
    if (unit.resolution === "suggestion") return unit.suggestion_items;
    return [];
  }

  function composeGroupedCompareItems(
    segments: CompareCompareSegment[],
    units: CompareCompareUnit[]
  ): string[] {
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const composed: string[] = [];
    for (const segment of segments) {
      if (segment.kind === "retained") {
        composed.push(...segment.items);
        continue;
      }
      const unit = byId.get(segment.unit_id);
      if (!unit) continue;
      composed.push(...selectedItemsForCompareUnit(unit));
    }
    return mergeListItems([], composed);
  }

  function visibleRetainedItemsForGroupedCompare(
    segments: CompareCompareSegment[],
    units: CompareCompareUnit[]
  ): string[] {
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const visible: string[] = [];
    for (const segment of segments) {
      if (segment.kind === "retained") {
        visible.push(...segment.items);
        continue;
      }
      const unit = byId.get(segment.unit_id);
      if (!unit || !unit.resolution) continue;
      visible.push(...selectedItemsForCompareUnit(unit));
    }
    return mergeListItems([], visible);
  }

  function hasInvalidRetainedOverlapInGroupedCompare(
    segments: CompareCompareSegment[],
    units: CompareCompareUnit[]
  ): boolean {
    const retainedKeys = new Set(
      segments
        .filter((segment): segment is Extract<CompareCompareSegment, { kind: "retained" }> => segment.kind === "retained")
        .flatMap((segment) => segment.items)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean)
    );
    if (retainedKeys.size === 0) return false;
    return units.some((unit) => {
      const userOverlap = unit.user_items.some((line) => {
        const key = deps.canonicalizeComparableText(line);
        return Boolean(key) && retainedKeys.has(key);
      });
      const suggestionOverlap = unit.suggestion_items.some((line) => {
        const key = deps.canonicalizeComparableText(line);
        return Boolean(key) && retainedKeys.has(key);
      });
      if (!userOverlap && !suggestionOverlap) return false;
      const userHasRemainingDifference = unit.user_items.some((line) => {
        const key = deps.canonicalizeComparableText(line);
        return Boolean(key) && !retainedKeys.has(key);
      });
      const suggestionHasRemainingDifference = unit.suggestion_items.some((line) => {
        const key = deps.canonicalizeComparableText(line);
        return Boolean(key) && !retainedKeys.has(key);
      });
      return !userHasRemainingDifference || !suggestionHasRemainingDifference;
    });
  }

  function nextUnresolvedCompareUnitIndex(
    units: CompareCompareUnit[],
    preferredIndex = 0
  ): number {
    for (let index = Math.max(0, preferredIndex); index < units.length; index += 1) {
      if (!units[index].resolution) return index;
    }
    for (let index = 0; index < Math.max(0, preferredIndex); index += 1) {
      if (!units[index].resolution) return index;
    }
    return -1;
  }

  function sanitizePendingListMessage(
    messageRaw: string,
    knownItems: string[],
    state: CanvasState | null | undefined,
    specialist?: Record<string, unknown> | null
  ): string {
    const message = String(messageRaw || "").replace(/\r/g, "\n");
    if (!message.trim()) return "";
    const blockedComparables = compareScaffoldComparables(state);
    const known = new Set(
      knownItems
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean)
    );
    const lines = message.split("\n");
    const kept: string[] = [];
    for (const lineRaw of lines) {
      const line = String(lineRaw || "");
      const trimmed = line.trim();
      if (!trimmed) {
        kept.push("");
        continue;
      }
      if (isCompareScaffoldLine(trimmed, blockedComparables)) continue;
      const withoutMarker = trimmed.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim();
      const directKey = deps.canonicalizeComparableText(withoutMarker);
      if (known.has(directKey)) continue;
      const sentenceItems = deps.splitSentenceItems(withoutMarker);
      if (sentenceItems.length >= 2) {
        const sentenceKeys = sentenceItems
          .map((line) => deps.canonicalizeComparableText(line))
          .filter(Boolean);
        if (sentenceKeys.length >= 2 && sentenceKeys.every((key) => known.has(key))) continue;
      }
      kept.push(line);
    }
    return kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sanitizePendingTextMessage(messageRaw: string, suggestionRaw: string): string {
    const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
    const suggestion = String(suggestionRaw || "").trim();
    if (!message || !suggestion) return message;
    const suggestionComparable = deps.canonicalizeComparableText(suggestion);
    if (!suggestionComparable) return message;
    const paragraphs = message
      .split(/\n{2,}/)
      .map((line) => line.trim())
      .filter(Boolean);
    const kept = paragraphs.filter((paragraph) => {
      const comparable = deps.canonicalizeComparableText(paragraph);
      return comparable && comparable !== suggestionComparable && !comparable.includes(suggestionComparable);
    });
    return kept.join("\n\n").trim();
  }

  function normalizeCompactFeedbackSentence(raw: string, fallback: string): string {
    const cleaned = String(raw || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const source = cleaned || fallback;
    if (!source) return "";
    const firstSentence = source
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || source;
    const normalized = firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  function fallbackPendingCompareFeedbackReason(params: {
    stepId: string;
    state: CanvasState;
    pendingMessage: string;
  }): string {
    const compact = normalizeCompactFeedbackSentence(String(params.pendingMessage || "").trim(), "");
    if (!compact) return "";
    return sanitizeFeedbackReasonForDisplay({
      stepId: params.stepId,
      rawReason: compact,
      resolveString: (key, fallback = "") =>
        deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback)),
      });
  }

  function feedbackReasonFromMessage(params: {
    stepId: string;
    state: CanvasState;
    message: string;
  }): string {
    const compact = normalizeCompactFeedbackSentence(String(params.message || "").trim(), "");
    if (!compact) return "";
    return sanitizeFeedbackReasonForDisplay({
      stepId: params.stepId,
      rawReason: compact,
      resolveString: (key, fallback = "") =>
        deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback)),
    });
  }

  function resolveFeedbackReasonFromSpecialist(state: CanvasState, prev: Record<string, unknown>): string {
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(state, key, fallback || deps.uiDefaultString(key, fallback));
    const stepId = String((state as any)?.current_step || "").trim();
    const reasonText = String(prev.feedback_reason_text || "").trim();
    if (reasonText) {
      const sanitized = sanitizeFeedbackReasonForDisplay({
        stepId,
        rawReason: normalizeCompactFeedbackSentence(reasonText, ""),
        resolveString,
      });
      if (sanitized) return sanitized;
    }
    return "";
  }

  function resolveFeedbackReasonFromPendingCompare(
    state: CanvasState,
    prev: Record<string, unknown>
  ): string {
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(state, key, fallback || deps.uiDefaultString(key, fallback));
    const stepId = String((state as any)?.current_step || "").trim();
    const candidates = [readPendingInteractionState(state), readPendingInteractionState(prev)]
      .map((pending) => String(pending?.render_model.feedback_reason_text || "").trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const sanitized = sanitizeFeedbackReasonForDisplay({
        stepId,
        rawReason: normalizeCompactFeedbackSentence(candidate, ""),
        resolveString,
      });
      if (sanitized) return sanitized;
    }
    return "";
  }

  function userPickFeedbackReason(state: CanvasState, prev: Record<string, unknown>): string {
    const explicitReason = resolveFeedbackReasonFromSpecialist(state, prev);
    if (explicitReason) return explicitReason;
    const pendingReason = resolveFeedbackReasonFromPendingCompare(state, prev);
    if (pendingReason) return pendingReason;
    const messageReason = feedbackReasonFromMessage({
      stepId: String((state as any)?.current_step || "").trim(),
      state,
      message: String(prev.message || ""),
    });
    if (messageReason) return messageReason;
    return "";
  }

  function resolvePendingCompareFeedbackReason(params: {
    stepId: string;
    state: CanvasState;
    mode: CompareMode;
    forcePending: boolean;
    specialistResult: Record<string, unknown>;
    pendingMessage: string;
    suggestionRaw: string;
    userRaw: string;
    knownItems: string[];
  }): string {
    void params.mode;
    void params.knownItems;
    const explicitReason = resolveFeedbackReasonFromSpecialist(params.state, params.specialistResult);
    if (explicitReason) return explicitReason;
    const messageReason = feedbackReasonFromMessage({
      stepId: params.stepId,
      state: params.state,
      message: params.pendingMessage,
    });
    if (messageReason) return messageReason;
    return "";
  }

  function resolveGroupedCompareFeedbackForUnit(params: {
    stepId: string;
    specialistResult: Record<string, unknown>;
    unit: CompareCompareUnit;
    state: CanvasState;
  }): string {
    const unitReason = String(params.unit.feedback_reason_text || "").trim();
    if (unitReason) {
      return sanitizeFeedbackReasonForDisplay({
        stepId: params.stepId,
        rawReason: unitReason,
        resolveString: (key, fallback = "") =>
          deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback)),
      });
    }
    const explicitReason = resolveFeedbackReasonFromSpecialist(params.state, params.specialistResult);
    if (explicitReason) return explicitReason;
    const messageReason = feedbackReasonFromMessage({
      stepId: params.stepId,
      state: params.state,
      message: String(params.specialistResult.message || ""),
    });
    if (messageReason) return messageReason;
    return "";
  }

  function withGroupedCompareUnitFeedback(params: {
    stepId: string;
    plan: BusinessListComparePlan;
    specialistResult: Record<string, unknown>;
    state: CanvasState;
  }): BusinessListComparePlan {
    const sharedFeedbackReason = resolveGroupedCompareFeedbackForUnit({
      stepId: params.stepId,
      specialistResult: params.specialistResult,
      unit: params.plan.initialUnit,
      state: params.state,
    });
    const units = params.plan.units.map((unit) => {
      return {
        ...unit,
        feedback_reason_text: sharedFeedbackReason,
      } satisfies CompareCompareUnit;
    });
    return {
      ...params.plan,
      units,
      initialUnit: units[0] || params.plan.initialUnit,
    };
  }

  function groupedCompareComparePayload(params: {
    stepId: string;
    state: CanvasState | null | undefined;
    units: CompareCompareUnit[];
    segments: CompareCompareSegment[];
    cursor: number;
  }): CompareUiPayload | null {
    const nextIndex = nextUnresolvedCompareUnitIndex(params.units, params.cursor);
    if (nextIndex < 0) return null;
    const currentUnit = params.units[nextIndex];
    const retainedItems = visibleRetainedItemsForGroupedCompare(params.segments, params.units);
    const isDreamBuilderCompare = params.stepId === deps.dreamStepId;
    const isDreamBuilderMergeChoice =
      isDreamBuilderCompare &&
      currentUnit.user_items.length > 1 &&
      currentUnit.suggestion_items.length === 1;
    const labels = isDreamBuilderMergeChoice
      ? {
          userLabel: dreamBuilderKeepBothLabelForState(params.state),
          suggestionLabel: dreamBuilderMergeLabelForState(params.state),
        }
      : compareLabelsForStep({
          stepId: params.stepId,
          mode: "list",
          state: params.state,
          grouped: true,
        });
    const feedbackReasonText = String(currentUnit.feedback_reason_text || "").trim();
    if (!feedbackReasonText) return null;
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(params.state || null, key, fallback || deps.uiDefaultString(key, fallback));
    return {
      enabled: true,
      mode: "list",
      ...(feedbackReasonText
        ? {
            feedback_reason_text: formatCompareFeedbackForDisplay({
              stepId: params.stepId,
              rawReason: feedbackReasonText,
              resolveString,
            }),
          }
        : {}),
      ...(labels.userLabel ? { user_label: labels.userLabel } : {}),
      ...(labels.suggestionLabel ? { suggestion_label: labels.suggestionLabel } : {}),
      user_text: currentUnit.user_text,
      suggestion_text: currentUnit.suggestion_text,
      user_items: currentUnit.user_items,
      suggestion_items: currentUnit.suggestion_items,
      instruction:
        isDreamBuilderCompare && isDreamBuilderMergeChoice
          ? dreamBuilderMergeInstructionForState(params.state)
          : groupedListInstructionForState(params.state, retainedItems),
    };
  }

  function groupedPendingUnitsForRender(units: CompareCompareUnit[]): PendingInteractionUnitRender[] {
    return units
      .map((unit) => ({
        user_items: [...unit.user_items],
        suggestion_items: [...unit.suggestion_items],
        feedback_reason_text: String(unit.feedback_reason_text || "").trim(),
      }))
      .filter((unit) => unit.user_items.length > 0 || unit.suggestion_items.length > 0);
  }

  function buildPendingInteractionRenderModel(params: {
    stepId: string;
    state: CanvasState | null | undefined;
    mode: CompareMode;
    listSemantics?: CompareListSemantics;
    feedbackReasonText: string;
    userLabel: string;
    suggestionLabel: string;
    userText: string;
    suggestionText: string;
    userItems: string[];
    suggestionItems: string[];
    instruction: string;
    retainedItems?: string[];
    units?: PendingInteractionUnitRender[];
  }): PendingInteractionCompareRenderModel {
    const retainedItems = mergeListItems([], params.retainedItems || []);
    const retainedHeading = retainedItems.length > 0
      ? uiStringLocaleFirst(params.state, "compareGroupedCompareRetainedHeading").trim()
      : "";
    return {
      mode: params.mode,
      ...(params.mode === "list" && params.listSemantics
        ? { list_semantics: params.listSemantics }
        : {}),
      instruction: String(params.instruction || "").trim(),
      feedback_reason_text: String(params.feedbackReasonText || "").trim(),
      user_label: String(params.userLabel || "").trim(),
      suggestion_label: String(params.suggestionLabel || "").trim(),
      user_text: String(params.userText || "").trim(),
      suggestion_text: String(params.suggestionText || "").trim(),
      user_items: mergeListItems([], params.userItems || []),
      suggestion_items: mergeListItems([], params.suggestionItems || []),
      ...(params.units && params.units.length > 0 ? { units: params.units } : {}),
      retained_heading: retainedHeading,
      retained_items: retainedItems,
    };
  }

  function comparePayloadFromPendingInteractionState(
    pendingState: ReturnType<typeof readPendingInteractionState>,
    stepId: string,
    state: CanvasState | null | undefined
  ): CompareUiPayload | null {
    if (!pendingState) return null;
    const renderModel = pendingState.render_model;
    const mode: CompareMode = renderModel.mode === "list" ? "list" : "text";
    const feedbackReason = String(renderModel.feedback_reason_text || "").trim();
    const userText = String(renderModel.user_text || "").trim();
    const suggestionText = String(renderModel.suggestion_text || "").trim();
    const userItems = mergeListItems([], renderModel.user_items || []);
    const suggestionItems = mergeListItems([], renderModel.suggestion_items || []);
    const hasComparableValues =
      mode === "list"
        ? userItems.length > 0 && suggestionItems.length > 0
        : Boolean(userText && suggestionText);
    if (!feedbackReason || !hasComparableValues) return null;
    return {
      enabled: true,
      mode,
      feedback_reason_text: formattedCompareFeedback(stepId, state, feedbackReason),
      ...(String(renderModel.user_label || "").trim() ? { user_label: String(renderModel.user_label || "").trim() } : {}),
      ...(String(renderModel.suggestion_label || "").trim()
        ? { suggestion_label: String(renderModel.suggestion_label || "").trim() }
        : {}),
      user_text: userText,
      suggestion_text: suggestionText,
      user_items: userItems,
      suggestion_items: suggestionItems,
      instruction: String(renderModel.instruction || "").trim(),
    };
  }

  function formattedCompareFeedback(stepId: string, state: CanvasState | null | undefined, rawReason: string): string {
    return formatCompareFeedbackForDisplay({
      stepId,
      rawReason,
      resolveString: (key, fallback = "") =>
        deps.uiStringFromStateMap(state || null, key, fallback || deps.uiDefaultString(key, fallback)),
    });
  }

  function userChoiceFeedbackMessage(
    stepId: string,
    state: CanvasState,
    prev: Record<string, unknown>,
    activeSpecialist = "",
    telemetry?: unknown,
    selectedValueOverride = ""
  ): string {
    void telemetry;
    const compareFromState = readPendingInteractionState(state);
    const compareFromPrev = readPendingInteractionState(prev);
    const selectedValue = String(
      selectedValueOverride ||
      compareFromState?.render_model.user_text ||
      compareFromPrev?.render_model.user_text ||
      prev.refined_formulation ||
      ""
    ).trim();
    const selection = deps.compareSelectionMessage(stepId, state, activeSpecialist, selectedValue);
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(state, key, fallback || deps.uiDefaultString(key, fallback));
    const explicitUserPickFeedbackRaw = String(prev.user_pick_feedback_text || "").trim();
    const explicitUserPickFeedback = isMeaningfulUserPickFeedbackText({
      stepId,
      rawText: explicitUserPickFeedbackRaw,
      resolveString,
    })
      ? sanitizeUserPickFeedbackTextForDisplay(explicitUserPickFeedbackRaw)
      : "";
    if (explicitUserPickFeedback) {
      return [explicitUserPickFeedback, selection].filter((part) => String(part || "").trim()).join("\n\n").trim();
    }
    const rawFeedbackReason = userPickFeedbackReason(state, prev);
    const feedbackReason = formatUserPickFeedbackForDisplay({
      stepId,
      rawReason: rawFeedbackReason,
      resolveString,
    });
    const parts = [feedbackReason, selection].filter((part) => String(part || "").trim());
    return parts.join("\n\n").trim();
  }

  function scrubSuggestionPickArtifacts(params: {
    stepId: string;
    state: CanvasState;
    fallbackMessage: string;
    result: Record<string, unknown>;
  }): Record<string, unknown> {
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback));
    const acknowledgment = String(userPickAcknowledgmentForDisplay(resolveString) || "").trim();
    const defaultReason = String(
      userPickFeedbackReasonForDisplay({
        stepId: params.stepId,
        rawReason: "",
        resolveString,
      }) || ""
    ).trim();
    const fallbackUserPickMessage = String(
      formatUserPickFeedbackForDisplay({
        stepId: params.stepId,
        rawReason: "",
        resolveString,
      }) || ""
    ).trim();
    const hasUserPickFallback = (value: unknown): boolean => {
      const text = String(value || "").trim();
      if (!text) return false;
      return (
        (acknowledgment !== "" && text.includes(acknowledgment)) ||
        (defaultReason !== "" && text.includes(defaultReason)) ||
        (fallbackUserPickMessage !== "" && text.includes(fallbackUserPickMessage))
      );
    };

    const next: Record<string, unknown> = { ...params.result };
    if (hasUserPickFallback(next.message)) {
      next.message = params.fallbackMessage;
    }
    const uiContent =
      next.ui_content && typeof next.ui_content === "object" && !Array.isArray(next.ui_content)
        ? { ...(next.ui_content as Record<string, unknown>) }
        : null;
    if (uiContent && hasUserPickFallback(uiContent.support_text)) {
      delete uiContent.support_text;
    }
    if (uiContent && hasUserPickFallback(uiContent.feedback_reason_text)) {
      delete uiContent.feedback_reason_text;
    }
    if (uiContent) {
      next.ui_content = uiContent;
    }
    return next;
  }

  function withUpdatedTargetField(result: Record<string, unknown>, stepId: string, value: string): Record<string, unknown> {
    const field = deps.fieldForStep(stepId);
    if (!field || !value) return result;
    return { ...result, [field]: value };
  }

  function withAcceptedListSelectionState(
    state: CanvasState,
    stepId: string,
    selectedItems: string[]
  ): CanvasState {
    if (stepId !== deps.dreamStepId) return state;
    const selectedCanonicalItems = mergeListItems([], selectedItems);
    const existingCanonicalItems = Array.isArray((state as Record<string, unknown>).dream_builder_statements)
      ? ((state as Record<string, unknown>).dream_builder_statements as unknown[])
          .map((line) => String(line || "").trim())
          .filter(Boolean)
      : [];
    const canonicalItems =
      existingCanonicalItems.length > selectedCanonicalItems.length
        ? mergeListItems(existingCanonicalItems, selectedCanonicalItems)
        : selectedCanonicalItems;
    return {
      ...state,
      dream_builder_statements: canonicalItems,
      ...(canonicalItems.length >= 20 ? { dream_scoring_statements: canonicalItems } : {}),
    } as CanvasState;
  }

  function retainedItemsForAcceptedListSelection(params: {
    listSemantics: CompareListSemantics;
    committedItems: string[];
    retainedItems: string[];
    currentItems: string[];
  }): string[] {
    if (params.listSemantics === "full") return [];
    if (params.listSemantics === "delta") return mergeListItems([], params.committedItems);

    const explicitRetained = mergeListItems([], params.retainedItems);
    if (explicitRetained.length > 0) return explicitRetained;

    const overlapKeys = new Set(
      mergeListItems([], params.currentItems)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean)
    );
    if (overlapKeys.size === 0) return mergeListItems([], params.committedItems);
    return mergeListItems(
      [],
      params.committedItems.filter((line) => {
        const key = deps.canonicalizeComparableText(line);
        return !key || !overlapKeys.has(key);
      })
    );
  }

  function pickCompareSuggestionList(currentSpecialist: Record<string, unknown>, fallbackText: string): string[] {
    const refined = String(currentSpecialist.refined_formulation || "").trim();
    const proposalItems = mergeListItems([], deps.parseListItems(refined || fallbackText));
    if (proposalItems.length > 0) {
      return proposalItems;
    }
    if (Array.isArray(currentSpecialist.statements) && currentSpecialist.statements.length > 0) {
      return mergeListItems(
        [],
        currentSpecialist.statements.map((line) => String(line || "").trim()).filter(Boolean)
      );
    }
    return [];
  }

  function isRefineAdjustRouteToken(token: string): boolean {
    const upper = String(token || "").toUpperCase();
    return upper.includes("_REFINE__") || upper.includes("_ADJUST__");
  }

  function isComparePickRouteToken(token: string): boolean {
    return token === "__COMPARE_PICK_USER__" || token === "__COMPARE_PICK_SUGGESTION__";
  }

  function isAcceptedOutputSingleValueTextStep(stepId: string, mode: CompareMode): boolean {
    return mode === "text" && isSingleValueCompareStep(stepId);
  }

  function stripUnsupportedReformulationClaims(messageRaw: string): string {
    const message = String(messageRaw || "").replace(/\r/g, "\n");
    if (!message.trim()) return "";
    const blocked = [
      /\b(i['’]?ve|i have)\s+reformulat\w*\b/i,
      /\b(i['’]?ve|i have)\s+rewritten\b/i,
      /\byou['’]?ve provided some clear focus points\b/i,
    ];
    const lines = message.split("\n");
    const kept: string[] = [];
    for (const lineRaw of lines) {
      const line = String(lineRaw || "");
      const trimmed = line.trim();
      if (!trimmed) {
        kept.push("");
        continue;
      }
      if (blocked.some((re) => re.test(trimmed))) continue;
      kept.push(line);
    }
    return kept
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function buildCompareFromTurn(params: BuildCompareFromTurnParams): {
    specialist: Record<string, unknown>;
    compare: CompareUiPayload | null;
    pendingState: PersistedPendingInteractionState | null;
  } {
    const previousSpecialist = params.previousSpecialist;
    const specialistResult = clearPendingInteractionState(params.specialistResult);
    const {
      stepId,
      state,
      activeSpecialist,
      userTextRaw,
      isOfftopic,
      forcePending,
      dreamRuntimeModeRaw,
      acceptedOutputUserTurnClassification,
    } = params;
    if (!isCompareEligibleContext(stepId, activeSpecialist, specialistResult, previousSpecialist, dreamRuntimeModeRaw)) {
      return {
        specialist: clearCompareForResolvedDisplay(specialistResult),
        compare: null,
        pendingState: null,
      };
    }
    if (!isCompareIntentEligibleSpecialist(specialistResult)) {
      return {
        specialist: clearCompareForResolvedDisplay(specialistResult),
        compare: null,
        pendingState: null,
      };
    }
    if (isOfftopic) return { specialist: specialistResult, compare: null, pendingState: null };
    const previousCompare = readPendingInteractionState(state);
    const fallbackUserRaw = forcePending
      ? String(previousCompare?.render_model.user_text || "").trim()
      : "";
    const userRaw = String(userTextRaw || fallbackUserRaw).trim();
    const submittedIntent = normalizePendingSuggestionIntent(params.submittedTextIntent);
    const submittedAnchor = normalizePendingSuggestionAnchor(params.submittedTextAnchor);
    const dreamBuilderContext = isDreamBuilderContext(stepId, dreamRuntimeModeRaw);
    const suggestionRawCandidate = deps.pickDualChoiceSuggestion(
      stepId,
      specialistResult,
      previousSpecialist,
      userRaw,
      { allowDreamBuilderSuggestionShape: dreamBuilderContext }
    );
    const suggestionRaw = unwrapSelectionHeadingFromText(
      stepId,
      state,
      activeSpecialist,
      suggestionRawCandidate
    );
    if (!userRaw || !suggestionRaw) {
      return { specialist: specialistResult, compare: null, pendingState: null };
    }
    const mode: CompareMode =
      isListChoiceScope(stepId, activeSpecialist) || dreamBuilderContext ? "list" : "text";
    const isSemanticallyContributingTurn =
      mode === "list"
        ? Boolean(userRaw)
        : acceptedOutputUserTurnClassification?.turn_kind === "step_variant" ||
          acceptedOutputUserTurnClassification?.turn_kind === "raw_source_content" ||
          acceptedOutputUserTurnClassification?.turn_kind === "feedback_on_existing_content";
    if (!forcePending && !isSemanticallyContributingTurn) {
      return { specialist: specialistResult, compare: null, pendingState: null };
    }
    const targetField = deps.fieldForStep(stepId);
    const stateRecord = state as Record<string, unknown>;
    const provisionalByStep =
      stateRecord.provisional_by_step && typeof stateRecord.provisional_by_step === "object"
        ? (stateRecord.provisional_by_step as Record<string, unknown>)
        : {};
    const existingTargetValue = targetField
      ? String(previousSpecialist[targetField] || provisionalByStep[stepId] || stateRecord[`${targetField}_final`] || "")
        .trim()
      : "";
    const shouldPreferInitialDreamPicker =
      stepId === deps.dreamStepId &&
      mode === "text" &&
      !dreamBuilderContext &&
      !forcePending &&
      !existingTargetValue;
    let normalizedUser = mode === "list"
      ? deps.normalizeListUserInput(userRaw)
      : deps.normalizeUserInputAgainstSuggestion(userRaw, suggestionRaw);
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, previousSpecialist) : [];
    const suggestionFullItems = mode === "list" ? pickCompareSuggestionList(specialistResult, suggestionRaw) : [];
    let listSemantics: CompareListSemantics = "delta";
    let userRawItems = mode === "list"
      ? parseUserListItemsForStep(stepId, userRaw, suggestionFullItems)
      : [];
    let userItems = mode === "list" ? diffListItems(baseItems, userRawItems) : [];
    let fallbackUserItems = mode === "list"
      ? userRawItems.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    let effectiveUserItems = mode === "list" && userItems.length === 0
      ? fallbackUserItems
      : userItems;
    let suggestionItems = mode === "list" ? diffListItems(baseItems, suggestionFullItems) : [];
    let localUserItems = mode === "list"
      ? (effectiveUserItems.length > 0 ? [...effectiveUserItems] : [...fallbackUserItems])
      : [];
    if (mode === "list") {
      const listIntent = resolveBusinessListIntent({
        stepId,
        userRaw,
        baseItems,
        suggestionItems: suggestionFullItems,
      });
      if (listIntent) {
        listSemantics = listIntent.semantics;
        userRawItems = listIntent.userItems;
        userItems = listIntent.userItems;
        fallbackUserItems = listIntent.userItems;
        effectiveUserItems = listIntent.userItems;
        suggestionItems = listIntent.suggestionItems;
        normalizedUser = listIntent.normalizedUser || normalizedUser;
        localUserItems = listIntent.userItems;
      }
    }
    const compareDeltaListSemantics = listSemantics;
    localUserItems = mode === "list"
      ? mergeListItems([], localUserItems.length > 0 ? localUserItems : (effectiveUserItems.length > 0 ? effectiveUserItems : fallbackUserItems))
      : [];
    const dreamBuilderOverlapComparePlan =
      dreamBuilderContext &&
      mode === "list" &&
      String(specialistResult.__dream_builder_overlap_existing_statement || "").trim() &&
      String(specialistResult.__dream_builder_overlap_incoming_statement || "").trim() &&
      suggestionFullItems.length === 1
        ? buildDreamBuilderOverlapComparePlan({
            baseItems,
            existingItem: String(specialistResult.__dream_builder_overlap_existing_statement || "").trim(),
            incomingItem: String(specialistResult.__dream_builder_overlap_incoming_statement || "").trim(),
            suggestionItem: suggestionFullItems[0],
          })
        : null;
    const businessListOverlapComparePlan =
      !dreamBuilderContext &&
      mode === "list" &&
      compareDeltaListSemantics === "delta" &&
      localUserItems.length === 1 &&
      suggestionFullItems.length === 1
        ? buildBusinessListOverlapComparePlan({
            baseItems,
            incomingItems: localUserItems,
            suggestionItems: suggestionFullItems,
          })
        : null;
    if (businessListOverlapComparePlan) {
      listSemantics = "overlap_merge";
    }
    const groupedListCompareEnabled =
      mode === "list" &&
      shouldUseGroupedListCompare({
        stepId,
        dreamBuilderContext,
        baseItems,
        userItems: effectiveUserItems.length > 0 ? effectiveUserItems : fallbackUserItems,
        suggestionItems,
      });
    if (groupedListCompareEnabled) {
      const fullUserItems = mergeListItems(
        listSemantics === "full" ? [] : baseItems,
        effectiveUserItems.length > 0 ? effectiveUserItems : fallbackUserItems
      );
      const fullSuggestionItems = mergeListItems(
        listSemantics === "full" ? [] : baseItems,
        suggestionFullItems.length > 0 ? suggestionFullItems : suggestionItems
      );
      listSemantics = "full";
      userRawItems = fullUserItems;
      userItems = fullUserItems;
      fallbackUserItems = fullUserItems;
      effectiveUserItems = fullUserItems;
      suggestionItems = fullSuggestionItems;
      if (fullUserItems.length > 0) {
        normalizedUser = fullUserItems.join("\n");
      }
    }
    if (mode === "list" && !forcePending && effectiveUserItems.length === 0) {
      return { specialist: specialistResult, compare: null, pendingState: null };
    }
    const userRawSafe = stripMarkupPreserveLines(userRaw);
    const normalizedUserSafe = stripMarkupPreserveLines(normalizedUser);
    const equivalent = deps.areEquivalentCompareVariants({
      mode,
      userRaw: normalizedUserSafe,
      suggestionRaw,
      userItems: effectiveUserItems,
      suggestionItems,
    });
    if (equivalent && !forcePending) {
      const chosenItems = mode === "list"
        ? (
          listSemantics === "full"
            ? mergeListItems([], suggestionItems.length > 0 ? suggestionItems : effectiveUserItems)
            : mergeListItems(baseItems, suggestionItems.length > 0 ? suggestionItems : effectiveUserItems)
        )
        : [];
      const chosen = mode === "list"
        ? chosenItems.join("\n")
        : (String(suggestionRaw || "").trim() || normalizedUser);
      const autoSelectedBase: Record<string, unknown> = {
        ...clearCompareForResolvedDisplay(specialistResult),
        refined_formulation: chosen,
        ...(mode === "list" ? { statements: chosenItems } : {}),
      };
      return {
        specialist: clearCompareForResolvedDisplay(withUpdatedTargetField(autoSelectedBase, stepId, chosen)),
        compare: null,
        pendingState: null,
      };
    }
    if (!forcePending && !deps.isMaterialRewriteCandidate(userRaw, suggestionRaw)) {
      if (mode === "text") {
        const correctedValue = String(
          deps.normalizeUserInputAgainstSuggestion(userRaw, suggestionRaw) || suggestionRaw || userRaw
        ).trim();
        const correctedSafe = stripMarkupPreserveLines(correctedValue);
        if (correctedSafe) {
          const corrected = withUpdatedTargetField(
            {
              ...specialistResult,
              refined_formulation: correctedSafe,
            },
            stepId,
            correctedSafe
          );
          return { specialist: corrected, compare: null, pendingState: null };
        }
      }
      return { specialist: specialistResult, compare: null, pendingState: null };
    }
    const pendingMessage = mode === "list"
      ? sanitizePendingListMessage(
        String(specialistResult.message || ""),
        mergeListItems(baseItems, suggestionFullItems),
        state,
        specialistResult
      )
      : sanitizePendingTextMessage(
        String(specialistResult.message || ""),
        String(suggestionRaw || "")
      );
    const feedbackReason = resolvePendingCompareFeedbackReason({
      stepId,
      state,
      mode,
      forcePending: Boolean(forcePending),
      specialistResult,
      pendingMessage,
      suggestionRaw,
      userRaw,
      knownItems: mergeListItems(baseItems, suggestionFullItems),
    });
    const committedTextFromPrev = targetField ? String(previousSpecialist[targetField] || "").trim() : "";
    const committedText = mode === "list" ? baseItems.join("\n") : committedTextFromPrev;
    const clarifyCompare =
      deps.isCompareIntentV1Enabled() &&
      mode === "text" &&
      !forcePending &&
      looksLikeDualClarificationPrompt(previousSpecialist)
        ? true
        : false;
    const rawComparePlan =
      dreamBuilderOverlapComparePlan ||
      businessListOverlapComparePlan ||
      (groupedListCompareEnabled
        ? (
          dreamBuilderContext
            ? buildDreamBuilderComparePlan({
                baseItems,
                userItems: effectiveUserItems,
                suggestionItems,
                deltaUserItems: localUserItems,
              })
            : buildBusinessListComparePlan({
                baseItems,
                userItems: effectiveUserItems,
                suggestionItems,
                deltaUserItems: localUserItems,
                preferDeltaGrouping: compareDeltaListSemantics === "delta",
              })
        )
        : null);
    const comparePlan = rawComparePlan
      ? withGroupedCompareUnitFeedback({
          stepId,
          plan: rawComparePlan,
          specialistResult,
          state,
        })
      : null;
    const fallbackFeedbackReason = fallbackPendingCompareFeedbackReason({
      stepId,
      state,
      pendingMessage,
    });
    const explicitUserPickFeedback = sanitizeUserPickFeedbackTextForDisplay(
      String(specialistResult.user_pick_feedback_text || "").trim()
    );
    const shouldRequireAgentDrivenListCompare =
      mode === "list" &&
      isBusinessListIntentScope(stepId) &&
      Boolean(comparePlan || businessListOverlapComparePlan || groupedListCompareEnabled);
    const effectiveFeedbackReason =
      String(feedbackReason || "").trim() ||
      String(comparePlan?.initialUnit.feedback_reason_text || "").trim() ||
      (shouldRequireAgentDrivenListCompare ? "" : fallbackFeedbackReason);
    const pendingSuggestionSeedSource = seedSourceForPendingSuggestion({
      intent: submittedIntent,
      anchor: submittedAnchor,
    });
    const wordingLabels = compareLabelsForStep({
      stepId,
      mode,
      state,
      grouped: Boolean(comparePlan),
      clarify: clarifyCompare,
    });
    const feedbackText = String(params.submittedFeedbackText || "").trim();
    const feedbackMode = normalizeFeedbackMode(specialistResult.feedback_mode);
    const effectiveFeedbackMode =
      shouldPreferInitialDreamPicker && feedbackMode !== "refine_current"
        ? "compare_suggestion"
        : feedbackMode;
    const groupedRetainedItems = comparePlan
      ? visibleRetainedItemsForGroupedCompare(comparePlan.segments, comparePlan.units)
      : [];
    const groupedRemainingUnits = comparePlan
      ? groupedPendingUnitsForRender(comparePlan.units.slice(1))
      : [];
    const simpleRetainedItems =
      mode === "list" && !comparePlan && listSemantics !== "full"
        ? mergeListItems([], baseItems)
        : [];
    const compareRenderModel = comparePlan
      ? buildPendingInteractionRenderModel({
          stepId,
          state,
          mode,
          listSemantics: listSemantics,
          feedbackReasonText: String(comparePlan.initialUnit.feedback_reason_text || effectiveFeedbackReason || "").trim(),
          userLabel: wordingLabels.userLabel || "",
          suggestionLabel: wordingLabels.suggestionLabel || "",
          userText: comparePlan.initialUnit.user_text,
          suggestionText: comparePlan.initialUnit.suggestion_text,
          userItems: comparePlan.initialUnit.user_items,
          suggestionItems: comparePlan.initialUnit.suggestion_items,
          instruction: groupedListInstructionForState(state, groupedRetainedItems),
          retainedItems: groupedRetainedItems,
          units: groupedRemainingUnits,
        })
      : buildPendingInteractionRenderModel({
          stepId,
          state,
          mode,
          listSemantics: listSemantics,
          feedbackReasonText: effectiveFeedbackReason,
          userLabel: wordingLabels.userLabel || "",
          suggestionLabel: wordingLabels.suggestionLabel || "",
          userText: normalizedUserSafe,
          suggestionText: suggestionRaw,
          userItems: effectiveUserItems,
          suggestionItems,
          instruction: compareInstructionForState(state),
          retainedItems: simpleRetainedItems,
        });
    const pendingState = {
      id: String(previousCompare?.id || "").trim(),
      status: "pending",
      kind: mode === "list" ? "list_compare" : "text_compare",
      render_model: compareRenderModel,
    } as const;
    let enriched: Record<string, unknown> = patchPendingInteractionState({
      ...specialistResult,
      message: pendingMessage,
      feedback_mode: effectiveFeedbackMode,
    }, pendingState);
    if (targetField) {
      enriched[targetField] = committedText;
    }
    if (mode === "list") {
      enriched.statements = baseItems;
    }
    enriched.refined_formulation =
      committedText || String(previousSpecialist.refined_formulation || "").trim();
    if (!effectiveFeedbackReason || (shouldRequireAgentDrivenListCompare && !explicitUserPickFeedback)) {
      if (shouldRequireAgentDrivenListCompare && previousSpecialist && typeof previousSpecialist === "object") {
        return {
          specialist: clearCompareForResolvedDisplay(previousSpecialist as Record<string, unknown>),
          compare: null,
          pendingState: null,
        };
      }
      return {
        specialist: clearCompareForResolvedDisplay(enriched),
        compare: null,
        pendingState: null,
      };
    }
    if (comparePlan && !String(comparePlan.initialUnit.feedback_reason_text || effectiveFeedbackReason || "").trim()) {
      return {
        specialist: clearCompareForResolvedDisplay(enriched),
        compare: null,
        pendingState: null,
      };
    }
    const compare = comparePayloadFromPendingInteractionState(
      pendingState,
      stepId,
      state
    );
    return { specialist: enriched, compare, pendingState };
  }

  function applyComparePickSelection(params: ComparePickSelectionParams): ComparePickSelectionResult {
    const { stepId, routeToken, state } = params;
    if (!isComparePickRouteToken(routeToken)) {
        return { handled: false, specialist: {}, nextState: state };
    }
    const stripStaleUiContractFields = (
      value: Record<string, unknown>
    ): Record<string, unknown> => {
      const {
        ui_content: _uiContent,
        ui_show_step_intro_chrome: _uiShowStepIntroChrome,
        ui_contract_id: _uiContractId,
        ui_contract_version: _uiContractVersion,
        ui_text_keys: _uiTextKeys,
        ...rest
      } = value;
      return rest;
    };
    const prevRaw = (((state as any).last_specialist_result || {}) as Record<string, unknown>);
    if (stepId === deps.dreamStepId && hasDreamBuilderPendingCompare(prevRaw)) {
      const dreamBuilderCompare = readDreamBuilderCompareRuntime(prevRaw);
      const pickedUser = routeToken === "__COMPARE_PICK_USER__";
      const segments = normalizeCompareSegments(dreamBuilderCompare?.segments);
      const currentItems = toTrimmedStringArray(dreamBuilderCompare?.current_items);
      const suggestedItems = toTrimmedStringArray(dreamBuilderCompare?.suggested_items);
      if (segments.length === 0 || currentItems.length === 0 || suggestedItems.length === 0) {
        return { handled: false, specialist: prevRaw, nextState: state };
      }
      const composedItems = composeDreamBuilderCompareSelection({
        segments,
        currentItems,
        suggestedItems,
        pickedUser,
      });
      const chosen = stripMarkupPreserveLines(composedItems.join("\n"));
      if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
      const selectedMessage = deps.compareSelectionMessage(
        stepId,
        state,
        String((state as any)?.active_specialist || "").trim(),
        chosen
      );
      const selected = withUpdatedTargetField(
        {
          ...clearCompareForResolvedDisplay(prevRaw),
          ...stripStaleUiContractFields(prevRaw),
          ...clearDreamBuilderCompareRuntime(prevRaw),
          message: selectedMessage,
          refined_formulation: chosen,
          feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
          user_pick_feedback_text: pickedUser ? String(prevRaw.user_pick_feedback_text || "").trim() : "",
          statements: composedItems,
        },
        stepId,
        chosen
      );
      const selectedWithCompare = clearCompareForResolvedDisplay(selected);
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selectedWithCompare[targetField] || "").trim() : "";
      const stateForRender = clearPendingInteractionState(
        provisionalValue
          ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
          : state
      ) as CanvasState;
      const rendered = deps.renderFreeTextTurnPolicy({
        stepId,
        state: stateForRender,
        specialist: selectedWithCompare as Record<string, unknown>,
        previousSpecialist: prevRaw,
      });
      const renderedSpecialist = rendered.specialist as Record<string, unknown>;
      const selectedWithContract: Record<string, unknown> = {
        ...stripStaleUiContractFields(selectedWithCompare),
        action: "ASK",
        message: String(selectedWithCompare.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
        question: String(renderedSpecialist?.question || ""),
        ...(typeof renderedSpecialist?.ui_show_step_intro_chrome !== "undefined"
          ? { ui_show_step_intro_chrome: renderedSpecialist.ui_show_step_intro_chrome }
          : {}),
        ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
        ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
        ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
          ? renderedSpecialist.ui_text_keys
          : (rendered.textKeys || []),
      };
      const suggestionSafeSelectedWithContract = pickedUser
        ? selectedWithContract
        : scrubSuggestionPickArtifacts({
            stepId,
            state: stateForRender,
            fallbackMessage: selectedMessage,
            result: selectedWithContract,
          });
      const nextState: CanvasState = {
        ...withAcceptedListSelectionState(state, stepId, composedItems),
        last_specialist_result: suggestionSafeSelectedWithContract,
      };
      const nextDreamStatementCount = Array.isArray((nextState as Record<string, unknown>).dream_builder_statements)
        ? ((nextState as Record<string, unknown>).dream_builder_statements as unknown[]).length
        : 0;
      if (stepId === deps.dreamStepId && nextDreamStatementCount >= 20) {
        return {
          handled: true,
          specialist: suggestionSafeSelectedWithContract,
          nextState,
          continueUserMessage: "__ROUTE__DREAM_EXPLAINER_CONTINUE__",
        };
      }
      return {
        handled: true,
        specialist: suggestionSafeSelectedWithContract,
        nextState,
        actionCodes: Array.isArray(rendered.uiActionCodes) ? rendered.uiActionCodes : [],
        renderedActions: Array.isArray(rendered.uiActions) ? rendered.uiActions : [],
        contractMeta: {
          contractId: String(rendered.contractId || suggestionSafeSelectedWithContract.ui_contract_id || ""),
          contractVersion: String(rendered.contractVersion || suggestionSafeSelectedWithContract.ui_contract_version || ""),
          textKeys: Array.isArray(rendered.textKeys) ? rendered.textKeys : [],
        },
      };
    }
    const prevCompare = readPendingInteractionState(state);
    if (!prevCompare) {
      return { handled: false, specialist: prevRaw, nextState: state };
    }
    const pickedUser = routeToken === "__COMPARE_PICK_USER__";
    const mode: CompareMode = prevCompare.kind === "list_compare" ? "list" : "text";
    const prevRenderModel = prevCompare.render_model;
    if (mode === "list" && (prevRenderModel.units || []).length > 0) {
      const pickedCurrentItems = mergeListItems(
        [],
        pickedUser ? prevRenderModel.user_items : prevRenderModel.suggestion_items
      );
      const nextRetainedItems = mergeListItems([], [
        ...prevRenderModel.retained_items,
        ...pickedCurrentItems,
      ]);
      const [nextUnit, ...remainingUnits] = prevRenderModel.units || [];
      if (nextUnit) {
        const nextRenderModel = buildPendingInteractionRenderModel({
          stepId,
          state,
          mode: "list",
          listSemantics:
            prevRenderModel.list_semantics === "full"
              ? "full"
              : prevRenderModel.list_semantics === "overlap_merge"
                ? "overlap_merge"
                : "delta",
          feedbackReasonText: String(nextUnit.feedback_reason_text || "").trim(),
          userLabel: prevRenderModel.user_label,
          suggestionLabel: prevRenderModel.suggestion_label,
          userText: nextUnit.user_items.join("\n"),
          suggestionText: nextUnit.suggestion_items.join("\n"),
          userItems: nextUnit.user_items,
          suggestionItems: nextUnit.suggestion_items,
          instruction: groupedListInstructionForState(state, nextRetainedItems),
          retainedItems: nextRetainedItems,
          units: remainingUnits,
        });
        const nextPending: Record<string, unknown> = patchPendingInteractionState({
          ...prevRaw,
          ...clearedResolvedCompareTransientFields(),
        }, {
          id: prevCompare.id,
          kind: "list_compare",
          render_model: nextRenderModel,
        });
        const nextState: CanvasState = {
          ...state,
          pending_interaction_state:
            (nextPending.pending_interaction_state as Record<string, unknown>) || ({} as Record<string, unknown>),
          last_specialist_result: clearPendingInteractionState(nextPending),
        };
        return { handled: true, specialist: nextPending, nextState };
      }

      const composedItems = nextRetainedItems;
      const chosen = stripMarkupPreserveLines(composedItems.join("\n"));
      if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
      const selectedMessage = deps.compareSelectionMessage(stepId, state, String((state as any)?.active_specialist || "").trim(), chosen);
      const selected = withUpdatedTargetField(
        {
          ...stripStaleUiContractFields(prevRaw),
          ...clearCompareForResolvedDisplay(prevRaw),
          message: selectedMessage,
          refined_formulation: chosen,
          feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
          user_pick_feedback_text: pickedUser ? String(prevRaw.user_pick_feedback_text || "").trim() : "",
          ...(mode === "list" ? { statements: composedItems } : {}),
        },
        stepId,
        chosen
      );
      const selectedCompare = clearCompareForResolvedDisplay(selected);
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
      const stateForRender = clearPendingInteractionState(
        provisionalValue
          ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
          : state
      ) as CanvasState;
      const rendered = deps.renderFreeTextTurnPolicy({
        stepId,
        state: stateForRender,
        specialist: selectedCompare as Record<string, unknown>,
        previousSpecialist: prevRaw,
      });
      const renderedSpecialist = rendered.specialist as Record<string, unknown>;
      const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
      const selectedWithContract: Record<string, unknown> = {
        ...stripStaleUiContractFields(selectedCompare),
        action: "ASK",
        message: String(selectedCompare.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
        question: String(renderedSpecialist?.question || ""),
        ...(renderedUiContent ? { ui_content: renderedUiContent } : {}),
        ...(typeof renderedSpecialist?.ui_show_step_intro_chrome !== "undefined"
          ? { ui_show_step_intro_chrome: renderedSpecialist.ui_show_step_intro_chrome }
          : {}),
        ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
        ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
        ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
          ? renderedSpecialist.ui_text_keys
          : rendered.textKeys,
      };
      const suggestionSafeSelectedWithContract = pickedUser
        ? selectedWithContract
        : scrubSuggestionPickArtifacts({
            stepId,
            state: stateForRender,
            fallbackMessage: selectedMessage,
            result: selectedWithContract,
          });
      const selectedContractId = String(rendered.contractId || suggestionSafeSelectedWithContract.ui_contract_id || "");
      const nextState: CanvasState = {
        ...withAcceptedListSelectionState(stateForRender, stepId, composedItems),
        pending_interaction_state: {} as Record<string, unknown>,
        last_specialist_result: clearPendingInteractionState(suggestionSafeSelectedWithContract),
      };
      deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
      return {
        handled: true,
        specialist: suggestionSafeSelectedWithContract,
        nextState,
        actionCodes: Array.isArray(rendered.uiActionCodes) ? rendered.uiActionCodes : [],
        renderedActions: Array.isArray(rendered.uiActions) ? rendered.uiActions : [],
        contractMeta: {
          contractId: String(rendered.contractId || suggestionSafeSelectedWithContract.ui_contract_id || ""),
          contractVersion: String(rendered.contractVersion || suggestionSafeSelectedWithContract.ui_contract_version || ""),
          textKeys: Array.isArray(rendered.textKeys) ? rendered.textKeys : [],
        },
      };
    }
    const activeSpecialist = String((state as any)?.active_specialist || "").trim();
    const fallbackPickedRaw = pickedUser
      ? String(prevRenderModel.user_text || "").trim()
      : String(prevRenderModel.suggestion_text || prevRaw.refined_formulation || "").trim();
    const fallbackPickedText = mode === "list"
      ? unwrapSelectionHeadingFromText(stepId, state, activeSpecialist, fallbackPickedRaw)
      : fallbackPickedRaw;
    const pickedItems = mode === "list"
      ? (() => {
        const fromPending = pickedUser
            ? toTrimmedStringArray(prevRenderModel.user_items)
            : toTrimmedStringArray(prevRenderModel.suggestion_items);
          if (fromPending.length > 0) return fromPending;
          return deps.parseListItems(fallbackPickedText);
        })()
      : [];
    const acceptedListSemantics: CompareListSemantics =
      mode === "list" &&
      (prevRenderModel.list_semantics === "full" || prevRenderModel.list_semantics === "overlap_merge")
        ? prevRenderModel.list_semantics
        : "delta";
    const committedItems = mode === "list" ? extractCommittedListItems(stepId, prevRaw) : [];
    const explicitRetainedItems = mode === "list"
      ? toTrimmedStringArray(prevRenderModel.retained_items)
      : [];
    const retainedItemsForAcceptedSelection = mode === "list"
      ? retainedItemsForAcceptedListSelection({
        listSemantics: acceptedListSemantics,
        committedItems,
        retainedItems: explicitRetainedItems,
        currentItems: toTrimmedStringArray(prevRenderModel.user_items),
      })
      : [];
    const mergedPickedItems = mode === "list"
      ? mergeListItems(
        explicitRetainedItems.length > 0
          ? explicitRetainedItems
          : acceptedListSemantics === "full"
            ? []
            : acceptedListSemantics === "overlap_merge"
              ? retainedItemsForAcceptedSelection
              : committedItems,
        pickedItems
      )
      : [];
    const rawChosen = mode === "list"
      ? mergedPickedItems.join("\n")
      : unwrapSelectionHeadingFromText(stepId, state, activeSpecialist, fallbackPickedRaw);
    const chosenRaw = stepId === deps.entityStepId ? deps.normalizeEntityPhrase(rawChosen) || rawChosen : rawChosen;
    const chosen = stripMarkupPreserveLines(chosenRaw);
    if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
    const userFeedback = userChoiceFeedbackMessage(
      stepId,
      state,
      prevRaw,
      activeSpecialist,
      params.telemetry,
      chosen
    );
    const selectedMessage = pickedUser
      ? userFeedback
      : deps.compareSelectionMessage(stepId, state, activeSpecialist, chosen);
    const selected = withUpdatedTargetField(
      {
        ...stripStaleUiContractFields(prevRaw),
        ...clearCompareForResolvedDisplay(prevRaw),
        message: selectedMessage,
        refined_formulation: chosen,
        feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
        user_pick_feedback_text: pickedUser ? String(prevRaw.user_pick_feedback_text || "").trim() : "",
        ...(mode === "list" ? { statements: mergedPickedItems } : {}),
      },
      stepId,
      chosen
    );
    const selectedCompare = clearCompareForResolvedDisplay(selected);
    const targetField = deps.fieldForStep(stepId);
    const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
    const stateForRender = clearPendingInteractionState(
      provisionalValue
        ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
        : state
    ) as CanvasState;
    const rendered = deps.renderFreeTextTurnPolicy({
      stepId,
      state: stateForRender,
      specialist: selectedCompare as Record<string, unknown>,
      previousSpecialist: prevRaw,
    });
    const renderedSpecialist = rendered.specialist as Record<string, unknown>;
    const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
    const selectedWithContract: Record<string, unknown> = {
      ...stripStaleUiContractFields(selectedCompare),
      action: "ASK",
      message: String(selectedCompare.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
      question: String(renderedSpecialist?.question || ""),
      ...(renderedUiContent ? { ui_content: renderedUiContent } : {}),
      ...(typeof renderedSpecialist?.ui_show_step_intro_chrome !== "undefined"
        ? { ui_show_step_intro_chrome: renderedSpecialist.ui_show_step_intro_chrome }
        : {}),
      ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
      ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
      ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
        ? renderedSpecialist.ui_text_keys
        : rendered.textKeys,
    };
    const suggestionSafeSelectedWithContract = pickedUser
      ? selectedWithContract
      : scrubSuggestionPickArtifacts({
          stepId,
          state: stateForRender,
          fallbackMessage: selectedMessage,
          result: selectedWithContract,
        });
    const selectedContractId = String(rendered.contractId || suggestionSafeSelectedWithContract.ui_contract_id || "");
    const nextState: CanvasState = {
      ...withAcceptedListSelectionState(stateForRender, stepId, mergedPickedItems),
      pending_interaction_state: {} as Record<string, unknown>,
      last_specialist_result: clearPendingInteractionState(suggestionSafeSelectedWithContract),
    };
    deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
    const nextDreamStatementCount = Array.isArray((nextState as Record<string, unknown>).dream_builder_statements)
      ? ((nextState as Record<string, unknown>).dream_builder_statements as unknown[]).length
      : 0;
    if (stepId === deps.dreamStepId && nextDreamStatementCount >= 20) {
      return {
        handled: true,
        specialist: suggestionSafeSelectedWithContract,
        nextState,
        continueUserMessage: "__ROUTE__DREAM_EXPLAINER_CONTINUE__",
      };
    }
    return {
      handled: true,
      specialist: suggestionSafeSelectedWithContract,
      nextState,
      actionCodes: Array.isArray(rendered.uiActionCodes) ? rendered.uiActionCodes : [],
      renderedActions: Array.isArray(rendered.uiActions) ? rendered.uiActions : [],
      contractMeta: {
        contractId: String(rendered.contractId || suggestionSafeSelectedWithContract.ui_contract_id || ""),
        contractVersion: String(rendered.contractVersion || suggestionSafeSelectedWithContract.ui_contract_version || ""),
        textKeys: Array.isArray(rendered.textKeys) ? rendered.textKeys : [],
      },
    };
  }

  function buildCompareFromPendingSpecialist(
    specialist: Record<string, unknown>,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    previousSpecialist?: Record<string, unknown>,
    stepIdHint = "",
    dreamRuntimeModeRaw?: unknown
  ): CompareUiPayload | null {
    const compareState = readPendingInteractionState(state);
    const stepId = String(stepIdHint || "").trim();
    const dreamBuilderComparePending =
      stepId === deps.dreamStepId &&
      Boolean(readDreamBuilderCompareRuntime(specialist));
    if (dreamBuilderComparePending) return null;
    if (!compareState && !dreamBuilderComparePending) return null;
    if (!stepId) return null;
    if (!isCompareIntentEligibleSpecialist(specialist)) return null;
    if (
      !isCompareEligibleContext(
        stepId,
        activeSpecialist,
        specialist,
        previousSpecialist || {},
        dreamRuntimeModeRaw
      )
    ) {
      return null;
    }
    return comparePayloadFromPendingInteractionState(compareState, stepId, state);
  }

  return {
    isCompareEligibleStep,
    isCompareEligibleContext,
    isListChoiceScope,
    sanitizePendingListMessage,
    copyPendingCompareState,
    mergeListItems,
    pickCompareAgentBase,
    isRefineAdjustRouteToken,
    isComparePickRouteToken,
    stripUnsupportedReformulationClaims,
    buildCompareFromTurn,
    applyComparePickSelection,
    buildCompareFromPendingSpecialist,
  };
}
