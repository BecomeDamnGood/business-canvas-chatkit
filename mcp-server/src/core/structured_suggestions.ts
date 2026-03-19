import { UI_STRINGS_DEFAULT } from "../i18n/ui_strings_defaults.js";
import {
  getChooseForMeRegistryEntry,
  type StepRegistryChooseForMeItemKind,
} from "../steps/step_registry.js";

export type StructuredSuggestionsItemStyle = "bullets" | "blocks";

export type StructuredSuggestionsContent = {
  kind: "structured_suggestions";
  heading: string;
  items: string[];
  outro: string;
  item_style: StructuredSuggestionsItemStyle;
};

export type StructuredSuggestionsSpecialistFields = {
  suggestion_intro?: string;
  suggestion_items?: string[];
  suggestion_outro?: string;
  suggestion_item_style?: StructuredSuggestionsItemStyle;
};

function uiString(uiStrings: Record<string, unknown> | null | undefined, key: string): string {
  const scoped = uiStrings && typeof uiStrings === "object" ? uiStrings : {};
  return String(scoped[key] || UI_STRINGS_DEFAULT[key] || "").trim();
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

function structuredSuggestionOutro(stepId: string, uiStrings: Record<string, unknown> | null | undefined): string {
  const template = uiString(uiStrings, "structuredSuggestions.outro.template");
  const stepLabel = uiString(uiStrings, `offtopic.step.${stepId}`) || stepId;
  if (!template || !stepLabel) return "";
  return template.replace(/\{0\}/g, stepLabel).trim();
}

function hasCompleteStructuredSuggestionsContract(params: {
  heading: string;
  items: string[];
  outro: string;
}): boolean {
  return Boolean(
    String(params.heading || "").trim() &&
      Array.isArray(params.items) &&
      params.items.length === 3 &&
      params.items.every((item) => String(item || "").trim()) &&
      String(params.outro || "").trim()
  );
}

function extractExplicitItems(
  specialist: Record<string, unknown> | null | undefined,
  itemKind: StepRegistryChooseForMeItemKind
): string[] {
  if (!specialist || typeof specialist !== "object") return [];
  const rawItems = Array.isArray(specialist.suggestion_items)
    ? (specialist.suggestion_items as unknown[])
    : [];
  if (rawItems.length === 0) return [];
  if (itemKind === "multiline_list") {
    const items = rawItems
      .map((raw) => {
        const bulletLines = String(raw || "")
          .replace(/\r/g, "\n")
          .split("\n")
          .map((line) => stripBulletPrefix(String(line || "").trim()))
          .filter(Boolean);
        if (bulletLines.length === 0) return "";
        return bulletLines.map((line) => `- ${line}`).join("\n");
      })
      .filter(Boolean);
    return items.slice(0, 3);
  }
  return rawItems
    .map((raw) => cleanSuggestionItem(String(raw || ""), itemKind))
    .filter(Boolean)
    .slice(0, 3);
}

export function deriveStructuredSuggestionsContent(params: {
  stepId: string;
  menuId?: string;
  message: string;
  uiStrings?: Record<string, unknown> | null;
  specialist?: Record<string, unknown> | null;
}): StructuredSuggestionsContent | null {
  void params.menuId;
  const entry = getChooseForMeRegistryEntry(params.stepId);
  if (!entry) return null;
  const itemKind = entry.chooseForMe.itemKind;
  const itemStyle: StructuredSuggestionsItemStyle = itemKind === "multiline_list" ? "blocks" : "bullets";
  const expectedOutro = structuredSuggestionOutro(entry.stepId, params.uiStrings || null);
  const explicitItems = extractExplicitItems(params.specialist || null, itemKind);
  if (explicitItems.length !== 3) return null;

  const rawHeading = ensureHeading(
    String((params.specialist as Record<string, unknown> | null)?.suggestion_intro || "").trim()
  );
  const rawOutro = String((params.specialist as Record<string, unknown> | null)?.suggestion_outro || "").trim();
  const resolvedOutro = rawOutro || expectedOutro;

  if (
    !hasCompleteStructuredSuggestionsContract({
      heading: rawHeading,
      items: explicitItems,
      outro: resolvedOutro,
    })
  ) {
    return null;
  }

  return {
    kind: "structured_suggestions",
    heading: rawHeading,
    items: explicitItems,
    outro: resolvedOutro,
    item_style: itemStyle,
  };
}
