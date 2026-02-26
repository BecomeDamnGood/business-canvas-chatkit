import test from "node:test";
import assert from "node:assert/strict";
import {
  BIGWHY_MAX_WORDS,
  buildActionCodeStepTransitions,
  countWords,
  pickBigWhyCandidate,
  resolveRequiredFinalValue,
} from "./run_step_runtime_action_routing_policy.js";

test("countWords counts normalized tokens", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("  one   two\nthree "), 3);
});

test("pickBigWhyCandidate prefers bigwhy over refined_formulation", () => {
  assert.equal(
    pickBigWhyCandidate({ bigwhy: "  Keep this  ", refined_formulation: "Fallback" }),
    "Keep this"
  );
  assert.equal(
    pickBigWhyCandidate({ bigwhy: "", refined_formulation: "  Use this  " }),
    "Use this"
  );
});

test("buildActionCodeStepTransitions maps deterministic proceed actions", () => {
  const transitions = buildActionCodeStepTransitions({
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
  });
  assert.equal(transitions.ACTION_STEP0_READY_START, "dream");
  assert.equal(transitions.ACTION_RULES_CONFIRM_ALL, "presentation");
});

test("resolveRequiredFinalValue returns empty values for unknown step id", () => {
  assert.deepEqual(
    resolveRequiredFinalValue({
      stepId: "unknown_step",
      previousSpecialist: {},
      state: {},
      provisionalValue: "",
      step0Id: "step_0",
      presentationStepId: "presentation",
    }),
    { field: "", value: "" }
  );
});

test("resolveRequiredFinalValue prioritizes provisional and step-specific fallback chain", () => {
  const step0 = resolveRequiredFinalValue({
    stepId: "step_0",
    previousSpecialist: { step_0: "prev value" },
    state: { step_0_final: "state value" },
    provisionalValue: "provisional value",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(step0, { field: "step_0_final", value: "provisional value" });

  const presentation = resolveRequiredFinalValue({
    stepId: "presentation",
    previousSpecialist: { presentation_brief: "brief value", refined_formulation: "refined value" },
    state: { presentation_brief_final: "state value" },
    provisionalValue: "",
    step0Id: "step_0",
    presentationStepId: "presentation",
  });
  assert.deepEqual(presentation, { field: "presentation_brief_final", value: "brief value" });
});

test("BIGWHY_MAX_WORDS remains stable for routing checks", () => {
  assert.equal(BIGWHY_MAX_WORDS, 28);
});
