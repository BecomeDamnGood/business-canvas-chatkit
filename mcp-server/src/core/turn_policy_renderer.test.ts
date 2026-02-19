import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultState } from "./state.js";
import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { MENU_LABELS } from "./menu_contract.js";
import { renderFreeTextTurnPolicy } from "./turn_policy_renderer.js";
import { DEFAULT_MENU_BY_STATUS } from "./ui_contract_matrix.js";

function countNumberedOptions(text: string): number {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const m = line.match(/^([1-9])[\)\.]\s+/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx !== count + 1) break;
    count += 1;
  }
  return count;
}

function isConfirmActionCode(actionCode: string): boolean {
  const entry = ACTIONCODE_REGISTRY.actions[actionCode];
  if (!entry) return false;
  if (Array.isArray(entry.flags) && entry.flags.includes("confirm")) return true;
  if (entry.route === "yes") return true;
  const upper = actionCode.toUpperCase();
  return upper.includes("_CONFIRM") || upper.includes("FINAL_CONTINUE");
}

function stepIdForMenu(menuId: string): string {
  const actionCodes = ACTIONCODE_REGISTRY.menus[menuId] || [];
  const steps = [
    ...new Set(
      actionCodes
        .map((code) => String(ACTIONCODE_REGISTRY.actions[code]?.step || "").trim())
        .filter((step) => step && step !== "system")
    ),
  ];
  assert.equal(steps.length, 1, `menu ${menuId} must map to exactly one non-system step`);
  return String(steps[0] || "");
}

function finalFieldForStep(stepId: string): string {
  const byStep: Record<string, string> = {
    step_0: "step_0_final",
    dream: "dream_final",
    purpose: "purpose_final",
    bigwhy: "bigwhy_final",
    role: "role_final",
    entity: "entity_final",
    strategy: "strategy_final",
    targetgroup: "targetgroup_final",
    productsservices: "productsservices_final",
    rulesofthegame: "rulesofthegame_final",
    presentation: "presentation_brief_final",
  };
  return String(byStep[stepId] || "");
}

function makeMenuQuestion(actionCount: number): string {
  return Array.from({ length: actionCount }, (_, idx) => `${idx + 1}) Option ${idx + 1}`).join("\n");
}

function setPhaseContract(state: Record<string, unknown>, stepId: string, menuId: string): void {
  if (!stepId || !menuId) return;
  const existing =
    state.__ui_phase_by_step && typeof state.__ui_phase_by_step === "object"
      ? (state.__ui_phase_by_step as Record<string, unknown>)
      : {};
  state.__ui_phase_by_step = {
    ...existing,
    [stepId]: `${stepId}:phase:${menuId}`,
  };
}

function applyBaselineState(state: Record<string, unknown>, stepId: string, menuId: string): void {
  state.current_step = stepId;
  state.business_name = "Mindd";
  if (stepId === "dream") {
    state.active_specialist = menuId.startsWith("DREAM_EXPLAINER_MENU_") ? "DreamExplainer" : "Dream";
  }
  setPhaseContract(state, stepId, menuId);
}

function applyConfirmEligibleState(state: Record<string, unknown>, stepId: string, menuId: string): void {
  applyBaselineState(state, stepId, menuId);
  const finalField = finalFieldForStep(stepId);
  if (finalField) {
    state[finalField] =
      stepId === "step_0"
        ? "Venture: agency | Name: Mindd | Status: existing"
        : `Committed ${stepId} value`;
  }
}

test("step_0: no output => ASK without menu actions", () => {
  const state = getDefaultState();
  const rendered = renderFreeTextTurnPolicy({
    stepId: "step_0",
    state,
    specialist: {
      action: "ASK",
      message: "Answer",
      question: "",
      confirmation_question: "",
      menu_id: "",
    },
  });
  assert.equal(rendered.status, "no_output");
  assert.equal(String(rendered.specialist.action), "ASK");
  assert.equal(
    String(rendered.specialist.message || ""),
    "Just to set the context, we'll start with the basics."
  );
  assert.equal(
    String(rendered.specialist.question || ""),
    "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?"
  );
  assert.equal(String(rendered.specialist.confirmation_question || ""), "");
  assert.equal(rendered.uiActionCodes.length, 0);
});

