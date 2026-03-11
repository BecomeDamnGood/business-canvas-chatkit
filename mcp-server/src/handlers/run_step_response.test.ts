import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepResponseHelpers } from "./run_step_response.js";

function buildHelpers() {
  return createRunStepResponseHelpers({
    applyUiClientActionContract: () => {},
    parseMenuFromContractIdForStep: () => "",
    labelKeysForMenuActionCodes: () => [],
    onUiParityError: () => {},
    attachRegistryPayload: (payload) => payload,
    uiI18nTelemetry: {},
    tokenLoggingEnabled: false,
    baselineModel: "gpt-5-mini",
    getMigrationApplied: () => false,
    getMigrationFromVersion: () => "",
    getBlockingMarkerClass: () => "none",
    resolveTurnTokenUsage: () => ({
      usage: {
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        provider_available: false,
      },
      attempts: 0,
      models: [],
    }),
  });
}

function buildTokenLoggingHelpers() {
  return createRunStepResponseHelpers({
    applyUiClientActionContract: () => {},
    parseMenuFromContractIdForStep: () => "",
    labelKeysForMenuActionCodes: () => [],
    onUiParityError: () => {},
    attachRegistryPayload: (payload) => payload,
    uiI18nTelemetry: {},
    tokenLoggingEnabled: true,
    baselineModel: "gpt-5-mini",
    getMigrationApplied: () => false,
    getMigrationFromVersion: () => "",
    getBlockingMarkerClass: () => "none",
    resolveTurnTokenUsage: () => ({
      usage: {
        input_tokens: 12,
        output_tokens: 8,
        total_tokens: 20,
        provider_available: true,
      },
      attempts: 1,
      models: ["gpt-5-mini"],
    }),
  });
}

test("finalizeResponse logs wording-choice render decisions with compare and prompt fields", () => {
  const helpers = buildHelpers();
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map((value) => String(value)).join(" "));
  };

  try {
    helpers.finalizeResponse({
      ok: false,
      tool: "run_step",
      current_step_id: "strategy",
      active_specialist: "Strategy",
      text: "",
      prompt: "Waar focus je nog meer op binnen je strategie?",
      specialist: {
        ui_contract_id: "strategy:valid_output:STRATEGY_MENU_CONFIRM:v1",
      },
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        bootstrap_session_id: "bs_test",
        last_specialist_result: {
          wording_choice_pending: "true",
          wording_choice_mode: "list",
          wording_choice_presentation: "picker",
          wording_choice_variant: "",
          wording_choice_compare_mode: "",
          wording_choice_compare_cursor: "",
          wording_choice_compare_units: [],
          wording_choice_compare_segments: [],
          wording_choice_selected: "",
          wording_choice_user_label: "Zo heb ik je input geinterpreteerd:",
          wording_choice_suggestion_label: "Dit zou mijn suggestie zijn:",
          wording_choice_user_items: ["Punt 1", "Punt 2", "Punt 3"],
          wording_choice_suggestion_items: ["Punt A", "Punt B", "Punt C", "Punt D"],
        },
      } as any,
      ui: {
        view: {
          mode: "interactive",
          variant: "wording_choice",
        },
        wording_choice: {
          enabled: true,
          mode: "list",
          user_label: "Zo heb ik je input geinterpreteerd:",
          suggestion_label: "Dit zou mijn suggestie zijn:",
          instruction: "Klik alsjeblieft wat het beste bij je past.",
          user_items: ["Punt 1", "Punt 2", "Punt 3"],
          suggestion_items: ["Punt A", "Punt B", "Punt C", "Punt D"],
        },
      },
    });
  } finally {
    console.log = originalConsoleLog;
  }

  const event = captured
    .map((line) => JSON.parse(line))
    .find((entry) => entry.event === "run_step_ui_render_decision");

  assert.ok(event);
  assert.equal(event.step_id, "strategy");
  assert.equal(event.ui_view_variant, "wording_choice");
  assert.equal(event.prompt_text, "Waar focus je nog meer op binnen je strategie?");
  assert.equal(event.prompt_present, "true");
  assert.equal(event.question_text, "");
  assert.equal(event.question_present, "false");
  assert.equal(event.wording_choice_enabled, "true");
  assert.equal(event.wording_choice_pending, "true");
  assert.equal(event.wording_choice_mode, "list");
  assert.equal(event.wording_choice_presentation, "picker");
  assert.equal(event.wording_choice_compare_mode, "");
  assert.equal(event.wording_choice_user_label, "Zo heb ik je input geinterpreteerd:");
  assert.equal(event.wording_choice_suggestion_label, "Dit zou mijn suggestie zijn:");
  assert.equal(event.wording_choice_user_items_count, 3);
  assert.equal(event.wording_choice_suggestion_items_count, 4);
});

test("finalizeResponse skips session log file writes unless disk logging is explicitly enabled", () => {
  const previousLocalDev = process.env.LOCAL_DEV;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDiskFlag = process.env.BSC_SESSION_TOKEN_LOG_TO_DISK;
  process.env.LOCAL_DEV = "0";
  process.env.NODE_ENV = "production";
  delete process.env.BSC_SESSION_TOKEN_LOG_TO_DISK;

  try {
    const helpers = buildTokenLoggingHelpers();
    const response = helpers.finalizeResponse({
      ok: true,
      tool: "run_step",
      current_step_id: "dream",
      active_specialist: "Dream",
      text: "ok",
      specialist: {
        ui_contract_id: "dream:valid_output:DREAM_CONFIRM:v1",
      },
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        __session_id: "session-123",
        __session_started_at: "2026-03-11T10:00:00.000Z",
        __session_turn_id: "turn-123",
      } as any,
    });

    assert.equal("__session_log_file" in ((response as any).state || {}), false);
  } finally {
    if (previousLocalDev === undefined) delete process.env.LOCAL_DEV;
    else process.env.LOCAL_DEV = previousLocalDev;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDiskFlag === undefined) delete process.env.BSC_SESSION_TOKEN_LOG_TO_DISK;
    else process.env.BSC_SESSION_TOKEN_LOG_TO_DISK = previousDiskFlag;
  }
});
