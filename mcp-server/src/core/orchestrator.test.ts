// src/core/orchestrator.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { orchestrate } from "./orchestrator.js";
import { getDefaultState, type CanvasState } from "./state.js";
import { STEP_0_ID, STEP_0_SPECIALIST } from "../steps/step_0_validation.js";

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

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);

  assert.equal(d.show_session_intro, "true");
  assert.equal(d.show_step_intro, "true");
  assert.equal(d.intro_shown_session, "true");

  assert.match(d.specialist_input, /CURRENT_STEP_ID: step_0 \| USER_MESSAGE: /);
});

test("orchestrate: once intros are shown, show_* flags become false for same step", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "true",
    intro_shown_for_step: STEP_0_ID,
    last_specialist_result: {},
  });

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);
  assert.equal(d.show_session_intro, "false");
  assert.equal(d.show_step_intro, "false");
  assert.equal(d.intro_shown_session, "true");
});

test("orchestrate: ignores legacy proceed_to_dream and stays on current step", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "true",
    intro_shown_for_step: STEP_0_ID,
    last_specialist_result: {
      proceed_to_dream: "true",
      action: "CONFIRM",
    },
  });

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);
  assert.equal(d.show_step_intro, "false");
  assert.equal(d.show_session_intro, "false");
});

test("orchestrate: ignores legacy proceed_to_purpose and stays on current step", () => {
  const s = makeState({
    current_step: "dream",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    last_specialist_result: {
      proceed_to_purpose: "true",
    },
  });

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, "dream");
  assert.equal(d.specialist_to_call, "Dream");
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

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, "dream");
  assert.equal(d.specialist_to_call, "DreamExplainer");
});

test("orchestrate: no Dream->DreamExplainer handshake on legacy CONFIRM", () => {
  const s = makeState({
    current_step: "dream",
    active_specialist: "Dream",
    intro_shown_session: "true",
    last_specialist_result: {
      action: "CONFIRM",
      suggest_dreambuilder: "true",
    },
  });

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, "dream");
  assert.equal(d.specialist_to_call, "Dream");
});

test("orchestrate: invalid current_step clamps to step_0", () => {
  const s = makeState({
    current_step: "not_a_step" as CanvasState["current_step"],
    intro_shown_session: "true",
    last_specialist_result: {},
  });

  const d = orchestrate({ state: s, userMessage: "" });

  assert.equal(d.current_step, STEP_0_ID);
  assert.equal(d.specialist_to_call, STEP_0_SPECIALIST);
});

test("orchestrate: specialist_input contains user message", () => {
  const s = makeState({
    current_step: STEP_0_ID,
    intro_shown_session: "false",
    intro_shown_for_step: "",
    last_specialist_result: {},
  });

  const msg = "I have an advertising agency called Mindd";
  const d = orchestrate({ state: s, userMessage: msg });

  assert.equal(d.specialist_input, `CURRENT_STEP_ID: ${STEP_0_ID} | USER_MESSAGE: ${msg}`);
});
