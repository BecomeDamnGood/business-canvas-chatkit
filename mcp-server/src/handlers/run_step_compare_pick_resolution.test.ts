import test from "node:test";
import assert from "node:assert/strict";

import { createPendingInteractionState, STEP_FINAL_FIELD_BY_STEP_ID, type CanvasState } from "../core/state.js";
import { renderFreeTextTurnPolicy } from "../core/turn_policy_renderer.js";
import { UI_STRINGS_SOURCE_EN } from "../i18n/ui_strings_defaults.js";
import { resolveRequiredFinalValue } from "./run_step_runtime_action_routing_policy.js";
import { createRunStepCompareHelpers } from "./run_step_compare.js";
import { createRunStepRuntimeStateHelpers } from "./run_step_runtime_state_helpers.js";
import {
  areEquivalentCompareVariants,
  canonicalizeComparableText,
  isMaterialRewriteCandidate,
  normalizeLightUserInput,
  normalizeListUserInput,
  normalizeUserInputAgainstSuggestion,
  parseListItems,
  pickDualChoiceSuggestion,
  splitSentenceItems,
  tokenizeWords,
} from "./run_step_compare_defaults.js";

function uiDefaultString(key: string, fallback = ""): string {
  return String(UI_STRINGS_SOURCE_EN[key] || "").trim() || String(fallback || "").trim();
}

function uiStringFromStateMap(
  state: CanvasState | null | undefined,
  key: string,
  fallback: string
): string {
  const strings =
    state && typeof state === "object" && state.ui_strings && typeof state.ui_strings === "object"
      ? (state.ui_strings as Record<string, unknown>)
      : {};
  return String(strings[key] || "").trim() || fallback;
}

function fieldForStep(stepId: string): string {
  return String((STEP_FINAL_FIELD_BY_STEP_ID as Record<string, string>)[stepId] || "").trim();
}

function getFinalsSnapshot(state: CanvasState): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const [stepId, finalField] of Object.entries(STEP_FINAL_FIELD_BY_STEP_ID)) {
    const value = String((state as Record<string, unknown>)[finalField] || "").trim();
    if (value) snapshot[stepId] = value;
  }
  return snapshot;
}

function createCompareHelpers() {
  const stateHelpers = createRunStepRuntimeStateHelpers({
    step0Id: "step_0",
    dreamStepId: "dream",
    purposeStepId: "purpose",
    bigwhyStepId: "bigwhy",
    roleStepId: "role",
    entityStepId: "entity",
    strategyStepId: "strategy",
    targetgroupStepId: "targetgroup",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    presentationStepId: "presentation",
    dreamExplainerSpecialist: "DreamExplainer",
    parseStep0Final: () => null,
    parseListItems,
    canonicalizeComparableText,
    getFinalsSnapshot,
    uiDefaultString,
  });

  return createRunStepCompareHelpers({
    step0Id: "step_0",
    presentationStepId: "presentation",
    dreamStepId: "dream",
    strategyStepId: "strategy",
    productsservicesStepId: "productsservices",
    rulesofthegameStepId: "rulesofthegame",
    entityStepId: "entity",
    dreamExplainerSpecialist: "DreamExplainer",
    normalizeDreamRuntimeMode: (raw: unknown) => String(raw || "").trim() || "self",
    uiDefaultString,
    uiStringFromStateMap,
    fieldForStep,
    parseListItems,
    splitSentenceItems,
    normalizeListUserInput,
    normalizeLightUserInput,
    normalizeUserInputAgainstSuggestion,
    canonicalizeComparableText,
    stripChoiceInstructionNoise: (input: string) => String(input || ""),
    tokenizeWords,
    isMaterialRewriteCandidate,
    pickDualChoiceSuggestion,
    areEquivalentCompareVariants,
    normalizeEntityPhrase: (input: string) => String(input || "").trim(),
    withProvisionalValue: stateHelpers.withProvisionalValue,
    renderFreeTextTurnPolicy,
    applyUiPhaseByStep: () => {},
    isUiCompareFeedbackKeyedV1Enabled: () => true,
    isCompareIntentV1Enabled: () => true,
    bumpUiI18nCounter: () => {},
    compareSelectionMessage: stateHelpers.compareSelectionMessage,
  });
}

