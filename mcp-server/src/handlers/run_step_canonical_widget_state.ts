export type CanonicalWidgetMode = "prestart" | "interactive";
export type CanonicalStep0InteractionState = "none" | "step0_ready" | "step0_editing";

export type BuildCanonicalWidgetStateInput = {
  step0Id: string;
  currentStepId: string;
  started: boolean;
  hasRenderableContent: boolean;
  hasStartAction: boolean;
  uiGateStatus?: string;
  bootstrapPhase?: string;
  variant?: string;
  step0InteractionState?: string;
  isMutable?: boolean;
  editableFields?: string[];
};

export type BuildCanonicalWidgetStateResult = {
  mode: CanonicalWidgetMode;
  interaction_state: CanonicalStep0InteractionState;
  waiting_locale: false;
  has_renderable_content: boolean;
  has_start_action: boolean;
  is_mutable: boolean;
  editable_fields: string[];
  invariant_ok: boolean;
  reason_code: string;
  variant?: string;
};

function normalizeStep0InteractionState(
  raw: unknown,
  currentStepId: string,
  step0Id: string,
  started: boolean
): CanonicalStep0InteractionState {
  const normalized = String(raw || "").trim().toLowerCase();
  if (currentStepId !== step0Id || !started) return "none";
  if (normalized === "step0_editing") return "step0_editing";
  if (normalized === "step0_ready") return "step0_ready";
  return "step0_ready";
}

function normalizeEditableFields(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const fields = raw
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(fields));
}

export function buildCanonicalWidgetState(
  input: BuildCanonicalWidgetStateInput
): BuildCanonicalWidgetStateResult {
  const currentStepId = String(input.currentStepId || "").trim() || String(input.step0Id || "").trim();
  const step0Id = String(input.step0Id || "").trim();
  const started = input.started === true;
  const hasRenderableContent = input.hasRenderableContent === true;
  const hasStartAction = input.hasStartAction === true;
  const variant = String(input.variant || "").trim();
  const interactionState = normalizeStep0InteractionState(
    input.step0InteractionState,
    currentStepId,
    step0Id,
    started
  );
  const normalizedEditableFields = normalizeEditableFields(input.editableFields);
  const isMutable =
    interactionState === "step0_editing"
      ? true
      : interactionState === "step0_ready"
        ? false
        : input.isMutable === true;
  const editableFields =
    interactionState === "step0_editing"
      ? (normalizedEditableFields.length > 0 ? normalizedEditableFields : ["business_name"])
      : interactionState === "step0_ready"
        ? []
        : normalizedEditableFields;
  void input.uiGateStatus;
  void input.bootstrapPhase;

  if (currentStepId === step0Id && !started) {
    return {
      mode: "prestart",
      interaction_state: "none",
      waiting_locale: false,
      has_renderable_content: hasRenderableContent,
      has_start_action: hasStartAction,
      is_mutable: false,
      editable_fields: [],
      invariant_ok: hasStartAction,
      reason_code: hasStartAction ? "" : "step0_start_action_missing",
      ...(variant ? { variant } : {}),
    };
  }

  if (hasRenderableContent) {
    return {
      mode: "interactive",
      interaction_state: interactionState,
      waiting_locale: false,
      has_renderable_content: true,
      has_start_action: hasStartAction,
      is_mutable: isMutable,
      editable_fields: editableFields,
      invariant_ok: true,
      reason_code: "",
      ...(variant ? { variant } : {}),
    };
  }

  return {
    mode: "interactive",
    interaction_state: interactionState,
    waiting_locale: false,
    has_renderable_content: false,
    has_start_action: hasStartAction,
    is_mutable: isMutable,
    editable_fields: editableFields,
    invariant_ok: true,
    reason_code: "",
    ...(variant ? { variant } : {}),
  };
}
