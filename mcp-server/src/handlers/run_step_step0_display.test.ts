import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepStep0DisplayHelpers } from "./run_step_step0.js";

const helpers = createRunStepStep0DisplayHelpers({
  step0Id: "step_0",
  resolveSpecialistMetaTopic: () => "",
  buildBenProfileMessage: () => "profile",
  step0ReadinessQuestion: (_state, parsed) => `Ready for ${parsed.name}`,
  step0CardDescForState: () => "card",
  step0QuestionForState: () => "question",
  stripChoiceInstructionNoise: (value) => value,
});

test("confirmed step0 stays step0_ready even when a later specialist response is not ASK", () => {
  const result = helpers.normalizeStep0AskDisplayContract(
    "step_0",
    {
      action: "CONFIRM",
      business_name: "TBD",
      step_0: "",
      message: "",
    },
    {
      business_name: "bensteenstra.com",
      step_0_final: "Venture: platform | Name: bensteenstra.com | Status: starting",
    } as any,
    "ja",
    "other"
  );

  assert.equal(result.action, "ASK");
  assert.equal(result.step0_interaction_state, "step0_ready");
  assert.equal(result.business_name, "bensteenstra.com");
  assert.equal(result.step_0, "Venture: platform | Name: bensteenstra.com | Status: starting");
});

test("confirmed step0 still allows explicit business-name edits", () => {
  const result = helpers.normalizeStep0AskDisplayContract(
    "step_0",
    {
      action: "ASK",
      business_name: "Mindd",
      step_0: "",
      message: "",
    },
    {
      business_name: "bensteenstra.com",
      step_0_final: "Venture: platform | Name: bensteenstra.com | Status: starting",
    } as any,
    "het moet Mindd zijn",
    "change_name"
  );

  assert.equal(result.action, "ASK");
  assert.equal(result.step0_interaction_state, "step0_editing");
  assert.equal(result.business_name, "Mindd");
  assert.equal(result.step_0, "Venture: platform | Name: Mindd | Status: starting");
});
