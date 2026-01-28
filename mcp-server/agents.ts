// mcp-server/agents.ts
import { z } from "zod";

/**
 * One-shot fix package:
 * 1) ✅ Responses API parsing (no reliance on `data.output_text` in raw fetch)
 * 2) ✅ Never JSON.parse("") → robust extraction + parsing + guarded fallbacks
 * 3) ✅ step_0 always first on fresh session (even if ChatGPT sends dream)
 * 4) ✅ intro flags mark the step actually rendered (not the progressed step)
 * 5) ✅ Debug included in tool return (without breaking strict specialist schemas)
 */

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

  // optional
  language?: "nl" | "en";
};

const DEFAULT_STATE: CanvasState = {
  current_step: "step_0",
  intro_shown_for_step: "",
  intro_shown_session: "false",
  active_specialist: "",
  language: "nl",
};

// ---- Zod Schemas (runtime validation) ----
const ActionEnum = ["INTRO", "ASK", "REFINE", "CONFIRM", "ESCAPE"] as const;

const ValidationSchema = z.object({
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
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  value: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const StrategySchema = z.object({
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  strategy: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const RulesSchema = z.object({
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  rulesofthegame: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

const PresentationSchema = z.object({
  action: z.enum(ActionEnum),
  message: z.string(),
  question: z.string(),
  refined_formulation: z.string(),
  confirmation_question: z.string(),
  presentation_brief: z.string(),
  proceed_to_next: z.enum(["true", "false"]),
});

// ---- Structured Outputs JSON Schemas (for OpenAI Responses text.format json_schema strict) ----
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

const ValidationJsonSchema = strictObjectSchema(
  "validation_step_0",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    business_name: STR_SCHEMA,
    proceed_to_dream: BOOLSTR_SCHEMA,
    step_0: STR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "business_name", "proceed_to_dream", "step_0"]
);

const DreamJsonSchema = strictObjectSchema(
  "dream_step",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    dream: STR_SCHEMA,
    suggest_dreambuilder: BOOLSTR_SCHEMA,
    proceed_to_dream: BOOLSTR_SCHEMA,
    proceed_to_purpose: BOOLSTR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "dream", "suggest_dreambuilder", "proceed_to_dream", "proceed_to_purpose"]
);

const GenericJsonSchema = strictObjectSchema(
  "generic_step",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    value: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "value", "proceed_to_next"]
);

const StrategyJsonSchema = strictObjectSchema(
  "strategy_step",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    strategy: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "strategy", "proceed_to_next"]
);

const RulesJsonSchema = strictObjectSchema(
  "rules_step",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    rulesofthegame: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "rulesofthegame", "proceed_to_next"]
);

const PresentationJsonSchema = strictObjectSchema(
  "presentation_step",
  {
    action: ACTION_SCHEMA,
    message: STR_SCHEMA,
    question: STR_SCHEMA,
    refined_formulation: STR_SCHEMA,
    confirmation_question: STR_SCHEMA,
    presentation_brief: STR_SCHEMA,
    proceed_to_next: BOOLSTR_SCHEMA,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "presentation_brief", "proceed_to_next"]
);

// -------------------- Language + text integration --------------------

function detectLanguage(userMessage: string, state: CanvasState): "nl" | "en" {
  const t = (userMessage || "").toLowerCase();
  if (state.language) return state.language;
  if (/\b(hello|hi|please|company|business|name)\b/.test(t)) return "en";
  return "nl";
}

function sessionIntro(lang: "nl" | "en"): string {
  return lang === "nl"
    ? "Welkom bij de Business Strategy Canvas. We doorlopen stap voor stap je basis en werken toe naar een heldere output."
    : "Welcome to the Business Strategy Canvas. We'll go step by step toward a clear output.";
}

function integrateToText({
  lang,
  showSessionIntro,
  specialistJson,
}: {
  lang: "nl" | "en";
  showSessionIntro: boolean;
  specialistJson: any;
}): string {
  const parts: string[] = [];
  if (showSessionIntro) parts.push(sessionIntro(lang));

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

  // Defensive fallbacks (never primary)
  if (chunks.length === 0 && typeof data?.output_text === "string") return data.output_text;
  if (chunks.length === 0 && typeof data?.text === "string") return data.text;

  return chunks.join("\n").trim();
}

function tryParseJson(text: string): any | null {
  const t = (text || "").trim();
  if (!t) return null;

  // Direct parse
  try {
    return JSON.parse(t);
  } catch {
    // Extract first-to-last braces span
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

// ---- OpenAI Responses API call (robust; Structured Outputs json_schema strict) ----
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

  // If something upstream provides already-parsed output, accept it
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

// -------------------- Schema-safe fallbacks (strict; no extra fields) --------------------

function baseAsk(lang: "nl" | "en") {
  return {
    action: "ASK" as const,
    message:
      lang === "nl"
        ? "Ik kon de vorige output niet verwerken. Laten we het opnieuw proberen."
        : "I couldn't process the previous output. Let's try again.",
    question: lang === "nl" ? "Kun je je antwoord opnieuw sturen?" : "Could you resend your answer?",
    refined_formulation: "",
    confirmation_question: "",
  };
}

function fallbackValidation(lang: "nl" | "en", state: CanvasState) {
  return {
    ...baseAsk(lang),
    business_name: String(state.business_name ?? ""),
    proceed_to_dream: "false" as const,
    step_0: String(state.step_0 ?? ""),
    question:
      lang === "nl"
        ? "Wat is je bedrijfsnaam, en in één zin: wat doet je bedrijf?"
        : "What's your business name, and in one sentence: what does it do?",
  };
}

function fallbackDream(lang: "nl" | "en", state: CanvasState) {
  return {
    ...baseAsk(lang),
    dream: String(state.dream ?? ""),
    suggest_dreambuilder: "false" as const,
    proceed_to_dream: "false" as const,
    proceed_to_purpose: "false" as const,
    question:
      lang === "nl"
        ? "Wat is jouw Dream? Beschrijf het gewenste toekomstbeeld."
        : "What is your Dream? Describe the desired future state.",
  };
}

function fallbackGeneric(lang: "nl" | "en", existing: string, stepLabelNl: string, stepLabelEn: string) {
  return {
    ...baseAsk(lang),
    value: String(existing ?? ""),
    proceed_to_next: "false" as const,
    question: lang === "nl"
      ? `Kun je je antwoord voor '${stepLabelNl}' opnieuw geven?`
      : `Could you answer the '${stepLabelEn}' step again?`,
  };
}

function fallbackStrategy(lang: "nl" | "en", state: CanvasState) {
  return {
    ...baseAsk(lang),
    strategy: String(state.strategy ?? ""),
    proceed_to_next: "false" as const,
    question:
      lang === "nl"
        ? "Wat is je strategie in 2–5 bullets? (focus, keuzes, doelgroep, onderscheidend vermogen)"
        : "What is your strategy in 2–5 bullets? (focus, choices, target, differentiation)",
  };
}

function fallbackRules(lang: "nl" | "en", state: CanvasState) {
  return {
    ...baseAsk(lang),
    rulesofthegame: String(state.rulesofthegame ?? ""),
    proceed_to_next: "false" as const,
    question:
      lang === "nl"
        ? "Wat zijn jullie Rules of the game? (principes/afspraken/gedragsregels)"
        : "What are your Rules of the game? (principles/agreements/operating rules)",
  };
}

function fallbackPresentation(lang: "nl" | "en", state: CanvasState) {
  return {
    ...baseAsk(lang),
    presentation_brief: String(state.presentation_brief ?? ""),
    proceed_to_next: "false" as const,
    question:
      lang === "nl"
        ? "Wat moet er in de presentatie komen? (doel, doelgroep, belangrijkste punten)"
        : "What should be in the presentation? (goal, audience, key points)",
  };
}

// -------------------- Specialists --------------------

function validationSystem(lang: "nl" | "en", showIntro: boolean): string {
  const intro = showIntro
    ? (lang === "nl"
        ? "Start met een korte introductie en leg uit wat je nodig hebt."
        : "Start with a short introduction and explain what you need.")
    : "";

  return [
    intro,
    lang === "nl"
      ? "Je bent een specialist die stap_0 doet: validatie + bedrijfsnaam. Output moet exact het schema volgen."
      : "You are a specialist for step_0: validation + business name. Output must follow the schema exactly.",
    "Gebruik action INTRO/ASK/REFINE/CONFIRM passend.",
  ].filter(Boolean).join("\n");
}

function dreamSystem(lang: "nl" | "en", showIntro: boolean): string {
  const intro = showIntro
    ? (lang === "nl"
        ? "Introduceer kort de stap 'Dream' en waarom we dit vragen."
        : "Briefly introduce the 'Dream' step and why we ask this.")
    : "";
  return [
    intro,
    lang === "nl"
      ? "Je bent een specialist voor 'Dream'. Output moet exact het schema volgen."
      : "You are a specialist for 'Dream'. Output must follow the schema exactly.",
  ].filter(Boolean).join("\n");
}

function genericSystem(lang: "nl" | "en", stepLabelNl: string, stepLabelEn: string, showIntro: boolean): string {
  const intro = showIntro
    ? (lang === "nl"
        ? `Introduceer kort de stap '${stepLabelNl}'.`
        : `Briefly introduce the '${stepLabelEn}' step.`)
    : "";
  return [
    intro,
    lang === "nl"
      ? `Je bent een specialist voor '${stepLabelNl}'. Output moet exact het schema volgen.`
      : `You are a specialist for '${stepLabelEn}'. Output must follow the schema exactly.`,
  ].filter(Boolean).join("\n");
}

async function runValidation(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof ValidationSchema>; debug?: OpenAIDebug }> {
  const system = validationSystem(lang, showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBekende bedrijfsnaam: ${state.business_name ?? ""}`
    : `User input: ${userMessage}\nKnown business name: ${state.business_name ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: ValidationJsonSchema });
    return { value: ValidationSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: ValidationSchema.parse(fallbackValidation(lang, state)), debug: dbg };
  }
}

async function runDream(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof DreamSchema>; debug?: OpenAIDebug }> {
  const system = dreamSystem(lang, showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nHuidige dream: ${state.dream ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nCurrent dream: ${state.dream ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: DreamJsonSchema });
    return { value: DreamSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: DreamSchema.parse(fallbackDream(lang, state)), debug: dbg };
  }
}

async function runGenericStep(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  stateKey: keyof CanvasState,
  stepLabelNl: string,
  stepLabelEn: string,
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof GenericStepSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem(lang, stepLabelNl, stepLabelEn, showIntro);
  const existing = String((state as any)[stateKey] ?? "");
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande waarde: ${existing}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting value: ${existing}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: GenericJsonSchema });
    return { value: GenericStepSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: GenericStepSchema.parse(fallbackGeneric(lang, existing, stepLabelNl, stepLabelEn)), debug: dbg };
  }
}

