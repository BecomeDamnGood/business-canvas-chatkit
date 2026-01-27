// src/handlers/run_step.ts
import { z } from "zod";
import { callStrictJson } from "../core/llm";
import { migrateState, type CanvasState } from "../core/state";
import { integrateUserFacingOutput } from "../core/integrator";
import { orchestrate, type OrchestratorDecision } from "../core/orchestrator";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_INSTRUCTIONS,
  DreamJsonSchema,
  DreamZodSchema,
  buildDreamSpecialistInput,
  type DreamOutput,
} from "../steps/dream";

/**
 * Incoming tool args
 */
const RunStepArgsSchema = z.object({
  user_message: z.string().default(""),
  state: z.record(z.any()).optional().default({}),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

/**
 * Chain rule:
 * If Step 0 returns proceed_to_dream == "true", immediately run Dream in the same tool call.
 */
function shouldChainToDream(
  decision: OrchestratorDecision,
  specialistResult: any
): boolean {
  if (String(decision.next_step) !== STEP_0_ID) return false;
  if (String(decision.specialist_to_call) !== STEP_0_SPECIALIST) return false;
  return String(specialistResult?.proceed_to_dream ?? "") === "true";
}

/**
 * Persist state updates consistently (no nulls)
 * - active_specialist
 * - current_step
 * - last_specialist_result
 * - intro_shown_session
 * - intro_shown_for_step (only when action==="INTRO" to avoid intro loops)
 * - store step_0_final/business_name and dream_final conservatively
 */
function applyStateUpdate(params: {
  prev: CanvasState;
  decision: OrchestratorDecision;
  specialistResult: any;
}): CanvasState {
  const { prev, decision, specialistResult } = params;

  const action = String(specialistResult?.action ?? "");
  const next_step = String(decision.next_step ?? "");
  const active_specialist = String(decision.specialist_to_call ?? "");

  let nextState: CanvasState = {
    ...prev,
    current_step: next_step,
    active_specialist,
    last_specialist_result:
      typeof specialistResult === "object" && specialistResult !== null
        ? specialistResult
        : {},
    intro_shown_session: decision.intro_shown_session,
    intro_shown_for_step: action === "INTRO" ? next_step : prev.intro_shown_for_step,
  };

  // Step 0 persistence
  if (next_step === STEP_0_ID) {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      nextState = { ...nextState, step_0_final: specialistResult.step_0.trim() };
    }
    if (
      typeof specialistResult?.business_name === "string" &&
      specialistResult.business_name.trim()
    ) {
      nextState = { ...nextState, business_name: specialistResult.business_name.trim() };
    }
  }

  // Dream persistence (conservative)
  if (next_step === DREAM_STEP_ID) {
    if (
      String(specialistResult?.action ?? "") === "CONFIRM" &&
      typeof specialistResult?.dream === "string" &&
      specialistResult.dream.trim()
    ) {
      nextState = { ...nextState, dream_final: specialistResult.dream.trim() };
    }
  }

  return nextState;
}

/**
 * Call specialist (strict JSON) based on orchestrator decision.
 * We use step-specific builder inputs (parity), not the generic template.
 */
async function callSpecialistStrict(params: {
  model: string;
  state: CanvasState;
  decision: OrchestratorDecision;
  userMessage: string;
}): Promise<{ specialistResult: any; attempts: number }> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");

  if (specialist === STEP_0_SPECIALIST) {
    const plannerInput = buildStep0SpecialistInput(userMessage);

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
      plannerInput,
      schemaName: "ValidationAndBusinessName",
      jsonSchema: ValidationAndBusinessNameJsonSchema,
      zodSchema: ValidationAndBusinessNameZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "ValidationAndBusinessName",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === DREAM_SPECIALIST) {
    // Dream expects the wrapper input string (INTRO_SHOWN_FOR_STEP/CURRENT_STEP/PLANNER_INPUT).
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      state.intro_shown_for_step,
      String(decision.next_step || DREAM_STEP_ID)
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: DREAM_INSTRUCTIONS,
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  // Safe fallback: valid Step 0 ESCAPE payload (prevents ChatGPT fallback to its own BMC questions).
  return {
    specialistResult: {
      action: "ESCAPE",
      message: "Ik kan je hier alleen helpen met het bouwen van je Business Strategy Canvas.",
      question: "Wil je nu doorgaan met verificatie?",
      refined_formulation: "",
      confirmation_question: "",
      business_name: "TBD",
      proceed_to_dream: "false",
      step_0: "",
    },
    attempts: 0,
  };
}

/**
 * MCP tool implementation
 */
export async function run_step(rawArgs: unknown): Promise<{
  state: CanvasState;

  output: {
    text: string;
    current_step: string;
    active_specialist: string;
    action: string;
    show_session_intro: "true" | "false";
    show_step_intro: "true" | "false";
    specialist: any;
  };

  debug: {
    active_specialist: string;
    current_step: string;
    action: string;
    rendered_text: string;
    rendered_parts: Array<{ key: string; value: string }>;
    next_state: CanvasState;
    attempts: number;
    decision: OrchestratorDecision;
    chain?: {
      ran: boolean;
      decision_after?: OrchestratorDecision;
      chained_step?: string;
      chained_specialist?: string;
      chained_action?: string;
    };
  };
}> {
  const args: RunStepArgs = RunStepArgsSchema.parse(rawArgs);
  const userMessage = args.user_message ?? "";

  // Canonicalize state + migrations
  const initialState = migrateState(args.state ?? {});

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  // --------- ORCHESTRATE (first decision) ----------
  const decision1 = orchestrate(initialState);

  // --------- CALL SPECIALIST (first) ----------
  const call1 = await callSpecialistStrict({
    model,
    state: initialState,
    decision: decision1,
    userMessage,
  });

  let attempts = call1.attempts;
  let specialistResult: any = call1.specialistResult;

  // --------- UPDATE STATE (after first specialist) ----------
  let nextState = applyStateUpdate({
    prev: initialState,
    decision: decision1,
    specialistResult,
  });

  // --------- OPTIONAL CHAIN: STEP 0 -> DREAM ----------
  const chainInfo: {
    ran: boolean;
    decision_after?: OrchestratorDecision;
    chained_step?: string;
    chained_specialist?: string;
    chained_action?: string;
  } = { ran: false };

  let finalDecision = decision1;

  if (shouldChainToDream(decision1, specialistResult)) {
    chainInfo.ran = true;

    // Re-orchestrate based on updated state containing proceed trigger
    const decision2 = orchestrate(nextState);
    chainInfo.decision_after = decision2;

    // Only chain if it routes to Dream specialist
    if (String(decision2.next_step) === DREAM_STEP_ID && String(decision2.specialist_to_call) === DREAM_SPECIALIST) {
      const call2 = await callSpecialistStrict({
        model,
        state: nextState,
        decision: decision2,
        userMessage,
      });

      attempts = Math.max(attempts, call2.attempts);
      specialistResult = call2.specialistResult;

      // Apply second state update (Dream becomes current output)
      nextState = applyStateUpdate({
        prev: nextState,
        decision: decision2,
        specialistResult,
      });

      chainInfo.chained_step = String(decision2.next_step);
      chainInfo.chained_specialist = String(decision2.specialist_to_call);
      chainInfo.chained_action = String(specialistResult?.action ?? "");

      finalDecision = decision2;
    }
  }

  // --------- INTEGRATE (render to text) ----------
  const rendered = integrateUserFacingOutput({
    state: nextState,
    specialistOutput: specialistResult,
    show_session_intro: finalDecision.show_session_intro,
    show_step_intro: finalDecision.show_step_intro,
  });

  const action = String(specialistResult?.action ?? "");

  return {
    state: nextState,
    output: {
      text: rendered.text,
      current_step: String(nextState.current_step),
      active_specialist: String(nextState.active_specialist),
      action,
      show_session_intro: finalDecision.show_session_intro,
      show_step_intro: finalDecision.show_step_intro,
      specialist: specialistResult,
    },
    debug: {
      active_specialist: String(nextState.active_specialist),
      current_step: String(nextState.current_step),
      action,
      rendered_text: rendered.text,
      rendered_parts: rendered.debug.rendered_parts,
      next_state: nextState,
      attempts,
      decision: finalDecision,
      chain: chainInfo,
    },
  };
}
