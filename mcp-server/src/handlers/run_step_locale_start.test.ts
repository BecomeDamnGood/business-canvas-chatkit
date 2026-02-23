import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultState } from "../core/state.js";
import {
  applyUiGateState,
  deriveBootstrapContract,
  resolveUiGateForceRecoverMs,
} from "./run_step_locale_start.js";

const FLAGS = {
  uiLocaleReadyGateV1: true,
  uiInteractiveFallbackV1: true,
  uiBootstrapPollActionV1: true,
} as const;

test("recovery never forces ui_strings_status=ready when critical keys are missing", () => {
  const previousState = {
    ...getDefaultState(),
    current_step: "step_0",
    language: "nl",
    ui_strings: {},
    ui_strings_status: "pending",
    ui_bootstrap_status: "awaiting_locale",
    ui_gate_status: "waiting_locale",
    ui_gate_since_ms: 1,
    ui_strings_critical_ready: "false",
    ui_strings_full_ready: "false",
    bootstrap_phase: "waiting_locale",
  } as const;
  const nextState = {
    ...previousState,
  };

  const recovered = applyUiGateState({
    previousState,
    nextState,
    forceRecoverMs: 1,
    flags: FLAGS,
    criticalKeys: ["btnStart"],
    nowMs: 10_000,
  });

  assert.equal(String((recovered as any).bootstrap_phase || ""), "recovery");
  assert.notEqual(String((recovered as any).ui_strings_status || ""), "ready");
  assert.equal(String((recovered as any).ui_bootstrap_status || ""), "awaiting_locale");
  assert.equal(String((recovered as any).ui_strings_critical_ready || ""), "false");
  assert.equal(String((recovered as any).ui_strings_full_ready || ""), "false");
});

test("deriveBootstrapContract keeps explicit recovery phase stable", () => {
  const state = {
    ...getDefaultState(),
    current_step: "step_0",
    language: "nl",
    ui_strings_status: "pending",
    ui_gate_status: "ready",
    bootstrap_phase: "recovery",
  } as const;

  const contract = deriveBootstrapContract({
    state,
    flags: FLAGS,
    criticalKeys: ["btnStart"],
    nowMs: Date.now(),
  });

  assert.equal(contract.phase, "recovery");
  assert.equal(contract.waiting, false);
  assert.equal(contract.ready, true);
});

test("resolveUiGateForceRecoverMs uses shared sane defaults", () => {
  assert.equal(resolveUiGateForceRecoverMs(undefined), 4000);
  assert.equal(resolveUiGateForceRecoverMs("30000"), 30000);
  assert.equal(resolveUiGateForceRecoverMs("0"), 4000);
  assert.equal(resolveUiGateForceRecoverMs("bad", 1234), 1234);
});
