import type { CanvasState, ProvisionalSource } from "../core/state.js";
import { isSingleValueCompareStep } from "../steps/step_registry.js";
import {
  formatCompareFeedbackForDisplay,
  formatUserPickFeedbackForDisplay,
  sanitizeFeedbackReasonForDisplay,
} from "../core/feedback_display.js";
import type { CompareUiPayload } from "./run_step_ui_payload.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import { resolveBusinessListTurn } from "./run_step_business_list_turn.js";
import {
  attachCompareRuntime,
  clearCompareRuntime,
  patchCompareRuntime,
  readCompareRuntime,
} from "./compare_runtime.js";
import {
  clearDreamBuilderCompareRuntime,
  patchDreamBuilderCompareRuntime,
  readDreamBuilderCompareRuntime,
} from "./dream_builder_compare_runtime.js";

type CompareMode = "text" | "list";
type CompareListSemantics = "delta" | "full";
type ComparePresentation = "picker" | "canonical";
type FeedbackMode = "none" | "affirm_input" | "compare_suggestion" | "refine_current";
type CompareCompareMode = "" | "grouped_units";
type CompareCompareResolution = "user" | "suggestion" | "";
type CompareCompareConfidence = "anchored" | "fallback";
type PendingSuggestionIntent =
  | "accept_suggestion_explicit"
  | "reject_suggestion_explicit"
  | "feedback_on_suggestion"
  | "content_input"
  | "";
type PendingSuggestionAnchor = "suggestion" | "user_input" | "";

type RenderFreeTextTurnPolicyResult = {
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
};

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

type DreamBuilderCompareKind = "batch_rewrite_compare" | "overlap_merge_compare";

