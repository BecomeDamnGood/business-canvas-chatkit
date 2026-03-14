import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "./state.js";
import {
  applyStepStuckSupportAfterSpecialist,
  currentStepStuckCount,
  currentStepSupportMode,
} from "./stuck_support.js";

test("step stuck support escalates from first stuck turn to questions to exit", () => {
  const state = getDefaultState();

  applyStepStuckSupportAfterSpecialist({
    state,
    stepId: "strategy",
    activeSpecialist: "Strategy",
    specialist: { step_support_state: "stuck" },
  });
  assert.equal(currentStepStuckCount(state, "strategy"), 1);
  assert.equal(currentStepSupportMode(state, "strategy"), "normal");

  applyStepStuckSupportAfterSpecialist({
    state,
    stepId: "strategy",
    activeSpecialist: "Strategy",
    specialist: { step_support_state: "stuck" },
  });
  assert.equal(currentStepStuckCount(state, "strategy"), 2);
  assert.equal(currentStepSupportMode(state, "strategy"), "stuck_questions");

  applyStepStuckSupportAfterSpecialist({
    state,
    stepId: "strategy",
    activeSpecialist: "Strategy",
    specialist: { step_support_state: "stuck" },
  });
  assert.equal(currentStepSupportMode(state, "strategy"), "stuck_exit");
});

test("step stuck support resets after a usable reply", () => {
  const state = getDefaultState();
  (state as Record<string, unknown>).__step_stuck_count_by_step = { dream: 2 };
  (state as Record<string, unknown>).__step_support_mode_by_step = { dream: "stuck_questions" };

  applyStepStuckSupportAfterSpecialist({
    state,
    stepId: "dream",
    activeSpecialist: "Dream",
    specialist: { step_support_state: "ok" },
  });

  assert.equal(currentStepStuckCount(state, "dream"), 0);
  assert.equal(currentStepSupportMode(state, "dream"), "normal");
});

test("dream explainer user_state does not affect main step stuck support", () => {
  const state = getDefaultState();

  applyStepStuckSupportAfterSpecialist({
    state,
    stepId: "dream",
    activeSpecialist: "DreamExplainer",
    specialist: { user_state: "stuck" },
  });

  assert.equal(currentStepStuckCount(state, "dream"), 0);
  assert.equal(currentStepSupportMode(state, "dream"), "normal");
});
