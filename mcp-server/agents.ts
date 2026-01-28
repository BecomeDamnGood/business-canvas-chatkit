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
  step_0?: string; // "Venture: ... | Name: ..."
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

// ---- Structured Outputs JSON Schemas (for OpenAI text.format json_schema strict) ----
type JsonSchema = Record<string, any>;

function strictObjectSchema(name: string, properties: Record<string, any>, required: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
    // Optional metadata:
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
  [
    "action",
    "message",
    "question",
    "refined_formulation",
    "confirmation_question",
    "dream",
    "suggest_dreambuilder",
    "proceed_to_dream",
    "proceed_to_purpose",
  ]
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

// ---- Minimal NL/EN session intro ----
function detectLanguage(userMessage: string, state?: CanvasState): "nl" | "en" {
  if (state?.language) return state.language;
  const m = (userMessage || "").toLowerCase();
  const nlHits = ["ik", "ja", "nee", "mijn", "bedrijf", "droom", "waarom", "omdat", "doel", "klant", "strategie"];
  const score = nlHits.reduce((acc, w) => acc + (m.includes(w) ? 1 : 0), 0);
  return score >= 2 ? "nl" : "en";
}

function sessionIntro(lang: "nl" | "en"): string {
  if (lang === "nl") {
    return [
      "Welkom bij Ben Steenstra’s Business Strategy Canvas. We doorlopen een klein aantal stappen, één voor één, zodat elke stap duidelijk is voordat we verder gaan.",
      "Aan het einde heb je een compleet en beknopt businessplan, klaar als richting voor jezelf en als heldere presentatie voor stakeholders.",
    ].join("\n");
  }
  return [
    "Welcome to Ben Steenstra’s Business Strategy Canvas. We’ll go through a small number of steps, one by one, so each step is clear before moving on.",
    "At the end you’ll have a concise business plan, ready as direction for yourself and as a clear presentation for stakeholders.",
  ].join("\n");
}

// ---- Responses API parsing helpers ----
function extractOutputTextFromResponses(data: any): string | undefined {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const out = data?.output;
  if (!Array.isArray(out)) return undefined;

  for (const item of out) {
    if (item?.type !== "message") continue;
    const content = item?.content;
    if (!Array.isArray(content)) continue;

    const outTextItem = content.find((c: any) => c?.type === "output_text" && typeof c?.text === "string");
    if (outTextItem?.text?.trim()) return outTextItem.text;
  }

  return undefined;
}

function extractFirstJsonObject(text: string): string | null {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];

    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }

    if (ch === '"') {
      inStr = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

// ---- OpenAI call helper (Responses API via fetch) ----
// Uses Structured Outputs (json_schema strict) when possible.
// If the selected model does not support json_schema, it falls back to json_object mode.
type TextFormat =
  | { type: "json_schema"; name: string; strict: true; schema: JsonSchema }
  | { type: "json_object" };

async function openaiJson<T>({
  apiKey,
  model,
  system,
  user,
  format,
  temperature = 0.2,
  maxOutputTokens = 1200,
}: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  format: TextFormat;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const makeBody = (fmt: TextFormat) => ({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: fmt },
    temperature,
    max_output_tokens: maxOutputTokens,
    store: false,
  });

  // 1) Try Structured Outputs (json_schema strict) first if requested
  let resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(makeBody(format)),
  });

  // 2) If model rejects json_schema, fallback to json_object (keeps the app running)
  if (!resp.ok && format.type === "json_schema") {
    const errText = await resp.text().catch(() => "");
    const looksLikeUnsupportedSchema =
      errText.includes("json_schema") ||
      errText.includes("text.format") ||
      errText.includes("not supported") ||
      errText.includes("Invalid parameter");

    if (looksLikeUnsupportedSchema) {
      resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(makeBody({ type: "json_object" })),
      });

      if (!resp.ok) {
        const fallbackText = await resp.text().catch(() => "");
        throw new Error(`OpenAI error ${resp.status}: ${fallbackText}`);
      }
    } else {
      throw new Error(`OpenAI error ${resp.status}: ${errText}`);
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }

  const data: any = await resp.json();
  const outText = extractOutputTextFromResponses(data);

  if (!outText) {
    throw new Error("OpenAI response missing output_text (no message/output_text item found).");
  }

  try {
    return JSON.parse(outText) as T;
  } catch {
    try {
      return JSON.parse(String(outText).trim()) as T;
    } catch {
      const extracted = extractFirstJsonObject(outText);
      if (!extracted) {
        throw new Error(`Model output was not valid JSON. Raw output_text: ${outText.slice(0, 500)}`);
      }
      return JSON.parse(extracted) as T;
    }
  }
}

