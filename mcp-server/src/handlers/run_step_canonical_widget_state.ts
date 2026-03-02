export type CanonicalWidgetMode = "prestart" | "interactive";

export type BuildCanonicalWidgetStateInput = {
  step0Id: string;
  currentStepId: string;
  started: boolean;
  hasRenderableContent: boolean;
  hasStartAction: boolean;
  uiGateStatus?: string;
  bootstrapPhase?: string;
  variant?: string;
};

export type BuildCanonicalWidgetStateResult = {
  mode: CanonicalWidgetMode;
  waiting_locale: false;
  has_renderable_content: boolean;
  has_start_action: boolean;
  invariant_ok: boolean;
  reason_code: string;
  variant?: string;
};

export function buildCanonicalWidgetState(
  input: BuildCanonicalWidgetStateInput
): BuildCanonicalWidgetStateResult {
  const currentStepId = String(input.currentStepId || "").trim() || String(input.step0Id || "").trim();
  const step0Id = String(input.step0Id || "").trim();
  const started = input.started === true;
  const hasRenderableContent = input.hasRenderableContent === true;
  const hasStartAction = input.hasStartAction === true;
  const variant = String(input.variant || "").trim();
  void input.uiGateStatus;
  void input.bootstrapPhase;

  if (currentStepId === step0Id && !started) {
    return {
      mode: "prestart",
      waiting_locale: false,
      has_renderable_content: hasRenderableContent,
      has_start_action: hasStartAction,
      invariant_ok: hasStartAction,
      reason_code: hasStartAction ? "" : "step0_start_action_missing",
      ...(variant ? { variant } : {}),
    };
  }

  if (hasRenderableContent) {
    return {
      mode: "interactive",
      waiting_locale: false,
      has_renderable_content: true,
      has_start_action: hasStartAction,
      invariant_ok: true,
      reason_code: "",
      ...(variant ? { variant } : {}),
    };
  }

  return {
    mode: "interactive",
    waiting_locale: false,
    has_renderable_content: false,
    has_start_action: hasStartAction,
    invariant_ok: true,
    reason_code: "",
    ...(variant ? { variant } : {}),
  };
}
