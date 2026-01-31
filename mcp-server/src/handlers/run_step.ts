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

import {
  DREAM_EXPLAINER_SPECIALIST,
  DREAM_EXPLAINER_INSTRUCTIONS,
  DreamExplainerJsonSchema,
  DreamExplainerZodSchema,
  buildDreamExplainerSpecialistInput,
  type DreamExplainerOutput,
} from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  PURPOSE_INSTRUCTIONS,
  PurposeJsonSchema,
  PurposeZodSchema,
  buildPurposeSpecialistInput,
  type PurposeOutput,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  BIGWHY_INSTRUCTIONS,
  BigWhyJsonSchema,
  BigWhyZodSchema,
  buildBigWhySpecialistInput,
  type BigWhyOutput,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ROLE_INSTRUCTIONS,
  RoleJsonSchema,
  RoleZodSchema,
  buildRoleSpecialistInput,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  ENTITY_INSTRUCTIONS,
  EntityJsonSchema,
  EntityZodSchema,
  buildEntitySpecialistInput,
  type EntityOutput,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  STRATEGY_INSTRUCTIONS,
  StrategyJsonSchema,
  StrategyZodSchema,
  buildStrategySpecialistInput,
  type StrategyOutput,
} from "../steps/strategy.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  RULESOFTHEGAME_INSTRUCTIONS,
  RulesOfTheGameJsonSchema,
  RulesOfTheGameZodSchema,
  buildRulesOfTheGameSpecialistInput,
  type RulesOfTheGameOutput,
} from "../steps/rulesofthegame.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  PRESENTATION_INSTRUCTIONS,
  PresentationJsonSchema,
  PresentationZodSchema,
  buildPresentationSpecialistInput,
  type PresentationOutput,
} from "../steps/presentation.js";

/**
 * Incoming tool args
 * NOTE: Some tool callers include current_step_id ("start") — accepted but not relied on.
 */
const RunStepArgsSchema = z.object({
  current_step_id: z.string().optional(),
  user_message: z.string().default(""),
  state: z.record(z.string(), z.any()).optional().default({}),
});

type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

const STEP0_QUESTION_EN =
  "What type of venture are you starting or running, and what’s the name of your business (or is it still TBD)?";

// --- Language detection (one-time) ---
// Purpose: lock user language once, but avoid detecting language from ambiguous short inputs.
// We intentionally DO NOT hardcode multilingual "yes/ok/..." lists.

const LanguageDetectZodSchema = z.object({
  language: z.string(),
});

const LanguageDetectJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language"],
  properties: {
    language: { type: "string" },
  },
} as const;

const LANGUAGE_DETECT_INSTRUCTIONS = `LANGUAGE DETECTOR (STRICT JSON)

Task:
- Detect the user's language from USER_MESSAGE.
- Output a lowercase BCP-47 style tag when possible (examples: "nl", "en", "pt-br", "es", "de", "fr", "it").
- If uncertain, return FALLBACK.
- Output ONLY strict JSON matching the schema.

Output:
{"language":"<tag>"}
`;

function isTrivialForLanguageDetection(msg: string): boolean {
  const t = String(msg ?? "").trim();

  if (!t) return true;

  // Universal UI tokens (never use these to detect language)
  if (t === "__CONTINUE__") return true;

  // Pure menu choices / numbers (ambiguous)
  if (/^\d+$/.test(t)) return true;

  // Too short => ambiguous and likely causes drift
  // (e.g. "ok", "yo", "si", "ja" are not reliable for language detection)
  if (t.length <= 3) return true;

  return false;
}

async function detectLanguageOnce(params: {
  model: string;
  userMessage: string;
  fallback: string;
}): Promise<string> {
  const { model, userMessage, fallback } = params;

  const res = await callStrictJson<{ language: string }>({
    model,
    instructions: LANGUAGE_DETECT_INSTRUCTIONS,
    plannerInput: `USER_MESSAGE: ${userMessage}\nFALLBACK: ${fallback}`,
    schemaName: "LanguageDetect",
    jsonSchema: LanguageDetectJsonSchema as any,
    zodSchema: LanguageDetectZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 50,
    debugLabel: "LanguageDetect",
  });

  const lang = String(res.data.language ?? "").trim().toLowerCase();
  return lang || String(fallback || "en").trim().toLowerCase() || "en";
}

