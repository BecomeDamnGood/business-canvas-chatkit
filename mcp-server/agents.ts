// mcp-server/agents.ts
import { z } from "zod";

export type StepId =
  | "step_0"
  | "dream"
  | "purpose"
  | "bigwhy"
  | "role"
  | "entity"
  | "strategy"
  | "rulesofthegame"
  | "presentation";

type BoolStr = "true" | "false";

export type CanvasState = {
  // routing
  current_step: StepId;
  intro_shown_for_step: StepId | "";
  intro_shown_session: BoolStr;
  active_specialist: string;

  // collected data
  step_0?: string;
  business_name?: string;

  dream?: string;
  purpose?: string;
  bigwhy?: string;
  role?: string;
  entity?: string;
  strategy?: string;
  rulesofthegame?: string;
  presentation_brief?: string;

  // last results
  last_specialist_result?: unknown;

  // optional language hint (do not default)
  language?: string;
};

const DEFAULT_STATE: CanvasState = {
  current_step: "step_0",
  intro_shown_for_step: "",
  intro_shown_session: "false",
  active_specialist: "",
  language: undefined,
};

// ---- Zod Schemas ----
const ActionEnum = ["INTRO", "ASK", "REFINE", "CONFIRM", "ESCAPE"] as const;

const ValidationSchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  business_name: z.string(),
  proceed_to_dream: z.enum(["true", "false"]),
  step_0: z.string(),
});

const DreamSchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  dream: z.string(),
  suggest_dreambuilder: z.enum(["true", "false"]),
  proceed_to_dream: z.enum(["true", "false"]),
  proceed_to_purpose: z.enum(["true", "false"]),
});

const GenericStepSchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  value: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const StrategySchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  strategy: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const RulesSchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  rulesofthegame: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const PresentationSchema = z.object({
  session_intro: z.string(),
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  presentation_brief: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

// ---- Structured Outputs JSON Schemas ----
type JsonSchema = Record<string, any>;

function strictObjectSchema(name: string, properties: Record<string, any>, required: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
    title: name,
  };
}

const ACTION_SCHEMA = { type: "string", enum: [...ActionEnum] };
const BOOLSTR_SCHEMA = { type: "string", enum: ["true", "false"] };
const STR_SCHEMA = { type: "string" };

const COMMON_PROPS = {
  session_intro: STR_SCHEMA,
  action: ACTION_SCHEMA,
  message: STR_SCHEMA,
  question: STR_SCHEMA,
  refined_formulation: STR_SCHEMA,
  confirmation_question: STR_SCHEMA,
};

const COMMON_REQ = [
  "session_intro",
  "action",
  "message",
  "question",
  "refined_formulation",
  "confirmation_question",
];

const ValidationJsonSchema = strictObjectSchema(
  "validation_step_0",
  {
    ...COMMON_PROPS,
    business_name: STR_SCHEMA,
    proceed_to_dream: BOOLSTR_SCHEMA,
    step_0: STR_SCHEMA,
  },
  [...COMMON_REQ, "business_name", "proceed_to_dream", "step_0"]
);

const DreamJsonSchema = strictObjectSchema(
  "dream_step",
  {
    ...COMMON_PROPS,
    dream: STR_SCHEMA,
    suggest_dreambuilder: BOOLSTR_SCHEMA,
    proceed_to_dream: BOOLSTR_SCHEMA,
    proceed_to_purpose: BOOLSTR_SCHEMA,
  },
  [...COMMON_REQ, "dream", "suggest_dreambuilder", "proceed_to_dream", "proceed_to_purpose"]
);

const GenericJsonSchema = strictObjectSchema(
  "generic_step",
  {
    ...COMMON_PROPS,
    value: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  [...COMMON_REQ, "value", "proceed_to_next"]
);

const StrategyJsonSchema = strictObjectSchema(
  "strategy_step",
  {
    ...COMMON_PROPS,
    strategy: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  [...COMMON_REQ, "strategy", "proceed_to_next"]
);

const RulesJsonSchema = strictObjectSchema(
  "rules_step",
  {
    ...COMMON_PROPS,
    rulesofthegame: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  [...COMMON_REQ, "rulesofthegame", "proceed_to_next"]
);

const PresentationJsonSchema = strictObjectSchema(
  "presentation_step",
  {
    ...COMMON_PROPS,
    presentation_brief: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  [...COMMON_REQ, "presentation_brief", "proceed_to_next"]
);

// -------------------- Render integration --------------------
function integrateToText(specialistJson: any): string {
  const parts: string[] = [];

  const intro = String(specialistJson?.session_intro ?? "").trim();
  if (intro) parts.push(intro);

  const msg = String(specialistJson?.message ?? "").trim();
  const refined = String(specialistJson?.refined_formulation ?? "").trim();
  const confirmQ = String(specialistJson?.confirmation_question ?? "").trim();
  const q = String(specialistJson?.question ?? "").trim();

  if (msg) parts.push(msg);
  if (refined) parts.push(refined);
  if (confirmQ) parts.push(confirmQ);
  else if (q) parts.push(q);

  return parts.filter(Boolean).join("\n");
}

// -------------------- Robust Responses parsing helpers --------------------
type OpenAIDebug = {
  response_id?: string;
  http_status?: number;
  parse_error?: string;
  output_preview?: string;
};

class OpenAIJsonError extends Error {
  debug: OpenAIDebug;
  constructor(message: string, debug: OpenAIDebug) {
    super(message);
    this.name = "OpenAIJsonError";
    this.debug = debug;
  }
}

function extractResponsesOutputText(data: any): string {
  const outputs = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];

  for (const item of outputs) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
      }
    }
  }

  if (chunks.length === 0 && typeof data?.output_text === "string") return data.output_text;
  if (chunks.length === 0 && typeof data?.text === "string") return data.text;

  return chunks.join("\n").trim();
}

function tryParseJson(text: string): any | null {
  const t = (text || "").trim();
  if (!t) return null;

  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) {
      const candidate = t.slice(s, e + 1).trim();
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---- OpenAI Responses API call (Structured Outputs json_schema strict) ----
async function callOpenAIJson({
  apiKey,
  model,
  system,
  user,
  jsonSchema,
}: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  jsonSchema: JsonSchema;
}) {
  const url = "https://api.openai.com/v1/responses";
  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: jsonSchema.title || "schema",
        schema: jsonSchema,
        strict: true,
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new OpenAIJsonError(`OpenAI HTTP ${res.status}`, {
      http_status: res.status,
      output_preview: t.slice(0, 500),
    });
  }

  const data: any = await res.json();
  const responseId = typeof data?.id === "string" ? data.id : undefined;

  if (data && typeof data === "object" && data.output_parsed && typeof data.output_parsed === "object") {
    return { parsed: data.output_parsed, debug: { response_id: responseId } as OpenAIDebug };
  }

  const text = extractResponsesOutputText(data);
  const parsed = tryParseJson(text);

  if (!parsed) {
    const preview = (text || "").slice(0, 500).replace(/\s+/g, " ").trim();
    throw new OpenAIJsonError("Could not parse JSON from Responses output", {
      response_id: responseId,
      parse_error: "parse_failed",
      output_preview: preview,
    });
  }

  return { parsed, debug: { response_id: responseId } as OpenAIDebug };
}

// -------------------- Session intro base (English only; model translates) --------------------
const PROJECT_SESSION_INTRO_EN =
  "Welcome to Ben Steenstra’s Business Strategy Canvas, used in national and international organizations. " +
  "We will go through a small number of steps, one by one, so each step is clear before we move on. " +
  "At the end you will have a complete and concise business plan, ready as direction for yourself and as a clear " +
  "presentation for external stakeholders, partners, or team members.";

// -------------------- Schema-safe fallbacks --------------------
function baseAsk(): {
  session_intro: string;
  action: "ASK";
  message: string;
  question: string;
  refined_formulation: string;
  confirmation_question: string;
} {
  return {
    session_intro: "",
    action: "ASK",
    message: "I couldn't process the previous output. Let's try again.",
    question: "Could you resend your answer?",
    refined_formulation: "",
    confirmation_question: "",
  };
}

function fallbackValidation(state: CanvasState) {
  return {
    ...baseAsk(),
    business_name: String(state.business_name ?? "TBD"),
    proceed_to_dream: "false" as const,
    step_0: String(state.step_0 ?? ""),
    question: "What's your business name, and in one sentence: what does it do?",
  };
}

