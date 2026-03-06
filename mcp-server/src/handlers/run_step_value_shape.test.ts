import test from "node:test";
import assert from "node:assert/strict";

import { isValidStepValueForStorage, looksLikeExamplesFramingLine } from "./run_step_value_shape.js";

test("looksLikeExamplesFramingLine detects localized examples intro", () => {
  assert.equal(
    looksLikeExamplesFramingLine("Hier zijn drie korte voorbeelden van een Purpose voor Mindd:."),
    true
  );
  assert.equal(
    looksLikeExamplesFramingLine("Here are three short role examples for Mindd:"),
    true
  );
});

test("looksLikeExamplesFramingLine does not flag normal sentence with examples term", () => {
  assert.equal(
    looksLikeExamplesFramingLine("Wij bouwen praktijkvoorbeelden voor teams die sneller willen leren."),
    false
  );
});

test("isValidStepValueForStorage rejects framing lines for non-step0/presentation steps", () => {
  const value = "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.";
  assert.equal(isValidStepValueForStorage("purpose", value), false);
  assert.equal(isValidStepValueForStorage("bigwhy", value), false);
  assert.equal(isValidStepValueForStorage("targetgroup", value), false);
});

test("isValidStepValueForStorage keeps step0 and presentation permissive", () => {
  const value = "Hier zijn drie korte voorbeelden van een Purpose voor Mindd:.";
  assert.equal(isValidStepValueForStorage("step_0", value), true);
  assert.equal(isValidStepValueForStorage("presentation", value), true);
});
