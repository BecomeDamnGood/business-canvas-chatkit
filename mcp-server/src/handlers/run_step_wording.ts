import type { CanvasState, ProvisionalSource } from "../core/state.js";
import { isSingleValueWordingStep } from "../steps/step_registry.js";
import {
  formatCompareFeedbackForDisplay,
  formatUserPickFeedbackForDisplay,
  sanitizeFeedbackReasonForDisplay,
} from "../core/feedback_display.js";
import type { WordingChoiceUiPayload } from "./run_step_ui_payload.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import { resolveBusinessListTurn } from "./run_step_business_list_turn.js";

type WordingChoiceMode = "text" | "list";
type WordingChoiceVariant = "default" | "clarify_dual" | "grouped_list_units";
type WordingChoiceListSemantics = "delta" | "full";
type WordingChoicePresentation = "picker" | "canonical";
type FeedbackMode = "none" | "affirm_input" | "compare_suggestion" | "refine_current";
type WordingChoiceCompareMode = "" | "grouped_units";
type WordingChoiceCompareResolution = "user" | "suggestion" | "";
type WordingChoiceCompareConfidence = "anchored" | "fallback";
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

type EquivalentWordingVariantsParams = {
  mode: WordingChoiceMode;
  userRaw: string;
  suggestionRaw: string;
  userItems: string[];
  suggestionItems: string[];
};

type BuildWordingChoiceFromTurnParams = {
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

type WordingPickSelectionParams = {
  stepId: string;
  routeToken: string;
  state: CanvasState;
  telemetry?: unknown;
};

type WordingChoiceCompareUnit = {
  id: string;
  user_items: string[];
  suggestion_items: string[];
  user_text: string;
  suggestion_text: string;
  feedback_reason_text?: string;
  resolution: WordingChoiceCompareResolution;
  confidence: WordingChoiceCompareConfidence;
};

type WordingChoiceCompareSegment =
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
  units: WordingChoiceCompareUnit[];
  segments: WordingChoiceCompareSegment[];
  initialUnit: WordingChoiceCompareUnit;
};

type RunStepWordingDeps = {
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
  areEquivalentWordingVariants: (params: EquivalentWordingVariantsParams) => boolean;
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
  isUiWordingFeedbackKeyedV1Enabled: () => boolean;
  isWordingChoiceIntentV1Enabled: () => boolean;
  bumpUiI18nCounter: (telemetry: unknown, key: string, amount?: number) => void;
  wordingSelectionMessage: (
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

function normalizeCompareResolution(raw: unknown): WordingChoiceCompareResolution {
  const value = String(raw || "").trim();
  if (value === "user" || value === "suggestion") return value;
  return "";
}

function normalizeCompareConfidence(raw: unknown): WordingChoiceCompareConfidence {
  return String(raw || "").trim() === "fallback" ? "fallback" : "anchored";
}

function normalizeCompareUnits(raw: unknown): WordingChoiceCompareUnit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index): WordingChoiceCompareUnit | null => {
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
      } satisfies WordingChoiceCompareUnit;
    })
    .filter((entry): entry is WordingChoiceCompareUnit => Boolean(entry));
}

function normalizeCompareSegments(raw: unknown): WordingChoiceCompareSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const record = entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
      const kind = String(record.kind || "").trim();
      if (kind === "retained") {
        const items = toTrimmedStringArray(record.items);
        return items.length > 0 ? ({ kind: "retained", items } as WordingChoiceCompareSegment) : null;
      }
      if (kind === "unit") {
        const unitId = String(record.unit_id || "").trim();
        return unitId ? ({ kind: "unit", unit_id: unitId } as WordingChoiceCompareSegment) : null;
      }
      return null;
    })
    .filter((entry): entry is WordingChoiceCompareSegment => Boolean(entry));
}