function fallbackDream(state: CanvasState) {
  return {
    ...baseAsk(),
    dream: String(state.dream ?? ""),
    suggest_dreambuilder: "false" as const,
    proceed_to_dream: "false" as const,
    proceed_to_purpose: "false" as const,
    question: "What is your Dream? Describe the desired future state.",
  };
}

function fallbackGeneric(existing: string, stepLabelEn: string) {
  return {
    ...baseAsk(),
    value: String(existing ?? ""),
    proceed_to_next: "false" as const,
    question: `Could you answer the '${stepLabelEn}' step again?`,
  };
}

function fallbackStrategy(state: CanvasState) {
  return {
    ...baseAsk(),
    strategy: String(state.strategy ?? ""),
    proceed_to_next: "false" as const,
    question: "What is your strategy in 2–5 bullets? (focus, choices, target, differentiation)",
  };
}

function fallbackRules(state: CanvasState) {
  return {
    ...baseAsk(),
    rulesofthegame: String(state.rulesofthegame ?? ""),
    proceed_to_next: "false" as const,
    question: "What are your Rules of the game? (principles/agreements/operating rules)",
  };
}

function fallbackPresentation(state: CanvasState) {
  return {
    ...baseAsk(),
    presentation_brief: String(state.presentation_brief ?? ""),
    proceed_to_next: "false" as const,
    question: "What should be in the presentation? (goal, audience, key points)",
  };
}

// -------------------- Specialists (language mirrors latest user input) --------------------
function specialistRules(showSessionIntro: boolean, showStepIntro: boolean): string {
  return [
    "IMPORTANT LANGUAGE RULE: Write ALL strings in the same language as the user's latest input.",
    "Do not mix languages.",
    "",
    "SESSION INTRO FIELD RULE:",
    `If show_session_intro=true then set session_intro to a natural translation of this text (keep meaning, not necessarily word-for-word):`,
    PROJECT_SESSION_INTRO_EN,
    "If show_session_intro=false then set session_intro to an empty string.",
    "",
    showStepIntro
      ? "STEP INTRO: You may briefly introduce the current step in the MESSAGE if appropriate."
      : "STEP INTRO: Do not add an extra step introduction in MESSAGE.",
    "",
    "CRITICAL: Do not invent new questions. Use the step's own QUESTION / CONFIRMATION_QUESTION fields only.",
    "CRITICAL: If you present numbered options, put them ONLY in the question field with real line breaks.",
  ].join("\n");
}

function validationSystem(showSessionIntro: boolean, showStepIntro: boolean): string {
  return [
    specialistRules(showSessionIntro, showStepIntro),
    "",
    "You are a specialist for step_0: validation + business name.",
    "Output must follow the JSON schema exactly. Do not add extra fields.",
    "Keep it short and aligned with the flow: confirm business name and ask if ready to start Dream when appropriate.",
  ].join("\n");
}

function dreamSystem(showSessionIntro: boolean, showStepIntro: boolean): string {
  return [
    specialistRules(showSessionIntro, showStepIntro),
    "",
    "You are a specialist for 'Dream'.",
    "Output must follow the JSON schema exactly. Do not add extra fields.",
    "Do NOT ask about business name satisfaction here.",
  ].join("\n");
}

function genericSystem(stepLabelEn: string, showSessionIntro: boolean, showStepIntro: boolean): string {
  return [
    specialistRules(showSessionIntro, showStepIntro),
    "",
    `You are a specialist for '${stepLabelEn}'.`,
    "Output must follow the JSON schema exactly. Do not add extra fields.",
  ].join("\n");
}

async function runValidation(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof ValidationSchema>; debug?: OpenAIDebug }> {
  const system = validationSystem(showSessionIntro, showStepIntro);
  const user = `User input: ${userMessage}\nKnown business name: ${state.business_name ?? ""}\nKnown step_0: ${state.step_0 ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: ValidationJsonSchema });
    return { value: ValidationSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: ValidationSchema.parse(fallbackValidation(state)), debug: dbg };
  }
}

async function runDream(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof DreamSchema>; debug?: OpenAIDebug }> {
  const system = dreamSystem(showSessionIntro, showStepIntro);
  const user = `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nCurrent dream: ${state.dream ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: DreamJsonSchema });
    return { value: DreamSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: DreamSchema.parse(fallbackDream(state)), debug: dbg };
  }
}

