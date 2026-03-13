export type PendingWordingFeedbackMode = "text" | "list";
export type PendingWordingFeedbackRequirement = "required" | "optional";

export const SINGLE_VALUE_FEEDBACK_STEP_IDS = [
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "targetgroup",
] as const;

export const GROUPED_COMPARE_FEEDBACK_STEP_IDS = [
  "strategy",
  "productsservices",
  "rulesofthegame",
] as const;

const SINGLE_VALUE_FEEDBACK_STEP_ID_SET = new Set<string>(SINGLE_VALUE_FEEDBACK_STEP_IDS);
const GROUPED_COMPARE_FEEDBACK_STEP_ID_SET = new Set<string>(GROUPED_COMPARE_FEEDBACK_STEP_IDS);

export function isSingleValueFeedbackStep(stepId: string): boolean {
  return SINGLE_VALUE_FEEDBACK_STEP_ID_SET.has(String(stepId || "").trim());
}

export function isGroupedCompareFeedbackStep(stepId: string): boolean {
  return GROUPED_COMPARE_FEEDBACK_STEP_ID_SET.has(String(stepId || "").trim());
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
