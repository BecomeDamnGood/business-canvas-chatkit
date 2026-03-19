import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { applyStateUpdate } from "./run_step_state_update_defaults.js";
import { createCompareRuntimeState } from "./compare_runtime.js";
import { finalizeResponseContractInternals, validateUiPayloadContractParity } from "./turn_contract.js";

function compareRuntime(overrides: Record<string, unknown>) {
  return createCompareRuntimeState(overrides as any);
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
  assert.equal(String((state as any).ui_action_score_submit || ""), "");
  assert.ok(
    actions.some(
      (action) =>
        String(action.role || "") === "text_submit" &&
        String(action.action_code || "") === "ACTION_TEXT_SUBMIT" &&
        String(action.payload_mode || "") === "text"
    )
  );
  assert.ok(!actions.some((action) => String(action.role || "") === "score_submit"));
});

test("dream intro contract keeps the original menu copy and choice layout for exercise entry", () => {
  const response = finalizeResponseContractInternals(
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

  const actions = ((((response.ui || {}) as Record<string, unknown>).action_contract || {}) as Record<string, unknown>)
    .actions as Array<Record<string, unknown>>;
  const exerciseAction = actions.find((action) => String(action.role || "") === "dream_start_exercise");

  assert.equal(String((((response.state || {}) as Record<string, unknown>).ui_action_dream_start_exercise || "")), "");
  assert.equal(String(exerciseAction?.label_key || ""), "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE");
  assert.equal(String(exerciseAction?.label || ""), "Do a small exercise that helps to define your dream.");
  assert.equal(String(exerciseAction?.surface || ""), "choice");
});

test("interactive contract keeps the Dream exercise button in the shared choice layout without duplicates", () => {
  const response = finalizeResponseContractInternals(
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

  const actions = ((((response.ui || {}) as Record<string, unknown>).action_contract || {}) as Record<string, unknown>)
    .actions as Array<Record<string, unknown>>;

  assert.ok(
    actions.some(
      (action) =>
        String(action.action_code || "") === "ACTION_DREAM_INTRO_EXPLAIN_MORE" &&
        String(action.role || "") === "choice"
    )
  );
  assert.ok(
    actions.some(
      (action) =>
        String(action.action_code || "") === "ACTION_DREAM_INTRO_START_EXERCISE" &&
        String(action.role || "") === "dream_start_exercise" &&
        String(action.surface || "") === "choice"
    )
  );
  assert.equal(
    actions.filter((action) => String(action.role || "") === "dream_start_exercise").length,
    1
  );
  assert.equal(Object.prototype.hasOwnProperty.call((response.ui || {}) as Record<string, unknown>, "actions"), false);
  assert.equal(Object.prototype.hasOwnProperty.call((response.ui || {}) as Record<string, unknown>, "action_codes"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call((response.ui || {}) as Record<string, unknown>, "expected_choice_count"),
    false
  );
});

test("dream intro contract keeps the original menu copy even when Dream Builder context can be resumed", () => {
  const response = finalizeResponseContractInternals(
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const actions = ((ui.action_contract || {}) as Record<string, unknown>).actions as Array<Record<string, unknown>>;
  const exerciseAction = actions.find((action) => String(action.role || "") === "dream_start_exercise");

  assert.equal(String((((response.state || {}) as Record<string, unknown>).ui_action_dream_start_exercise || "")), "");
  assert.equal(String(exerciseAction?.label_key || ""), "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE");
  assert.equal(
    String(exerciseAction?.label || ""),
    "Do a small exercise that helps to define your dream."
  );
  assert.equal(String(exerciseAction?.surface || ""), "choice");
  assert.equal(
    validateUiPayloadContractParity(
      response as any,
      {
        parseMenuFromContractIdForStep: () => "DREAM_MENU_INTRO",
        labelKeysForMenuActionCodes: () => ["menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE"],
      }
    ),
    null
  );
});

test("dream follow-up menus keep exactly one exercise button with the original menu label and choice layout", () => {
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
      menuId: "DREAM_MENU_REFINE",
      contractId: "dream::valid_output::DREAM_MENU_REFINE",
      actionCodes: ["ACTION_DREAM_REFINE_CONFIRM", "ACTION_DREAM_REFINE_START_EXERCISE"],
      labelKeys: [
        "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM",
        "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE",
      ],
      expectedActionCode: "ACTION_DREAM_REFINE_START_EXERCISE",
      expectedLabelKey: "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE",
      expectedLabel: "Do a small exercise that helps to define your dream.",
    },
  ] as const;

  for (const scenario of scenarios) {
    const response = finalizeResponseContractInternals(
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

    const ui = ((response.ui || {}) as Record<string, unknown>);
    const actions = ((ui.action_contract || {}) as Record<string, unknown>).actions as Array<Record<string, unknown>>;
    const exerciseActions = actions.filter((action) => String(action.role || "") === "dream_start_exercise");

    assert.equal(exerciseActions.length, 1);
    assert.equal(String(exerciseActions[0]?.action_code || ""), scenario.expectedActionCode);
    assert.equal(String(exerciseActions[0]?.label_key || ""), scenario.expectedLabelKey);
    assert.equal(String(exerciseActions[0]?.label || ""), scenario.expectedLabel);
    assert.equal(String(exerciseActions[0]?.surface || ""), "choice");
    assert.equal(
      actions.some((action) => String(action.action_code || "") === "ACTION_DREAM_INTRO_START_EXERCISE"),
      false
    );
    assert.equal(
      validateUiPayloadContractParity(
        response as any,
        {
          parseMenuFromContractIdForStep: () => scenario.menuId,
          labelKeysForMenuActionCodes: () => [...scenario.labelKeys],
        }
      ),
      null
    );
  }
});

test("dream canonical refine recovers missing menu actions from the final contract", () => {
  const response = finalizeResponseContractInternals(
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
        contract_id: "dream::valid_output::DREAM_MENU_REFINE",
        content: {
          kind: "single_value",
          heading: "Op basis van je input stel ik de volgende droom voor",
          canonical_text: "Mindd droomt van een wereld waarin mensen zich verbonden voelen.",
        },
      },
    } as any,
    {
      applyUiClientActionContract: () => {},
      parseMenuFromContractIdForStep: () => "DREAM_MENU_REFINE",
      labelKeysForMenuActionCodes: () => [
        "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM",
        "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE",
      ],
      onUiParityError: () => {},
      attachRegistryPayload: (payload) => payload,
    }
  );

  assert.equal(response.ok, true);
  const ui = ((response.ui || {}) as Record<string, unknown>);
  const actions = ((ui.action_contract || {}) as Record<string, unknown>).actions as Array<Record<string, unknown>>;
  assert.deepEqual(
    actions.map((action) => String(action.action_code || "")),
    ["ACTION_DREAM_REFINE_CONFIRM", "ACTION_DREAM_REFINE_START_EXERCISE"]
  );
  assert.equal(
    validateUiPayloadContractParity(
      response as any,
      {
        parseMenuFromContractIdForStep: () => "DREAM_MENU_REFINE",
        labelKeysForMenuActionCodes: () => [
          "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM",
          "menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE",
        ],
      }
    ),
    null
  );
});

test("dream builder interactive variants suppress the start-exercise action once the exercise is already active", () => {
  const response = finalizeResponseContractInternals(
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const actions = ((ui.action_contract || {}) as Record<string, unknown>).actions as Array<Record<string, unknown>>;

  assert.equal(
    actions.some((action) => String(action.role || "") === "dream_start_exercise"),
    false
  );
  assert.equal(
    actions.some((action) => String(action.role || "") === "dream_switch_to_self"),
    true
  );
});

test("pending interaction derives text_compare from compare text", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "bigwhy",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text: "Je huidige formulering blijft te beschrijvend en nog niet richtinggevend genoeg.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_normalized_text: "Wij zijn er om mooie merken te bouwen.",
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
  assert.equal(String(ui.view && (ui.view as Record<string, unknown>).variant || ""), "text_compare");
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

test("final response pending interaction backfills user_text from specialist compare state when legacy user_text is blank", () => {
  const userInput = "Dit gaat over dat mensen het beu zijn om verkeerd voorgelicht te worden.";
  const canonical =
    "Mindd droomt van een wereld waarin mensen zich zeker voelen omdat ze eerlijk geinformeerd worden.";

  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text:
            "Je input benoemt het probleem van verkeerde voorlichting, maar een Droom vraagt om een positief toekomstbeeld met duidelijk menselijk effect.",
          user_label: "Dit is jouw input",
          suggestion_label: "Dit zou mijn suggestie zijn",
          user_normalized_text: userInput,
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

  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text:
            "Je input benoemt het probleem van verkeerde voorlichting, maar een Droom vraagt om een positief toekomstbeeld met duidelijk menselijk effect.",
          user_label: "Dit is jouw input",
          suggestion_label: "Dit zou mijn suggestie zijn",
          user_normalized_text: userInput,
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

  const ui = ((response.ui || {}) as Record<string, unknown>);
  const pending = ((ui.pending_interaction || {}) as Record<string, unknown>);
  const renderModel = ((pending.render_model || {}) as Record<string, unknown>);
  assert.equal("feedback_contract" in ui, false);
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.user_text || ""), userInput);
  assert.equal(String(renderModel.suggestion_text || ""), canonical);
});

test("pending interaction derives list_compare from compare list feedback", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "productsservices",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "list_compare",
          mode: "list",
          status: "pending",
          presentation: "picker",
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
        flags: {
          require_compare_pick: true,
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
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "list_compare",
          mode: "list",
          status: "pending",
          presentation: "picker",
          variant: "grouped_list_units",
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
        flags: {
          require_compare_pick: true,
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

test("compare contracts self-heal when pending interaction actions are missing", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text: "We exist to make complex choices understandable.",
          user_normalized_text: "We want to do something good.",
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
          variant: "text_compare",
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
  assert.equal(String((((response.ui as any) || {}).pending_interaction || {}).kind || ""), "");
});

test("dream compare contracts fail closed when generic card content is still present", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text: "Deze droomformulering maakt het toekomstbeeld scherper.",
          user_normalized_text: "Wij willen bedrijven helpen groeien.",
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
          variant: "text_compare",
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
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      active_specialist: "Dream",
      text: "",
      prompt: "",
      specialist: {
        action: "ASK",
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          target_field: "dream",
          feedback_reason_text: "Deze suggestie maakt de formulering scherper.",
          user_label: "Dit is jouw input:",
          suggestion_label: "Dit zou mijn suggestie zijn:",
          user_normalized_text: "Mijn versie",
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
          compare_runtime: compareRuntime({
            kind: "text_compare",
            mode: "text",
            status: "pending",
            presentation: "picker",
            target_field: "dream",
            feedback_reason_text: "Deze suggestie maakt de formulering scherper.",
            user_label: "Dit is jouw input:",
            suggestion_label: "Dit zou mijn suggestie zijn:",
            user_normalized_text: "Mijn versie",
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
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "dream",
      text: "",
      prompt: "",
      specialist: {
        compare_runtime: compareRuntime({
          kind: "text_compare",
          mode: "text",
          status: "pending",
          presentation: "picker",
          feedback_reason_text: "De suggestie maakt de droom concreter.",
          user_normalized_text: "Wij willen betere bedrijven bouwen.",
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
  assert.equal(String(view.variant || ""), "text_compare");
  assert.equal(String(pending.kind || ""), "text_compare");
  assert.equal(String(renderModel.user_label || ""), "This is your input:");
  assert.equal(String(renderModel.suggestion_label || ""), "This would be my suggestion:");
});
