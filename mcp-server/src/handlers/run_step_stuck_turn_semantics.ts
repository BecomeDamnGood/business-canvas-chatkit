import { z } from "zod";

import { __hasInjectedTestClient, callStrictJson, type LLMUsage } from "../core/llm.js";

export const StepStuckTurnClassificationZodSchema = z.object({
  is_stuck: z.boolean(),
});

export type StepStuckTurnClassification = z.infer<typeof StepStuckTurnClassificationZodSchema>;

export const StepStuckTurnClassificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_stuck"],
  properties: {
    is_stuck: { type: "boolean" },
  },
} as const;

export type ClassifyStepStuckTurnParams = {
  model: string;
  stepId: string;
  userMessage: string;
  currentStepStuckCount?: number;
  currentStepSupportMode?: string;
  language?: string;
};

export type ClassifyStepStuckTurnResult = {
  classification: StepStuckTurnClassification;
  attempts: number;
  usage: LLMUsage;
  model: string;
  source: "llm" | "fallback";
};

const STUCK_TURN_CLASSIFIER_INSTRUCTIONS = `STEP STUCK TURN CLASSIFIER, STRICT JSON, MULTI-LANGUAGE, NO KEYWORD HEURISTICS

Role
You classify whether the user's latest turn means they are stuck in the current step.
You are not user-facing. Output strict JSON only.

Goal
Detect whether the user is semantically signaling that they do not understand this step, cannot move forward in this step, truly do not know what to answer, or is still unable to continue after earlier help.

Output schema
{
  "is_stuck": boolean
}

Inputs
You receive:
- STEP_ID
- USER_MESSAGE
- optionally CURRENT_STEP_STUCK_COUNT
- optionally CURRENT_STEP_SUPPORT_MODE
- optionally LANGUAGE

Decision rules
- Use semantic understanding in any language. Do not rely on keyword lists or literal phrase matching.
- Return is_stuck=true when the user is clearly expressing confusion, lack of understanding, inability to answer, inability to continue, or continued inability after earlier help in this same step.
- Return is_stuck=false when the user is giving actual step content, asking a normal clarification question that still moves the step forward, accepting a suggestion, making a wording edit, or asking a meta/process question that is not itself a signal of being unable to continue.
- If CURRENT_STEP_STUCK_COUNT > 0 or CURRENT_STEP_SUPPORT_MODE is not "normal", treat renewed confusion or inability as still stuck even if phrased differently.
- Prefer false over over-claiming true when the user is simply brief but still contributing.

Return JSON only.`;

function emptyUsage(): LLMUsage {
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    provider_available: false,
  };
}

function fallbackClassification(): StepStuckTurnClassification {
  return { is_stuck: false };
}

function buildPlannerInput(params: ClassifyStepStuckTurnParams): string {
  const lines = [
    `STEP_ID: ${String(params.stepId || "").trim()}`,
    `USER_MESSAGE: ${String(params.userMessage || "").trim()}`,
    `CURRENT_STEP_STUCK_COUNT: ${String(Math.max(0, Math.trunc(Number(params.currentStepStuckCount) || 0)))}`,
    `CURRENT_STEP_SUPPORT_MODE: ${String(params.currentStepSupportMode || "normal").trim() || "normal"}`,
  ];
  const language = String(params.language || "").trim();
  if (language) lines.push(`LANGUAGE: ${language}`);
  return lines.join("\n");
}

export async function classifyStepStuckTurn(
  params: ClassifyStepStuckTurnParams
): Promise<ClassifyStepStuckTurnResult> {
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

  const res = await callStrictJson<StepStuckTurnClassification>({
    model: params.model,
    instructions: STUCK_TURN_CLASSIFIER_INSTRUCTIONS,
    plannerInput: buildPlannerInput(params),
    schemaName: "StepStuckTurnClassifier",
    jsonSchema: StepStuckTurnClassificationJsonSchema as any,
    zodSchema: StepStuckTurnClassificationZodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 80,
    debugLabel: "StepStuckTurnClassifier",
  });

  return {
    classification: res.data,
    attempts: res.attempts,
    usage: res.usage,
    model: params.model,
    source: "llm",
  };
}