async function runGenericStep(
  apiKey: string,
  model: string,
  stateKey: keyof CanvasState,
  stepLabelEn: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof GenericStepSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem(stepLabelEn, showSessionIntro, showStepIntro);
  const existing = String((state as any)[stateKey] ?? "");
  const user = `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting value: ${existing}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: GenericJsonSchema });
    return { value: GenericStepSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: GenericStepSchema.parse(fallbackGeneric(existing, stepLabelEn)), debug: dbg };
  }
}

async function runStrategy(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof StrategySchema>; debug?: OpenAIDebug }> {
  const system = genericSystem("Strategy", showSessionIntro, showStepIntro);
  const user = `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting strategy: ${state.strategy ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: StrategyJsonSchema });
    return { value: StrategySchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: StrategySchema.parse(fallbackStrategy(state)), debug: dbg };
  }
}

async function runRules(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof RulesSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem("Rules of the game", showSessionIntro, showStepIntro);
  const user = `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting rules: ${state.rulesofthegame ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: RulesJsonSchema });
    return { value: RulesSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: RulesSchema.parse(fallbackRules(state)), debug: dbg };
  }
}

async function runPresentation(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof PresentationSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem("Presentation", showSessionIntro, showStepIntro);
  const user = `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting brief: ${state.presentation_brief ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: PresentationJsonSchema });
    return { value: PresentationSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: PresentationSchema.parse(fallbackPresentation(state)), debug: dbg };
  }
}

function nextStepOf(step: StepId): StepId {
  const order: StepId[] = [
    "step_0",
    "dream",
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "rulesofthegame",
    "presentation",
  ];
  const idx = order.indexOf(step);
  if (idx < 0) return "step_0";
  return order[Math.min(idx + 1, order.length - 1)];
}