export function createRunStepWordingHelpers(deps: RunStepWordingDeps) {
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
      deps.wordingSelectionMessage(stepId, state, activeSpecialist, marker)
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

  function wordingInstructionForState(state: CanvasState | null | undefined): string {
    return uiStringLocaleFirst(state, "wordingChoiceInstruction");
  }

  function clarifyUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceHeading").trim();
    return localized || deps.uiDefaultString("wordingChoiceHeading", "");
  }

  function clarifySuggestionLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceSuggestionLabel").trim();
    return localized || deps.uiDefaultString("wordingChoiceSuggestionLabel", "");
  }

  function interpretedListUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceInterpretedListHeading").trim();
    if (localized) return localized;
    return clarifyUserLabelForState(state);
  }

  function groupedListUserLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceGroupedCompareUserLabel").trim();
    if (localized) return localized;
    return interpretedListUserLabelForState(state);
  }

  function groupedListSuggestionLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceGroupedCompareSuggestionLabel").trim();
    if (localized) return localized;
    return clarifySuggestionLabelForState(state);
  }

  function dreamBuilderKeepBothLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceDreamBuilderKeepBothLabel").trim();
    if (localized) return localized;
    return groupedListUserLabelForState(state);
  }

  function dreamBuilderMergeLabelForState(state: CanvasState | null | undefined): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceDreamBuilderMergeLabel").trim();
    if (localized) return localized;
    return groupedListSuggestionLabelForState(state);
  }

  function dreamBuilderMergeInstructionForState(
    state: CanvasState | null | undefined,
    retainedItems: string[]
  ): string {
    const localized = uiStringLocaleFirst(state, "wordingChoiceDreamBuilderMergeInstruction").trim();
    if (localized) return localized;
    return groupedListInstructionForState(state, retainedItems);
  }

  function groupedListInstructionForState(
    state: CanvasState | null | undefined,
    retainedItems: string[]
  ): string {
    const baseInstruction =
      uiStringLocaleFirst(state, "wordingChoiceGroupedCompareInstruction").trim() ||
      wordingInstructionForState(state);
    const retained = retainedItems.map((line) => String(line || "").trim()).filter(Boolean);
    if (retained.length === 0) return baseInstruction;
    const retainedHeading = uiStringLocaleFirst(state, "wordingChoiceGroupedCompareRetainedHeading").trim();
    const retainedBlock = retained.map((line) => `• ${line}`).join("\n");
    return [retainedHeading, retainedBlock, baseInstruction].filter(Boolean).join("\n\n").trim();
  }

  function wordingChoiceLabelsForStep(params: {
    stepId: string;
    mode: WordingChoiceMode;
    state: CanvasState | null | undefined;
    variant: WordingChoiceVariant;
  }): { userLabel?: string; suggestionLabel?: string } {
    const { stepId, mode, state, variant } = params;
    if (variant === "clarify_dual") {
      return {
        userLabel: clarifyUserLabelForState(state),
        suggestionLabel: clarifySuggestionLabelForState(state),
      };
    }
    if (variant === "grouped_list_units") {
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

  function wordingScaffoldComparables(
    state: CanvasState | null | undefined,
    specialist?: Record<string, unknown> | null
  ): Set<string> {
    const labels = [
      uiStringLocaleFirst(state, "wordingChoiceHeading"),
      uiStringLocaleFirst(state, "wordingChoiceSuggestionLabel"),
      uiStringLocaleFirst(state, "wordingChoiceInstruction"),
      uiStringLocaleFirst(state, "wording.choice.context.default"),
      uiStringLocaleFirst(state, "wordingChoice.chooseVersion"),
      uiStringLocaleFirst(state, "wordingChoice.useInputFallback"),
      interpretedListUserLabelForState(state),
      groupedListUserLabelForState(state),
      groupedListSuggestionLabelForState(state),
      uiStringLocaleFirst(state, "wordingChoiceGroupedCompareInstruction"),
      uiStringLocaleFirst(state, "wordingChoiceGroupedCompareRetainedHeading"),
      clarifyUserLabelForState(state),
      clarifySuggestionLabelForState(state),
      String(specialist?.wording_choice_user_label || ""),
      String(specialist?.wording_choice_suggestion_label || ""),
    ];
    return new Set(
      labels
        .map((label) => canonicalHeadingComparable(label))
        .filter(Boolean)
    );
  }

  function isWordingScaffoldLine(
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

  function isWordingChoiceEligibleStep(stepId: string): boolean {
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

  function isWordingChoiceEligibleContext(
    stepId: string,
    activeSpecialist: string,
    specialist?: Record<string, unknown> | null,
    previousSpecialist?: Record<string, unknown> | null,
    dreamRuntimeModeRaw?: unknown
  ): boolean {
    void activeSpecialist;
    if (!isWordingChoiceEligibleStep(stepId)) return false;
    if (!isDreamBuilderContext(stepId, dreamRuntimeModeRaw)) return true;
    const current = specialist && typeof specialist === "object" ? specialist : {};
    const previous = previousSpecialist && typeof previousSpecialist === "object" ? previousSpecialist : {};
    if (deps.normalizeDreamRuntimeMode(dreamRuntimeModeRaw) === "builder_scoring") return false;
    const currentScoringPhase = String(current.scoring_phase || "").trim() === "true";
    const previousScoringPhase = String(previous.scoring_phase || "").trim() === "true";
    if (currentScoringPhase || previousScoringPhase) return false;
    return true;
  }

  function isWordingChoiceIntentEligibleSpecialist(specialist: Record<string, unknown>): boolean {
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

  function isSingleValueTextChoiceStep(stepId: string, mode: WordingChoiceMode): boolean {
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

  function resolveWordingChoicePresentation(params: {
    stepId: string;
    mode: WordingChoiceMode;
    previousSpecialist: Record<string, unknown>;
    forcePending: boolean;
    submittedTextIntent?: string;
    submittedTextAnchor?: string;
  }): WordingChoicePresentation {
    const { stepId, mode, previousSpecialist, forcePending } = params;
    if (!isSingleValueTextChoiceStep(stepId, mode)) return "picker";
    const preservedPresentation =
      forcePending && String(previousSpecialist.wording_choice_pending || "") === "true"
        ? String(previousSpecialist.wording_choice_presentation || "").trim()
        : "";
    if (preservedPresentation === "canonical" || preservedPresentation === "picker") {
      return preservedPresentation;
    }
    const submittedIntent = normalizePendingSuggestionIntent(params.submittedTextIntent);
    const submittedAnchor = normalizePendingSuggestionAnchor(params.submittedTextAnchor);
    if (
      submittedAnchor === "suggestion" &&
      (submittedIntent === "feedback_on_suggestion" || submittedIntent === "reject_suggestion_explicit")
    ) {
      return "canonical";
    }
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

  function copyPendingWordingChoiceState(current: unknown, previous: Record<string, unknown>): Record<string, unknown> {
    const pending = String(previous.wording_choice_pending || "") === "true";
    if (!pending || !current || typeof current !== "object") return (current || {}) as Record<string, unknown>;
    return {
      ...(current as Record<string, unknown>),
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_user_raw: String(previous.wording_choice_user_raw || ""),
      wording_choice_user_normalized: String(previous.wording_choice_user_normalized || ""),
      wording_choice_user_items: Array.isArray(previous.wording_choice_user_items)
        ? previous.wording_choice_user_items
        : [],
      wording_choice_suggestion_items: Array.isArray(previous.wording_choice_suggestion_items)
        ? previous.wording_choice_suggestion_items
        : [],
      wording_choice_base_items: Array.isArray(previous.wording_choice_base_items)
        ? previous.wording_choice_base_items
        : [],
      wording_choice_list_semantics: String(previous.wording_choice_list_semantics || "delta"),
      wording_choice_agent_current: String(previous.wording_choice_agent_current || ""),
      wording_choice_mode: String(previous.wording_choice_mode || ""),
      wording_choice_target_field: String(previous.wording_choice_target_field || ""),
      wording_choice_presentation: String(previous.wording_choice_presentation || ""),
      wording_choice_variant: String(previous.wording_choice_variant || ""),
      wording_choice_user_label: String(previous.wording_choice_user_label || ""),
      wording_choice_suggestion_label: String(previous.wording_choice_suggestion_label || ""),
      wording_choice_compare_mode: String(previous.wording_choice_compare_mode || ""),
      wording_choice_compare_cursor: String(previous.wording_choice_compare_cursor || ""),
      wording_choice_compare_units: Array.isArray(previous.wording_choice_compare_units)
        ? previous.wording_choice_compare_units
        : [],
      wording_choice_compare_segments: Array.isArray(previous.wording_choice_compare_segments)
        ? previous.wording_choice_compare_segments
        : [],
      wording_choice_user_variant_semantics: String(previous.wording_choice_user_variant_semantics || ""),
      wording_choice_user_variant_stepworthy: String(previous.wording_choice_user_variant_stepworthy || ""),
      feedback_reason_key: String(previous.feedback_reason_key || ""),
      feedback_reason_text: String(previous.feedback_reason_text || ""),
      pending_suggestion_intent: String(previous.pending_suggestion_intent || ""),
      pending_suggestion_anchor: String(previous.pending_suggestion_anchor || ""),
      pending_suggestion_seed_source: String(previous.pending_suggestion_seed_source || ""),
      pending_suggestion_feedback_text: String(previous.pending_suggestion_feedback_text || ""),
      pending_suggestion_presentation_mode: String(previous.pending_suggestion_presentation_mode || ""),
      feedback_mode: String(previous.feedback_mode || "none"),
    };
  }

  function clearedResolvedWordingTransientFields(): Record<string, unknown> {
    return {
      feedback_reason_key: "",
      feedback_reason_text: "",
      pending_suggestion_intent: "",
      pending_suggestion_anchor: "",
      pending_suggestion_seed_source: "",
      pending_suggestion_feedback_text: "",
      pending_suggestion_presentation_mode: "",
      feedback_mode: "none",
      current_value_refinement_pending: "false",
      current_value_refinement_target_field: "",
      current_value_refinement_feedback_text: "",
      current_value_refinement_anchor_value: "",
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
    return (
      params.baseItems.length > 1 ||
      params.userItems.length > 1 ||
      params.suggestionItems.length > 1
    );
  }

  function resolveBusinessListIntent(params: {
    stepId: string;
    userRaw: string;
    baseItems: string[];
    suggestionItems: string[];
  }): {
    semantics: WordingChoiceListSemantics;
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
    if (Array.isArray(previous.wording_choice_base_items)) {
      return toTrimmedStringArray(previous.wording_choice_base_items);
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
    confidence: WordingChoiceCompareConfidence;
    feedbackReasonText?: string;
  }): WordingChoiceCompareUnit {
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

    const anchoredUnits: WordingChoiceCompareUnit[] = [];
    const anchoredSegments: WordingChoiceCompareSegment[] = [];
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

    const segments: WordingChoiceCompareSegment[] = [];
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

    const segments: WordingChoiceCompareSegment[] = [];
    const units: WordingChoiceCompareUnit[] = [];
    let previousUserIndex = -1;
    let previousSuggestionIndex = -1;
    let unitCount = 0;

    const pushGapUnit = (nextUserIndex: number, nextSuggestionIndex: number, confidence: WordingChoiceCompareConfidence) => {
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
    const segments: WordingChoiceCompareSegment[] = [];
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

    const segments: WordingChoiceCompareSegment[] = [];
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

  function clearedDreamBuilderCompareFields(): Record<string, unknown> {
    return {
      __dream_builder_compare_pending: "false",
      __dream_builder_compare_kind: "",
      __dream_builder_compare_current_items: [],
      __dream_builder_compare_suggested_items: [],
      __dream_builder_compare_segments: [],
      __dream_builder_compare_rationale: "",
      __dream_builder_compare_current_label: "",
      __dream_builder_compare_suggested_label: "",
      __dream_builder_compare_retained_heading: "",
      __dream_builder_compare_instruction: "",
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
    return {
      ...specialistResult,
      ...clearedResolvedWordingTransientFields(),
      ...clearedDreamBuilderCompareFields(),
      message,
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
      wording_choice_compare_mode: "",
      wording_choice_compare_cursor: "",
      wording_choice_compare_units: [],
      wording_choice_compare_segments: [],
      wording_choice_user_variant_semantics: "",
      wording_choice_user_variant_stepworthy: "",
      feedback_reason_key: "",
      feedback_reason_text: rationale,
      pending_suggestion_intent: "",
      pending_suggestion_anchor: "",
      pending_suggestion_seed_source: "",
      pending_suggestion_feedback_text: "",
      pending_suggestion_presentation_mode: "",
      __dream_builder_compare_pending: "true",
      __dream_builder_compare_kind: compareKind,
      __dream_builder_compare_current_items: comparePlan.initialUnit.user_items,
      __dream_builder_compare_suggested_items: comparePlan.initialUnit.suggestion_items,
      __dream_builder_compare_segments: comparePlan.segments,
      __dream_builder_compare_rationale: rationale,
      __dream_builder_compare_current_label: currentLabel,
      __dream_builder_compare_suggested_label: suggestedLabel,
      __dream_builder_compare_retained_heading: retainedHeading,
      __dream_builder_compare_instruction: instruction,
      ...(targetField ? { [targetField]: committedText } : {}),
      statements: baseItems,
      refined_formulation: committedText,
    };
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
    const segments: WordingChoiceCompareSegment[] = [];
    if (retainedItems.length > 0) {
      segments.push({ kind: "retained", items: retainedItems });
    }
    segments.push({ kind: "unit", unit_id: "unit_1" });
    return {
      ...specialistResult,
      ...clearedResolvedWordingTransientFields(),
      ...clearedDreamBuilderCompareFields(),
      message,
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
      wording_choice_compare_mode: "",
      wording_choice_compare_cursor: "",
      wording_choice_compare_units: [],
      wording_choice_compare_segments: [],
      wording_choice_user_variant_semantics: "",
      wording_choice_user_variant_stepworthy: "",
      feedback_reason_key: "",
      feedback_reason_text: rationale,
      pending_suggestion_intent: "",
      pending_suggestion_anchor: "",
      pending_suggestion_seed_source: "",
      pending_suggestion_feedback_text: "",
      pending_suggestion_presentation_mode: "",
      __dream_builder_compare_pending: "true",
      __dream_builder_compare_kind: compareKind,
      __dream_builder_compare_current_items: currentItems,
      __dream_builder_compare_suggested_items: suggestedItems,
      __dream_builder_compare_segments: segments,
      __dream_builder_compare_rationale: rationale,
      __dream_builder_compare_current_label: currentLabel,
      __dream_builder_compare_suggested_label: suggestedLabel,
      __dream_builder_compare_retained_heading: retainedHeading,
      __dream_builder_compare_instruction: instruction,
      ...(targetField ? { [targetField]: committedText } : {}),
      statements: baseItems,
      refined_formulation: committedText,
    };
  }

  function hasDreamBuilderPendingCompare(specialist: Record<string, unknown>): boolean {
    return String(specialist.__dream_builder_compare_pending || "").trim() === "true";
  }

  function composeDreamBuilderCompareSelection(params: {
    segments: WordingChoiceCompareSegment[];
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

  function selectedItemsForCompareUnit(unit: WordingChoiceCompareUnit): string[] {
    if (unit.resolution === "user") return unit.user_items;
    if (unit.resolution === "suggestion") return unit.suggestion_items;
    return [];
  }

  function composeGroupedCompareItems(
    segments: WordingChoiceCompareSegment[],
    units: WordingChoiceCompareUnit[]
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
    segments: WordingChoiceCompareSegment[],
    units: WordingChoiceCompareUnit[]
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
    segments: WordingChoiceCompareSegment[],
    units: WordingChoiceCompareUnit[]
  ): boolean {
    const retainedKeys = new Set(
      segments
        .filter((segment): segment is Extract<WordingChoiceCompareSegment, { kind: "retained" }> => segment.kind === "retained")
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
    units: WordingChoiceCompareUnit[],
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
    const blockedComparables = wordingScaffoldComparables(state, specialist);
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
      if (isWordingScaffoldLine(trimmed, blockedComparables)) continue;
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

  function resolvePendingWordingFeedbackReason(params: {
    stepId: string;
    state: CanvasState;
    mode: WordingChoiceMode;
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
          "wording.feedback.dream_builder.rewrite.default",
          deps.uiDefaultString("wording.feedback.dream_builder.rewrite.default", "")
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
    unit: WordingChoiceCompareUnit;
    state: CanvasState;
  }): string {
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
          "wording.feedback.dream_builder.rewrite.default",
          deps.uiDefaultString("wording.feedback.dream_builder.rewrite.default", "")
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
      } satisfies WordingChoiceCompareUnit;
    });
    return {
      ...params.plan,
      units,
      initialUnit: units[0] || params.plan.initialUnit,
    };
  }

  function groupedCompareWordingChoicePayload(params: {
    stepId: string;
    state: CanvasState | null | undefined;
    units: WordingChoiceCompareUnit[];
    segments: WordingChoiceCompareSegment[];
    cursor: number;
  }): WordingChoiceUiPayload | null {
    const nextIndex = nextUnresolvedCompareUnitIndex(params.units, params.cursor);
    if (nextIndex < 0) return null;
    const currentUnit = params.units[nextIndex];
    const retainedItems = visibleRetainedItemsForGroupedCompare(params.segments, params.units);
    const isDreamBuilderMergeChoice =
      params.stepId === deps.dreamStepId &&
      currentUnit.user_items.length > 1 &&
      currentUnit.suggestion_items.length === 1;
    const labels = isDreamBuilderMergeChoice
      ? {
          userLabel: dreamBuilderKeepBothLabelForState(params.state),
          suggestionLabel: dreamBuilderMergeLabelForState(params.state),
        }
      : wordingChoiceLabelsForStep({
          stepId: params.stepId,
          mode: "list",
          state: params.state,
          variant: "grouped_list_units",
        });
    const feedbackReasonText = String(currentUnit.feedback_reason_text || "").trim();
    if (!feedbackReasonText) return null;
    const resolveString = (key: string, fallback = "") =>
      deps.uiStringFromStateMap(params.state || null, key, fallback || deps.uiDefaultString(key, fallback));
    return {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
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
      instruction: isDreamBuilderMergeChoice
        ? dreamBuilderMergeInstructionForState(params.state, retainedItems)
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
    const selectedValue = String(
      prev.wording_choice_user_normalized || prev.wording_choice_user_raw || prev.refined_formulation || ""
    ).trim();
    const selection = deps.wordingSelectionMessage(stepId, state, activeSpecialist, selectedValue);
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

  function pickWordingAgentBase(lastSpecialistResult: unknown): string {
    const result = lastSpecialistResult && typeof lastSpecialistResult === "object"
      ? (lastSpecialistResult as Record<string, unknown>)
      : {};
    const stored = stripMarkupPreserveLines(String(result.wording_choice_agent_current || "").trim());
    if (stored) return stored;
    return stripMarkupPreserveLines(String(result.refined_formulation || "").trim());
  }

  function pickWordingSuggestionList(currentSpecialist: Record<string, unknown>, fallbackText: string): string[] {
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

  function isWordingPickRouteToken(token: string): boolean {
    return token === "__WORDING_PICK_USER__" || token === "__WORDING_PICK_SUGGESTION__";
  }

  function isAcceptedOutputSingleValueTextStep(stepId: string, mode: WordingChoiceMode): boolean {
    return mode === "text" && isSingleValueWordingStep(stepId);
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

  function buildWordingChoiceFromTurn(params: BuildWordingChoiceFromTurnParams): {
    specialist: Record<string, unknown>;
    wordingChoice: WordingChoiceUiPayload | null;
  } {
    const {
      stepId,
      state,
      activeSpecialist,
      previousSpecialist,
      specialistResult,
      userTextRaw,
      isOfftopic,
      forcePending,
      dreamRuntimeModeRaw,
      acceptedOutputUserTurnClassification,
    } = params;
    if (!isWordingChoiceEligibleContext(stepId, activeSpecialist, specialistResult, previousSpecialist, dreamRuntimeModeRaw)) {
      return {
        specialist: {
          ...specialistResult,
          wording_choice_pending: "false",
          wording_choice_selected: "",
          wording_choice_list_semantics: "delta",
          wording_choice_presentation: "",
          wording_choice_compare_mode: "",
          wording_choice_compare_cursor: "",
          wording_choice_compare_units: [],
          wording_choice_compare_segments: [],
          wording_choice_user_variant_semantics: "",
          wording_choice_user_variant_stepworthy: "",
          feedback_reason_key: "",
          feedback_reason_text: "",
          pending_suggestion_intent: "",
          pending_suggestion_anchor: "",
          pending_suggestion_seed_source: "",
          pending_suggestion_feedback_text: "",
          pending_suggestion_presentation_mode: "",
        },
        wordingChoice: null,
      };
    }
    if (!isWordingChoiceIntentEligibleSpecialist(specialistResult)) {
      return {
        specialist: {
          ...specialistResult,
          wording_choice_pending: "false",
          wording_choice_selected: "",
          wording_choice_list_semantics: "delta",
          wording_choice_presentation: "",
          wording_choice_compare_mode: "",
          wording_choice_compare_cursor: "",
          wording_choice_compare_units: [],
          wording_choice_compare_segments: [],
          wording_choice_user_variant_semantics: "",
          wording_choice_user_variant_stepworthy: "",
          feedback_reason_key: "",
          feedback_reason_text: "",
          pending_suggestion_intent: "",
          pending_suggestion_anchor: "",
          pending_suggestion_seed_source: "",
          pending_suggestion_feedback_text: "",
          pending_suggestion_presentation_mode: "",
        },
        wordingChoice: null,
      };
    }
    if (isOfftopic) return { specialist: specialistResult, wordingChoice: null };
    const fallbackUserRaw = forcePending
      ? String(previousSpecialist.wording_choice_user_normalized || previousSpecialist.wording_choice_user_raw || "").trim()
      : "";
    const userRaw = String(userTextRaw || fallbackUserRaw).trim();
    if (!forcePending && !deps.shouldTreatAsStepContributingInput(userRaw, stepId)) {
      return { specialist: specialistResult, wordingChoice: null };
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
    if (!userRaw || !suggestionRaw) return { specialist: specialistResult, wordingChoice: null };
    const mode: WordingChoiceMode =
      isListChoiceScope(stepId, activeSpecialist) || dreamBuilderContext ? "list" : "text";
    const basePresentation: WordingChoicePresentation = resolveWordingChoicePresentation({
      stepId,
      mode,
      previousSpecialist,
      forcePending: Boolean(forcePending),
      submittedTextIntent: submittedIntent,
      submittedTextAnchor: submittedAnchor,
    });
    const shouldSuppressUserVariantPicker =
      isAcceptedOutputSingleValueTextStep(stepId, mode) &&
      acceptedOutputUserTurnClassification?.user_variant_is_stepworthy === false;
    const presentation: WordingChoicePresentation =
      shouldSuppressUserVariantPicker ? "canonical" : basePresentation;
    let normalizedUser = mode === "list"
      ? deps.normalizeListUserInput(userRaw)
      : deps.normalizeUserInputAgainstSuggestion(userRaw, suggestionRaw);
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, previousSpecialist) : [];
    const suggestionFullItems = mode === "list" ? pickWordingSuggestionList(specialistResult, suggestionRaw) : [];
    let listSemantics: WordingChoiceListSemantics = "delta";
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
      return { specialist: specialistResult, wordingChoice: null };
    }
    const userRawSafe = stripMarkupPreserveLines(userRaw);
    const normalizedUserSafe = stripMarkupPreserveLines(normalizedUser);
    const equivalent = deps.areEquivalentWordingVariants({
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
        ...specialistResult,
        ...clearedResolvedWordingTransientFields(),
        wording_choice_pending: "false",
        wording_choice_selected: "suggestion",
        wording_choice_list_semantics: "delta",
        wording_choice_presentation: "",
        wording_choice_compare_mode: "",
        wording_choice_compare_cursor: "",
        wording_choice_compare_units: [],
        wording_choice_compare_segments: [],
        wording_choice_user_variant_semantics: "",
        wording_choice_user_variant_stepworthy: "",
        refined_formulation: chosen,
        ...(mode === "list" ? { statements: chosenItems } : {}),
      };
      const autoSelected = withUpdatedTargetField(autoSelectedBase, stepId, chosen);
      return { specialist: autoSelected, wordingChoice: null };
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
          return { specialist: corrected, wordingChoice: null };
        }
      }
      return { specialist: specialistResult, wordingChoice: null };
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
    const feedbackReason = resolvePendingWordingFeedbackReason({
      stepId,
      state,
      mode,
      forcePending: Boolean(forcePending),
      specialistResult,
      suggestionRaw,
      userRaw,
      knownItems: mergeListItems(baseItems, suggestionFullItems),
    });
    const targetField = deps.fieldForStep(stepId);
    const committedTextFromPrev = targetField ? String(previousSpecialist[targetField] || "").trim() : "";
    const committedText = mode === "list" ? baseItems.join("\n") : committedTextFromPrev;
    let variant: WordingChoiceVariant =
      deps.isWordingChoiceIntentV1Enabled() &&
      mode === "text" &&
      !forcePending &&
      looksLikeDualClarificationPrompt(previousSpecialist)
        ? "clarify_dual"
        : "default";
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
    if (comparePlan) {
      variant = "grouped_list_units";
    }
    const pendingSuggestionSeedSource = seedSourceForPendingSuggestion({
      intent: submittedIntent,
      anchor: submittedAnchor,
    });
    const wordingLabels = wordingChoiceLabelsForStep({
      stepId,
      mode,
      state,
      variant,
    });
    const feedbackText = String(params.submittedFeedbackText || "").trim();
    const feedbackMode = normalizeFeedbackMode(specialistResult.feedback_mode);
    const enriched: Record<string, unknown> = {
      ...specialistResult,
      message: pendingMessage,
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_user_raw: userRawSafe,
      wording_choice_user_normalized: normalizedUserSafe,
      wording_choice_user_items: effectiveUserItems,
      wording_choice_base_items: baseItems,
      wording_choice_list_semantics: listSemantics,
      wording_choice_agent_current: suggestionRaw,
      wording_choice_suggestion_items: suggestionItems,
      wording_choice_mode: mode,
      wording_choice_target_field: targetField,
      wording_choice_presentation: presentation,
      wording_choice_variant: variant === "default" ? "" : variant,
      wording_choice_user_label: wordingLabels.userLabel || "",
      wording_choice_suggestion_label: wordingLabels.suggestionLabel || "",
      wording_choice_compare_mode: comparePlan?.mode || "",
      wording_choice_compare_cursor: comparePlan ? "0" : "",
      wording_choice_compare_units: comparePlan?.units || [],
      wording_choice_compare_segments: comparePlan?.segments || [],
      wording_choice_user_variant_semantics: acceptedOutputUserTurnClassification?.turn_kind || "",
      wording_choice_user_variant_stepworthy:
        acceptedOutputUserTurnClassification
          ? (acceptedOutputUserTurnClassification.user_variant_is_stepworthy ? "true" : "false")
          : "",
      feedback_reason_key: "",
      feedback_reason_text: effectiveFeedbackReason,
      feedback_mode: feedbackMode,
      pending_suggestion_intent: submittedIntent,
      pending_suggestion_anchor: submittedAnchor,
      pending_suggestion_seed_source: pendingSuggestionSeedSource,
      pending_suggestion_feedback_text:
        submittedAnchor === "suggestion" && feedbackText ? stripMarkupPreserveLines(feedbackText) : "",
      pending_suggestion_presentation_mode: presentation,
    };
    if (comparePlan) {
      enriched.wording_choice_user_raw = comparePlan.initialUnit.user_text;
      enriched.wording_choice_user_normalized = comparePlan.initialUnit.user_text;
      enriched.wording_choice_user_items = comparePlan.initialUnit.user_items;
      enriched.wording_choice_agent_current = comparePlan.initialUnit.suggestion_text;
      enriched.wording_choice_suggestion_items = comparePlan.initialUnit.suggestion_items;
    }
    if (targetField) {
      enriched[targetField] = committedText;
    }
    if (mode === "list") {
      enriched.statements = baseItems;
    }
    enriched.refined_formulation =
      committedText || String(previousSpecialist.refined_formulation || "").trim();
    if (presentation === "canonical") {
      return { specialist: enriched, wordingChoice: null };
    }
    if (isAcceptedOutputSingleValueTextStep(stepId, mode) && feedbackMode !== "compare_suggestion") {
      enriched.wording_choice_presentation = "canonical";
      return { specialist: enriched, wordingChoice: null };
    }
    if (!effectiveFeedbackReason) {
      enriched.wording_choice_presentation = "canonical";
      return { specialist: enriched, wordingChoice: null };
    }
    if (comparePlan && !String(comparePlan.initialUnit.feedback_reason_text || "").trim()) {
      enriched.wording_choice_presentation = "canonical";
      return { specialist: enriched, wordingChoice: null };
    }
    if (dreamBuilderContext && comparePlan) {
      const compareKind: DreamBuilderCompareKind = dreamBuilderOverlapComparePlan
        ? "overlap_merge_compare"
        : "batch_rewrite_compare";
      const retainedItems = visibleRetainedItemsForGroupedCompare(comparePlan.segments, comparePlan.units);
      const currentLabel = wordingLabels.userLabel || "";
      const suggestedLabel = wordingLabels.suggestionLabel || "";
      const retainedHeading = retainedItems.length > 0
        ? uiStringLocaleFirst(state, "wordingChoiceGroupedCompareRetainedHeading").trim()
        : "";
      const instruction = dreamBuilderOverlapComparePlan
        ? dreamBuilderMergeInstructionForState(state, retainedItems)
        : groupedListInstructionForState(state, retainedItems);
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
      const dreamBuilderWordingChoice: WordingChoiceUiPayload =
        groupedCompareWordingChoicePayload({
          stepId,
          state,
          units: comparePlan.units,
          segments: comparePlan.segments,
          cursor: 0,
        }) || {
          enabled: true,
          mode,
          variant: "grouped_list_units",
          ...(String(comparePlan.initialUnit.feedback_reason_text || effectiveFeedbackReason || "").trim()
            ? {
                feedback_reason_text: formattedCompareFeedback(
                  stepId,
                  state,
                  String(comparePlan.initialUnit.feedback_reason_text || effectiveFeedbackReason || "").trim()
                ),
              }
            : {}),
          ...(currentLabel ? { user_label: currentLabel } : {}),
          ...(suggestedLabel ? { suggestion_label: suggestedLabel } : {}),
          user_text: comparePlan.initialUnit.user_text,
          suggestion_text: comparePlan.initialUnit.suggestion_text,
          user_items: comparePlan.initialUnit.user_items,
          suggestion_items: comparePlan.initialUnit.suggestion_items,
          instruction,
        };
      return {
        specialist: dreamBuilderSpecialist,
        wordingChoice: dreamBuilderWordingChoice,
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
        ? uiStringLocaleFirst(state, "wordingChoiceGroupedCompareRetainedHeading").trim()
        : "";
      const instruction = compareKind === "overlap_merge_compare"
        ? dreamBuilderMergeInstructionForState(state, retainedItems)
        : groupedListInstructionForState(state, retainedItems);
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
        specialist: dreamBuilderSpecialist,
        wordingChoice: {
          enabled: true,
          mode,
          variant: "grouped_list_units",
          compare_feedback: { text: formattedCompareFeedback(stepId, state, effectiveFeedbackReason) },
          ...(labels.userLabel ? { user_label: labels.userLabel } : {}),
          ...(labels.suggestionLabel ? { suggestion_label: labels.suggestionLabel } : {}),
          user_text: currentItems.join("\n"),
          suggestion_text: suggestedItems.join("\n"),
          user_items: currentItems,
          suggestion_items: suggestedItems,
          instruction,
        },
      };
    }
    const wordingChoice: WordingChoiceUiPayload =
      comparePlan
        ? (groupedCompareWordingChoicePayload({
            stepId,
            state,
            units: comparePlan.units,
            segments: comparePlan.segments,
            cursor: 0,
          }) || {
            enabled: true,
            mode,
            ...(variant !== "default" ? { variant } : {}),
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
            ...(variant !== "default" ? { variant } : {}),
            ...(feedbackReason ? { feedback_reason_text: formattedCompareFeedback(stepId, state, feedbackReason) } : {}),
            ...(wordingLabels.userLabel ? { user_label: wordingLabels.userLabel } : {}),
            ...(wordingLabels.suggestionLabel ? { suggestion_label: wordingLabels.suggestionLabel } : {}),
            user_text: normalizedUserSafe,
            suggestion_text: suggestionRaw,
            user_items: effectiveUserItems,
            suggestion_items: suggestionItems,
            instruction: wordingInstructionForState(state),
          };
    return { specialist: enriched, wordingChoice };
  }

  function applyWordingPickSelection(params: WordingPickSelectionParams): {
    handled: boolean;
    specialist: Record<string, unknown>;
    nextState: CanvasState;
  } {
    const { stepId, routeToken, state } = params;
    if (!isWordingPickRouteToken(routeToken)) {
      return { handled: false, specialist: {}, nextState: state };
    }
    const stripStaleUiContractFields = (
      value: Record<string, unknown>
    ): Record<string, unknown> => {
      const {
        ui_content: _uiContent,
        ui_feedback_contract: _uiFeedbackContract,
        ui_show_step_intro_chrome: _uiShowStepIntroChrome,
        ui_contract_id: _uiContractId,
        ui_contract_version: _uiContractVersion,
        ui_text_keys: _uiTextKeys,
        ...rest
      } = value;
      return rest;
    };
    const prevRaw = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    if (stepId === deps.dreamStepId && hasDreamBuilderPendingCompare(prevRaw)) {
      const pickedUser = routeToken === "__WORDING_PICK_USER__";
      const segments = normalizeCompareSegments(prevRaw.__dream_builder_compare_segments);
      const currentItems = toTrimmedStringArray(prevRaw.__dream_builder_compare_current_items);
      const suggestedItems = toTrimmedStringArray(prevRaw.__dream_builder_compare_suggested_items);
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
      const selectedMessage = deps.wordingSelectionMessage(
        stepId,
        state,
        String((state as any)?.active_specialist || "").trim(),
        chosen
      );
      const selected = withUpdatedTargetField(
        {
          ...prevRaw,
          ...stripStaleUiContractFields(prevRaw),
          ...clearedResolvedWordingTransientFields(),
          ...clearedDreamBuilderCompareFields(),
          message: selectedMessage,
          wording_choice_pending: "false",
          wording_choice_selected: pickedUser ? "user" : "suggestion",
          wording_choice_user_raw: "",
          wording_choice_user_normalized: "",
          wording_choice_user_items: [],
          wording_choice_suggestion_items: [],
          wording_choice_base_items: composedItems,
          wording_choice_list_semantics: "delta",
          refined_formulation: chosen,
          wording_choice_agent_current: chosen,
          wording_choice_presentation: "",
          wording_choice_variant: "",
          wording_choice_user_label: "",
          wording_choice_suggestion_label: "",
          wording_choice_compare_mode: "",
          wording_choice_compare_cursor: "",
          wording_choice_compare_units: [],
          wording_choice_compare_segments: [],
          wording_choice_user_variant_semantics: "",
          wording_choice_user_variant_stepworthy: "",
          feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
          statements: composedItems,
        },
        stepId,
        chosen
      );
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
      const stateForRender = provisionalValue
        ? deps.withProvisionalValue(state, stepId, provisionalValue, "wording_pick" as ProvisionalSource)
        : state;
      const rendered = deps.renderFreeTextTurnPolicy({
        stepId,
        state: stateForRender,
        specialist: selected as Record<string, unknown>,
        previousSpecialist: prevRaw,
      });
      const renderedSpecialist = rendered.specialist as Record<string, unknown>;
      const selectedWithContract: Record<string, unknown> = {
        ...stripStaleUiContractFields(selected),
        action: "ASK",
        message: String(selected.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
        question: String(renderedSpecialist?.question || ""),
        wording_choice_pending: "false",
        wording_choice_selected: pickedUser ? "user" : "suggestion",
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
    if (String(prevRaw.wording_choice_pending || "") !== "true") {
      return { handled: false, specialist: prevRaw, nextState: state };
    }
    const pickedUser = routeToken === "__WORDING_PICK_USER__";
    const mode: WordingChoiceMode = String(prevRaw.wording_choice_mode || "text") === "list" ? "list" : "text";
    const compareMode: WordingChoiceCompareMode =
      String(prevRaw.wording_choice_compare_mode || "").trim() === "grouped_units"
        ? "grouped_units"
        : "";
    if (compareMode === "grouped_units" && mode === "list") {
      const compareUnits = normalizeCompareUnits(prevRaw.wording_choice_compare_units);
      const compareSegments = normalizeCompareSegments(prevRaw.wording_choice_compare_segments);
      const cursorRaw = Number.parseInt(String(prevRaw.wording_choice_compare_cursor || "0"), 10);
      const currentIndex = nextUnresolvedCompareUnitIndex(
        compareUnits,
        Number.isFinite(cursorRaw) ? cursorRaw : 0
      );
      if (currentIndex < 0 || compareUnits.length === 0 || compareSegments.length === 0) {
        return { handled: false, specialist: prevRaw, nextState: state };
      }

      const updatedUnits: WordingChoiceCompareUnit[] = compareUnits.map((unit, index) =>
        index === currentIndex
          ? ({
              ...unit,
              resolution: pickedUser ? "user" : "suggestion",
            } satisfies WordingChoiceCompareUnit)
          : unit
      );
      const nextIndex = nextUnresolvedCompareUnitIndex(updatedUnits, currentIndex + 1);
      if (nextIndex >= 0) {
        const nextPayload = groupedCompareWordingChoicePayload({
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
        const nextPending: Record<string, unknown> = {
          ...prevRaw,
          ...clearedResolvedWordingTransientFields(),
          wording_choice_pending: "true",
          wording_choice_selected: "",
          wording_choice_compare_mode: "grouped_units",
          wording_choice_compare_cursor: String(nextIndex),
          wording_choice_compare_units: updatedUnits,
          wording_choice_compare_segments: compareSegments,
          wording_choice_user_raw: nextUnit.user_text,
          wording_choice_user_normalized: nextUnit.user_text,
          wording_choice_user_items: nextUnit.user_items,
          wording_choice_agent_current: nextUnit.suggestion_text,
          wording_choice_suggestion_items: nextUnit.suggestion_items,
          wording_choice_variant: "grouped_list_units",
          wording_choice_user_label: String(nextPayload.user_label || prevRaw.wording_choice_user_label || ""),
          wording_choice_suggestion_label: String(
            nextPayload.suggestion_label || prevRaw.wording_choice_suggestion_label || ""
          ),
          feedback_reason_text: String(nextUnit.feedback_reason_text || "").trim(),
          pending_suggestion_presentation_mode: String(prevRaw.wording_choice_presentation || ""),
        };
        const nextState: CanvasState = {
          ...state,
          last_specialist_result: nextPending,
        };
        return { handled: true, specialist: nextPending, nextState };
      }

      const composedItems = composeGroupedCompareItems(compareSegments, updatedUnits);
      const chosen = stripMarkupPreserveLines(composedItems.join("\n"));
      if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
      const selectedMessage = deps.wordingSelectionMessage(stepId, state, String((state as any)?.active_specialist || "").trim(), chosen);
      const selected = withUpdatedTargetField(
        {
          ...stripStaleUiContractFields(prevRaw),
          ...clearedResolvedWordingTransientFields(),
          message: selectedMessage,
          wording_choice_pending: "false",
          wording_choice_selected: pickedUser ? "user" : "suggestion",
          wording_choice_user_raw: "",
          wording_choice_user_normalized: "",
          wording_choice_user_items: [],
          wording_choice_suggestion_items: [],
          wording_choice_base_items: composedItems,
          wording_choice_list_semantics: "delta",
          refined_formulation: chosen,
          wording_choice_agent_current: chosen,
          wording_choice_presentation: "",
          wording_choice_variant: "",
          wording_choice_user_label: "",
          wording_choice_suggestion_label: "",
          wording_choice_compare_mode: "",
          wording_choice_compare_cursor: "",
          wording_choice_compare_units: [],
          wording_choice_compare_segments: [],
          wording_choice_user_variant_semantics: "",
          wording_choice_user_variant_stepworthy: "",
          feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
          ...(mode === "list" ? { statements: composedItems } : {}),
        },
        stepId,
        chosen
      );
      const targetField = deps.fieldForStep(stepId);
      const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
      const stateForRender = provisionalValue
        ? deps.withProvisionalValue(state, stepId, provisionalValue, "wording_pick" as ProvisionalSource)
        : state;
      const rendered = deps.renderFreeTextTurnPolicy({
        stepId,
        state: stateForRender,
        specialist: selected as Record<string, unknown>,
        previousSpecialist: prevRaw,
      });
      const renderedSpecialist = rendered.specialist as Record<string, unknown>;
      const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
      const renderedUiFeedbackContract = (renderedSpecialist as Record<string, unknown>).ui_feedback_contract;
      const selectedWithContract: Record<string, unknown> = {
        ...stripStaleUiContractFields(selected),
        action: "ASK",
        message: String(selected.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
        question: String(renderedSpecialist?.question || ""),
        wording_choice_pending: "false",
        wording_choice_selected: pickedUser ? "user" : "suggestion",
        ...(renderedUiContent ? { ui_content: renderedUiContent } : {}),
        ...(renderedUiFeedbackContract ? { ui_feedback_contract: renderedUiFeedbackContract } : {}),
        ...(typeof renderedSpecialist?.ui_show_step_intro_chrome !== "undefined"
          ? { ui_show_step_intro_chrome: renderedSpecialist.ui_show_step_intro_chrome }
          : {}),
        ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
        ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
        ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
          ? renderedSpecialist.ui_text_keys
          : rendered.textKeys,
      };
      const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
      const nextState: CanvasState = {
        ...withAcceptedListSelectionState(stateForRender, stepId, composedItems),
        last_specialist_result: selectedWithContract,
      };
      deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
      return { handled: true, specialist: selectedWithContract, nextState };
    }
    const listSemantics: WordingChoiceListSemantics =
      String(prevRaw.wording_choice_list_semantics || "delta") === "full" ? "full" : "delta";
    const activeSpecialist = String((state as any)?.active_specialist || "").trim();
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, prevRaw) : [];
    const fallbackPickedRaw = pickedUser
      ? String(prevRaw.wording_choice_user_normalized || prevRaw.wording_choice_user_raw || "").trim()
      : String(prevRaw.wording_choice_agent_current || prevRaw.refined_formulation || "").trim();
    const fallbackPickedText = mode === "list"
      ? unwrapSelectionHeadingFromText(stepId, state, activeSpecialist, fallbackPickedRaw)
      : fallbackPickedRaw;
    const pickedItems = mode === "list"
      ? (() => {
          const fromPending = pickedUser
            ? toTrimmedStringArray(prevRaw.wording_choice_user_items)
            : toTrimmedStringArray(prevRaw.wording_choice_suggestion_items);
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
      : deps.wordingSelectionMessage(stepId, state, activeSpecialist, chosen);
    const selected = withUpdatedTargetField(
      {
        ...stripStaleUiContractFields(prevRaw),
        ...clearedResolvedWordingTransientFields(),
        message: selectedMessage,
        wording_choice_pending: "false",
        wording_choice_selected: pickedUser ? "user" : "suggestion",
        wording_choice_user_raw: "",
        wording_choice_user_normalized: "",
        wording_choice_user_items: [],
        wording_choice_suggestion_items: [],
        wording_choice_base_items: mode === "list" ? mergedPickedItems : [],
        wording_choice_list_semantics: "delta",
        refined_formulation: chosen,
        wording_choice_agent_current: chosen,
        wording_choice_presentation: "",
        wording_choice_variant: "",
        wording_choice_user_label: "",
        wording_choice_suggestion_label: "",
        wording_choice_compare_mode: "",
        wording_choice_compare_cursor: "",
        wording_choice_compare_units: [],
        wording_choice_compare_segments: [],
        wording_choice_user_variant_semantics: "",
        wording_choice_user_variant_stepworthy: "",
        feedback_reason_text: pickedUser ? userPickFeedbackReason(state, prevRaw) : "",
        ...(mode === "list" ? { statements: mergedPickedItems } : {}),
      },
      stepId,
      chosen
    );
    const targetField = deps.fieldForStep(stepId);
    const provisionalValue = targetField ? String(selected[targetField] || "").trim() : "";
    const stateForRender = provisionalValue
      ? deps.withProvisionalValue(state, stepId, provisionalValue, "wording_pick" as ProvisionalSource)
      : state;
    const rendered = deps.renderFreeTextTurnPolicy({
      stepId,
      state: stateForRender,
      specialist: selected as Record<string, unknown>,
      previousSpecialist: prevRaw,
    });
    const renderedSpecialist = rendered.specialist as Record<string, unknown>;
    const renderedUiContent = (renderedSpecialist as Record<string, unknown>).ui_content;
    const renderedUiFeedbackContract = (renderedSpecialist as Record<string, unknown>).ui_feedback_contract;
    const selectedWithContract: Record<string, unknown> = {
      ...stripStaleUiContractFields(selected),
      action: "ASK",
      message: String(selected.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
      question: String(renderedSpecialist?.question || ""),
      wording_choice_pending: "false",
      wording_choice_selected: pickedUser ? "user" : "suggestion",
      ...(renderedUiContent ? { ui_content: renderedUiContent } : {}),
      ...(renderedUiFeedbackContract ? { ui_feedback_contract: renderedUiFeedbackContract } : {}),
      ...(typeof renderedSpecialist?.ui_show_step_intro_chrome !== "undefined"
        ? { ui_show_step_intro_chrome: renderedSpecialist.ui_show_step_intro_chrome }
        : {}),
      ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
      ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
      ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
        ? renderedSpecialist.ui_text_keys
        : rendered.textKeys,
    };
    const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
    const nextState: CanvasState = {
      ...withAcceptedListSelectionState(stateForRender, stepId, mergedPickedItems),
      last_specialist_result: selectedWithContract,
    };
    deps.applyUiPhaseByStep(nextState, stepId, selectedContractId);
    return { handled: true, specialist: selectedWithContract, nextState };
  }

  function buildWordingChoiceFromPendingSpecialist(
    specialist: Record<string, unknown>,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    previousSpecialist?: Record<string, unknown>,
    stepIdHint = "",
    dreamRuntimeModeRaw?: unknown
  ): WordingChoiceUiPayload | null {
    const stepId = String(stepIdHint || specialist?.wording_choice_target_field || "").trim();
    const dreamBuilderComparePending =
      stepId === deps.dreamStepId &&
      String(specialist?.__dream_builder_compare_pending || "").trim().toLowerCase() === "true";
    const wordingChoicePending = String(specialist?.wording_choice_pending || "").trim().toLowerCase() === "true";
    if (!wordingChoicePending && !dreamBuilderComparePending) return null;
    if (!stepId) return null;
    if (dreamBuilderComparePending) {
      const currentItems = toTrimmedStringArray(specialist?.__dream_builder_compare_current_items).map((line) =>
        stripMarkupPreserveLines(line)
      );
      const suggestedItems = toTrimmedStringArray(specialist?.__dream_builder_compare_suggested_items).map((line) =>
        stripMarkupPreserveLines(line)
      );
      if (currentItems.length === 0 || suggestedItems.length === 0) return null;
      const retainedItems = Array.isArray(specialist?.__dream_builder_compare_segments)
        ? ((specialist.__dream_builder_compare_segments as unknown[]) as Array<Record<string, unknown>>).flatMap((segment) =>
            String(segment?.kind || "").trim() === "retained" && Array.isArray(segment.items)
              ? (segment.items as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
              : []
          )
        : [];
      const compareKind = String(specialist?.__dream_builder_compare_kind || "").trim();
      const labels = wordingChoiceLabelsForStep({
        stepId,
        mode: "list",
        state,
        variant: "grouped_list_units",
      });
      const feedbackReasonText = String(specialist?.__dream_builder_compare_rationale || "").trim();
      if (!feedbackReasonText) return null;
      return {
        enabled: true,
        mode: "list",
        variant: "grouped_list_units",
        compare_feedback: { text: feedbackReasonText },
        ...(String(specialist?.__dream_builder_compare_current_label || "").trim() || labels.userLabel
          ? {
              user_label:
                String(specialist?.__dream_builder_compare_current_label || "").trim() || labels.userLabel || "",
            }
          : {}),
        ...(String(specialist?.__dream_builder_compare_suggested_label || "").trim() || labels.suggestionLabel
          ? {
              suggestion_label:
                String(specialist?.__dream_builder_compare_suggested_label || "").trim() ||
                labels.suggestionLabel ||
                "",
            }
          : {}),
        user_text: currentItems.join("\n"),
        suggestion_text: suggestedItems.join("\n"),
        user_items: currentItems,
        suggestion_items: suggestedItems,
        instruction:
          String(specialist?.__dream_builder_compare_instruction || "").trim() ||
          (compareKind === "overlap_merge_compare"
            ? dreamBuilderMergeInstructionForState(state, retainedItems)
            : groupedListInstructionForState(state, retainedItems)),
      };
    }
    if (!isWordingChoiceIntentEligibleSpecialist(specialist)) return null;
    if (
      !isWordingChoiceEligibleContext(
        stepId,
        activeSpecialist,
        specialist,
        previousSpecialist || {},
        dreamRuntimeModeRaw
      )
    ) {
      return null;
    }
    const mode: WordingChoiceMode = String(specialist?.wording_choice_mode || "text") === "list" ? "list" : "text";
    const presentation: WordingChoicePresentation =
      String(specialist?.wording_choice_presentation || "").trim() === "canonical"
        ? "canonical"
        : "picker";
    if (presentation === "canonical") return null;
    if (
      isAcceptedOutputSingleValueTextStep(stepId, mode) &&
      String(specialist?.wording_choice_user_variant_stepworthy || "").trim() !== "true"
    ) {
      return null;
    }
    const compareMode: WordingChoiceCompareMode =
      String(specialist?.wording_choice_compare_mode || "").trim() === "grouped_units"
        ? "grouped_units"
        : "";
    const compareUnits = compareMode === "grouped_units"
      ? normalizeCompareUnits(specialist?.wording_choice_compare_units)
      : [];
    const compareSegments = compareMode === "grouped_units"
      ? normalizeCompareSegments(specialist?.wording_choice_compare_segments)
      : [];
    const compareCursorRaw = Number.parseInt(String(specialist?.wording_choice_compare_cursor || "0"), 10);
    const compareCursor = Number.isFinite(compareCursorRaw) ? compareCursorRaw : 0;
    const comparePayload = compareMode === "grouped_units"
      ? groupedCompareWordingChoicePayload({
          stepId,
          state,
          units: compareUnits,
          segments: compareSegments,
          cursor: compareCursor,
        })
      : null;
    const userItems = (
      comparePayload?.user_items ||
      toTrimmedStringArray(specialist?.wording_choice_user_items)
    ).map((line) => stripMarkupPreserveLines(line));
    const suggestionItems = (
      comparePayload?.suggestion_items ||
      toTrimmedStringArray(specialist?.wording_choice_suggestion_items)
    ).map((line) => stripMarkupPreserveLines(line));
    const variantRaw = String(specialist?.wording_choice_variant || "").trim();
    const variant = variantRaw === "clarify_dual"
      ? "clarify_dual"
      : variantRaw === "grouped_list_units"
        ? "grouped_list_units"
        : "default";
    const wordingLabels = wordingChoiceLabelsForStep({
      stepId,
      mode,
      state,
      variant,
    });
    const userLabel = String(specialist?.wording_choice_user_label || "").trim() || wordingLabels.userLabel || "";
    const suggestionLabel =
      String(specialist?.wording_choice_suggestion_label || "").trim() || wordingLabels.suggestionLabel || "";
    const feedbackMode = normalizeFeedbackMode(specialist?.feedback_mode);
    const feedbackReasonText = resolveFeedbackReasonFromSpecialist((state || {}) as CanvasState, specialist);
    const fallbackUserText = stripMarkupPreserveLines(
      String(
        comparePayload?.user_text ||
        specialist?.wording_choice_user_normalized ||
        specialist?.wording_choice_user_raw ||
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
          String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim()
        )
      ).trim()
    );
    const resolvedUserItems = mode === "list" && userItems.length === 0
      ? parseUserListItemsForStep(stepId, fallbackUserText, suggestionItems)
      : userItems;
    const resolvedSuggestionItems = mode === "list" && suggestionItems.length === 0
      ? pickWordingSuggestionList(specialist, fallbackSuggestionText)
      : suggestionItems;
    if (!feedbackReasonText) return null;
    if (isAcceptedOutputSingleValueTextStep(stepId, mode) && feedbackMode !== "compare_suggestion") {
      return null;
    }
    return {
      enabled: true,
      mode,
      ...(variant === "clarify_dual" ? { variant: "clarify_dual" as const } : {}),
      ...(feedbackReasonText ? { feedback_reason_text: feedbackReasonText } : {}),
      ...(userLabel ? { user_label: userLabel } : {}),
      ...(suggestionLabel ? { suggestion_label: suggestionLabel } : {}),
      user_text: fallbackUserText,
      suggestion_text: fallbackSuggestionText,
      user_items: resolvedUserItems,
      suggestion_items: resolvedSuggestionItems,
      instruction: comparePayload?.instruction || wordingInstructionForState(state),
    };
  }

  return {
    isWordingChoiceEligibleStep,
    isWordingChoiceEligibleContext,
    isListChoiceScope,
    sanitizePendingListMessage,
    copyPendingWordingChoiceState,
    mergeListItems,
    pickWordingAgentBase,
    isRefineAdjustRouteToken,
    isWordingPickRouteToken,
    stripUnsupportedReformulationClaims,
    buildWordingChoiceFromTurn,
    applyWordingPickSelection,
    buildWordingChoiceFromPendingSpecialist,
  };
}
