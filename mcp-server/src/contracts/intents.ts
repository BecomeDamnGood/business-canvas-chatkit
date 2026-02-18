import { z } from "zod";
import { StepIdZod } from "./step_ids.js";

export const SubmitTextIntentZod = z.object({
  type: z.literal("SUBMIT_TEXT"),
  text: z.string(),
  context: z.enum(["free_text", "builder_statement", "refine_input"]).optional(),
});

export const RequestExplanationIntentZod = z.object({
  type: z.literal("REQUEST_EXPLANATION"),
  topic: z.string(),
});

export const StartExerciseIntentZod = z.object({
  type: z.literal("START_EXERCISE"),
  exerciseType: z.string().default("dream_builder"),
});

export const SubmitScoresIntentZod = z.object({
  type: z.literal("SUBMIT_SCORES"),
  scores: z.array(z.array(z.number().min(1).max(10))),
});

export const WordingPickIntentZod = z.object({
  type: z.literal("WORDING_PICK"),
  choice: z.enum(["user", "suggestion"]),
});

export const RouteIntentZod = z.object({
  type: z.literal("ROUTE"),
  route: z.string(),
});

export const NavigateStepIntentZod = z.object({
  type: z.literal("NAVIGATE_STEP"),
  step: StepIdZod,
});

export const ContinueIntentZod = z.object({
  type: z.literal("CONTINUE"),
});

export const FinishLaterIntentZod = z.object({
  type: z.literal("FINISH_LATER"),
});

export const StepIntentZod = z.discriminatedUnion("type", [
  SubmitTextIntentZod,
  RequestExplanationIntentZod,
  StartExerciseIntentZod,
  SubmitScoresIntentZod,
  WordingPickIntentZod,
  RouteIntentZod,
  NavigateStepIntentZod,
  ContinueIntentZod,
  FinishLaterIntentZod,
]);

export type StepIntent = z.infer<typeof StepIntentZod>;
