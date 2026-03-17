import { isSingleValueWordingStep } from "../steps/step_registry.js";

function normalizedMode(modeRaw: unknown): "text" | "list" {
  return String(modeRaw || "").trim() === "list" ? "list" : "text";
}

export function resolvePendingWordingChoiceStepId(
  specialist: Record<string, unknown> | null | undefined,
  stepIdHint = ""
): string {
  return String(stepIdHint || specialist?.wording_choice_target_field || "").trim();
}

export function isPickerPresentation(presentationRaw: unknown): boolean {
  return String(presentationRaw || "").trim() !== "canonical";
}

export function isSingleValueTextPickerStep(stepId: string, modeRaw: unknown): boolean {
  if (String(stepId || "").trim() === "dream") return false;
  return normalizedMode(modeRaw) === "text" && isSingleValueWordingStep(stepId);
}

export function isSingleValueTextPickerState(params: {
  specialist: Record<string, unknown> | null | undefined;
  stepIdHint?: string;
}): boolean {
  const specialist = params.specialist || {};
  if (String(specialist.wording_choice_pending || "").trim() !== "true") return false;
  if (!isPickerPresentation(specialist.wording_choice_presentation)) return false;
  const stepId = resolvePendingWordingChoiceStepId(specialist, params.stepIdHint || "");
  return isSingleValueTextPickerStep(stepId, specialist.wording_choice_mode);
}

export function normalizePendingPickerSpecialistContract(params: {
  specialist: Record<string, unknown> | null | undefined;
  stepIdHint?: string;
}): Record<string, unknown> {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? { ...params.specialist }
    : {};
  if (
    String(specialist.wording_choice_pending || "").trim() !== "true" ||
    !isPickerPresentation(specialist.wording_choice_presentation)
  ) {
    return specialist;
  }

  const { ui_content: _ignoredUiContent, ...normalized } = specialist;
  if (!isSingleValueTextPickerState({ specialist: normalized, stepIdHint: params.stepIdHint || "" })) {
    return normalized;
  }

  return {
    ...normalized,
    message: "",
    refined_formulation: "",
  };
}
