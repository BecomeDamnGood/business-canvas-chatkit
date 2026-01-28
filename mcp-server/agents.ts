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

// ---- OpenAI Responses API call (minimal) ----
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
    throw new Error(`OpenAI error ${res.status}: ${t}`);
  }

  const data: any = await res.json();
  const outText: string = data?.output_text ?? "";
  const parsed = JSON.parse(outText);
  return parsed;
}

// ---- Specialists ----
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
) {
  const system = validationSystem(lang, showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBekende bedrijfsnaam: ${state.business_name ?? ""}`
    : `User input: ${userMessage}\nKnown business name: ${state.business_name ?? ""}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: ValidationJsonSchema });
  return ValidationSchema.parse(parsed);
}

async function runDream(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
) {
  const system = dreamSystem(lang, showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nHuidige dream: ${state.dream ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nCurrent dream: ${state.dream ?? ""}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: DreamJsonSchema });
  return DreamSchema.parse(parsed);
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
) {
  const system = genericSystem(lang, stepLabelNl, stepLabelEn, showIntro);
  const existing = String((state as any)[stateKey] ?? "");
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande waarde: ${existing}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting value: ${existing}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: GenericJsonSchema });
  return GenericStepSchema.parse(parsed);
}

async function runStrategy(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
) {
  const system = genericSystem(lang, "Strategie", "Strategy", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande strategie: ${state.strategy ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting strategy: ${state.strategy ?? ""}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: StrategyJsonSchema });
  return StrategySchema.parse(parsed);
}

async function runRules(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
) {
  const system = genericSystem(lang, "Rules of the game", "Rules of the game", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande rules: ${state.rulesofthegame ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting rules: ${state.rulesofthegame ?? ""}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: RulesJsonSchema });
  return RulesSchema.parse(parsed);
}

async function runPresentation(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showIntro: boolean
) {
  const system = genericSystem(lang, "Presentatie", "Presentation", showIntro);
  const user = lang === "nl"
    ? `Input gebruiker: ${userMessage}\nBedrijfsnaam: ${state.business_name ?? ""}\nBestaande brief: ${state.presentation_brief ?? ""}`
    : `User input: ${userMessage}\nBusiness name: ${state.business_name ?? ""}\nExisting brief: ${state.presentation_brief ?? ""}`;

  const parsed = await callOpenAIJson({ apiKey, model, system, user, jsonSchema: PresentationJsonSchema });
  return PresentationSchema.parse(parsed);
}

// ---- Exported entrypoint ----
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

  const requested = (args.current_step_id || merged.current_step || "step_0") as StepId;
  merged.current_step = requested;

  const showSessionIntro = merged.intro_shown_session !== "true";
  const showStepIntro = merged.intro_shown_for_step !== merged.current_step;

  let specialistName = "";
  let specialistJson: any;

  if (merged.current_step === "step_0") {
    specialistName = "ValidationAndBusinessName";
    specialistJson = await runValidation(apiKey, model, lang, userMessage, merged, showStepIntro);

    if (specialistJson.business_name) merged.business_name = specialistJson.business_name;
    if (specialistJson.step_0) merged.step_0 = specialistJson.step_0;

    if (specialistJson.proceed_to_dream === "true") {
      merged.current_step = "dream";
    }
  } else if (merged.current_step === "dream") {
    specialistName = "Dream";
    specialistJson = await runDream(apiKey, model, lang, userMessage, merged, showStepIntro);
    if (specialistJson.dream) merged.dream = specialistJson.dream;

    if (specialistJson.proceed_to_purpose === "true") {
      merged.current_step = "purpose";
    }
  } else if (merged.current_step === "purpose") {
    specialistName = "Purpose";
    const res = await runGenericStep(apiKey, model, lang, "purpose", "Purpose", "Purpose", userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.value) merged.purpose = res.value;
    if (res.proceed_to_next === "true") merged.current_step = "bigwhy";
  } else if (merged.current_step === "bigwhy") {
    specialistName = "BigWhy";
    const res = await runGenericStep(apiKey, model, lang, "bigwhy", "Big Why", "Big Why", userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.value) merged.bigwhy = res.value;
    if (res.proceed_to_next === "true") merged.current_step = "role";
  } else if (merged.current_step === "role") {
    specialistName = "Role";
    const res = await runGenericStep(apiKey, model, lang, "role", "Rol", "Role", userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.value) merged.role = res.value;
    if (res.proceed_to_next === "true") merged.current_step = "entity";
  } else if (merged.current_step === "entity") {
    specialistName = "Entity";
    const res = await runGenericStep(apiKey, model, lang, "entity", "Entiteit", "Entity", userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.value) merged.entity = res.value;
    if (res.proceed_to_next === "true") merged.current_step = "strategy";
  } else if (merged.current_step === "strategy") {
    specialistName = "Strategy";
    const res = await runStrategy(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.strategy) merged.strategy = res.strategy;
    if (res.proceed_to_next === "true") merged.current_step = "rulesofthegame";
  } else if (merged.current_step === "rulesofthegame") {
    specialistName = "RulesOfTheGame";
    const res = await runRules(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.rulesofthegame) merged.rulesofthegame = res.rulesofthegame;
    if (res.proceed_to_next === "true") merged.current_step = "presentation";
  } else if (merged.current_step === "presentation") {
    specialistName = "Presentation";
    const res = await runPresentation(apiKey, model, lang, userMessage, merged, showStepIntro);
    specialistJson = res;
    if (res.presentation_brief) merged.presentation_brief = res.presentation_brief;
  } else {
    specialistName = "ValidationAndBusinessName";
    merged.current_step = "step_0";
    specialistJson = await runValidation(apiKey, model, lang, userMessage, merged, showStepIntro);
  }

  if (showSessionIntro) merged.intro_shown_session = "true";
  if (showStepIntro) merged.intro_shown_for_step = requested;

  merged.active_specialist = specialistName;
  merged.last_specialist_result = specialistJson;

  const text = integrateToText({ lang, showSessionIntro, specialistJson });

  return {
    ok: true,
    tool: "run_step",
    version: "agents-v1",
    // ✅ FIX: return the ACTUAL step after progression
    current_step_id: merged.current_step,
    active_specialist: specialistName,
    text,
    specialist: specialistJson,
    state: merged,
  };
}