function langFromState(state: CanvasState): string {
  const l = String((state as any).language ?? "").trim().toLowerCase();
  return l || "en";
}

// --- Readiness intent detection (multi-language, no hardcoded yes/ok lists) ---
// Used only when the previous prompt is a readiness gate ("Are you ready? yes/no").
// This avoids enumerating all languages and keeps the UI token "__CONTINUE__" universal.

const ReadinessIntentZodSchema = z.object({
  intent: z.enum(["affirm", "deny", "other"]),
});

const ReadinessIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent"],
  properties: {
    intent: { type: "string", enum: ["affirm", "deny", "other"] },
  },
} as const;

const READINESS_INTENT_INSTRUCTIONS = `READINESS INTENT CLASSIFIER (STRICT JSON)

Task:
- Decide whether USER_MESSAGE means the user wants to proceed ("affirm"), does not want to proceed ("deny"), or is something else ("other").
- The user may write in any language.
- Use LANGUAGE as a strong hint for interpretation.
- Be robust to short confirmations like "ok", "fine", "sure", "let's go", "is goed", etc.
- Output ONLY strict JSON matching the schema.

Output:
{"intent":"affirm" | "deny" | "other"}
`;

async function detectReadinessIntent(params: {
  model: string;
  language: string;
  userMessage: string;
}): Promise<"affirm" | "deny" | "other"> {
  const { model, language, userMessage } = params;

  const res = await callStrictJson<{ intent: "affirm" | "deny" | "other" }>({
    model,
    instructions: READINESS_INTENT_INSTRUCTIONS,
    plannerInput: `LANGUAGE: ${language}\nUSER_MESSAGE: ${userMessage}`,
    schemaName: "ReadinessIntent",
    jsonSchema: ReadinessIntentJsonSchema as any,
    zodSchema: ReadinessIntentZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 40,
    debugLabel: "ReadinessIntent",
  });

  const intent = String(res.data.intent || "").trim();
  if (intent === "affirm" || intent === "deny" || intent === "other") return intent;
  return "other";
}

// Detect Dream "exercise handshake" readiness prompt (Dream specialist asked: "Are you ready to start?")
function isDreamExerciseReadinessAsked(state: CanvasState): boolean {
  const prev = (state as any).last_specialist_result || {};

  // This matches the Dream spec: action=ASK, suggest_dreambuilder=true, question is readiness,
  // and other content fields are empty strings.
  const actionOk = String(prev?.action ?? "") === "ASK";
  const suggestOk = String(prev?.suggest_dreambuilder ?? "") === "true";
  const proceedDreamOk = String(prev?.proceed_to_dream ?? "") === "false";
  const proceedPurposeOk = String(prev?.proceed_to_purpose ?? "") === "false";

  const q = String(prev?.question ?? "").trim();
  const msg = String(prev?.message ?? "").trim();

  const refinedEmpty = String(prev?.refined_formulation ?? "").trim() === "";
  const confirmEmpty = String(prev?.confirmation_question ?? "").trim() === "";
  const dreamEmpty = String(prev?.dream ?? "").trim() === "";

  // readiness prompt has both message + question set (question is "Are you ready..."), and empties elsewhere
  return (
    state.current_step === DREAM_STEP_ID &&
    actionOk &&
    suggestOk &&
    proceedDreamOk &&
    proceedPurposeOk &&
    !!msg &&
    !!q &&
    refinedEmpty &&
    confirmEmpty &&
    dreamEmpty
  );
}