// ---- Integrator (deterministic renderer) ----
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

// ---- Specialists (compact prompts) ----
function sysBase(lang: "nl" | "en"): string {
  const base =
    lang === "nl"
      ? "Je bent een specialist in Ben Steenstra’s Business Strategy Canvas."
      : "You are a specialist in Ben Steenstra’s Business Strategy Canvas.";

  // This line is important even with structured outputs: it reduces “creative” schema breaks.
  const formatRules =
    lang === "nl"
      ? [
          "Antwoord ALLEEN met JSON dat exact past op het schema.",
          "Vul ALLE velden altijd in (als iets niet van toepassing is: gebruik een lege string).",
          "Gebruik voor booleans ALLEEN de strings \"true\" of \"false\".",
          "Gebruik voor action ALLEEN: INTRO, ASK, REFINE, CONFIRM, ESCAPE.",
          "Geen markdown. Geen extra tekst.",
        ].join(" ")
      : [
          "Respond ONLY with JSON that exactly matches the schema.",
          "Always include ALL fields (if not applicable: use an empty string).",
          "For booleans, ONLY use the strings \"true\" or \"false\".",
          "For action, ONLY use: INTRO, ASK, REFINE, CONFIRM, ESCAPE.",
          "No markdown. No extra text.",
        ].join(" ");

  return `${base} ${formatRules}`;
}

function userEnvelope(step: StepId, userMessage: string, state: CanvasState, showStepIntro: boolean): string {
  return [
    `CURRENT_STEP_ID: ${step}`,
    `SHOW_STEP_INTRO: ${showStepIntro ? "true" : "false"}`,
    `USER_MESSAGE: ${userMessage || ""}`,
    `STATE_JSON: ${JSON.stringify(state)}`,
  ].join("\n");
}

async function runValidation(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const system = [
    sysBase(lang),
    lang === "nl"
      ? "Doel: haal bedrijfsnaam uit USER_MESSAGE. Als het al bekend is: vraag bevestiging. Als user 'ja' bevestigt: proceed_to_dream=\"true\"."
      : "Goal: extract business name from USER_MESSAGE. If already known: ask confirmation. If user confirms (yes): proceed_to_dream=\"true\".",
    "Velden: action,message,question,refined_formulation,confirmation_question,business_name,proceed_to_dream,step_0.",
  ].join("\n");

  const user = userEnvelope("step_0", userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof ValidationSchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: "validation_step_0", strict: true, schema: ValidationJsonSchema },
  });

  return ValidationSchema.parse(raw);
}

async function runDream(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const system = [
    sysBase(lang),
    lang === "nl"
      ? "Doel: maak een scherpe Droom. Bij bevestiging: zet dream. Vraag of door naar Purpose. Als user door wil: proceed_to_purpose=\"true\"."
      : "Goal: craft a sharp Dream. On confirmation: set dream. Ask to proceed to Purpose. If user wants to proceed: proceed_to_purpose=\"true\".",
    "Velden: action,message,question,refined_formulation,confirmation_question,dream,suggest_dreambuilder,proceed_to_dream,proceed_to_purpose.",
  ].join("\n");

  const user = userEnvelope("dream", userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof DreamSchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: "dream_step", strict: true, schema: DreamJsonSchema },
  });

  return DreamSchema.parse(raw);
}

async function runGenericStep(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  step: StepId,
  labelNl: string,
  labelEn: string,
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const label = lang === "nl" ? labelNl : labelEn;

  const system = [
    sysBase(lang),
    lang === "nl"
      ? `Doel: help de gebruiker met stap ${label}. Maak refined_formulation indien nodig. Bij duidelijke bevestiging: action=CONFIRM, value gevuld, proceed_to_next="true".`
      : `Goal: help the user with step ${label}. Produce refined_formulation if needed. On clear confirmation: action=CONFIRM, value filled, proceed_to_next="true".`,
    "Velden: action,message,question,refined_formulation,confirmation_question,value,proceed_to_next.",
  ].join("\n");

  const user = userEnvelope(step, userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof GenericStepSchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: `generic_${step}`, strict: true, schema: GenericJsonSchema },
  });

  return GenericStepSchema.parse(raw);
}

