// src/core/orchestrator.ts
import { z } from "zod";
import {
  CANONICAL_STEPS,
  isCanonicalStepId,
  type BoolString,
  type CanvasState,
} from "./state";

import { STEP_0_ID, STEP_0_SPECIALIST } from "../steps/step_0_validation";
import { DREAM_STEP_ID, DREAM_SPECIALIST } from "../steps/dream";

/**
 * Orchestrator output (parity-first)
 * - Determines which specialist to call next
 * - Determines step transitions based on proceed flags from last specialist result
 * - Computes intro flags
 * - Builds the specialist input format exactly (template)
 *
 * NOTE:
 * - This module does NOT call the LLM.
 * - This module does NOT render user text.
 * - This is pure routing logic.
 */

/**
 * Canonical StepId type for routing
 */
export type OrchestratorStepId = (typeof CANONICAL_STEPS)[number];

/**
 * Some flows mention DreamExplainer/Purpose etc. even if not implemented yet.
 * Keep as string so you can add them later without breaking types.
 */
export type SpecialistName =
  | typeof STEP_0_SPECIALIST
  | typeof DREAM_SPECIALIST
  | "DreamExplainer"
  | "Purpose"
  | "Unknown";

/**
 * Orchestrator decisions returned for a single turn
 */
export const OrchestratorDecisionZod = z.object({
  next_step: z.string(),
  specialist_to_call: z.string(),

  show_session_intro: z.enum(["true", "false"]),
  show_step_intro: z.enum(["true", "false"]),
  intro_shown_session: z.enum(["true", "false"]),

  /**
   * Specialist input template:
   * You still have to replace {{USER_MESSAGE}} in handler.
   * Kept as template to make it easy to test and log deterministically.
   */
  specialist_input_template: z.string(),

  /**
   * Debug fields for inspector
   */
  debug: z.object({
    current_step_in: z.string(),
    active_specialist_in: z.string(),
    triggers: z.object({
      proceed_to_dream: z.enum(["true", "false"]),
      proceed_to_purpose: z.enum(["true", "false"]),
      suggest_dreambuilder: z.enum(["true", "false"]),
      action: z.string(),
    }),
  }),
});

export type OrchestratorDecision = z.infer<typeof OrchestratorDecisionZod>;

function boolStr(x: unknown): BoolString {
  return String(x ?? "").trim() === "true" ? "true" : "false";
}

/**
 * Read proceed triggers from last specialist output (string-based)
 */
function readTriggers(last: Record<string, any> | null | undefined) {
  const obj = (last && typeof last === "object") ? last : {};
  return {
    proceed_to_dream: boolStr((obj as any).proceed_to_dream),
    proceed_to_purpose: boolStr((obj as any).proceed_to_purpose),
    suggest_dreambuilder: boolStr((obj as any).suggest_dreambuilder),
    action: String((obj as any).action ?? ""),
  };
}

/**
 * Main orchestrator:
 * 1) Proceed triggers override
 * 2) Otherwise route based on current_step
 * 3) Compute intro flags:
 *    - show_session_intro if intro_shown_session != "true"
 *    - show_step_intro if intro_shown_for_step != next_step
 * 4) Provide specialist_input_template in the exact format:
 *    "CURRENT_STEP_ID: <step> | USER_MESSAGE: {{USER_MESSAGE}}"
 */
export function orchestrate(state: CanvasState): OrchestratorDecision {
  const triggers = readTriggers(state.last_specialist_result as any);

  // Default next_step = current_step (clamped)
  const current_step_in = String(state.current_step ?? "").trim() || STEP_0_ID;
  const current_step: OrchestratorStepId = isCanonicalStepId(current_step_in)
    ? (current_step_in as OrchestratorStepId)
    : STEP_0_ID;

  let next_step: OrchestratorStepId = current_step;
  let specialist_to_call: SpecialistName =
    next_step === STEP_0_ID
      ? STEP_0_SPECIALIST
      : next_step === DREAM_STEP_ID
      ? DREAM_SPECIALIST
      : STEP_0_SPECIALIST;

  /**
   * Priority 1: proceed triggers override
   */
  if (triggers.proceed_to_dream === "true") {
    next_step = DREAM_STEP_ID;
    specialist_to_call = DREAM_SPECIALIST;
  } else if (triggers.proceed_to_purpose === "true") {
    next_step = "purpose";
    specialist_to_call = "Purpose";
  } else if (
    String(state.active_specialist ?? "") === "DreamExplainer" &&
    triggers.suggest_dreambuilder === "true"
  ) {
    // If a DreamExplainer is running, keep routing there (reserved)
    next_step = DREAM_STEP_ID;
    specialist_to_call = "DreamExplainer";
  } else if (
    next_step === DREAM_STEP_ID &&
    triggers.action === "CONFIRM" &&
    triggers.suggest_dreambuilder === "true"
  ) {
    // Handshake start (reserved)
    next_step = DREAM_STEP_ID;
    specialist_to_call = "DreamExplainer";
  } else {
    /**
     * Priority 4: default routing based on current_step
     */
    if (!isCanonicalStepId(current_step)) {
      next_step = STEP_0_ID;
      specialist_to_call = STEP_0_SPECIALIST;
    } else {
      if (current_step === STEP_0_ID) {
        next_step = STEP_0_ID;
        specialist_to_call = STEP_0_SPECIALIST;
      } else if (current_step === DREAM_STEP_ID) {
        next_step = DREAM_STEP_ID;
        specialist_to_call = DREAM_SPECIALIST;
      } else {
        // Not implemented yet: safe fallback to step_0
        next_step = STEP_0_ID;
        specialist_to_call = STEP_0_SPECIALIST;
      }
    }
  }

  /**
   * Intro flags (parity structure)
   */
  const show_session_intro: BoolString =
    String(state.intro_shown_session ?? "") === "true" ? "false" : "true";

  // After this turn, session intro becomes shown
  const intro_shown_session: BoolString = "true";

  const show_step_intro: BoolString =
    String(state.intro_shown_for_step ?? "") === String(next_step) ? "false" : "true";

  /**
   * Specialist input format (template)
   * Handler will replace {{USER_MESSAGE}}.
   */
  const specialist_input_template = `CURRENT_STEP_ID: ${next_step} | USER_MESSAGE: {{USER_MESSAGE}}`;

  const decision: OrchestratorDecision = {
    next_step: String(next_step),
    specialist_to_call: String(specialist_to_call),

    show_session_intro,
    show_step_intro,
    intro_shown_session,

    specialist_input_template,

    debug: {
      current_step_in,
      active_specialist_in: String(state.active_specialist ?? ""),
      triggers,
    },
  };

  return OrchestratorDecisionZod.parse(decision);
}

/**
 * Helper: returns the canonical specialist input (not a template)
 */
export function buildSpecialistInput(decision: OrchestratorDecision, userMessage: string): string {
  return String(decision.specialist_input_template).replace("{{USER_MESSAGE}}", userMessage);
}
