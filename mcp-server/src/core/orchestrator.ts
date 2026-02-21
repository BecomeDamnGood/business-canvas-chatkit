// src/core/orchestrator.ts
import { z } from "zod";
import { CANONICAL_STEPS, isCanonicalStepId, type BoolString, type CanvasState } from "./state.js";
import type { TransitionEvent } from "../contracts/transitions.js";

/**
 * ORCHESTRATOR (ROUTER + STEP STATE)
 *
 * Parity-first implementation based on the logic document:
 * - Output is strict JSON (no nulls) via Zod
 * - Decides next specialist + next step
 * - Computes show_session_intro + show_step_intro
 * - Pass-through intro_shown_for_step (do NOT update it here)
 *
 * NOTE: This module is NOT user-facing.
 */

export type OrchestratorStepId = (typeof CANONICAL_STEPS)[number];

export type SpecialistName =
  | "ValidationAndBusinessName"
  | "Dream"
  | "DreamExplainer"
  | "Purpose"
  | "BigWhy"
  | "Role"
  | "Entity"
  | "Strategy"
  | "TargetGroup"
  | "ProductsServices"
  | "RulesOfTheGame"
  | "Presentation";

export const OrchestratorOutputZod = z.object({
  specialist_to_call: z.enum([
    "ValidationAndBusinessName",
    "Dream",
    "DreamExplainer",
    "Purpose",
    "BigWhy",
    "Role",
    "Entity",
    "Strategy",
    "TargetGroup",
    "ProductsServices",
    "RulesOfTheGame",
    "Presentation",
  ]),
  specialist_input: z.string(),
  current_step: z.enum([
    "step_0",
    "dream",
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
    "presentation",
  ]),
  intro_shown_for_step: z.enum(["", ...CANONICAL_STEPS] as any),
  intro_shown_session: z.enum(["true", "false"]),
  show_step_intro: z.enum(["true", "false"]),
  show_session_intro: z.enum(["true", "false"]),
});

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputZod>;

export function sameOrchestratorOutput(a: OrchestratorOutput, b: OrchestratorOutput): boolean {
  return (
    String(a.specialist_to_call || "") === String(b.specialist_to_call || "") &&
    String(a.current_step || "") === String(b.current_step || "") &&
    String(a.show_step_intro || "") === String(b.show_step_intro || "") &&
    String(a.show_session_intro || "") === String(b.show_session_intro || "") &&
    String(a.intro_shown_for_step || "") === String(b.intro_shown_for_step || "") &&
    String(a.intro_shown_session || "") === String(b.intro_shown_session || "")
  );
}

function boolStr(x: unknown): BoolString {
  return String(x ?? "").trim() === "true" ? "true" : "false";
}

function normalizeIntroShownForStep(x: unknown): string {
  return String(x ?? "").trim();
}

function normalizeCurrentStep(x: unknown): OrchestratorStepId {
  const v = String(x ?? "").trim() || "step_0";
  return isCanonicalStepId(v) ? (v as OrchestratorStepId) : "step_0";
}

function normalizeActiveSpecialist(x: unknown): string {
  return String(x ?? "").trim();
}

function normalizeDreamRuntimeMode(raw: unknown): "self" | "builder_collect" | "builder_scoring" | "builder_refine" {
  const mode = String(raw || "").trim();
  if (mode === "builder_collect" || mode === "builder_scoring" || mode === "builder_refine") return mode;
  return "self";
}

const STEP_TO_SPECIALIST: Record<OrchestratorStepId, SpecialistName> = {
  step_0: "ValidationAndBusinessName",
  dream: "Dream",
  purpose: "Purpose",
  bigwhy: "BigWhy",
  role: "Role",
  entity: "Entity",
  strategy: "Strategy",
  targetgroup: "TargetGroup",
  productsservices: "ProductsServices",
  rulesofthegame: "RulesOfTheGame",
  presentation: "Presentation",
};

function wantsFullRestartCanvas(userMessage: string): boolean {
  const t = String(userMessage ?? "").trim().toLowerCase();
  if (!t) return false;

  // Keep conservative to avoid false positives.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;

  const hasAny = (arr: string[]) => arr.some((k) => t.includes(k));

  const restartWords = [
    "restart",
    "reset",
    "start over",
    "start again",
    "begin again",
    "from scratch",
  ];

  // Prefer explicit canvas intent (but allow very short "restart/reset" messages).
  const canvasWords = ["canvas", "business strategy canvas", "business canvas", "bsc"];

  const restartHit = hasAny(restartWords);
  const canvasHit = hasAny(canvasWords);

  if (!restartHit) return false;
  if (canvasHit) return true;

  // If extremely short, allow "restart/reset" without needing "canvas".
  if (words.length <= 3 && (t === "restart" || t === "reset")) {
    return true;
  }

  return false;
}