test("pick_user keeps the user's own text in the displayed current value, and the explicit choice is now confirm-eligible", () => {
  const helpers = createCompareHelpers();
  const userInput = "Dit gaat over eerlijke informatie vanuit aanbieders.";
  const previousSuggestion =
    "Mindd dreams of a world in which people can trust the information they receive and feel confident that honesty and transparency are the norm.";

  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    business_name: "Mindd",
    __dream_runtime_mode: "self",
    ui_strings: UI_STRINGS_SOURCE_EN,
    pending_interaction_state: createPendingInteractionState({
      id: "pi_compare_test",
      kind: "text_compare",
      render_model: {
        mode: "text",
        instruction: "Choose the version that feels closest to what you mean.",
        feedback_reason_text:
          "Your version highlights the importance of honest information, but to fit the Dream step, it needs to paint a picture of the world you want to help create and the positive impact on people's lives.",
        user_label: "This is your input:",
        suggestion_label: "This would be my suggestion:",
        user_text: userInput,
        suggestion_text: previousSuggestion,
        user_items: [],
        suggestion_items: [],
        retained_heading: "",
        retained_items: [],
      },
    }),
    last_specialist_result: {
      refined_formulation: previousSuggestion,
      dream: previousSuggestion,
      user_pick_feedback_text:
        "Keeping your own wording is completely okay. If you continue with it, keep the future you want to create clearly visible in the sentence.",
      feedback_reason_text:
        "Your version highlights the importance of honest information, but to fit the Dream step, it needs to paint a picture of the world you want to help create and the positive impact on people's lives.",
    },
  } as unknown as CanvasState;

  const result = helpers.applyComparePickSelection({
    stepId: "dream",
    routeToken: "__COMPARE_PICK_USER__",
    state,
  });

  assert.equal(result.handled, true);
  assert.equal(result.nextState.provisional_by_step?.dream, userInput);
  assert.equal(result.nextState.provisional_source_by_step?.dream, "compare_pick");
  assert.match(String(result.specialist.message || ""), /Keeping your own wording is completely okay/i);
  assert.match(String(result.specialist.message || ""), /Dit gaat over eerlijke informatie vanuit aanbieders\./i);
  assert.doesNotMatch(String(result.specialist.message || ""), /honesty and transparency are the norm/i);
  assert.ok(Array.isArray(result.actionCodes) && result.actionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"));
  const uiContent = (result.specialist.ui_content || {}) as Record<string, unknown>;
  assert.equal(uiContent.kind, "single_value");
  assert.equal(String(uiContent.canonical_text || "").trim(), userInput);
});

