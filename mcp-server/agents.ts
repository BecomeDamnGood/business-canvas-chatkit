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
  | "targetgroup"
  | "productsservices"
  | "rulesofthegame"
  | "presentation";

type BoolStr = "true" | "false";

export type CanvasState = {
  current_step: StepId;
  intro_shown_for_step: StepId | "";
  intro_shown_session: BoolStr;

  active_specialist: string;

  // language hint coming from UI (e.g. "nl" / "en")
  language?: string;

  // stored baseline
  business_name?: string; // must never be empty; use "TBD" if unknown
  step_0?: string; // "Venture: <venture_type> | Name: <business_name_or_TBD>"

  // step values
  dream?: string;
  purpose?: string;
  bigwhy?: string;
  role?: string;
  entity?: string;
  strategy?: string;
  targetgroup?: string;
  productsservices?: string;
  rulesofthegame?: string;
  presentation_brief?: string;

  // last specialist output (for readiness moment)
  last_specialist_result?: any;
};

const DEFAULT_STATE: CanvasState = {
  current_step: "step_0",
  intro_shown_for_step: "",
  intro_shown_session: "false",
  active_specialist: "",
  language: undefined,
  business_name: undefined,
  step_0: undefined,
  last_specialist_result: undefined,
};

// -------------------- SCHEMAS (match project logic: NO extra fields) --------------------
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

const GenericSchema = z.object({
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

// -------------------- JSON SCHEMA (Responses API structured outputs) --------------------
type JsonSchema = Record<string, any>;

function strictObjectSchema(name: string, properties: Record<string, any>, required: string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    title: name,
    properties,
    required,
  };
}

const STR = { type: "string" };
const ACTION = { type: "string", enum: [...ActionEnum] };
const BOOLSTR = { type: "string", enum: ["true", "false"] };

const ValidationJsonSchema = strictObjectSchema(
  "ValidationAndBusinessName",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    business_name: STR,
    proceed_to_dream: BOOLSTR,
    step_0: STR,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "business_name", "proceed_to_dream", "step_0"]
);

const DreamJsonSchema = strictObjectSchema(
  "Dream",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    dream: STR,
    suggest_dreambuilder: BOOLSTR,
    proceed_to_dream: BOOLSTR,
    proceed_to_purpose: BOOLSTR,
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
  "GenericStep",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    value: STR,
    proceed_to_next: BOOLSTR,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "value", "proceed_to_next"]
);

const StrategyJsonSchema = strictObjectSchema(
  "Strategy",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    strategy: STR,
    proceed_to_next: BOOLSTR,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "strategy", "proceed_to_next"]
);

const RulesJsonSchema = strictObjectSchema(
  "RulesOfTheGame",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    rulesofthegame: STR,
    proceed_to_next: BOOLSTR,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "rulesofthegame", "proceed_to_next"]
);

const PresentationJsonSchema = strictObjectSchema(
  "Presentation",
  {
    action: ACTION,
    message: STR,
    question: STR,
    refined_formulation: STR,
    confirmation_question: STR,
    presentation_brief: STR,
    proceed_to_next: BOOLSTR,
  },
  ["action", "message", "question", "refined_formulation", "confirmation_question", "presentation_brief", "proceed_to_next"]
);

// -------------------- intro text base (translated by model when show_session_intro=true) --------------------
const SESSION_INTRO_EN =
  "Welcome to The Business Strategy Canvas Builder, used in national and international organizations. " +
  "We will go through a small number of steps, one by one, so each step is clear before we move on. " +
  "At the end you will have a complete and concise business plan, ready as direction for yourself and as a clear presentation for external stakeholders, partners, or team members.";

// -------------------- OpenAI Responses structured outputs --------------------
type OpenAIDebug = { response_id?: string; http_status?: number; parse_error?: string; output_preview?: string };

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

