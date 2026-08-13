import test from "node:test";
import assert from "node:assert/strict";

import { CURRENT_STATE_VERSION, normalizeState, type CanvasState } from "../core/state.js";
import { createRunStepPreflightHelpers } from "./run_step_preflight.js";

function createPreflightHelpers() {
  return createRunStepPreflightHelpers({
    step0Id: "step_0",
    currentStateVersion: CURRENT_STATE_VERSION,
    actionBootstrapPollToken: "ACTION_BOOTSTRAP_POLL",
    normalizeState,
    migrateState: (state) => state,
    isSupportedStateVersion: () => true,
    normalizeStateLanguageSource: () => "",
    detectLegacySessionMarkers: () => [],
    detectInvalidContractStateMarkers: () => [],
    syncDreamRuntimeMode: () => {},
    isPristineStateForStart: (state: CanvasState) =>
      String(state.current_step || "") === "step_0" &&
      String((state as Record<string, unknown>).step_0_final || "").trim() === "" &&
      String((state as Record<string, unknown>).dream_final || "").trim() === "" &&
      String((state as Record<string, unknown>).intro_shown_session || "").trim() !== "true" &&
      Object.keys((((state as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>)).length === 0,
    extractUserMessageFromWrappedInput: () => "",
    looksLikeMetaInstruction: () => false,
    maybeSeedStep0CandidateFromInitialMessage: (state) => state,
    bumpUiI18nCounter: () => {},
  });
}

test("fresh sessions are forced back to step_0 even when the incoming current step is later in the flow", () => {
  const helpers = createPreflightHelpers();
  const result = helpers.initializeRunStepPreflight({
    args: {
      state: {
        current_step: "role",
        started: "false",
      },
      user_message: "I run Mindd and need help with our role.",
    },
    localeHint: "en",
    localeHintSource: "none",
    inputMode: "chat",
    uiI18nTelemetry: {},
  });

  assert.equal(result.state.current_step, "step_0");
});

test("sessions with prior interaction history are not forced back to step_0", () => {
  const helpers = createPreflightHelpers();
  const result = helpers.initializeRunStepPreflight({
    args: {
      state: {
        current_step: "role",
        started: "false",
        intro_shown_session: "true",
        last_specialist_result: {
          action: "ASK",
        },
      },
      user_message: "Continue.",
    },
    localeHint: "en",
    localeHintSource: "none",
    inputMode: "chat",
    uiI18nTelemetry: {},
  });

  assert.equal(result.state.current_step, "role");
});
