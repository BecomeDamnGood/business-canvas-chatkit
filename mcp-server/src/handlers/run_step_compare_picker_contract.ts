import { isSingleValueCompareStep } from "../steps/step_registry.js";

function normalizedMode(modeRaw: unknown): "text" | "list" {
  return String(modeRaw || "").trim() === "list" ? "list" : "text";
}

export function resolvePendingCompareStepId(
  specialist: Record<string, unknown> | null | undefined,
  stepIdHint = ""
): string {
  return String(stepIdHint || specialist?.compare_target_field || "").trim();
}

export function isPickerPresentation(presentationRaw: unknown): boolean {
  return String(presentationRaw || "").trim() !== "canonical";
}

export function isSingleValueTextPickerStep(stepId: string, modeRaw: unknown): boolean {
  return normalizedMode(modeRaw) === "text" && isSingleValueCompareStep(stepId);
}

export function isSingleValueTextPickerState(params: {
  specialist: Record<string, unknown> | null | undefined;
  stepIdHint?: string;
}): boolean {
  const specialist = params.specialist || {};
  if (String(specialist.compare_pending || "").trim() !== "true") return false;
  if (!isPickerPresentation(specialist.compare_presentation)) return false;
  const stepId = resolvePendingCompareStepId(specialist, params.stepIdHint || "");
  return isSingleValueTextPickerStep(stepId, specialist.compare_mode);
}

export function normalizePendingPickerSpecialistContract(params: {
  specialist: Record<string, unknown> | null | undefined;
  stepIdHint?: string;
}): Record<string, unknown> {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? { ...params.specialist }
    : {};
  if (
    String(specialist.compare_pending || "").trim() !== "true" ||
    !isPickerPresentation(specialist.compare_presentation)
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