// -------------------- helpers --------------------
function nextStepOf(step: StepId): StepId {
  const order: StepId[] = [
    "step_0",
    "dream",
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
    "presentation",
  ];
  const idx = order.indexOf(step);
  if (idx < 0) return "step_0";
  return order[Math.min(idx + 1, order.length - 1)];
}

function isClearYes(userMessage: string, lang?: string): boolean {
  const t = (userMessage || "").trim().toLowerCase();
  if (!t) return false;

  // keep it strict (1-6 words rule of thumb)
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) return false;

  const yesSet = new Set(["yes", "yep", "yeah", "sure", "ok", "okay", "proceed", "lets go", "let's go", "go"]);
  if (yesSet.has(t)) return true;
  if (t === "y" || t === "1") return true;
  return false;
}

function buildTextForWidget(specialistJson: any): string {
  const parts: string[] = [];
  const msg = String(specialistJson?.message ?? "").trim();
  const refined = String(specialistJson?.refined_formulation ?? "").trim();
  if (msg) parts.push(msg);
  if (refined) parts.push(refined);
  return parts.filter(Boolean).join("\n\n");
}

function pickPrompt(specialistJson: any): string {
  const confirmQ = String(specialistJson?.confirmation_question ?? "").trim();
  const q = String(specialistJson?.question ?? "").trim();
  return confirmQ || q || "";
}

// -------------------- SYSTEM PROMPTS (lift logic 1:1; language mirrored; intro gate) --------------------
function baseRules(showSessionIntro: boolean): string {
  return [
    "MULTI-LANGUAGE HARD RULE:",
    "- Write ALL user-facing strings in the same language as the user's input (USER_MESSAGE).",
    "- If USER_MESSAGE is empty, mirror STATE_LANGUAGE (nl/en) if provided.",
    "- Do not mix languages.",
    "- Use informal address in that language.",
    "",
    "STRICT JSON RULE:",
    "- Output valid JSON only. No markdown. No extra keys. No trailing comments. No null values.",
    "- All schema fields are required. If not applicable, use empty string \"\".",
    "",
    "SESSION INTRO RULE (CRITICAL):",
    showSessionIntro
      ? `- Prepend the following intro translated into the output language into the MESSAGE field (exact meaning, professional tone):\n${SESSION_INTRO_EN}\n- After that, continue normal step logic.\n`
      : "- MESSAGE must NOT include the session intro (leave it out entirely).",
  ].join("\n");
}