test("step_0: valid output => ASK with contract menu and readiness prompt", () => {
  const state = getDefaultState();
  (state as any).step_0_final = "Venture: agency | Name: TBD | Status: starting";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "step_0",
    state,
    specialist: {
      action: "ASK",
      message: "Answer",
      question: "",
      confirmation_question: "",
      menu_id: "",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(String(rendered.specialist.action), "ASK");
  assert.equal(
    String(rendered.specialist.message || ""),
    "Just to set the context, we'll start with the basics."
  );
  assert.equal(
    String(rendered.specialist.confirmation_question || ""),
    ""
  );
  assert.equal(String(rendered.specialist.menu_id || ""), "STEP0_MENU_READY_START");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_STEP0_READY_START"]);
  assert.equal(
    String(rendered.specialist.question || "").includes("Are you ready to start with the first step: the Dream?"),
    true
  );
  assert.equal(
    String(rendered.specialist.message || "").includes("This is what we have established so far based on our dialogue:"),
    false
  );
});

test("step_0: canonical context line replaces specialist welcome/question drift", () => {
  const state = getDefaultState();
  const rendered = renderFreeTextTurnPolicy({
    stepId: "step_0",
    state,
    specialist: {
      action: "ASK",
      message:
        "Welcome! Let's get started. To begin, what type of business are you starting or running, and what is the name (or is it still TBD)?",
      question: "",
      menu_id: "",
    },
  });
  assert.equal(String(rendered.specialist.message || ""), "Just to set the context, we'll start with the basics.");
  assert.equal(String(rendered.specialist.message || "").includes("Welcome! Let's get started"), false);
});

test("dream: free-text render uses non-escape menu with parity", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).business_name = "Acme";
  (state as any).dream_final = "Become the trusted local partner.";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Ben Steenstra is an entrepreneur.",
      question: "1) Continue Dream now\n2) Finish later",
      menu_id: "DREAM_MENU_ESCAPE",
    },
    previousSpecialist: {
      action: "REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      menu_id: "DREAM_MENU_REFINE",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(String(rendered.specialist.menu_id), "DREAM_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.length, 2);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), rendered.uiActionCodes.length);
  assert.equal(String(rendered.specialist.question || "").includes("Continue Dream now"), false);
});

test("dream: valid output does not keep intro-only menu when confirm menu exists", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "Mindd dreams of a world where purpose creates lasting value.";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Your current Dream for Mindd is:",
      question:
        "1) Tell me more about why a dream matters\n2) Do a small exercise that helps to define your dream.\n\nDefine the Dream of Mindd or choose an option.",
      menu_id: "DREAM_MENU_INTRO",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_REFINE");
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"),
    true
  );
  assert.equal(
    rendered.uiActionCodes.includes("ACTION_DREAM_INTRO_EXPLAIN_MORE"),
    false
  );
});

test("dream: candidate without final keeps continue button in Dream refine context", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Here is a Dream line I would suggest for Mindd.",
      refined_formulation:
        "Mindd dreams of a world in which creative minds feel empowered to share their ideas freely and find meaningful connections that help them grow.",
      dream: "",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      menu_id: "DREAM_MENU_REFINE",
    },
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_REFINE_START_EXERCISE",
  ]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), 2);
});

test("dream: staged provisional value is treated as valid output before explicit next-step commit", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";
  (state as any).provisional_by_step = {
    dream: "Mindd dreams of a world where purpose-driven companies stay human under pressure.",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "A quick detour answer.",
      question: "What is the next question?",
      menu_id: "DREAM_MENU_WHY",
      is_offtopic: true,
    },
    previousSpecialist: {
      action: "ASK",
      menu_id: "",
      question: "",
    },
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"), true);
  assert.equal(
    String(rendered.specialist.message || "").includes("Mindd dreams of a world where purpose-driven companies stay human under pressure."),
    true
  );
});

test("dream: explain-more flow keeps WHY menu and does not loop intro button", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";
  setPhaseContract(state as any, "dream", "DREAM_MENU_WHY");

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "A Dream matters because it anchors long-term direction.",
      question:
        "1) Give me a few dream suggestions\n2) Do a small exercise that helps to define your dream.\n\nDefine your Dream for Mindd or choose an option.",
      menu_id: "DREAM_MENU_WHY",
      dream: "",
      refined_formulation: "",
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.confirmEligible, false);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_WHY");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_DREAM_WHY_GIVE_SUGGESTIONS",
    "ACTION_DREAM_WHY_START_EXERCISE",
  ]);
  assert.equal(
    String(rendered.specialist.question || "").includes("Tell me more about why a dream matters"),
    false
  );
});

