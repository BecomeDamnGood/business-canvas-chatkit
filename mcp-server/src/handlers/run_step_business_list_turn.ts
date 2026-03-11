import type { CanvasState } from "../core/state.js";
import { STEP_FINAL_FIELD_BY_STEP_ID } from "../core/state.js";
import {
  canonicalizeComparableText,
  normalizeLightUserInput,
  parseListItems,
  tokenizeWords,
} from "./run_step_wording_heuristics.js";

export const BUSINESS_LIST_ROUTE_REMOVE = "__BUSINESS_LIST_REMOVE__";
export const BUSINESS_LIST_ROUTE_REPLACE = "__BUSINESS_LIST_REPLACE__";
export const BUSINESS_LIST_ROUTE_EDIT = "__BUSINESS_LIST_EDIT__";
export const BUSINESS_LIST_ROUTE_CLARIFY = "__BUSINESS_LIST_CLARIFY__";

const BUSINESS_LIST_STEP_IDS = new Set(["strategy", "productsservices", "rulesofthegame"]);

const LIST_REMOVE_VERB =
  /\b(remove|delete|drop|omit|exclude|verwijder|schrap|haal\s+weg|weglaten|wegdoen)\b/i;
const LIST_REPLACE_VERB = /\b(replace|vervang)\b/i;
const LIST_REPLACE_WITH = /\b(with|door|met)\b/i;
const LIST_EDIT_VERB =
  /\b(adjust|edit|change|update|rewrite|rephrase|refine|tighten|improve|sharpen|specify|specificer|specifieker|clearer|shorter|concreter|duidelijker|wijzig|pas\s+aan|herschrijf|herformuleer|verfijn|maak\b.*\b(specifieker|concreter|duidelijker|korter|scherper)\b)\b/i;
const LIST_THIS_REFERENCE =
  /\b(this|this\s+(?:bullet|line|point|item)|deze|dit|deze\s+(?:bullet|regel|zin|punt)|dit\s+(?:bullet|regel|zin|punt))\b/i;
const LIST_EDIT_TRAILING_NOISE =
  /\b(more\s+specific|more\s+concrete|more\s+clear|clearer|shorter|sharper|specifieker|concreter|duidelijker|korter|scherper|aan|please|alsjeblieft)\b/gi;

type TargetResolution =
  | { kind: "matched"; indexes: number[] }
  | { kind: "none" }
  | { kind: "ambiguous"; indexes: number[] };

type ClarifyReason =
  | "missing_reference"
  | "missing_target"
  | "ambiguous_target"
  | "missing_replacement"
  | "missing_instruction";

export type BusinessListTurnResolution =
  | {
      kind: "add";
      stepId: string;
      userMessage: string;
      referenceItems: string[];
      routePrompt: string;
    }
  | {
      kind: "remove";
      stepId: string;
      userMessage: string;
      referenceItems: string[];
      routePrompt: string;
      targetIndexes: number[];
      targetItems: string[];
      updatedItems: string[];
    }
  | {
      kind: "edit";
      stepId: string;
      userMessage: string;
      referenceItems: string[];
      routePrompt: string;
      targetIndex: number;
      targetItem: string;
      editInstruction: string;
      replacementText: string;
      updatedItems: string[] | null;
      operation: "replace" | "rewrite";
    }
  | {
      kind: "clarify";
      stepId: string;
      userMessage: string;
      referenceItems: string[];
      routePrompt: string;
      reason: ClarifyReason;
      targetItems: string[];
    };

function fieldForStep(stepId: string): string {
  return String((STEP_FINAL_FIELD_BY_STEP_ID as Record<string, string>)[stepId] || "").trim();
}

function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const rawItem of items) {
    const item = String(rawItem || "").trim();
    if (!item) continue;
    const comparable = canonicalizeComparableText(item);
    if (!comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    next.push(item);
  }
  return next;
}

