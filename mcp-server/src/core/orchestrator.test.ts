// src/core/orchestrator.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { orchestrate, buildSpecialistInput } from "./orchestrator";
import { getDefaultState, type CanvasState } from "./state";
import { STEP_0_ID, STEP_0_SPECIALIST } from "../steps/step_0_validation";
import { DREAM_STEP_ID, DREAM_SPECIALIST } from "../steps/dream";

function makeState(partial: Partial<CanvasState> = {}): CanvasState {
  return { ...getDefaultState(), ...partial };
}

test("orchestrate: fresh session defaults to step_0 specialist and shows both intros", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "false",
    intro_shown_for_step: "",
    active_specialist: "",
    last_specialist_result: {},
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);

  assert.equal(d.show_session_intro, "true");
  assert.equal(d.show_step_intro, "true");
  assert.equal(d.intro_shown_session, "true");

  assert.match(d.specialist_input_template, /CURRENT_STEP_ID: step_0 \| USER_MESSAGE: \{\{USER_MESSAGE\}\}/);

  // Debug sanity
  assert.equal(d.debug.current_step_in, STEP_0_ID);
  assert.equal(d.debug.triggers.proceed_to_dream, "false");
  assert.equal(d.debug.triggers.proceed_to_purpose, "false");
  assert.equal(d.debug.triggers.suggest_dreambuilder, "false");
});

test("orchestrate: once intros are shown, show_* flags become false for same step", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "true",
    intro_shown_for_step: STEP_0_ID,
    last_specialist_result: {},
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);
  assert.equal(d.show_session_intro, "false");
  assert.equal(d.show_step_intro, "false");
  assert.equal(d.intro_shown_session, "true");
});

test("orchestrate: proceed_to_dream overrides routing to Dream specialist", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "true",
    intro_shown_for_step: STEP_0_ID,
    last_specialist_result: {
      proceed_to_dream: "true",
      action: "CONFIRM",
    },
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, DREAM_STEP_ID);
  assert.equal(d.specialist_to_call, DREAM_SPECIALIST);

  // step intro should show if dream intro not shown yet
  assert.equal(d.show_step_intro, "true");
  assert.equal(d.show_session_intro, "false");
});

test("orchestrate: proceed_to_purpose overrides routing to Purpose specialist", () => {
  const s = makeState({
    current_step: "dream",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    last_specialist_result: {
      proceed_to_purpose: "true",
    },
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, "purpose");
  assert.equal(d.specialist_to_call, "Purpose");
});

test("orchestrate: when active_specialist is DreamExplainer and suggest_dreambuilder=true, keep DreamExplainer", () => {
  const s = makeState({
    current_step: "dream",
    active_specialist: "DreamExplainer",
    intro_shown_session: "true",
    last_specialist_result: {
      suggest_dreambuilder: "true",
      action: "ASK",
    },
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, "dream");
  assert.equal(d.specialist_to_call, "DreamExplainer");
});

test("orchestrate: handshake start routes to DreamExplainer when in dream and action=CONFIRM & suggest_dreambuilder=true", () => {
  const s = makeState({
    current_step: "dream",
    active_specialist: "Dream",
    intro_shown_session: "true",
    last_specialist_result: {
      action: "CONFIRM",
      suggest_dreambuilder: "true",
    },
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, "dream");
  assert.equal(d.specialist_to_call, "DreamExplainer");
});

test("orchestrate: invalid current_step clamps to step_0", () => {
  const s = makeState({
    // @ts-expect-error intentionally invalid
    current_step: "not_a_step",
    intro_shown_session: "true",
    last_specialist_result: {},
  });

  const d = orchestrate(s);

  assert.equal(d.next_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);
});

test("buildSpecialistInput: replaces {{USER_MESSAGE}} correctly", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "false",
    intro_shown_for_step: "",
    last_specialist_result: {},
  });

  const d = orchestrate(s);
  const msg = "Ik heb een reclamebureau genaamd Mindd";
  const input = buildSpecialistInput(d, msg);

  assert.equal(input, `CURRENT_STEP_ID: ${STEP_0_ID} | USER_MESSAGE: ${msg}`);
});