test("dream explainer intro keeps exercise question and avoids Dream intro fallback menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "DreamExplainer";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";
  setPhaseContract(state as any, "dream", "DREAM_EXPLAINER_MENU_SWITCH_SELF");

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "INTRO",
      message: "Let's start the exercise.",
      question:
        "Looking 5 to 10 years ahead, what major opportunity or threat do you see, and what positive change do you hope for? Write it as one clear statement.",
      menu_id: "",
      suggest_dreambuilder: "true",
      dream: "",
      refined_formulation: "",
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.confirmEligible, false);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_EXPLAINER_MENU_SWITCH_SELF");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_DREAM_SWITCH_TO_SELF"]);
  assert.equal(
    String(rendered.specialist.question || "").includes("Looking 5 to 10 years ahead"),
    true
  );
  assert.equal(
    String(rendered.specialist.question || "").includes("Define your Dream for Mindd"),
    false
  );
});

test("dream explainer switch-self prompt is de-numbered before contract numbering", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "DreamExplainer";
  (state as any).__dream_runtime_mode = "builder_collect";
  setPhaseContract(state as any, "dream", "DREAM_EXPLAINER_MENU_SWITCH_SELF");

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      message: "Exercise prompt",
      question:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
    },
  });

  const question = String(rendered.specialist.question || "");
  const occurrences = (question.match(/1\)\s+Switch back to self-formulate the dream/g) || []).length;
  assert.equal(occurrences, 1);
  assert.equal(
    question.includes("What more do you see changing in the future, positive or negative? Let your imagination run free."),
    true
  );
});

test("strategy: incomplete output hides confirm action", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      message: "Thanks.",
      statements: ["Focus on premium clients", "Prioritize recurring revenue"],
      question: "",
      menu_id: "",
    },
  });
  assert.equal(rendered.status, "incomplete_output");
  assert.equal(rendered.confirmEligible, false);
  assert.equal(rendered.uiActionCodes.some((code) => code.includes("CONFIRM")), false);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), rendered.uiActionCodes.length);
});

