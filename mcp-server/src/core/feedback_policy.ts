import {
  isGroupedListWordingStep,
  isSingleValueWordingStep,
} from "../steps/step_registry.js";

export type PendingWordingFeedbackMode = "text" | "list";
export type PendingWordingFeedbackRequirement = "required" | "optional";

export function isSingleValueFeedbackStep(stepId: string): boolean {
  return isSingleValueWordingStep(stepId);
}

export function isGroupedCompareFeedbackStep(stepId: string): boolean {
  return isGroupedListWordingStep(stepId);
}

export function pendingWordingFeedbackRequirement(params: {
  stepId: string;
  mode: PendingWordingFeedbackMode;
  forcePending: boolean;
}): PendingWordingFeedbackRequirement {
  if (!params.forcePending) return "optional";
  if (params.mode === "text") {
    return isSingleValueFeedbackStep(params.stepId) ? "required" : "optional";
  }
  return isGroupedCompareFeedbackStep(params.stepId) ? "required" : "optional";
}

export function shouldInferSingleValueFeedbackReason(stepId: string): boolean {
  return isSingleValueFeedbackStep(stepId);
}