// -------------------- Exported entrypoint --------------------
export async function runCanvasStep(args: {
  current_step_id: string;
  user_message: string;
  state?: Record<string, any>;
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const incomingState = (args.state ?? {}) as Partial<CanvasState>;
  const merged: CanvasState = { ...DEFAULT_STATE, ...incomingState };

  const userMessage = args.user_message ?? "";

  // Determine if this is a fresh session (no state coming in)
  const hasIncomingState = !!args.state && Object.keys(args.state).length > 0;
  const looksFreshSession =
    !hasIncomingState ||
    (merged.intro_shown_session === "false" &&
      merged.intro_shown_for_step === "" &&
      merged.active_specialist === "" &&
      !merged.business_name &&
      !merged.step_0 &&
      !merged.dream &&
      !merged.purpose &&
      !merged.bigwhy &&
      !merged.role &&
      !merged.entity &&
      !merged.strategy &&
      !merged.rulesofthegame &&
      !merged.presentation_brief);

  const requested: StepId = looksFreshSession
    ? "step_0"
    : ((args.current_step_id || merged.current_step || "step_0") as StepId);

  merged.current_step = requested;

  // Debug collected across calls
  let debug: { openai?: OpenAIDebug } = {};

  // Session intro should appear exactly once per session.
  const sessionIntroWanted = merged.intro_shown_session !== "true";

  // We'll run 1+ specialists in a single call if we hit a "proceed" trigger.
  // This matches the project flow behavior (e.g., step_0 proceed -> immediately show Dream INTRO):contentReference[oaicite:1]{index=1}.
  let stepToRun: StepId = merged.current_step;
  let finalSpecialistName = "";
  let finalSpecialistJson: any = null;

  // Carry intro text forward if we move to the next step in the same tool call
  let carriedSessionIntro = "";

  // Safety: avoid accidental infinite loops
  const MAX_HOPS = 3;
  let hops = 0;

  while (hops < MAX_HOPS) {
    hops++;

    const showSessionIntro = sessionIntroWanted && carriedSessionIntro === "";
    const showStepIntro = merged.intro_shown_for_step !== stepToRun;

    let specialistName = "";
    let specialistJson: any = null;

    if (stepToRun === "step_0") {
      specialistName = "ValidationAndBusinessName";
      const r = await runValidation(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.business_name) merged.business_name = specialistJson.business_name;
      if (specialistJson.step_0) merged.step_0 = specialistJson.step_0;
    } else if (stepToRun === "dream") {
      specialistName = "Dream";
      const r = await runDream(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.dream) merged.dream = specialistJson.dream;
    } else if (stepToRun === "purpose") {
      specialistName = "Purpose";
      const r = await runGenericStep(apiKey, model, "purpose", "Purpose", userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.value) merged.purpose = specialistJson.value;
    } else if (stepToRun === "bigwhy") {
      specialistName = "BigWhy";
      const r = await runGenericStep(apiKey, model, "bigwhy", "Big Why", userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.value) merged.bigwhy = specialistJson.value;
    } else if (stepToRun === "role") {
      specialistName = "Role";
      const r = await runGenericStep(apiKey, model, "role", "Role", userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.value) merged.role = specialistJson.value;
    } else if (stepToRun === "entity") {
      specialistName = "Entity";
      const r = await runGenericStep(apiKey, model, "entity", "Entity", userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.value) merged.entity = specialistJson.value;
    } else if (stepToRun === "strategy") {
      specialistName = "Strategy";
      const r = await runStrategy(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.strategy) merged.strategy = specialistJson.strategy;
    } else if (stepToRun === "rulesofthegame") {
      specialistName = "RulesOfTheGame";
      const r = await runRules(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.rulesofthegame) merged.rulesofthegame = specialistJson.rulesofthegame;
    } else if (stepToRun === "presentation") {
      specialistName = "Presentation";
      const r = await runPresentation(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;

      if (specialistJson.presentation_brief) merged.presentation_brief = specialistJson.presentation_brief;
    } else {
      specialistName = "ValidationAndBusinessName";
      stepToRun = "step_0";
      const r = await runValidation(apiKey, model, userMessage, merged, showSessionIntro, showStepIntro);
      specialistJson = r.value;
      if (r.debug) debug.openai = r.debug;
    }

    // If the specialist generated the session intro (translated), keep it for the final output.
    const maybeIntro = String(specialistJson?.session_intro ?? "").trim();
    if (showSessionIntro && maybeIntro) carriedSessionIntro = maybeIntro;

    // Mark intro flags for what we actually ran
    if (sessionIntroWanted) merged.intro_shown_session = "true";
    if (showStepIntro) merged.intro_shown_for_step = stepToRun;

    // Keep "latest"
    merged.active_specialist = specialistName;
    merged.last_specialist_result = specialistJson;

    // Decide whether we must immediately advance (project-flow behavior)
    const proceedToDream = stepToRun === "step_0" && specialistJson?.proceed_to_dream === "true";
    const proceedToPurpose = stepToRun === "dream" && specialistJson?.proceed_to_purpose === "true";
    const proceedToNext =
      stepToRun !== "step_0" &&
      stepToRun !== "dream" &&
      stepToRun !== "presentation" &&
      specialistJson?.proceed_to_next === "true";

    // Set "final" as the last specialist we executed (unless we hop)
    finalSpecialistName = specialistName;
    finalSpecialistJson = specialistJson;

    // Advance rules:
    // - step_0 -> dream if proceed_to_dream
    // - dream -> purpose if proceed_to_purpose
    // - other steps -> nextStepOf if proceed_to_next
    // - presentation does not auto-advance in this minimal server
    if (proceedToDream) {
      stepToRun = "dream";
      merged.current_step = "dream";
      continue;
    }
    if (proceedToPurpose) {
      stepToRun = "purpose";
      merged.current_step = "purpose";
      continue;
    }
    if (proceedToNext) {
      const ns = nextStepOf(stepToRun);
      stepToRun = ns;
      merged.current_step = ns;
      continue;
    }

    // No advance → stop
    merged.current_step = stepToRun;
    break;
  }

  // Ensure the final output contains session_intro at most once
  if (finalSpecialistJson && typeof finalSpecialistJson === "object") {
    finalSpecialistJson.session_intro = carriedSessionIntro || "";
  }

  const text = integrateToText(finalSpecialistJson);

  return {
    ok: true,
    tool: "run_step",
    version: "agents-v37",
    current_step_id: merged.current_step,
    active_specialist: finalSpecialistName,
    text,
    specialist: finalSpecialistJson,
    state: merged,
    debug,
  };
}
