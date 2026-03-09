import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDreamRuntimePolicy,
  detectDreamRuntimeViolations,
  isStageableDreamCandidate,
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

test("dream runtime policy requests repair but still allows staging for shape-valid Dream lines", () => {
  const result = applyDreamRuntimePolicy({
    specialist: {
      refined_formulation:
        "Mindd droomt van een wereld waarin mensen keuzes maken dankzij AI.",
      dream:
        "Mindd droomt van een wereld waarin mensen keuzes maken dankzij AI.",
    },
  });

  assert.equal(result.canStage, true);
  assert.equal(result.requiresRepair, true);
  assert.equal(String(result.specialist.__dream_policy_requires_repair || ""), "true");
  assert.equal(String(result.specialist.__dream_policy_can_stage || ""), "true");
});

test("stageable dream candidate requires dream-line shape instead of accepting builder summaries", () => {
  const invalidSummary = [
    "Over 5 tot 10 jaar zullen meer mensen verlangen naar werk dat een positieve invloed heeft op het leven van anderen.",
    "Steeds meer mensen zullen streven naar het bouwen van iets dat hun eigen leven overstijgt en blijvende waarde heeft voor de samenleving.",
    "Vrijheid in tijd en keuzes zal voor mensen wereldwijd een steeds belangrijker thema worden.",
    "Mensen zullen in de toekomst meer waarde hechten aan trots kunnen zijn op hun werk en hun bijdrage aan de samenleving.",
  ].join(" ");

  assert.equal(isStageableDreamCandidate(invalidSummary), false);

  const result = applyDreamRuntimePolicy({
    specialist: {
      refined_formulation: invalidSummary,
      dream: "",
    },
  });

  assert.equal(result.candidateShapeValid, false);
  assert.equal(result.canStage, false);
  assert.equal(result.requiresRepair, true);
});
