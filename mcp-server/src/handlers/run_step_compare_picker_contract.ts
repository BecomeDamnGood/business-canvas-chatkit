import { isSingleValueCompareStep } from "../steps/step_registry.js";
import {
  clearPendingInteractionState,
  hasRenderablePendingInteractionState,
  patchPendingInteractionState,
  type PersistedPendingInteractionState,
} from "../core/state.js";

function normalizedMode(kindRaw: unknown): "text" | "list" {
  return String(kindRaw || "").trim() === "list_compare" ? "list" : "text";
}

export function resolvePendingCompareStepId(
  specialist: Record<string, unknown> | null | undefined,
  stepIdHint = ""
): string {
  return String(stepIdHint || "").trim();
}

export function isSingleValueTextPickerStep(stepId: string, modeRaw: unknown): boolean {
  return normalizedMode(modeRaw) === "text" && isSingleValueCompareStep(stepId);
}

export function isSingleValueTextPickerState(params: {
  compareState: PersistedPendingInteractionState | null | undefined;
  stepIdHint?: string;
}): boolean {
  const compare = params.compareState;
  if (!hasRenderablePendingInteractionState(compare)) return false;
  if (!compare) return false;
  const stepId = String(params.stepIdHint || "").trim();
  return isSingleValueTextPickerStep(stepId, compare.kind);
}

export function normalizePendingPickerSpecialistContract(params: {
  specialist: Record<string, unknown> | null | undefined;
  compareState: PersistedPendingInteractionState | null | undefined;
  stepIdHint?: string;
}): Record<string, unknown> {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? ({ ...(params.specialist as Record<string, unknown>) })
    : {};
  const compare = params.compareState;
  if (!hasRenderablePendingInteractionState(compare)) {
    return clearPendingInteractionState(specialist);
  }

  const { ui_content: _ignoredUiContent, ...normalized } = specialist;
  if (!isSingleValueTextPickerState({ compareState: compare, stepIdHint: params.stepIdHint || "" })) {
    return patchPendingInteractionState(normalized, compare || null);
  }

  return patchPendingInteractionState({
    ...normalized,
    message: "",
    refined_formulation: "",
  }, compare || null);
}