function validationSystem(showSessionIntro: boolean): string {
  return [
    "VALIDATION AND BUSINESS NAME AGENT (STEP 1: Validation & Business Name) EXECUTIVE COACH STYLE",
    baseRules(showSessionIntro),
    "",
    "Inputs you receive:",
    "- CURRENT_STEP_ID: step_0",
    "- USER_MESSAGE: the exact user message text",
    "- STATE_LANGUAGE: (nl/en) optional",
    "- STORED_STEP_0: last known step_0 storage line (may be empty)",
    "- STORED_BUSINESS_NAME: last known business name (may be empty)",
    "- PREV_ACTION and PREV_CONFIRMATION_QUESTION: to detect readiness moment",
    "",
    "Hard rules:",
    "Never output null. Use \"\" instead.",
    "business_name must NEVER be empty. If unknown, it must be \"TBD\".",
    "proceed_to_dream must always be \"true\" or \"false\" (string).",
    "Never invent details. Only restate what the user actually said OR what is stored.",
    "Keep it short. One question only.",
    "",
    "What Step 1 must accomplish:",
    "Step 1 must confirm two basics:",
    "1) Baseline venture: what the user is starting or running (broad is fine).",
    "2) Business name: the name if provided, otherwise \"TBD\".",
    "",
    "Step 1 storage format (CRITICAL):",
    "step_0 must be plain text (NOT mini-JSON). Store venture type and business name in one short, stable line using this exact pattern:",
    "\"Venture: <venture_type> | Name: <business_name_or_TBD>\"",
    "venture_type must be 1 to 3 words, in the user’s language.",
    "step_0 must never contain line breaks and never contain double quotes.",
    "",
    "CONFIRM output requirement (MUST):",
    "Whenever action is \"CONFIRM\", step_0 must NOT be empty and must follow the exact storage pattern.",
    "",
    "Readiness moment proceed trigger (CRITICAL):",
    "A readiness moment exists when the previous assistant output asked the user to confirm the Step 1 basics and whether to start Dream now (i.e. previous action was CONFIRM and previous confirmation_question was non-empty).",
    "If USER_MESSAGE intent is clearly YES/proceed (often short, 1 to 6 words), then output:",
    "action:\"CONFIRM\", message:\"\", question:\"\", refined_formulation:\"\", confirmation_question:\"\", proceed_to_dream:\"true\", business_name: keep stored known name or \"TBD\", step_0: keep the stored step_0 line.",
    "",
    "Normal Step 1 logic:",
    "- If venture baseline is not known: action:\"ASK\" and ask ONE combined question asking BOTH: (1) what type of venture it is and (2) what the name is, or whether it is still \"TBD\".",
    "- If baseline is known but name is not known: action:\"ASK\" and ask for the name, explicitly allowing \"TBD\".",
    "- If baseline is known AND name is known (or explicitly \"TBD\"): action:\"CONFIRM\" and set confirmation_question to a readiness question that first restates the venture+name as a statement, then asks confirmation + readiness in this exact pattern:",
    "  EN pattern: \"<Statement>. Is that correct, and if so are you ready to start the first step, 'Your Dream'?\"",
    "  Localized equivalent must be consistent, e.g. the same meaning as: \"<Statement>. Is that correct, and are you ready to start the first step, 'Your Dream'?\"",
  ].join("\n");
}

function dreamSystem(showStepIntro: boolean): string {
  // keep it minimal but scope-guarded; still strict JSON
  return [
    "DREAM AGENT (STEP: DREAM) EXECUTIVE COACH STYLE",
    baseRules(false),
    "",
    "Scope guard (HARD): Handle ONLY the Dream step. Never switch steps.",
    "If the user asks something clearly unrelated to Dream, use action:\"ESCAPE\" and ask one short question to continue with Dream.",
    "",
    "You will receive stored baseline from Step 1 in STORED_STEP_0 (venture + name).",
    showStepIntro ? "You may briefly explain what 'Dream' means in MESSAGE (short), then ask the Dream question." : "Do not add an extra step intro.",
    "",
    "Output the Dream JSON schema exactly.",
  ].join("\n");
}

function genericSystem(stepLabelEn: string): string {
  return [
    `${stepLabelEn.toUpperCase()} AGENT EXECUTIVE COACH STYLE`,
    baseRules(false),
    "",
    `Scope guard: Handle ONLY '${stepLabelEn}'.`,
    "If off-topic, use action:\"ESCAPE\" and ask one short question to continue with this step.",
  ].join("\n");
}

// -------------------- runners --------------------
async function runValidationAgent(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showSessionIntro: boolean
): Promise<{ value: z.infer<typeof ValidationSchema>; debug?: OpenAIDebug }> {
  const system = validationSystem(showSessionIntro);

  const prev = state.last_specialist_result || {};
  const user = [
    `CURRENT_STEP_ID: step_0`,
    `USER_MESSAGE: ${userMessage}`,
    `STATE_LANGUAGE: ${state.language ?? ""}`,
    `STORED_STEP_0: ${state.step_0 ?? ""}`,
    `STORED_BUSINESS_NAME: ${state.business_name ?? ""}`,
    `PREV_ACTION: ${prev.action ?? ""}`,
    `PREV_CONFIRMATION_QUESTION: ${prev.confirmation_question ?? ""}`,
  ].join("\n");

  const { parsed, debug } = await callOpenAIJson({
    apiKey,
    model,
    system,
    user,
    jsonSchema: ValidationJsonSchema,
  });

  return { value: ValidationSchema.parse(parsed), debug };
}