function nextCanonicalStep(current: OrchestratorStepId): OrchestratorStepId {
  const idx = CANONICAL_STEPS.indexOf(current);
  if (idx < 0) return "step_0";
  const next = CANONICAL_STEPS[idx + 1];
  return (next ? (next as OrchestratorStepId) : current);
}

function specialistForStep(step: string): SpecialistName {
  const safeStep = isCanonicalStepId(step) ? step : "step_0";
  return STEP_TO_SPECIALIST[safeStep];
}

export function deriveTransitionEventFromLegacy(params: {
  state: CanvasState;
  userMessage: string;
}): TransitionEvent {
  const { state, userMessage } = params;
  const CURRENT_STEP = normalizeCurrentStep(state.current_step);
  const ACTIVE_SPECIALIST = normalizeActiveSpecialist(state.active_specialist);
  const dreamRuntimeMode = normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);

  if (CURRENT_STEP !== "step_0" && wantsFullRestartCanvas(userMessage)) {
    return { type: "RESTART_STEP", step: "step_0", reason: "user_request" };
  }
  if (CURRENT_STEP === "dream" && dreamRuntimeMode !== "self") {
    return {
      type: "SPECIALIST_SWITCH",
      fromSpecialist: (ACTIVE_SPECIALIST || "Dream") as SpecialistName,
      toSpecialist: "DreamExplainer",
      sameStep: true,
    };
  }
  return { type: "NO_TRANSITION", step: CURRENT_STEP };
}

export function orchestrateFromTransition(params: {
  state: CanvasState;
  userMessage: string;
  event: TransitionEvent;
}): OrchestratorOutput {
  const { state, userMessage, event } = params;

  const CURRENT_STEP = normalizeCurrentStep(state.current_step);
  const INTRO_SHOWN_FOR_STEP = normalizeIntroShownForStep(state.intro_shown_for_step);
  const INTRO_SHOWN_SESSION = boolStr(state.intro_shown_session);

  let next_step: OrchestratorStepId = CURRENT_STEP;
  let next_specialist: SpecialistName = specialistForStep(next_step);

  if (event.type === "RESTART_STEP") {
    next_step = normalizeCurrentStep(event.step);
    next_specialist = specialistForStep(next_step);
  } else if (event.type === "PROCEED_TO_SPECIFIC") {
    next_step = normalizeCurrentStep(event.toStep);
    next_specialist = specialistForStep(next_step);
  } else if (event.type === "PROCEED_TO_NEXT") {
    next_step = nextCanonicalStep(normalizeCurrentStep(event.fromStep));
    next_specialist = specialistForStep(next_step);
  } else if (event.type === "STEP_COMPLETED") {
    next_step = nextCanonicalStep(normalizeCurrentStep(event.step));
    next_specialist = specialistForStep(next_step);
  } else if (event.type === "SPECIALIST_SWITCH") {
    next_step = CURRENT_STEP;
    next_specialist = event.toSpecialist;
  } else {
    next_step = CURRENT_STEP;
    next_specialist = specialistForStep(next_step);
  }

  if (next_step === "dream") {
    const dreamRuntimeMode = normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);
    next_specialist = dreamRuntimeMode === "self" ? "Dream" : "DreamExplainer";
  }

  const show_session_intro: BoolString = INTRO_SHOWN_SESSION !== "true" ? "true" : "false";
  const intro_shown_session: BoolString = "true";
  const show_step_intro: BoolString = INTRO_SHOWN_FOR_STEP !== next_step ? "true" : "false";
  const intro_shown_for_step = INTRO_SHOWN_FOR_STEP;
  const specialist_input = `CURRENT_STEP_ID: ${next_step} | USER_MESSAGE: ${String(userMessage ?? "")}`;

  const out: OrchestratorOutput = {
    specialist_to_call: next_specialist,
    specialist_input,
    current_step: next_step,
    intro_shown_for_step,
    intro_shown_session,
    show_step_intro,
    show_session_intro,
  };

  return OrchestratorOutputZod.parse(out);
}

/**
 * Returns a strict orchestrator output.
 *
 * - Does NOT reset to step_0 when off-topic.
 * - Only resets to step_0 if current_step is invalid OR user explicitly requests full restart.
 */
export function orchestrate(params: { state: CanvasState; userMessage: string }): OrchestratorOutput {
  const { state, userMessage } = params;
  const event = deriveTransitionEventFromLegacy({ state, userMessage });
  return orchestrateFromTransition({ state, userMessage, event });
}