test("pick_user exposes the normal confirm CTA when the user's chosen compare value is already a valid Dream", () => {
  const helpers = createCompareHelpers();
  const userDream =
    "Mindd dreams of a world in which people can trust clear and honest information from providers, so they can choose with confidence.";
  const suggestionDream =
    "Mindd dreams of a world in which everyone can rely on transparent provider information and feel respected in every decision they make.";

  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    business_name: "Mindd",
    __dream_runtime_mode: "self",
    ui_strings: UI_STRINGS_SOURCE_EN,
    pending_interaction_state: createPendingInteractionState({
      id: "pi_compare_valid",
      kind: "text_compare",
      render_model: {
        mode: "text",
        instruction: "Choose the version that feels closest to what you mean.",
        feedback_reason_text:
          "Both versions already sound like a Dream, so choose the one that feels most true to what you mean.",
        user_label: "This is your input:",
        suggestion_label: "This would be my suggestion:",
        user_text: userDream,
        suggestion_text: suggestionDream,
        user_items: [],
        suggestion_items: [],
        retained_heading: "",
        retained_items: [],
      },
    }),
    last_specialist_result: {
      refined_formulation: suggestionDream,
      dream: suggestionDream,
      user_pick_feedback_text:
        "Keeping your own wording is completely okay. If you continue with it, keep the future you want to create clearly visible in the sentence.",
      feedback_reason_text:
        "Both versions already sound like a Dream, so choose the one that feels most true to what you mean.",
    },
  } as unknown as CanvasState;

  const result = helpers.applyComparePickSelection({
    stepId: "dream",
    routeToken: "__COMPARE_PICK_USER__",
    state,
  });

  assert.equal(result.handled, true);
  assert.ok(Array.isArray(result.actionCodes) && result.actionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"));
  const uiContent = (result.specialist.ui_content || {}) as Record<string, unknown>;
  assert.equal(uiContent.kind, "single_value");
  assert.equal(String(uiContent.canonical_text || "").trim(), userDream);
  assert.match(String(uiContent.support_text || ""), /Keeping your own wording is completely okay/i);
});

test("pick_user keeps the step-specific compare reason when it only exists in pending compare state", () => {
  const helpers = createCompareHelpers();
  const userInput = "Mensen willen eerlijke en open communicatie.";
  const suggestionDream =
    "Mindd dreams of a world in which people experience genuine trust and connection through honest and open communication.";

  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    business_name: "Mindd",
    __dream_runtime_mode: "self",
    ui_strings: UI_STRINGS_SOURCE_EN,
    pending_interaction_state: createPendingInteractionState({
      id: "pi_compare_pending_reason_only",
      kind: "text_compare",
      render_model: {
        mode: "text",
        instruction: "Choose the version that feels closest to what you mean.",
        feedback_reason_text:
          "You named an important value, but a Dream needs to show the bigger impact on people's lives.",
        user_label: "This is your input:",
        suggestion_label: "This would be my suggestion:",
        user_text: userInput,
        suggestion_text: suggestionDream,
        user_items: [],
        suggestion_items: [],
        retained_heading: "",
        retained_items: [],
      },
    }),
    last_specialist_result: {
      refined_formulation: suggestionDream,
      dream: suggestionDream,
      user_pick_feedback_text: "",
      feedback_reason_text: "",
    },
  } as unknown as CanvasState;

  const result = helpers.applyComparePickSelection({
    stepId: "dream",
    routeToken: "__COMPARE_PICK_USER__",
    state,
  });

  assert.equal(result.handled, true);
  const uiContent = (result.specialist.ui_content || {}) as Record<string, unknown>;
  assert.equal(uiContent.kind, "single_value");
  assert.equal(String(uiContent.canonical_text || "").trim(), userInput);
  assert.match(String(uiContent.support_text || ""), /your own wording/i);
  assert.match(String(uiContent.support_text || ""), /important value/i);
  assert.match(String(uiContent.support_text || ""), /bigger impact on people's lives/i);
  assert.doesNotMatch(
    String(uiContent.support_text || ""),
    /keep the wording clear, human-centered, and specific enough for this step/i
  );
});

test("Dream confirm commits an explicit compare-pick value even when it is not stageable as a generated Dream sentence", () => {
  const chosenDream = "Dit gaat over eerlijke informatie in plaats van bedrog.";
  const finalInfo = resolveRequiredFinalValue({
    stepId: "dream",
    previousSpecialist: {
      refined_formulation:
        "Mindd dreams of a world in which everyone can trust transparent information from providers.",
    },
    state: {
      provisional_by_step: {
        dream: chosenDream,
      },
      provisional_source_by_step: {
        dream: "compare_pick",
      },
      dream_final: "",
    },
    provisionalValue: chosenDream,
    step0Id: "step_0",
    presentationStepId: "presentation",
  });

  assert.equal(finalInfo.field, "dream_final");
  assert.equal(finalInfo.value, chosenDream);
});
