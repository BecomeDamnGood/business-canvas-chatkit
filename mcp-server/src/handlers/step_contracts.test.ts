import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { applyStateUpdate } from "./run_step_state_update_defaults.js";
import { createPendingInteractionState } from "../core/state.js";
import { finalizeResponseContractInternals, validateUiPayloadContractParity } from "./turn_contract.js";

function compareRuntime(overrides: Record<string, unknown>) {
  const kind = String(overrides.kind || "").trim() === "list_compare" ? "list_compare" : "text_compare";
  return createPendingInteractionState({
    id: String(overrides.id || ""),
    kind,
    render_model: {
      mode: kind === "list_compare" ? "list" : "text",
      instruction: String(overrides.compare_instruction || overrides.instruction || ""),
      feedback_reason_text: String(overrides.feedback_reason_text || ""),
      user_label: String(overrides.user_label || ""),
      suggestion_label: String(overrides.suggestion_label || ""),
      user_text: String(overrides.user_text || ""),
      suggestion_text: String(overrides.suggestion_text || ""),
      user_items: Array.isArray(overrides.user_items) ? overrides.user_items : [],
      suggestion_items: Array.isArray(overrides.suggestion_items) ? overrides.suggestion_items : [],
      ...(Array.isArray(overrides.units) ? { units: overrides.units as any } : {}),
      ...(typeof overrides.retained_heading !== "undefined"
        ? { retained_heading: String(overrides.retained_heading || "") }
        : {}),
      ...(Array.isArray(overrides.retained_items) ? { retained_items: overrides.retained_items as any } : {}),
    },
  } as any);
}

function finalizeFixture(response: Record<string, unknown>) {
  const cloned = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
  const specialist =
    cloned.specialist && typeof cloned.specialist === "object"
      ? (cloned.specialist as Record<string, unknown>)
      : {};
  const state =
    cloned.state && typeof cloned.state === "object"
      ? (cloned.state as Record<string, unknown>)
      : {};
  const pendingInteractionState =
    state.pending_interaction_state ||
    specialist.pending_interaction_state ||
    {};
  const normalizedPendingInteractionState =
    pendingInteractionState &&
    typeof pendingInteractionState === "object" &&
    typeof specialist.compare_instruction !== "undefined" &&
    !String((pendingInteractionState as any)?.render_model?.instruction || "").trim()
      ? {
          ...(pendingInteractionState as Record<string, unknown>),
          render_model: {
            ...((((pendingInteractionState as any)?.render_model || {}) as Record<string, unknown>)),
            instruction: String(specialist.compare_instruction || ""),
          },
        }
      : pendingInteractionState;
  cloned.state = {
    ...state,
    pending_interaction_state: normalizedPendingInteractionState,
  };
  if (specialist.pending_interaction_state) {
    const { pending_interaction_state: _pendingInteractionState, ...rest } = specialist;
    cloned.specialist = rest;
  }
  return finalizeResponseContractInternals(cloned as any, {
    applyUiClientActionContract: () => {},
    labelKeysForActionCodes: () => [],
    onUiParityError: () => {},
    attachRegistryPayload: (payload) => payload,
  });
}

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

test("dream builder scoring without a dream_builder_contract owner fails closed", () => {
  const response = finalizeFixture(
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

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
});

test("dream intro menu without an owner fails closed", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
        ui_strings: {
          "dreamBuilder.startExercise": "Start the exercise",
          "dreamBuilder.resumeExercise": "Continue with the short exercise that helps define your dream.",
        },
      } as any,
      ui: {
        contract_id: "dream::incomplete_output::DREAM_MENU_INTRO",
        action_codes: ["ACTION_DREAM_INTRO_START_EXERCISE"],
        expected_choice_count: 1,
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "DREAM_MENU_INTRO",
      labelKeysForMenuActionCodes: () => ["menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE"],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
});

