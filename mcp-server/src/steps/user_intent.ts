import { z } from "zod";

export const SPECIALIST_USER_INTENTS = [
  "STEP_INPUT",
  "WHY_NEEDED",
  "RESISTANCE",
  "INSPIRATION_REQUEST",
  "META_QUESTION",
  "RECAP_REQUEST",
  "OFFTOPIC",
] as const;

export type SpecialistUserIntent = (typeof SPECIALIST_USER_INTENTS)[number];

export const SpecialistUserIntentZod = z
  .enum(SPECIALIST_USER_INTENTS)
  .default("STEP_INPUT");

export const SpecialistUserIntentJsonSchema = {
  type: "string",
  enum: SPECIALIST_USER_INTENTS,
} as const;
