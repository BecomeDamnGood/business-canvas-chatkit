import { readPendingInteractionState, type CanvasState } from "../core/state.js";

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
  "pending_interaction_state",
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

function sanitizePendingInteractionState(value: unknown): Record<string, unknown> | null {
  const compare = readPendingInteractionState({ pending_interaction_state: value });
  if (!compare) return null;
  const renderModel = compare.render_model;
  const next: Record<string, unknown> = {
    kind: compare.kind,
    feedback_reason_text: renderModel.feedback_reason_text,
  };
  if (renderModel.user_text) next.user_text = renderModel.user_text;
  if (renderModel.suggestion_text) next.suggestion_text = renderModel.suggestion_text;
  if (renderModel.user_items.length > 0) next.user_items = renderModel.user_items.slice(0, 25);
  if (renderModel.suggestion_items.length > 0) next.suggestion_items = renderModel.suggestion_items.slice(0, 25);
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
  const pendingInteractionState = sanitizePendingInteractionState(
    (state as Record<string, unknown>).pending_interaction_state
  );
  if (pendingInteractionState) {
    result.pending_interaction_state = pendingInteractionState;
  }
  for (const key of whitelist) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (key === "pending_interaction_state") {
      continue;
    }
    const value = sanitizeContextValue(raw[key]);
    if (value === null) continue;
    result[key] = value;
  }
  return result;
}