async function runDreamAgent(
  apiKey: string,
  model: string,
  userMessage: string,
  state: CanvasState,
  showStepIntro: boolean
): Promise<{ value: z.infer<typeof DreamSchema>; debug?: OpenAIDebug }> {
  const system = dreamSystem(showStepIntro);
  const user = [
    `CURRENT_STEP_ID: dream`,
    `USER_MESSAGE: ${userMessage}`,
    `STATE_LANGUAGE: ${state.language ?? ""}`,
    `STORED_STEP_0: ${state.step_0 ?? ""}`,
    `STORED_BUSINESS_NAME: ${state.business_name ?? ""}`,
    `STORED_DREAM: ${state.dream ?? ""}`,
  ].join("\n");

  const { parsed, debug } = await callOpenAIJson({
    apiKey,
    model,
    system,
    user,
    jsonSchema: DreamJsonSchema,
  });

  return { value: DreamSchema.parse(parsed), debug };
}

async function runGenericAgent(
  apiKey: string,
  model: string,
  stepLabelEn: string,
  userMessage: string,
  state: CanvasState,
  jsonSchema: JsonSchema,
  zodSchema: any
): Promise<{ value: any; debug?: OpenAIDebug }> {
  const system = genericSystem(stepLabelEn);
  const user = [
    `CURRENT_STEP_ID: ${state.current_step}`,
    `USER_MESSAGE: ${userMessage}`,
    `STATE_LANGUAGE: ${state.language ?? ""}`,
    `STORED_STEP_0: ${state.step_0 ?? ""}`,
  ].join("\n");

  const { parsed, debug } = await callOpenAIJson({
    apiKey,
    model,
    system,
    user,
    jsonSchema,
  });

  return { value: zodSchema.parse(parsed), debug };
}

