import { getFinalFieldForStepId } from "../core/state.js";
import { isValidStepValueForStorage } from "./run_step_value_shape.js";

export const BIGWHY_MAX_WORDS = 28;

function pickFirstValidForStep(stepId: string, ...vals: Array<unknown>): string {
  for (const v of vals) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (!isValidStepValueForStorage(stepId, trimmed)) continue;
    return trimmed;
  }
  return "";
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function pickBigWhyCandidate(result: Record<string, unknown> | null | undefined): string {
  const fromFinal = typeof result?.bigwhy === "string" ? result.bigwhy.trim() : "";
  if (fromFinal) return fromFinal;
  const fromRefine = typeof result?.refined_formulation === "string" ? result.refined_formulation.trim() : "";
  return fromRefine;
}

export type ActionRoutingStepIds = {
  dreamStepId: string;
  purposeStepId: string;
  bigwhyStepId: string;
  roleStepId: string;
  entityStepId: string;
  strategyStepId: string;
  targetgroupStepId: string;
  productsservicesStepId: string;
  rulesofthegameStepId: string;
  presentationStepId: string;
};

export function buildActionCodeStepTransitions(ids: ActionRoutingStepIds): Record<string, string> {
  return {
    ACTION_STEP0_READY_START: ids.dreamStepId,
    ACTION_DREAM_REFINE_CONFIRM: ids.purposeStepId,
    ACTION_DREAM_EXPLAINER_REFINE_CONFIRM: ids.purposeStepId,
    ACTION_PURPOSE_REFINE_CONFIRM: ids.bigwhyStepId,
    ACTION_PURPOSE_CONFIRM_SINGLE: ids.bigwhyStepId,
    ACTION_BIGWHY_REFINE_CONFIRM: ids.roleStepId,
    ACTION_ROLE_REFINE_CONFIRM: ids.entityStepId,
    ACTION_ENTITY_EXAMPLE_CONFIRM: ids.strategyStepId,
    ACTION_STRATEGY_CONFIRM_SATISFIED: ids.targetgroupStepId,
    ACTION_STRATEGY_FINAL_CONTINUE: ids.targetgroupStepId,
    ACTION_TARGETGROUP_POSTREFINE_CONFIRM: ids.productsservicesStepId,
    ACTION_PRODUCTSSERVICES_CONFIRM: ids.rulesofthegameStepId,
    ACTION_RULES_CONFIRM_ALL: ids.presentationStepId,
  };
}

export function resolveRequiredFinalValue(params: {
  stepId: string;
  previousSpecialist: Record<string, unknown>;
  state: Record<string, unknown>;
  provisionalValue: string;
  step0Id: string;
  presentationStepId: string;
}): { field: string; value: string } {
  const { stepId, previousSpecialist, state, provisionalValue, step0Id, presentationStepId } = params;
  const finalField = getFinalFieldForStepId(stepId);
  if (!finalField) return { field: "", value: "" };
  if (stepId === step0Id) {
    return {
      field: finalField,
      value: pickFirstValidForStep(stepId, provisionalValue, previousSpecialist.step_0, state[finalField]),
    };
  }

  const specialistField = stepId === presentationStepId ? "presentation_brief" : stepId;
  return {
    field: finalField,
    value: pickFirstValidForStep(
      stepId,
      provisionalValue,
      previousSpecialist[specialistField],
      previousSpecialist.refined_formulation,
      state[finalField]
    ),
  };
}
