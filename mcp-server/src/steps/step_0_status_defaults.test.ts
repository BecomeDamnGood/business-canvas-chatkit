import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP_0_BOOTSTRAP_INSTRUCTIONS,
} from "./step_0_bootstrap.js";
import {
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
} from "./step_0_validation.js";

test("step 0 validation instructions default unclear venture status to existing", () => {
  assert.match(VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS, /If unclear, default to "existing"\./);
  assert.match(
    VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
    /Only classify as "starting" when the user explicitly says they want to start/
  );
});

test("step 0 bootstrap instructions align unknown and unclear status handling with existing-first default", () => {
  assert.match(STEP_0_BOOTSTRAP_INSTRUCTIONS, /When recognized=false, set status="existing"\./);
  assert.match(STEP_0_BOOTSTRAP_INSTRUCTIONS, /if unclear but recognized is true, choose existing/);
});
