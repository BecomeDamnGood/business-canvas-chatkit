import { z } from "zod";

import { __hasInjectedTestClient, callStrictJson, type LLMUsage } from "../core/llm.js";

export const TURN_SEMANTIC_PENDING_COMPARE_INTENTS = [
  "accept_suggestion_explicit",
  "reject_suggestion_explicit",
  "feedback_on_suggestion",
  "content_input",
] as const;

export type PendingCompareTextIntent = typeof TURN_SEMANTIC_PENDING_COMPARE_INTENTS[number];

export const TURN_SEMANTIC_PENDING_COMPARE_ANCHORS = [
  "suggestion",
  "user_input",
  "current_value",
] as const;

export type PendingCompareTextAnchor = typeof TURN_SEMANTIC_PENDING_COMPARE_ANCHORS[number];

export type PendingCompareIntentResolution = {
  intent: PendingCompareTextIntent;
  anchor: Extract<PendingCompareTextAnchor, "suggestion" | "user_input">;
};

export const TURN_SEMANTIC_CURRENT_VALUE_FEEDBACK_INTENTS = [
  "feedback_on_current_value",
  "content_input",
] as const;

export type CurrentValueFeedbackIntent = typeof TURN_SEMANTIC_CURRENT_VALUE_FEEDBACK_INTENTS[number];

export const RunStepTurnSemanticClassificationZodSchema = z.object({
  is_clearly_general_offtopic: z.boolean(),
  is_step_contributing: z.boolean(),
  pending_compare_intent: z.enum(TURN_SEMANTIC_PENDING_COMPARE_INTENTS),
  pending_compare_anchor: z.enum(["suggestion", "user_input"]),
  current_value_feedback_intent: z.enum(TURN_SEMANTIC_CURRENT_VALUE_FEEDBACK_INTENTS),
});

export type RunStepTurnSemanticClassification =
  z.infer<typeof RunStepTurnSemanticClassificationZodSchema>;

export const RunStepTurnSemanticClassificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_clearly_general_offtopic",
    "is_step_contributing",
    "pending_compare_intent",
    "pending_compare_anchor",
    "current_value_feedback_intent",
  ],
  properties: {
    is_clearly_general_offtopic: { type: "boolean" },
    is_step_contributing: { type: "boolean" },
    pending_compare_intent: {
      type: "string",
      enum: TURN_SEMANTIC_PENDING_COMPARE_INTENTS,
    },
    pending_compare_anchor: {
      type: "string",
      enum: ["suggestion", "user_input"],
    },
    current_value_feedback_intent: {
      type: "string",
      enum: TURN_SEMANTIC_CURRENT_VALUE_FEEDBACK_INTENTS,
    },
  },
} as const;

export type ClassifyRunStepTurnSemanticsParams = {
  model: string;
  stepId: string;
  userMessage: string;
  currentAcceptedValue?: string;
  pendingSuggestion?: string;
  pendingUserVariant?: string;
  language?: string;
};

export type ClassifyRunStepTurnSemanticsResult = {
  classification: RunStepTurnSemanticClassification;
  attempts: number;
  usage: LLMUsage;
  model: string;
  source: "llm" | "fallback";
};

const TURN_SEMANTICS_CLASSIFIER_INSTRUCTIONS = `RUN-STEP TURN SEMANTICS CLASSIFIER, STRICT JSON, MULTI-LANGUAGE, NO KEYWORD HEURISTICS

Role
You classify the semantic role of the latest user turn for a single step in the Business Strategy Canvas flow.
You are not user-facing. Output strict JSON only.

Goal
Determine whether the user turn is contributing to the current step, clearly off-topic, feedback on current content, or a response to a pending compare choice.

Output schema
{
  "is_clearly_general_offtopic": boolean,
  "is_step_contributing": boolean,
  "pending_compare_intent": "accept_suggestion_explicit" | "reject_suggestion_explicit" | "feedback_on_suggestion" | "content_input",
  "pending_compare_anchor": "suggestion" | "user_input",
  "current_value_feedback_intent": "feedback_on_current_value" | "content_input"
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
- "is_clearly_general_offtopic" should be true only when USER_MESSAGE is clearly unrelated to the current step content, or is purely general/meta chatter that does not help the user progress this step.
- "is_step_contributing" should be true when USER_MESSAGE meaningfully contributes to the step by providing candidate content, source material, clarification, or wording feedback on current step content. It should be false for pure navigation, pure acceptance without new content, and clearly off-topic turns.
- If PENDING_SUGGESTION is present, classify "pending_compare_intent" relative to that compare state:
  - "accept_suggestion_explicit" when the user is clearly choosing the suggestion.
  - "reject_suggestion_explicit" when the user rejects the suggestion without supplying a usable replacement.
  - "feedback_on_suggestion" when the user comments on how the suggestion should change.
  - "content_input" when the user is providing their own input or replacement instead of reacting to the suggestion itself.
- Set "pending_compare_anchor" to "suggestion" only when the user's message is primarily about the pending suggestion. Otherwise use "user_input".
- Use "current_value_feedback_intent" = "feedback_on_current_value" only when CURRENT_ACCEPTED_VALUE exists and USER_MESSAGE is mainly feedback, critique, or requested adjustment to that existing accepted value. If the user is instead providing new step content or source material, use "content_input".

Guardrails
- Feedback on wording, tone, positivity, sharpness, specificity, warmth, or emphasis should count as feedback even when phrased indirectly.
- A user can still be step-contributing while giving feedback on existing content.
- Prefer "content_input" over over-claiming suggestion feedback when the user supplies fresh replacement content.
- Prefer false over over-claiming off-topic.

Return JSON only.`;

function emptyUsage(): LLMUsage {
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    provider_available: false,
  };
}

function fallbackClassification(): RunStepTurnSemanticClassification {
  return {
    is_clearly_general_offtopic: false,
    is_step_contributing: false,
    pending_compare_intent: "content_input",
    pending_compare_anchor: "user_input",
    current_value_feedback_intent: "content_input",
  };
}

function buildPlannerInput(params: ClassifyRunStepTurnSemanticsParams): string {
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

export async function classifyRunStepTurnSemantics(
  params: ClassifyRunStepTurnSemanticsParams
): Promise<ClassifyRunStepTurnSemanticsResult> {
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

  const res = await callStrictJson<RunStepTurnSemanticClassification>({
    model: params.model,
    instructions: TURN_SEMANTICS_CLASSIFIER_INSTRUCTIONS,
    plannerInput: buildPlannerInput(params),
    schemaName: "RunStepTurnSemanticsClassifier",
    jsonSchema: RunStepTurnSemanticClassificationJsonSchema as any,
    zodSchema: RunStepTurnSemanticClassificationZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 160,
    debugLabel: "RunStepTurnSemanticsClassifier",
  });

  return {
    classification: res.data,
    attempts: res.attempts,
    usage: res.usage,
    model: params.model,
    source: "llm",
  };
}
