import test from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_STATE_VERSION,
  getDefaultState,
  isSupportedStateVersion,
  migrateState,
  normalizeState,
  normalizeStateLanguageSource,
} from "../core/state.js";
import {
  applyRunStepServerTransients,
  createRunStepPreflightHelpers,
} from "./run_step_preflight.js";

const helpers = createRunStepPreflightHelpers({
  step0Id: "step_0",
  currentStateVersion: CURRENT_STATE_VERSION,
  actionBootstrapPollToken: "ACTION_BOOTSTRAP_POLL",
  normalizeState,
  migrateState,
  isSupportedStateVersion,
  normalizeStateLanguageSource,
  detectLegacySessionMarkers: () => [],
  detectInvalidContractStateMarkers: () => [],
  syncDreamRuntimeMode: () => {},
  isPristineStateForStart: () => false,
  extractUserMessageFromWrappedInput: (raw) => raw,
  looksLikeMetaInstruction: () => false,
  maybeSeedStep0CandidateFromInitialMessage: (state) => state,
  bumpUiI18nCounter: () => {},
});

test("initializeRunStepPreflight flags unsupported future state versions", () => {
  const result = helpers.initializeRunStepPreflight({
    args: {
      state: {
        ...getDefaultState(),
        state_version: "14",
      },
      user_message: "",
    },
    localeHint: "nl",
    localeHintSource: "none",
    inputMode: "widget",
    uiI18nTelemetry: null,
  });

  assert.equal(result.unsupportedStateVersion, true);
  assert.equal(result.migrationApplied, false);
  assert.equal(result.migrationFromVersion, "14");
  assert.equal(result.serverState.sessionTurnIndex, 1);
  assert.match(result.serverState.sessionId, /^[0-9a-f-]{36}$/i);
});

test("applyRunStepServerTransients restores runtime-only session and phase fields", () => {
  const state = applyRunStepServerTransients(getDefaultState(), {
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    sessionStartedAt: "2026-03-11T12:00:00.000Z",
    sessionTurnIndex: 7,
    uiPhaseByStep: {
      dream: "dream.ask.v1",
    },
  }) as Record<string, unknown>;

  assert.equal(state.__session_id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(state.__session_started_at, "2026-03-11T12:00:00.000Z");
  assert.equal(state.__session_turn_index, 7);
  assert.deepEqual(state.__ui_phase_by_step, { dream: "dream.ask.v1" });
});