test("interactive menu-only dream intro payload fails closed without an owner", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
        ui_strings: {
          "dreamBuilder.startExercise": "Start the exercise",
        },
      } as any,
      ui: {
        view: {
          mode: "interactive",
        },
        contract_id: "dream::incomplete_output::DREAM_MENU_INTRO",
        action_codes: [
          "ACTION_DREAM_INTRO_EXPLAIN_MORE",
          "ACTION_DREAM_INTRO_START_EXERCISE",
        ],
        expected_choice_count: 2,
        actions: [
          {
            id: "choice_1",
            label: "Vertel me meer over waarom een droom belangrijk is",
            label_key: "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE",
            action_code: "ACTION_DREAM_INTRO_EXPLAIN_MORE",
          },
          {
            id: "choice_2",
            label: "Doe een kleine oefening die helpt om je droom te definieren.",
            label_key: "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE",
            action_code: "ACTION_DREAM_INTRO_START_EXERCISE",
          },
        ],
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "DREAM_MENU_INTRO",
      labelKeysForMenuActionCodes: () => [
        "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE",
        "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE",
      ],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
});

test("dream intro resume menu without an owner fails closed", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
        dream_builder_statements: ["Statement 1", "Statement 2"],
        dream_scores: [[8, 9]],
        dream_top_clusters: [{ theme: "Trust", average: 8.5 }],
        ui_strings: {
          "dreamBuilder.startExercise": "Start the exercise",
          "dreamBuilder.resumeExercise": "Continue with the short exercise that helps define your dream.",
        },
      } as any,
      ui: {
        contract_id: "dream::incomplete_output::DREAM_MENU_INTRO",
        action_codes: ["ACTION_DREAM_INTRO_START_EXERCISE"],
        expected_choice_count: 1,
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "DREAM_MENU_INTRO",
      labelKeysForMenuActionCodes: () => ["menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE"],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
});

test("dream follow-up menus without an owner fail closed", () => {
  const scenarios = [
    {
      menuId: "DREAM_MENU_WHY",
      contractId: "dream::incomplete_output::DREAM_MENU_WHY",
      actionCodes: ["ACTION_DREAM_WHY_GIVE_SUGGESTIONS", "ACTION_DREAM_WHY_START_EXERCISE"],
      labelKeys: [
        "menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_GIVE_SUGGESTIONS",
        "menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_START_EXERCISE",
      ],
      expectedActionCode: "ACTION_DREAM_WHY_START_EXERCISE",
      expectedLabelKey: "menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_START_EXERCISE",
      expectedLabel: "Do a small exercise that helps to define your dream.",
    },
    {
      menuId: "DREAM_MENU_SUGGESTIONS",
      contractId: "dream::incomplete_output::DREAM_MENU_SUGGESTIONS",
      actionCodes: ["ACTION_DREAM_SUGGESTIONS_PICK_ONE", "ACTION_DREAM_SUGGESTIONS_START_EXERCISE"],
      labelKeys: [
        "menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_PICK_ONE",
        "menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_START_EXERCISE",
      ],
      expectedActionCode: "ACTION_DREAM_SUGGESTIONS_START_EXERCISE",
      expectedLabelKey: "menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_START_EXERCISE",
      expectedLabel: "Do a small exercise that helps to define your dream.",
    },
    {
      menuId: "DREAM_MENU_NEXT_STEP",
      contractId: "dream::valid_output::DREAM_MENU_NEXT_STEP",
      actionCodes: ["ACTION_DREAM_REFINE_CONFIRM", "ACTION_DREAM_REFINE_START_EXERCISE"],
      labelKeys: [
        "menuLabel.DREAM_MENU_NEXT_STEP.ACTION_DREAM_REFINE_CONFIRM",
        "menuLabel.DREAM_MENU_NEXT_STEP.ACTION_DREAM_REFINE_START_EXERCISE",
      ],
      expectedActionCode: "ACTION_DREAM_REFINE_START_EXERCISE",
      expectedLabelKey: "menuLabel.DREAM_MENU_NEXT_STEP.ACTION_DREAM_REFINE_START_EXERCISE",
      expectedLabel: "Do a small exercise that helps to define your dream.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const response = finalizeFixture(
      {
        ok: true,
        current_step_id: "dream",
        text: "",
        prompt: "",
        specialist: {},
        state: {
          started: "true",
          current_step: "dream",
          dream_builder_statements: ["Statement 1", "Statement 2"],
          dream_scores: [[8, 9]],
          dream_top_clusters: [{ theme: "Trust", average: 8.5 }],
        } as any,
        ui: {
          view: {
            mode: "interactive",
          },
          contract_id: scenario.contractId,
          action_codes: [...scenario.actionCodes],
          expected_choice_count: scenario.actionCodes.length,
        },
      } as any,
      {
        applyUiClientActionContract: () => {},
        parseMenuFromContractIdForStep: () => scenario.menuId,
        labelKeysForMenuActionCodes: () => [...scenario.labelKeys],
        onUiParityError: () => {},
        attachRegistryPayload: (payload) => payload,
      }
    );

    assert.equal(response.ok, false);
    assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
  }
});