test("bigwhy: when confirm is not eligible, filtered menu keeps matching label for remaining action", () => {
  const state = getDefaultState();
  (state as any).current_step = "bigwhy";
  (state as any).business_name = "Mindd";
  setPhaseContract(state as any, "bigwhy", "BIGWHY_MENU_REFINE");
  const rendered = renderFreeTextTurnPolicy({
    stepId: "bigwhy",
    state,
    specialist: {
      action: "ASK",
      message: "Based on Dream and Purpose, your Big Why could sound like this:",
      refined_formulation: "",
      bigwhy: "",
      question:
        "1) I'm happy with this wording, continue to step 5 Role\n2) Redefine the Big Why for me please",
      menu_id: "BIGWHY_MENU_REFINE",
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.confirmEligible, false);
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_BIGWHY_REFINE_ADJUST"]);
  assert.equal(String(rendered.uiActions[0]?.label || ""), "Redefine the Big Why for me please");
  assert.equal(String(rendered.specialist.question || "").includes("I'm happy with this wording"), false);
  assert.equal(String(rendered.specialist.question || "").includes("Redefine the Big Why for me please"), true);
});

test("confirm-filtered menus collapse to one non-confirm action with strict question parity", () => {
  const riskCases = [
    { stepId: "dream", menuId: "DREAM_MENU_REFINE", expectedAction: "ACTION_DREAM_REFINE_START_EXERCISE", field: "dream" },
    { stepId: "dream", menuId: "DREAM_EXPLAINER_MENU_REFINE", expectedAction: "ACTION_DREAM_EXPLAINER_REFINE_ADJUST", field: "dream" },
    { stepId: "purpose", menuId: "PURPOSE_MENU_REFINE", expectedAction: "ACTION_PURPOSE_REFINE_ADJUST", field: "purpose" },
    { stepId: "bigwhy", menuId: "BIGWHY_MENU_REFINE", expectedAction: "ACTION_BIGWHY_REFINE_ADJUST", field: "bigwhy" },
    { stepId: "role", menuId: "ROLE_MENU_REFINE", expectedAction: "ACTION_ROLE_REFINE_ADJUST", field: "role" },
    { stepId: "entity", menuId: "ENTITY_MENU_EXAMPLE", expectedAction: "ACTION_ENTITY_EXAMPLE_REFINE", field: "entity" },
    { stepId: "strategy", menuId: "STRATEGY_MENU_CONFIRM", expectedAction: "ACTION_STRATEGY_REFINE_EXPLAIN_MORE", field: "strategy" },
    { stepId: "targetgroup", menuId: "TARGETGROUP_MENU_POSTREFINE", expectedAction: "ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS", field: "targetgroup" },
    { stepId: "rulesofthegame", menuId: "RULES_MENU_REFINE", expectedAction: "ACTION_RULES_REFINE_ADJUST", field: "rulesofthegame" },
  ] as const;

  for (const risk of riskCases) {
    const state = getDefaultState();
    (state as any).current_step = risk.stepId;
    (state as any).business_name = "Mindd";
    setPhaseContract(state as any, risk.stepId, risk.menuId);

    const specialist: Record<string, unknown> = {
      action: "ASK",
      menu_id: risk.menuId,
      message: "Candidate generated by specialist.",
      question: "",
      refined_formulation: "",
    };
    specialist[risk.field] = "";

    const rendered = renderFreeTextTurnPolicy({
      stepId: risk.stepId,
      state,
      specialist,
    });

    assert.equal(rendered.confirmEligible, false, `${risk.menuId} should be non-confirm state`);
    assert.deepEqual(rendered.uiActionCodes, [risk.expectedAction], `${risk.menuId} should keep only non-confirm action`);
    assert.equal(
      countNumberedOptions(String(rendered.specialist.question || "")),
      rendered.uiActionCodes.length,
      `${risk.menuId} question/action parity must stay exact`
    );
  }
});

test("entity: no-output with leaked refine menu never exposes next-step confirm", () => {
  const state = getDefaultState();
  (state as any).current_step = "entity";
  (state as any).business_name = "Mindd";
  setPhaseContract(state as any, "entity", "ENTITY_MENU_EXAMPLE");
  const rendered = renderFreeTextTurnPolicy({
    stepId: "entity",
    state,
    specialist: {
      action: "ASK",
      message: "Based on what I already know about Mindd I suggest the following Entity:",
      refined_formulation: "",
      entity: "",
      question: "Define your Entity for Mindd or choose an option.",
      menu_id: "ENTITY_MENU_EXAMPLE",
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.confirmEligible, false);
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_ENTITY_EXAMPLE_REFINE"]);
  assert.equal(String(rendered.uiActions[0]?.label || ""), "Refine the wording for me please");
  assert.equal(String(rendered.specialist.question || "").includes("I'm happy with this wording"), false);
  assert.equal(String(rendered.specialist.question || "").includes("Refine the wording for me please"), true);
});

test("productsservices: single statement is treated as valid output and keeps confirm action", () => {
  const state = getDefaultState();
  (state as any).current_step = "productsservices";
  (state as any).business_name = "Mindd";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "productsservices",
    state,
    specialist: {
      action: "ASK",
      message: "This is what you offer:",
      productsservices: "",
      refined_formulation: "",
      statements: ["Advertising services"],
      menu_id: "PRODUCTSSERVICES_MENU_CONFIRM",
    },
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_PRODUCTSSERVICES_CONFIRM"]);
  assert.equal(
    String(rendered.specialist.question || "").includes("This is all what we offer, continue to step Rules of the Game"),
    true
  );
});

test("productsservices: no-output state with no actions does not claim a selectable option", () => {
  const state = getDefaultState();
  (state as any).current_step = "productsservices";
  (state as any).business_name = "Mindd";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "productsservices",
    state,
    specialist: {
      action: "ASK",
      message: "",
      productsservices: "",
      refined_formulation: "",
      question: "",
      menu_id: "",
    },
  });

  assert.equal(rendered.status, "no_output");
  assert.equal(rendered.uiActionCodes.length, 0);
  assert.equal(String(rendered.specialist.question || "").includes("or choose an option"), false);
});

test("strategy: ignores previous menu fallback and uses deterministic status menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      message: "Thanks.",
      statements: ["Focus on premium clients", "Prioritize recurring revenue"],
      question: "",
      menu_id: "",
    },
    previousSpecialist: {
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "STRATEGY_MENU_ASK");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_STRATEGY_ASK_3_QUESTIONS",
    "ACTION_STRATEGY_ASK_GIVE_EXAMPLES",
  ]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), rendered.uiActionCodes.length);
});

