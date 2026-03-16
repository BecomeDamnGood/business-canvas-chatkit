import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState } from "../core/state.js";
import { applyStateUpdate } from "./run_step_state_update_defaults.js";
import { finalizeResponseContractInternals, validateUiPayloadContractParity } from "./turn_contract.js";

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

test("feedback contract derives the single-value compare family from wording-choice text", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "bigwhy",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "bigwhy",
      } as any,
      ui: {
        view: {
          mode: "interactive",
          variant: "wording_choice",
        },
        wording_choice: {
          enabled: true,
          mode: "text",
          feedback_reason_text: "Je huidige formulering blijft te beschrijvend en nog niet richtinggevend genoeg.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_text: "Wij zijn er om mooie merken te bouwen.",
          suggestion_text: "Wij bestaan om merken te bouwen die zichtbaar het leven van mensen verbeteren.",
          instruction: "Choose the version that fits best.",
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

  const feedbackContract = (((response.ui || {}) as Record<string, unknown>).feedback_contract || {}) as Record<string, unknown>;
  assert.equal(String(feedbackContract.kind || ""), "single_value_compare");
  assert.equal(String(feedbackContract.rationale || ""), "Je huidige formulering blijft te beschrijvend en nog niet richtinggevend genoeg.");
  assert.equal(String(feedbackContract.current_label || ""), "Your input");
  assert.equal(String(feedbackContract.suggested_label || ""), "My suggestion");
  assert.equal(String(feedbackContract.current_value || ""), "Wij zijn er om mooie merken te bouwen.");
  assert.equal(
    String(feedbackContract.suggested_value || ""),
    "Wij bestaan om merken te bouwen die zichtbaar het leven van mensen verbeteren."
  );
});

test("feedback contract keeps the canonical single-value suggestion family when the server publishes it explicitly", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "purpose",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "purpose",
      } as any,
      ui: {
        view: {
          mode: "interactive",
        },
        feedback_contract: {
          version: "2026-03-16.feedback_contract.v1",
          kind: "single_value_canonical_suggestion",
          heading: "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE BESTAANSREDEN VOOR",
          suggested_value: "Wij bestaan om mensen op een positieve manier te inspireren om hun volledige potentieel te ontdekken.",
          support_text: "Deze formulering klinkt uitnodigend en legt de nadruk op positiviteit.",
          rationale: "Je huidige formulering blijft nog te algemeen.",
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

  const feedbackContract = (((response.ui || {}) as Record<string, unknown>).feedback_contract || {}) as Record<string, unknown>;
  assert.equal(String(feedbackContract.kind || ""), "single_value_canonical_suggestion");
  assert.equal(
    String(feedbackContract.heading || ""),
    "OP BASIS VAN JE INPUT STEL IK DE VOLGENDE BESTAANSREDEN VOOR"
  );
  assert.equal(
    String(feedbackContract.suggested_value || ""),
    "Wij bestaan om mensen op een positieve manier te inspireren om hun volledige potentieel te ontdekken."
  );
  assert.equal(String(feedbackContract.support_text || ""), "Deze formulering klinkt uitnodigend en legt de nadruk op positiviteit.");
  assert.equal(String(feedbackContract.rationale || ""), "Je huidige formulering blijft nog te algemeen.");
});

test("feedback contract derives the list edit family from wording-choice list feedback", () => {
  const response = finalizeResponseContractInternals(
    {
      ok: true,
      current_step_id: "productsservices",
      text: "",
      prompt: "",
      specialist: {},
      state: {
        started: "true",
        current_step: "productsservices",
      } as any,
      ui: {
        view: {
          mode: "interactive",
          variant: "wording_choice",
        },
        flags: {
          require_wording_pick: true,
        },
        wording_choice: {
          enabled: true,
          mode: "list",
          feedback_reason_text: "Ik heb de servicebenaming specifieker gemaakt.",
          user_label: "Your input",
          suggestion_label: "My suggestion",
          user_items: ["AI flows", "Production support"],
          suggestion_items: ["AI-driven flows", "Production guidance"],
          instruction: "Choose the version that fits best for the remaining difference.",
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

  const feedbackContract = (((response.ui || {}) as Record<string, unknown>).feedback_contract || {}) as Record<string, unknown>;
  assert.equal(String(feedbackContract.kind || ""), "list_edit_compare");
  assert.equal(String(feedbackContract.rationale || ""), "Ik heb de servicebenaming specifieker gemaakt.");
  assert.deepEqual(feedbackContract.current_items, ["AI flows", "Production support"]);
  assert.deepEqual(feedbackContract.suggested_items, ["AI-driven flows", "Production guidance"]);
  assert.equal(String(feedbackContract.instruction || ""), "Choose the version that fits best for the remaining difference.");
});

test("feedback contract derives the duplicate merge family from grouped list wording feedback", () => {
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
          variant: "wording_choice",
        },
        flags: {
          require_wording_pick: true,
        },
        wording_choice: {
          enabled: true,
          mode: "list",
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
          instruction: [
            "These points already stay in the final list:",
            "",
            "• Er zal meer behoefte zijn aan bedrijven die blijvende waarde nalaten.",
            "",
            "Choose the version that fits best for the remaining difference.",
          ].join("\n"),
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

  const feedbackContract = (((response.ui || {}) as Record<string, unknown>).feedback_contract || {}) as Record<string, unknown>;
  assert.equal(String(feedbackContract.kind || ""), "list_duplicate_merge_compare");
  assert.equal(
    String(feedbackContract.rationale || ""),
    "Je hebt al iets soortgelijks gezegd, dus een samengevoegde regel houdt je lijst scherper."
  );
  assert.deepEqual(feedbackContract.current_items, [
    "Meer mensen zoeken werk dat impact heeft.",
    "Werk moet zichtbaar iets goeds doen voor anderen.",
  ]);
  assert.deepEqual(feedbackContract.suggested_items, [
    "Meer mensen zoeken werk dat zichtbaar impact heeft op het leven van anderen.",
  ]);
  assert.equal(String(feedbackContract.retained_heading || ""), "These points already stay in the final list:");
  assert.deepEqual(feedbackContract.retained_items, [
    "Er zal meer behoefte zijn aan bedrijven die blijvende waarde nalaten.",
  ]);
  assert.equal(
    String(feedbackContract.instruction || ""),
    "Choose the version that fits best for the remaining difference."
  );
});
