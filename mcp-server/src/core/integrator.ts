// src/core/integrator.ts
import { z } from "zod";
import type { CanvasState, BoolString } from "./state";

/**
 * Integrator goal (parity-first)
 * - Build user-facing text EXACTLY by deterministic rules
 * - No extra coaching text here (specialists do the content)
 * - Integrator only composes the fields in the correct order, and injects session/step intros when flags say so
 *
 * IMPORTANT:
 * - We do NOT "fix" content here.
 * - We do NOT interpret meaning beyond composition rules.
 * - We keep it minimal and stable for golden transcript testing.
 */

/**
 * Generic specialist output fields we render (Step 0 + Dream share this set)
 */
const RenderableSpecialistZod = z.object({
  action: z.string(),
  message: z.string().optional(),
  refined_formulation: z.string().optional(),
  confirmation_question: z.string().optional(),
  question: z.string().optional(),
});

export type RenderedOutput = {
  /**
   * What the ChatGPT UI should show to the user.
   * This is plain text, line breaks preserved.
   */
  text: string;

  /**
   * Additional structured info for debugging / inspector
   */
  debug: {
    rendered_parts: Array<{ key: string; value: string }>;
    used_session_intro: boolean;
    used_step_intro: boolean;
    action: string;
  };
};

/**
 * Session intro (minimal, stable)
 * You can replace this with the exact Agent Builder session intro text if you have it centrally.
 *
 * For parity now:
 * - We only render the session intro marker line, because actual intro wording is driven by the step-specialist INTRO.
 * - This avoids doubling intros (session + step).
 */
function renderSessionIntroMarker(): string {
  return ""; // Intentionally empty to avoid content drift; Step INTRO handles the real intro text.
}

/**
 * Step intro marker / wrapper (minimal, stable)
 * Same rationale: step-specialist INTRO already contains the real intro text.
 */
function renderStepIntroMarker(): string {
  return ""; // Intentionally empty to avoid content drift.
}

/**
 * Field render order (parity)
 * This matches how your UI template typically composes:
 * message -> refined_formulation -> confirmation_question -> question
 */
const FIELD_ORDER: Array<keyof z.infer<typeof RenderableSpecialistZod>> = [
  "message",
  "refined_formulation",
  "confirmation_question",
  "question",
];

function normalizeLineBreaks(s: string): string {
  // Keep real line breaks; trim only outer whitespace (do not collapse internal newlines)
  return String(s ?? "").replace(/\r\n/g, "\n").trim();
}

function addPart(parts: string[], debugParts: Array<{ key: string; value: string }>, key: string, value: string) {
  const v = normalizeLineBreaks(value);
  if (!v) return;
  parts.push(v);
  debugParts.push({ key, value: v });
}

/**
 * Main integrator: compose final user-visible string.
 *
 * Inputs:
 * - state: canonical state
 * - specialistOutput: the JSON payload from the specialist
 * - show_session_intro / show_step_intro flags from orchestrator/handler
 *
 * Output:
 * - plain text for the user + debug composition list
 */
export function integrateUserFacingOutput(params: {
  state: CanvasState;
  specialistOutput: unknown;
  show_session_intro: BoolString;
  show_step_intro: BoolString;
}): RenderedOutput {
  const parsed = RenderableSpecialistZod.parse(params.specialistOutput);
  const action = String(parsed.action ?? "");

  const textParts: string[] = [];
  const debugParts: Array<{ key: string; value: string }> = [];

  const usedSessionIntro = params.show_session_intro === "true";
  const usedStepIntro = params.show_step_intro === "true";

  if (usedSessionIntro) {
    const si = renderSessionIntroMarker();
    if (si) addPart(textParts, debugParts, "session_intro", si);
  }

  if (usedStepIntro) {
    const sti = renderStepIntroMarker();
    if (sti) addPart(textParts, debugParts, "step_intro", sti);
  }

  for (const key of FIELD_ORDER) {
    const val = (parsed as any)[key];
    if (typeof val === "string") {
      addPart(textParts, debugParts, String(key), val);
    }
  }

  const text = textParts.join("\n\n").trim();

  return {
    text,
    debug: {
      rendered_parts: debugParts,
      used_session_intro: usedSessionIntro,
      used_step_intro: usedStepIntro,
      action,
    },
  };
}

/**
 * Convenience integrator for Step 0 + Dream in your run_step handler:
 * - Takes the handler result and returns the exact "assistant text"
 */
export function integrateFromRunStepOutput(runStepResult: {
  state: CanvasState;
  output: {
    show_session_intro: BoolString;
    show_step_intro: BoolString;
    specialist: unknown;
  };
}): RenderedOutput {
  return integrateUserFacingOutput({
    state: runStepResult.state,
    specialistOutput: runStepResult.output.specialist,
    show_session_intro: runStepResult.output.show_session_intro,
    show_step_intro: runStepResult.output.show_step_intro,
  });
}
