// mcp-server/src/handlers/run_step.ts
import { z } from "zod";

import { callStrictJson } from "../core/llm.js";
import { migrateState, type CanvasState, type BoolString } from "../core/state.js";
import { orchestrate, type OrchestratorOutput } from "../core/orchestrator.js";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_INSTRUCTIONS,
  DreamJsonSchema,
  DreamZodSchema,
  buildDreamSpecialistInput,
  type DreamOutput,
} from "../steps/dream.js";

/**
 * Incoming tool args
 */
const RunStepArgsSchema = z.object({
  user_message: z.string().default(""),
  state: z.record(z.string(), z.any()).optional().default({}),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

const STEP0_QUESTION_EN =
  "What type of venture are you starting or running, and what’s the name of your business (or is it still TBD)?";

const STEP0_QUESTION_NL =
  "Wat voor onderneming start of run je, en wat is de naam van je bedrijf (of is het nog TBD)?";

function langFromState(state: CanvasState): "nl" | "en" {
  const l = String((state as any).language ?? "").toLowerCase().trim();
  if (l.startsWith("nl")) return "nl";
  if (l.startsWith("en")) return "en";
  return "en";
}

/**
 * Render order (strict):
 * message -> refined_formulation
 * (NO session intro rendered here; pre-start UI owns the welcome text)
 */
function buildTextForWidget(params: { specialist: any }): string {
  const { specialist } = params;
  const parts: string[] = [];

  const msg = String(specialist?.message ?? "").trim();
  const refined = String(specialist?.refined_formulation ?? "").trim();
  if (msg) parts.push(msg);
  if (refined) parts.push(refined);

  return parts.join("\n\n").trim();
}

function pickPrompt(specialist: any): string {
  const confirmQ = String(specialist?.confirmation_question ?? "").trim();
  const q = String(specialist?.question ?? "").trim();
  return confirmQ || q || "";
}

function isClearYes(userMessage: string, lang: "nl" | "en"): boolean {
  const t = String(userMessage ?? "").trim().toLowerCase();
  if (!t) return false;

  // keep strict (1-6 words rule of thumb)
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc > 6) return false;

  const yesSetNl = new Set([
    "ja",
    "jazeker",
    "jep",
    "yep",
    "klopt",
    "ok",
    "oke",
    "akkoord",
    "prima",
    "doen",
    "gaan",
  ]);
  const yesSetEn = new Set([
    "yes",
    "yep",
    "yeah",
    "sure",
    "ok",
    "okay",
    "proceed",
    "lets go",
    "let's go",
    "go",
  ]);

  if (lang === "nl") {
    if (yesSetNl.has(t)) return true;
    if (t === "1" || t === "y") return true;
    return false;
  }

  if (yesSetEn.has(t)) return true;
  if (t === "y" || t === "1") return true;
  return false;
}

function buildSpecialistContextBlock(state: CanvasState): string {
  // English-only. Minimal facts so specialists don't need to infer chat history.
  const safe = (s: any) => String(s ?? "").replace(/\r\n/g, "\n");
  const last =
    state.last_specialist_result && typeof state.last_specialist_result === "object"
      ? JSON.stringify(state.last_specialist_result)
      : "";

  return `STATE CONTEXT (do not output this section)
- step_0_final: ${safe(state.step_0_final)}
- dream_final: ${safe(state.dream_final)}
- business_name: ${safe(state.business_name)}
- intro_shown_for_step: ${safe(state.intro_shown_for_step)}
- intro_shown_session: ${safe(state.intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
}

/**
 * Persist state updates consistently (no nulls)
 */
function applyStateUpdate(params: {
  prev: CanvasState;
  decision: OrchestratorOutput;
  specialistResult: any;
  showSessionIntroUsed: BoolString;
}): CanvasState {
  const { prev, decision, specialistResult, showSessionIntroUsed } = params;

  const action = String(specialistResult?.action ?? "");
  const next_step = String(decision.current_step ?? "");
  const active_specialist = String(decision.specialist_to_call ?? "");

  let nextState: CanvasState = {
    ...prev,
    current_step: next_step,
    active_specialist,
    last_specialist_result:
      typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {},

    // We ONLY mark it as shown in state when we actually rendered it.
    // NOTE: pre-start UI now owns the welcome text; run_step uses this only as a state flag.
    intro_shown_session: showSessionIntroUsed === "true" ? "true" : prev.intro_shown_session,

    // Only mark a step intro as shown when the specialist explicitly returns action="INTRO".
    intro_shown_for_step: action === "INTRO" ? next_step : prev.intro_shown_for_step,
  };

  // Step 0 persistence (conservative)
  if (next_step === STEP_0_ID) {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      nextState = { ...nextState, step_0_final: specialistResult.step_0.trim() };
    }
    if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
      nextState = { ...nextState, business_name: specialistResult.business_name.trim() };
    }
  }

  // Dream persistence (only when action="CONFIRM" and dream provided)
  if (next_step === DREAM_STEP_ID) {
    if (String(specialistResult?.action ?? "") === "CONFIRM" && typeof specialistResult?.dream === "string") {
      const v = specialistResult.dream.trim();
      if (v) nextState = { ...nextState, dream_final: v };
    }
  }

  return nextState;
}

/**
 * Call specialist (strict JSON) based on orchestrator decision.
 */
async function callSpecialistStrict(params: {
  model: string;
  state: CanvasState;
  decision: OrchestratorOutput;
  userMessage: string;
}): Promise<{ specialistResult: any; attempts: number }> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = buildSpecialistContextBlock(state);

  if (specialist === STEP_0_SPECIALIST) {
    const plannerInput = buildStep0SpecialistInput(userMessage);

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "ValidationAndBusinessName",
      // NOTE: fix TS2322 (readonly arrays in JSON schema literals vs mutable typing expectations)
      jsonSchema: ValidationAndBusinessNameJsonSchema as any,
      zodSchema: ValidationAndBusinessNameZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "ValidationAndBusinessName",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === DREAM_SPECIALIST) {
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      state.intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID)
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: `${DREAM_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Dream",
      // NOTE: fix TS2322 (readonly arrays in JSON schema literals vs mutable typing expectations)
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  // Safe fallback: Step 0 ESCAPE payload in user language.
  const l = langFromState(state);
  return {
    specialistResult: {
      action: "ESCAPE",
      message:
        l === "nl"
          ? "Ik kan je hier alleen helpen met het bouwen van je Business Strategy Canvas."
          : "I can only help you here with building your Business Strategy Canvas.",
      question: l === "nl" ? "Wil je nu doorgaan met verificatie?" : "Do you want to continue with verification now?",
      refined_formulation: "",
      confirmation_question: "",
      business_name: "TBD",
      proceed_to_dream: "false",
      step_0: "",
    },
    attempts: 0,
  };
}

function shouldChainToDream(decision: OrchestratorOutput, specialistResult: any): boolean {
  if (String(decision.current_step) !== STEP_0_ID) return false;
  if (String(decision.specialist_to_call) !== STEP_0_SPECIALIST) return false;
  return String(specialistResult?.proceed_to_dream ?? "") === "true";
}

/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT (handoff):
 * - The welcome text is shown on the pre-start screen (widget),
 *   so run_step must NOT render the session intro.
 * - Start calls this tool with an empty user_message; we respond with the Step 0 question without calling the specialist.
 */
export async function run_step(rawArgs: unknown): Promise<{
  ok: true;
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: any;
  state: CanvasState;
  debug?: any;
}> {
  const args: RunStepArgs = RunStepArgsSchema.parse(rawArgs);
  const userMessage = String(args.user_message ?? "");
  let state = migrateState(args.state ?? {});

  const lang = langFromState(state);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  const isStartTrigger =
    userMessage.trim() === "" &&
    state.current_step === STEP_0_ID &&
    String(state.intro_shown_session) !== "true" &&
    String(state.step_0_final ?? "").trim() === "" &&
    Object.keys(state.last_specialist_result ?? {}).length === 0;

  // START: show the Step 0 question (no specialist call; no session intro; no extra text)
  if (isStartTrigger) {
    // Mark session intro as already shown (pre-start screen contains the exact welcome text)
    state = { ...state, intro_shown_session: "true" };

    const specialist: ValidationAndBusinessNameOutput = {
      action: "ASK",
      message: "",
      question: lang === "nl" ? STEP0_QUESTION_NL : STEP0_QUESTION_EN,
      refined_formulation: "",
      confirmation_question: "",
      business_name: state.business_name || "TBD",
      proceed_to_dream: "false",
      step_0: state.step_0_final || "",
    };

    return {
      ok: true,
      tool: "run_step",
      current_step_id: state.current_step,
      active_specialist: STEP_0_SPECIALIST,
      text: "",
      prompt: specialist.question,
      specialist,
      state: { ...state, active_specialist: STEP_0_SPECIALIST, last_specialist_result: specialist },
    };
  }

  // --------- SPEECH-PROOF PROCEED TRIGGER (Step 0 readiness moment) ---------
  const prev = state.last_specialist_result || {};
  const readinessAsked =
    state.current_step === STEP_0_ID &&
    String(prev?.action ?? "") === "CONFIRM" &&
    typeof prev?.confirmation_question === "string" &&
    prev.confirmation_question.trim() !== "" &&
    String(prev?.proceed_to_dream ?? "") === "false";

  const canProceedFromStep0 =
    readinessAsked && isClearYes(userMessage, lang) && String(state.step_0_final ?? "").trim() !== "";

  // If clear YES in the readiness context: fabricate the exact proceed payload (no extra text)
  if (canProceedFromStep0) {
    const proceedPayload: ValidationAndBusinessNameOutput = {
      action: "CONFIRM",
      message: "",
      question: "",
      refined_formulation: "",
      confirmation_question: "",
      business_name: state.business_name || "TBD",
      proceed_to_dream: "true",
      step_0: state.step_0_final || "",
    };

    // Update state as if Step 0 specialist produced it
    state = {
      ...state,
      active_specialist: STEP_0_SPECIALIST,
      last_specialist_result: proceedPayload,
    };
  }

  // --------- ORCHESTRATE (decision 1) ----------
  const decision1 = orchestrate({ state, userMessage });

  // show_session_intro should only be true if session intro hasn't been shown yet.
  // (We don't render it here; used only to keep state consistent if something calls it.)
  const showSessionIntro: BoolString = decision1.show_session_intro;

  // --------- CALL SPECIALIST (first) ----------
  const call1 = await callSpecialistStrict({ model, state, decision: decision1, userMessage });
  let attempts = call1.attempts;
  let specialistResult: any = call1.specialistResult;

  // --------- UPDATE STATE (after first specialist) ----------
  let nextState = applyStateUpdate({
    prev: state,
    decision: decision1,
    specialistResult,
    // We do not render intro in this handler anymore. Keep it false here.
    showSessionIntroUsed: "false",
  });

  // --------- OPTIONAL CHAIN: STEP 0 -> DREAM ----------
  let finalDecision = decision1;

  if (shouldChainToDream(decision1, specialistResult)) {
    const decision2 = orchestrate({ state: nextState, userMessage });

    if (String(decision2.current_step) === DREAM_STEP_ID && String(decision2.specialist_to_call) === DREAM_SPECIALIST) {
      const call2 = await callSpecialistStrict({ model, state: nextState, decision: decision2, userMessage });
      attempts = Math.max(attempts, call2.attempts);
      specialistResult = call2.specialistResult;

      nextState = applyStateUpdate({
        prev: nextState,
        decision: decision2,
        specialistResult,
        showSessionIntroUsed: "false",
      });

      finalDecision = decision2;
    }
  }

  const text = buildTextForWidget({ specialist: specialistResult });
  const prompt = pickPrompt(specialistResult);

  // If orchestrator thought it should show session intro, we still don't render it here.
  // Pre-start UI owns that copy. But we can still ensure state is consistent:
  if (showSessionIntro === "true" && String(nextState.intro_shown_session) !== "true") {
    nextState = { ...nextState, intro_shown_session: "true" };
  }

  return {
    ok: true,
    tool: "run_step",
    current_step_id: String(nextState.current_step),
    active_specialist: String(nextState.active_specialist),
    text,
    prompt,
    specialist: specialistResult,
    state: nextState,
    debug: {
      decision: finalDecision,
      attempts,
    },
  };
}
