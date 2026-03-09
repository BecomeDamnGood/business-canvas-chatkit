import { z } from "zod";

import { __hasInjectedTestClient, callStrictJson, type LLMUsage } from "../core/llm.js";

export const ACCEPTED_OUTPUT_USER_TURN_KINDS = [
  "step_variant",
  "raw_source_content",
  "feedback_on_existing_content",
  "rejection_without_replacement",
  "accept_existing_suggestion",
  "unclear",
] as const;

export type AcceptedOutputUserTurnKind = typeof ACCEPTED_OUTPUT_USER_TURN_KINDS[number];

export const AcceptedOutputUserTurnZodSchema = z.object({
  turn_kind: z.enum(ACCEPTED_OUTPUT_USER_TURN_KINDS),
  user_variant_is_stepworthy: z.boolean(),
});

export type AcceptedOutputUserTurnClassification = z.infer<typeof AcceptedOutputUserTurnZodSchema>;

export const AcceptedOutputUserTurnJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["turn_kind", "user_variant_is_stepworthy"],
  properties: {
    turn_kind: {
      type: "string",
      enum: ACCEPTED_OUTPUT_USER_TURN_KINDS,
    },
    user_variant_is_stepworthy: { type: "boolean" },
  },
} as const;

export type ClassifyAcceptedOutputUserTurnParams = {
  model: string;
  stepId: string;
  userMessage: string;
  currentAcceptedValue?: string;
  pendingSuggestion?: string;
  pendingUserVariant?: string;
  language?: string;
};

export type ClassifyAcceptedOutputUserTurnResult = {
  classification: AcceptedOutputUserTurnClassification;
  attempts: number;
  usage: LLMUsage;
  model: string;
  source: "llm" | "fallback";
};

const ACCEPTED_OUTPUT_CLASSIFIER_INSTRUCTIONS = `ACCEPTED-OUTPUT USER TURN CLASSIFIER, STRICT JSON, MULTI-LANGUAGE, NO KEYWORD HEURISTICS

Role
You classify the semantic role of the latest user turn for a single-value accepted-output step.
You are not user-facing. Output strict JSON only.

Goal
Determine whether the latest user text is already a displayable candidate value for the step itself, or whether it is still source material, feedback, rejection, acceptance, or unclear.

Output schema
{
  "turn_kind": "step_variant" | "raw_source_content" | "feedback_on_existing_content" | "rejection_without_replacement" | "accept_existing_suggestion" | "unclear",
  "user_variant_is_stepworthy": boolean
}

Inputs
You receive:
- STEP_ID
- USER_MESSAGE
- optionally CURRENT_ACCEPTED_VALUE
- optionally PENDING_SUGGESTION
- optionally PENDING_USER_VARIANT
- optionally LANGUAGE

Decision rules
- Use semantic understanding in any language. Do not rely on keyword lists or literal phrase matching.
- Return "step_variant" only when USER_MESSAGE itself can already be shown verbatim as a plausible candidate value for the current step, without needing the agent to rewrite or normalize it first.
- Return "raw_source_content" when USER_MESSAGE contains intent, wishes, explanation, motivation, examples, ingredients, or source material that still needs agent reformulation before it can be shown as a candidate step value.
- Return "feedback_on_existing_content" when USER_MESSAGE comments on wording, tone, positivity, precision, direction, or requested adjustments to existing content in CURRENT_ACCEPTED_VALUE or PENDING_SUGGESTION.
- Return "rejection_without_replacement" when USER_MESSAGE rejects the current interpretation but does not itself provide a replacement candidate value.
- Return "accept_existing_suggestion" when USER_MESSAGE clearly accepts the current suggestion or current accepted value.
- Return "unclear" when the meaning is too ambiguous to classify confidently. Prefer "unclear" over over-claiming "step_variant".

Stepworthiness rule
- user_variant_is_stepworthy must be true only when turn_kind is "step_variant".
- For Dream: true only if USER_MESSAGE already reads like a formulated Dream statement, not just raw desire, topic, benefit, explanation, or source material.
- For Role: true only if USER_MESSAGE already states a business role/positioning contribution, not just rejection, feedback, explanation, or a rough label that still needs reformulation.
- For other single-value accepted-output steps: true only if USER_MESSAGE already functions as a direct candidate formulation for that step.

Important guardrails
- If CURRENT_ACCEPTED_VALUE or PENDING_SUGGESTION exists and USER_MESSAGE mainly refers back to that existing content, classify as feedback, rejection, or acceptance rather than "step_variant".
- If USER_MESSAGE contains both rejection/feedback and a clear replacement candidate, classify based on the replacement candidate: use "step_variant" only when that replacement is itself already stepworthy; otherwise use "raw_source_content".
- Never mark raw source material, feedback, or rejection as stepworthy.

Return JSON only.`;

function emptyUsage(): LLMUsage {
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    provider_available: false,
  };
}

function fallbackClassification(): AcceptedOutputUserTurnClassification {
  return {
    turn_kind: "unclear",
    user_variant_is_stepworthy: false,
  };
}

function buildPlannerInput(params: ClassifyAcceptedOutputUserTurnParams): string {
  const lines = [
    `STEP_ID: ${String(params.stepId || "").trim()}`,
    `USER_MESSAGE: ${String(params.userMessage || "").trim()}`,
    `CURRENT_ACCEPTED_VALUE: ${String(params.currentAcceptedValue || "").trim()}`,
    `PENDING_SUGGESTION: ${String(params.pendingSuggestion || "").trim()}`,
    `PENDING_USER_VARIANT: ${String(params.pendingUserVariant || "").trim()}`,
  ];
  const language = String(params.language || "").trim();
  if (language) lines.push(`LANGUAGE: ${language}`);
  return lines.join("\n");
}

export async function classifyAcceptedOutputUserTurn(
  params: ClassifyAcceptedOutputUserTurnParams
): Promise<ClassifyAcceptedOutputUserTurnResult> {
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

  const res = await callStrictJson<AcceptedOutputUserTurnClassification>({
    model: params.model,
    instructions: ACCEPTED_OUTPUT_CLASSIFIER_INSTRUCTIONS,
    plannerInput: buildPlannerInput(params),
    schemaName: "AcceptedOutputUserTurnClassifier",
    jsonSchema: AcceptedOutputUserTurnJsonSchema as any,
    zodSchema: AcceptedOutputUserTurnZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 120,
    debugLabel: "AcceptedOutputUserTurnClassifier",
  });

  return {
    classification: res.data,
    attempts: res.attempts,
    usage: res.usage,
    model: params.model,
    source: "llm",
  };
}