async function runStrategy(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof StrategySchema>; debug?: OpenAIDebug }> {
  const system = genericSystem(lang, "Strategie", "Strategy", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande strategie: ${state.strategy ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting strategy: ${state.strategy ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: StrategyJsonSchema });
    return { value: StrategySchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: StrategySchema.parse(fallbackStrategy(lang, state)), debug: dbg };
  }
}

async function runRules(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof RulesSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem(lang, "Rules of the game", "Rules of the game", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande rules: ${state.rulesofthegame ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting rules: ${state.rulesofthegame ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: RulesJsonSchema });
    return { value: RulesSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: RulesSchema.parse(fallbackRules(lang, state)), debug: dbg };
  }
}

async function runPresentation(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
): Promise<{ value: z.infer<typeof PresentationSchema>; debug?: OpenAIDebug }> {
  const system = genericSystem(lang, "Presentatie", "Presentation", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande brief: ${state.presentation_brief ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting brief: ${state.presentation_brief ?? ""}`;

  try {
    const { parsed, debug } = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: PresentationJsonSchema });
    return { value: PresentationSchema.parse(parsed), debug };
  } catch (e: any) {
    const dbg = e?.name === "OpenAIJsonError" ? (e.debug as OpenAIDebug) : { parse_error: String(e?.message ?? e) };
    return { value: PresentationSchema.parse(fallbackPresentation(lang, state)), debug: dbg };
  }
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
  const lang = detectLanguage(userMessage, merged);
  merged.language = lang;

  // ✅ step_0 consistency: force step_0 when the session looks fresh
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

  const showSessionIntro = merged.intro_shown_session !== "true";
  const showStepIntro = merged.intro_shown_for_step !== merged.current_step;

  // ✅ Track which step was actually rendered (for intro flag)
  const renderedStep: StepId = merged.current_step;

  // ✅ Collect debug across the specialist call
  let debug: { openai?: OpenAIDebug } = {};

  let specialistName = "";
  let specialistJson: any;

  if (merged.current_step === "step_0") {
    specialistName = "ValidationAndBusinessName";
    const r = await runValidation(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.business_name) merged.business_name = specialistJson.business_name;
    if (specialistJson.step_0) merged.step_0 = specialistJson.step_0;
    if (specialistJson.proceed_to_dream === "true") merged.current_step = "dream";
  } else if (merged.current_step === "dream") {
    specialistName = "Dream";
    const r = await runDream(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.dream) merged.dream = specialistJson.dream;
    if (specialistJson.proceed_to_purpose === "true") merged.current_step = "purpose";
  } else if (merged.current_step === "purpose") {
    specialistName = "Purpose";
    const r = await runGenericStep(apiKey, model, lang, "purpose", "Purpose", "Purpose", userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.value) merged.purpose = specialistJson.value;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "bigwhy";
  } else if (merged.current_step === "bigwhy") {
    specialistName = "BigWhy";
    const r = await runGenericStep(apiKey, model, lang, "bigwhy", "Big Why", "Big Why", userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.value) merged.bigwhy = specialistJson.value;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "role";
  } else if (merged.current_step === "role") {
    specialistName = "Role";
    const r = await runGenericStep(apiKey, model, lang, "role", "Rol", "Role", userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.value) merged.role = specialistJson.value;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "entity";
  } else if (merged.current_step === "entity") {
    specialistName = "Entity";
    const r = await runGenericStep(apiKey, model, lang, "entity", "Entiteit", "Entity", userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.value) merged.entity = specialistJson.value;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "strategy";
  } else if (merged.current_step === "strategy") {
    specialistName = "Strategy";
    const r = await runStrategy(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.strategy) merged.strategy = specialistJson.strategy;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "rulesofthegame";
  } else if (merged.current_step === "rulesofthegame") {
    specialistName = "RulesOfTheGame";
    const r = await runRules(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.rulesofthegame) merged.rulesofthegame = specialistJson.rulesofthegame;
    if (specialistJson.proceed_to_next === "true") merged.current_step = "presentation";
  } else if (merged.current_step === "presentation") {
    specialistName = "Presentation";
    const r = await runPresentation(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;

    if (specialistJson.presentation_brief) merged.presentation_brief = specialistJson.presentation_brief;
  } else {
    specialistName = "ValidationAndBusinessName";
    merged.current_step = "step_0";
    const r = await runValidation(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = r.value;
    if (r.debug) debug.openai = r.debug;
  }

  // ✅ Intro flags: mark what was rendered, not what we progressed to
  if (showSessionIntro) merged.intro_shown_session = "true";
  if (showStepIntro) merged.intro_shown_for_step = renderedStep;

  merged.active_specialist = specialistName;
  merged.last_specialist_result = specialistJson;

  const text = integrateToText({ lang, showSessionIntro, specialistJson });

  return {
    ok: true,
    tool: "run_step",
    version: "agents-v3",
    current_step_id: merged.current_step,
    active_specialist: specialistName,
    text,
    specialist: specialistJson,
    state: merged,
    debug, // ✅ debug is outside strict step schemas; safe for UI inspection
  };
}
