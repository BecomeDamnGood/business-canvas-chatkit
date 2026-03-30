import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_STEP0_PREWARM,
  buildStep0PrewarmKey,
  normalizeStep0PrewarmText,
  shouldScheduleStep0Prewarm,
} from "./step0_prewarm.js";

test("step0 prewarm keeps a dedicated explicit action token", () => {
  assert.equal(ACTION_STEP0_PREWARM, "ACTION_STEP0_PREWARM");
});

test("step0 prewarm does not schedule for empty input", () => {
  const decision = shouldScheduleStep0Prewarm({
    currentStep: "step_0",
    started: "false",
    inputValue: "   ",
    lastScheduledKey: "",
    inFlightKey: "",
  });

  assert.equal(decision.shouldSchedule, false);
  assert.equal(decision.key, "");
});

test("step0 prewarm schedules exactly once for a new normalized input key", () => {
  const first = shouldScheduleStep0Prewarm({
    currentStep: "step_0",
    started: "false",
    inputValue: "  Mijn   bedrijf heet   Nova  ",
    lastScheduledKey: "",
    inFlightKey: "",
  });
  const second = shouldScheduleStep0Prewarm({
    currentStep: "step_0",
    started: "false",
    inputValue: "Mijn bedrijf heet Nova",
    lastScheduledKey: first.key,
    inFlightKey: "",
  });

  assert.equal(first.shouldSchedule, true);
  assert.equal(first.key, "Mijn bedrijf heet Nova");
  assert.equal(second.shouldSchedule, false);
});

test("step0 prewarm normalized key changes when the semantic input changes", () => {
  assert.equal(
    normalizeStep0PrewarmText("  Mijn   bedrijf heet   Nova  "),
    "Mijn bedrijf heet Nova"
  );
  assert.notEqual(
    buildStep0PrewarmKey("Mijn bedrijf heet Nova"),
    buildStep0PrewarmKey("Mijn bedrijf heet Luna")
  );
});

test("step0 prewarm does not schedule outside step_0 or after start", () => {
  const wrongStep = shouldScheduleStep0Prewarm({
    currentStep: "dream",
    started: "false",
    inputValue: "Mijn bedrijf heet Nova",
    lastScheduledKey: "",
    inFlightKey: "",
  });
  const started = shouldScheduleStep0Prewarm({
    currentStep: "step_0",
    started: "true",
    inputValue: "Mijn bedrijf heet Nova",
    lastScheduledKey: "",
    inFlightKey: "",
  });

  assert.equal(wrongStep.shouldSchedule, false);
  assert.equal(started.shouldSchedule, false);
});