/**
 * Render order (strict):
 * message -> refined_formulation
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

function expandChoiceFromPreviousQuestion(userMsg: string, prevQuestion: string): string {
  const t = String(userMsg ?? "").trim();
  if (t !== "1" && t !== "2" && t !== "3") return userMsg; // safe for future 3-option menus

  const q = String(prevQuestion ?? "");
  if (!q) return userMsg;

  const lines = q.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const wanted = `${t})`;
  for (const line of lines) {
    // Match "1) something" or "1. something"
    const m = line.match(/^([123])[\)\.]\s*(.+?)\s*$/);
    if (m && `${m[1]})` === wanted) {
      return m[2].trim();
    }
  }

  return userMsg;
}

function isClearYes(userMessage: string): boolean {
  // Language-agnostic: proceed only via explicit option selection.
  // The UI buttons (and "Continue/OK") should send "1".
  const t = String(userMessage ?? "").trim();
  return t === "1";
}

function looksLikeMetaInstruction(userMessage: string): boolean {
  const t = String(userMessage ?? "").trim();
  if (!t) return false;

  const lower = t.toLowerCase();

  const longish = t.length >= 80;
  const hasBullets = /(^|\n)\s*[-*]\s+/.test(t);
  const hasSections =
    lower.includes("instructions") ||
    lower.includes("context") ||
    lower.includes("requirements") ||
    lower.includes("goals");

  const hasUserFraming =
    lower.includes("the user") ||
    lower.includes("user wants") ||
    lower.includes("start the flow") ||
    lower.includes("answer in") ||
    lower.includes("respond in");

  return longish && (hasUserFraming || hasSections || hasBullets);
}

function isPristineStateForStart(s: CanvasState): boolean {
  return (
    String(s.current_step) === STEP_0_ID &&
    String((s as any).step_0_final ?? "").trim() === "" &&
    String((s as any).dream_final ?? "").trim() === "" &&
    String((s as any).intro_shown_session ?? "") !== "true" &&
    Object.keys((s as any).last_specialist_result ?? {}).length === 0
  );
}

/**
 * Specialist context block for reliability (used by Presentation and helps other steps avoid guesswork)
 */
function buildSpecialistContextBlock(state: CanvasState): string {
  const safe = (v: any) => String(v ?? "").replace(/\r\n/g, "\n");
  const last =
    state.last_specialist_result && typeof state.last_specialist_result === "object"
      ? JSON.stringify(state.last_specialist_result)
      : "";

  return `STATE FINALS (use these if needed; do not invent)
- step_0_final: ${safe((state as any).step_0_final)}
- dream_final: ${safe((state as any).dream_final)}
- purpose_final: ${safe((state as any).purpose_final)}
- bigwhy_final: ${safe((state as any).bigwhy_final)}
- role_final: ${safe((state as any).role_final)}
- entity_final: ${safe((state as any).entity_final)}
- strategy_final: ${safe((state as any).strategy_final)}
- rulesofthegame_final: ${safe((state as any).rulesofthegame_final)}

STATE META (do not output this section)
- business_name: ${safe((state as any).business_name)}
- intro_shown_for_step: ${safe((state as any).intro_shown_for_step)}
- intro_shown_session: ${safe((state as any).intro_shown_session)}
- last_specialist_result_json: ${safe(last)}`;
}

