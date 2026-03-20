function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

export type DreamBuilderCompareRuntimeKind =
  | "batch_rewrite_compare"
  | "overlap_merge_compare";

export type DreamBuilderCompareRuntimeState = {
  kind: DreamBuilderCompareRuntimeKind;
  current_items: string[];
  suggested_items: string[];
  segments: Array<Record<string, unknown>>;
  rationale: string;
  current_label: string;
  suggested_label: string;
};

function normalizeKind(raw: unknown): DreamBuilderCompareRuntimeKind | "" {
  const kind = trimString(raw);
  if (kind === "batch_rewrite_compare" || kind === "overlap_merge_compare") return kind;
  return "";
}

function normalizeDreamBuilderCompareRuntimeRecord(
  raw: unknown
): DreamBuilderCompareRuntimeState | null {
  const record = toRecord(raw);
  if (Object.keys(record).length === 0) return null;
  const kind = normalizeKind(record.kind);
  if (!kind) return null;
  const currentItems = normalizeStringArray(record.current_items);
  const suggestedItems = normalizeStringArray(record.suggested_items);
  if (currentItems.length === 0 || suggestedItems.length === 0) return null;
  return {
    kind,
    current_items: currentItems,
    suggested_items: suggestedItems,
    segments: Array.isArray(record.segments)
      ? (record.segments as Array<Record<string, unknown>>)
      : [],
    rationale: trimString(record.rationale),
    current_label: trimString(record.current_label),
    suggested_label: trimString(record.suggested_label),
  };
}

export function createDreamBuilderCompareRuntimeState(
  raw: Partial<DreamBuilderCompareRuntimeState>
): DreamBuilderCompareRuntimeState {
  const normalized = normalizeDreamBuilderCompareRuntimeRecord(raw);
  if (normalized) return normalized;
  const kind = normalizeKind(raw.kind);
  return {
    kind: kind || "batch_rewrite_compare",
    current_items: normalizeStringArray(raw.current_items),
    suggested_items: normalizeStringArray(raw.suggested_items),
    segments: Array.isArray(raw.segments) ? raw.segments : [],
    rationale: trimString(raw.rationale),
    current_label: trimString(raw.current_label),
    suggested_label: trimString(raw.suggested_label),
  };
}

export function readDreamBuilderCompareRuntime(
  raw: unknown
): DreamBuilderCompareRuntimeState | null {
  const record = toRecord(raw);
  return normalizeDreamBuilderCompareRuntimeRecord(record.dream_builder_compare_runtime);
}

export function patchDreamBuilderCompareRuntime(
  raw: unknown,
  runtimePatch: Partial<DreamBuilderCompareRuntimeState> | null
): Record<string, unknown> {
  const record = { ...toRecord(raw) };
  const next = { ...record };
  if (!runtimePatch) {
    delete next.dream_builder_compare_runtime;
    return next;
  }
  const current = readDreamBuilderCompareRuntime(next);
  next.dream_builder_compare_runtime = createDreamBuilderCompareRuntimeState({
    ...(current || {}),
    ...runtimePatch,
  });
  return next;
}

export function clearDreamBuilderCompareRuntime(raw: unknown): Record<string, unknown> {
  const record = { ...toRecord(raw) };
  const next = { ...record };
  delete next.dream_builder_compare_runtime;
  return next;
}
