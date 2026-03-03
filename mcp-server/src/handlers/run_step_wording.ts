import type { CanvasState, ProvisionalSource } from "../core/state.js";
import type { WordingChoiceUiPayload } from "./run_step_ui_payload.js";

type WordingChoiceMode = "text" | "list";

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
};

type WordingPickSelectionParams = {
  stepId: string;
  routeToken: string;
  state: CanvasState;
  telemetry?: unknown;
};

type RunStepWordingDeps = {
  step0Id: string;
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
  bumpUiI18nCounter: (telemetry: unknown, key: string, amount?: number) => void;
  wordingSelectionMessage: (stepId: string, state: CanvasState, activeSpecialist?: string) => string;
};

function toTrimmedStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((line) => String(line || "").trim()).filter(Boolean);
}

export function createRunStepWordingHelpers(deps: RunStepWordingDeps) {
  function wordingInstructionForState(state: CanvasState | null | undefined): string {
    const fallback = deps.uiDefaultString("wordingChoiceInstruction");
    return deps.uiStringFromStateMap(state, "wordingChoiceInstruction", fallback);
  }

  function isWordingChoiceEligibleStep(stepId: string): boolean {
    return String(stepId || "").trim() !== deps.step0Id;
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
      wording_choice_agent_current: String(previous.wording_choice_agent_current || ""),
      wording_choice_mode: String(previous.wording_choice_mode || ""),
      wording_choice_target_field: String(previous.wording_choice_target_field || ""),
      feedback_reason_key: String(previous.feedback_reason_key || ""),
      feedback_reason_text: String(previous.feedback_reason_text || ""),
    };
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

  function sanitizePendingListMessage(messageRaw: string, knownItems: string[]): string {
    const message = String(messageRaw || "").replace(/\r/g, "\n");
    if (!message.trim()) return "";
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
      const normalized = trimmed.replace(/<[^>]+>/g, "").trim();
      if (
        /\b(i['’]?ve|i have)\s+(reformulat\w*|rewritten|broadened|converted)\b/i.test(normalized) ||
        /^statement\s*\d+\s*:/i.test(normalized) ||
        /^statements?\s+\d+\s*(?:to|-)\s*\d+/i.test(normalized) ||
        /\bif you meant something different\b/i.test(normalized)
      ) {
        continue;
      }
      if (/^<\/?strong>/i.test(trimmed) && /so far/i.test(trimmed)) continue;
      if (/^so far\b/i.test(trimmed)) continue;
      if (/^<\/?strong>/i.test(trimmed) && /established so far/i.test(trimmed)) continue;
      if (/^(this is your input|this would be my suggestion)\s*:?\s*$/i.test(trimmed.replace(/<[^>]+>/g, "").trim())) continue;
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
    const blockedLinePatterns = [
      /^this is your input:?$/i,
      /^this would be my suggestion:?$/i,
      /^please click what suits you best\.?$/i,
      /^choose this version$/i,
      /^if you meant something different/i,
      /^statement\s*\d+\s*:/i,
      /^so far\b/i,
      /^your current\b/i,
    ];
    const candidates: string[] = [];
    for (const line of lines) {
      if (blockedLinePatterns.some((pattern) => pattern.test(line))) continue;
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
        if (blockedLinePatterns.some((pattern) => pattern.test(normalized))) continue;
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
      const fallback = deps.uiDefaultString(reasonUiKey, "");
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
    });
    if (fallbackFromMessage) return fallbackFromMessage;
    return "";
  }

  function userChoiceFeedbackMessage(
    stepId: string,
    state: CanvasState,
    prev: Record<string, unknown>,
    activeSpecialist = "",
    telemetry?: unknown
  ): string {
    const ackDefault = deps.uiDefaultString("wording.feedback.user_pick.ack.default");
    const acknowledgment = normalizeCompactFeedbackSentence(
      deps.uiStringFromStateMap(
        state,
        "wording.feedback.user_pick.ack.default",
        ackDefault
      ),
      ackDefault
    );
    const reasonDefault = deps.uiDefaultString("wording.feedback.user_pick.reason.default");
    const fallbackReason = normalizeCompactFeedbackSentence(
      deps.uiStringFromStateMap(
        state,
        "wording.feedback.user_pick.reason.default",
        reasonDefault
      ),
      reasonDefault
    );
    let reason = fallbackReason;
    if (deps.isUiWordingFeedbackKeyedV1Enabled()) {
      const explicitReason = resolveFeedbackReasonFromSpecialist(state, prev);
      if (explicitReason) {
        reason = explicitReason;
      } else {
        deps.bumpUiI18nCounter(telemetry, "wording_feedback_fallback_count");
      }
    }
    const feedback = `${acknowledgment} ${reason}`.trim();
    const selection = deps.wordingSelectionMessage(stepId, state, activeSpecialist);
    return selection ? `${feedback}\n\n${selection}` : feedback;
  }

  function mergeUniqueMessageBlocks(primary: string, secondary: string): string {
    const seenParagraphs = new Set<string>();
    const out: string[] = [];
    for (const block of [primary, secondary]) {
      const trimmed = String(block || "").trim();
      if (!trimmed) continue;
      const paragraphs = trimmed
        .replace(/\r/g, "\n")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const keptParagraphs: string[] = [];
      for (const paragraph of paragraphs) {
        const key = deps.canonicalizeComparableText(paragraph);
        if (!key || seenParagraphs.has(key)) continue;
        seenParagraphs.add(key);
        keptParagraphs.push(paragraph);
      }
      if (keptParagraphs.length > 0) {
        out.push(keptParagraphs.join("\n\n"));
      }
    }
    return out.join("\n\n").trim();
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
    const stored = String(result.wording_choice_agent_current || "").trim();
    if (stored) return stored;
    return String(result.refined_formulation || "").trim();
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
          feedback_reason_key: "",
          feedback_reason_text: "",
        },
        wordingChoice: null,
      };
    }
    if (isOfftopic) return { specialist: specialistResult, wordingChoice: null };
    const fallbackUserRaw = forcePending
      ? String(previousSpecialist.wording_choice_user_raw || previousSpecialist.wording_choice_user_normalized || "").trim()
      : "";
    const userRaw = String(userTextRaw || fallbackUserRaw).trim();
    if (!forcePending && !deps.shouldTreatAsStepContributingInput(userRaw, stepId)) {
      return { specialist: specialistResult, wordingChoice: null };
    }
    const suggestionRaw = deps.pickDualChoiceSuggestion(stepId, specialistResult, previousSpecialist, userRaw);
    if (!userRaw || !suggestionRaw) return { specialist: specialistResult, wordingChoice: null };
    const dreamBuilderContext = isDreamBuilderContext(stepId, dreamRuntimeModeRaw);
    const mode: WordingChoiceMode =
      isListChoiceScope(stepId, activeSpecialist) || dreamBuilderContext ? "list" : "text";
    const normalizedUser = mode === "list" ? deps.normalizeListUserInput(userRaw) : deps.normalizeLightUserInput(userRaw);
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, previousSpecialist) : [];
    const suggestionFullItems = mode === "list" ? pickWordingSuggestionList(specialistResult, suggestionRaw) : [];
    const userRawItems = mode === "list"
      ? parseUserListItemsForStep(stepId, userRaw, suggestionFullItems)
      : [];
    const userItems = mode === "list" ? diffListItems(baseItems, userRawItems) : [];
    const fallbackUserItems = mode === "list"
      ? userRawItems.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const effectiveUserItems = mode === "list" && userItems.length === 0
      ? fallbackUserItems
      : userItems;
    const suggestionItems = mode === "list" ? diffListItems(baseItems, suggestionFullItems) : [];
    if (mode === "list" && !forcePending && effectiveUserItems.length === 0) {
      return { specialist: specialistResult, wordingChoice: null };
    }
    const equivalent = deps.areEquivalentWordingVariants({
      mode,
      userRaw: normalizedUser,
      suggestionRaw,
      userItems: effectiveUserItems,
      suggestionItems,
    });
    if (equivalent) {
      const chosenItems = mode === "list"
        ? mergeListItems(baseItems, suggestionItems.length > 0 ? suggestionItems : effectiveUserItems)
        : [];
      const chosen = mode === "list"
        ? chosenItems.join("\n")
        : (String(suggestionRaw || "").trim() || normalizedUser);
      const autoSelectedBase: Record<string, unknown> = {
        ...specialistResult,
        wording_choice_pending: "false",
        wording_choice_selected: "suggestion",
        feedback_reason_key: "",
        feedback_reason_text: "",
        refined_formulation: chosen,
        ...(mode === "list" ? { statements: chosenItems } : {}),
      };
      const autoSelected = withUpdatedTargetField(autoSelectedBase, stepId, chosen);
      return { specialist: autoSelected, wordingChoice: null };
    }
    if (!forcePending && !deps.isMaterialRewriteCandidate(userRaw, suggestionRaw)) {
      return { specialist: specialistResult, wordingChoice: null };
    }
    const pendingMessage = mode === "list"
      ? sanitizePendingListMessage(
        String(specialistResult.message || ""),
        mergeListItems(baseItems, suggestionFullItems)
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
    });
    const targetField = deps.fieldForStep(stepId);
    const committedTextFromPrev = targetField ? String(previousSpecialist[targetField] || "").trim() : "";
    const committedText = mode === "list" ? baseItems.join("\n") : committedTextFromPrev;
    const enriched: Record<string, unknown> = {
      ...specialistResult,
      message: pendingMessage,
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_user_raw: userRaw,
      wording_choice_user_normalized: normalizedUser,
      wording_choice_user_items: effectiveUserItems,
      wording_choice_base_items: baseItems,
      wording_choice_agent_current: suggestionRaw,
      wording_choice_suggestion_items: suggestionItems,
      wording_choice_mode: mode,
      wording_choice_target_field: targetField,
      feedback_reason_key: "",
      feedback_reason_text: feedbackReasonText,
    };
    if (targetField) {
      enriched[targetField] = committedText;
    }
    if (mode === "list") {
      enriched.statements = baseItems;
    }
    enriched.refined_formulation =
      committedText || String(previousSpecialist.refined_formulation || "").trim();
    const wordingChoice: WordingChoiceUiPayload = {
      enabled: true,
      mode,
      user_text: normalizedUser,
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
    const baseItems = mode === "list" ? extractCommittedListItems(stepId, prevRaw) : [];
    const fallbackPickedRaw = pickedUser
      ? String(prevRaw.wording_choice_user_normalized || prevRaw.wording_choice_user_raw || "").trim()
      : String(prevRaw.wording_choice_agent_current || prevRaw.refined_formulation || "").trim();
    const pickedItems = mode === "list"
      ? (() => {
          const fromPending = pickedUser
            ? toTrimmedStringArray(prevRaw.wording_choice_user_items)
            : toTrimmedStringArray(prevRaw.wording_choice_suggestion_items);
          if (fromPending.length > 0) return fromPending;
          return deps.parseListItems(fallbackPickedRaw);
        })()
      : [];
    const rawChosen = mode === "list"
      ? mergeListItems(baseItems, pickedItems).join("\n")
      : fallbackPickedRaw;
    const chosen = stepId === deps.entityStepId ? deps.normalizeEntityPhrase(rawChosen) || rawChosen : rawChosen;
    if (!chosen) return { handled: false, specialist: prevRaw, nextState: state };
    const activeSpecialist = String((state as any)?.active_specialist || "").trim();
    const userFeedback = userChoiceFeedbackMessage(stepId, state, prevRaw, activeSpecialist, params.telemetry);
    const selectedMessage = pickedUser
      ? userFeedback
      : deps.wordingSelectionMessage(stepId, state, activeSpecialist);
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
        wording_choice_base_items: mode === "list" ? deps.parseListItems(chosen) : [],
        refined_formulation: chosen,
        wording_choice_agent_current: chosen,
        feedback_reason_key: "",
        feedback_reason_text: "",
        ...(mode === "list" ? { statements: deps.parseListItems(chosen) } : {}),
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
      message: mergeUniqueMessageBlocks(
        String(selected.message || ""),
        String(renderedSpecialist?.message || "")
      ),
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
    const userItems = toTrimmedStringArray(specialist?.wording_choice_user_items);
    const suggestionItems = toTrimmedStringArray(specialist?.wording_choice_suggestion_items);
    return {
      enabled: true,
      mode,
      user_text: String(specialist?.wording_choice_user_normalized || specialist?.wording_choice_user_raw || "").trim(),
      suggestion_text: String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "").trim(),
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