/**
 * Persist state updates consistently (no nulls)
 * Minimal: store finals when the specialist returns CONFIRM with its output field.
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

    intro_shown_session: showSessionIntroUsed === "true" ? "true" : (prev as any).intro_shown_session,

    // mark a step intro as shown only when the specialist actually outputs INTRO
    intro_shown_for_step: action === "INTRO" ? next_step : (prev as any).intro_shown_for_step,
  };

  // ---- Step 0 ----
  if (next_step === STEP_0_ID) {
    if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
      (nextState as any).step_0_final = specialistResult.step_0.trim();
    }
    if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
      (nextState as any).business_name = specialistResult.business_name.trim();
    }
  }

  // ---- Dream (and DreamExplainer final Dream) ----
  if (next_step === DREAM_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.dream === "string") {
      const v = specialistResult.dream.trim();
      if (v) (nextState as any).dream_final = v;
    }
  }

  // ---- Purpose ----
  if (next_step === PURPOSE_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.purpose === "string") {
      const v = specialistResult.purpose.trim();
      if (v) (nextState as any).purpose_final = v;
    }
  }

  // ---- Big Why ----
  if (next_step === BIGWHY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.bigwhy === "string") {
      const v = specialistResult.bigwhy.trim();
      if (v) (nextState as any).bigwhy_final = v;
    }
  }

  // ---- Role ----
  if (next_step === ROLE_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.role === "string") {
      const v = specialistResult.role.trim();
      if (v) (nextState as any).role_final = v;
    }
  }

  // ---- Entity ----
  if (next_step === ENTITY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.entity === "string") {
      const v = specialistResult.entity.trim();
      if (v) (nextState as any).entity_final = v;
    }
  }

  // ---- Strategy ----
  if (next_step === STRATEGY_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.strategy === "string") {
      const v = specialistResult.strategy.trim();
      if (v) (nextState as any).strategy_final = v;
    }
  }

  // ---- Rules of the Game ----
  if (next_step === RULESOFTHEGAME_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.rulesofthegame === "string") {
      const v = specialistResult.rulesofthegame.trim();
      if (v) (nextState as any).rulesofthegame_final = v;
    }
  }

  // ---- Presentation ----
  if (next_step === PRESENTATION_STEP_ID) {
    if (action === "CONFIRM" && typeof specialistResult?.presentation_brief === "string") {
      const v = specialistResult.presentation_brief.trim();
      if (v) (nextState as any).presentation_brief_final = v;
    }
  }

  return nextState;
}

async function callSpecialistStrict(params: {
  model: string;
  state: CanvasState;
  decision: OrchestratorOutput;
  userMessage: string;
}): Promise<{ specialistResult: any; attempts: number }> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = buildSpecialistContextBlock(state);
  const lang = langFromState(state);

  if (specialist === STEP_0_SPECIALIST) {
    const plannerInput = buildStep0SpecialistInput(userMessage, lang);

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "ValidationAndBusinessName",
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
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      lang
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: `${DREAM_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === DREAM_EXPLAINER_SPECIALIST) {
  const plannerInput = buildDreamExplainerSpecialistInput(
    userMessage,
    (state as any).intro_shown_for_step,
    String(decision.current_step || DREAM_STEP_ID),
    lang
  );


    const res = await callStrictJson<DreamExplainerOutput>({
      model,
      instructions: `${DREAM_EXPLAINER_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "DreamExplainer",
      jsonSchema: DreamExplainerJsonSchema as any,
      zodSchema: DreamExplainerZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "DreamExplainer",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === PURPOSE_SPECIALIST) {
    const plannerInput = buildPurposeSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PURPOSE_STEP_ID)
    );

    const res = await callStrictJson<PurposeOutput>({
      model,
      instructions: `${PURPOSE_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Purpose",
      jsonSchema: PurposeJsonSchema as any,
      zodSchema: PurposeZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Purpose",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === BIGWHY_SPECIALIST) {
    const plannerInput = buildBigWhySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || BIGWHY_STEP_ID)
    );

    const res = await callStrictJson<BigWhyOutput>({
      model,
      instructions: `${BIGWHY_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "BigWhy",
      jsonSchema: BigWhyJsonSchema as any,
      zodSchema: BigWhyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "BigWhy",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === ROLE_SPECIALIST) {
    const plannerInput = buildRoleSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ROLE_STEP_ID)
    );

    const res = await callStrictJson<RoleOutput>({
      model,
      instructions: `${ROLE_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Role",
      jsonSchema: RoleJsonSchema as any,
      zodSchema: RoleZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Role",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === ENTITY_SPECIALIST) {
    const plannerInput = buildEntitySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ENTITY_STEP_ID)
    );

    const res = await callStrictJson<EntityOutput>({
      model,
      instructions: `${ENTITY_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Entity",
      jsonSchema: EntityJsonSchema as any,
      zodSchema: EntityZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Entity",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === STRATEGY_SPECIALIST) {
    const plannerInput = buildStrategySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || STRATEGY_STEP_ID)
    );

    const res = await callStrictJson<StrategyOutput>({
      model,
      instructions: `${STRATEGY_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Strategy",
      jsonSchema: StrategyJsonSchema as any,
      zodSchema: StrategyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Strategy",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === RULESOFTHEGAME_SPECIALIST) {
    const plannerInput = buildRulesOfTheGameSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || RULESOFTHEGAME_STEP_ID)
    );

    const res = await callStrictJson<RulesOfTheGameOutput>({
      model,
      instructions: `${RULESOFTHEGAME_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "RulesOfTheGame",
      jsonSchema: RulesOfTheGameJsonSchema as any,
      zodSchema: RulesOfTheGameZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "RulesOfTheGame",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  if (specialist === PRESENTATION_SPECIALIST) {
    const plannerInput = buildPresentationSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRESENTATION_STEP_ID)
    );

    const res = await callStrictJson<PresentationOutput>({
      model,
      instructions: `${PRESENTATION_INSTRUCTIONS}\n\n${contextBlock}`,
      plannerInput,
      schemaName: "Presentation",
      jsonSchema: PresentationJsonSchema as any,
      zodSchema: PresentationZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Presentation",
    });

    return { specialistResult: res.data, attempts: res.attempts };
  }

  // Safe fallback: Step 0 ESCAPE payload (language-neutral English here; UI/flow will recover)
  return {
    specialistResult: {
      action: "ESCAPE",
      message: "I can only help you here with building your Business Strategy Canvas.",
      question: "Do you want to continue with verification now?",
      refined_formulation: "",
      confirmation_question: "",
      business_name: "TBD",
      proceed_to_dream: "false",
      step_0: "",
    },
    attempts: 0,
  };
}

function shouldChainToNextStep(decision: OrchestratorOutput, specialistResult: any): boolean {
  const step = String(decision.current_step ?? "");
  if (!step) return false;

  // Step 0 uses proceed_to_dream
  if (step === STEP_0_ID && String(specialistResult?.proceed_to_dream ?? "") === "true") return true;

  // Dream + DreamExplainer use proceed_to_purpose
  if (step === DREAM_STEP_ID && String(specialistResult?.proceed_to_purpose ?? "") === "true") return true;

  // Everything else uses proceed_to_next
  if (String(specialistResult?.proceed_to_next ?? "") === "true") return true;

  return false;
}

/**
 * MCP tool implementation (widget-leading)
 *
 * IMPORTANT:
 * - Pre-start UI owns the welcome text.
 * - Start calls this tool with empty user_message; we respond with Step 0 question without calling the specialist.
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

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  let state = migrateState(args.state ?? {});
  const pristineAtEntry = isPristineStateForStart(state);

 const userMessageRaw = String(args.user_message ?? "");
const trimmed = userMessageRaw.trim();
const isSeedMsg = trimmed.startsWith("__SEED__");

// Seed is allowed ONLY once, and ONLY at the very start of Step 0 (language-agnostic).
const seedUsed = String((state as any).seed_used ?? "") === "true";
const last = (state as any).last_specialist_result ?? {};
const lastQuestion = typeof last?.question === "string" ? String(last.question) : "";

const seedEligible =
  String(state.current_step) === STEP_0_ID &&
  String((state as any).step_0_final ?? "").trim() === "" &&
  String((state as any).dream_final ?? "").trim() === "" &&
  // Allow seed right after the initial Step 0 ASK has been shown
  (Object.keys(last).length === 0 || lastQuestion.trim() === STEP0_QUESTION_EN.trim());

let userMessageCandidate = userMessageRaw;

// If it's a seed message: accept only if eligible + not used, then lock it.
if (isSeedMsg) {
  if (!seedUsed && seedEligible) {
    (state as any).seed_used = "true";
    userMessageCandidate = userMessageRaw; // keep as-is; bypass meta-instruction filter
  } else {
    userMessageCandidate = ""; // block any late/repeated seed attempts
  }
} else {
  // Existing behavior: ignore meta-instructions only on pristine entry
  userMessageCandidate =
    looksLikeMetaInstruction(userMessageRaw) && pristineAtEntry ? "" : userMessageRaw;
}

const lang = langFromState(state);

// --------- Readiness context detection (for universal "__CONTINUE__" and "ok/prima/etc") ----------
const prev = (state as any).last_specialist_result || {};
const step0ReadinessAsked =
  state.current_step === STEP_0_ID &&
  String(prev?.action ?? "") === "CONFIRM" &&
  typeof prev?.confirmation_question === "string" &&
  prev.confirmation_question.trim() !== "" &&
  String(prev?.proceed_to_dream ?? "") === "false";

const dreamExerciseReadinessAsked = isDreamExerciseReadinessAsked(state);

// 1) Universal UI token:
// - In readiness gate => treat as "yes"
// - Otherwise => treat as menu choice "1" (keeps old behavior: Continue = option 1)
if (String(userMessageCandidate).trim() === "__CONTINUE__") {
  userMessageCandidate = (step0ReadinessAsked || dreamExerciseReadinessAsked) ? "yes" : "1";
}

// If user clicks a numbered option button, the UI sends "1"/"2".
// Expand it to the real option label from the previous question, so every step can route correctly.
const prevQ =
  typeof (state as any)?.last_specialist_result?.question === "string"
    ? String((state as any).last_specialist_result.question)
    : "";

let userMessage = expandChoiceFromPreviousQuestion(userMessageCandidate, prevQ);

// 2) If we are at a readiness gate, interpret any "ok/is goed/prima/..." (any language)
// into a normalized yes/no WITHOUT hardcoding language lists.
if ((step0ReadinessAsked || dreamExerciseReadinessAsked) && userMessage.trim() !== "") {
  const t = userMessage.trim();

  // Keep numeric compatibility
  if (t === "1") {
    userMessage = "yes";
  } else if (t === "2") {
    userMessage = "no";
  } else if (t !== "yes" && t !== "no") {
    const intent = await detectReadinessIntent({ model, language: lang, userMessage: t });
    if (intent === "affirm") userMessage = "yes";
    else if (intent === "deny") userMessage = "no";
  }
}

  // START trigger (widget start screen)
  const isStartTrigger =
  userMessage.trim() === "" &&
  state.current_step === STEP_0_ID &&
  String((state as any).intro_shown_session) !== "true" &&
  Object.keys((state as any).last_specialist_result ?? {}).length === 0;

  if (isStartTrigger) {
  (state as any).intro_shown_session = "true";

  const step0Final = String((state as any).step_0_final ?? "").trim();

  // If Step 0 is already known, show the combined confirmation directly.
  if (step0Final) {
    const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
    const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
    const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

    const venture = (ventureMatch?.[1] || "venture").trim();
    const name = (nameMatch?.[1] || (state as any).business_name || "TBD").trim();
    const status = (statusMatch?.[1] || "starting").toLowerCase();

    const statement =
      status === "existing"
        ? `You have a ${venture} called ${name}.`
        : `You want to start a ${venture} called ${name}.`;

    const specialist: ValidationAndBusinessNameOutput = {
      action: "CONFIRM",
      message: "",
      question: "",
      refined_formulation: "",
      confirmation_question: `${statement} Is that correct, and if so are you ready to start the first step, 'Your Dream'?`,
      business_name: name || "TBD",
      proceed_to_dream: "false",
      step_0: step0Final,
    };

    return {
      ok: true,
      tool: "run_step",
      current_step_id: String(state.current_step),
      active_specialist: STEP_0_SPECIALIST,
      text: "",
      prompt: specialist.confirmation_question,
      specialist,
      state: {
        ...state,
        active_specialist: STEP_0_SPECIALIST,
        last_specialist_result: specialist,
      },
    };
  }

  // Otherwise: first-time Step 0 setup question.
  const specialist: ValidationAndBusinessNameOutput = {
    action: "ASK",
    message: "",
    question: STEP0_QUESTION_EN,
    refined_formulation: "",
    confirmation_question: "",
    business_name: (state as any).business_name || "TBD",
    proceed_to_dream: "false",
    step_0: "",
  };

  return {
    ok: true,
    tool: "run_step",
    current_step_id: String(state.current_step),
    active_specialist: STEP_0_SPECIALIST,
    text: "",
    prompt: specialist.question,
    specialist,
    state: {
      ...state,
      active_specialist: STEP_0_SPECIALIST,
      last_specialist_result: specialist,
    },
  };
}

  // --------- SPEECH-PROOF PROCEED TRIGGER (Step 0 readiness moment only) ---------
  const prev = (state as any).last_specialist_result || {};
  const readinessAsked =
    state.current_step === STEP_0_ID &&
    String(prev?.action ?? "") === "CONFIRM" &&
    typeof prev?.confirmation_question === "string" &&
    prev.confirmation_question.trim() !== "" &&
    String(prev?.proceed_to_dream ?? "") === "false";

  const canProceedFromStep0 =
  readinessAsked &&
  (userMessage.trim() === "1" || userMessage.trim().toLowerCase() === "yes") &&
  String((state as any).step_0_final ?? "").trim() !== "";


  if (canProceedFromStep0) {
    const proceedPayload: ValidationAndBusinessNameOutput = {
      action: "CONFIRM",
      message: "",
      question: "",
      refined_formulation: "",
      confirmation_question: "",
      business_name: (state as any).business_name || "TBD",
      proceed_to_dream: "true",
      step_0: (state as any).step_0_final || "",
    };

    (state as any).active_specialist = STEP_0_SPECIALIST;
    (state as any).last_specialist_result = proceedPayload;
  }

  // --------- ORCHESTRATE (decision 1) ----------
  const decision1 = orchestrate({ state, userMessage });

  // We do not render a session intro here.
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
    showSessionIntroUsed: "false",
  });

  // --------- OPTIONAL CHAIN: immediate next-step intro on proceed flags ----------
  // --------- OPTIONAL CHAIN: Dream exercise handshake + proceed flags ----------
let finalDecision = decision1;

// 1) Dream exercise handshake: if Dream returns CONFIRM + suggest_dreambuilder=true,
// immediately call DreamExplainer in the SAME turn (so "Continue" works).
const shouldStartDreamExplainerNow =
  String(decision1.current_step ?? "") === DREAM_STEP_ID &&
  String(specialistResult?.action ?? "") === "CONFIRM" &&
  String(specialistResult?.suggest_dreambuilder ?? "") === "true";

if (shouldStartDreamExplainerNow) {
  // Start DreamExplainer cleanly (no extra user text needed)
  const chainUserMessage = "";
  const decision2 = orchestrate({ state: nextState, userMessage: chainUserMessage });

  if (String(decision2.specialist_to_call || "") && String(decision2.current_step || "")) {
    const call2 = await callSpecialistStrict({
      model,
      state: nextState,
      decision: decision2,
      userMessage: chainUserMessage,
    });
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
} else if (shouldChainToNextStep(decision1, specialistResult)) {
  // 2) Existing proceed-chain behavior (step_0 -> dream, dream -> purpose, etc.)
  const decision2 = orchestrate({ state: nextState, userMessage });

  if (String(decision2.specialist_to_call || "") && String(decision2.current_step || "")) {
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

  // keep state consistent even though we don't render session intro copy here
  if (showSessionIntro === "true" && String((nextState as any).intro_shown_session) !== "true") {
    (nextState as any).intro_shown_session = "true";
  }

  return {
    ok: true,
    tool: "run_step",
    current_step_id: String(nextState.current_step),
    active_specialist: String((nextState as any).active_specialist || ""),
    text,
    prompt,
    specialist: specialistResult,
    state: nextState,
    debug: {
      decision: finalDecision,
      attempts,
      language: lang,
      meta_user_message_ignored: looksLikeMetaInstruction(userMessageRaw) && pristineAtEntry,
    },
  };
}
