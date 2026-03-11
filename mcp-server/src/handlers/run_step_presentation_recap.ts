import type { CanvasState } from "../core/state.js";
import { UI_STRINGS_DEFAULT } from "../i18n/ui_strings_defaults.js";
import { parseStep0Final } from "./run_step_step0.js";

type PresentationRecapSectionId =
  | "dream"
  | "purpose"
  | "bigwhy"
  | "role"
  | "entity"
  | "strategy"
  | "targetgroup"
  | "productsservices"
  | "rulesofthegame";

type SectionSpec = {
  finalField: string;
  labelKey: string;
  forceList: boolean;
};

const PRESENTATION_RECAP_SECTION_SPECS: Array<[PresentationRecapSectionId, SectionSpec]> = [
  ["dream", { finalField: "dream_final", labelKey: "ppt.heading.dream", forceList: false }],
  ["purpose", { finalField: "purpose_final", labelKey: "ppt.heading.purpose", forceList: false }],
  ["bigwhy", { finalField: "bigwhy_final", labelKey: "ppt.heading.bigwhy", forceList: false }],
  ["role", { finalField: "role_final", labelKey: "ppt.heading.role", forceList: false }],
  ["entity", { finalField: "entity_final", labelKey: "ppt.heading.entity", forceList: false }],
  ["strategy", { finalField: "strategy_final", labelKey: "ppt.heading.strategy", forceList: true }],
  ["targetgroup", { finalField: "targetgroup_final", labelKey: "ppt.heading.targetgroup", forceList: false }],
  [
    "productsservices",
    {
      finalField: "productsservices_final",
      labelKey: "ppt.heading.productsservices",
      forceList: true,
    },
  ],
  [
    "rulesofthegame",
    {
      finalField: "rulesofthegame_final",
      labelKey: "ppt.heading.rulesofthegame",
      forceList: true,
    },
  ],
];

function uiDefaultString(key: string, fallback = ""): string {
  const value = String(UI_STRINGS_DEFAULT[key] || "").trim();
  return value || String(fallback || "").trim();
}

function uiStringFromStateMap(state: CanvasState | null | undefined, key: string, fallback = ""): string {
  const map =
    state && typeof (state as Record<string, unknown>).ui_strings === "object"
      ? ((state as Record<string, unknown>).ui_strings as Record<string, unknown>)
      : null;
  const candidate = map ? String(map[key] || "").trim() : "";
  return candidate || uiDefaultString(key, fallback);
}

