import { z } from "zod";
import { SpecialistNameZod, StepIdZod } from "./step_ids.js";

export const StepCompletedEventZod = z.object({
  type: z.literal("STEP_COMPLETED"),
  step: StepIdZod,
  finalValue: z.string().optional(),
});

export const ProceedToNextEventZod = z.object({
  type: z.literal("PROCEED_TO_NEXT"),
  fromStep: StepIdZod,
});

export const ProceedToSpecificEventZod = z.object({
  type: z.literal("PROCEED_TO_SPECIFIC"),
  fromStep: StepIdZod,
  toStep: StepIdZod,
});

export const RestartStepEventZod = z.object({
  type: z.literal("RESTART_STEP"),
  step: StepIdZod,
  reason: z.enum(["user_request", "validation_failed"]),
});

export const SpecialistSwitchEventZod = z.object({
  type: z.literal("SPECIALIST_SWITCH"),
  fromSpecialist: SpecialistNameZod,
  toSpecialist: SpecialistNameZod,
  sameStep: z.boolean().default(true),
});

export const NoTransitionEventZod = z.object({
  type: z.literal("NO_TRANSITION"),
  step: StepIdZod,
});

export const TransitionEventZod = z.discriminatedUnion("type", [
  StepCompletedEventZod,
  ProceedToNextEventZod,
  ProceedToSpecificEventZod,
  RestartStepEventZod,
  SpecialistSwitchEventZod,
  NoTransitionEventZod,
]);

export type TransitionEvent = z.infer<typeof TransitionEventZod>;

