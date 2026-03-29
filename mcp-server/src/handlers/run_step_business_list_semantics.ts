import { z } from "zod";

import { __hasInjectedTestClient, callStrictJson, type LLMUsage } from "../core/llm.js";

export const BUSINESS_LIST_TURN_INTENTS = [
  "add",
  "remove",
  "replace",
  "edit",
  "clarify",
  "none",
] as const;

export const BUSINESS_LIST_CLARIFY_REASONS = [
  "missing_target",
  "ambiguous_target",
  "missing_replacement",
  "missing_instruction",
  "none",
] as const;

export type BusinessListTurnIntent = typeof BUSINESS_LIST_TURN_INTENTS[number];
export type BusinessListClarifyReason = typeof BUSINESS_LIST_CLARIFY_REASONS[number];

export const BusinessListTurnSemanticClassificationZodSchema = z.object({
  intent: z.enum(BUSINESS_LIST_TURN_INTENTS),
  target_indexes: z.array(z.number().int().nonnegative()),
  replacement_text: z.string(),
  clarify_reason: z.enum(BUSINESS_LIST_CLARIFY_REASONS),
});

export type BusinessListTurnSemanticClassification =
  z.infer<typeof BusinessListTurnSemanticClassificationZodSchema>;

export type ClassifyBusinessListTurnParams = {
  model: string;
  stepId: string;
  userMessage: string;
  referenceItems: string[];
  language?: string;
};

export type ClassifyBusinessListTurnResult = {
  classification: BusinessListTurnSemanticClassification;
  attempts: number;
  usage: LLMUsage;
  model: string;
  source: "llm" | "fallback";
};

const BusinessListTurnSemanticClassificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "target_indexes", "replacement_text", "clarify_reason"],
  properties: {
    intent: { type: "string", enum: BUSINESS_LIST_TURN_INTENTS },
    target_indexes: {
      type: "array",
      items: { type: "integer", minimum: 0 },
    },
    replacement_text: { type: "string" },
    clarify_reason: { type: "string", enum: BUSINESS_LIST_CLARIFY_REASONS },
  },
} as const;

const BUSINESS_LIST_TURN_CLASSIFIER_INSTRUCTIONS = `BUSINESS-LIST TURN CLASSIFIER, STRICT JSON, MULTI-LANGUAGE, NO KEYWORD HEURISTICS

Role
You classify the latest user turn for an existing accepted business-list step such as Strategy, Products and Services, or Rules of the Game.
You are not user-facing. Output strict JSON only.

Goal
Determine whether the user is adding new list content, removing existing items, replacing one item, asking to rewrite one item, needing clarification, or talking about something else entirely.

Output schema
{
  "intent": "add" | "remove" | "replace" | "edit" | "clarify" | "none",
  "target_indexes": number[],
  "replacement_text": "string",
  "clarify_reason": "missing_target" | "ambiguous_target" | "missing_replacement" | "missing_instruction" | "none"
}

Inputs
You receive:
- STEP_ID
- USER_MESSAGE
- REFERENCE_ITEMS_JSON (zero-based indexes)
- optionally LANGUAGE

Decision rules
- Use semantic understanding in any language. Do not rely on keyword lists or literal phrase matching.
- "add" means the user is supplying new step content, source material, or a new list item, not editing an existing accepted item.
- "remove" means the user clearly wants one or more existing REFERENCE_ITEMS removed. Output the zero-based target indexes.
- "replace" means the user clearly wants exactly one existing REFERENCE_ITEM replaced with a concrete replacement_text.
- "edit" means the user clearly wants exactly one existing REFERENCE_ITEM rewritten, sharpened, or adjusted, but has not supplied a concrete finished replacement_text.
- "clarify" means the user is trying to mutate the existing list but the target or replacement is too unclear to act on safely.
- "none" means the user is talking about another step, giving meta commentary, or otherwise should not trigger a local mutation of this list.

Guardrails
- If the user is talking about another step or another concept than the current STEP_ID, prefer "none".
- Never infer remove/replace/edit unless the meaning is clearly about existing REFERENCE_ITEMS.
- Prefer "none" or "clarify" over over-claiming a local mutation.
- For "remove", one or more target indexes may be valid.
- For "replace" and "edit", output exactly one target index when clear.
- Use "clarify_reason" = "none" for "add", "remove", "replace", "edit", or "none".
- Use "replacement_text" only for "replace"; otherwise return "".
- When the user is trying to replace but no replacement is actually given, use "clarify" with "missing_replacement".
- When the user is trying to edit/remove/replace but the referenced current item is unclear, use "clarify" with "missing_target" or "ambiguous_target".
- Return target indexes only when they can be grounded directly in REFERENCE_ITEMS_JSON.

Return JSON only.`;

function emptyUsage(): LLMUsage {
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    provider_available: false,
  };
}

function fallbackClassification(): BusinessListTurnSemanticClassification {
  return {
    intent: "add",
    target_indexes: [],
    replacement_text: "",
    clarify_reason: "none",
  };
}

function buildPlannerInput(params: ClassifyBusinessListTurnParams): string {
  const lines = [
    `STEP_ID: ${String(params.stepId || "").trim()}`,
    `USER_MESSAGE: ${String(params.userMessage || "").trim()}`,
    `REFERENCE_ITEMS_JSON: ${JSON.stringify(params.referenceItems || [])}`,
  ];
  const language = String(params.language || "").trim();
  if (language) lines.push(`LANGUAGE: ${language}`);
  return lines.join("\n");
}

export async function classifyBusinessListTurn(
  params: ClassifyBusinessListTurnParams
): Promise<ClassifyBusinessListTurnResult> {
  const userMessage = String(params.userMessage || "").trim();
  if (!userMessage) {
    return {
      classification: fallbackClassification(),
      attempts: 0,
      usage: emptyUsage(),
      model: params.model,
      source: "fallback",
    };
  }

  if (
    process.env.TS_NODE_TRANSPILE_ONLY === "true" &&
    process.env.RUN_INTEGRATION_TESTS !== "1" &&
    !__hasInjectedTestClient()
  ) {
    return {
      classification: fallbackClassification(),
      attempts: 0,
      usage: emptyUsage(),
      model: params.model,
      source: "fallback",
    };
  }

  const res = await callStrictJson<BusinessListTurnSemanticClassification>({
    model: params.model,
    instructions: BUSINESS_LIST_TURN_CLASSIFIER_INSTRUCTIONS,
    plannerInput: buildPlannerInput(params),
    schemaName: "BusinessListTurnClassifier",
    jsonSchema: BusinessListTurnSemanticClassificationJsonSchema as any,
    zodSchema: BusinessListTurnSemanticClassificationZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 180,
    debugLabel: "BusinessListTurnClassifier",
  });

  return {
    classification: res.data,
    attempts: res.attempts,
    usage: res.usage,
    model: params.model,
    source: "llm",
  };
}
