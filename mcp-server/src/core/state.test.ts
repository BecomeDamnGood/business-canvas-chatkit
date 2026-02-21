// Unit tests for canonical finals: getFinalsSnapshot, FINALS_KEYS, persistence
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINALS_KEYS,
  getDefaultState,
  getFinalsSnapshot,
  migrateState,
  normalizeState,
} from "./state.js";

test("getFinalsSnapshot: empty state returns empty object", () => {
  const state = getDefaultState();
  const snapshot = getFinalsSnapshot(state);
  assert.equal(Object.keys(snapshot).length, 0, "no finals when all empty");
});

test("getFinalsSnapshot: returns only non-empty finals", () => {
  const state = getDefaultState();
  (state as any).business_name = "Acme";
  (state as any).dream_final = "Scale globally";
  (state as any).purpose_final = ""; // must be omitted
  const snapshot = getFinalsSnapshot(state);
  assert.equal(snapshot.business_name, "Acme");
  assert.equal(snapshot.dream_final, "Scale globally");
  assert.equal(snapshot.purpose_final, undefined, "empty final must not appear");
  assert.equal(Object.keys(snapshot).length, 2);
});

test("getFinalsSnapshot: keys are stable (FINALS_KEYS)", () => {
  assert.ok(FINALS_KEYS.includes("business_name"));
  assert.ok(FINALS_KEYS.includes("step_0_final"));
  assert.ok(FINALS_KEYS.includes("dream_final"));
  assert.ok(FINALS_KEYS.includes("presentation_brief_final"));
  assert.equal(FINALS_KEYS.length, 12);
});

test("finals persistence: normalizeState preserves existing finals", () => {
  const raw = {
    ...getDefaultState(),
    business_name: "MyCo",
    dream_final: "Dream text",
    purpose_final: "Purpose text",
  };
  const normalized = normalizeState(raw);
  const snapshot = getFinalsSnapshot(normalized);
  assert.equal(snapshot.business_name, "MyCo");
  assert.equal(snapshot.dream_final, "Dream text");
  assert.equal(snapshot.purpose_final, "Purpose text");
});

test("state migration v6: legacy sessions are hard-reset and clear legacy finals", () => {
  const raw = {
    state_version: "1",
    current_step: "step_0",
    active_specialist: "",
    intro_shown_for_step: "",
    intro_shown_session: "false",
    language: "",
    language_locked: "false",
    last_specialist_result: {},
    step_0_final: "",
    dream_final: "Existing dream",
    business_name: "Venture",
    summary_target: "unknown",
  };
  const migrated = migrateState(raw);
  const snapshot = getFinalsSnapshot(migrated);
  assert.equal(snapshot.dream_final, undefined);
  assert.equal(snapshot.business_name, undefined);
  assert.equal(String((migrated as any).state_version), "6");
});

test("state migration v6: staged provisional values backfill source as system_generated", () => {
  const migrated = migrateState({
    ...getDefaultState(),
    state_version: "5",
    provisional_by_step: {
      dream: "Mindd dreams of a better future.",
      purpose: "To build meaningful work.",
    },
  });
  assert.equal(String((migrated as any).state_version), "6");
  assert.deepEqual((migrated as any).provisional_source_by_step, {
    dream: "system_generated",
    purpose: "system_generated",
  });
});
