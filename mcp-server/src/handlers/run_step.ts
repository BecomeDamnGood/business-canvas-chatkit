// src/handlers/run_step.ts
import { z } from "zod";
import { callStrictJson } from "../core/llm";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation";

// NOTE: Dream step is expected to exist when you enable chaining into Dream.
// If you haven't added it yet, you can temporarily comment these imports + the Dream call path.
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
 * - Keep generic so it can be used by MCP server frameworks.
 */
const RunStepArgsSchema = z.object({
  user_message: z.string().default(""),
  state: z.record(z.any()).optional().default({}),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

/**
 * Canonical step IDs (for safe routing)
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

/**
 * Minimal state shape used by this handler (parity-friendly strings).
 * You can move this to src/core/state.ts later.
 */
type CanvasState = {
  // Router state
  current_step: string; // canonical step id
  intro_shown_for_step: string; // which step intro has been shown for (string)
  intro_shown_session: "true" | "false"; // session intro gate
  active_specialist: string; // last specialist name

  // Last specialist output (object) - used to compute proceed triggers
  last_specialist_result: any;

  // Summary flow
  summary_target: string; // "unknown" etc (reserved)

  // Stored finals (reserved)
  step_0_final: string;
  dream_final: string;

  // Step 0 convenience
  business_name: string;
};

/**
 * Normalize incoming state according to Orchestrator doc:
 * - If CURRENT_STEP is empty, set to "step_0"
 * - If INTRO_SHOWN_FOR_STEP is empty, keep ""
 * - If INTRO_SHOWN_SESSION is empty, treat as "false"
 * - If ACTIVE_SPECIALIST is empty, treat as ""
 */
function normalizeState(raw: Record<string, any>): CanvasState {
  const current_step_raw = String(raw.current_step ?? "").trim();
  const intro_shown_for_step_raw = String(raw.intro_shown_for_step ?? "").trim();
  const intro_shown_session_raw = String(raw.intro_shown_session ?? "").trim();
  const active_specialist_raw = String(raw.active_specialist ?? "").trim();

  const current_step = current_step_raw.length ? current_step_raw : STEP_0_ID;
  const normalized_step = isCanonicalStepId(current_step) ? current_step : STEP_0_ID;

  const intro_shown_session: "true" | "false" =
    intro_shown_session_raw === "true" ? "true" : "false";

  return {
    current_step: normalized_step,
    intro_shown_for_step: intro_shown_for_step_raw, // pass-through by default
    intro_shown_session,
    active_specialist: active_specialist_raw,
    last_specialist_result: raw.last_specialist_result ?? {},
    summary_target: String(raw.summary_target ?? "unknown"),
    step_0_final: String(raw.step_0_final ?? ""),
    dream_final: String(raw.dream_final ?? ""),
    business_name: String(raw.business_name ?? "TBD"),
  };
}

/**
 * Orchestrator logic (embedded for now; later move to src/core/orchestrator.ts).
 * Implements the priority routing described in the Orchestrator instructions:
 * - proceed triggers override everything
 * - default: route to specialist matching CURRENT_STEP
 * - show_session_intro gate from intro_shown_session
 * - show_step_intro gate from intro_shown_for_step != next_step
 *
 * IMPORTANT: intro_shown_for_step is pass-through (we do not set it here).
 */
function routeNext(state: CanvasState) {
  const specialistResult = state.last_specialist_result ?? {};

  const triggerDream =
    typeof specialistResult === "object" &&
    String((specialistResult as any).proceed_to_dream ?? "") === "true";

  // (Reserved for later steps; included for parity structure)
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

  // Priority 1: proceed triggers override everything
  let next_step: CanonicalStepId = isCanonicalStepId(state.current_step)
    ? (state.current_step as CanonicalStepId)
    : "step_0";

  let next_specialist: string =
    next_step === "step_0"
      ? STEP_0_SPECIALIST
      : next_step === "dream"
      ? DREAM_SPECIALIST
      : "ValidationAndBusinessName"; // fallback

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
    // Priority 4: default routing (SAFE)
    if (!isCanonicalStepId(state.current_step)) {
      next_step = "step_0";
      next_specialist = STEP_0_SPECIALIST;
    } else {
      next_step = state.current_step as CanonicalStepId;
      next_specialist =
        next_step === "step_0"
          ? STEP_0_SPECIALIST
          : next_step === "dream"
          ? DREAM_SPECIALIST
          : // other steps later
            STEP_0_SPECIALIST;
    }
  }

  // Intro flags logic
  const show_session_intro: "true" | "false" =
    state.intro_shown_session !== "true" ? "true" : "false";

  const intro_shown_session: "true" | "false" = "true";

  const show_step_intro: "true" | "false" =
    state.intro_shown_for_step !== next_step ? "true" : "false";

  // Specialist input format (must be exactly)
  const specialist_input = `CURRENT_STEP_ID: ${next_step} | USER_MESSAGE: {{USER_MESSAGE}}`;

  return {
    specialist_to_call: next_specialist,
    specialist_input_template: specialist_input,
    next_step,
    intro_shown_for_step: state.intro_shown_for_step, // pass-through
    intro_shown_session,
    show_step_intro,
    show_session_intro,
  };
}

/**
 * Very small renderer preview for debug (NOT parity Steps Integrator).
 * Your UI template can render directly from specialist JSON; this is just for logging/Inspector.
 */
function renderPreview(showSessionIntro: "true" | "false", specialist: any): string {
  const parts: string[] = [];

  if (showSessionIntro === "true") {
    parts.push("[SESSION_INTRO_SHOWN]");
  }

  const fieldsInOrder = ["message", "refined_formulation", "confirmation_question", "question"];
  for (const key of fieldsInOrder) {
    const v = typeof specialist?.[key] === "string" ? specialist[key].trim() : "";
    if (v) parts.push(v);
  }

  return parts.join("\n");
}

/**
 * Chain rule (parity with transcript):
 * If Step 0 returns proceed_to_dream == "true", we immediately run Dream in the same call.
 * That prevents an extra user turn and matches the Agent Builder flow.
 */
function shouldChainToDream(
  currentStep: CanonicalStepId,
  specialistName: string,
  specialistResult: any
): boolean {
  if (currentStep !== "step_0") return false;
  if (specialistName !== STEP_0_SPECIALIST) return false;
  return String(specialistResult?.proceed_to_dream ?? "") === "true";
}

/**
 * MCP tool implementation (framework-agnostic):
 * Exported function you can wire into your MCP server tool router.
 */
export async function run_step(rawArgs: unknown): Promise<{
  state: CanvasState;
  output: {
    current_step: string;
    active_specialist: string;
    action: string;
    show_session_intro: "true" | "false";
    show_step_intro: "true" | "false";
    specialist: any;
    rendered_text_preview: string;
  };
  debug: {
    active_specialist: string;
    current_step: string;
    action: string;
    rendered_text_preview: string;
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
  const state = normalizeState(args.state ?? {});

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  // --------- ROUTE (Orchestrator) ----------
  const route = routeNext(state);

  // Build specialist_input with the exact user message
  const specialist_input = route.specialist_input_template.replace(
    "{{USER_MESSAGE}}",
    userMessage
  );

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
    const plannerInput = buildDreamSpecialistInput(userMessage);

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
    // Safe fallback: keep the flow usable instead of letting ChatGPT fallback to its own BMC.
    // We return a Step 0 ESCAPE payload (valid types) because it is the safest gate.
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
  const nextState: CanvasState = {
    ...state,
    current_step: route.next_step,
    active_specialist: route.specialist_to_call,
    last_specialist_result: specialistResult,
    intro_shown_session: route.intro_shown_session,
    // intro_shown_for_step stays pass-through by default, BUT:
    // to prevent endless INTRO loops, we update it only when a specialist actually outputs action="INTRO".
    intro_shown_for_step:
      String(specialistResult?.action ?? "") === "INTRO"
        ? route.next_step
        : state.intro_shown_for_step,
  };

  // Persist Step 0 stable storage line when present
  if (route.next_step === "step_0") {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      nextState.step_0_final = specialistResult.step_0.trim();
    }
    if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
      nextState.business_name = specialistResult.business_name.trim();
    }
  }

  // Persist Dream final when present (conservative)
  if (route.next_step === "dream") {
    if (
      String(specialistResult?.action ?? "") === "CONFIRM" &&
      typeof specialistResult?.dream === "string" &&
      specialistResult.dream.trim()
    ) {
      nextState.dream_final = specialistResult.dream.trim();
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

    // Update state to allow Orchestrator priority trigger to route dream
    const chainState: CanvasState = {
      ...nextState,
      current_step: "step_0", // keep current step as step_0 for the trigger to be read, matching Orchestrator design
      last_specialist_result: specialistResult,
      active_specialist: route.specialist_to_call,
    };

    const chainRoute = routeNext(chainState);

    if (chainRoute.next_step === "dream" && chainRoute.specialist_to_call === DREAM_SPECIALIST) {
      const chainPlannerInput = buildDreamSpecialistInput(userMessage);

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

      // Replace specialist output with Dream output (this is what the user should see next)
      specialistResult = dreamResult;
      attempts = Math.max(attempts, chainRes.attempts);

      // Now the step truly becomes dream
      nextState.current_step = "dream";
      nextState.active_specialist = DREAM_SPECIALIST;
      nextState.last_specialist_result = dreamResult;

      // session intro already shown earlier in the session
      nextState.intro_shown_session = "true";

      // mark dream intro as shown only if the Dream agent returned INTRO
      if (String(dreamResult?.action ?? "") === "INTRO") {
        nextState.intro_shown_for_step = "dream";
      }

      chainInfo.chained_step = "dream";
      chainInfo.chained_specialist = DREAM_SPECIALIST;
      chainInfo.chained_action = String(dreamResult?.action ?? "");
    }
  }

  // --------- OUTPUT (UI + debug) ----------
  const renderedTextPreview = renderPreview(route.show_session_intro, specialistResult);

  return {
    state: nextState,
    output: {
      current_step: nextState.current_step,
      active_specialist: nextState.active_specialist,
      action: String(specialistResult?.action ?? ""),
      show_session_intro: route.show_session_intro,
      show_step_intro: route.show_step_intro,
      specialist: specialistResult,
      rendered_text_preview: renderedTextPreview,
    },
    debug: {
      active_specialist: nextState.active_specialist,
      current_step: nextState.current_step,
      action: String(specialistResult?.action ?? ""),
      rendered_text_preview: renderedTextPreview,
      next_state: nextState,
      attempts,
      chain: chainInfo,
    },
  };
}
