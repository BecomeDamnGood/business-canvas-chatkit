import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepRuntimeDreamHelpers } from "./run_step_runtime_dream_helpers.js";

const helpers = createRunStepRuntimeDreamHelpers({
  strategyStepId: "strategy",
  tokenizeWords: (value: string) =>
    String(value || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  parseListItems: (value: string) =>
    String(value || "")
      .replace(/\r/g, "\n")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean),
  provisionalValueForStep: () => "",
  ensureSentenceEnd: (value: string) => {
    const text = String(value || "").trim();
    if (!text) return "";
    return /[.!?]$/.test(text) ? text : `${text}.`;
  },
});

test("hasDreamSpecialistCandidate does not treat Dream Builder multiline rewrites as final dream candidates", () => {
  const multilineRewrite = [
    "Over 5 tot 10 jaar zal het voor mensen belangrijker zijn dat hun werk een positieve impact heeft op anderen.",
    "Mensen zullen steeds meer waarde hechten aan het bouwen van iets dat generaties overstijgt.",
    "Vrijheid in tijd en keuzes wordt een centrale waarde in het werkende leven.",
  ].join("\n");

  assert.equal(
    helpers.hasDreamSpecialistCandidate({
      dream: "",
      refined_formulation: multilineRewrite,
      statements: [],
    }),
    false
  );
});

test("hasDreamSpecialistCandidate keeps true for stageable dream lines and explicit statement lists", () => {
  assert.equal(
    helpers.hasDreamSpecialistCandidate({
      dream: "Mindd droomt van een wereld waarin mensen keuzes maken die goed voelen en goed doen.",
      refined_formulation: "",
      statements: [],
    }),
    true
  );

  assert.equal(
    helpers.hasDreamSpecialistCandidate({
      dream: "",
      refined_formulation: "",
      statements: ["Statement one", "Statement two"],
    }),
    true
  );
});
