// src/core/llm.ts
import { z } from "zod";
import { OpenAI } from "openai";
import { composeInstructionsWithGlossary } from "./glossary.js";

/** Instance type to avoid "Cannot use namespace 'OpenAI' as a type" (OpenAI is class + namespace). */
type OpenAIClient = InstanceType<typeof OpenAI>;

export type StrictJsonSchema = {
  type: "object";
  additionalProperties: boolean;
  // allow readonly arrays (when schemas are defined with `as const`)
  required: readonly string[];
  properties: Record<string, any>;
};

export type StrictJsonCallArgs<T> = {
  model: string;
  /**
   * System instructions (English-only instructions, but output strings must match user language)
   */
  instructions: string;
  /**
   * The planner input you pass to the specialist, e.g.
   * "CURRENT_STEP_ID: step_0 | USER_MESSAGE: Ik heb..."
   */
  plannerInput: string;

  /**
   * OpenAI structured output parameters
   */
  schemaName: string;
  jsonSchema: StrictJsonSchema;

  /**
   * Zod validator for final safety check
   */
  zodSchema: z.ZodType<T>;

  /**
   * Model settings
   */
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;

  /**
   * Debug label that you can log upstream (e.g., specialist name)
   */
  debugLabel?: string;
};

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing env OPENAI_API_KEY");
  return apiKey;
}

let _client: OpenAIClient | null = null;
function getClient(): OpenAIClient {
  if (_client) return _client;
  _client = new OpenAI({ apiKey: getApiKey() });
  return _client;
}

function extractOutputText(resp: any): string {
  // Responses API provides output_text at top level
  if (typeof resp?.output_text === "string" && resp.output_text.trim().length) {
    return resp.output_text.trim();
  }

  // Fallback: attempt to reconstruct from output array
  const out = resp?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim().length) return t.trim();
        }
      }
    }
  }

  throw new Error("OpenAI response did not contain output_text");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    const trimmed = text.trim();
    if (trimmed !== text) return JSON.parse(trimmed);
    throw e;
  }
}

const GLOSSARY_DEBUG = process.env.LOCAL_DEV === "1" || process.env.GLOSSARY_DEBUG === "1";

function parseRetryAfterMs(value: unknown, msg: string): number | null {
  const raw = typeof value === "number" || typeof value === "string" ? String(value) : "";
  if (raw) {
    const n = Number(raw);
    if (!isNaN(n) && n > 0) {
      return n < 1000 ? Math.round(n * 1000) : Math.round(n);
    }
  }
  const fromMsg = msg.match(/retry after\\s*(\\d+(?:\\.\\d+)?)\\s*(ms|s)?/i);
  if (fromMsg && fromMsg[1]) {
    const n = Number(fromMsg[1]);
    if (!isNaN(n) && n > 0) {
      const unit = (fromMsg[2] || "ms").toLowerCase();
      return unit === "s" ? Math.round(n * 1000) : Math.round(n);
    }
  }
  return null;
}