function normalizeInlineWhitespace(raw: unknown): string {
  return String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function normalizeMultilineWhitespace(raw: unknown): string {
  return normalizeInlineWhitespace(raw)
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLine(line: unknown): string {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function nonEmptyLines(raw: unknown): string[] {
  return normalizeMultilineWhitespace(raw)
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);
}

function bulletItemsFromLines(lines: string[]): string[] {
  return lines
    .map((line) => line.match(/^\s*[-*•]\s+(.+)$/)?.[1] || "")
    .map((line) => normalizeLine(line))
    .filter(Boolean);
}

function numberedLines(lines: string[]): string[] {
  return lines
    .filter((line) => /^\s*\d+[\).]\s+\S/.test(line))
    .map((line) => normalizeLine(line));
}

function separatorSplitItems(raw: string): string[] {
  const normalized = normalizeMultilineWhitespace(raw);
  if (!normalized) return [];
  if (normalized.includes("•")) {
    return normalized
      .split("•")
      .map((part) => normalizeLine(part.replace(/^\s*[-*]\s+/, "")))
      .filter(Boolean);
  }
  if (normalized.includes(";")) {
    return normalized
      .split(";")
      .map((part) => normalizeLine(part.replace(/^\s*[-*•]?\s*/, "")))
      .filter(Boolean);
  }
  if (normalized.includes("\n")) {
    return normalized
      .split("\n")
      .map((part) => normalizeLine(part.replace(/^\s*[-*•]?\s*/, "")))
      .filter(Boolean);
  }
  return [];
}

function listLinesForValue(forceList: boolean, rawValue: string): string[] {
  const lines = nonEmptyLines(rawValue);
  if (lines.length === 0) return [];

  const numbered = numberedLines(lines);
  if (numbered.length > 0) return numbered;

  const bullets = bulletItemsFromLines(lines);
  if (bullets.length > 0) return bullets.map((item) => `• ${item}`);

  if (!forceList) return [];

  const splitItems = separatorSplitItems(rawValue);
  if (splitItems.length > 1) return splitItems.map((item) => `• ${item}`);
  if (lines.length > 1) return lines.map((line) => `• ${line}`);
  return [];
}

function inlineValueForSection(rawValue: string): string {
  return normalizeInlineWhitespace(rawValue).replace(/\n+/g, " ").trim();
}

function sectionLabel(state: CanvasState, key: string, fallback: string): string {
  return uiStringFromStateMap(state, key, fallback);
}

function buildStep0Block(state: CanvasState): string {
  const step0Final = String((state as Record<string, unknown>).step_0_final || "").trim();
  if (!step0Final) return "";
  const fallbackName = String((state as Record<string, unknown>).business_name || "").trim();
  const parsed = parseStep0Final(step0Final, fallbackName);
  const venture = normalizeLine(parsed.venture);
  const name = normalizeLine(parsed.name);
  if (!venture && !name) return "";
  const ventureLabel = uiStringFromStateMap(state, "recap.label.venture");
  const nameLabel = uiStringFromStateMap(state, "recap.label.name");
  const blocks: string[] = [];
  if (venture) blocks.push(`${ventureLabel}:\n${venture}`);
  if (name) blocks.push(`${nameLabel}:\n${name}`);
  return blocks.join("\n\n").trim();
}

function buildSectionBlock(state: CanvasState, spec: SectionSpec): string {
  const rawValue = String((state as Record<string, unknown>)[spec.finalField] || "").trim();
  if (!rawValue) return "";
  const label = sectionLabel(state, spec.labelKey, "");
  const listLines = listLinesForValue(spec.forceList, rawValue);
  if (listLines.length > 0) {
    return `${label}:\n${listLines.join("\n")}`.trim();
  }
  const inline = inlineValueForSection(rawValue);
  if (!inline) return "";
  return `${label}:\n${inline}`;
}

export function buildCanonicalPresentationRecap(state: CanvasState): string {
  const blocks: string[] = [];
  const intro = uiStringFromStateMap(state, "presentation.recapIntro");
  const step0Block = buildStep0Block(state);
  if (step0Block) blocks.push(step0Block);
  for (const [, spec] of PRESENTATION_RECAP_SECTION_SPECS) {
    const block = buildSectionBlock(state, spec);
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) return "";
  return [intro, ...blocks].join("\n\n").trim();
}

function isInlineLabelLine(line: string): boolean {
  return /^[^:\n]{2,}:\s+\S/.test(String(line || "").trim());
}

function isLabelOnlyLine(line: string): boolean {
  return /^[^:\n]{2,}:\s*$/.test(String(line || "").trim());
}

function isListLine(line: string): boolean {
  const trimmed = String(line || "").trim();
  return /^(?:•|[-*])\s+\S/.test(trimmed) || /^\d+[\).]\s+\S/.test(trimmed);
}

export function isStructuredPresentationRecap(raw: unknown): boolean {
  const blocks = normalizeMultilineWhitespace(raw)
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
  if (blocks.length < 2) return false;
  const [, ...sections] = blocks;
  if (sections.length === 0) return false;

  let seenSection = false;
  for (const block of sections) {
    const lines = block
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.length === 1) {
      if (!isInlineLabelLine(lines[0])) return false;
      seenSection = true;
      continue;
    }
    if (lines.every((line) => isInlineLabelLine(line))) {
      seenSection = true;
      continue;
    }
    if (!isLabelOnlyLine(lines[0])) return false;
    if (!lines.slice(1).every((line) => !isLabelOnlyLine(line))) return false;
    seenSection = true;
  }
  return seenSection;
}

export function canonicalPresentationRecapForState(
  state: CanvasState,
  rawCandidate?: unknown
): string {
  const canonical = buildCanonicalPresentationRecap(state);
  if (canonical) return canonical;
  const fallback = normalizeMultilineWhitespace(rawCandidate);
  return isStructuredPresentationRecap(fallback) ? fallback : "";
}

export const __testOnly = {
  buildStep0Block,
  buildSectionBlock,
  listLinesForValue,
};
