import type { CanvasState } from "../core/state.js";

import { createRunStepResponseHelpers } from "./run_step_response.js";
import type {
  RunStepAttachRegistryPayload,
  RunStepRenderFreeTextTurnPolicy,
  RunStepValidateRenderedContractOrRecover,
} from "./run_step_ports.js";
import { createTurnResponseEngine, type TurnResponseEngine } from "./run_step_turn_response_engine.js";
import type { UiI18nTelemetryCounters } from "./run_step_i18n_runtime.js";

export type RunStepRuntimeInputMode = "widget" | "chat";

export type RunStepRuntimeLocaleHintSource =
  | "openai_locale"
  | "webplus_i18n"
  | "request_header"
  | "message_detect"
  | "none";

type RunStepRuntimeTextHelpersDeps = {
  dreamStepId: string;
  parseMenuFromContractIdForStep: (contractIdRaw: unknown, stepId: string) => string;
  canonicalizeComparableText: (value: string) => string;
  wordingSelectionMessage: (
    stepId: string,
    state: CanvasState,
    activeSpecialist?: string,
    selectedValue?: string
  ) => string;
  mergeListItems: (userItems: string[], suggestionItems: string[]) => string[];
  splitSentenceItems: (text: string) => string[];
  sanitizePendingListMessage: (message: string, fallbackItems: string[]) => string;
  isWordingPanelCleanBodyV1Enabled: () => boolean;
  fieldForStep: (stepId: string) => string;
  stripUnsupportedReformulationClaims: (message: string) => string;
  tokenizeWords: (text: string) => string[];
  compactWordingPanelBody: (message: string) => string;
};

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
    /^are\s+you\s+content\s+with\s+this\s+.+\s+or\s+do\s+you\s+want\s+to\s+refine\s+it\??$/i,
    /^does\s+this\s+capture\s+the\s+.+\s+and\s+do\s+you\s+want\s+to\s+continue\s+to\s+the\s+next\s+step\s+.+\??$/i,
    /^based\s+on\s+the\s+.+,\s*your\s+.+\s+could\s+sound\s+like\s+this:?\s*$/i,
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