test("dream canonical refine without explicit owner actions fails closed", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
      } as any,
      ui: {
        view: {
          mode: "interactive",
        },
        contract_id: "dream:valid_output:content",
        content: {
          kind: "single_value",
          heading: "Op basis van je input stel ik de volgende droom voor",
          canonical_text: "Mindd droomt van een wereld waarin mensen zich verbonden voelen.",
        },
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      labelKeysForActionCodes: () => [
        "actionLabel.ACTION_DREAM_REFINE_CONFIRM",
        "actionLabel.ACTION_DREAM_REFINE_START_EXERCISE",
      ],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_action_contract_missing_action");
});

test("dream builder interactive variants without a builder owner fail closed", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "dream",
      } as any,
      ui: {
        view: {
          mode: "interactive",
          variant: "dream_builder_collect",
        },
        contract_id: "dream::incomplete_output::DREAM_EXPLAINER_MENU_SWITCH_SELF",
        action_codes: [
          "ACTION_DREAM_INTRO_START_EXERCISE",
          "ACTION_DREAM_SWITCH_TO_SELF",
        ],
        expected_choice_count: 2,
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      labelKeysForMenuActionCodes: () => [
        "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE",
        "btnSwitchToSelfDream",
      ],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, false);
  assert.equal(String(((response as any).error || {}).reason || ""), "ui_interactive_content_absent");
});

test("step_0 valid_output no_feedback stays a legal owner-backed contract state", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "step_0",
      text: "",
      prompt: "Klaar om te starten?",
      specialist: {
        ui_contract_id: "step_0:valid_output:no_feedback",
      },
      state: {
        started: "true",
        current_step: "step_0",
      } as any,
      ui: {
        view: {
          mode: "interactive",
        },
        contract_id: "step_0:valid_output:no_feedback",
        action_codes: ["ACTION_STEP0_READY_START"],
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      labelKeysForActionCodes: () => ["actionLabel.ACTION_STEP0_READY_START"],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, true);
  assert.equal(String(((response as any).error || {}).reason || ""), "");
  assert.equal(String((((response as any).ui || {}).contract_id || "")), "step_0:valid_output:no_feedback");
});

test("presentation terminal stays a legal owner-backed contract state without ui.content", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "presentation",
      text: "Je canvas is klaar.",
      prompt: "",
      specialist: {
        ui_contract_id: "presentation:valid_output:terminal",
      },
      state: {
        started: "true",
        current_step: "presentation",
      } as any,
      ui: {
        view: {
          mode: "interactive",
        },
        contract_id: "presentation:valid_output:terminal",
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      labelKeysForActionCodes: () => [],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, true);
  assert.equal(String(((response as any).error || {}).reason || ""), "");
  assert.equal(String((((response as any).ui || {}).contract_id || "")), "presentation:valid_output:terminal");
});