async function runStrategy(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const system = [
    sysBase(lang),
    lang === "nl"
      ? "Doel: Strategy als 3-5 focuspunten (elk op nieuwe regel). Geen takenlijst. Op bevestiging: strategy gevuld en proceed_to_next=\"true\"."
      : "Goal: Strategy as 3-5 focus points (each on a new line). Not a task list. On confirmation: strategy filled and proceed_to_next=\"true\".",
    "Velden: action,message,question,refined_formulation,confirmation_question,strategy,proceed_to_next.",
  ].join("\n");

  const user = userEnvelope("strategy", userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof StrategySchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: "strategy_step", strict: true, schema: StrategyJsonSchema },
  });

  return StrategySchema.parse(raw);
}

async function runRules(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const system = [
    sysBase(lang),
    lang === "nl"
      ? "Doel: Rules of the game als duidelijke bullets of korte alinea. Op bevestiging: rulesofthegame gevuld en proceed_to_next=\"true\"."
      : "Goal: Rules of the game as clear bullets or short paragraph. On confirmation: rulesofthegame filled and proceed_to_next=\"true\".",
    "Velden: action,message,question,refined_formulation,confirmation_question,rulesofthegame,proceed_to_next.",
  ].join("\n");

  const user = userEnvelope("rulesofthegame", userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof RulesSchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: "rules_step", strict: true, schema: RulesJsonSchema },
  });

  return RulesSchema.parse(raw);
}

async function runPresentation(
  apiKey: string,
  model: string,
  lang: "nl" | "en",
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
) {
  const system = [
    sysBase(lang),
    lang === "nl"
      ? "Doel: presentation brief kort, concreet, in bullets. Op bevestiging: presentation_brief gevuld en proceed_to_next=\"true\"."
      : "Goal: presentation brief short and concrete in bullets. On confirmation: presentation_brief filled and proceed_to_next=\"true\".",
    "Velden: action,message,question,refined_formulation,confirmation_question,presentation_brief,proceed_to_next.",
  ].join("\n");

  const user = userEnvelope("presentation", userMessage, state, showStepIntro);

  const raw = await openaiJson<z.infer<typeof PresentationSchema>>({
    apiKey,
    model,
    system,
    user,
    format: { type: "json_schema", name: "presentation_step", strict: true, schema: PresentationJsonSchema },
  });

  return PresentationSchema.parse(raw);
}

// ---- Main entry ----
export async function runCanvasStep(args: {
  current_step_id: string;
  user_message: string;
  state?: Record<string, any>;
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  // NOTE: Structured Outputs (json_schema) is supported on gpt-4o-mini / gpt-4o-2024-08-06 and later.
  // If you keep OPENAI_MODEL on something else, we will automatically fall back to json_object mode,
  // but schema adherence may become weaker again.
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const incomingState = (args.state ?? {}) as Partial<CanvasState>;
  const merged: CanvasState = {
    ...DEFAULT_STATE,
    ...incomingState,
  };

  const userMessage = args.user_message ?? "";
  const lang = detectLanguage(userMessage, merged);
  merged.language = lang;

  // Normalize step
  const requested = (args.current_step_id || merged.current_step || "step_0") as StepId;
  merged.current_step = requested;

  const showSessionIntro = merged.intro_shown_session !== "true";
  const showStepIntro = merged.intro_shown_for_step !== merged.current_step;

  // ---- run current specialist ----
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

  // Update intro tracking AFTER rendering (kept aligned with your current flow)
  if (showSessionIntro) merged.intro_shown_session = "true";
  if (showStepIntro) merged.intro_shown_for_step = requested;

  merged.active_specialist = specialistName;
  merged.last_specialist_result = specialistJson;

  const text = integrateToText({
    lang,
    showSessionIntro,
    specialistJson,
  });

  return {
    ok: true,
    tool: "run_step",
    version: "agents-v1",
    current_step_id: requested,
    active_specialist: specialistName,
    text,
    specialist: specialistJson,
    state: merged,
  };
}
