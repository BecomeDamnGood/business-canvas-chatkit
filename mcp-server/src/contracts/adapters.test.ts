import test from "node:test";
import assert from "node:assert/strict";

import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import { intentToActionCode } from "../adapters/intent_to_actioncode.js";

test("actionCodeToIntent maps wording pick codes", () => {
  assert.deepEqual(actionCodeToIntent({ actionCode: "ACTION_WORDING_PICK_USER" }), {
    type: "WORDING_PICK",
    choice: "user",
  });
  assert.deepEqual(actionCodeToIntent({ actionCode: "ACTION_WORDING_PICK_SUGGESTION" }), {
    type: "WORDING_PICK",
    choice: "suggestion",
  });
});

test("actionCodeToIntent maps route based start exercise", () => {
  const intent = actionCodeToIntent({
    actionCode: "ACTION_DREAM_INTRO_START_EXERCISE",
    route: "__ROUTE__DREAM_START_EXERCISE__",
  });
  assert.deepEqual(intent, { type: "START_EXERCISE", exerciseType: "dream_builder" });
});

test("intentToActionCode preserves route tokens", () => {
  const actionCode = intentToActionCode({
    type: "ROUTE",
    route: "__ROUTE__PURPOSE_EXPLAIN_MORE__",
  });
  assert.equal(actionCode, "__ROUTE__PURPOSE_EXPLAIN_MORE__");
});

test("intentToActionCode throws for context-required intents", () => {
  const blockedIntents = [
    { type: "CONTINUE" as const },
    { type: "FINISH_LATER" as const },
    { type: "START_EXERCISE" as const, exerciseType: "dream_builder" as const },
    { type: "REQUEST_EXPLANATION" as const, topic: "dream_intro" as const },
    { type: "NAVIGATE_STEP" as const, step: "purpose" as const },
  ];

  for (const intent of blockedIntents) {
    assert.throws(
      () => intentToActionCode(intent),
      /requires step\/menu context/i,
      `Expected blocked generic mapping for ${intent.type}`
    );
  }
});

test("actionCodeToIntent -> intentToActionCode round-trip is unsupported for generic continue/finish-later intents", () => {
  const nonRoundTripRoutes = ["__ROUTE__PURPOSE_CONTINUE__", "__ROUTE__PURPOSE_FINISH_LATER__"];
  for (const route of nonRoundTripRoutes) {
    const intent = actionCodeToIntent({
      actionCode: "ACTION_TEST",
      route,
    });
    assert.throws(
      () => intentToActionCode(intent),
      /requires step\/menu context/i
    );
  }
});

test("supported intents still round-trip through adapters", () => {
  const routeIntent = actionCodeToIntent({
    actionCode: "ACTION_TEST_ROUTE",
    route: "__ROUTE__TARGETGROUP_ASK_QUESTIONS__",
  });
  assert.equal(intentToActionCode(routeIntent), "__ROUTE__TARGETGROUP_ASK_QUESTIONS__");

  const wordingIntent = actionCodeToIntent({ actionCode: "ACTION_WORDING_PICK_USER" });
  assert.equal(intentToActionCode(wordingIntent), "ACTION_WORDING_PICK_USER");

  const scoresIntent = actionCodeToIntent({ actionCode: "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES" });
  assert.equal(intentToActionCode(scoresIntent), "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES");
});