test("pending interaction derives text_compare from compare text", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "bigwhy",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "Je huidige formulering blijft te beschrijvend en nog niet richtinggevend genoeg.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_text: "Wij zijn er om mooie merken te bouwen.",
          suggestion_text: "Wij bestaan om merken te bouwen die zichtbaar het leven van mensen verbeteren.",
        }),
        compare_instruction: "Choose the version that fits best.",
      },
      state: {
        started: "true",
        current_step: "bigwhy",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal(String(ui.view && (ui.view as Record<string, unknown>).variant || ""), "");
  assert.equal("feedback_contract" in ui, false);
  assert.equal("compare" in ui, false);
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.feedback_reason_text || ""), "Je huidige formulering blijft te beschrijvend en nog niet richtinggevend genoeg.");
  assert.equal(String(renderModel.user_label || ""), "Your input");
  assert.equal(String(renderModel.suggestion_label || ""), "My suggestion");
  assert.equal(String(renderModel.user_text || ""), "Wij zijn er om mooie merken te bouwen.");
  assert.equal(
    String(renderModel.suggestion_text || ""),
    "Wij bestaan om merken te bouwen die zichtbaar het leven van mensen verbeteren."
  );
});

test("final response pending interaction uses specialist compare user_text", () => {
  const userInput = "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.";
  const canonical =
    "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.";

  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text:
            "Je input benoemt het probleem van verkeerde voorlichting, maar een Droom vraagt om een positief toekomstbeeld met duidelijk menselijk effect.",
          user_label: "Dit is jouw input",
          suggestion_label: "Dit zou mijn suggestie zijn",
          user_text: userInput,
          suggestion_text: canonical,
        }),
        compare_instruction: "Klik alsjeblieft wat het beste bij je past.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  const pending = ((((response.ui || {}) as Record<string, unknown>).pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.user_text || ""), userInput);
  assert.equal(String(renderModel.suggestion_text || ""), canonical);
});

test("final response derives compare pending interaction directly from specialist state", () => {
  const userInput = "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.";
  const canonical =
    "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.";

  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text:
            "Je input benoemt het probleem van verkeerde voorlichting, maar een Droom vraagt om een positief toekomstbeeld met duidelijk menselijk effect.",
          user_label: "Dit is jouw input",
          suggestion_label: "Dit zou mijn suggestie zijn",
          user_text: userInput,
          suggestion_text: canonical,
        }),
        compare_instruction: "Klik alsjeblieft wat het beste bij je past.",
      },
      state: {
        started: "true",
        current_step: "dream",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal("feedback_contract" in ui, false);
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.user_text || ""), userInput);
  assert.equal(String(renderModel.suggestion_text || ""), canonical);
  assert.equal(String((response.state as any).ui_action_compare_pick_user || ""), "ACTION_COMPARE_PICK_USER");
  assert.equal(
    String((response.state as any).ui_action_compare_pick_suggestion || ""),
    "ACTION_COMPARE_PICK_SUGGESTION"
  );
});

test("interactive responses fail closed when only a text submit action remains and no renderable content exists", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      active_specialist: "Dream",
      text: "",
      prompt: "",
      specialist: {
        action: "ASK",
        message: "",
        question: "",
        refined_formulation: "",
        dream: "",
      },
      state: {
        started: "true",
        current_step: "dream",
        active_specialist: "Dream",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  assert.equal(response.ok, false);
  assert.equal(String((response.error as Record<string, unknown> | undefined)?.type || ""), "contract_warning");
  assert.equal(String(((response.state as any) || {}).reason_code || ""), "ui_interactive_content_absent");
});

