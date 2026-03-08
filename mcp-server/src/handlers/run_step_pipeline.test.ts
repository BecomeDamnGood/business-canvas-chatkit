import test from "node:test";
import assert from "node:assert/strict";

import {
  isWordingChoiceIntentEligible,
  pickCurrentStepValueForFeedback,
  resolveProvisionalSourceForTurn,
  resolveWordingChoiceSeedUserText,
  shouldTreatTurnAsDreamCurrentValueFeedback,
  shouldForcePendingWordingChoiceFromIntent,
} from "./run_step_pipeline.js";

test("resolveProvisionalSourceForTurn keeps action-route precedence", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "ACTION_PURPOSE_REFINE_CONFIRM",
      submittedTextIntent: "feedback_on_suggestion",
    }),
    "action_route"
  );
});

test("resolveProvisionalSourceForTurn treats suggestion feedback/reject intents as system-generated", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "feedback_on_suggestion",
    }),
    "system_generated"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "reject_suggestion_explicit",
    }),
    "system_generated"
  );
});

test("resolveProvisionalSourceForTurn treats feedback on current value as user-driven evidence", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "feedback_on_current_value",
    }),
    "user_input"
  );
});

test("resolveProvisionalSourceForTurn keeps user-input source for content and explicit accept intents", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "content_input",
    }),
    "user_input"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "accept_suggestion_explicit",
    }),
    "user_input"
  );
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    "user_input"
  );
});

test("isWordingChoiceIntentEligible allows only step-input/meta-none turns", () => {
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    }),
    true
  );
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "META_QUESTION",
      meta_topic: "NONE",
    }),
    false
  );
  assert.equal(
    isWordingChoiceIntentEligible({
      user_intent: "STEP_INPUT",
      meta_topic: "NO_STARTING_POINT",
    }),
    false
  );
});

test("resolveWordingChoiceSeedUserText anchors feedback on suggestion to the previous suggestion", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "suggestion",
      submittedUserText: "Dit klinkt nog een beetje saai.",
      userMessage: "Dit klinkt nog een beetje saai.",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    "Technische mkb-bedrijven met complexe productontwikkeling."
  );
});

test("resolveWordingChoiceSeedUserText keeps direct user content input as seed", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
      submittedUserText: "Familiebedrijven met een technische kern.",
      userMessage: "Familiebedrijven met een technische kern.",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    "Familiebedrijven met een technische kern."
  );
});

test("resolveWordingChoiceSeedUserText returns empty seed for feedback on current value", () => {
  assert.equal(
    resolveWordingChoiceSeedUserText({
      submittedTextIntent: "feedback_on_current_value",
      submittedTextAnchor: "current_value",
      submittedUserText: "Ik vind dit een saaie formulering",
      userMessage: "Ik vind dit een saaie formulering",
      previousSpecialist: {
        wording_choice_agent_current: "Technische mkb-bedrijven met complexe productontwikkeling.",
      },
    }),
    ""
  );
});

test("pickCurrentStepValueForFeedback prefers provisional Dream over final", () => {
  assert.equal(
    pickCurrentStepValueForFeedback({
      provisional_by_step: { dream: "Provisional dream" },
      dream_final: "Final dream",
    } as any, "dream"),
    "Provisional dream"
  );
});

test("shouldTreatTurnAsDreamCurrentValueFeedback detects Dream formulation feedback without pending picker", () => {
  assert.equal(
    shouldTreatTurnAsDreamCurrentValueFeedback({
      state: {
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
      } as any,
      stepId: "dream",
      userMessage: "Ik vind dit een saaie formulering",
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    true
  );
  assert.equal(
    shouldTreatTurnAsDreamCurrentValueFeedback({
      state: {
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
      } as any,
      stepId: "dream",
      userMessage: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken die bij hen passen.",
      actionCodeRaw: "",
      submittedTextIntent: "",
    }),
    false
  );
});

test("shouldForcePendingWordingChoiceFromIntent forces pending only for suggestion-anchored feedback/reject intents", () => {
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "suggestion",
    }),
    true
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "reject_suggestion_explicit",
      submittedTextAnchor: "suggestion",
    }),
    true
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "content_input",
      submittedTextAnchor: "user_input",
    }),
    false
  );
  assert.equal(
    shouldForcePendingWordingChoiceFromIntent({
      submittedTextIntent: "feedback_on_suggestion",
      submittedTextAnchor: "user_input",
    }),
    false
  );
});
