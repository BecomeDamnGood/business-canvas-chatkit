import { z } from "zod";

import {
  STEP_0_SPECIALIST,
  ValidationAndBusinessNameZodSchema,
} from "../steps/step_0_validation.js";
import { DREAM_SPECIALIST, DreamZodSchema } from "../steps/dream.js";
import {
  DREAM_EXPLAINER_SPECIALIST,
  DreamExplainerZodSchema,
} from "../steps/dream_explainer.js";
import { PURPOSE_SPECIALIST, PurposeZodSchema } from "../steps/purpose.js";
import { BIGWHY_SPECIALIST, BigWhyZodSchema } from "../steps/bigwhy.js";
import { ROLE_SPECIALIST, RoleZodSchema } from "../steps/role.js";
import { ENTITY_SPECIALIST, EntityZodSchema } from "../steps/entity.js";
import { STRATEGY_SPECIALIST, StrategyZodSchema } from "../steps/strategy.js";
import { TARGETGROUP_SPECIALIST, TargetGroupZodSchema } from "../steps/targetgroup.js";
import {
  PRODUCTSSERVICES_SPECIALIST,
  ProductsServicesZodSchema,
} from "../steps/productsservices.js";
import {
  RULESOFTHEGAME_SPECIALIST,
  RulesOfTheGameZodSchema,
} from "../steps/rulesofthegame.js";
import {
  PRESENTATION_SPECIALIST,
  PresentationZodSchema,
} from "../steps/presentation.js";
import { asRecord } from "./run_step_type_guards.js";

export const SPECIALIST_OUTPUT_SCHEMA_BY_ID = {
  [STEP_0_SPECIALIST]: ValidationAndBusinessNameZodSchema,
  [DREAM_SPECIALIST]: DreamZodSchema,
  [DREAM_EXPLAINER_SPECIALIST]: DreamExplainerZodSchema,
  [PURPOSE_SPECIALIST]: PurposeZodSchema,
  [BIGWHY_SPECIALIST]: BigWhyZodSchema,
  [ROLE_SPECIALIST]: RoleZodSchema,
  [ENTITY_SPECIALIST]: EntityZodSchema,
  [STRATEGY_SPECIALIST]: StrategyZodSchema,
  [TARGETGROUP_SPECIALIST]: TargetGroupZodSchema,
  [PRODUCTSSERVICES_SPECIALIST]: ProductsServicesZodSchema,
  [RULESOFTHEGAME_SPECIALIST]: RulesOfTheGameZodSchema,
  [PRESENTATION_SPECIALIST]: PresentationZodSchema,
} as const satisfies Record<string, z.ZodType<Record<string, unknown>>>;

export type RunStepSpecialistId = keyof typeof SPECIALIST_OUTPUT_SCHEMA_BY_ID;

export type RunStepSpecialistOutputById = {
  [K in RunStepSpecialistId]: z.infer<(typeof SPECIALIST_OUTPUT_SCHEMA_BY_ID)[K]>;
};

export function isKnownRunStepSpecialistId(
  specialistId: string
): specialistId is RunStepSpecialistId {
  return specialistId in SPECIALIST_OUTPUT_SCHEMA_BY_ID;
}

export function parseSpecialistOutputById(
  specialistId: string,
  payload: unknown
): Record<string, unknown> {
  if (!isKnownRunStepSpecialistId(specialistId)) {
    return asRecord(payload);
  }
  const parsed = SPECIALIST_OUTPUT_SCHEMA_BY_ID[specialistId].safeParse(payload);
  if (!parsed.success) return asRecord(payload);
  return parsed.data;
}
