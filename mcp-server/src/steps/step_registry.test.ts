import test from "node:test";
import assert from "node:assert/strict";

import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { NEXT_MENU_BY_ACTIONCODE } from "../core/ui_contract_matrix.js";
import { CANONICAL_STEPS, STEP_FINAL_FIELD_BY_STEP_ID } from "../core/state.js";
import {
  CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES,
  formatStepSectionTitle,
  getStepStepperLabelKey,
  getStepTitleKey,
  STEP_REGISTRY_BY_STEP_ID,
  STEP_REGISTRY_ORDER,
} from "./step_registry.js";

test("state canonical steps are sourced from the step registry order", () => {
  assert.deepEqual(CANONICAL_STEPS, STEP_REGISTRY_ORDER);
});

test("step registry order indexes and families stay internally consistent", () => {
  for (const [index, stepId] of STEP_REGISTRY_ORDER.entries()) {
    const entry = STEP_REGISTRY_BY_STEP_ID[stepId];
    assert.equal(entry.orderIndex, index, `wrong orderIndex for ${stepId}`);
    assert.ok(entry.titleKey, `missing titleKey for ${stepId}`);
    assert.ok(entry.stepperLabelKey, `missing stepperLabelKey for ${stepId}`);
    assert.ok(entry.sectionTitleMode, `missing sectionTitleMode for ${stepId}`);
    if (entry.sectionTitleMode === "business_name_template") {
      assert.ok(entry.sectionTitleWithBusinessKey, `missing sectionTitleWithBusinessKey for ${stepId}`);
      assert.ok(entry.sectionTitleWithoutBusinessKey, `missing sectionTitleWithoutBusinessKey for ${stepId}`);
    } else {
      assert.ok(entry.sectionTitleKey, `missing sectionTitleKey for ${stepId}`);
    }
    if (stepId === "step_0" || stepId === "presentation") {
      assert.equal(entry.supportFamily, "none", `special flow ${stepId} must not be interactive support`);
      assert.equal(entry.compareFamily, "none", `special flow ${stepId} must not be in wording family`);
      continue;
    }
    assert.equal(entry.supportFamily, "interactive_step", `wrong support family for ${stepId}`);
    if (entry.stepKind === "list_value") {
      assert.equal(entry.compareFamily, "grouped_list", `wrong wording family for ${stepId}`);
    } else {
      assert.equal(entry.compareFamily, "single_value", `wrong wording family for ${stepId}`);
    }
  }
});

test("step registry title helpers stay aligned with registry metadata", () => {
  for (const stepId of STEP_REGISTRY_ORDER) {
    const entry = STEP_REGISTRY_BY_STEP_ID[stepId];
    assert.equal(getStepTitleKey(stepId), entry.titleKey);
    assert.equal(getStepStepperLabelKey(stepId), entry.stepperLabelKey);
  }
});

test("formatStepSectionTitle preserves plain and company-aware section title selection", () => {
  assert.equal(
    formatStepSectionTitle({
      stepId: "step_0",
      businessName: "Mindd",
      getString: (key) =>
        ({
          "sectionTitle.step_0": "Validation & Business Name",
        })[key] || "",
    }),
    "Validation & Business Name"
  );

  assert.equal(
    formatStepSectionTitle({
      stepId: "purpose",
      businessName: "Mindd",
      getString: (key) =>
        ({
          "sectionTitle.purposeOf": "The Purpose of {0}",
          "sectionTitle.purposeOfFuture": "The Purpose of my future company",
        })[key] || "",
    }),
    "The Purpose of Mindd"
  );

  assert.equal(
    formatStepSectionTitle({
      stepId: "purpose",
      businessName: "TBD",
      getString: (key) =>
        ({
          "sectionTitle.purposeOf": "The Purpose of {0}",
          "sectionTitle.purposeOfFuture": "The Purpose of my future company",
        })[key] || "",
    }),
    "The Purpose of my future company"
  );
});

test("state final field map stays aligned with the step registry", () => {
  for (const stepId of STEP_REGISTRY_ORDER) {
    assert.equal(STEP_FINAL_FIELD_BY_STEP_ID[stepId], STEP_REGISTRY_BY_STEP_ID[stepId].finalField);
  }
});

test("choose-for-me contracts stay aligned with action registry and UI transitions", () => {
  for (const entry of CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES) {
    const { stepId } = entry;
    const { actionCode, menuId, nextMenuId } = entry.chooseForMe;
    const action = ACTIONCODE_REGISTRY.actions[actionCode];
    assert.ok(action, `missing action registry entry for ${actionCode}`);
    assert.equal(action.step, stepId, `wrong action step for ${actionCode}`);

    const menuActions = ACTIONCODE_REGISTRY.menus[menuId] || [];
    assert.ok(
      menuActions.includes(actionCode),
      `menu ${menuId} must include ${actionCode}`
    );

    const transition = NEXT_MENU_BY_ACTIONCODE[actionCode];
    assert.ok(transition, `missing UI transition for ${actionCode}`);
    assert.equal(transition.step_id, stepId, `wrong transition step for ${actionCode}`);
    assert.ok(
      Array.isArray(transition.from_menu_ids) && transition.from_menu_ids.includes(menuId),
      `transition ${actionCode} must allow from menu ${menuId}`
    );
    assert.equal(transition.to_menu_id, nextMenuId, `wrong next menu for ${actionCode}`);
  }
});