test("pending interaction derives list_compare from compare list feedback", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "productsservices",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "list_compare",
          status: "pending",
          feedback_reason_text: "Ik heb de servicebenaming specifieker gemaakt.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_items: ["AI flows", "Production support"],
          suggestion_items: ["AI-driven flows", "Production guidance"],
        }),
        compare_instruction: "Choose the version that fits best for the remaining difference.",
      },
      state: {
        started: "true",
        current_step: "productsservices",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal("feedback_contract" in ui, false);
  assert.equal(String(pending.kind || ""), "list_compare");
  assert.equal(String(renderModel.feedback_reason_text || ""), "Ik heb de servicebenaming specifieker gemaakt.");
  assert.deepEqual(renderModel.user_items, ["AI flows", "Production support"]);
  assert.deepEqual(renderModel.suggestion_items, ["AI-driven flows", "Production guidance"]);
  assert.equal(String(renderModel.instruction || ""), "Choose the version that fits best for the remaining difference.");
});

test("pending interaction derives grouped list compare into list_compare render model", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "list_compare",
          status: "pending",
          feedback_reason_text: "Je hebt al iets soortgelijks gezegd, dus een samengevoegde regel houdt je lijst scherper.",
          user_label: "Keep both statements",
          suggestion_label: "Merge into one statement",
          user_items: [
            "Meer mensen zoeken werk dat impact heeft.",
            "Werk moet zichtbaar iets goeds doen voor anderen.",
          ],
          suggestion_items: [
            "Meer mensen zoeken werk dat zichtbaar impact heeft op het leven van anderen.",
          ],
        }),
        compare_instruction: [
          "These points already stay in the final list:",
          "",
          "• Er zal meer behoefte zijn aan bedrijven die blijvende waarde nalaten.",
          "",
          "Choose the version that fits best for the remaining difference.",
        ].join("\n"),
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        view: {
          mode: "interactive",
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal("feedback_contract" in ui, false);
  assert.equal(String(pending.kind || ""), "list_compare");
  assert.equal(
    String(renderModel.feedback_reason_text || ""),
    "Je hebt al iets soortgelijks gezegd, dus een samengevoegde regel houdt je lijst scherper."
  );
  assert.deepEqual(renderModel.user_items, [
    "Meer mensen zoeken werk dat impact heeft.",
    "Werk moet zichtbaar iets goeds doen voor anderen.",
  ]);
  assert.deepEqual(renderModel.suggestion_items, [
    "Meer mensen zoeken werk dat zichtbaar impact heeft op het leven van anderen.",
  ]);
  assert.equal(String(renderModel.retained_heading || ""), "These points already stay in the final list:");
  assert.deepEqual(renderModel.retained_items, [
    "Er zal meer behoefte zijn aan bedrijven die blijvende waarde nalaten.",
  ]);
  assert.equal(
    String(renderModel.instruction || ""),
    "Choose the version that fits best for the remaining difference."
  );
});

test("compare contracts self-heal missing compare actions from the active owner", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "We exist to make complex choices understandable.",
          user_text: "We want to do something good.",
          suggestion_text: "We exist to make complex choices understandable.",
        }),
        compare_instruction: "Choose the wording that fits best.",
      },
      state: {
        started: "true",
        current_step: "purpose",
      } as any,
      ui: {
        contract_id: "purpose:interactive:refine",
        view: {
          mode: "interactive",
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

  assert.equal(response.ok, true);
  assert.equal(String((response.error as Record<string, unknown> | undefined)?.type || ""), "");
  assert.equal(String((((response.ui as any) || {}).view || {}).variant || ""), "");
  assert.equal(String((((response.ui as any) || {}).pending_interaction || {}).kind || ""), "text_compare");
  assert.equal(String(((response.state as any) || {}).ui_action_compare_pick_user || ""), "ACTION_COMPARE_PICK_USER");
  assert.equal(
    String(((response.state as any) || {}).ui_action_compare_pick_suggestion || ""),
    "ACTION_COMPARE_PICK_SUGGESTION"
  );
});

