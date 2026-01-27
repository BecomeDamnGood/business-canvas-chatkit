// src/handlers/run_step.ts
import { z } from "zod";
import { callStrictJson } from "../core/llm";
import { migrateState, type CanvasState } from "../core/state";
import { integrateUserFacingOutput } from "../core/integrator";

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
 * Orchestrator routing (embedded for now; move to src/core/orchestrator.ts later)
 */
const CanonicalSteps = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "rulesofthegame",
  "presentation",
] as const;

type CanonicalStepId = (typeof CanonicalSteps)[number];

function isCanonicalStepId(x: string): x is CanonicalStepId {
  return (CanonicalSteps as readonly string[]).includes(x);
}

function routeNext(state: CanvasState) {
  const specialistResult = state.last_specialist_result ?? {};

  const triggerDream =
    typeof specialistResult === "object" &&
    String((specialistResult as any).proceed_to_dream ?? "") === "true";

  // reserved
  const triggerPurpose =
    typeof specialistResult === "object" &&
    String((specialistResult as any).proceed_to_purpose ?? "") === "true";

  const triggerDreamExplainer =
    typeof specialistResult === "object" &&
    String((specialistResult as any).suggest_dreambuilder ?? "") === "true";

  const handshakeStartExplainer =
    typeof specialistResult === "object" &&
    String((specialistResult as any).action ?? "") === "CONFIRM" &&
    String((specialistResult as any).suggest_dreambuilder ?? "") === "true";

  let next_step: CanonicalStepId = isCanonicalStepId(state.current_step as any)
    ? (state.current_step as CanonicalStepId)
    : "step_0";

  let next_specialist: string =
    next_step === "step_0"
      ? STEP_0_SPECIALIST
      : next_step === "dream"
      ? DREAM_SPECIALIST
      : STEP_0_SPECIALIST;

  if (triggerDream) {
    next_step = "dream";
    next_specialist = DREAM_SPECIALIST;
  } else if (triggerPurpose) {
    next_step = "purpose";
    next_specialist = "Purpose";
  } else if (state.active_specialist === "DreamExplainer" && triggerDreamExplainer) {
    next_step = "dream";
    next_specialist = "DreamExplainer";
  } else if (next_step === "dream" && handshakeStartExplainer) {
    next_step = "dream";
    next_specialist = "DreamExplainer";
  } else {
    if (!isCanonicalStepId(String(state.current_step))) {
      next_step = "step_0";
      next_specialist = STEP_0_SPECIALIST;
    } else {
      next_step = state.current_step as CanonicalStepId;
      next_specialist =
        next_step === "step_0"
          ? STEP_0_SPECIALIST
          : next_step === "dream"
          ? DREAM_SPECIALIST
          : STEP_0_SPECIALIST;
    }
  }

  const show_session_intro: "true" | "false" =
    state.intro_shown_session !== "true" ? "true" : "false";

  const intro_shown_session: "true" | "false" = "true";

  const show_step_intro: "true" | "false" =
    state.intro_shown_for_step !== next_step ? "true" : "false";

  return {
    next_step,
    specialist_to_call: next_specialist,
    show_session_intro,
    show_step_intro,
    intro_shown_session,
  };
}

/**
 * Chain rule:
 * If Step 0 returns proceed_to_dream == "true", immediately run Dream in the same tool call.
 */
function shouldChainToDream(
  step: CanonicalStepId,
  specialistName: string,
  specialistResult: any
): boolean {
  if (step !== "step_0") return false;
  if (specialistName !== STEP_0_SPECIALIST) return false;
  return String(specialistResult?.proceed_to_dream ?? "") === "true";
}

/**
 * MCP tool implementation
 */
