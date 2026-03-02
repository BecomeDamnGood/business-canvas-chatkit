#!/usr/bin/env node
import assert from "node:assert/strict";
import { run_step } from "../src/handlers/run_step.ts";
import { CURRENT_STATE_VERSION, getDefaultState } from "../src/core/state.ts";

process.env.TS_NODE_TRANSPILE_ONLY = process.env.TS_NODE_TRANSPILE_ONLY || "true";
process.env.UI_LOCALE_READY_GATE_V1 = process.env.UI_LOCALE_READY_GATE_V1 || "1";
process.env.UI_START_TRIGGER_LANG_RESOLVE_V1 = process.env.UI_START_TRIGGER_LANG_RESOLVE_V1 || "1";

function stateOf(result) {
  return result && typeof result === "object" && result.state && typeof result.state === "object"
    ? result.state
    : {};
}

function assertContractInvariants(label, result) {
  const state = stateOf(result);
  assert.equal(Boolean(result && typeof result === "object"), true, `${label}: result must be object`);
  assert.equal(String(state.ui_strings_requested_lang || "").trim().length > 0, true, `${label}: requested lang required`);
  assert.equal(String(state.view_contract_version || ""), "v3_ssot_rigid", `${label}: view contract version mismatch`);
  const gate = String(state.ui_gate_status || "");
  const gateReason = String(state.ui_gate_reason || "");
  const phase = String(state.bootstrap_phase || "");
  const uiStatus = String(state.ui_strings_status || "");
  const uiLang = String(state.ui_strings_lang || "").trim().toLowerCase();
  const requested = String(state.ui_strings_requested_lang || "").trim().toLowerCase();
  const fallbackApplied = String(state.ui_strings_fallback_applied || "false");
  const fallbackReason = String(state.ui_strings_fallback_reason || "");
  if (gate === "ready") {
    assert.equal(gateReason, "", `${label}: ready gate reason must be empty`);
    assert.equal(uiStatus, "ready", `${label}: ready gate requires ready ui strings`);
    assert.equal(uiLang.length > 0, true, `${label}: ready gate requires ui lang`);
    if (uiLang !== requested) {
      assert.equal(fallbackApplied, "true", `${label}: lang mismatch requires fallback_applied`);
      assert.equal(Boolean(fallbackReason), true, `${label}: lang mismatch requires fallback_reason`);
    }
  }
  const errorType = String((result && result.error && result.error.type) || "");
  if (errorType === "session_upgrade_required") {
    assert.equal(gate, "blocked", `${label}: upgrade-required must be blocked`);
    assert.equal(phase, "failed", `${label}: upgrade-required must be failed phase`);
    assert.equal(gateReason, "session_upgrade_required", `${label}: upgrade-required must set gate reason`);
  }
}

