import test from "node:test";
import assert from "node:assert/strict";

import { renderFreeTextTurnPolicy } from "./turn_policy_renderer.js";
import { UI_STRINGS_SOURCE_EN } from "../i18n/ui_strings_defaults.js";

test("valid compare-pick Dream selections keep a warm reminder, show the chosen canonical value, and expose the confirm CTA", () => {
  const chosenDream =
    "Mindd dreams of a world in which everyone can trust that the information they receive from providers is honest and transparent.";

  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    business_name: "Mindd",
    __dream_runtime_mode: "self",
    provisional_by_step: {
      dream: chosenDream,
    },
    provisional_source_by_step: {
      dream: "compare_pick",
    },
    ui_strings: UI_STRINGS_SOURCE_EN,
  } as any;

  const specialist = {
    action: "ASK",
    dream: chosenDream,
    refined_formulation: chosenDream,
    feedback_reason_text:
      "I can see the direction, and for this step it helps to make the wording broader, more human-centered, and clearer about the future you want to create.",
    user_pick_feedback_text:
      "Keeping your own wording is completely okay. If you continue with it, keep the future you want to create clearly visible in the sentence.",
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist,
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.ok(rendered.uiActionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"));

  const uiContent = (rendered.specialist.ui_content || {}) as Record<string, unknown>;
  assert.equal(uiContent.kind, "single_value");
  assert.equal(uiContent.canonical_text, chosenDream);
  assert.match(
    String(uiContent.support_text || ""),
    /Keeping your own wording is completely okay/i
  );
  assert.equal(String(uiContent.feedback_reason_text || "").trim(), "");
});

test("compare-pick Dream confirmations keep friendly fallback feedback even when only a feedback reason is available", () => {
  const chosenDream = "Mensen willen eerlijke informatie.";

  const state = {
    current_step: "dream",
    active_specialist: "Dream",
    business_name: "Mindd",
    __dream_runtime_mode: "self",
    provisional_by_step: {
      dream: chosenDream,
    },
    provisional_source_by_step: {
      dream: "compare_pick",
    },
    ui_strings: UI_STRINGS_SOURCE_EN,
  } as any;

  const specialist = {
    action: "ASK",
    dream: chosenDream,
    refined_formulation: chosenDream,
    feedback_reason_text:
      "Your input focused on the desire for honest information, but it needed a clearer picture of how this changes people's lives and why it matters.",
    user_pick_feedback_text: "",
  } as Record<string, unknown>;

  const rendered = renderFreeTextTurnPolicy({
    stepId: "dream",
    state,
    specialist,
    previousSpecialist: {},
  });

  assert.equal(rendered.status, "valid_output");
  assert.ok(rendered.uiActionCodes.includes("ACTION_DREAM_REFINE_CONFIRM"));

  const uiContent = (rendered.specialist.ui_content || {}) as Record<string, unknown>;
  assert.equal(uiContent.kind, "single_value");
  assert.equal(uiContent.canonical_text, chosenDream);
  assert.match(String(uiContent.support_text || ""), /your own wording/i);
  assert.match(String(uiContent.support_text || ""), /honest information/i);
  assert.equal(String(uiContent.feedback_reason_text || "").trim(), "");
});
