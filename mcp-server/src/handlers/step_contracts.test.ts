import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { applyStateUpdate } from "./run_step_state_update_defaults.js";
import { finalizeResponseContractInternals } from "./turn_contract.js";

test("offtopic contract: applyStateUpdate does not mutate canonical finals", () => {
  const prev = getDefaultState();
  const decision: any = {
    current_step: "purpose",
    specialist_to_call: "Purpose",
  };
  const specialistResult = {
    action: "CONFIRM",
    is_offtopic: true,
    purpose: "Should never be persisted",
  };

  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).purpose_final || ""), "");
});

test("final ownership: dream output is staged and does not mutate other committed finals", () => {
  const prev = getDefaultState();
  const decision: any = {
    current_step: "dream",
    specialist_to_call: "Dream",
  };
  const specialistResult = {
    action: "CONFIRM",
    is_offtopic: false,
    dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken.",
    purpose: "Should not be persisted in dream step",
  };

  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).dream_final || ""), "");
  assert.equal(
    String((next as any).provisional_by_step?.dream || ""),
    "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes durven maken."
  );
  assert.equal(String((next as any).purpose_final || ""), "");
});

test("final ownership: dream builder summary does not get staged as dream output", () => {
  const prev = getDefaultState();
  const decision: any = {
    current_step: "dream",
    specialist_to_call: "DreamExplainer",
  };
  const specialistResult = {
    action: "ASK",
    is_offtopic: false,
    suggest_dreambuilder: "false",
    dream: "",
    refined_formulation: [
      "Over 5 tot 10 jaar zullen meer mensen verlangen naar werk dat een positieve invloed heeft op het leven van anderen.",
      "Steeds meer mensen zullen streven naar het bouwen van iets dat hun eigen leven overstijgt en blijvende waarde heeft voor de samenleving.",
      "Vrijheid in tijd en keuzes zal voor mensen wereldwijd een steeds belangrijker thema worden.",
      "Mensen zullen in de toekomst meer waarde hechten aan trots kunnen zijn op hun werk en hun bijdrage aan de samenleving.",
    ].join(" "),
  };

  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "false",
  });

  assert.equal(String((next as any).provisional_by_step?.dream || ""), "");
  assert.equal(String((next as any).dream_final || ""), "");
});

test("dream builder scoring keeps separate text and score submit actions", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "Score each statement.",
      prompt: "",
      specialist: {
        statements: Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`),
      },
      state: {
        started: "true",
        current_step: "dream",
        active_specialist: "DreamExplainer",
        __dream_runtime_mode: "builder_scoring",
        ui_action_text_submit: "ACTION_TEXT_SUBMIT",
        ui_action_text_submit_payload_mode: "text",
        ui_action_score_submit: "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES",
        last_specialist_result: {
          scoring_phase: "true",
          suggest_dreambuilder: "true",
        },
      } as any,
      ui: {
        view: {
          mode: "interactive",
          variant: "dream_builder_scoring",
          dream_builder_statements_visible: true,
        },
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "",
      labelKeysForMenuActionCodes: () => [],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  const state = (response.state || {}) as Record<string, unknown>;
  const actions = ((((response.ui || {}) as Record<string, unknown>).action_contract || {}) as Record<string, unknown>)
    .actions as Array<Record<string, unknown>>;

  assert.equal(String(state.ui_action_text_submit || ""), "ACTION_TEXT_SUBMIT");
  assert.equal(String(state.ui_action_text_submit_payload_mode || ""), "text");
  assert.equal(String((state as any).ui_action_score_submit || ""), "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES");
  assert.ok(
    actions.some(
      (action) =>
        String(action.role || "") === "text_submit" &&
        String(action.action_code || "") === "ACTION_TEXT_SUBMIT" &&
        String(action.payload_mode || "") === "text"
    )
  );
  assert.ok(
    actions.some(
      (action) =>
        String(action.role || "") === "score_submit" &&
        String(action.action_code || "") === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES"
    )
  );
});
