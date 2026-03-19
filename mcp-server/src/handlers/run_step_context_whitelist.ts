import type { CanvasState } from "../core/state.js";
import { readCompareRuntime } from "./compare_runtime.js";

const GLOBAL_CONTEXT_KEYS = new Set([
  "action",
  "message",
  "question",
  "refined_formulation",
  "user_state",
  "step_support_state",
  "wants_recap",
  "is_offtopic",
  "user_intent",
  "meta_topic",
  "statements",
  "compare_runtime",
  "proceed_request_intent",
  "proceed_block_reason_codes",
  "proceed_block_rule_count",
]);

const STEP_FIELD_BY_STEP_ID: Record<string, string> = {
  dream: "dream",
  purpose: "purpose",
  bigwhy: "bigwhy",
  role: "role",
  entity: "entity",
  strategy: "strategy",
  targetgroup: "targetgroup",
  productsservices: "productsservices",
  rulesofthegame: "rulesofthegame",
  presentation: "presentation",
};

function sanitizeContextValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized.slice(0, 25) : null;
  }
  return null;
}

function sanitizeCompareRuntime(value: unknown): Record<string, unknown> | null {
  const compare = readCompareRuntime({ compare_runtime: value });
  if (!compare) return null;
  const next: Record<string, unknown> = {
    kind: compare.kind,
    mode: compare.mode,
    status: compare.status,
    presentation: compare.presentation,
    feedback_reason_text: compare.feedback_reason_text,
  };
  if (compare.user_text) next.user_text = compare.user_text;
  if (compare.suggestion_text) next.suggestion_text = compare.suggestion_text;
  if (compare.user_items.length > 0) next.user_items = compare.user_items.slice(0, 25);
  if (compare.suggestion_items.length > 0) next.suggestion_items = compare.suggestion_items.slice(0, 25);
  if (compare.pending_text_intent) next.pending_text_intent = compare.pending_text_intent;
  if (compare.pending_text_anchor) next.pending_text_anchor = compare.pending_text_anchor;
  return next;
}

function activeStepField(currentStepId: string): string {
  const stepId = String(currentStepId || "").trim().toLowerCase();
  return STEP_FIELD_BY_STEP_ID[stepId] || "";
}

export function buildContextSafeLastSpecialistResult(
  state: CanvasState
): Record<string, unknown> {
  const raw =
    state.last_specialist_result && typeof state.last_specialist_result === "object"
      ? (state.last_specialist_result as Record<string, unknown>)
      : {};
  const whitelist = new Set<string>(GLOBAL_CONTEXT_KEYS);
  const field = activeStepField(String((state as any).current_step || ""));
  if (field) whitelist.add(field);

  const result: Record<string, unknown> = {};
  for (const key of whitelist) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (key === "compare_runtime") {
      const compareRuntime = sanitizeCompareRuntime(raw[key]);
      if (compareRuntime) result.compare_runtime = compareRuntime;
      continue;
    }
    const value = sanitizeContextValue(raw[key]);
    if (value === null) continue;
    result[key] = value;
  }
  return result;
}
