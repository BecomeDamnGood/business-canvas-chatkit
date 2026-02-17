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

