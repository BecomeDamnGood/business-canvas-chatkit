function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimString(value: unknown): string {
  return String(value || "").trim();
}

export function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

export function parseRetainedInstruction(rawInstruction: unknown): {
  retainedHeading: string;
  retainedItems: string[];
  instructionText: string;
} {
  const instruction = String(rawInstruction || "").replace(/\r/g, "\n").trim();
  if (!instruction) {
    return { retainedHeading: "", retainedItems: [], instructionText: "" };
  }
  const lines = instruction
    .split("\n")
    .map((line) => String(line || "").trim());
  const firstBulletIndex = lines.findIndex((line) => /^(?:[-*•·]|\d+[\).])\s+/.test(line));
  if (firstBulletIndex < 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }

  let bulletEndIndex = firstBulletIndex;
  while (bulletEndIndex < lines.length && /^(?:[-*•·]|\d+[\).])\s+/.test(lines[bulletEndIndex])) {
    bulletEndIndex += 1;
  }

  const retainedHeading = lines
    .slice(0, firstBulletIndex)
    .filter(Boolean)
    .join("\n")
    .trim();
  const retainedItems = lines
    .slice(firstBulletIndex, bulletEndIndex)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[\).])\s+/, "").trim())
    .filter(Boolean);
  const instructionText = lines
    .slice(bulletEndIndex)
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!retainedHeading || retainedItems.length === 0) {
    return { retainedHeading: "", retainedItems: [], instructionText: instruction };
  }
  return { retainedHeading, retainedItems, instructionText: instructionText || instruction };
}

export type CompareRuntimeMode = "text" | "list";
export type CompareRuntimeKind = "text_compare" | "list_compare";
export type CompareRuntimeStatus = "pending" | "resolved";
export type CompareRuntimePresentation = "picker" | "canonical";
export type CompareRuntimeResolution = "" | "user" | "suggestion";

export type CompareRuntimeState = {
  kind: CompareRuntimeKind;
  mode: CompareRuntimeMode;
  status: CompareRuntimeStatus;
  presentation: CompareRuntimePresentation;
  resolution: CompareRuntimeResolution;
  user_text: string;
  user_normalized_text: string;
  user_items: string[];
  suggestion_text: string;
  suggestion_items: string[];
  base_items: string[];
  user_label: string;
  suggestion_label: string;
  grouped_units: unknown[];
  active_unit_index: number;
  grouped_layout: unknown[];
  feedback_reason_text: string;
};

const DEFAULT_COMPARE_RUNTIME: CompareRuntimeState = {
  kind: "text_compare",
  mode: "text",
  status: "resolved",
  presentation: "picker",
  resolution: "",
  user_text: "",
  user_normalized_text: "",
  user_items: [],
  suggestion_text: "",
  suggestion_items: [],
  base_items: [],
  user_label: "",
  suggestion_label: "",
  grouped_units: [],
  active_unit_index: 0,
  grouped_layout: [],
  feedback_reason_text: "",
};

function normalizeMode(raw: unknown): CompareRuntimeMode {
  return trimString(raw).toLowerCase() === "list" ? "list" : "text";
}

function normalizeKind(raw: unknown, fallbackMode: CompareRuntimeMode): CompareRuntimeKind {
  const kind = trimString(raw).toLowerCase();
  if (kind === "list_compare") return "list_compare";
  if (kind === "text_compare") return "text_compare";
  return fallbackMode === "list" ? "list_compare" : "text_compare";
}

function normalizeStatus(raw: unknown, fallbackPending: boolean): CompareRuntimeStatus {
  const value = trimString(raw).toLowerCase();
  if (value === "pending" || value === "resolved") return value;
  return fallbackPending ? "pending" : "resolved";
}

function normalizePresentation(raw: unknown): CompareRuntimePresentation {
  return trimString(raw).toLowerCase() === "canonical" ? "canonical" : "picker";
}

function normalizeResolution(raw: unknown): CompareRuntimeResolution {
  const value = trimString(raw).toLowerCase();
  if (value === "user" || value === "suggestion") return value;
  return "";
}

