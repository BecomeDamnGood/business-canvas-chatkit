import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUiGateState,
  enforceUiStringsReadinessInvariant,
} from "./bootstrap_runtime.js";
import { getDefaultState, type CanvasState } from "./state.js";

const CRITICAL_KEYS = ["btnStart"];

function buildState(overrides: Record<string, unknown>): CanvasState {
  return {
    ...getDefaultState(),
    ...overrides,
  } as CanvasState;
}

test("enforceUiStringsReadinessInvariant downgrades non-EN ready state when ui_strings_lang mismatches language", () => {
  const state = buildState({
    language: "nl",
    ui_strings_lang: "en",
    ui_strings_requested_lang: "nl",
    ui_strings_status: "ready",
    ui_bootstrap_status: "ready",
    bootstrap_phase: "ready",
    ui_strings_critical_ready: "true",
    ui_strings_full_ready: "true",
    ui_strings_background_inflight: "false",
    ui_strings: {
      btnStart: "Start with Validation & Business Name",
    },
  });

  const normalized = enforceUiStringsReadinessInvariant({ state, criticalKeys: CRITICAL_KEYS });
  assert.equal(String((normalized as any).ui_strings_status || ""), "pending");
  assert.equal(String((normalized as any).ui_bootstrap_status || ""), "awaiting_locale");
  assert.equal(String((normalized as any).bootstrap_phase || ""), "waiting_locale");
  assert.equal(String((normalized as any).ui_strings_critical_ready || ""), "false");
  assert.equal(String((normalized as any).ui_strings_full_ready || ""), "false");
});

test("applyUiGateState does not force ready on timeout when non-EN ui_strings_lang mismatches language", () => {
  const nowMs = Date.now();
  const previousState = buildState({
    language: "nl",
    ui_gate_status: "waiting_locale",
    ui_gate_since_ms: nowMs - 10_000,
  });
  const nextState = buildState({
    language: "nl",
    ui_strings_lang: "en",
    ui_strings_requested_lang: "nl",
    ui_strings_status: "ready",
    ui_bootstrap_status: "ready",
    bootstrap_phase: "ready",
    ui_strings_critical_ready: "true",
    ui_strings_full_ready: "true",
    ui_strings_background_inflight: "false",
    ui_strings: {
      btnStart: "Start with Validation & Business Name",
    },
  });

  const gated = applyUiGateState({
    previousState,
    nextState,
    forceRecoverMs: 100,
    flags: {
      uiLocaleReadyGateV1: true,
      uiInteractiveFallbackV1: true,
      uiBootstrapPollActionV1: true,
    },
    criticalKeys: CRITICAL_KEYS,
    nowMs,
  });

  assert.equal(String((gated as any).ui_gate_status || ""), "waiting_locale");
  assert.equal(String((gated as any).bootstrap_phase || ""), "waiting_locale");
  assert.notEqual(String((gated as any).ui_strings_status || ""), "ready");
});

test("applyUiGateState can recover to ready when non-EN language and ui_strings_lang are aligned", () => {
  const nowMs = Date.now();
  const previousState = buildState({
    language: "nl",
    ui_gate_status: "waiting_locale",
    ui_gate_since_ms: nowMs - 10_000,
  });
  const nextState = buildState({
    language: "nl",
    ui_strings_lang: "nl",
    ui_strings_requested_lang: "nl",
    ui_strings_status: "ready",
    ui_bootstrap_status: "ready",
    bootstrap_phase: "ready",
    ui_strings_critical_ready: "true",
    ui_strings_full_ready: "true",
    ui_strings_background_inflight: "false",
    ui_strings: {
      btnStart: "Start met Validatie & Bedrijfsnaam",
    },
  });

  const gated = applyUiGateState({
    previousState,
    nextState,
    forceRecoverMs: 100,
    flags: {
      uiLocaleReadyGateV1: true,
      uiInteractiveFallbackV1: true,
      uiBootstrapPollActionV1: true,
    },
    criticalKeys: CRITICAL_KEYS,
    nowMs,
  });

  assert.equal(String((gated as any).ui_gate_status || ""), "ready");
  assert.equal(String((gated as any).bootstrap_phase || ""), "ready");
  assert.equal(String((gated as any).ui_strings_status || ""), "ready");
});