export async function run_step(rawArgs: unknown): Promise<{
  state: CanvasState;

  /**
   * UI-facing output:
   * - text is what the UI should show
   * - specialist is still returned for Inspector/debug and for your UI template if you want it
   */
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
    attempts?: number;
    chain?: {
      ran: boolean;
      chained_step?: string;
      chained_specialist?: string;
      chained_action?: string;
    };
  };
}> {
  const args: RunStepArgs = RunStepArgsSchema.parse(rawArgs);
  const userMessage = args.user_message ?? "";

  // Canonicalize state + migrations
  const state = migrateState(args.state ?? {});

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  // --------- ROUTE ----------
  const route = routeNext(state);

  // --------- CALL SPECIALIST (strict JSON) ----------
  let specialistResult: any;
  let attempts = 0;

  if (route.specialist_to_call === STEP_0_SPECIALIST) {
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

    specialistResult = res.data;
    attempts = res.attempts;
  } else if (route.specialist_to_call === DREAM_SPECIALIST) {
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      state.intro_shown_for_step,
      String(route.next_step)
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

    specialistResult = res.data;
    attempts = res.attempts;
  } else {
    // Safe fallback: valid Step 0 ESCAPE payload (prevents ChatGPT "BMC" fallback).
    specialistResult = {
      action: "ESCAPE",
      message:
        "Ik kan je hier alleen helpen met het bouwen van je Business Strategy Canvas.",
      question: "Wil je nu doorgaan met verificatie?",
      refined_formulation: "",
      confirmation_question: "",
      business_name: "TBD",
      proceed_to_dream: "false",
      step_0: "",
    };
    attempts = 0;
  }

  // --------- UPDATE STATE ----------
  let nextState: CanvasState = {
    ...state,
    current_step: route.next_step,
    active_specialist: route.specialist_to_call,
    last_specialist_result: specialistResult,
    intro_shown_session: route.intro_shown_session,
    // To prevent endless INTRO loops, update intro_shown_for_step only when a specialist outputs INTRO.
    intro_shown_for_step:
      String(specialistResult?.action ?? "") === "INTRO"
        ? route.next_step
        : state.intro_shown_for_step,
  };

  // Persist Step 0 stable storage line when present
  if (route.next_step === STEP_0_ID) {
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

  // Persist Dream final (conservative)
  if (route.next_step === DREAM_STEP_ID) {
    if (
      String(specialistResult?.action ?? "") === "CONFIRM" &&
      typeof specialistResult?.dream === "string" &&
      specialistResult.dream.trim()
    ) {
      nextState = { ...nextState, dream_final: specialistResult.dream.trim() };
    }
  }

  // --------- CHAIN: STEP 0 -> DREAM ----------
  const chainInfo: {
    ran: boolean;
    chained_step?: string;
    chained_specialist?: string;
    chained_action?: string;
  } = { ran: false };

  if (shouldChainToDream(route.next_step, route.specialist_to_call, specialistResult)) {
    chainInfo.ran = true;

    // Prepare chain route reading the proceed trigger
    const chainState: CanvasState = {
      ...nextState,
      current_step: "step_0",
      last_specialist_result: specialistResult,
      active_specialist: route.specialist_to_call,
    };

    const chainRoute = routeNext(chainState);

    if (chainRoute.next_step === "dream" && chainRoute.specialist_to_call === DREAM_SPECIALIST) {
      const chainPlannerInput = buildDreamSpecialistInput(
        userMessage,
        nextState.intro_shown_for_step,
        "dream"
      );

      const chainRes = await callStrictJson<DreamOutput>({
        model,
        instructions: DREAM_INSTRUCTIONS,
        plannerInput: chainPlannerInput,
        schemaName: "Dream",
        jsonSchema: DreamJsonSchema,
        zodSchema: DreamZodSchema,
        temperature: 0.3,
        topP: 1,
        maxOutputTokens: 10000,
        debugLabel: "Dream:chain",
      });

      const dreamResult = chainRes.data;

      // User should see Dream output now
      specialistResult = dreamResult;
      attempts = Math.max(attempts, chainRes.attempts);

      nextState = {
        ...nextState,
        current_step: "dream",
        active_specialist: DREAM_SPECIALIST,
        last_specialist_result: dreamResult,
        intro_shown_session: "true",
        intro_shown_for_step:
          String(dreamResult?.action ?? "") === "INTRO" ? "dream" : nextState.intro_shown_for_step,
      };

      chainInfo.chained_step = "dream";
      chainInfo.chained_specialist = DREAM_SPECIALIST;
      chainInfo.chained_action = String(dreamResult?.action ?? "");
    }
  }

  // --------- INTEGRATE (render to text) ----------
  const rendered = integrateUserFacingOutput({
    state: nextState,
    specialistOutput: specialistResult,
    show_session_intro: route.show_session_intro,
    show_step_intro: route.show_step_intro,
  });

  const action = String(specialistResult?.action ?? "");

  return {
    state: nextState,
    output: {
      text: rendered.text,
      current_step: nextState.current_step,
      active_specialist: nextState.active_specialist,
      action,
      show_session_intro: route.show_session_intro,
      show_step_intro: route.show_step_intro,
      specialist: specialistResult,
    },
    debug: {
      active_specialist: nextState.active_specialist,
      current_step: nextState.current_step,
      action,
      rendered_text: rendered.text,
      rendered_parts: rendered.debug.rendered_parts,
      next_state: nextState,
      attempts,
      chain: chainInfo,
    },
  };
}
