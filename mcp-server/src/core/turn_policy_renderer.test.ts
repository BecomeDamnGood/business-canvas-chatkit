import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultState } from "./state.js";
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
