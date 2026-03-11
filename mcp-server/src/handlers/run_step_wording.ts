import type { CanvasState, ProvisionalSource } from "../core/state.js";
import type { WordingChoiceUiPayload } from "./run_step_ui_payload.js";
import type { AcceptedOutputUserTurnClassification } from "./run_step_accepted_output_semantics.js";
import { resolveBusinessListTurn } from "./run_step_business_list_turn.js";

type WordingChoiceMode = "text" | "list";
type WordingChoiceVariant = "default" | "clarify_dual" | "grouped_list_units";
type WordingChoiceListSemantics = "delta" | "full";
type WordingChoicePresentation = "picker" | "canonical";
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
    userRaw?: string
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

const ACCEPTED_OUTPUT_SINGLE_VALUE_STEP_IDS = new Set([
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "targetgroup",
]);

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
    .map((entry, index) => {
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
      const commaItems = String(userRaw || "")
        .replace(/\r/g, "\n")
        .split(/\s*,\s*/)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (commaItems.length >= 2 && (suggestionItems.length >= 2 || commaItems.length >= 3)) {
        return mergeListItems([], commaItems);
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
  }): WordingChoiceCompareUnit {
    const userItems = params.userItems.map((line) => String(line || "").trim()).filter(Boolean);
    const suggestionItems = params.suggestionItems.map((line) => String(line || "").trim()).filter(Boolean);
    return {
      id: String(params.id || "").trim(),
      user_items: userItems,
      suggestion_items: suggestionItems,
      user_text: userItems.join("\n"),
      suggestion_text: suggestionItems.join("\n"),
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
    userItems: string[];
    suggestionItems: string[];
  }): BusinessListComparePlan | null {
    const userItems = params.userItems.map((line) => String(line || "").trim()).filter(Boolean);
    const suggestionItems = params.suggestionItems.map((line) => String(line || "").trim()).filter(Boolean);
    if (userItems.length === 0 || suggestionItems.length === 0) return null;

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

  function extractFeedbackReasonSentenceFromSpecialistMessage(params: {
    messageRaw: string;
    suggestionRaw: string;
    userRaw: string;
    knownItems: string[];
    state?: CanvasState | null;
    specialist?: Record<string, unknown> | null;
  }): string {
    const source = String(params.messageRaw || "").replace(/\r/g, "\n").trim();
    if (!source) return "";
    const suggestionComparable = deps.canonicalizeComparableText(String(params.suggestionRaw || ""));
    const userComparable = deps.canonicalizeComparableText(String(params.userRaw || ""));
    const knownComparables = new Set(
      params.knownItems
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean)
    );
    const lines = source
      .split(/\n+/)
      .map((line) => deps.stripChoiceInstructionNoise(String(line || "").replace(/<[^>]+>/g, " ").trim()))
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean);
    const blockedComparables = wordingScaffoldComparables(params.state || null, params.specialist || null);
    const candidates: string[] = [];
    for (const line of lines) {
      if (isWordingScaffoldLine(line, blockedComparables)) continue;
      const lineComparable = deps.canonicalizeComparableText(line);
      if (!lineComparable) continue;
      if (knownComparables.has(lineComparable)) continue;
      if (
        (suggestionComparable && (lineComparable === suggestionComparable || lineComparable.includes(suggestionComparable))) ||
        (userComparable && (lineComparable === userComparable || lineComparable.includes(userComparable)))
      ) {
        continue;
      }
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((part) => String(part || "").trim())
        .filter(Boolean);
      for (const sentence of sentences) {
        const normalized = sentence.replace(/\s+/g, " ").trim();
        if (!normalized) continue;
        if (isWordingScaffoldLine(normalized, blockedComparables)) continue;
        const sentenceComparable = deps.canonicalizeComparableText(normalized);
        if (!sentenceComparable) continue;
        if (
          (suggestionComparable &&
            (sentenceComparable === suggestionComparable || sentenceComparable.includes(suggestionComparable))) ||
          (userComparable && (sentenceComparable === userComparable || sentenceComparable.includes(userComparable))) ||
          knownComparables.has(sentenceComparable)
        ) {
          continue;
        }
        if (deps.tokenizeWords(normalized).length < 5) continue;
        candidates.push(normalized);
      }
    }
    if (candidates.length === 0) return "";
    return normalizeCompactFeedbackSentence(candidates[0], "");
  }

  function resolveFeedbackReasonFromSpecialist(state: CanvasState, prev: Record<string, unknown>): string {
    const reasonKey = String(prev.feedback_reason_key || "").trim();
    const reasonText = String(prev.feedback_reason_text || "").trim();
    if (reasonKey) {
      const reasonUiKey = `wording.feedback.reason.${reasonKey}`;
      const fallback = shouldUseDefaultFallback(state) ? deps.uiDefaultString(reasonUiKey, "") : "";
      const fromMap = deps.uiStringFromStateMap(state, reasonUiKey, fallback);
      if (fromMap) return normalizeCompactFeedbackSentence(fromMap, "");
    }
    if (reasonText) {
      return normalizeCompactFeedbackSentence(reasonText, "");
    }
    const fallbackFromMessage = extractFeedbackReasonSentenceFromSpecialistMessage({
      messageRaw: String(prev.message || ""),
      suggestionRaw: String(prev.wording_choice_agent_current || prev.refined_formulation || ""),
      userRaw: String(prev.wording_choice_user_normalized || prev.wording_choice_user_raw || ""),
      knownItems: mergeListItems(
        Array.isArray(prev.wording_choice_base_items) ? toTrimmedStringArray(prev.wording_choice_base_items) : [],
        Array.isArray(prev.wording_choice_suggestion_items) ? toTrimmedStringArray(prev.wording_choice_suggestion_items) : []
      ),
      state,
      specialist: prev,
    });
    if (fallbackFromMessage) return fallbackFromMessage;
    return "";
  }

  function defaultWordingFeedbackReason(state: CanvasState): string {
    const reasonDefault = shouldUseDefaultFallback(state)
      ? deps.uiDefaultString("wording.feedback.user_pick.reason.default")
      : "";
    return normalizeCompactFeedbackSentence(
      deps.uiStringFromStateMap(
        state,
        "wording.feedback.user_pick.reason.default",
        reasonDefault
      ),
      reasonDefault
    );
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
    const labels = wordingChoiceLabelsForStep({
      stepId: params.stepId,
      mode: "list",
      state: params.state,
      variant: "grouped_list_units",
    });
    const retainedItems = visibleRetainedItemsForGroupedCompare(params.segments, params.units);
    return {
      enabled: true,
      mode: "list",
      variant: "grouped_list_units",
      ...(labels.userLabel ? { user_label: labels.userLabel } : {}),
      ...(labels.suggestionLabel ? { suggestion_label: labels.suggestionLabel } : {}),
      user_text: currentUnit.user_text,
      suggestion_text: currentUnit.suggestion_text,
      user_items: currentUnit.user_items,
      suggestion_items: currentUnit.suggestion_items,
      instruction: groupedListInstructionForState(params.state, retainedItems),
    };
  }

  function userChoiceFeedbackMessage(
    stepId: string,
    state: CanvasState,
    prev: Record<string, unknown>,
    activeSpecialist = "",
    telemetry?: unknown
  ): string {
    const ackDefault = shouldUseDefaultFallback(state)
      ? deps.uiDefaultString("wording.feedback.user_pick.ack.default")
      : "";
    const acknowledgment = normalizeCompactFeedbackSentence(
      deps.uiStringFromStateMap(
        state,
        "wording.feedback.user_pick.ack.default",
        ackDefault
      ),
      ackDefault
    );
    void telemetry;
    const selectedValue = String(
      prev.wording_choice_user_normalized || prev.wording_choice_user_raw || prev.refined_formulation || ""
    ).trim();
    const selection = deps.wordingSelectionMessage(stepId, state, activeSpecialist, selectedValue);
    if (acknowledgment && selection) return `${acknowledgment}\n\n${selection}`.trim();
    return selection || acknowledgment;
  }

  function withUpdatedTargetField(result: Record<string, unknown>, stepId: string, value: string): Record<string, unknown> {
    const field = deps.fieldForStep(stepId);
    if (!field || !value) return result;
    return { ...result, [field]: value };
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
    if (Array.isArray(currentSpecialist.statements) && currentSpecialist.statements.length > 0) {
      return currentSpecialist.statements.map((line) => String(line || "").trim()).filter(Boolean);
    }
    const refined = String(currentSpecialist.refined_formulation || "").trim();
    return deps.parseListItems(refined || fallbackText);
  }

  function isRefineAdjustRouteToken(token: string): boolean {
    const upper = String(token || "").toUpperCase();
    return upper.includes("_REFINE__") || upper.includes("_ADJUST__");
  }

  function isWordingPickRouteToken(token: string): boolean {
    return token === "__WORDING_PICK_USER__" || token === "__WORDING_PICK_SUGGESTION__";
  }

  function isAcceptedOutputSingleValueTextStep(stepId: string, mode: WordingChoiceMode): boolean {
    return mode === "text" && ACCEPTED_OUTPUT_SINGLE_VALUE_STEP_IDS.has(String(stepId || "").trim());
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
    const suggestionRawCandidate = deps.pickDualChoiceSuggestion(stepId, specialistResult, previousSpecialist, userRaw);
    const suggestionRaw = unwrapSelectionHeadingFromText(
      stepId,
      state,
      activeSpecialist,
      suggestionRawCandidate
    );
    if (!userRaw || !suggestionRaw) return { specialist: specialistResult, wordingChoice: null };
    const dreamBuilderContext = isDreamBuilderContext(stepId, dreamRuntimeModeRaw);
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
      }
    }
    if (mode === "list" && isBusinessListIntentScope(stepId)) {
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
        feedback_reason_key: "",
        feedback_reason_text: "",
        pending_suggestion_intent: "",
        pending_suggestion_anchor: "",
        pending_suggestion_seed_source: "",
        pending_suggestion_feedback_text: "",
        pending_suggestion_presentation_mode: "",
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
    const feedbackReasonText = extractFeedbackReasonSentenceFromSpecialistMessage({
      messageRaw: String(specialistResult.message || ""),
      suggestionRaw,
      userRaw,
      knownItems: mergeListItems(baseItems, suggestionFullItems),
      state,
      specialist: specialistResult,
    });
    const feedbackReason =
      feedbackReasonText ||
      (forcePending ? defaultWordingFeedbackReason(state) : "");
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
    const comparePlan =
      mode === "list" && isBusinessListIntentScope(stepId)
        ? buildBusinessListComparePlan({
            userItems: effectiveUserItems,
            suggestionItems,
          })
        : null;
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
      feedback_reason_text: feedbackReason,
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
      enriched.feedback_reason_text = "";
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
    const prevRaw = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
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
          feedback_reason_key: "",
          feedback_reason_text: "",
          pending_suggestion_intent: "",
          pending_suggestion_anchor: "",
          pending_suggestion_seed_source: "",
          pending_suggestion_feedback_text: "",
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
          ...prevRaw,
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
          feedback_reason_key: "",
          feedback_reason_text: "",
          pending_suggestion_intent: "",
          pending_suggestion_anchor: "",
          pending_suggestion_seed_source: "",
          pending_suggestion_feedback_text: "",
          pending_suggestion_presentation_mode: "",
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
      const selectedWithContract: Record<string, unknown> = {
        ...selected,
        action: "ASK",
        message: String(selected.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
        question: String(renderedSpecialist?.question || ""),
        wording_choice_pending: "false",
        wording_choice_selected: pickedUser ? "user" : "suggestion",
        ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
        ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
        ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
          ? renderedSpecialist.ui_text_keys
          : rendered.textKeys,
      };
      const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
      const nextState: CanvasState = {
        ...stateForRender,
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
        ...prevRaw,
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
        feedback_reason_key: "",
        feedback_reason_text: "",
        pending_suggestion_intent: "",
        pending_suggestion_anchor: "",
        pending_suggestion_seed_source: "",
        pending_suggestion_feedback_text: "",
        pending_suggestion_presentation_mode: "",
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
    const selectedWithContract: Record<string, unknown> = {
      ...selected,
      action: "ASK",
      message: String(selected.message || "").trim() || String(renderedSpecialist?.message || "").trim(),
      question: String(renderedSpecialist?.question || ""),
      wording_choice_pending: "false",
      wording_choice_selected: pickedUser ? "user" : "suggestion",
      ui_contract_id: String(renderedSpecialist?.ui_contract_id || rendered.contractId || ""),
      ui_contract_version: String(renderedSpecialist?.ui_contract_version || rendered.contractVersion || ""),
      ui_text_keys: Array.isArray(renderedSpecialist?.ui_text_keys)
        ? renderedSpecialist.ui_text_keys
        : rendered.textKeys,
    };
    const selectedContractId = String(rendered.contractId || selectedWithContract.ui_contract_id || "");
    const nextState: CanvasState = {
      ...stateForRender,
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
    if (String(specialist?.wording_choice_pending || "") !== "true") return null;
    const stepId = String(stepIdHint || specialist?.wording_choice_target_field || "").trim();
    if (!stepId) return null;
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
    return {
      enabled: true,
      mode,
      ...(variant === "clarify_dual" ? { variant: "clarify_dual" as const } : {}),
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
