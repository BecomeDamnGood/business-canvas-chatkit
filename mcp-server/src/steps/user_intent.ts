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

export const SPECIALIST_META_TOPICS = [
  "NONE",
  "MODEL_VALUE",
  "MODEL_CREDIBILITY",
  "BEN_PROFILE",
  "RECAP",
] as const;

export type SpecialistUserIntent = (typeof SPECIALIST_USER_INTENTS)[number];
export type SpecialistMetaTopic = (typeof SPECIALIST_META_TOPICS)[number];

export const SpecialistUserIntentZod = z
  .enum(SPECIALIST_USER_INTENTS)
  .default("STEP_INPUT");

export const SpecialistUserIntentJsonSchema = {
  type: "string",
  enum: SPECIALIST_USER_INTENTS,
} as const;

export const SpecialistMetaTopicZod = z
  .enum(SPECIALIST_META_TOPICS)
  .default("NONE");

export const SpecialistMetaTopicJsonSchema = {
  type: "string",
  enum: SPECIALIST_META_TOPICS,
} as const;