async function callOnceStrictJson(args: Omit<StrictJsonCallArgs<any>, "zodSchema">) {
  const client = getClient();
  const instructionsWithGlossary = composeInstructionsWithGlossary(args.instructions);
  if (GLOSSARY_DEBUG) {
    const preview = instructionsWithGlossary.slice(0, 300);
    console.error("[llm] GLOBAL_GLOSSARY present in prompt; preview:", preview.replace(/\n/g, " ").trim() + "...");
  }

  try {
    const resp = await client.responses.create({
      model: args.model,
      input: [
        { role: "system", content: instructionsWithGlossary },
        { role: "user", content: args.plannerInput },
      ],

      // ✅ IMPORTANT FIX:
      // In the Responses API, `response_format` moved to `text.format`.
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          strict: true,
          schema: args.jsonSchema,
        },
      },

      temperature: args.temperature ?? 0.2,
      top_p: args.topP ?? 1,
      max_output_tokens: args.maxOutputTokens ?? 2048,
    });

    const text = extractOutputText(resp);
    const parsed = safeJsonParse(text);

    return { text, parsed };
  } catch (e: any) {
    const msg =
      e?.message ||
      e?.error?.message ||
      e?.error?.toString?.() ||
      "OpenAI API error";
    const err = new Error(msg);
    const status = e?.status ?? e?.response?.status ?? e?.error?.status;
    const code = e?.code ?? e?.error?.code ?? e?.error?.type ?? e?.type;
    const type = e?.type ?? e?.error?.type;
    const isRateLimited =
      status === 429 ||
      code === "rate_limit_exceeded" ||
      type === "rate_limit_exceeded";
    if (isRateLimited) {
      const retryFromHeader =
        e?.response?.headers?.["retry-after"] ||
        e?.response?.headers?.["retry-after-ms"] ||
        e?.error?.headers?.["retry-after"];
      const retryAfterMs = parseRetryAfterMs(retryFromHeader, msg) ?? 1500;
      (err as any).rate_limited = true;
      (err as any).retry_after_ms = retryAfterMs;
      (err as any).status = status;
      (err as any).code = code;
      (err as any).type = type;
    }
    (err as any).meta = { body: e, debugLabel: args.debugLabel };
    throw err;
  }
}

/**
 * Strict JSON call:
 * - Enforces json_schema strict at the source (prevents null/boolean drift)
 * - Validates with Zod
 * - On failure: 1 repair pass, same strict schema
 */
export async function callStrictJson<T>(
  args: StrictJsonCallArgs<T>
): Promise<{
  data: T;
  rawText: string;
  attempts: number;
}> {
  const debugLabel = args.debugLabel ?? args.schemaName;

  // Attempt 1
  const attempt1 = await callOnceStrictJson({
    model: args.model,
    instructions: args.instructions,
    plannerInput: args.plannerInput,
    schemaName: args.schemaName,
    jsonSchema: args.jsonSchema,
    temperature: args.temperature,
    topP: args.topP,
    maxOutputTokens: args.maxOutputTokens,
    debugLabel,
  });

  const parsed1 = args.zodSchema.safeParse(attempt1.parsed);
  if (parsed1.success) {
    return { data: parsed1.data, rawText: attempt1.text, attempts: 1 };
  }

  // Repair pass (Attempt 2)
  const repairInstructions = `${args.instructions}

REPAIR MODE (HARD)
- You must fix the JSON to match the schema exactly.
- Output ONLY valid JSON. No extra keys. No markdown. No commentary.
- All fields required; never output null; use "".
- Enums must match exactly (including casing).
- proceed flags must be strings ("true"/"false") as specified.
`;

  const repairPlannerInput = `The previous output did not validate against the schema.

ZOD_ERROR:
${parsed1.error.toString()}

INVALID_JSON_OUTPUT:
${attempt1.text}

Now return a corrected JSON output that matches the schema exactly.`;

  const attempt2 = await callOnceStrictJson({
    model: args.model,
    instructions: repairInstructions,
    plannerInput: repairPlannerInput,
    schemaName: args.schemaName,
    jsonSchema: args.jsonSchema,
    temperature: args.temperature ?? 0.0, // make repair deterministic
    topP: args.topP ?? 1,
    maxOutputTokens: args.maxOutputTokens ?? 2048,
    debugLabel: `${debugLabel}:repair`,
  });

  const parsed2 = args.zodSchema.safeParse(attempt2.parsed);
  if (parsed2.success) {
    return { data: parsed2.data, rawText: attempt2.text, attempts: 2 };
  }

  const err = new Error(`Strict JSON call failed after repair pass for ${debugLabel}.`);
  (err as any).meta = {
    debugLabel,
    attempt1_text: attempt1.text,
    attempt1_zod_error: parsed1.error.toString(),
    attempt2_text: attempt2.text,
    attempt2_zod_error: parsed2.error.toString(),
  };
  throw err;
}
