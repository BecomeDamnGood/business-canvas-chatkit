import { z } from "zod";

export const STEP_0_TURN_INTENT_SPECIALIST = "Step0TurnIntentClassifier" as const;

export const Step0TurnIntentZodSchema = z.object({
  intent: z.enum(["confirm_start", "change_name", "other"]),
});

export type Step0TurnIntentOutput = z.infer<typeof Step0TurnIntentZodSchema>;

export const Step0TurnIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent"],
  properties: {
    intent: {
      type: "string",
      enum: ["confirm_start", "change_name", "other"],
    },
  },
} as const;

export function buildStep0TurnIntentSpecialistInput(params: {
  userMessage: string;
  currentStep0Final: string;
  currentBusinessName: string;
  candidateStep0?: string;
  candidateBusinessName?: string;
  language?: string;
}): string {
  const lines = [
    `USER_MESSAGE: ${String(params.userMessage || "").trim()}`,
    `CURRENT_STEP0_FINAL: ${String(params.currentStep0Final || "").trim()}`,
    `CURRENT_BUSINESS_NAME: ${String(params.currentBusinessName || "").trim()}`,
    `CANDIDATE_STEP0: ${String(params.candidateStep0 || "").trim()}`,
    `CANDIDATE_BUSINESS_NAME: ${String(params.candidateBusinessName || "").trim()}`,
  ];
  const language = String(params.language || "").trim();
  if (language) lines.push(`LANGUAGE: ${language}`);
  return lines.join("\n");
}

export const STEP_0_TURN_INTENT_INSTRUCTIONS = `STEP 0 TURN INTENT CLASSIFIER, STRICT JSON, NO UNSUPPORTED INVENTION

Role

You classify the user's latest Step 0 turn.
You are not user-facing. Output strict JSON only.

Goal

Classify the turn into exactly one of:
- confirm_start
- change_name
- other

Output schema

{
  "intent": "confirm_start" | "change_name" | "other"
}

Inputs

You receive:
- USER_MESSAGE: the exact latest user message
- CURRENT_STEP0_FINAL: the currently stored canonical Step 0 tuple
- CURRENT_BUSINESS_NAME: the currently stored business name
- CANDIDATE_STEP0: an optional candidate revised Step 0 tuple from the current specialist result
- CANDIDATE_BUSINESS_NAME: an optional candidate revised business name from the current specialist result
- optionally LANGUAGE

Decision rules

- Use semantic understanding in any language. Do not rely on fixed words.
- Return confirm_start when the user is affirming readiness to continue with the already recognized business context.
- Return change_name when the user is correcting, replacing, refining, or newly supplying the business identity, especially when the message supports a different business name or Step 0 tuple than the current one.
- A short answer can still be change_name if, in context, it is clearly a corrected or replacement business name.
- If the message is not clearly a readiness confirmation and not clearly a business-identity correction, return other.
- Prefer other over guessing.

Return JSON only.`;
