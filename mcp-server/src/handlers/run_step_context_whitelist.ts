import type { CanvasState } from "../core/state.js";

const GLOBAL_CONTEXT_KEYS = new Set([
  "action",
  "message",
  "question",
  "refined_formulation",
  "wants_recap",
  "is_offtopic",
  "user_intent",
  "meta_topic",
  "statements",
  "wording_choice_pending",
  "wording_choice_user_raw",
  "wording_choice_user_normalized",
  "wording_choice_user_items",
  "wording_choice_agent_current",
  "wording_choice_suggestion_items",
  "wording_choice_target_field",
  "wording_choice_presentation",
  "wording_choice_user_variant_semantics",
  "wording_choice_user_variant_stepworthy",
  "pending_suggestion_intent",
  "pending_suggestion_anchor",
  "pending_suggestion_seed_source",
  "pending_suggestion_feedback_text",
  "pending_suggestion_presentation_mode",
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
    const value = sanitizeContextValue(raw[key]);
    if (value === null) continue;
    result[key] = value;
  }
  return result;
}
