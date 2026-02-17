import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "./state.js";
import {
  deriveTransitionEventFromLegacy,
  orchestrateFromTransition,
} from "./orchestrator.js";

test("deriveTransitionEventFromLegacy maps proceed_to_purpose", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).last_specialist_result = { proceed_to_purpose: "true" };

  const event = deriveTransitionEventFromLegacy({ state, userMessage: "" });
  assert.equal(event.type, "PROCEED_TO_SPECIFIC");
  assert.equal((event as any).toStep, "purpose");
});

test("orchestrateFromTransition handles specialist switch in same step", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  const decision = orchestrateFromTransition({
    state,
    userMessage: "",
    event: {
      type: "SPECIALIST_SWITCH",
      fromSpecialist: "Dream",
      toSpecialist: "DreamExplainer",
      sameStep: true,
    },
  });

  assert.equal(decision.current_step, "dream");
  assert.equal(decision.specialist_to_call, "DreamExplainer");
});