test("rules: valid output keeps confirm-capable menu with parity", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "Great.",
      statements: ["We are punctual", "We protect quality", "We communicate proactively"],
      question:
        "1) These are all my rules of the game, continue to Presentation\n2) Please explain more about Rules of the Game\n3) Give one concrete example (Rule versus poster slogan)",
      menu_id: "RULES_MENU_CONFIRM",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(String(rendered.specialist.menu_id), "RULES_MENU_CONFIRM");
  assert.ok(rendered.uiActionCodes.length >= 1);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), rendered.uiActionCodes.length);
});

test("off-topic with existing output still uses contract-driven Refine headline", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "Mindd dreams of a world with meaningful impact.";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      is_offtopic: true,
      message: "Ben Steenstra is an entrepreneur.",
      question: "",
      menu_id: "",
    },
  });
  const headline = String(rendered.specialist.question || "");
  assert.equal(headline.includes("Continue with your Dream"), false);
  assert.equal(headline.includes("Refine your Dream"), true);
  assert.equal(
    String(rendered.specialist.message || "").includes("Mindd dreams of a world with meaningful impact."),
    true
  );
});

test("renderer emits contract metadata for deterministic UI", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "",
      question: "",
      menu_id: "",
      purpose: "",
      refined_formulation: "",
    },
  });
  assert.equal(typeof rendered.contractId, "string");
  assert.equal(rendered.contractId.startsWith("purpose:no_output:"), true);
  assert.equal(typeof rendered.contractVersion, "string");
  assert.equal(rendered.contractVersion.length > 0, true);
  assert.equal(Array.isArray(rendered.textKeys), true);
  assert.equal(rendered.textKeys.length > 0, true);
  assert.equal(String((rendered.specialist as any).ui_contract_id || "").length > 0, true);
});

test("off-topic dream with candidate but no final keeps confirm-capable refine menu", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      is_offtopic: true,
      message: "Off-topic answer here.",
      question: "",
      menu_id: "",
      dream: "Mindd dreams of a world with meaningful impact.",
    },
    previousSpecialist: {
      action: "REFINE",
      menu_id: "DREAM_MENU_REFINE",
      dream: "Mindd dreams of a world with meaningful impact.",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.length, 2);
});

test("off-topic dream carries previously selected temporary formulation in message", () => {
  const state = getDefaultState();
  (state as any).current_step = "dream";
  (state as any).active_specialist = "Dream";
  (state as any).business_name = "Mindd";
  (state as any).dream_final = "";
  const previousSpecialist = {
    action: "ASK",
    menu_id: "DREAM_MENU_REFINE",
    dream: "Mindd dreams of a world where purpose-driven companies create long-term value.",
    refined_formulation:
      "Mindd dreams of a world where purpose-driven companies create long-term value.",
    question:
      "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist: {
      action: "ASK",
      is_offtopic: true,
      message:
        "Ben Steenstra is a Dutch entrepreneur and business strategist. For more information visit https://www.bensteenstra.com",
      question: "",
      menu_id: "",
    },
    previousSpecialist,
  });

  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_REFINE");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_REFINE_START_EXERCISE",
  ]);
  assert.equal(
    String(rendered.specialist.message || "").includes(
      "Mindd dreams of a world where purpose-driven companies create long-term value."
    ),
    true
  );
});

test("off-topic keeps committed context and valid-output contract menu across steps", () => {
  const stepIds = Object.keys(DEFAULT_MENU_BY_STATUS).filter((stepId) => stepId !== "step_0");

  for (const stepId of stepIds) {
    const state = getDefaultState();
    (state as any).current_step = stepId;
    (state as any).business_name = "Mindd";
    if (stepId === "dream") {
      (state as any).active_specialist = "Dream";
    }
    const finalField = finalFieldForStep(stepId);
    const committedValue = `Committed ${stepId} value.`;
    if (finalField) {
      (state as any)[finalField] = committedValue;
    }

    const rendered = renderFreeTextTurnPolicy({
      stepId,
      state,
      specialist: {
        action: "ASK",
        is_offtopic: true,
        message: "A quick detour. Back to your business step now.",
        question: "",
        menu_id: "",
      },
    });

    assert.equal(rendered.status, "valid_output", `${stepId} should stay valid on off-topic`);
    assert.equal(
      String(rendered.specialist.menu_id || ""),
      String(DEFAULT_MENU_BY_STATUS[stepId]?.valid_output || ""),
      `${stepId} should keep valid-output contract menu`
    );
    assert.ok((rendered.uiActionCodes || []).length > 0, `${stepId} should keep at least one action button`);
    assert.equal(
      String(rendered.specialist.message || "").includes(committedValue),
      true,
      `${stepId} should include committed context in off-topic response`
    );
  }
});

