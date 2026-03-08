import type { CanvasState, ProvisionalSource } from "../core/state.js";
import type { WordingChoiceUiPayload } from "./run_step_ui_payload.js";

type WordingChoiceMode = "text" | "list";
type WordingChoiceVariant = "default" | "clarify_dual";
type WordingChoiceListSemantics = "delta" | "full";
type WordingChoicePresentation = "picker" | "canonical";
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
};

type WordingPickSelectionParams = {
  stepId: string;
  routeToken: string;
  state: CanvasState;
  telemetry?: unknown;
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

const LIST_REMOVE_VERB = /\b(remove|delete|drop|omit|exclude|verwijder|schrap|haal\s+weg|weglaten|wegdoen)\b/i;
const LIST_REPLACE_VERB = /\b(replace|vervang)\b/i;
const LIST_REPLACE_WITH = /\b(with|door|met)\b/i;
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
  ): string {
    if (!state || typeof state !== "object") return "";
    const marker = "__BSC_CURRENT_VALUE_MARKER__";
    const selection = stripMarkupPreserveLines(
      deps.wordingSelectionMessage(stepId, state, activeSpecialist, marker)
    );
    if (!selection || !selection.includes(marker)) return "";
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
    return String(lines[0] || "").trim();
  }

  function unwrapSelectionHeadingFromText(
    stepId: string,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    rawValue: string
  ): string {
    const value = stripMarkupPreserveLines(rawValue);
    if (!value) return "";
    const heading = selectionHeadingForStep(stepId, state, activeSpecialist);
    const headingComparable = canonicalHeadingComparable(heading);
    if (!headingComparable) return value;

    const paragraphs = value
      .split(/\n{2,}/)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    if (paragraphs.length >= 2) {
      const firstComparable = canonicalHeadingComparable(String(paragraphs[0] || ""));
      if (firstComparable && firstComparable === headingComparable) {
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
      if (firstComparable && firstComparable === headingComparable) {
        const body = lines.slice(1).join("\n").trim();
        if (body) return body;
      }
    }

    const colonIndex = value.indexOf(":");
    if (colonIndex > 0) {
      const prefixComparable = canonicalHeadingComparable(value.slice(0, colonIndex));
      if (prefixComparable && prefixComparable === headingComparable) {
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

  function extractQuotedFragments(input: string): string[] {
    const text = String(input || "");
    const matches = text.match(/["“”'‘’][^"“”'‘’\n]{3,}["“”'‘’]/g) || [];
    return matches
      .map((value) => String(value || "").replace(/^["“”'‘’]|["“”'‘’]$/g, "").trim())
      .filter(Boolean);
  }

  function bestMatchingIndex(referenceItems: string[], fragment: string): number {
    const target = deps.canonicalizeComparableText(fragment);
    if (!target) return -1;
    const targetTokens = new Set(deps.tokenizeWords(target));
    if (targetTokens.size === 0) return -1;
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < referenceItems.length; i += 1) {
      const candidate = String(referenceItems[i] || "").trim();
      const canonical = deps.canonicalizeComparableText(candidate);
      if (!canonical) continue;
      if (canonical === target) return i;
      const candidateTokens = new Set(deps.tokenizeWords(canonical));
      let overlap = 0;
      for (const token of targetTokens) {
        if (candidateTokens.has(token)) overlap += 1;
      }
      const union = targetTokens.size + candidateTokens.size - overlap;
      const score = union > 0 ? overlap / union : 0;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestScore >= 0.35 ? bestIdx : -1;
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

    const quotedFragments = extractQuotedFragments(userRaw);
    const explicitRemove = LIST_REMOVE_VERB.test(userRaw);
    if (explicitRemove) {
      const removeIndexes = new Set<number>();
      for (const fragment of quotedFragments) {
        const idx = bestMatchingIndex(referenceItems, fragment);
        if (idx >= 0) removeIndexes.add(idx);
      }
      if (removeIndexes.size === 0 && (quotedFragments.length > 0 || deps.tokenizeWords(userRaw).length <= 12)) {
        const parsedCandidates = deps.parseListItems(userRaw)
          .map((line) => String(line || "").trim())
          .filter(Boolean);
        for (const fragment of parsedCandidates) {
          const idx = bestMatchingIndex(referenceItems, fragment);
          if (idx >= 0) removeIndexes.add(idx);
        }
      }
      if (removeIndexes.size > 0) {
        const kept = referenceItems.filter((_, idx) => !removeIndexes.has(idx));
        return {
          semantics: "full",
          userItems: mergeListItems([], kept),
          suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
          normalizedUser: mergeListItems([], kept).join("\n"),
        };
      }
    }

    const explicitReplace = LIST_REPLACE_VERB.test(userRaw) && LIST_REPLACE_WITH.test(userRaw);
    if (explicitReplace && quotedFragments.length >= 2) {
      const source = quotedFragments[0];
      const replacement = quotedFragments[1];
      const sourceIdx = bestMatchingIndex(referenceItems, source);
      const replacementClean = deps.normalizeLightUserInput(replacement).replace(/[.!?]+$/, "").trim();
      if (sourceIdx >= 0 && replacementClean) {
        const next = referenceItems.map((line, idx) => (idx === sourceIdx ? replacementClean : line));
        return {
          semantics: "full",
          userItems: mergeListItems([], next),
          suggestionItems: mergeListItems([], params.suggestionItems.length > 0 ? params.suggestionItems : referenceItems),
          normalizedUser: mergeListItems([], next).join("\n"),
        };
      }
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
    } = params;
    if (!isWordingChoiceEligibleContext(stepId, activeSpecialist, specialistResult, previousSpecialist, dreamRuntimeModeRaw)) {
      return {
        specialist: {
          ...specialistResult,
          wording_choice_pending: "false",
          wording_choice_selected: "",
          wording_choice_list_semantics: "delta",
          wording_choice_presentation: "",
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
    const presentation: WordingChoicePresentation = resolveWordingChoicePresentation({
      stepId,
      mode,
      previousSpecialist,
      forcePending: Boolean(forcePending),
      submittedTextIntent: submittedIntent,
      submittedTextAnchor: submittedAnchor,
    });
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
    const variant: WordingChoiceVariant =
      deps.isWordingChoiceIntentV1Enabled() &&
      mode === "text" &&
      !forcePending &&
      looksLikeDualClarificationPrompt(previousSpecialist)
        ? "clarify_dual"
        : "default";
    const pendingSuggestionSeedSource = seedSourceForPendingSuggestion({
      intent: submittedIntent,
      anchor: submittedAnchor,
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
      wording_choice_variant: variant === "clarify_dual" ? variant : "",
      wording_choice_user_label: variant === "clarify_dual" ? clarifyUserLabelForState(state) : "",
      wording_choice_suggestion_label:
        variant === "clarify_dual" ? clarifySuggestionLabelForState(state) : "",
      feedback_reason_key: "",
      feedback_reason_text: feedbackReason,
      pending_suggestion_intent: submittedIntent,
      pending_suggestion_anchor: submittedAnchor,
      pending_suggestion_seed_source: pendingSuggestionSeedSource,
      pending_suggestion_feedback_text:
        submittedAnchor === "suggestion" && feedbackText ? stripMarkupPreserveLines(feedbackText) : "",
      pending_suggestion_presentation_mode: presentation,
    };
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
    const wordingChoice: WordingChoiceUiPayload = {
      enabled: true,
      mode,
      ...(variant === "clarify_dual"
        ? {
            variant,
            user_label: clarifyUserLabelForState(state),
            suggestion_label: clarifySuggestionLabelForState(state),
          }
        : {}),
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
    const userItems = toTrimmedStringArray(specialist?.wording_choice_user_items).map((line) => stripMarkupPreserveLines(line));
    const suggestionItems = toTrimmedStringArray(specialist?.wording_choice_suggestion_items).map((line) => stripMarkupPreserveLines(line));
    const variant = String(specialist?.wording_choice_variant || "").trim() === "clarify_dual"
      ? "clarify_dual"
      : "default";
    return {
      enabled: true,
      mode,
      ...(variant === "clarify_dual"
        ? {
            variant: "clarify_dual" as const,
            user_label:
              String(specialist?.wording_choice_user_label || "").trim() || clarifyUserLabelForState(state),
            suggestion_label:
              String(specialist?.wording_choice_suggestion_label || "").trim() ||
              clarifySuggestionLabelForState(state),
          }
        : {}),
      user_text: stripMarkupPreserveLines(
        String(specialist?.wording_choice_user_normalized || specialist?.wording_choice_user_raw || "").trim()
      ),
      suggestion_text: unwrapSelectionHeadingFromText(
        stepId,
        state,
        activeSpecialist,
        String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim()
      ),
      user_items: userItems,
      suggestion_items: suggestionItems,
      instruction: wordingInstructionForState(state),
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
