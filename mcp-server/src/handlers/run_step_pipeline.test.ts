import test from "node:test";
import assert from "node:assert/strict";

import { isWordingChoiceIntentEligible, resolveProvisionalSourceForTurn } from "./run_step_pipeline.js";

test("resolveProvisionalSourceForTurn keeps action-route precedence", () => {
  assert.equal(
    resolveProvisionalSourceForTurn({
      actionCodeRaw: "ACTION_PURPOSE_REFINE_CONFIRM",
      submittedTextIntent: "feedback_on_suggestion",
    }),
    "action_route"
  );
});

test("resolveProvisionalSourceForTurn treats feedback/reject wording intents as system-generated", () => {
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