test("strategy valid-output from sidepath never renders buttonless screen", () => {
  const state = getDefaultState();
  (state as any).current_step = "strategy";
  (state as any).business_name = "Mindd";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "strategy",
    state,
    specialist: {
      action: "ASK",
      message: "Context from sidepath.",
      menu_id: "DREAM_MENU_WHY",
      question: "",
      statements: [
        "Focus exclusively on clients in the Netherlands",
        "Focus on clients with an annual budget above 40,000 euros",
        "Work only for clients who are healthy and profitable",
        "Prioritize collaborations with clients who seek to drive meaningful change",
        "Limit the number of concurrent projects to maintain high standards",
      ],
      strategy:
        "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros\nWork only for clients who are healthy and profitable\nPrioritize collaborations with clients who seek to drive meaningful change\nLimit the number of concurrent projects to maintain high standards",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "STRATEGY_MENU_CONFIRM");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_STRATEGY_REFINE_EXPLAIN_MORE",
    "ACTION_STRATEGY_CONFIRM_SATISFIED",
  ]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), rendered.uiActionCodes.length);
});

test("rules sidepath menu has label parity and keeps button visible", () => {
  const state = getDefaultState();
  (state as any).current_step = "rulesofthegame";
  setPhaseContract(state as any, "rulesofthegame", "RULES_MENU_GIVE_EXAMPLE_ONLY");
  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "Need one concrete example.",
      menu_id: "RULES_MENU_GIVE_EXAMPLE_ONLY",
      question: "",
      statements: ["We focus on quality"],
      rulesofthegame: "We focus on quality",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "RULES_MENU_GIVE_EXAMPLE_ONLY");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_RULES_ASK_GIVE_EXAMPLE"]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), 1);
});

test("purpose examples sidepath keeps both options (no silent drop)", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  setPhaseContract(state as any, "purpose", "PURPOSE_MENU_EXAMPLES");
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "Here are examples.",
      menu_id: "PURPOSE_MENU_EXAMPLES",
      question: "",
      purpose: "Mindd exists to foster purpose-driven companies.",
      refined_formulation: "Mindd exists to foster purpose-driven companies.",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "PURPOSE_MENU_EXAMPLES");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS",
    "ACTION_PURPOSE_EXAMPLES_CHOOSE_FOR_ME",
  ]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), 2);
});

test("purpose no-output intro shows explain-more and ask-3-questions actions", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      message: "",
      menu_id: "",
      question: "",
      purpose: "",
      refined_formulation: "",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "PURPOSE_MENU_INTRO");
  assert.deepEqual(rendered.uiActionCodes, [
    "ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
    "ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS",
  ]);
});

