import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import {
  collectStepFinalConfirmationEvents,
  normalizeConfirmationBaselineForStartTrigger,
} from "./run_step_routes.js";
import { parseStep0Final } from "./run_step_step0.js";

test("collectStepFinalConfirmationEvents includes step 1 when step_0_final becomes known", () => {
  const previousState = getDefaultState();
  const nextState = {
    ...getDefaultState(),
    business_name: "Mindd",
    step_0_final: "Venture: creative agency | Name: Mindd | Status: existing",
  };

  const events = collectStepFinalConfirmationEvents({
    previousState,
    nextState,
    step0Id: "step_0",
    parseStep0Final,
  });

  assert.deepEqual(events, [
    {
      stepId: "step_0",
      finalField: "step_0_final",
      finalText: "Venture: creative agency | Name: Mindd | Status: existing",
      businessName: "Mindd",
      source: "explicit_confirmation",
    },
  ]);
});

test("collectStepFinalConfirmationEvents includes later confirmed steps and ignores unchanged finals", () => {
  const previousState = {
    ...getDefaultState(),
    business_name: "Mindd",
    step_0_final: "Venture: creative agency | Name: Mindd | Status: existing",
    dream_final: "Mindd dreams of meaningful work.",
  };
  const nextState = {
    ...previousState,
    purpose_final: "Mindd believes in meaningful work.",
  };

  const events = collectStepFinalConfirmationEvents({
    previousState,
    nextState,
    step0Id: "step_0",
    parseStep0Final,
  });

  assert.deepEqual(events, [
    {
      stepId: "purpose",
      finalField: "purpose_final",
      finalText: "Mindd believes in meaningful work.",
      businessName: "Mindd",
      source: "explicit_confirmation",
    },
  ]);
});

test("normalizeConfirmationBaselineForStartTrigger strips prehydrated step_0_final for first start", () => {
  const baseline = normalizeConfirmationBaselineForStartTrigger({
    baselineState: {
      ...getDefaultState(),
      current_step: "step_0",
      intro_shown_session: "false",
      business_name: "Mindd",
      step_0_final: "Venture: creative agency | Name: Mindd | Status: existing",
      step0_bootstrap: {
        venture: "creative agency",
        name: "Mindd",
        status: "existing",
        source: "initial_user_message",
      },
    },
    actionCodeRaw: "ACTION_START",
    currentStep: "step_0",
    introShownSession: "false",
    step0Id: "step_0",
  });

  assert.equal(String(baseline.step_0_final || ""), "");
  assert.equal(String(baseline.business_name || ""), "Mindd");
});

test("parseStep0Final defaults missing status to existing", () => {
  const parsed = parseStep0Final("Venture: creative agency | Name: Mindd", "TBD");

  assert.equal(parsed.venture, "creative agency");
  assert.equal(parsed.name, "Mindd");
  assert.equal(parsed.status, "existing");
});
