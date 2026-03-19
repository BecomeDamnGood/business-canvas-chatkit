import type { CanvasState } from "../core/state.js";
import { currentTurnSupportMode } from "../core/stuck_support.js";
import { deriveStructuredSuggestionsContent } from "../core/structured_suggestions.js";
import { UI_STRINGS_DEFAULT } from "../i18n/ui_strings_defaults.js";

import { createRunStepResponseHelpers } from "./run_step_response.js";
import type {
  RunStepAttachRegistryPayload,
  RunStepRenderFreeTextTurnPolicy,
  RunStepValidateRenderedContractOrRecover,
} from "./run_step_ports.js";
import { createTurnResponseEngine, type TurnResponseEngine } from "./run_step_turn_response_engine.js";
import type { UiI18nTelemetryCounters } from "./run_step_i18n_runtime.js";
import { looksLikeExamplesFramingLine } from "./run_step_value_shape.js";
import { isSingleValueTextPickerState } from "./run_step_compare_picker_contract.js";
import { readCompareRuntime } from "./compare_runtime.js";
import { hasGroupedCompareListSemantics } from "../steps/step_registry.js";

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
  compareSelectionMessage: (
    stepId: string,
    state: CanvasState,
    activeSpecialist?: string,
    selectedValue?: string
  ) => string;
  mergeListItems: (userItems: string[], suggestionItems: string[]) => string[];
  splitSentenceItems: (text: string) => string[];
  sanitizePendingListMessage: (
    message: string,
    fallbackItems: string[],
    state?: CanvasState | null | undefined,
    specialist?: Record<string, unknown> | null | undefined
  ) => string;
  isComparePanelCleanBodyV1Enabled: () => boolean;
  fieldForStep: (stepId: string) => string;
  stripUnsupportedReformulationClaims: (message: string) => string;
  tokenizeWords: (text: string) => string[];
  compactComparePanelBody: (message: string, state?: CanvasState | null | undefined) => string;
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

import { getChooseForMeRegistryEntryForMenu } from "../steps/step_registry.js";