test("role ask sidepath keeps its single option", () => {
  const state = getDefaultState();
  (state as any).current_step = "role";
  (state as any).business_name = "Mindd";
  setPhaseContract(state as any, "role", "ROLE_MENU_ASK");
  const rendered = renderFreeTextTurnPolicy({
    stepId: "role",
    state,
    specialist: {
      action: "ASK",
      message: "Need examples.",
      menu_id: "ROLE_MENU_ASK",
      question: "",
      role: "Mindd sets standards for purpose-driven business.",
      refined_formulation: "Mindd sets standards for purpose-driven business.",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "ROLE_MENU_ASK");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_ROLE_ASK_GIVE_EXAMPLES"]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), 1);
});

test("all non-escape menus keep parity and confirm-filter contract in both eligibility states", () => {
  const menuEntries = Object.entries(ACTIONCODE_REGISTRY.menus)
    .filter(([menuId]) => !String(menuId).endsWith("_MENU_ESCAPE"))
    .filter(([menuId]) => menuId !== "STEP0_MENU_META_RETURN");

  for (const [menuId, menuActions] of menuEntries) {
    const stepId = stepIdForMenu(menuId);
    const question = makeMenuQuestion(menuActions.length);

    const nonConfirmState = getDefaultState();
    applyBaselineState(nonConfirmState as any, stepId, menuId);
    const nonConfirmRendered = renderFreeTextTurnPolicy({
      stepId,
      state: nonConfirmState,
      specialist: {
        action: "ASK",
        menu_id: menuId,
        message: "Please choose 1 or 2.",
        question,
        refined_formulation: "",
      },
    });

    assert.equal(
      nonConfirmRendered.confirmEligible,
      false,
      `${menuId} should start in non-confirm context when no final exists`
    );
    assert.equal(
      nonConfirmRendered.uiActionCodes.some((code) => isConfirmActionCode(String(code || ""))),
      false,
      `${menuId} non-confirm context may not expose confirm actions`
    );
    assert.equal(
      countNumberedOptions(String(nonConfirmRendered.specialist.question || "")),
      nonConfirmRendered.uiActionCodes.length,
      `${menuId} non-confirm question/action parity must stay exact`
    );

    const confirmState = getDefaultState();
    applyConfirmEligibleState(confirmState as any, stepId, menuId);
    const confirmRendered = renderFreeTextTurnPolicy({
      stepId,
      state: confirmState,
      specialist: {
        action: "ASK",
        menu_id: menuId,
        message: "Please choose 1 or 2.",
        question,
        refined_formulation: "",
      },
    });

    assert.equal(
      confirmRendered.confirmEligible,
      true,
      `${menuId} should be confirm-eligible when final value is present`
    );
    const expectedMenuActions = menuActions;
    assert.deepEqual(
      confirmRendered.uiActionCodes,
      expectedMenuActions,
      `${menuId} confirm context must keep full menu action set`
    );
    assert.equal(
      countNumberedOptions(String(confirmRendered.specialist.question || "")),
      confirmRendered.uiActionCodes.length,
      `${menuId} confirm question/action parity must stay exact`
    );
  }
});

test("labelsForMenu uses contract labels even when specialist question has custom numbered labels", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  (state as any).purpose_final = "Committed purpose";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      menu_id: "PURPOSE_MENU_REFINE",
      message: "Current message",
      question: "1) Specialist label one\n2) Specialist label two",
      purpose: "Committed purpose",
    },
    previousSpecialist: {
      menu_id: "PURPOSE_MENU_REFINE",
      question: "1) Previous label one\n2) Previous label two",
    },
  });
  const expected = MENU_LABELS.PURPOSE_MENU_REFINE;
  assert.deepEqual(rendered.uiActions.map((action) => String(action.label || "")), expected);
});

test("labelsForMenu uses contract labels even when previous question has custom numbered labels", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  (state as any).purpose_final = "Committed purpose";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      menu_id: "PURPOSE_MENU_REFINE",
      message: "Current message",
      question: "Please answer freely.",
      purpose: "Committed purpose",
    },
    previousSpecialist: {
      menu_id: "PURPOSE_MENU_REFINE",
      question: "1) Previous label one\n2) Previous label two",
    },
  });
  const expected = MENU_LABELS.PURPOSE_MENU_REFINE;
  assert.deepEqual(rendered.uiActions.map((action) => String(action.label || "")), expected);
});

test("labelsForMenu precedence: static MENU_LABELS fallback is used when parsed labels are unavailable", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
  (state as any).purpose_final = "Committed purpose";
  const rendered = renderFreeTextTurnPolicy({
    stepId: "purpose",
    state,
    specialist: {
      action: "ASK",
      menu_id: "PURPOSE_MENU_REFINE",
      message: "Current message",
      question: "No numbered options here.",
      purpose: "Committed purpose",
    },
    previousSpecialist: {
      menu_id: "PURPOSE_MENU_REFINE",
      question: "Still no numbered options.",
    },
  });
  assert.deepEqual(
    rendered.uiActions.map((action) => String(action.label || "")),
    MENU_LABELS.PURPOSE_MENU_REFINE
  );
});

test("non-escape menu labels stay in parity with action registry", () => {
  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    if (menuId.endsWith("_MENU_ESCAPE")) continue;
    const labels = MENU_LABELS[menuId];
    assert.ok(Array.isArray(labels), `MENU_LABELS missing for ${menuId}`);
    assert.equal(
      labels.length,
      actionCodes.length,
      `menu parity mismatch for ${menuId}`
    );
  }
});
