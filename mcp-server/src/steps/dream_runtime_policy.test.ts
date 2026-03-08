import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDreamRuntimePolicy,
  detectDreamRuntimeViolations,
} from "./dream_runtime_policy.js";

test("detectDreamRuntimeViolations flags technology-first Dream wording", () => {
  const violations = detectDreamRuntimeViolations(
    "Mindd droomt van een wereld waarin mensen betere keuzes maken dankzij AI."
  );

  assert.equal(violations.includes("technology_first"), true);
  assert.equal(violations.includes("execution_first"), true);
});

test("dream runtime policy adds explicit rationale when source Dream is technology-first", () => {
  const result = applyDreamRuntimePolicy({
    specialist: {
      refined_formulation:
        "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken die echt bij hen passen.",
      dream:
        "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken die echt bij hen passen.",
    },
    userMessage:
      "Mindd droomt van een wereld waarin mensen zich vol vertrouwen laten inspireren bij hun keuzes, dankzij de opkomst van AI.",
  });

  assert.equal(result.canStage, true);
  assert.equal(result.suppressWordingChoice, true);
  assert.deepEqual(result.sourceViolationCodes, ["technology_first", "execution_first"]);
  assert.equal(String(result.specialist.feedback_reason_key || ""), "");
  assert.equal(String(result.specialist.feedback_reason_text || ""), "");
});

test("dream runtime policy requests repair when candidate itself remains technology-first", () => {
  const result = applyDreamRuntimePolicy({
    specialist: {
      refined_formulation:
        "Mindd droomt van een wereld waarin mensen keuzes maken dankzij AI.",
      dream:
        "Mindd droomt van een wereld waarin mensen keuzes maken dankzij AI.",
    },
  });

  assert.equal(result.canStage, false);
  assert.equal(result.requiresRepair, true);
  assert.equal(String(result.specialist.__dream_policy_requires_repair || ""), "true");
  assert.equal(String(result.specialist.__dream_policy_can_stage || ""), "false");
});