type ComparePickSelectionParams = {
  stepId: string;
  routeToken: string;
  state: CanvasState;
  telemetry?: unknown;
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
  mode: "grouped_units";
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
  shouldTreatAsStepContributingInput: (input: string, stepId: string) => boolean;
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
  }) => RenderFreeTextTurnPolicyResult;
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

  function compareScaffoldComparables(
    state: CanvasState | null | undefined,
    specialist?: Record<string, unknown> | null
  ): Set<string> {
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
      String(readCompareRuntime(specialist)?.user_label || ""),
      String(readCompareRuntime(specialist)?.suggestion_label || ""),
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
    if (!isCompareEligibleStep(stepId)) return false;
    if (!isDreamBuilderContext(stepId, dreamRuntimeModeRaw)) return true;
    const current = specialist || {};
    const previous = previousSpecialist || {};
    if (deps.normalizeDreamRuntimeMode(dreamRuntimeModeRaw) === "builder_scoring") return false;
    const currentScoringPhase = String(current.scoring_phase || "").trim() === "true";
    const previousScoringPhase = String(previous.scoring_phase || "").trim() === "true";
    if (currentScoringPhase || previousScoringPhase) return false;
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

  function resolveComparePresentation(params: {
    stepId: string;
    mode: CompareMode;
    previousSpecialist: Record<string, unknown>;
    forcePending: boolean;
    submittedTextIntent?: string;
    submittedTextAnchor?: string;
  }): ComparePresentation {
    const { stepId, mode } = params;
    if (!isSingleValueTextChoiceStep(stepId, mode)) return "picker";
    return "picker";
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
    const previousCompare = readCompareRuntime(previous);
    if (previousCompare?.status !== "pending") return attachCompareRuntime(currentRecord);
    return patchCompareRuntime(
      {
        ...currentRecord,
        feedback_mode: String((previous as Record<string, unknown>).feedback_mode || "none"),
      },
      {
        ...previousCompare,
        status: "pending",
        resolution: "",
      }
    );
  }

  function clearedResolvedCompareTransientFields(): Record<string, unknown> {
    return {
      feedback_reason_text: "",
      feedback_mode: "none",
    };
  }

  function clearCompareForResolvedDisplay(base: Record<string, unknown>): Record<string, unknown> {
    return {
      ...clearCompareRuntime(base),
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
    if (!params.dreamBuilderContext) return false;
    return false;
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
    if (Array.isArray(previous.compare_base_items)) {
      return toTrimmedStringArray(previous.compare_base_items);
    }
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
        mode: "grouped_units",
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
      mode: "grouped_units",
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
      mode: "grouped_units",
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
      mode: "grouped_units",
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
      mode: "grouped_units",
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
      mode: "grouped_units",
      units: [unit],
      segments,
      initialUnit: unit,
    };
  }

  function buildDreamBuilderPendingCompareSpecialist(params: {
    specialistResult: Record<string, unknown>;
    comparePlan: BusinessListComparePlan;
    compareKind: DreamBuilderCompareKind;
    message: string;
    rationale: string;
    currentLabel: string;
    suggestedLabel: string;
    retainedHeading: string;
    instruction: string;
    targetField: string;
    committedText: string;
    baseItems: string[];
  }): Record<string, unknown> {
    const {
      specialistResult,
      comparePlan,
      compareKind,
      message,
      rationale,
      currentLabel,
      suggestedLabel,
      retainedHeading,
      instruction,
      targetField,
      committedText,
      baseItems,
    } = params;
    return attachCompareRuntime(
      patchDreamBuilderCompareRuntime(
        {
          ...clearDreamBuilderCompareRuntime(clearCompareRuntime(specialistResult)),
          ...clearedResolvedCompareTransientFields(),
          message,
          feedback_reason_text: rationale,
          ...(targetField ? { [targetField]: committedText } : {}),
          statements: baseItems,
          refined_formulation: committedText,
        },
        {
          kind: compareKind,
          current_items: comparePlan.initialUnit.user_items,
          suggested_items: comparePlan.initialUnit.suggestion_items,
          segments: comparePlan.segments,
          rationale,
          current_label: currentLabel,
          suggested_label: suggestedLabel,
          instruction,
        }
      )
    );
  }

  function buildDreamBuilderPendingSimpleCompareSpecialist(params: {
    specialistResult: Record<string, unknown>;
    compareKind: DreamBuilderCompareKind;
    message: string;
    rationale: string;
    currentLabel: string;
    suggestedLabel: string;
    retainedHeading: string;
    instruction: string;
    targetField: string;
    committedText: string;
    baseItems: string[];
    currentItems: string[];
    suggestedItems: string[];
    retainedItems: string[];
  }): Record<string, unknown> {
    const {
      specialistResult,
      compareKind,
      message,
      rationale,
      currentLabel,
      suggestedLabel,
      retainedHeading,
      instruction,
      targetField,
      committedText,
      baseItems,
      currentItems,
      suggestedItems,
      retainedItems,
    } = params;
    const segments: CompareCompareSegment[] = [];
    if (retainedItems.length > 0) {
      segments.push({ kind: "retained", items: retainedItems });
    }
    segments.push({ kind: "unit", unit_id: "unit_1" });
    return attachCompareRuntime(
      patchDreamBuilderCompareRuntime(
        {
          ...clearDreamBuilderCompareRuntime(clearCompareRuntime(specialistResult)),
          ...clearedResolvedCompareTransientFields(),
          message,
          feedback_reason_text: rationale,
          ...(targetField ? { [targetField]: committedText } : {}),
          statements: baseItems,
          refined_formulation: committedText,
        },
        {
          kind: compareKind,
          current_items: currentItems,
          suggested_items: suggestedItems,
          segments,
          rationale,
          current_label: currentLabel,
          suggested_label: suggestedLabel,
          instruction,
        }
      )
    );
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
    const blockedComparables = compareScaffoldComparables(state, specialist);
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

  function userPickFeedbackReason(state: CanvasState, prev: Record<string, unknown>): string {
    const explicitReason = resolveFeedbackReasonFromSpecialist(state, prev);
    if (explicitReason) return explicitReason;
    return "";
  }

  function resolvePendingCompareFeedbackReason(params: {
    stepId: string;
    state: CanvasState;
    mode: CompareMode;
    forcePending: boolean;
    specialistResult: Record<string, unknown>;
    suggestionRaw: string;
    userRaw: string;
    knownItems: string[];
  }): string {
    void params.mode;
    void params.knownItems;
    const explicitReason = resolveFeedbackReasonFromSpecialist(params.state, params.specialistResult);
    if (explicitReason) return explicitReason;
    if (
      params.stepId === deps.dreamStepId &&
      deps.isMaterialRewriteCandidate(params.userRaw, params.suggestionRaw)
    ) {
      return sanitizeFeedbackReasonForDisplay({
        stepId: params.stepId,
        rawReason: deps.uiStringFromStateMap(
          params.state,
          "compare.feedback.dream_builder.rewrite.default",
          deps.uiDefaultString("compare.feedback.dream_builder.rewrite.default", "")
        ),
        resolveString: (key, fallback = "") =>
          deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback)),
      });
    }
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
    if (
      params.stepId === deps.dreamStepId &&
      deps.isMaterialRewriteCandidate(params.unit.user_text, params.unit.suggestion_text)
    ) {
      return sanitizeFeedbackReasonForDisplay({
        stepId: params.stepId,
        rawReason: deps.uiStringFromStateMap(
          params.state,
          "compare.feedback.dream_builder.rewrite.default",
          deps.uiDefaultString("compare.feedback.dream_builder.rewrite.default", "")
        ),
        resolveString: (key, fallback = "") =>
          deps.uiStringFromStateMap(params.state, key, fallback || deps.uiDefaultString(key, fallback)),
      });
    }
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
      instruction: isDreamBuilderCompare
        ? (isDreamBuilderMergeChoice
            ? dreamBuilderMergeInstructionForState(params.state)
            : groupedListBaseInstructionForState(params.state))
        : groupedListInstructionForState(params.state, retainedItems),
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
    telemetry?: unknown
  ): string {
    void telemetry;
    const compare = readCompareRuntime(prev);
    const selectedValue = String(
      compare?.user_normalized_text || compare?.user_text || prev.refined_formulation || ""
    ).trim();
    const selection = deps.compareSelectionMessage(stepId, state, activeSpecialist, selectedValue);
    const rawFeedbackReason = userPickFeedbackReason(state, prev);
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(state, key, fallback || deps.uiDefaultString(key, fallback));
    const feedbackReason = formatUserPickFeedbackForDisplay({
      stepId,
      rawReason: rawFeedbackReason,
      resolveString,
    });
    const parts = [feedbackReason, selection].filter((part) => String(part || "").trim());
    return parts.join("\n\n").trim();
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
    const canonicalItems = mergeListItems([], selectedItems);
    return {
      ...state,
      dream_builder_statements: canonicalItems,
      ...(canonicalItems.length >= 20 ? { dream_scoring_statements: canonicalItems } : {}),
    } as CanvasState;
  }

  function pickCompareAgentBase(lastSpecialistResult: unknown): string {
    const result = lastSpecialistResult && typeof lastSpecialistResult === "object"
      ? (lastSpecialistResult as Record<string, unknown>)
      : {};
    const stored = stripMarkupPreserveLines(String(readCompareRuntime(result)?.suggestion_text || "").trim());
    if (stored) return stored;
    return stripMarkupPreserveLines(String(result.refined_formulation || "").trim());
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
  } {
    const previousSpecialist = attachCompareRuntime(params.previousSpecialist);
    const specialistResult = attachCompareRuntime(params.specialistResult);
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
      };
    }
    if (!isCompareIntentEligibleSpecialist(specialistResult)) {
      return {
        specialist: clearCompareForResolvedDisplay(specialistResult),
        compare: null,
      };
    }
    if (isOfftopic) return { specialist: attachCompareRuntime(specialistResult), compare: null };
    const previousCompare = readCompareRuntime(previousSpecialist);
    const fallbackUserRaw = forcePending
      ? String(previousCompare?.user_normalized_text || previousCompare?.user_text || "").trim()
      : "";
    const userRaw = String(userTextRaw || fallbackUserRaw).trim();
    if (!forcePending && !deps.shouldTreatAsStepContributingInput(userRaw, stepId)) {
      return { specialist: attachCompareRuntime(specialistResult), compare: null };
    }
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
    if (!userRaw || !suggestionRaw) return { specialist: attachCompareRuntime(specialistResult), compare: null };
    const mode: CompareMode =
      isListChoiceScope(stepId, activeSpecialist) || dreamBuilderContext ? "list" : "text";
    const basePresentation: ComparePresentation = resolveComparePresentation({
      stepId,
      mode,
      previousSpecialist,
      forcePending: Boolean(forcePending),
      submittedTextIntent: submittedIntent,
      submittedTextAnchor: submittedAnchor,
    });
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
    const presentation: ComparePresentation = basePresentation;
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
      return { specialist: attachCompareRuntime(specialistResult), compare: null };
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
      const autoSelected = patchCompareRuntime(
        withUpdatedTargetField(autoSelectedBase, stepId, chosen),
        {
          kind: mode === "list" ? "list_compare" : "text_compare",
          mode,
          status: "resolved",
          resolution: "suggestion",
          suggestion_text: chosen,
          base_items: mode === "list" ? chosenItems : [],
          list_semantics: "delta",
        }
      );
      return { specialist: attachCompareRuntime(autoSelected), compare: null };
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
          return { specialist: attachCompareRuntime(corrected), compare: null };
        }
      }
      return { specialist: attachCompareRuntime(specialistResult), compare: null };
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
    const effectiveFeedbackReason =
      String(feedbackReason || "").trim() ||
      String(comparePlan?.initialUnit.feedback_reason_text || "").trim();
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
    let enriched: Record<string, unknown> = patchCompareRuntime({
      ...specialistResult,
      message: pendingMessage,
      feedback_mode: effectiveFeedbackMode,
    }, {
      kind: mode === "list" ? "list_compare" : "text_compare",
      mode,
      status: "pending",
      presentation,
      resolution: "",
      user_text: userRawSafe,
      user_normalized_text: normalizedUserSafe,
      user_items: effectiveUserItems,
      suggestion_text: suggestionRaw,
      suggestion_items: suggestionItems,
      base_items: baseItems,
      list_semantics: listSemantics,
      user_label: wordingLabels.userLabel || "",
      suggestion_label: wordingLabels.suggestionLabel || "",
      grouped_mode: comparePlan?.mode || "",
      grouped_cursor: comparePlan ? "0" : "",
      grouped_units: comparePlan?.units || [],
      grouped_segments: comparePlan?.segments || [],
      feedback_reason_text: effectiveFeedbackReason,
      pending_text_intent: submittedIntent,
      pending_text_anchor: submittedAnchor,
      pending_text_presentation_mode: presentation,
    });
    if (comparePlan) {
      enriched = patchCompareRuntime(enriched, {
        user_text: comparePlan.initialUnit.user_text,
        user_normalized_text: comparePlan.initialUnit.user_text,
        user_items: comparePlan.initialUnit.user_items,
        suggestion_text: comparePlan.initialUnit.suggestion_text,
        suggestion_items: comparePlan.initialUnit.suggestion_items,
      });
    }
    if (targetField) {
      enriched[targetField] = committedText;
    }
    if (mode === "list") {
      enriched.statements = baseItems;
    }
    enriched.refined_formulation =
      committedText || String(previousSpecialist.refined_formulation || "").trim();
    if (!effectiveFeedbackReason) {
      return {
        specialist: attachCompareRuntime(clearCompareForResolvedDisplay(enriched)),
        compare: null,
      };
    }
    if (comparePlan && !String(comparePlan.initialUnit.feedback_reason_text || "").trim()) {
      return {
        specialist: attachCompareRuntime(clearCompareForResolvedDisplay(enriched)),
        compare: null,
      };
    }
    if (dreamBuilderContext && comparePlan) {
      const compareKind: DreamBuilderCompareKind = dreamBuilderOverlapComparePlan
        ? "overlap_merge_compare"
        : "batch_rewrite_compare";
      const retainedItems = visibleRetainedItemsForGroupedCompare(comparePlan.segments, comparePlan.units);
      const currentLabel = wordingLabels.userLabel || "";
      const suggestedLabel = wordingLabels.suggestionLabel || "";
      const retainedHeading = retainedItems.length > 0
        ? uiStringLocaleFirst(state, "compareGroupedCompareRetainedHeading").trim()
        : "";
      const instruction = dreamBuilderOverlapComparePlan
        ? dreamBuilderMergeInstructionForState(state)
        : groupedListBaseInstructionForState(state);
      const dreamBuilderSpecialist = buildDreamBuilderPendingCompareSpecialist({
        specialistResult: enriched,
        comparePlan,
        compareKind,
        message: pendingMessage,
        rationale: String(comparePlan.initialUnit.feedback_reason_text || effectiveFeedbackReason || "").trim(),
        currentLabel,
        suggestedLabel,
        retainedHeading,
        instruction,
        targetField,
        committedText,
        baseItems,
      });
      return {
        specialist: attachCompareRuntime(dreamBuilderSpecialist),
        compare: null,
      };
    }
    const dreamBuilderSuggestedItems =
      suggestionItems.length > 0
        ? suggestionItems
        : suggestionFullItems;
    if (dreamBuilderContext && effectiveUserItems.length > 0 && dreamBuilderSuggestedItems.length > 0) {
      const overlapExisting = String(specialistResult.__dream_builder_overlap_existing_statement || "").trim();
      const overlapIncoming = String(specialistResult.__dream_builder_overlap_incoming_statement || "").trim();
      const compareKind: DreamBuilderCompareKind =
        overlapExisting && overlapIncoming ? "overlap_merge_compare" : "batch_rewrite_compare";
      const currentItems = compareKind === "overlap_merge_compare"
        ? [overlapExisting, overlapIncoming].filter(Boolean)
        : effectiveUserItems;
      const suggestedItems = dreamBuilderSuggestedItems;
      const retainedItems = compareKind === "overlap_merge_compare" && overlapExisting
        ? baseItems.filter((item) => item !== overlapExisting)
        : baseItems;
      const labels = compareKind === "overlap_merge_compare"
        ? {
            userLabel: dreamBuilderKeepBothLabelForState(state),
            suggestionLabel: dreamBuilderMergeLabelForState(state),
          }
        : wordingLabels;
      const retainedHeading = retainedItems.length > 0
        ? uiStringLocaleFirst(state, "compareGroupedCompareRetainedHeading").trim()
        : "";
      const instruction = compareKind === "overlap_merge_compare"
        ? dreamBuilderMergeInstructionForState(state)
        : groupedListBaseInstructionForState(state);
      const dreamBuilderSpecialist = buildDreamBuilderPendingSimpleCompareSpecialist({
        specialistResult: enriched,
        compareKind,
        message: pendingMessage,
        rationale: effectiveFeedbackReason,
        currentLabel: labels.userLabel || "",
        suggestedLabel: labels.suggestionLabel || "",
        retainedHeading,
        instruction,
        targetField,
        committedText,
        baseItems,
        currentItems,
        suggestedItems,
        retainedItems,
      });
      return {
        specialist: attachCompareRuntime(dreamBuilderSpecialist),
        compare: null,
      };
    }
    const compare: CompareUiPayload =
      comparePlan
        ? (groupedCompareComparePayload({
            stepId,
            state,
            units: comparePlan.units,
            segments: comparePlan.segments,
            cursor: 0,
          }) || {
            enabled: true,
            mode,
            ...(String(comparePlan.initialUnit.feedback_reason_text || "").trim()
              ? {
                  feedback_reason_text: formattedCompareFeedback(
                    stepId,
                    state,
                    String(comparePlan.initialUnit.feedback_reason_text || "").trim()
                  ),
                }
              : {}),
            ...(wordingLabels.userLabel ? { user_label: wordingLabels.userLabel } : {}),
            ...(wordingLabels.suggestionLabel ? { suggestion_label: wordingLabels.suggestionLabel } : {}),
            user_text: comparePlan.initialUnit.user_text,
            suggestion_text: comparePlan.initialUnit.suggestion_text,
            user_items: comparePlan.initialUnit.user_items,
            suggestion_items: comparePlan.initialUnit.suggestion_items,
            instruction: groupedListInstructionForState(
              state,
              visibleRetainedItemsForGroupedCompare(comparePlan.segments, comparePlan.units)
            ),
          })
        : {
            enabled: true,
            mode,
            ...(feedbackReason ? { feedback_reason_text: formattedCompareFeedback(stepId, state, feedbackReason) } : {}),
            ...(wordingLabels.userLabel ? { user_label: wordingLabels.userLabel } : {}),
            ...(wordingLabels.suggestionLabel ? { suggestion_label: wordingLabels.suggestionLabel } : {}),
            user_text: normalizedUserSafe,
            suggestion_text: suggestionRaw,
            user_items: effectiveUserItems,
            suggestion_items: suggestionItems,
            instruction: compareInstructionForState(state),
          };
    return { specialist: attachCompareRuntime(enriched), compare };
  }

  function applyComparePickSelection(params: ComparePickSelectionParams): {
    handled: boolean;
    specialist: Record<string, unknown>;
    nextState: CanvasState;
  } {
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
    const prevRaw = attachCompareRuntime((state as any).last_specialist_result || {});
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
          statements: composedItems,
        },
        stepId,
        chosen
      );
      const selectedWithCompare = patchCompareRuntime(selected, {
        kind: "list_compare",
        mode: "list",
        status: "resolved",
        resolution: pickedUser ? "user" : "suggestion",
        suggestion_text: chosen,
        base_items: composedItems,
        list_semantics: "delta",
        feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
      });
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selectedWithCompare[targetField] || "").trim() : "";
      const stateForRender = provisionalValue
        ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
        : state;
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
      const nextState: CanvasState = {
        ...state,
        dream_builder_statements: composedItems,
        last_specialist_result: selectedWithContract,
      };
      return {
        handled: true,
        specialist: selectedWithContract,
        nextState,
      };
    }
    const prevCompare = readCompareRuntime(prevRaw);
    if (prevCompare?.status !== "pending") {
      return { handled: false, specialist: prevRaw, nextState: state };
    }
    const pickedUser = routeToken === "__COMPARE_PICK_USER__";
    const mode: CompareMode = prevCompare.mode === "list" ? "list" : "text";
    const compareMode: CompareCompareMode =
      String(prevCompare.grouped_mode || "").trim() === "grouped_units"
        ? "grouped_units"
        : "";
    if (compareMode === "grouped_units" && mode === "list") {
      const compareUnits = normalizeCompareUnits(prevCompare.grouped_units);
      const compareSegments = normalizeCompareSegments(prevCompare.grouped_segments);
      const cursorRaw = Number.parseInt(String(prevCompare.grouped_cursor || "0"), 10);
      const currentIndex = nextUnresolvedCompareUnitIndex(
        compareUnits,
        Number.isFinite(cursorRaw) ? cursorRaw : 0
      );
      if (currentIndex < 0 || compareUnits.length === 0 || compareSegments.length === 0) {
        return { handled: false, specialist: prevRaw, nextState: state };
      }

      const updatedUnits: CompareCompareUnit[] = compareUnits.map((unit, index) =>
        index === currentIndex
          ? ({
              ...unit,
              resolution: pickedUser ? "user" : "suggestion",
            } satisfies CompareCompareUnit)
          : unit
      );
      const nextIndex = nextUnresolvedCompareUnitIndex(updatedUnits, currentIndex + 1);
      if (nextIndex >= 0) {
        const nextPayload = groupedCompareComparePayload({
          stepId,
          state,
          units: updatedUnits,
          segments: compareSegments,
          cursor: nextIndex,
        });
        const nextUnit = updatedUnits[nextIndex];
        if (!nextPayload) {
          return { handled: false, specialist: prevRaw, nextState: state };
        }
        const nextPending: Record<string, unknown> = attachCompareRuntime({
          ...prevRaw,
          ...clearedResolvedCompareTransientFields(),
          compare_runtime: {
            ...(prevCompare || {
              kind: "list_compare",
              mode: "list",
              status: "pending",
              presentation: "picker",
              resolution: "",
            }),
            kind: "list_compare",
            mode: "list",
            status: "pending",
            resolution: "",
            grouped_mode: "grouped_units",
            grouped_cursor: String(nextIndex),
            grouped_units: updatedUnits,
            grouped_segments: compareSegments,
            user_text: nextUnit.user_text,
            user_normalized_text: nextUnit.user_text,
            user_items: nextUnit.user_items,
            suggestion_text: nextUnit.suggestion_text,
            suggestion_items: nextUnit.suggestion_items,
            user_label: String(nextPayload.user_label || prevCompare?.user_label || ""),
            suggestion_label: String(nextPayload.suggestion_label || prevCompare?.suggestion_label || ""),
            feedback_reason_text: String(nextUnit.feedback_reason_text || "").trim(),
            pending_text_presentation_mode: String(prevCompare?.presentation || ""),
          },
        });
        const nextState: CanvasState = {
          ...state,
          last_specialist_result: nextPending,
        };
        return { handled: true, specialist: nextPending, nextState };
      }

      const composedItems = composeGroupedCompareItems(compareSegments, updatedUnits);
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
          ...(mode === "list" ? { statements: composedItems } : {}),
        },
        stepId,
        chosen
      );
      const selectedCompare = patchCompareRuntime(selected, {
        kind: "list_compare",
        mode: "list",
        status: "resolved",
        resolution: pickedUser ? "user" : "suggestion",
        suggestion_text: chosen,
        base_items: composedItems,
        list_semantics: "delta",
        feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
      });
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
      const stateForRender = provisionalValue
        ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
        : state;
      const rendered = deps.renderFreeTextTurnPolicy({
        stepId,
        state: stateForRender,
        specialist: selectedCompare as Record<string, unknown>,
        previousSpecialist: prevRaw,
      });
      const renderedSpecialist = rendered.specialist as Record<string, unknown>;
      const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
      const selectedWithContract: Record<string, unknown> = attachCompareRuntime({
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
      });
      const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
      const nextState: CanvasState = {
        ...withAcceptedListSelectionState(stateForRender, stepId, composedItems),
        last_specialist_result: selectedWithContract,
      };
      deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
      return { handled: true, specialist: selectedWithContract, nextState };
    }
    const listSemantics: CompareListSemantics =
      String(prevCompare.list_semantics || "delta") === "full" ? "full" : "delta";
    const activeSpecialist = String((state as any)?.active_specialist || "").trim();
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, prevRaw) : [];
    const fallbackPickedRaw = pickedUser
      ? String(prevCompare.user_normalized_text || prevCompare.user_text || "").trim()
      : String(prevCompare.suggestion_text || prevRaw.refined_formulation || "").trim();
    const fallbackPickedText = mode === "list"
      ? unwrapSelectionHeadingFromText(stepId, state, activeSpecialist, fallbackPickedRaw)
      : fallbackPickedRaw;
    const pickedItems = mode === "list"
      ? (() => {
        const fromPending = pickedUser
            ? toTrimmedStringArray(prevCompare.user_items)
            : toTrimmedStringArray(prevCompare.suggestion_items);
          if (fromPending.length > 0) return fromPending;
          return deps.parseListItems(fallbackPickedText);
        })()
      : [];
    const mergedPickedItems = mode === "list"
      ? (
        listSemantics === "full"
          ? mergeListItems([], pickedItems)
          : mergeListItems(baseItems, pickedItems)
      )
      : [];
    const rawChosen = mode === "list"
      ? mergedPickedItems.join("\n")
      : unwrapSelectionHeadingFromText(stepId, state, activeSpecialist, fallbackPickedRaw);
    const chosenRaw = stepId === deps.entityStepId ? deps.normalizeEntityPhrase(rawChosen) || rawChosen : rawChosen;
    const chosen = stripMarkupPreserveLines(chosenRaw);
    if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
    const userFeedback = userChoiceFeedbackMessage(stepId, state, prevRaw, activeSpecialist, params.telemetry);
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
        ...(mode === "list" ? { statements: mergedPickedItems } : {}),
      },
      stepId,
      chosen
    );
    const selectedCompare = patchCompareRuntime(selected, {
      kind: mode === "list" ? "list_compare" : "text_compare",
      mode,
      status: "resolved",
      resolution: pickedUser ? "user" : "suggestion",
      suggestion_text: chosen,
      base_items: mode === "list" ? mergedPickedItems : [],
      list_semantics: "delta",
      feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
    });
    const targetField = deps.fieldForStep(stepId);
    const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
    const stateForRender = provisionalValue
      ? deps.withProvisionalValue(state, stepId, provisionalValue, "compare_pick" as ProvisionalSource)
      : state;
    const rendered = deps.renderFreeTextTurnPolicy({
      stepId,
      state: stateForRender,
      specialist: selectedCompare as Record<string, unknown>,
      previousSpecialist: prevRaw,
    });
    const renderedSpecialist = rendered.specialist as Record<string, unknown>;
    const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
    const selectedWithContract: Record<string, unknown> = attachCompareRuntime({
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
    });
    const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
    const nextState: CanvasState = {
      ...withAcceptedListSelectionState(stateForRender, stepId, mergedPickedItems),
      last_specialist_result: selectedWithContract,
    };
    deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
    return { handled: true, specialist: selectedWithContract, nextState };
  }

  function buildCompareFromPendingSpecialist(
    specialist: Record<string, unknown>,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    previousSpecialist?: Record<string, unknown>,
    stepIdHint = "",
    dreamRuntimeModeRaw?: unknown
  ): CompareUiPayload | null {
    specialist = attachCompareRuntime(specialist);
    previousSpecialist = attachCompareRuntime(previousSpecialist);
    const compareState = readCompareRuntime(specialist);
    const stepId = String(stepIdHint || "").trim();
    if (stepId === deps.dreamStepId && String(dreamRuntimeModeRaw || "").trim() !== "self") {
      return null;
    }
    const dreamBuilderComparePending =
      stepId === deps.dreamStepId &&
      Boolean(readDreamBuilderCompareRuntime(specialist));
    const comparePending = compareState?.status === "pending";
    if (dreamBuilderComparePending) return null;
    if (!comparePending && !dreamBuilderComparePending) return null;
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
    const mode: CompareMode = compareState?.mode === "list" ? "list" : "text";
    const compareMode: CompareCompareMode =
      String(compareState?.grouped_mode || "").trim() === "grouped_units"
        ? "grouped_units"
        : "";
    const compareUnits = compareMode === "grouped_units"
      ? normalizeCompareUnits(compareState?.grouped_units)
      : [];
    const compareSegments = compareMode === "grouped_units"
      ? normalizeCompareSegments(compareState?.grouped_segments)
      : [];
    const compareCursorRaw = Number.parseInt(String(compareState?.grouped_cursor || "0"), 10);
    const compareCursor = Number.isFinite(compareCursorRaw) ? compareCursorRaw : 0;
    const comparePayload = compareMode === "grouped_units"
      ? groupedCompareComparePayload({
          stepId,
          state,
          units: compareUnits,
          segments: compareSegments,
          cursor: compareCursor,
        })
      : null;
    const userItems = (
      comparePayload?.user_items ||
      toTrimmedStringArray(compareState?.user_items)
    ).map((line) => stripMarkupPreserveLines(line));
    const suggestionItems = (
      comparePayload?.suggestion_items ||
      toTrimmedStringArray(compareState?.suggestion_items)
    ).map((line) => stripMarkupPreserveLines(line));
    const wordingLabels = compareLabelsForStep({
      stepId,
      mode,
      state,
      grouped: compareMode === "grouped_units",
    });
    const userLabel =
      String(comparePayload?.user_label || compareState?.user_label || "").trim() || wordingLabels.userLabel || "";
    const suggestionLabel =
      String(comparePayload?.suggestion_label || compareState?.suggestion_label || "").trim() ||
      wordingLabels.suggestionLabel ||
      "";
    const feedbackReasonText =
      String(comparePayload?.feedback_reason_text || "").trim() ||
      resolveFeedbackReasonFromSpecialist((state || {}) as CanvasState, specialist);
    const fallbackUserText = stripMarkupPreserveLines(
      String(
        comparePayload?.user_text ||
        compareState?.user_normalized_text ||
        compareState?.user_text ||
        ""
      ).trim()
    );
    const fallbackSuggestionText = stripMarkupPreserveLines(
      String(
        comparePayload?.suggestion_text ||
        unwrapSelectionHeadingFromText(
          stepId,
          state,
          activeSpecialist,
          String(compareState?.suggestion_text || specialist?.refined_formulation || "").trim()
        )
      ).trim()
    );
    const resolvedUserItems = mode === "list" && userItems.length === 0
      ? parseUserListItemsForStep(stepId, fallbackUserText, suggestionItems)
      : userItems;
    const resolvedSuggestionItems = mode === "list" && suggestionItems.length === 0
      ? pickCompareSuggestionList(specialist, fallbackSuggestionText)
      : suggestionItems;
    if (!feedbackReasonText) return null;
    return {
      enabled: true,
      mode,
      ...(feedbackReasonText ? { feedback_reason_text: feedbackReasonText } : {}),
      ...(userLabel ? { user_label: userLabel } : {}),
      ...(suggestionLabel ? { suggestion_label: suggestionLabel } : {}),
      user_text: fallbackUserText,
      suggestion_text: fallbackSuggestionText,
      user_items: resolvedUserItems,
      suggestion_items: resolvedSuggestionItems,
      instruction: comparePayload?.instruction || compareInstructionForState(state),
    };
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