function quotedFragments(input: string): string[] {
  const matches = String(input || "").match(/["“”'‘’][^"“”'‘’\n]{2,}["“”'‘’]/g) || [];
  return matches
    .map((value) => String(value || "").replace(/^["“”'‘’]|["“”'‘’]$/g, "").trim())
    .filter(Boolean);
}

function comparableScore(referenceItem: string, fragment: string): number {
  const left = canonicalizeComparableText(referenceItem);
  const right = canonicalizeComparableText(fragment);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;
  const leftTokens = new Set(tokenizeWords(left));
  const rightTokens = new Set(tokenizeWords(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) overlap += 1;
  }
  const union = leftTokens.size + rightTokens.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function resolveIndexesForFragment(referenceItems: string[], fragment: string): TargetResolution {
  const scored = referenceItems
    .map((item, index) => ({ index, score: comparableScore(item, fragment) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (scored.length === 0) return { kind: "none" };
  const topScore = scored[0].score;
  const topIndexes = scored
    .filter((entry) => topScore - entry.score <= 0.08)
    .map((entry) => entry.index);
  if (topIndexes.length > 1) return { kind: "ambiguous", indexes: topIndexes };
  return { kind: "matched", indexes: [scored[0].index] };
}

function sanitizeCommandFragment(input: string): string {
  return String(input || "")
    .replace(/^["“”'‘’]|["“”'‘’]$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeCommandTail(userMessage: string): string {
  return sanitizeCommandFragment(
    String(userMessage || "")
      .replace(LIST_REMOVE_VERB, " ")
      .replace(LIST_THIS_REFERENCE, " ")
      .replace(/\b(?:bullet|regel|zin|punt|point|item|line)\b/gi, " ")
      .replace(/\s+/g, " ")
  );
}

function editCommandTail(userMessage: string): string {
  return sanitizeCommandFragment(
    String(userMessage || "")
      .replace(LIST_EDIT_VERB, " ")
      .replace(LIST_THIS_REFERENCE, " ")
      .replace(/\b(?:bullet|regel|zin|punt|point|item|line)\b/gi, " ")
      .replace(LIST_EDIT_TRAILING_NOISE, " ")
      .replace(/\s+/g, " ")
  );
}

function directReferenceFallback(referenceItems: string[], userMessage: string): TargetResolution {
  if (!LIST_THIS_REFERENCE.test(userMessage)) return { kind: "none" };
  if (referenceItems.length === 1) return { kind: "matched", indexes: [0] };
  return { kind: "ambiguous", indexes: referenceItems.map((_, index) => index) };
}

function resolveRemoveTargets(referenceItems: string[], userMessage: string): TargetResolution {
  const quoted = quotedFragments(userMessage);
  if (quoted.length > 0) {
    const resolvedIndexes = new Set<number>();
    for (const fragment of quoted) {
      const resolution = resolveIndexesForFragment(referenceItems, fragment);
      if (resolution.kind === "ambiguous") return resolution;
      if (resolution.kind === "matched") {
        for (const index of resolution.indexes) resolvedIndexes.add(index);
      }
    }
    if (resolvedIndexes.size > 0) return { kind: "matched", indexes: Array.from(resolvedIndexes).sort((a, b) => a - b) };
  }
  const directReference = directReferenceFallback(referenceItems, userMessage);
  if (directReference.kind !== "none") return directReference;
  const tail = removeCommandTail(userMessage);
  if (!tail) return { kind: "none" };
  return resolveIndexesForFragment(referenceItems, tail);
}

function extractReplaceParts(userMessage: string): { source: string; replacement: string } | null {
  const quoted = quotedFragments(userMessage);
  if (quoted.length >= 2) {
    return {
      source: sanitizeCommandFragment(quoted[0]),
      replacement: sanitizeCommandFragment(quoted[1]),
    };
  }
  const match = String(userMessage || "").match(
    /\b(?:replace|vervang)\b\s+(.+?)\s+\b(?:with|door|met)\b\s+(.+)/i
  );
  if (!match) return null;
  return {
    source: sanitizeCommandFragment(match[1]),
    replacement: sanitizeCommandFragment(match[2]),
  };
}

function resolveEditTarget(referenceItems: string[], userMessage: string): TargetResolution {
  const quoted = quotedFragments(userMessage);
  if (quoted.length >= 1) return resolveIndexesForFragment(referenceItems, quoted[0]);
  const directReference = directReferenceFallback(referenceItems, userMessage);
  if (directReference.kind !== "none") return directReference;
  const tail = editCommandTail(userMessage);
  if (!tail) return { kind: "none" };
  return resolveIndexesForFragment(referenceItems, tail);
}

function isEditInstruction(userMessage: string): boolean {
  const text = String(userMessage || "").trim();
  if (!text) return false;
  if (LIST_EDIT_VERB.test(text)) return true;
  return /\bpas\b[\s\S]{0,80}\baan\b/i.test(text);
}

function serializeListForStep(stepId: string, items: string[]): string {
  const normalizedItems = items.map((item) => String(item || "").trim()).filter(Boolean);
  if (stepId === "rulesofthegame") {
    return normalizedItems.map((item) => `• ${item}`).join("\n").trim();
  }
  return normalizedItems.join("\n").trim();
}

function parseCandidateList(stepId: string, specialistResult: Record<string, unknown>): string[] {
  if (Array.isArray(specialistResult.statements)) {
    const direct = dedupeItems(
      (specialistResult.statements as unknown[])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    );
    if (direct.length > 0) return direct;
  }
  const field = fieldForStep(stepId);
  const fieldItems = dedupeItems(parseListItems(String(specialistResult[field] || "")));
  if (fieldItems.length > 0) return fieldItems;
  return dedupeItems(parseListItems(String(specialistResult.refined_formulation || "")));
}

function rewriteRoutePrompt(params: {
  token: string;
  stepId: string;
  userMessage: string;
  referenceItems: string[];
  extraLines?: string[];
}): string {
  const lines = [
    params.token,
    `STEP_ID: ${params.stepId}`,
    `ORIGINAL_USER_MESSAGE: ${params.userMessage}`,
    `REFERENCE_ITEMS_JSON: ${JSON.stringify(params.referenceItems)}`,
    ...(params.extraLines || []),
  ];
  return lines.join("\n");
}

export function isBusinessListStep(stepId: string): boolean {
  return BUSINESS_LIST_STEP_IDS.has(String(stepId || "").trim());
}

export function readBusinessListReferenceItems(state: CanvasState, stepId: string): string[] {
  if (!isBusinessListStep(stepId)) return [];
  const field = fieldForStep(stepId);
  const lastSpecialist =
    state && typeof (state as Record<string, unknown>).last_specialist_result === "object"
      ? ((state as Record<string, unknown>).last_specialist_result as Record<string, unknown>)
      : {};
  const provisionalByStep =
    state && typeof (state as Record<string, unknown>).provisional_by_step === "object"
      ? ((state as Record<string, unknown>).provisional_by_step as Record<string, unknown>)
      : {};
  const candidates: string[][] = [];
  if (Array.isArray(lastSpecialist.wording_choice_base_items)) {
    candidates.push(dedupeItems((lastSpecialist.wording_choice_base_items as unknown[]).map((item) => String(item || ""))));
  }
  if (Array.isArray(lastSpecialist.statements)) {
    candidates.push(dedupeItems((lastSpecialist.statements as unknown[]).map((item) => String(item || ""))));
  }
  if (field) {
    candidates.push(dedupeItems(parseListItems(String(lastSpecialist[field] || ""))));
    candidates.push(dedupeItems(parseListItems(String(provisionalByStep[stepId] || ""))));
    const finalField = String((STEP_FINAL_FIELD_BY_STEP_ID as Record<string, string>)[stepId] || "").trim();
    if (finalField) {
      candidates.push(dedupeItems(parseListItems(String((state as Record<string, unknown>)[finalField] || ""))));
    }
  }
  return candidates.find((items) => items.length > 0) || [];
}

export function resolveBusinessListTurn(params: {
  stepId: string;
  userMessage: string;
  referenceItems: string[];
}): BusinessListTurnResolution {
  const stepId = String(params.stepId || "").trim();
  const userMessage = String(params.userMessage || "").trim();
  const referenceItems = dedupeItems(params.referenceItems || []);
  const defaultAdd: BusinessListTurnResolution = {
    kind: "add",
    stepId,
    userMessage,
    referenceItems,
    routePrompt: userMessage,
  };
  if (!isBusinessListStep(stepId) || !userMessage) return defaultAdd;
  if (referenceItems.length === 0) {
    // Local list mutations only make sense once there is an existing canonical list to target.
    return defaultAdd;
  }

  if (LIST_REMOVE_VERB.test(userMessage)) {
    const targetResolution = resolveRemoveTargets(referenceItems, userMessage);
    if (targetResolution.kind === "matched" && targetResolution.indexes.length > 0) {
      const updatedItems = referenceItems.filter((_, index) => !targetResolution.indexes.includes(index));
      const targetItems = targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean);
      return {
        kind: "remove",
        stepId,
        userMessage,
        referenceItems,
        routePrompt: rewriteRoutePrompt({
          token: BUSINESS_LIST_ROUTE_REMOVE,
          stepId,
          userMessage,
          referenceItems,
          extraLines: [
            `TARGET_INDEXES_JSON: ${JSON.stringify(targetResolution.indexes)}`,
            `TARGET_ITEMS_JSON: ${JSON.stringify(targetItems)}`,
            `UPDATED_ITEMS_JSON: ${JSON.stringify(updatedItems)}`,
          ],
        }),
        targetIndexes: targetResolution.indexes,
        targetItems,
        updatedItems,
      };
    }
    return {
      kind: "clarify",
      stepId,
      userMessage,
      referenceItems,
      routePrompt: rewriteRoutePrompt({
        token: BUSINESS_LIST_ROUTE_CLARIFY,
        stepId,
        userMessage,
        referenceItems,
        extraLines: [
          `CLARIFY_REASON: ${targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target"}`,
          `TARGET_ITEMS_JSON: ${JSON.stringify(
            targetResolution.kind === "ambiguous"
              ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
              : []
          )}`,
        ],
      }),
      reason: targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target",
      targetItems:
        targetResolution.kind === "ambiguous"
          ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
          : [],
    };
  }

  const replaceParts = extractReplaceParts(userMessage);
  if (LIST_REPLACE_VERB.test(userMessage) && LIST_REPLACE_WITH.test(userMessage)) {
    if (!replaceParts?.source) {
      return {
        kind: "clarify",
        stepId,
        userMessage,
        referenceItems,
        routePrompt: rewriteRoutePrompt({
          token: BUSINESS_LIST_ROUTE_CLARIFY,
          stepId,
          userMessage,
          referenceItems,
          extraLines: ["CLARIFY_REASON: missing_target"],
        }),
        reason: "missing_target",
        targetItems: [],
      };
    }
    if (!replaceParts.replacement) {
      return {
        kind: "clarify",
        stepId,
        userMessage,
        referenceItems,
        routePrompt: rewriteRoutePrompt({
          token: BUSINESS_LIST_ROUTE_CLARIFY,
          stepId,
          userMessage,
          referenceItems,
          extraLines: ["CLARIFY_REASON: missing_replacement"],
        }),
        reason: "missing_replacement",
        targetItems: [],
      };
    }
    const targetResolution = resolveIndexesForFragment(referenceItems, replaceParts.source);
    if (targetResolution.kind === "matched" && targetResolution.indexes.length === 1) {
      const targetIndex = targetResolution.indexes[0];
      const targetItem = String(referenceItems[targetIndex] || "").trim();
      const replacementNormalized = normalizeLightUserInput(replaceParts.replacement).trim();
      const replacementText =
        stepId === "rulesofthegame"
          ? replacementNormalized
          : replacementNormalized.replace(/[.!?]+$/, "").trim();
      const updatedItems = referenceItems.map((item, index) => (index === targetIndex ? replacementText : item));
      return {
        kind: "edit",
        stepId,
        userMessage,
        referenceItems,
        routePrompt: rewriteRoutePrompt({
          token: BUSINESS_LIST_ROUTE_REPLACE,
          stepId,
          userMessage,
          referenceItems,
          extraLines: [
            `TARGET_INDEX: ${targetIndex}`,
            `TARGET_ITEM: ${targetItem}`,
            `REPLACEMENT_ITEM: ${replacementText}`,
            `UPDATED_ITEMS_JSON: ${JSON.stringify(updatedItems)}`,
          ],
        }),
        targetIndex,
        targetItem,
        editInstruction: userMessage,
        replacementText,
        updatedItems,
        operation: "replace",
      };
    }
    return {
      kind: "clarify",
      stepId,
      userMessage,
      referenceItems,
      routePrompt: rewriteRoutePrompt({
        token: BUSINESS_LIST_ROUTE_CLARIFY,
        stepId,
        userMessage,
        referenceItems,
        extraLines: [
          `CLARIFY_REASON: ${targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target"}`,
          `TARGET_ITEMS_JSON: ${JSON.stringify(
            targetResolution.kind === "ambiguous"
              ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
              : []
          )}`,
        ],
      }),
      reason: targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target",
      targetItems:
        targetResolution.kind === "ambiguous"
          ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
          : [],
    };
  }

  if (isEditInstruction(userMessage)) {
    const targetResolution = resolveEditTarget(referenceItems, userMessage);
    if (targetResolution.kind !== "matched" || targetResolution.indexes.length !== 1) {
      return {
        kind: "clarify",
        stepId,
        userMessage,
        referenceItems,
        routePrompt: rewriteRoutePrompt({
          token: BUSINESS_LIST_ROUTE_CLARIFY,
          stepId,
          userMessage,
          referenceItems,
          extraLines: [
            `CLARIFY_REASON: ${
              targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target"
            }`,
            `TARGET_ITEMS_JSON: ${JSON.stringify(
              targetResolution.kind === "ambiguous"
                ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
                : []
            )}`,
          ],
        }),
        reason: targetResolution.kind === "ambiguous" ? "ambiguous_target" : "missing_target",
        targetItems:
          targetResolution.kind === "ambiguous"
            ? targetResolution.indexes.map((index) => referenceItems[index]).filter(Boolean)
            : [],
      };
    }
    const targetIndex = targetResolution.indexes[0];
    const targetItem = String(referenceItems[targetIndex] || "").trim();
    return {
      kind: "edit",
      stepId,
      userMessage,
      referenceItems,
      routePrompt: rewriteRoutePrompt({
        token: BUSINESS_LIST_ROUTE_EDIT,
        stepId,
        userMessage,
        referenceItems,
        extraLines: [
          `TARGET_INDEX: ${targetIndex}`,
          `TARGET_ITEM: ${targetItem}`,
          `EDIT_INSTRUCTION: ${userMessage}`,
        ],
      }),
      targetIndex,
      targetItem,
      editInstruction: userMessage,
      replacementText: "",
      updatedItems: null,
      operation: "rewrite",
    };
  }

  return defaultAdd;
}

function singleChangedIndex(referenceItems: string[], candidateItems: string[]): number {
  if (referenceItems.length !== candidateItems.length) return -1;
  let changedIndex = -1;
  for (let index = 0; index < referenceItems.length; index += 1) {
    const left = canonicalizeComparableText(referenceItems[index]);
    const right = canonicalizeComparableText(candidateItems[index]);
    if (left === right) continue;
    if (changedIndex >= 0) return -1;
    changedIndex = index;
  }
  return changedIndex;
}

function replaceItemAtIndex(items: string[], index: number, value: string): string[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function normalizeResolvedSpecialist(params: {
  stepId: string;
  specialistResult: Record<string, unknown>;
  items: string[];
  forceAsk?: boolean;
}): Record<string, unknown> {
  const { stepId, specialistResult } = params;
  const field = fieldForStep(stepId);
  const listText = serializeListForStep(stepId, params.items);
  const next: Record<string, unknown> = {
    ...specialistResult,
    statements: params.items,
    refined_formulation: listText,
  };
  if (field) next[field] = listText;
  if (params.forceAsk) {
    next.action = "ASK";
    next.is_offtopic = false;
  }
  return next;
}

export function applyBusinessListTurnResolution(params: {
  stepId: string;
  resolution: BusinessListTurnResolution;
  specialistResult: Record<string, unknown>;
}): Record<string, unknown> {
  const { resolution, specialistResult, stepId } = params;
  if (resolution.kind === "add") return specialistResult;
  if (resolution.kind === "clarify") {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: resolution.referenceItems,
      forceAsk: false,
    });
  }
  if (resolution.kind === "remove") {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: resolution.updatedItems,
      forceAsk: true,
    });
  }
  if (resolution.updatedItems) {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: resolution.updatedItems,
      forceAsk: true,
    });
  }

  const candidateItems = parseCandidateList(stepId, specialistResult);
  const changedIndex = singleChangedIndex(resolution.referenceItems, candidateItems);
  if (changedIndex === resolution.targetIndex && candidateItems[changedIndex]) {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: candidateItems,
      forceAsk: true,
    });
  }

  const singleLineCandidate = sanitizeCommandFragment(String(specialistResult.refined_formulation || ""));
  if (
    candidateItems.length === 1 &&
    canonicalizeComparableText(candidateItems[0]) !== canonicalizeComparableText(resolution.targetItem)
  ) {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: replaceItemAtIndex(resolution.referenceItems, resolution.targetIndex, candidateItems[0]),
      forceAsk: true,
    });
  }
  if (
    singleLineCandidate &&
    canonicalizeComparableText(singleLineCandidate) !== canonicalizeComparableText(resolution.targetItem) &&
    tokenizeWords(singleLineCandidate).length >= 2
  ) {
    return normalizeResolvedSpecialist({
      stepId,
      specialistResult,
      items: replaceItemAtIndex(resolution.referenceItems, resolution.targetIndex, singleLineCandidate),
      forceAsk: true,
    });
  }

  return normalizeResolvedSpecialist({
    stepId,
    specialistResult,
    items: resolution.referenceItems,
    forceAsk: false,
  });
}