// -------------------- MAIN ENTRY --------------------
export async function runCanvasStep(args: {
  current_step_id: string;
  user_message: string;
  state?: Record<string, any>;
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const incomingState = (args.state ?? {}) as Partial<CanvasState>;
  const state: CanvasState = { ...DEFAULT_STATE, ...incomingState };

  // prefer incoming current_step_id if provided
  const requested = (args.current_step_id || state.current_step || "step_0") as StepId;
  state.current_step = requested;

  const userMessage = (args.user_message ?? "").trim();

  // SESSION INTRO must show exactly once per session
  const showSessionIntro = state.intro_shown_session !== "true";

  // avoid infinite chains
  const MAX_HOPS = 3;
  let hops = 0;

  let activeSpecialist = "";
  let specialistJson: any = null;

  // deterministic readiness gating for Step 1:
  // only proceed if previous output was a readiness question AND we already have a stored step_0 line.
  const prev = state.last_specialist_result || {};
  const readinessAsked =
    state.current_step === "step_0" &&
    prev?.action === "CONFIRM" &&
    typeof prev?.confirmation_question === "string" &&
    prev.confirmation_question.trim() !== "" &&
    prev?.proceed_to_dream === "false";

  const canProceedFromStep0 = readinessAsked && isClearYes(userMessage, state.language) && !!state.step_0;

  // Chain: step_0 "clear yes" => proceed_to_dream => immediately run Dream in same tool call
  while (hops < MAX_HOPS) {
    hops++;

    if (state.current_step === "step_0") {
      activeSpecialist = "ValidationAndBusinessName";

      if (canProceedFromStep0) {
        // exact proceed payload (no extra text)
        specialistJson = {
          action: "CONFIRM",
          message: "",
          question: "",
          refined_formulation: "",
          confirmation_question: "",
          business_name: state.business_name ?? "TBD",
          proceed_to_dream: "true",
          step_0: state.step_0 ?? "",
        };
      } else {
        const r = await runValidationAgent(apiKey, model, userMessage, state, showSessionIntro);
        specialistJson = r.value;

        // store baseline
        state.business_name = specialistJson.business_name || "TBD";
        state.step_0 = specialistJson.step_0 || state.step_0 || "";
      }

      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      // mark intro flags
      if (showSessionIntro) state.intro_shown_session = "true";
      if (state.intro_shown_for_step !== "step_0") state.intro_shown_for_step = "step_0";

      // only hop to Dream when proceed_to_dream is true
      if (specialistJson.proceed_to_dream === "true") {
        state.current_step = "dream";
        // continue loop to run Dream immediately
        continue;
      }

      break;
    }

    if (state.current_step === "dream") {
      activeSpecialist = "Dream";
      const showStepIntro = state.intro_shown_for_step !== "dream";

      const r = await runDreamAgent(apiKey, model, userMessage, state, showStepIntro);
      specialistJson = r.value;

      state.dream = specialistJson.dream || state.dream || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (showStepIntro) state.intro_shown_for_step = "dream";

      if (specialistJson.proceed_to_purpose === "true") {
        state.current_step = "purpose";
        continue;
      }

      break;
    }

    if (state.current_step === "purpose") {
      activeSpecialist = "Purpose";
      const r = await runGenericAgent(apiKey, model, "Purpose", userMessage, state, GenericJsonSchema, GenericSchema);
      specialistJson = r.value;

      state.purpose = specialistJson.value || state.purpose || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "bigwhy") {
      activeSpecialist = "BigWhy";
      const r = await runGenericAgent(apiKey, model, "Big Why", userMessage, state, GenericJsonSchema, GenericSchema);
      specialistJson = r.value;

      state.bigwhy = specialistJson.value || state.bigwhy || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "role") {
      activeSpecialist = "Role";
      const r = await runGenericAgent(apiKey, model, "Role", userMessage, state, GenericJsonSchema, GenericSchema);
      specialistJson = r.value;

      state.role = specialistJson.value || state.role || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "entity") {
      activeSpecialist = "Entity";
      const r = await runGenericAgent(apiKey, model, "Entity", userMessage, state, GenericJsonSchema, GenericSchema);
      specialistJson = r.value;

      state.entity = specialistJson.value || state.entity || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "strategy") {
      activeSpecialist = "Strategy";
      const r = await runGenericAgent(apiKey, model, "Strategy", userMessage, state, StrategyJsonSchema, StrategySchema);
      specialistJson = r.value;

      state.strategy = specialistJson.strategy || state.strategy || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "rulesofthegame") {
      activeSpecialist = "RulesOfTheGame";
      const r = await runGenericAgent(apiKey, model, "Rules of the game", userMessage, state, RulesJsonSchema, RulesSchema);
      specialistJson = r.value;

      state.rulesofthegame = specialistJson.rulesofthegame || state.rulesofthegame || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      if (specialistJson.proceed_to_next === "true") state.current_step = nextStepOf(state.current_step);
      break;
    }

    if (state.current_step === "presentation") {
      activeSpecialist = "Presentation";
      const r = await runGenericAgent(apiKey, model, "Presentation", userMessage, state, PresentationJsonSchema, PresentationSchema);
      specialistJson = r.value;

      state.presentation_brief = specialistJson.presentation_brief || state.presentation_brief || "";
      state.active_specialist = activeSpecialist;
      state.last_specialist_result = specialistJson;

      break;
    }

    // fallback to step_0
    state.current_step = "step_0";
  }

  return {
    ok: true,
    tool: "run_step",
    current_step_id: state.current_step,
    active_specialist: activeSpecialist,
    // UI uses these:
    text: buildTextForWidget(specialistJson),
    prompt: pickPrompt(specialistJson),
    specialist: specialistJson,
    state,
  };
}