function normalizeCompareRuntimeRecord(runtimeRaw: unknown): CompareRuntimeState | null {
  const runtime = toRecord(runtimeRaw);
  if (Object.keys(runtime).length === 0) return null;
  const mode = normalizeMode(runtime.mode || runtime.kind);
  const kind = normalizeKind(runtime.kind, mode);
  const status = normalizeStatus(runtime.status, trimString(runtime.status) === "");
  return {
    kind,
    mode,
    status,
    presentation: normalizePresentation(runtime.presentation),
    resolution: normalizeResolution(runtime.resolution),
    user_text: trimString(runtime.user_text),
    user_normalized_text: trimString(runtime.user_normalized_text),
    user_items: normalizeStringArray(runtime.user_items),
    suggestion_text: trimString(runtime.suggestion_text),
    suggestion_items: normalizeStringArray(runtime.suggestion_items),
    base_items: normalizeStringArray(runtime.base_items),
    user_label: trimString(runtime.user_label),
    suggestion_label: trimString(runtime.suggestion_label),
    grouped_units: Array.isArray(runtime.grouped_units) ? runtime.grouped_units : [],
    active_unit_index: Number.isFinite(Number(runtime.active_unit_index))
      ? Math.max(0, Math.trunc(Number(runtime.active_unit_index)))
      : 0,
    grouped_layout: Array.isArray(runtime.grouped_layout) ? runtime.grouped_layout : [],
    feedback_reason_text: trimString(runtime.feedback_reason_text),
  };
}

export function createCompareRuntimeState(runtimeRaw: Partial<CompareRuntimeState>): CompareRuntimeState {
  return normalizeCompareRuntimeRecord({ ...DEFAULT_COMPARE_RUNTIME, ...runtimeRaw }) || {
    ...DEFAULT_COMPARE_RUNTIME,
  };
}

export function readCompareRuntime(raw: unknown): CompareRuntimeState | null {
  const record = toRecord(raw);
  const explicit = normalizeCompareRuntimeRecord(record.compare_runtime);
  if (explicit) return explicit;
  return null;
}

export function hasPendingCompareState(compare: CompareRuntimeState | null | undefined): boolean {
  return compare?.status === "pending";
}

export function hasRenderablePendingCompareState(compare: CompareRuntimeState | null | undefined): boolean {
  if (!hasPendingCompareState(compare)) return false;
  if (!compare) return false;
  const current = compare;
  const feedbackReasonText = trimString(current.feedback_reason_text);
  if (!feedbackReasonText) return false;
  if (current.kind === "list_compare") {
    const userItems = normalizeStringArray(current.user_items);
    const suggestionItems = normalizeStringArray(current.suggestion_items);
    if (userItems.length > 0 && suggestionItems.length > 0) return true;
    const groupedUnits = Array.isArray(current.grouped_units) ? current.grouped_units : [];
    return groupedUnits.some((entry) => {
      const unit = toRecord(entry);
      return (
        normalizeStringArray(unit.user_items).length > 0 &&
        normalizeStringArray(unit.suggestion_items).length > 0 &&
        trimString(unit.feedback_reason_text || current.feedback_reason_text)
      );
    });
  }
  const userText = trimString(current.user_text || current.user_normalized_text);
  const suggestionText = trimString(current.suggestion_text);
  return Boolean(userText && suggestionText);
}

export function patchCompareRuntime(
  raw: unknown,
  runtimePatch: Partial<CompareRuntimeState> | null
): Record<string, unknown> {
  const next = { ...toRecord(raw) };
  if (!runtimePatch) {
    delete next.compare_runtime;
    return next;
  }
  const current = readCompareRuntime(next) || DEFAULT_COMPARE_RUNTIME;
  next.compare_runtime = createCompareRuntimeState({
    ...current,
    ...runtimePatch,
  });
  return next;
}

export function attachCompareRuntime(raw: unknown): Record<string, unknown> {
  const record = { ...toRecord(raw) };
  const compare = readCompareRuntime(record);
  const next = { ...record };
  if (!compare) {
    delete next.compare_runtime;
    return next;
  }
  next.compare_runtime = {
    kind: compare.kind,
    mode: compare.mode,
    status: compare.status,
    presentation: compare.presentation,
    resolution: compare.resolution,
    user_text: compare.user_text,
    user_normalized_text: compare.user_normalized_text,
    user_items: [...compare.user_items],
    suggestion_text: compare.suggestion_text,
    suggestion_items: [...compare.suggestion_items],
    base_items: [...compare.base_items],
    user_label: compare.user_label,
    suggestion_label: compare.suggestion_label,
    grouped_units: Array.isArray(compare.grouped_units) ? [...compare.grouped_units] : [],
    active_unit_index: compare.active_unit_index,
    grouped_layout: Array.isArray(compare.grouped_layout) ? [...compare.grouped_layout] : [],
    feedback_reason_text: compare.feedback_reason_text,
  };
  return next;
}

export function clearCompareRuntime(raw: unknown): Record<string, unknown> {
  const next = { ...toRecord(raw) };
  delete next.compare_runtime;
  return next;
}
