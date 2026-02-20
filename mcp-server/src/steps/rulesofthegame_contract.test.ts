import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRulesOfTheGameOutputContract } from "./rulesofthegame_contract.js";

test("rules contract normalizer keeps incomplete ASK without finalized bullet fields", () => {
  const result = normalizeRulesOfTheGameOutputContract({
    specialist: {
      action: "ASK",
      message: "Noted.",
      question: "What more rules do you have?",
      refined_formulation: "• We are punctual",
      rulesofthegame: "• We are punctual",
      statements: ["We are punctual", "We communicate proactively"],
      wants_recap: false,
      is_offtopic: false,
    },
    previousStatements: [],
  });

  assert.equal(result.intent, "ASK_INCOMPLETE");
  assert.equal(String((result.specialist as any).refined_formulation || ""), "");
  assert.equal(String((result.specialist as any).rulesofthegame || ""), "");
  assert.equal(Array.isArray((result.specialist as any).statements), true);
});

test("rules contract normalizer preserves statements on ESCAPE and clears candidate fields", () => {
  const result = normalizeRulesOfTheGameOutputContract({
    specialist: {
      action: "ESCAPE",
      message: "That is off-topic.",
      question: "Should not survive",
      refined_formulation: "• We are punctual",
      rulesofthegame: "• We are punctual",
      statements: [],
      wants_recap: false,
      is_offtopic: true,
    },
    previousStatements: ["We are punctual", "We protect quality"],
  });

  assert.equal(result.intent, "ESCAPE");
  assert.equal(String((result.specialist as any).question || ""), "");
  assert.equal(String((result.specialist as any).refined_formulation || ""), "");
  assert.equal(String((result.specialist as any).rulesofthegame || ""), "");
  assert.deepEqual((result.specialist as any).statements, ["We are punctual", "We protect quality"]);
});