test("dream compare contracts fail closed when generic card content is still present", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "Deze droomformulering maakt het toekomstbeeld scherper.",
          user_text: "Wij willen bedrijven helpen groeien.",
          suggestion_text: "Mindd droomt van een wereld waarin mensen zich verbonden voelen.",
        }),
        compare_instruction: "Choose the wording that fits best.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        contract_id: "dream:interactive:refine",
        view: {
          mode: "interactive",
        },
        content: {
          kind: "single_value",
          heading: "JE HUIDIGE DROOM VOOR MINDD IS",
          canonical_text: "Mindd droomt van een wereld waarin mensen zich verbonden voelen.",
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

  assert.equal(response.ok, false);
  assert.equal(String((response.error as Record<string, unknown> | undefined)?.type || ""), "contract_warning");
  assert.equal(String(((response.state as any) || {}).reason_code || ""), "dream_compare_generic_card_content_present");
});

test("final response publishes a single server-owned pending interaction for compare picks", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      active_specialist: "Dream",
      text: "",
      prompt: "",
      specialist: {
        action: "ASK",
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          target_field: "dream",
          feedback_reason_text: "Deze suggestie maakt de formulering scherper.",
          user_label: "Dit is jouw input:",
          suggestion_label: "Dit zou mijn suggestie zijn:",
          user_text: "Mijn versie",
          suggestion_text: "De suggestie",
        }),
        compare_instruction: "Klik alsjeblieft wat het beste bij je past.",
      },
      state: {
        started: "true",
        current_step: "dream",
        active_specialist: "Dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
        last_specialist_result: {
          action: "ASK",
          pending_interaction_state: compareRuntime({
            kind: "text_compare",
            status: "pending",
            target_field: "dream",
            feedback_reason_text: "Deze suggestie maakt de formulering scherper.",
            user_label: "Dit is jouw input:",
            suggestion_label: "Dit zou mijn suggestie zijn:",
            user_text: "Mijn versie",
            suggestion_text: "De suggestie",
          }),
          compare_instruction: "Klik alsjeblieft wat het beste bij je past.",
        },
      } as any,
      ui: {
        contract_id: "dream:interactive:refine",
        view: {
          mode: "interactive",
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  assert.equal("feedback_contract" in ui, false);
  assert.equal("compare" in ui, false);
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(pending.status || ""), "pending");
  assert.deepEqual(
    ((pending.allowed_actions || []) as Array<Record<string, unknown>>).map((action) => String(action.id || "")),
    ["pick_user", "pick_suggestion"]
  );
  assert.equal(String((response.state as any).__pending_interaction_id || ""), String(pending.id || ""));
  assert.equal(
    String((((response.state as any).last_specialist_result || {}).pending_interaction_id || "")),
    String(pending.id || "")
  );
});

test("specialist compare state keeps compare pick actions and default labels even without explicit compare view variant", () => {
  const response = finalizeFixture(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        pending_interaction_state: compareRuntime({
          kind: "text_compare",
          status: "pending",
          feedback_reason_text: "De suggestie maakt de droom concreter.",
          user_text: "Wij willen betere bedrijven bouwen.",
          suggestion_text: "Mindd droomt van bedrijven die vanuit betekenis echte verandering brengen.",
        }),
        compare_instruction: "Choose the version that fits best.",
      },
      state: {
        started: "true",
        current_step: "dream",
        ui_action_compare_pick_user: "ACTION_COMPARE_PICK_USER",
        ui_action_compare_pick_suggestion: "ACTION_COMPARE_PICK_SUGGESTION",
      } as any,
      ui: {
        contract_id: "dream:interactive:refine",
        view: {
          mode: "interactive",
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

  const actionContract = (((response.ui || {}) as Record<string, unknown>).action_contract || {}) as Record<string, unknown>;
  const roles = Array.isArray(actionContract.actions)
    ? (actionContract.actions as Array<Record<string, unknown>>).map((action) => String(action.role || ""))
    : [];
  assert.deepEqual(roles, ["compare_pick_user", "compare_pick_suggestion"]);

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const view = ((ui.view || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = (pending.render_model || {}) as Record<string, unknown>;
  assert.equal(String(view.variant || ""), "");
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.user_label || ""), "This is your input:");
  assert.equal(String(renderModel.suggestion_label || ""), "This would be my suggestion:");
});