function stripMarkupPreserveLines(value: string): string {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickPrompt(specialist: Record<string, unknown>): string {
  const q = stripMarkupPreserveLines(String(specialist?.question ?? ""));
  return q || "";
}

function stripPromptEchoFromMessage(
  messageRaw: string,
  promptRaw: string,
  canonicalizeComparableText: (value: string) => string
): string {
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

  return message
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
}

function normalizePurposeExamplesMessage(contractStepId: string, menuId: string, messageRaw: string): string {
  if (contractStepId !== "purpose" || menuId !== "PURPOSE_MENU_EXAMPLES") {
    return String(messageRaw || "").trim();
  }
  const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
  if (!message) return "";
  const blocks = message
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
  if (blocks.length < 3) return message;
  const hasListMarkers = (value: string): boolean => /^(?:\s*[-*•]|\s*\d+[\).])\s+/m.test(String(value || ""));
  const normalizeSentenceBlock = (value: string): string =>
    String(value || "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  const isSentenceLike = (value: string): boolean => {
    const plain = normalizeSentenceBlock(value);
    if (!plain) return false;
    if (hasListMarkers(plain)) return false;
    if (plain.length < 18 || plain.length > 280) return false;
    if (/:$/.test(plain)) return false;
    if (/^[A-Z0-9 .,'’"-]{6,}$/.test(plain)) return false;
    return /[.!?]$/.test(plain);
  };
  const intro = blocks[0];
  const tail = blocks[blocks.length - 1];
  const middle = blocks.slice(1, blocks.length - 1);
  const middleExamples = middle.filter(isSentenceLike);
  if (middleExamples.length < 2 || middleExamples.length !== middle.length) {
    const allAfterIntro = blocks.slice(1);
    const allExamples = allAfterIntro.filter(isSentenceLike);
    if (allExamples.length < 2 || allExamples.length !== allAfterIntro.length) {
      return message;
    }
    const bullets = allAfterIntro.map((line) => `- ${normalizeSentenceBlock(line)}`).join("\n");
    return [intro, bullets].join("\n\n").trim();
  }
  const bullets = middle.map((line) => `- ${normalizeSentenceBlock(line)}`).join("\n");
  return [intro, bullets, tail].join("\n\n").trim();
}

export function createRunStepRuntimeTextHelpers(deps: RunStepRuntimeTextHelpersDeps) {
  function buildTextForWidget(params: {
    specialist: Record<string, unknown>;
    hasWidgetActions?: boolean;
    questionTextOverride?: string;
    state?: CanvasState | null;
  }): string {
    const { specialist } = params;
    const parts: string[] = [];

    const wordingPending = String(specialist?.wording_choice_pending || "") === "true";
    const suppressRefinedAppend = String(specialist?.__suppress_refined_append || "").trim() === "true";
    const wordingMode = String(specialist?.wording_choice_mode || "text") === "list" ? "list" : "text";
    const wordingSuggestion = stripMarkupPreserveLines(
      String(specialist?.wording_choice_agent_current || specialist?.refined_formulation || "")
    );
    const normalizeLine = (value: string): string =>
      String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/g, "")
        .trim();
    const suggestionNorm = normalizeLine(wordingSuggestion);
    const contractId = String((specialist as Record<string, unknown>)?.ui_contract_id || "").trim();
    const contractStepId = contractId.split(":")[0] || "";
    const menuId = deps.parseMenuFromContractIdForStep(contractId, contractStepId).toUpperCase();
    const statementLines = Array.isArray(specialist?.statements)
      ? (specialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const dreamBuilderRenderContext =
      statementLines.length > 0 &&
      contractStepId === deps.dreamStepId &&
      (
        String(specialist?.suggest_dreambuilder || "").trim() === "true" ||
        menuId.startsWith("DREAM_EXPLAINER_MENU_")
      );

    let msg = stripMarkupPreserveLines(String(specialist?.message ?? ""));
    if (dreamBuilderRenderContext && msg) {
      const statementKeys = new Set(
        statementLines
          .map((line) => deps.canonicalizeComparableText(String(line || "")))
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
          const lineKey = deps.canonicalizeComparableText(stripped);
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
          const suffixKey = deps.canonicalizeComparableText(suffix);
          if (!suffixKey || !statementKeys.has(suffixKey)) return true;
          return deps.tokenizeWords(prefix).length > 8;
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
      const knownItems = deps.mergeListItems(userItems, suggestionItems);
      const fallbackItems = knownItems.length > 0 ? knownItems : deps.splitSentenceItems(wordingSuggestion);
      msg = deps.sanitizePendingListMessage(msg, fallbackItems);
    }
    if (wordingPending && deps.isWordingPanelCleanBodyV1Enabled()) {
      msg = deps.compactWordingPanelBody(msg);
    }
    const promptFromSpecialist = stripMarkupPreserveLines(String(specialist?.question ?? ""));
    const promptOverride = stripMarkupPreserveLines(String(params.questionTextOverride || ""));
    const prompt = promptOverride || promptFromSpecialist;
    msg = normalizePurposeExamplesMessage(contractStepId, menuId, msg);
    let refined = stripMarkupPreserveLines(String(specialist?.refined_formulation ?? ""));
    if (!wordingPending) {
      const field = deps.fieldForStep(contractStepId);
      const fieldValue = field ? String((specialist as Record<string, unknown>)?.[field] || "").trim() : "";
      if (!fieldValue && !refined && statementLines.length === 0) {
        msg = deps.stripUnsupportedReformulationClaims(msg);
      }
    }
    if (msg) msg = stripChoiceInstructionNoise(msg);
    if (msg && prompt) msg = stripPromptEchoFromMessage(msg, prompt, deps.canonicalizeComparableText);
    if (refined) {
      refined = stripChoiceInstructionNoise(refined);
      if (prompt) refined = stripPromptEchoFromMessage(refined, prompt, deps.canonicalizeComparableText);
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
    const isBulletConsistencyStep = ["strategy", "productsservices", "rulesofthegame"].includes(
      String(contractStepId || "").trim()
    );
    const extractStructuredListItems = (value: string): string[] => {
      const lines = String(value || "")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) =>
          String(line || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        );
      const items: string[] = [];
      let current = "";
      let sawMarker = false;
      const flush = () => {
        const item = String(current || "").replace(/\s+/g, " ").trim();
        if (item) items.push(item);
        current = "";
      };
      for (const line of lines) {
        if (!line) {
          flush();
          continue;
        }
        const marker = line.match(/^(?:[-*•]|\d+[\).])\s+(.+)$/);
        if (marker) {
          sawMarker = true;
          flush();
          current = String(marker[1] || "").trim();
          continue;
        }
        const looksHeading =
          /:\s*$/.test(line) ||
          /^[A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9\s,'’"()\/-]{6,}$/.test(line);
        if (!sawMarker) {
          if (!looksHeading && line.length >= 3) items.push(line);
          continue;
        }
        if (!current) {
          if (!looksHeading) current = line;
          continue;
        }
        if (looksHeading) {
          flush();
          continue;
        }
        current = `${current} ${line}`.replace(/\s+/g, " ").trim();
      }
      flush();
      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const normalized = deps.canonicalizeComparableText(item);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push(item);
      }
      return deduped;
    };
    const extractHeadingAndBodyFromSelection = (
      selectionRaw: string,
      selectedValueRaw: string
    ): { heading: string; body: string } => {
      const selection = stripMarkupPreserveLines(selectionRaw);
      const selectedValue = stripMarkupPreserveLines(selectedValueRaw);
      if (!selection || !selectedValue) return { heading: "", body: "" };
      const selectionComparable = deps.canonicalizeComparableText(selection);
      const selectedComparable = deps.canonicalizeComparableText(selectedValue);
      if (!selectionComparable || !selectedComparable || selectionComparable === selectedComparable) {
        return { heading: "", body: "" };
      }
      const blocks = selection
        .split(/\n{2,}/)
        .map((block) => String(block || "").trim())
        .filter(Boolean);
      const fromSingleNewline = selection
        .split("\n")
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (blocks.length >= 2) {
        const first = String(blocks[0] || "").trim();
        const firstComparable = deps.canonicalizeComparableText(first);
        if (firstComparable && firstComparable !== selectedComparable) {
          return { heading: first, body: blocks.slice(1).join("\n\n").trim() };
        }
      }
      if (fromSingleNewline.length >= 2) {
        const firstLine = String(fromSingleNewline[0] || "").trim();
        const firstComparable = deps.canonicalizeComparableText(firstLine);
        if (firstComparable && firstComparable !== selectedComparable) {
          return { heading: firstLine, body: fromSingleNewline.slice(1).join("\n").trim() };
        }
      }
      return { heading: "", body: "" };
    };
    let refinedDisplay = refined;
    const selectionForRefined = (() => {
      if (wordingPending || !refined) return "";
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const state = params.state;
      if (!state || typeof state !== "object") return "";
      const activeSpecialist = String((state as Record<string, unknown>).active_specialist || "").trim();
      return deps.wordingSelectionMessage(stepId, state, activeSpecialist, refined);
    })();
    const selectionParts = extractHeadingAndBodyFromSelection(selectionForRefined, refined);
    if (selectionParts.body) refinedDisplay = selectionParts.body;
    const currentSelectedValue = (() => {
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const field = deps.fieldForStep(stepId);
      const fieldValue = field ? String((specialist as Record<string, unknown>)?.[field] || "").trim() : "";
      return refinedDisplay || refined || fieldValue;
    })();
    const selectionForCurrentValue = (() => {
      if (wordingPending) return "";
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const state = params.state;
      if (!state || typeof state !== "object") return "";
      const activeSpecialist = String((state as Record<string, unknown>).active_specialist || "").trim();
      if (!currentSelectedValue) return "";
      return deps.wordingSelectionMessage(stepId, state, activeSpecialist, currentSelectedValue);
    })();
    const selectionCurrentParts = extractHeadingAndBodyFromSelection(
      selectionForCurrentValue,
      currentSelectedValue
    );
    if (selectionCurrentParts.heading && selectionCurrentParts.body) {
      const msgComparable = deps.canonicalizeComparableText(msg);
      const headingComparable = deps.canonicalizeComparableText(selectionCurrentParts.heading);
      const bodyComparable = deps.canonicalizeComparableText(selectionCurrentParts.body);
      const messageParagraphCount = msg
        .split(/\n{2,}/)
        .map((block) => String(block || "").trim())
        .filter(Boolean).length;
      const isBodyOnlyMessage = Boolean(msgComparable) && Boolean(bodyComparable) && (
        msgComparable === bodyComparable ||
        msgComparable.includes(bodyComparable) ||
        bodyComparable.includes(msgComparable)
      );
      const messageHasHeading = Boolean(headingComparable) && msgComparable.includes(headingComparable);
      if (!messageHasHeading && (isBodyOnlyMessage && messageParagraphCount <= 1)) {
        msg = `${selectionCurrentParts.heading}\n\n${selectionCurrentParts.body}`.trim();
      }
    }
    const currentHeading = (() => {
      if (wordingPending) return "";
      if (!msg || !refined) return "";
      const heading = selectionParts.heading || selectionCurrentParts.heading;
      if (!heading) return "";
      const headingComparable = deps.canonicalizeComparableText(heading);
      if (!headingComparable) return "";
      const messageComparables = normalizedLines(msg)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      if (messageComparables.includes(headingComparable)) return "";
      const refinedComparables = normalizedLines(refinedDisplay)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      if (refinedComparables.includes(headingComparable)) return "";
      return heading;
    })();
    if (msg) parts.push(msg);
    if (refined && !wordingPending && !suppressRefinedAppend) {
      const statementComparable = statementLines
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      const refinedComparableLines = normalizedLines(refinedDisplay)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      const refinedMatchesStatements =
        statementComparable.length > 0 &&
        refinedComparableLines.length === statementComparable.length &&
        refinedComparableLines.every((line, idx) => line === statementComparable[idx]);
      const refinedNormalized = deps.canonicalizeComparableText(refinedDisplay);
      const messageNormalized = deps.canonicalizeComparableText(msg);
      const messageLineSet = new Set(normalizedLines(msg).map((line) => deps.canonicalizeComparableText(line)).filter(Boolean));
      const refinedLineSet = normalizedLines(refinedDisplay);
      const duplicateByWhole = Boolean(refinedNormalized) && messageNormalized.includes(refinedNormalized);
      const duplicateByLines =
        refinedLineSet.length > 0 &&
        refinedLineSet.every((line) => {
          const normalized = deps.canonicalizeComparableText(line);
          return Boolean(normalized) && messageLineSet.has(normalized);
        });
      const messageListItems = isBulletConsistencyStep ? extractStructuredListItems(msg) : [];
      const messageListKeys = new Set(
        messageListItems
          .map((line) => deps.canonicalizeComparableText(line))
          .filter(Boolean)
      );
      const refinedListItems = isBulletConsistencyStep ? extractStructuredListItems(refinedDisplay) : [];
      const duplicateByListItems =
        isBulletConsistencyStep &&
        refinedListItems.length > 0 &&
        messageListKeys.size > 0 &&
        refinedListItems.every((line) => {
          const normalized = deps.canonicalizeComparableText(line);
          return Boolean(normalized) && messageListKeys.has(normalized);
        });
      const refinedWithHeading = currentHeading ? `${currentHeading}\n\n${refinedDisplay}` : refinedDisplay;
      if (
        !(dreamBuilderRenderContext && refinedMatchesStatements) &&
        !duplicateByWhole &&
        !duplicateByLines &&
        !duplicateByListItems
      ) {
        parts.push(refinedWithHeading);
      }
    }
    return parts.join("\n\n").trim();
  }

  return {
    buildTextForWidget,
    pickPrompt,
    stripChoiceInstructionNoise,
  };
}

type RunStepRuntimeModelRoutingDecision = {
  applied: boolean;
  candidate_model?: string;
  source?: string;
  config_version?: string;
  model?: string;
};

type RunStepRuntimeRoutingContext = {
  enabled: boolean;
  shadow: boolean;
  actionCode?: string;
  intentType?: string;
};

type RunStepRuntimeFinalizeRoutingDeps = {
  baselineModel: string;
  modelRoutingEnabled: boolean;
  modelRoutingShadow: boolean;
  getState: () => CanvasState;
  getActionCodeRaw: () => string;
  deriveIntentTypeForRouting: (actionCodeRaw: string, routeOrText: string) => string;
  resolveModelForCall: (params: {
    fallbackModel: string;
    routingEnabled: boolean;
    actionCode?: string;
    intentType?: string;
    purpose?: "translation";
  }) => RunStepRuntimeModelRoutingDecision;
  shouldLogLocalDevDiagnostics: () => boolean;
  isUiTranslationFastModelV1Enabled: () => boolean;
};

type RunStepRuntimeFinalizeI18nDeps = {
  localeHint: string;
  localeHintSource: RunStepRuntimeLocaleHintSource;
  inputMode: RunStepRuntimeInputMode;
  isBootstrapPollCall: boolean;
  uiI18nTelemetry: unknown;
  isUiI18nV3LangBootstrapEnabled: () => boolean;
  isUiStartTriggerLangResolveV1Enabled: () => boolean;
  isInteractiveLocaleReady: (state: CanvasState) => boolean;
  normalizeLangCode: (raw: string) => string;
  ensureUiStringsForState: (
    state: CanvasState,
    model: string,
    telemetry?: UiI18nTelemetryCounters | null,
    options?: { allowBackgroundFull?: boolean }
  ) => Promise<CanvasState>;
  resolveLanguageForTurn: (
    state: CanvasState,
    routeOrText: string,
    localeHint: string,
    localeHintSource: RunStepRuntimeLocaleHintSource,
    inputMode: RunStepRuntimeInputMode,
    model: string,
    telemetry?: UiI18nTelemetryCounters | null,
    options?: { allowBackgroundFull?: boolean }
  ) => Promise<CanvasState>;
  isLanguageResolvedThisTurn: () => boolean;
};

type RunStepRuntimeFinalizeResponseDeps<TPayload> = {
  tokenLoggingEnabled: boolean;
  baselineModel: string;
  parseMenuFromContractIdForStep: (contractIdRaw: unknown, stepId: string) => string;
  labelKeysForMenuActionCodes: (menuId: string, actionCodes: string[]) => string[];
  onUiParityError: () => void;
  attachRegistryPayload: RunStepAttachRegistryPayload<TPayload>;
  uiI18nTelemetry: unknown;
  getMigrationApplied: () => boolean;
  getMigrationFromVersion: () => string;
  getBlockingMarkerClass: () => string;
  resolveTurnTokenUsage: () => {
    usage: {
      input_tokens: number | null;
      output_tokens: number | null;
      total_tokens: number | null;
      provider_available: boolean;
    };
    attempts: number;
    models: string[];
  };
  getDreamRuntimeMode: (state: CanvasState) => string;
  getDreamStepId: () => string;
  getDreamExplainerSpecialist: () => string;
  buildTextForWidget: (params: {
    specialist: Record<string, unknown>;
    hasWidgetActions?: boolean;
    questionTextOverride?: string;
    state?: CanvasState | null;
  }) => string;
  pickPrompt: (specialist: Record<string, unknown>) => string;
  renderFreeTextTurnPolicy: RunStepRenderFreeTextTurnPolicy;
  validateRenderedContractOrRecover: RunStepValidateRenderedContractOrRecover;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
};

export type RunStepRuntimeFinalizeLayer<TPayload extends Record<string, unknown>> = {
  buildRoutingContext: (routeOrText: string) => RunStepRuntimeRoutingContext;
  attachRegistryPayload: RunStepAttachRegistryPayload<TPayload>;
  finalizeResponse: (payload: TPayload) => TPayload;
  turnResponseEngine: TurnResponseEngine<TPayload>;
  ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
  ensureLanguage: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
  resolveLocaleAndUiStringsReady: (
    state: CanvasState,
    routeOrText: string
  ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
  ensureStartState: (
    state: CanvasState,
    routeOrText: string
  ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
};

export function createRunStepRuntimeFinalizeLayer<TPayload extends Record<string, unknown>>(params: {
  routing: RunStepRuntimeFinalizeRoutingDeps;
  i18n: RunStepRuntimeFinalizeI18nDeps;
  response: RunStepRuntimeFinalizeResponseDeps<TPayload>;
}): RunStepRuntimeFinalizeLayer<TPayload> {
  const { routing, i18n, response } = params;

  const resolveTranslationModel = (routeOrText: string): string => {
    const explicitTranslationModel = String(process.env.UI_TRANSLATION_MODEL || "").trim();
    if (explicitTranslationModel) return explicitTranslationModel;
    if (!routing.isUiTranslationFastModelV1Enabled()) return routing.baselineModel;
    const routingContext = {
      enabled: routing.modelRoutingEnabled,
      shadow: routing.modelRoutingShadow,
      actionCode: routing.getActionCodeRaw(),
      intentType: routing.deriveIntentTypeForRouting(routing.getActionCodeRaw(), routeOrText),
    };
    const decision = routing.resolveModelForCall({
      fallbackModel: routing.baselineModel,
      routingEnabled: routingContext.enabled,
      actionCode: routingContext.actionCode,
      intentType: routingContext.intentType,
      purpose: "translation",
    });

    if (
      !decision.applied &&
      routingContext.shadow &&
      (routing.shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
      decision.candidate_model &&
      decision.candidate_model !== routing.baselineModel
    ) {
      const state = routing.getState() as Record<string, unknown>;
      console.log("[model_routing_shadow]", {
        specialist: "UiStrings",
        current_step: String(state.current_step || ""),
        baseline_model: routing.baselineModel,
        shadow_model: decision.candidate_model,
        source: decision.source,
        config_version: decision.config_version,
        request_id: String(state.__request_id ?? ""),
        client_action_id: String(state.__client_action_id ?? ""),
      });
    }

    if (decision.source === "translation_model" && String(decision.model || "").trim()) {
      return String(decision.model || "").trim();
    }
    const candidate = String(decision.candidate_model || "").trim();
    if (decision.applied && candidate) return candidate;
    return "gpt-4o-mini";
  };

  const buildRoutingContext = (routeOrText: string): RunStepRuntimeRoutingContext => {
    const actionCodeRaw = routing.getActionCodeRaw();
    return {
      enabled: routing.modelRoutingEnabled,
      shadow: routing.modelRoutingShadow,
      actionCode: actionCodeRaw,
      intentType: routing.deriveIntentTypeForRouting(actionCodeRaw, routeOrText),
    };
  };

  const applyUiClientActionContract = (targetState: CanvasState | null | undefined): void => {
    if (!targetState || typeof targetState !== "object") return;
    const stateRef = targetState as Record<string, unknown>;
    const currentStep = String(stateRef.current_step || "").trim();
    const started = String(stateRef.started || "").trim().toLowerCase() === "true";
    const activeSpecialist = String(stateRef.active_specialist || "").trim();
    const lastSpecialist =
      stateRef.last_specialist_result && typeof stateRef.last_specialist_result === "object"
        ? (stateRef.last_specialist_result as Record<string, unknown>)
        : {};
    const scoringPhase = String(lastSpecialist.scoring_phase || "").trim().toLowerCase() === "true";
    const wordingPending = String(lastSpecialist.wording_choice_pending || "").trim().toLowerCase() === "true";
    const dreamRuntimeMode = String(response.getDreamRuntimeMode(targetState) || "").trim();
    const dreamStepId = response.getDreamStepId();
    const dreamExplainerSpecialist = response.getDreamExplainerSpecialist();
    const isDreamStep = currentStep === dreamStepId;
    const isDreamExplainer = activeSpecialist === dreamExplainerSpecialist;
    const isDreamSpecialist = isDreamStep && !isDreamExplainer;
    const dreamBuilderModeActive =
      dreamRuntimeMode === "builder_collect" ||
      dreamRuntimeMode === "builder_scoring" ||
      dreamRuntimeMode === "builder_refine";
    const suggestDreamBuilder = String(lastSpecialist.suggest_dreambuilder || "").trim().toLowerCase() === "true";
    const interactiveSession = started;
    const textSubmitUsesScores =
      interactiveSession &&
      isDreamStep &&
      isDreamExplainer &&
      (dreamRuntimeMode === "builder_scoring" || scoringPhase);
    const setStateAction = (key: string, value: string): void => {
      if (value) {
        stateRef[key] = value;
        return;
      }
      delete stateRef[key];
    };

    setStateAction("ui_action_start", currentStep === "step_0" && !started ? "ACTION_START" : "");
    setStateAction(
      "ui_action_text_submit",
      interactiveSession
        ? (textSubmitUsesScores ? "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES" : "ACTION_TEXT_SUBMIT")
        : ""
    );
    setStateAction(
      "ui_action_text_submit_payload_mode",
      interactiveSession ? (textSubmitUsesScores ? "scores" : "text") : ""
    );
    setStateAction(
      "ui_action_wording_pick_user",
      interactiveSession && wordingPending ? "ACTION_WORDING_PICK_USER" : ""
    );
    setStateAction(
      "ui_action_wording_pick_suggestion",
      interactiveSession && wordingPending ? "ACTION_WORDING_PICK_SUGGESTION" : ""
    );
    setStateAction(
      "ui_action_dream_start_exercise",
      interactiveSession && isDreamStep && !textSubmitUsesScores && (isDreamSpecialist || suggestDreamBuilder)
        ? "ACTION_DREAM_INTRO_START_EXERCISE"
        : ""
    );
    setStateAction(
      "ui_action_dream_switch_to_self",
      interactiveSession && isDreamStep && (isDreamExplainer || dreamBuilderModeActive)
        ? "ACTION_DREAM_SWITCH_TO_SELF"
        : ""
    );
  };

  const { finalizeResponse } = createRunStepResponseHelpers({
    applyUiClientActionContract,
    parseMenuFromContractIdForStep: response.parseMenuFromContractIdForStep,
    labelKeysForMenuActionCodes: response.labelKeysForMenuActionCodes,
    onUiParityError: response.onUiParityError,
    attachRegistryPayload: (payload, specialist, flagsOverride) =>
      response.attachRegistryPayload(payload, specialist, flagsOverride),
    uiI18nTelemetry: (response.uiI18nTelemetry || {}) as Record<string, unknown>,
    tokenLoggingEnabled: response.tokenLoggingEnabled,
    baselineModel: response.baselineModel,
    getMigrationApplied: response.getMigrationApplied,
    getMigrationFromVersion: response.getMigrationFromVersion,
    getBlockingMarkerClass: response.getBlockingMarkerClass,
    resolveTurnTokenUsage: response.resolveTurnTokenUsage,
  });

  const turnResponseEngine = createTurnResponseEngine<TPayload>({
    renderFreeTextTurnPolicy: response.renderFreeTextTurnPolicy,
    validateRenderedContractOrRecover: response.validateRenderedContractOrRecover,
    applyUiPhaseByStep: response.applyUiPhaseByStep,
    buildTextForWidget: response.buildTextForWidget,
    pickPrompt: response.pickPrompt,
    attachRegistryPayload: response.attachRegistryPayload,
    finalizeResponse: (payload) => finalizeResponse(payload),
  });

  const ensureUiStrings = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    return i18n.ensureUiStringsForState(targetState, translationModel, i18n.uiI18nTelemetry as UiI18nTelemetryCounters | null | undefined, {
      allowBackgroundFull: i18n.isBootstrapPollCall,
    });
  };

  const ensureLanguage = async (targetState: CanvasState, routeOrText: string): Promise<CanvasState> => {
    const translationModel = resolveTranslationModel(routeOrText);
    const allowBackgroundFull = i18n.isBootstrapPollCall || i18n.inputMode === "chat";
    if (!i18n.isUiI18nV3LangBootstrapEnabled()) {
      return i18n.ensureUiStringsForState(targetState, translationModel, i18n.uiI18nTelemetry as UiI18nTelemetryCounters | null | undefined, {
        allowBackgroundFull,
      });
    }
    return i18n.resolveLanguageForTurn(
      targetState,
      routeOrText,
      i18n.localeHint,
      i18n.localeHintSource,
      i18n.inputMode,
      translationModel,
      i18n.uiI18nTelemetry as UiI18nTelemetryCounters | null | undefined,
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
      interactiveReady: i18n.isInteractiveLocaleReady(nextState),
    };
  };

  const ensureStartState = async (
    targetState: CanvasState,
    routeOrText: string
  ): Promise<{ state: CanvasState; interactiveReady: boolean }> => {
    const hasResolvedLanguage = Boolean(
      i18n.normalizeLangCode(String((targetState as Record<string, unknown>).language || ""))
    );
    if (i18n.isLanguageResolvedThisTurn() && hasResolvedLanguage) {
      return {
        state: targetState,
        interactiveReady: i18n.isInteractiveLocaleReady(targetState),
      };
    }
    if (!i18n.isUiStartTriggerLangResolveV1Enabled()) {
      const stateWithUi = await ensureUiStrings(targetState, routeOrText);
      return {
        state: stateWithUi,
        interactiveReady: i18n.isInteractiveLocaleReady(stateWithUi),
      };
    }
    return resolveLocaleAndUiStringsReady(targetState, routeOrText);
  };

  return {
    buildRoutingContext,
    attachRegistryPayload: response.attachRegistryPayload,
    finalizeResponse: (payload) => finalizeResponse(payload),
    turnResponseEngine,
    ensureUiStrings,
    ensureLanguage,
    resolveLocaleAndUiStringsReady,
    ensureStartState,
  };
}
