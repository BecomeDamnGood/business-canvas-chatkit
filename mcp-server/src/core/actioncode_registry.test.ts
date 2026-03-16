import test from "node:test";
import assert from "node:assert/strict";

import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { MENU_LABEL_DEFAULTS } from "../i18n/menu_label_defaults.js";
import { CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES } from "../steps/step_registry.js";
import { MENU_LABEL_KEYS } from "./ui_contract_matrix.js";

test("all choose-for-me actions are registry-owned by special routes", () => {
  for (const entry of CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES) {
    assert.equal(
      ACTIONCODE_REGISTRY.actions[entry.chooseForMe.actionCode]?.dispatch_owner,
      "special_route",
      `${entry.stepId} choose-for-me action must stay route-owned`
    );
  }
});

test("bigwhy suggestions menu keeps choose-for-me alongside the legacy follow-up choices", () => {
  assert.deepEqual(ACTIONCODE_REGISTRY.menus.BIGWHY_MENU_FROM_GIVE, [
    "ACTION_BIGWHY_EXPLAIN_ASK_3_QUESTIONS",
    "ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME",
    "ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE",
  ]);
});

test("every non-escape menu action has a fallback label", () => {
  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    if (menuId.endsWith("_ESCAPE")) continue;
    const labelKeys = MENU_LABEL_KEYS[menuId] || [];
    assert.equal(
      labelKeys.length,
      actionCodes.length,
      `${menuId} must publish one label key per action`
    );
    labelKeys.forEach((labelKey, index) => {
      assert.ok(
        String(MENU_LABEL_DEFAULTS[labelKey] || "").trim(),
        `${menuId} action ${String(actionCodes[index] || "")} is missing fallback label ${labelKey}`
      );
    });
  }
});
