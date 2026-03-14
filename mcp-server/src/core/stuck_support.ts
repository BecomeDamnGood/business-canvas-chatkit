import type { CanvasState } from "./state.js";
import { isInteractiveSupportStep } from "../steps/step_registry.js";

export type StepSupportMode = "normal" | "stuck_questions" | "stuck_exit";
export type StepSupportState = "ok" | "stuck";
export type SpecialistSupportFamily = "core_step" | "dream_explainer" | "excluded";

function readMap(state: CanvasState, key: string): Record<string, unknown> {
  const raw = (state as Record<string, unknown>)[key];
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function writeMap(state: CanvasState, key: string, value: Record<string, unknown>): void {
  (state as Record<string, unknown>)[key] = value;
}

export function isStuckSupportEligibleStep(stepId: string): boolean {
  return isInteractiveSupportStep(stepId);
}

export function resolveSpecialistSupportFamily(params: {
  stepId: string;
  activeSpecialist?: string;
}): SpecialistSupportFamily {
  const stepId = String(params.stepId || "").trim();
  if (!stepId) return "excluded";
  // DreamExplainer is a special subflow under `dream`, not a registry-backed step family.
  if (String(params.activeSpecialist || "").trim() === "DreamExplainer") return "dream_explainer";
  return isStuckSupportEligibleStep(stepId) ? "core_step" : "excluded";
}

export function readStepSupportState(
  specialist: Record<string, unknown> | null | undefined
): StepSupportState {
  const value = String(specialist?.step_support_state || "").trim().toLowerCase();
  return value === "stuck" ? "stuck" : "ok";
}

export function currentStepSupportMode(state: CanvasState, stepId: string): StepSupportMode {
  const mode = String(readMap(state, "__step_support_mode_by_step")[String(stepId || "").trim()] || "").trim();
  if (mode === "stuck_questions" || mode === "stuck_exit") return mode;
  return "normal";
}

export function currentStepStuckCount(state: CanvasState, stepId: string): number {
  const value = Number(readMap(state, "__step_stuck_count_by_step")[String(stepId || "").trim()] || 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function setStepSupportMode(state: CanvasState, stepId: string, mode: StepSupportMode): void {
  const stepKey = String(stepId || "").trim();
  if (!stepKey) return;
  const next = { ...readMap(state, "__step_support_mode_by_step") };
  next[stepKey] = mode;
  writeMap(state, "__step_support_mode_by_step", next);
}

export function setStepStuckCount(state: CanvasState, stepId: string, count: number): void {
  const stepKey = String(stepId || "").trim();
  if (!stepKey) return;
  const next = { ...readMap(state, "__step_stuck_count_by_step") };
  next[stepKey] = Math.max(0, Math.trunc(Number(count) || 0));
  writeMap(state, "__step_stuck_count_by_step", next);
}

export function clearStepStuckSupport(state: CanvasState, stepId: string): void {
  setStepStuckCount(state, stepId, 0);
  setStepSupportMode(state, stepId, "normal");
}

export function currentTurnSupportMode(params: {
  state: CanvasState;
  stepId: string;
  activeSpecialist?: string;
}): StepSupportMode {
  return resolveSpecialistSupportFamily(params) === "core_step"
    ? currentStepSupportMode(params.state, params.stepId)
    : "normal";
}

export function applyStepStuckSupportAfterSpecialist(params: {
  state: CanvasState;
  stepId: string;
  activeSpecialist?: string;
  specialist: Record<string, unknown>;
  actionCodeRaw?: string;
}): void {
  const stepId = String(params.stepId || "").trim();
  if (resolveSpecialistSupportFamily(params) !== "core_step") return;
  if (String(params.actionCodeRaw || "").trim()) return;

  const userState = readStepSupportState(params.specialist);
  const previousCount = currentStepStuckCount(params.state, stepId);
  const previousMode = currentStepSupportMode(params.state, stepId);

  if (userState !== "stuck") {
    if (previousCount > 0 || previousMode !== "normal") {
      clearStepStuckSupport(params.state, stepId);
    }
    return;
  }

  if (previousMode === "stuck_questions") {
    setStepStuckCount(params.state, stepId, Math.max(previousCount, 2) + 1);
    setStepSupportMode(params.state, stepId, "stuck_exit");
    return;
  }

  if (previousCount >= 1) {
    setStepStuckCount(params.state, stepId, previousCount + 1);
    setStepSupportMode(params.state, stepId, "stuck_questions");
    return;
  }

  setStepStuckCount(params.state, stepId, 1);
  setStepSupportMode(params.state, stepId, "normal");
}
