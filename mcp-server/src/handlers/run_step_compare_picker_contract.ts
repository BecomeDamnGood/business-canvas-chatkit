import { isSingleValueCompareStep } from "../steps/step_registry.js";
import {
  attachCompareRuntime,
  readCompareRuntime,
} from "./compare_runtime.js";

function normalizedMode(modeRaw: unknown): "text" | "list" {
  return String(modeRaw || "").trim() === "list" ? "list" : "text";
}

export function resolvePendingCompareStepId(
  specialist: Record<string, unknown> | null | undefined,
  stepIdHint = ""
): string {
  const compare = readCompareRuntime(specialist);
  return String(stepIdHint || compare?.target_field || "").trim();
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
  const compare = readCompareRuntime(params.specialist);
  if (compare?.status !== "pending") return false;
  if (!isPickerPresentation(compare.presentation)) return false;
  const stepId = String(params.stepIdHint || compare.target_field || "").trim();
  return isSingleValueTextPickerStep(stepId, compare.mode);
}

export function normalizePendingPickerSpecialistContract(params: {
  specialist: Record<string, unknown> | null | undefined;
  stepIdHint?: string;
}): Record<string, unknown> {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? ({ ...(params.specialist as Record<string, unknown>) })
    : {};
  const compare = readCompareRuntime(specialist);
  if (
    compare?.status !== "pending" ||
    !isPickerPresentation(compare.presentation)
  ) {
    return attachCompareRuntime(specialist);
  }

  const { ui_content: _ignoredUiContent, ...normalized } = specialist;
  if (!isSingleValueTextPickerState({ specialist: normalized, stepIdHint: params.stepIdHint || "" })) {
    return attachCompareRuntime(normalized);
  }

  return attachCompareRuntime({
    ...normalized,
    message: "",
    refined_formulation: "",
  });
}
