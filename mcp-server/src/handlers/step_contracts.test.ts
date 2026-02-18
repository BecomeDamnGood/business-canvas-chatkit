import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { applyStateUpdate } from "./run_step.js";

test("offtopic contract: applyStateUpdate does not mutate canonical finals", () => {
  const prev = getDefaultState();
  const decision: any = {
    current_step: "purpose",
    specialist_to_call: "Purpose",
  };
  const specialistResult = {
    action: "CONFIRM",
    is_offtopic: true,
    purpose: "Should never be persisted",
  };

  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).purpose_final || ""), "");
});

test("final ownership: dream output is staged and does not mutate other committed finals", () => {
  const prev = getDefaultState();
  const decision: any = {
    current_step: "dream",
    specialist_to_call: "Dream",
  };
  const specialistResult = {
    action: "CONFIRM",
    is_offtopic: false,
    dream: "A clear dream",
    purpose: "Should not be persisted in dream step",
  };

  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).dream_final || ""), "");
  assert.equal(String((next as any).provisional_by_step?.dream || ""), "A clear dream");
  assert.equal(String((next as any).purpose_final || ""), "");
});
