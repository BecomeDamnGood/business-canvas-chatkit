import { UI_STRINGS_DEFAULT } from "../i18n/ui_strings_defaults.js";
import {
  getChooseForMeRegistryEntryForMenu,
  type StepRegistryChooseForMeItemKind,
} from "../steps/step_registry.js";

export type StructuredSuggestionsItemStyle = "bullets" | "blocks";

export type StructuredSuggestionsContent = {
  kind: "structured_suggestions";
  heading?: string;
  items: string[];
  outro?: string;
  item_style: StructuredSuggestionsItemStyle;
};

function uiString(uiStrings: Record<string, unknown> | null | undefined, key: string): string {
  const scoped = uiStrings && typeof uiStrings === "object" ? uiStrings : {};
  return String(scoped[key] || UI_STRINGS_DEFAULT[key] || "").trim();
}

function normalizeComparable(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureHeading(raw: string): string {
  const heading = String(raw || "").trim();
  if (!heading) return "";
  const base = heading.replace(/[.:!?]+$/g, "").trim();
  return base ? `${base}:` : "";
}

function stripBulletPrefix(raw: string): string {
  return String(raw || "")
    .replace(/^\s*(?:[-*•·]|\d+[\).])\s+/, "")
    .trim();
}

function cleanSuggestionItem(raw: string, itemKind: StepRegistryChooseForMeItemKind): string {
  const cleaned = stripBulletPrefix(raw)
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return "";
  if (itemKind === "phrase") {
    return cleaned.replace(/[.!?。！？:;]+$/g, "").trim();
  }
  return cleaned;
}

function isLikelyIntroLine(raw: string): boolean {
  const line = normalizeComparable(raw);
  if (!line) return false;
  if (line.includes("here are three")) return true;
  if (line.includes("hier zijn drie")) return true;
  const hasCount =
    line.includes(" three ") ||
    line.startsWith("three ") ||
    line.includes(" drie ") ||
    line.startsWith("drie ");
  const hasCue =
    /\b(example|examples|suggestion|suggestions|formulation|formulations|voorbeeld|voorbeelden|suggestie|suggesties|formulering|formuleringen)\b/i.test(
      line
    ) ||
    /\b(dream|purpose|big why|grote waarom|role|entity|bestaansreden|droom)\b/i.test(line);
  return hasCount && hasCue;
}

function looksLikeDiscoveryQuestions(raw: string): boolean {
  const lines = String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const numberedQuestions = lines.filter((line) => /^\d+[\).]\s+/.test(line) && /\?$/.test(line));
  const bulletLines = lines.filter((line) => /^\s*[-*•·]\s+/.test(line));
  return numberedQuestions.length >= 2 && bulletLines.length === 0;
}

function splitBlocks(raw: string): string[] {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
}

function structuredSuggestionOutro(stepId: string, uiStrings: Record<string, unknown> | null | undefined): string {
  const template = uiString(uiStrings, "structuredSuggestions.outro.template");
  const stepLabel = uiString(uiStrings, `offtopic.step.${stepId}`) || stepId;
  if (!template || !stepLabel) return "";
  return template.replace(/\{0\}/g, stepLabel).trim();
}

function isLikelyOutroBlock(raw: string, expectedOutro: string): boolean {
  const block = normalizeComparable(raw);
  if (!block) return false;
  const expected = normalizeComparable(expectedOutro);
  if (expected && block === expected) return true;
  return block.startsWith("i hope these suggestions inspire") || block.startsWith("ik hoop dat deze suggesties je inspireren");
}

function extractSentenceOrPhraseItems(
  bodyBlocks: string[],
  itemKind: StepRegistryChooseForMeItemKind
): string[] {
  const body = bodyBlocks.join("\n\n").trim();
  if (!body) return [];
  const bulletItems = body
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter((line) => /^\s*[-*•·]\s+/.test(line))
    .map((line) => cleanSuggestionItem(line, itemKind))
    .filter(Boolean);
  if (bulletItems.length > 0) return bulletItems.slice(0, 3);

  const paragraphItems = bodyBlocks
    .flatMap((block) =>
      block
        .split("\n")
        .map((line) => String(line || "").trim())
        .filter(Boolean)
    )
    .map((line) => cleanSuggestionItem(line, itemKind))
    .filter((line) => Boolean(line) && !isLikelyIntroLine(line));
  return paragraphItems.slice(0, 3);
}

function extractMultilineListItems(bodyBlocks: string[]): string[] {
  const items: string[] = [];
  for (const block of bodyBlocks) {
    const lines = String(block || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const withoutExampleMarker =
      /^example\s+\d+$/i.test(lines[0] || "") || /^voorbeeld\s+\d+$/i.test(lines[0] || "")
        ? lines.slice(1)
        : lines;
    const bulletLines = withoutExampleMarker
      .filter((line) => /^\s*[-*•·]\s+/.test(line))
      .map((line) => stripBulletPrefix(line))
      .filter(Boolean);
    if (bulletLines.length === 0) continue;
    items.push(bulletLines.map((line) => `- ${line}`).join("\n"));
  }
  return items.slice(0, 3);
}

export function deriveStructuredSuggestionsContent(params: {
  stepId: string;
  menuId: string;
  message: string;
  uiStrings?: Record<string, unknown> | null;
}): StructuredSuggestionsContent | null {
  const entry = getChooseForMeRegistryEntryForMenu(params.stepId, params.menuId);
  if (!entry) return null;
  const message = String(params.message || "").replace(/\r/g, "\n").trim();
  if (!message || looksLikeDiscoveryQuestions(message)) return null;

  const blocks = splitBlocks(message);
  if (blocks.length === 0) return null;

  const itemKind = entry.chooseForMe.itemKind;
  const itemStyle: StructuredSuggestionsItemStyle = itemKind === "multiline_list" ? "blocks" : "bullets";
  const workingBlocks = [...blocks];
  let heading = "";
  let outro = "";
  const expectedOutro = structuredSuggestionOutro(entry.stepId, params.uiStrings || null);

  if (workingBlocks.length > 1 && isLikelyIntroLine(workingBlocks[0] || "")) {
    heading = ensureHeading(String(workingBlocks.shift() || "").trim());
  }

  if (workingBlocks.length > 1 && isLikelyOutroBlock(workingBlocks[workingBlocks.length - 1] || "", expectedOutro)) {
    outro = String(workingBlocks.pop() || "").trim();
  }

  let items =
    itemKind === "multiline_list"
      ? extractMultilineListItems(workingBlocks)
      : extractSentenceOrPhraseItems(workingBlocks, itemKind);

  if (!heading) {
    const firstLine = message
      .split("\n")
      .map((line) => String(line || "").trim())
      .find(Boolean) || "";
    if (isLikelyIntroLine(firstLine)) {
      heading = ensureHeading(firstLine);
      if (items.length === 0) {
        const withoutIntro = message
          .split("\n")
          .slice(1)
          .join("\n")
          .trim();
        const fallbackBlocks = splitBlocks(withoutIntro);
        items =
          itemKind === "multiline_list"
            ? extractMultilineListItems(fallbackBlocks)
            : extractSentenceOrPhraseItems(fallbackBlocks, itemKind);
      }
    }
  }

  if (items.length === 0) return null;

  return {
    kind: "structured_suggestions",
    ...(heading ? { heading } : {}),
    items: items.slice(0, 3),
    ...(outro || expectedOutro ? { outro: outro || expectedOutro } : {}),
    item_style: itemStyle,
  };
}