function stripMarkupPreserveLines(value: string): string {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type StructuredSuggestionMenuConfig = {
  stepId: string;
  itemKind: "sentence" | "phrase" | "multiline_list";
  mode: "suggestions" | "examples";
  validActionCodes: string[];
};
type StructuredSuggestionItemKind = StructuredSuggestionMenuConfig["itemKind"];
type StructuredSuggestionMode = StructuredSuggestionMenuConfig["mode"];

const STRUCTURED_SUGGESTION_STEP_LABEL_FALLBACKS: Record<string, string> = {
  dream: "Dream",
  purpose: "Purpose",
  bigwhy: "Big Why",
  role: "Role",
  entity: "Entity",
  strategy: "Strategy",
};

function structuredSuggestionMenuConfigFor(contractStepId: string, menuId: string): StructuredSuggestionMenuConfig | null {
  const entry = getChooseForMeRegistryEntryForMenu(contractStepId, menuId);
  if (!entry) return null;
  return {
    stepId: entry.stepId,
    itemKind: entry.chooseForMe.itemKind,
    mode: entry.chooseForMe.mode,
    validActionCodes: [entry.chooseForMe.actionCode],
  };
}

function ensureStructuredSuggestionHeading(line: string): string {
  const collapsed = String(line || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const withoutTrailingPunctuation = collapsed.replace(/[.!?:\u3002\uff01\uff1f\uff1a]+$/g, "").trim();
  return withoutTrailingPunctuation ? `${withoutTrailingPunctuation}:` : "";
}

function looksLikeStructuredSuggestionIntro(text: string): boolean {
  const collapsed = String(text || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return false;
  if (looksLikeExamplesFramingLine(collapsed)) return true;
  return /^(here(?:\s+are|\s+is)?|hier\s+zijn|voici|hier\s+sind|ecco|aqu[ií]\s+(?:hay|est[aá]n))\b.{0,160}\bsuggestions?\b/i.test(
    collapsed
  );
}

function looksLikeStructuredSuggestionOutro(text: string): boolean {
  const collapsed = String(text || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return false;
  return (
    /\bi hope\b/i.test(collapsed) ||
    /\bthese suggestions\b/i.test(collapsed) ||
    /\bwrite your own\b/i.test(collapsed) ||
    (/\binspir/i.test(collapsed) && /\byour own\b/i.test(collapsed)) ||
    /\bchoose one for me\b/i.test(collapsed)
  );
}

function structuredSuggestionStepLabel(
  stepId: string,
  stateUiStrings: Record<string, unknown>
): string {
  const fromPpt = String(stateUiStrings[`ppt.heading.${stepId}`] || "").trim();
  if (fromPpt) return fromPpt;
  const fromOfftopic = String(stateUiStrings[`offtopic.step.${stepId}`] || "").trim();
  if (fromOfftopic) return fromOfftopic;
  return STRUCTURED_SUGGESTION_STEP_LABEL_FALLBACKS[String(stepId || "").trim()] || String(stepId || "").trim();
}

function structuredSuggestionOutro(stepId: string, stateUiStrings: Record<string, unknown>): string {
  const template = String(stateUiStrings["structuredSuggestions.outro.template"] || "").trim()
    || String(UI_STRINGS_DEFAULT["structuredSuggestions.outro.template"] || "").trim();
  const stepLabel = structuredSuggestionStepLabel(stepId, stateUiStrings);
  return String(template || "").replace(/\{0\}/g, stepLabel).trim();
}

function splitStructuredSuggestionLeadBlock(params: {
  block: string;
  itemKind: StructuredSuggestionItemKind;
}): { intro: string; remainder: string } {
  const block = String(params.block || "").replace(/\r/g, "\n").trim();
  if (!block || !looksLikeStructuredSuggestionIntro(block)) {
    return { intro: "", remainder: block };
  }

  const lines = block
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return {
      intro: lines[0] || "",
      remainder: lines.slice(1).join("\n").trim(),
    };
  }

  const singleLine = lines[0] || block;
  const inlineDashParts = singleLine
    .split(/\s+-\s+/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (inlineDashParts.length >= 2 && looksLikeStructuredSuggestionIntro(inlineDashParts[0])) {
    return {
      intro: inlineDashParts[0] || "",
      remainder: inlineDashParts.slice(1).map((part) => `- ${part}`).join("\n").trim(),
    };
  }

  const sentenceParts = singleLine
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (sentenceParts.length >= 2 && looksLikeStructuredSuggestionIntro(sentenceParts[0])) {
    const remainder =
      params.itemKind === "phrase"
        ? sentenceParts.slice(1).map((part) => `- ${part.replace(/[.!?]+$/g, "").trim()}`).join("\n")
        : sentenceParts.slice(1).map((part) => `- ${part}`).join("\n");
    return {
      intro: sentenceParts[0] || "",
      remainder: remainder.trim(),
    };
  }

  return { intro: singleLine, remainder: "" };
}

function looksLikeStructuredDiscoveryQuestions(raw: string): boolean {
  const lines = String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const numberedQuestionLines = lines.filter((line) => /^\d+[\).]\s+.+\?\s*$/.test(line));
  return numberedQuestionLines.length >= 3;
}

function extractStructuredSuggestionItems(params: {
  raw: string;
  itemKind: StructuredSuggestionItemKind;
  tokenizeWords: (text: string) => string[];
}): string[] {
  const raw = String(params.raw || "").replace(/\r/g, "\n").trim();
  if (!raw) return [];

  const lines = raw
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const fragments: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    const bulletMatch = line.match(/^\s*(?:[-*•]|\d+[\).])\s*(.+)\s*$/);
    const candidateRaw = bulletMatch ? String(bulletMatch[1] || "").trim() : line;
    if (!candidateRaw) continue;
    if (looksLikeStructuredSuggestionIntro(candidateRaw)) continue;
    if (looksLikeStructuredSuggestionOutro(candidateRaw)) continue;

    if (bulletMatch) {
      fragments.push(candidateRaw);
      continue;
    }

    const splitPattern =
      params.itemKind === "phrase"
        ? /(?:\s+-\s+|[;\n]+|(?<=[.!?])\s+(?=\S))/
        : /(?:\s+-\s+|(?<=[.!?])\s+(?=\S))/;
    const parts = candidateRaw
      .split(splitPattern)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    fragments.push(...(parts.length > 0 ? parts : [candidateRaw]));
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    const normalizedFragment = String(fragment || "").replace(/\s+/g, " ").trim();
    if (!normalizedFragment) continue;
    if (looksLikeStructuredSuggestionIntro(normalizedFragment)) continue;
    if (looksLikeStructuredSuggestionOutro(normalizedFragment)) continue;

    let candidate =
      params.itemKind === "phrase"
        ? normalizedFragment.replace(/[.!?]+$/g, "").trim()
        : normalizedFragment;
    if (!candidate || candidate.endsWith("?")) continue;

    const words = params.tokenizeWords(candidate);
    if (params.itemKind === "phrase") {
      if (words.length < 2 || words.length > 10) continue;
    } else if (params.itemKind === "multiline_list") {
      continue;
    } else {
      if (words.length < 5) continue;
      if (!/[.!?]$/.test(candidate)) candidate = `${candidate}.`;
    }

    const key = String(candidate || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function looksLikeStrategyExampleMarker(line: string): boolean {
  const collapsed = String(line || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return false;
  return /^(?:example|voorbeeld|ejemplo|exemple|beispiel|esempio|exemplo|пример|उदाहरण|예시|例|strategy|strategie|estrategia|stratégie|strategie)\s*\d+\s*:?$/i.test(
    collapsed
  );
}

function extractStructuredStrategyExampleItems(raw: string): string[] {
  const blocks = String(raw || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
  const items: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const bulletLines = lines
      .filter((line) => /^(?:[-*•]|\d+[\).])\s+/.test(line))
      .map((line) => line.replace(/^(?:[-*•]|\d+[\).])\s+/, "").trim())
      .filter(Boolean);
    if (bulletLines.length < 2) continue;
    const nonBulletLines = lines.filter((line) => !/^(?:[-*•]|\d+[\).])\s+/.test(line));
    if (nonBulletLines.length > 0 && !nonBulletLines.every((line) => looksLikeStrategyExampleMarker(line))) {
      continue;
    }
    if (nonBulletLines.length === 0 && bulletLines.length > 7) continue;
    const candidate = bulletLines.join("\n").trim();
    const key = candidate
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(candidate);
  }
  if (items.length > 0) return items.slice(0, 3);
  const flatBulletLines = String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter((line) => /^(?:[-*•]|\d+[\).])\s+/.test(line))
    .map((line) => line.replace(/^(?:[-*•]|\d+[\).])\s+/, "").trim())
    .filter(Boolean);
  const total = flatBulletLines.length;
  if (total < 12 || total > 21) return [];
  const base = Math.floor(total / 3);
  const remainder = total % 3;
  const sizes = [base, base, base].map((size, index) => size + (index < remainder ? 1 : 0));
  if (sizes.some((size) => size < 4 || size > 7)) return [];
  const fallbackItems: string[] = [];
  let cursor = 0;
  for (const size of sizes) {
    const part = flatBulletLines.slice(cursor, cursor + size);
    cursor += size;
    if (part.length !== size) return [];
    fallbackItems.push(part.join("\n"));
  }
  return fallbackItems.slice(0, 3);
}

