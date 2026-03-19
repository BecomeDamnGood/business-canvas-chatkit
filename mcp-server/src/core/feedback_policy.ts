import {
  isGroupedListCompareStep,
  isSingleValueCompareStep,
} from "../steps/step_registry.js";

export type PendingCompareFeedbackMode = "text" | "list";
export type PendingCompareFeedbackRequirement = "required" | "optional";
export type CompareFeedbackFamily = "single_value" | "grouped_list" | "other";
export type PendingCompareFeedbackSourcePolicy =
  | "explicit_only"
  | "dream_builder_material_rewrite_fallback";
export type PendingCompareFeedbackModeRequirement = "compare_suggestion" | "any";
export type PendingCompareEmptyBehavior = "suppress_picker" | "allow_empty";

export type PendingCompareFeedbackPolicy = {
  family: CompareFeedbackFamily;
  requirement: PendingCompareFeedbackRequirement;
  sourcePolicy: PendingCompareFeedbackSourcePolicy;
  feedbackModeRequirement: PendingCompareFeedbackModeRequirement;
  emptyBehavior: PendingCompareEmptyBehavior;
};

export type UserPickFeedbackPolicy = {
  family: CompareFeedbackFamily;
  requirement: "optional";
  fallbackBehavior: "use_catalog_fallback" | "allow_empty";
};

export function compareFeedbackFamilyForStep(stepId: string): CompareFeedbackFamily {
  if (isSingleValueCompareStep(stepId)) return "single_value";
  if (isGroupedListCompareStep(stepId)) return "grouped_list";
  return "other";
}

export function isSingleValueFeedbackStep(stepId: string): boolean {
  return compareFeedbackFamilyForStep(stepId) === "single_value";
}

export function isGroupedCompareFeedbackStep(stepId: string): boolean {
  return compareFeedbackFamilyForStep(stepId) === "grouped_list";
}

export function pendingCompareFeedbackPolicy(params: {
  stepId: string;
  mode: PendingCompareFeedbackMode;
  forcePending: boolean;
  isDreamBuilderMaterialRewrite?: boolean;
}): PendingCompareFeedbackPolicy {
  if (params.isDreamBuilderMaterialRewrite) {
    return {
      family: "other",
      requirement: "required",
      sourcePolicy: "dream_builder_material_rewrite_fallback",
      feedbackModeRequirement: "any",
      emptyBehavior: "suppress_picker",
    };
  }

  const family = compareFeedbackFamilyForStep(params.stepId);
  if (family === "single_value" && params.mode === "text") {
    return {
      family,
      requirement: "required",
      sourcePolicy: "explicit_only",
      feedbackModeRequirement: "compare_suggestion",
      emptyBehavior: "suppress_picker",
    };
  }
  if (family === "grouped_list" && params.mode === "list") {
    return {
      family,
      requirement: "required",
      sourcePolicy: "explicit_only",
      feedbackModeRequirement: "any",
      emptyBehavior: "suppress_picker",
    };
  }
  return {
    family,
    requirement: params.forcePending ? "optional" : "optional",
    sourcePolicy: "explicit_only",
    feedbackModeRequirement: "any",
    emptyBehavior: "allow_empty",
  };
}

export function pendingCompareFeedbackRequirement(params: {
  stepId: string;
  mode: PendingCompareFeedbackMode;
  forcePending: boolean;
  isDreamBuilderMaterialRewrite?: boolean;
}): PendingCompareFeedbackRequirement {
  return pendingCompareFeedbackPolicy(params).requirement;
}

export function isPendingCompareFeedbackModeEligible(
  policy: PendingCompareFeedbackPolicy,
  feedbackModeRaw: string
): boolean {
  if (policy.feedbackModeRequirement === "any") return true;
  return String(feedbackModeRaw || "").trim() === policy.feedbackModeRequirement;
}

export function shouldSuppressPendingCompareForMissingFeedback(
  policy: PendingCompareFeedbackPolicy,
  hasFeedback: boolean
): boolean {
  return policy.emptyBehavior === "suppress_picker" && !hasFeedback;
}

export function userPickFeedbackPolicy(stepId: string): UserPickFeedbackPolicy {
  const family = compareFeedbackFamilyForStep(stepId);
  return {
    family,
    requirement: "optional",
    fallbackBehavior: family === "other" ? "allow_empty" : "use_catalog_fallback",
  };
}

export function shouldInferSingleValueFeedbackReason(stepId: string): boolean {
  return isSingleValueFeedbackStep(stepId);
}
