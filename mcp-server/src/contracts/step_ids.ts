import { z } from "zod";

export const STEP_IDS = [
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
] as const;

export type StepId = (typeof STEP_IDS)[number];
export const StepIdZod = z.enum(STEP_IDS);

export const SPECIALIST_NAMES = [
  "ValidationAndBusinessName",
  "Dream",
  "DreamExplainer",
  "Purpose",
  "BigWhy",
  "Role",
  "Entity",
  "Strategy",
  "TargetGroup",
  "ProductsServices",
  "RulesOfTheGame",
  "Presentation",
] as const;

export type SpecialistName = (typeof SPECIALIST_NAMES)[number];
export const SpecialistNameZod = z.enum(SPECIALIST_NAMES);

