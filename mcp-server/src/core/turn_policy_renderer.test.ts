import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDefaultState } from "./state.js";
import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { renderFreeTextTurnPolicy } from "./turn_policy_renderer.js";

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
  if (actionCode === "ACTION_CONFIRM_CONTINUE") return true;
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

function applyBaselineState(state: Record<string, unknown>, stepId: string, menuId: string): void {
  state.current_step = stepId;
  state.business_name = "Mindd";
  if (stepId === "dream") {
    state.active_specialist = menuId.startsWith("DREAM_EXPLAINER_MENU_") ? "DreamExplainer" : "Dream";
  }
}

function applyConfirmEligibleState(state: Record<string, unknown>, stepId: string, menuId: string): void {
  applyBaselineState(state, stepId, menuId);
  const finalField = finalFieldForStep(stepId);
  if (finalField) {
    state[finalField] = `Committed ${stepId} value`;
  }
}

test("step_0: no output => ASK, no continue and no menu action codes", () => {
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
    String(rendered.specialist.message || "").includes("We did not validate your business and name yet"),
    true
  );
  assert.equal(
    String(rendered.specialist.question || ""),
    "What type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'."
  );
  assert.equal(String(rendered.specialist.confirmation_question || ""), "");
  assert.equal(rendered.uiActionCodes.length, 0);
});

test("step_0: valid output => CONFIRM with Dream readiness question", () => {
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
  assert.equal(String(rendered.specialist.action), "CONFIRM");
  assert.equal(
    String(rendered.specialist.confirmation_question || ""),
    "You have an agency called TBD. Are you ready to start with the first step: the Dream?"
  );
  assert.equal(String(rendered.specialist.menu_id || ""), "");
  assert.equal(rendered.uiActionCodes.length, 0);
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

test("off-topic with existing output never uses Refine headline", () => {
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
  assert.equal(headline.includes("Refine your Dream"), false);
  assert.equal(headline.includes("Continue with your Dream"), true);
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
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    },
  });
  assert.equal(rendered.status, "valid_output");
  assert.equal(rendered.confirmEligible, true);
  assert.equal(String(rendered.specialist.menu_id || ""), "DREAM_MENU_REFINE");
  assert.equal(rendered.uiActionCodes.length, 2);
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
  const rendered = renderFreeTextTurnPolicy({
    stepId: "rulesofthegame",
    state,
    specialist: {
      action: "ASK",
      message: "Need one concrete example.",
      menu_id: "RULES_MENU_EXAMPLE_ONLY",
      question: "",
      statements: ["We focus on quality"],
      rulesofthegame: "We focus on quality",
    },
  });
  assert.equal(String(rendered.specialist.menu_id || ""), "RULES_MENU_EXAMPLE_ONLY");
  assert.deepEqual(rendered.uiActionCodes, ["ACTION_RULES_ASK_GIVE_EXAMPLE"]);
  assert.equal(countNumberedOptions(String(rendered.specialist.question || "")), 1);
});

test("purpose examples sidepath keeps both options (no silent drop)", () => {
  const state = getDefaultState();
  (state as any).current_step = "purpose";
  (state as any).business_name = "Mindd";
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

test("role ask sidepath keeps its single option", () => {
  const state = getDefaultState();
  (state as any).current_step = "role";
  (state as any).business_name = "Mindd";
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
    .filter(([menuId]) => !String(menuId).endsWith("_MENU_ESCAPE"));

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
    assert.deepEqual(
      confirmRendered.uiActionCodes,
      menuActions,
      `${menuId} confirm context must keep full menu action set`
    );
    assert.equal(
      countNumberedOptions(String(confirmRendered.specialist.question || "")),
      confirmRendered.uiActionCodes.length,
      `${menuId} confirm question/action parity must stay exact`
    );
  }
});

test("non-escape menu labels stay in parity with action registry", () => {
  const source = fs.readFileSync(new URL("./turn_policy_renderer.ts", import.meta.url), "utf8");
  const match = source.match(/const MENU_LABELS: Record<string, string\[]> = \{([\s\S]*?)\n\};/);
  assert.ok(match && match[1], "MENU_LABELS block exists");
  const labelCounts: Record<string, number> = {};
  for (const entry of (`\n${String(match?.[1] || "")}`).matchAll(/\n\s*([A-Z0-9_]+):\s*\[((?:.|\n)*?)\],/g)) {
    labelCounts[entry[1]] = ((entry[2].match(/"/g) || []).length / 2);
  }

  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    if (menuId.endsWith("_MENU_ESCAPE")) continue;
    assert.equal(
      labelCounts[menuId],
      actionCodes.length,
      `menu parity mismatch for ${menuId}`
    );
  }
});
