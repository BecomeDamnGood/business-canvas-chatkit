import test from "node:test";
import assert from "node:assert/strict";

import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES } from "../steps/step_registry.js";

test("all choose-for-me actions are registry-owned by special routes", () => {
  for (const entry of CHOOSE_FOR_ME_STEP_REGISTRY_ENTRIES) {
    assert.equal(
      ACTIONCODE_REGISTRY.actions[entry.chooseForMe.actionCode]?.dispatch_owner,
      "special_route",
      `${entry.stepId} choose-for-me action must stay route-owned`
    );
  }
});