function normalizeStructuredSuggestionMessage(params: {
  contractStepId: string;
  menuId: string;
  messageRaw: string;
  stateUiStrings: Record<string, unknown>;
  tokenizeWords: (text: string) => string[];
  specialist?: Record<string, unknown> | null;
}): string {
  const config = structuredSuggestionMenuConfigFor(params.contractStepId, params.menuId);
  if (!config) return String(params.messageRaw || "").trim();
  const message = String(params.messageRaw || "").replace(/\r/g, "\n").trim();
  if (!message) return "";
  if (looksLikeStructuredDiscoveryQuestions(message)) return message;
  const content = deriveStructuredSuggestionsContent({
    stepId: params.contractStepId,
    menuId: params.menuId,
    message,
    uiStrings: params.stateUiStrings,
    specialist: params.specialist || null,
  });
  if (!content || content.items.length === 0) return message;
  const parts: string[] = [];
  if (content.heading) parts.push(content.heading);
  if (content.item_style === "blocks") {
    parts.push(content.items.join("\n\n"));
  } else {
    parts.push(content.items.map((item) => `- ${item}`).join("\n"));
  }
  if (content.outro) parts.push(content.outro);
  return parts.filter(Boolean).join("\n\n").trim();
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

type SuggestionStateSnapshot = {
  stepId: string;
  items: string[];
  mode: StructuredSuggestionMode;
  valid_for_action_codes: string[];
};

export function createRunStepRuntimeTextHelpers(deps: RunStepRuntimeTextHelpersDeps) {
  function buildTextForWidget(params: {
    specialist: Record<string, unknown>;
    hasWidgetActions?: boolean;
    questionTextOverride?: string;
    state?: CanvasState | null;
  }): string {
    const specialist =
      params.specialist && typeof params.specialist === "object"
        ? ({ ...(params.specialist as Record<string, unknown>) })
        : {};
    const compareState = readCompareRuntime(specialist);
    const parts: string[] = [];

    const contractId = String((specialist as Record<string, unknown>)?.ui_contract_id || "").trim();
    const contractParts = contractId.split(":");
    const contractStepId = contractParts[0] || "";
    const dreamBuilderComparePending =
      contractStepId === deps.dreamStepId &&
      String(specialist?.__dream_builder_compare_pending || "").trim().toLowerCase() === "true";
    const comparePending =
      compareState?.status === "pending" ||
      dreamBuilderComparePending;
    const wordingMode = dreamBuilderComparePending
      ? "list"
      : (compareState?.mode === "list" ? "list" : "text");
    const comparePresentation = String(compareState?.presentation || "").trim();
    const canonicalPendingTextSuggestion =
      comparePending && wordingMode === "text" && comparePresentation === "canonical";
    const wordingSuggestion = stripMarkupPreserveLines(
      dreamBuilderComparePending
        ? String(
            (
              Array.isArray(specialist?.__dream_builder_compare_suggested_items)
                ? (specialist.__dream_builder_compare_suggested_items as string[])
                : []
            ).join("\n") || specialist?.refined_formulation || ""
          )
        : String(compareState?.suggestion_text || specialist?.refined_formulation || "")
    );
    const normalizeLine = (value: string): string =>
      String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/g, "")
        .trim();
    const suggestionNorm = normalizeLine(wordingSuggestion);
    const contractStatus = String(contractParts[1] || "").trim().toLowerCase();
    if (isSingleValueTextPickerState({ specialist, stepIdHint: contractStepId })) {
      return "";
    }
    const isSingleValueConfirmStep = new Set(["purpose", "bigwhy", "role", "entity", "targetgroup"]).has(
      contractStepId
    );
    const isSingleValueValidOutput = contractStatus === "valid_output" && isSingleValueConfirmStep;
    const menuId = deps.parseMenuFromContractIdForStep(contractId, contractStepId).toUpperCase();
    const stateUiStrings =
      params.state && typeof (params.state as Record<string, unknown>).ui_strings === "object"
        ? ((params.state as Record<string, unknown>).ui_strings as Record<string, unknown>)
        : {};
    const dreamRuntimeModeRaw = String(
      ((params.state as Record<string, unknown> | null | undefined)?.__dream_runtime_mode || "")
    ).trim();
    const dreamBuilderModeActive =
      contractStepId === deps.dreamStepId &&
      (dreamRuntimeModeRaw === "builder_collect" ||
        dreamRuntimeModeRaw === "builder_refine" ||
        dreamRuntimeModeRaw === "builder_scoring");
    const stateDreamBuilderStatements =
      Array.isArray((params.state as Record<string, unknown> | null | undefined)?.dream_builder_statements)
        ? (((params.state as Record<string, unknown>).dream_builder_statements as unknown[])
            .map((line) => String(line || "").trim())
            .filter(Boolean))
        : [];
    const specialistStatementLines = Array.isArray(specialist?.statements)
      ? (specialist.statements as string[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const statementLines = stateDreamBuilderStatements.length > 0
      ? stateDreamBuilderStatements
      : specialistStatementLines;
    const stripMarkers = (line: string): string =>
      String(line || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "")
        .trim();
    const keepDreamBuilderSupportParagraphsOnly = (messageRaw: string): string => {
      const paragraphs = String(messageRaw || "")
        .replace(/\r/g, "\n")
        .split(/\n{2,}/)
        .map((part) => stripMarkers(String(part || "").replace(/\n+/g, " ").trim()))
        .filter(Boolean);
      if (paragraphs.length === 0) return "";
      const kept = paragraphs.filter((paragraph) => {
        const words = deps.tokenizeWords(paragraph).length;
        const sentenceCount = deps.splitSentenceItems(paragraph).length;
        return words > 0 && words <= 18 && sentenceCount <= 1;
      });
      return kept.join("\n\n").trim();
    };
    const dreamBuilderRenderContext =
      statementLines.length > 0 &&
      contractStepId === deps.dreamStepId &&
      (
        dreamBuilderModeActive ||
        String(specialist?.suggest_dreambuilder || "").trim() === "true" ||
        menuId.startsWith("DREAM_EXPLAINER_MENU_")
      );
    const dreamBuilderCanonicalOnlyView = dreamBuilderRenderContext;
    const suppressRefinedAppend =
      String(specialist?.__suppress_refined_append || "").trim() === "true" ||
      isSingleValueValidOutput ||
      dreamBuilderCanonicalOnlyView;

    let msg = stripMarkupPreserveLines(String(specialist?.message ?? ""));
    if (dreamBuilderRenderContext && msg) {
      const dreamStatementsTitleComparable = deps.canonicalizeComparableText(
        String(stateUiStrings["dreamBuilder.statements.title"] || "").trim()
      );
      const normalizeCountComparable = (value: string): string =>
        deps
          .canonicalizeComparableText(String(value || ""))
          .replace(/\b\d+\b/g, "n")
          .replace(/\bn\b/g, "n")
          .replace(/\s+/g, " ")
          .trim();
      const dreamStatementsCountComparable = normalizeCountComparable(
        String(stateUiStrings["dreamBuilder.statements.count"] || "").trim()
      );
      const statementKeys = new Set(
        statementLines
          .map((line) => deps.canonicalizeComparableText(String(line || "")))
          .filter(Boolean)
      );
      if (statementKeys.size >= 2) {
        const paragraphs = msg
          .replace(/\r/g, "\n")
          .split(/\n{2,}/)
          .map((part) => String(part || "").trim())
          .filter(Boolean);
        const filteredParagraphs = paragraphs.filter((paragraph) => {
          const sentenceKeys = deps
            .splitSentenceItems(stripMarkers(String(paragraph || "").replace(/\n+/g, " ").trim()))
            .map((line) => deps.canonicalizeComparableText(line))
            .filter(Boolean);
          if (sentenceKeys.length < 2) return true;
          return !sentenceKeys.every((key) => statementKeys.has(key));
        });
        msg = filteredParagraphs.join("\n\n").trim();
      }
      const cleanedLines = msg
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((lineRaw) => {
          const line = String(lineRaw || "").trim();
          if (!line) return true;
          const stripped = stripMarkers(line);
          const lineKey = deps.canonicalizeComparableText(stripped);
          if (lineKey && statementKeys.has(lineKey)) return false;
          if (lineKey && dreamStatementsTitleComparable && lineKey === dreamStatementsTitleComparable) {
            return false;
          }
          if (
            lineKey &&
            dreamStatementsCountComparable &&
            normalizeCountComparable(lineKey) === dreamStatementsCountComparable
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
      if (statementKeys.size >= 2 && msg) {
        const messageSentenceKeys = deps
          .splitSentenceItems(stripMarkers(msg.replace(/\n+/g, " ").trim()))
          .map((line) => deps.canonicalizeComparableText(line))
          .filter(Boolean);
        if (messageSentenceKeys.length >= 2 && messageSentenceKeys.every((key) => statementKeys.has(key))) {
          msg = "";
        }
      }
      if (msg) {
        msg = keepDreamBuilderSupportParagraphsOnly(msg);
      }
    }
    if (comparePending && wordingMode === "text" && suggestionNorm) {
      const paragraphs = msg
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      const filtered = paragraphs.filter((p) => normalizeLine(p) !== suggestionNorm);
      msg = filtered.join("\n\n").trim();
    }
    if (comparePending && wordingMode === "list" && msg) {
      const compareState = readCompareRuntime(specialist);
      const userItems = dreamBuilderComparePending
        ? (
            Array.isArray(specialist?.__dream_builder_compare_current_items)
              ? (specialist.__dream_builder_compare_current_items as string[])
              : []
          )
            .map((line) => String(line || "").trim())
            .filter(Boolean)
        : (compareState?.user_items || []).map((line) => String(line || "").trim()).filter(Boolean);
      const suggestionItems = dreamBuilderComparePending
        ? (
            Array.isArray(specialist?.__dream_builder_compare_suggested_items)
              ? (specialist.__dream_builder_compare_suggested_items as string[])
              : []
          )
            .map((line) => String(line || "").trim())
            .filter(Boolean)
        : (compareState?.suggestion_items || []).map((line) => String(line || "").trim()).filter(Boolean);
      const knownItems = deps.mergeListItems(userItems, suggestionItems);
      const fallbackItems = knownItems.length > 0 ? knownItems : deps.splitSentenceItems(wordingSuggestion);
      msg = deps.sanitizePendingListMessage(msg, fallbackItems, params.state || null, specialist);
    }
    if (comparePending && deps.isComparePanelCleanBodyV1Enabled()) {
      msg = deps.compactComparePanelBody(msg, params.state || null);
    }
    const promptFromSpecialist = stripMarkupPreserveLines(String(specialist?.question ?? ""));
    const promptOverride = stripMarkupPreserveLines(String(params.questionTextOverride || ""));
    const prompt = promptOverride || promptFromSpecialist;
    msg = normalizeStructuredSuggestionMessage({
      contractStepId,
      menuId,
      messageRaw: msg,
      stateUiStrings,
      tokenizeWords: deps.tokenizeWords,
      specialist,
    });
    let refined = stripMarkupPreserveLines(String(specialist?.refined_formulation ?? ""));
    if (!comparePending) {
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
    const isBulletConsistencyStep = hasGroupedCompareListSemantics(contractStepId);
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
      if (dreamBuilderCanonicalOnlyView || comparePending || !refined) return "";
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const state = params.state;
      if (!state || typeof state !== "object") return "";
      const activeSpecialist = String((state as Record<string, unknown>).active_specialist || "").trim();
      return deps.compareSelectionMessage(stepId, state, activeSpecialist, refined);
    })();
    const selectionParts = extractHeadingAndBodyFromSelection(selectionForRefined, refined);
    if (selectionParts.body) refinedDisplay = selectionParts.body;
    const currentSelectedValue = (() => {
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const field = deps.fieldForStep(stepId);
      const fieldValue = field ? String((specialist as Record<string, unknown>)?.[field] || "").trim() : "";
      const state = params.state && typeof params.state === "object"
        ? (params.state as Record<string, unknown>)
        : null;
      const provisionalByStep =
        state && typeof state.provisional_by_step === "object"
          ? (state.provisional_by_step as Record<string, unknown>)
          : {};
      const finalField = `${stepId}_final`;
      const stateBackedValue = String(
        provisionalByStep?.[stepId] ||
        (state ? state[finalField] : "") ||
        ""
      ).trim();
      return refinedDisplay || refined || fieldValue || stateBackedValue;
    })();
    const selectionForCurrentValue = (() => {
      if (dreamBuilderCanonicalOnlyView || comparePending) return "";
      const stepId = String(contractStepId || "").trim();
      if (!stepId || !deps.fieldForStep(stepId)) return "";
      const state = params.state;
      if (!state || typeof state !== "object") return "";
      const activeSpecialist = String((state as Record<string, unknown>).active_specialist || "").trim();
      if (!currentSelectedValue) return "";
      return deps.compareSelectionMessage(stepId, state, activeSpecialist, currentSelectedValue);
    })();
    const selectionCurrentParts = extractHeadingAndBodyFromSelection(
      selectionForCurrentValue,
      currentSelectedValue
    );
    const groupedCompareCurrentValueBlock = (() => {
      if (dreamBuilderCanonicalOnlyView || comparePending || isSingleValueValidOutput || !isBulletConsistencyStep) {
        return "";
      }
      if (selectionCurrentParts.heading && selectionCurrentParts.body) {
        return `${selectionCurrentParts.heading}\n\n${selectionCurrentParts.body}`.trim();
      }
      const currentValueListItems = extractStructuredListItems(currentSelectedValue);
      if (currentValueListItems.length >= 2) {
        return currentValueListItems.map((line) => `• ${line}`).join("\n");
      }
      return currentSelectedValue;
    })();
    const stripGroupedCompareCurrentValueNoise = (messageRaw: string): string => {
      if (!groupedCompareCurrentValueBlock) return String(messageRaw || "").trim();
      const headingComparable = deps.canonicalizeComparableText(selectionCurrentParts.heading);
      const blockComparable = deps.canonicalizeComparableText(groupedCompareCurrentValueBlock);
      const currentItemKeys = new Set(
        extractStructuredListItems(groupedCompareCurrentValueBlock)
          .map((line) => deps.canonicalizeComparableText(line))
          .filter(Boolean)
      );
      const keptParagraphs: string[] = [];
      const seenParagraphs = new Set<string>();
      const paragraphs = String(messageRaw || "")
        .replace(/\r/g, "\n")
        .split(/\n{2,}/)
        .map((part) => String(part || "").trim())
        .filter(Boolean);
      for (const paragraph of paragraphs) {
        const paragraphComparable = deps.canonicalizeComparableText(paragraph);
        if (blockComparable && paragraphComparable === blockComparable) continue;
        const keptLines = paragraph
          .split("\n")
          .map((line) => String(line || "").trim())
          .filter(Boolean)
          .filter((line) => {
            const lineComparable = deps.canonicalizeComparableText(line);
            if (!lineComparable) return false;
            if (headingComparable && lineComparable === headingComparable) return false;
            const itemComparable = deps.canonicalizeComparableText(
              line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim()
            );
            if (itemComparable && currentItemKeys.has(itemComparable)) return false;
            return true;
          });
        const cleanedParagraph = keptLines.join("\n").trim();
        if (!cleanedParagraph) continue;
        const cleanedComparable = deps.canonicalizeComparableText(cleanedParagraph);
        if (!cleanedComparable || cleanedComparable === blockComparable || seenParagraphs.has(cleanedComparable)) continue;
        seenParagraphs.add(cleanedComparable);
        keptParagraphs.push(cleanedParagraph);
      }
      return keptParagraphs.join("\n\n").trim();
    };
    if (groupedCompareCurrentValueBlock) {
      msg = stripGroupedCompareCurrentValueNoise(msg);
    }
    if (!msg && !comparePending && !isSingleValueValidOutput && isBulletConsistencyStep && currentSelectedValue) {
      msg = groupedCompareCurrentValueBlock;
    }
    if (
      !groupedCompareCurrentValueBlock &&
      !dreamBuilderCanonicalOnlyView &&
      !isSingleValueValidOutput &&
      selectionCurrentParts.heading &&
      selectionCurrentParts.body
    ) {
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
      if (groupedCompareCurrentValueBlock) return "";
      if (isSingleValueValidOutput) return "";
      if (comparePending) return "";
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
    const canonicalPendingSuggestionText = canonicalPendingTextSuggestion ? wordingSuggestion : "";
    const canonicalPendingSuggestionHeading = canonicalPendingTextSuggestion
      ? stripMarkupPreserveLines(String(stateUiStrings["compareSuggestionLabel"] || "").trim())
      : "";
    const canonicalPendingSuggestionBlock = canonicalPendingSuggestionText
      ? (
        canonicalPendingSuggestionHeading
          ? `${canonicalPendingSuggestionHeading}\n${canonicalPendingSuggestionText}`
          : canonicalPendingSuggestionText
      ).trim()
      : "";
    if (msg) parts.push(msg);
    if (groupedCompareCurrentValueBlock) {
      const messageLineSet = new Set(
        normalizedLines(msg).map((line) => deps.canonicalizeComparableText(line)).filter(Boolean)
      );
      const groupedBlockLines = normalizedLines(groupedCompareCurrentValueBlock);
      const duplicateByLines =
        groupedBlockLines.length > 0 &&
        groupedBlockLines.every((line) => {
          const normalized = deps.canonicalizeComparableText(line);
          return Boolean(normalized) && messageLineSet.has(normalized);
        });
      if (!duplicateByLines) {
        parts.push(groupedCompareCurrentValueBlock);
      }
    }
    if (canonicalPendingSuggestionText) {
      const suggestionNormalized = deps.canonicalizeComparableText(canonicalPendingSuggestionText);
      const messageNormalized = deps.canonicalizeComparableText(msg);
      const messageLineSet = new Set(
        normalizedLines(msg).map((line) => deps.canonicalizeComparableText(line)).filter(Boolean)
      );
      const suggestionLines = normalizedLines(canonicalPendingSuggestionText);
      const duplicateByWhole = Boolean(suggestionNormalized) && messageNormalized.includes(suggestionNormalized);
      const duplicateByLines =
        suggestionLines.length > 0 &&
        suggestionLines.every((line) => {
          const normalized = deps.canonicalizeComparableText(line);
          return Boolean(normalized) && messageLineSet.has(normalized);
        });
      if (!duplicateByWhole && !duplicateByLines) {
        parts.push(canonicalPendingSuggestionBlock);
      }
    }
    if (refined && !groupedCompareCurrentValueBlock && !comparePending && !suppressRefinedAppend) {
      const statementComparable = statementLines
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      const statementComparableSet = new Set(statementComparable);
      const refinedComparableLines = normalizedLines(refinedDisplay)
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      const refinedMatchesStatementsByLines =
        statementComparable.length > 0 &&
        refinedComparableLines.length === statementComparable.length &&
        refinedComparableLines.every((line, idx) => line === statementComparable[idx]);
      const refinedSentenceComparables = deps
        .splitSentenceItems(stripMarkers(refinedDisplay.replace(/\n+/g, " ").trim()))
        .map((line) => deps.canonicalizeComparableText(line))
        .filter(Boolean);
      const refinedSentenceSet = new Set(refinedSentenceComparables);
      const refinedMatchesStatementsBySentences =
        statementComparableSet.size > 0 &&
        refinedSentenceSet.size === statementComparableSet.size &&
        Array.from(refinedSentenceSet).every((line) => statementComparableSet.has(line));
      const refinedMatchesStatements = refinedMatchesStatementsByLines || refinedMatchesStatementsBySentences;
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

  function deriveSuggestionStateForWidget(params: {
    specialist: Record<string, unknown>;
    state?: CanvasState | null;
  }): SuggestionStateSnapshot | null {
    const contractId = String((params.specialist as Record<string, unknown>)?.ui_contract_id || "").trim();
    if (!contractId) return null;
    const contractParts = contractId.split(":");
    const contractStepId = String(contractParts[0] || "").trim();
    const menuId = deps.parseMenuFromContractIdForStep(contractId, contractStepId).toUpperCase();
    const config = structuredSuggestionMenuConfigFor(contractStepId, menuId);
    if (!config) return null;
    const uiStrings =
      params.state && typeof (params.state as Record<string, unknown>).ui_strings === "object"
        ? ((params.state as Record<string, unknown>).ui_strings as Record<string, unknown>)
        : null;
    const content = deriveStructuredSuggestionsContent({
      stepId: contractStepId,
      menuId,
      message: String((params.specialist as Record<string, unknown>).message || "").trim(),
      uiStrings,
      specialist: params.specialist,
    });
    if (!content || content.items.length === 0) return null;
    const items =
      config.itemKind === "multiline_list"
        ? content.items.map((item) =>
            String(item || "")
              .split("\n")
              .map((line) => String(line || "").replace(/^\s*[-*•·]\s+/, "").trim())
              .filter(Boolean)
              .join("\n")
          )
        : [...content.items];

    return {
      stepId: config.stepId,
      items,
      mode: config.mode,
      valid_for_action_codes: [...config.validActionCodes],
    };
  }

  return {
    buildTextForWidget,
    deriveSuggestionStateForWidget,
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
  deriveSuggestionStateForWidget: (params: {
    specialist: Record<string, unknown>;
    state?: CanvasState | null;
  }) => {
    stepId: string;
    items: string[];
    mode: "suggestions" | "examples";
    valid_for_action_codes: string[];
  } | null;
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
    const intentType = routing.deriveIntentTypeForRouting(actionCodeRaw, routeOrText);
    const state = routing.getState() as Record<string, unknown>;
    state.__turn_last_routing_action_code = actionCodeRaw;
    state.__turn_last_routing_intent_type = intentType;
    return {
      enabled: routing.modelRoutingEnabled,
      shadow: routing.modelRoutingShadow,
      actionCode: actionCodeRaw,
      intentType,
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
    const dreamRuntimeMode = String(response.getDreamRuntimeMode(targetState) || "").trim();
    const dreamStepId = response.getDreamStepId();
    const dreamExplainerSpecialist = response.getDreamExplainerSpecialist();
    const isDreamStep = currentStep === dreamStepId;
    const dreamBuilderComparePending =
      isDreamStep && String(lastSpecialist.__dream_builder_compare_pending || "").trim().toLowerCase() === "true";
    const compareState = readCompareRuntime(lastSpecialist);
    const comparePending =
      compareState?.status === "pending" ||
      dreamBuilderComparePending;
    const isDreamExplainer = activeSpecialist === dreamExplainerSpecialist;
    const isDreamSpecialist = isDreamStep && !isDreamExplainer;
    const dreamBuilderModeActive =
      dreamRuntimeMode === "builder_collect" ||
      dreamRuntimeMode === "builder_scoring" ||
      dreamRuntimeMode === "builder_refine";
    const suggestDreamBuilder = String(lastSpecialist.suggest_dreambuilder || "").trim().toLowerCase() === "true";
    const interactiveSession = started;
    const dreamBuilderScoringActive =
      interactiveSession &&
      isDreamStep &&
      isDreamExplainer &&
      (dreamRuntimeMode === "builder_scoring" || scoringPhase);
    const scoreSubmitAvailable = false;
    const setStateAction = (key: string, value: string): void => {
      if (value) {
        stateRef[key] = value;
        return;
      }
      delete stateRef[key];
    };

    setStateAction("ui_action_start", currentStep === "step_0" && !started ? "ACTION_START" : "");
    const supportMode = currentTurnSupportMode({
      state: stateRef as CanvasState,
      stepId: currentStep,
      activeSpecialist,
    });
    const textSubmitAvailable =
      interactiveSession && supportMode !== "stuck_exit";
    setStateAction(
      "ui_action_text_submit",
      textSubmitAvailable ? "ACTION_TEXT_SUBMIT" : ""
    );
    setStateAction(
      "ui_action_text_submit_payload_mode",
      textSubmitAvailable ? "text" : ""
    );
    setStateAction(
      "ui_action_score_submit",
      scoreSubmitAvailable ? "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES" : ""
    );
    setStateAction(
      "ui_action_compare_pick_user",
      interactiveSession && comparePending ? "ACTION_COMPARE_PICK_USER" : ""
    );
    setStateAction(
      "ui_action_compare_pick_suggestion",
      interactiveSession && comparePending ? "ACTION_COMPARE_PICK_SUGGESTION" : ""
    );
    setStateAction("ui_action_compare_pick_user", "");
    setStateAction("ui_action_compare_pick_suggestion", "");
    setStateAction(
      "ui_action_dream_start_exercise",
      interactiveSession &&
        isDreamStep &&
        !dreamBuilderScoringActive &&
        (isDreamSpecialist || suggestDreamBuilder)
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
    deriveSuggestionStateForWidget: response.deriveSuggestionStateForWidget,
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