async function main() {
  const cases = [];

  const legacyWidget = await run_step({
    current_step_id: "step_0",
    user_message: "Help mij met mijn businessplan voor mijn reclamebureau Mindd",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      state_version: "1",
      current_step: "step_0",
      language: "nl",
      language_source: "message_detect",
      response_kind: "run_step",
    },
  });
  cases.push(["legacy_widget", legacyWidget]);
  assert.equal(legacyWidget.ok, true, "legacy_widget: expected non-blocked success");
  assert.equal(String(stateOf(legacyWidget).state_version || ""), CURRENT_STATE_VERSION, "legacy_widget: migrated");
  assert.equal(String(stateOf(legacyWidget).business_name || ""), "Mindd", "legacy_widget: seeded business name");

  const legacyWidgetStart = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: stateOf(legacyWidget),
  });
  cases.push(["legacy_widget_start", legacyWidgetStart]);
  assert.equal(legacyWidgetStart.ok, true, "legacy_widget_start: expected success");
  assert.equal(String(stateOf(legacyWidgetStart).business_name || ""), "Mindd", "legacy_widget_start: business name retained");

  const legacyChat = await run_step({
    current_step_id: "step_0",
    user_message: "Help met mijn businessplan voor mijn reclamebureau Mindd",
    input_mode: "chat",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      state_version: "1",
      response_kind: "run_step",
      response_seq: 0,
    },
  });
  cases.push(["legacy_chat", legacyChat]);
  assert.equal(legacyChat.ok, true, "legacy_chat: expected non-blocked success");
  assert.equal(String(stateOf(legacyChat).state_version || ""), CURRENT_STATE_VERSION, "legacy_chat: migrated");

  const legacyChatStart = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: stateOf(legacyChat),
  });
  cases.push(["legacy_chat_start", legacyChatStart]);

  const unhealableLegacy = await run_step({
    current_step_id: "purpose",
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      started: "true",
      last_specialist_result: {
        action: "CONFIRM",
        confirmation_question: "Legacy confirm marker should block",
      },
    },
  });
  cases.push(["unhealable_legacy", unhealableLegacy]);
  assert.equal(String(unhealableLegacy.error?.type || ""), "session_upgrade_required", "unhealable_legacy: expected hard block");

  const invalidGateState = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      started: "true",
      ui_gate_status: "not_valid",
    },
  });
  cases.push(["invalid_gate", invalidGateState]);
  assert.equal(String(invalidGateState.error?.type || ""), "invalid_state", "invalid_gate: invalid state should fail closed");

  const invalidReadyLang = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      ...getDefaultState(),
      started: "true",
      language: "nl",
      language_source: "locale_hint",
      ui_strings_status: "ready",
      ui_strings_requested_lang: "nl",
      ui_strings_lang: "",
      ui_gate_status: "ready",
      ui_gate_reason: "",
      ui_bootstrap_status: "ready",
      bootstrap_phase: "ready",
    },
  });
  cases.push(["invalid_ready_lang", invalidReadyLang]);
  const invalidReadyLangState = stateOf(invalidReadyLang);
  assert.equal(
    !(
      String(invalidReadyLangState.ui_gate_status || "") === "ready" &&
      String(invalidReadyLangState.ui_strings_lang || "").trim() === ""
    ),
    true,
    "invalid_ready_lang: ready gate may never carry empty ui_strings_lang"
  );

  const freshNl = await run_step({
    current_step_id: "step_0",
    user_message: "Help mij met mijn businessplan voor mijn reclamebureau genaamd Mindd",
    input_mode: "chat",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      ...getDefaultState(),
      response_seq: 0,
    },
  });
  cases.push(["fresh_nl", freshNl]);

  const seededNoClickStart = await run_step({
    current_step_id: "step_0",
    user_message: "Help mij met mijn businessplan voor mijn reclamebureau genaamd Mindd",
    input_mode: "chat",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      ...getDefaultState(),
      started: "false",
      intro_shown_session: "false",
      response_seq: 0,
    },
  });
  cases.push(["seeded_no_click_start", seededNoClickStart]);
  const seededNoClickState = stateOf(seededNoClickStart);
  const seededNoClickStartHint = String((seededNoClickState.ui_strings || {}).startHint || "").trim();
  assert.equal(String(seededNoClickState.step_0_final || ""), "", "seeded_no_click_start: step_0 must stay unseeded before explicit start");
  assert.equal(String(seededNoClickState.started || "").toLowerCase(), "false", "seeded_no_click_start: started must remain false before explicit start");
  assert.equal(String(seededNoClickState.initial_user_message || "").includes("Mindd"), true, "seeded_no_click_start: initial_user_message should preserve chat input");
  assert.equal(
    String(seededNoClickState.initial_user_message || "").includes("Mindd"),
    true,
    "seeded_no_click_start: initial_user_message must preserve chat input for later start"
  );
  assert.equal(String(seededNoClickState.business_name || ""), "Mindd", "seeded_no_click_start: business name should still be seeded");
  assert.equal(seededNoClickStartHint.length > 0, true, "seeded_no_click_start: localized start hint required");
  assert.equal(String(seededNoClickStart.prompt || "").trim(), seededNoClickStartHint, "seeded_no_click_start: prompt must keep click-start gate");

  const poll1 = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_BOOTSTRAP_POLL",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: { ...stateOf(freshNl), __bootstrap_poll: "true" },
  });
  cases.push(["poll_1", poll1]);

  const poll2 = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_BOOTSTRAP_POLL",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: { ...stateOf(poll1), __bootstrap_poll: "true" },
  });
  cases.push(["poll_2", poll2]);
  assert.equal(
    String(stateOf(poll1).ui_gate_status || "") === "waiting_locale" ||
      String(stateOf(poll1).ui_gate_status || "") === "ready",
    true,
    "poll_1: expected valid gate status during poll flow"
  );
  assert.equal(
    String(stateOf(poll2).ui_gate_status || "") === "waiting_locale" ||
      String(stateOf(poll2).ui_gate_status || "") === "ready",
    true,
    "poll_2: expected valid gate status during poll flow"
  );

  for (const [label, result] of cases) {
    assertContractInvariants(String(label), result);
  }

  console.log("[contract_smoke] PASS", {
    cases: cases.length,
    version: `v${CURRENT_STATE_VERSION}`,
  });
}

main().catch((error) => {
  console.error("[contract_smoke] FAIL", {
    message: String(error?.message || error || "unknown"),
  });
  process.exit(1);
});
