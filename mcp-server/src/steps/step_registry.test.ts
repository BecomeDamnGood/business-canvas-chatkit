import test from "node:test";
import assert from "node:assert/strict";

import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
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

test("step registry metadata stays aligned with the owner-first architecture", () => {
  for (const [index, stepId] of STEP_REGISTRY_ORDER.entries()) {
    const entry = STEP_REGISTRY_BY_STEP_ID[stepId];
    assert.equal(entry.orderIndex, index, `wrong orderIndex for ${stepId}`);
    assert.ok(entry.titleKey, `missing titleKey for ${stepId}`);
    assert.ok(entry.stepperLabelKey, `missing stepperLabelKey for ${stepId}`);
    assert.ok(entry.sectionTitleMode, `missing sectionTitleMode for ${stepId}`);
    assert.ok(entry.finalField, `missing finalField for ${stepId}`);
    assert.ok(entry.specialistId, `missing specialistId for ${stepId}`);

    if (stepId === "step_0") {
      assert.equal(entry.uiMode, "no_feedback");
      continue;
    }
    if (stepId === "presentation") {
      assert.equal(entry.uiMode, "terminal");
      continue;
    }
    if (stepId === "strategy" || stepId === "productsservices" || stepId === "rulesofthegame") {
      assert.equal(entry.uiMode, "list_compare", `wrong uiMode for ${stepId}`);
      continue;
    }
    assert.equal(
      entry.uiMode,
      "text_compare",
      `wrong uiMode for ${stepId}; ordinary single-value steps must stay text_compare`
    );
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

test("choose-for-me contracts stay aligned with the action registry without menu transitions", () => {
  for (const entry of CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES) {
    const { stepId } = entry;
    const { actionCode, routeToken, mode, itemKind, field } = entry.chooseForMe;
    const action = ACTIONCODE_REGISTRY.actions[actionCode];
    assert.ok(action, `missing action registry entry for ${actionCode}`);
    assert.equal(action.step, stepId, `wrong action step for ${actionCode}`);
    assert.equal(action.dispatch_owner, "special_route", `wrong dispatch owner for ${actionCode}`);
    assert.ok(routeToken.startsWith("__ROUTE__"), `route token must stay explicit for ${actionCode}`);
    assert.ok(mode === "suggestions" || mode === "examples", `unexpected choose-for-me mode for ${actionCode}`);
    assert.ok(itemKind === "sentence" || itemKind === "phrase" || itemKind === "multiline_list");
    assert.ok(Boolean(field), `missing choose-for-me field for ${actionCode}`);
  }
});
