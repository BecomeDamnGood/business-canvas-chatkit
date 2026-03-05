import test from "node:test";
import assert from "node:assert/strict";

import { __testOnly } from "./run_step_presentation.js";

test("presentation section parser keeps all products/services items across mixed run-on labels", () => {
  const lines = __testOnly.presentationLinesForSection(
    "Products and Services: Websites; Apps Target Group: Founders in SME Products and Services: Branding; Coaching",
    "productsservices"
  );

  assert.deepEqual(lines, ["Websites", "Apps", "Branding", "Coaching"]);
});

test("presentation section parser splits semicolon and bullet-like input without losing items", () => {
  const lines = __testOnly.presentationLinesForSection(
    "AI-compatible websites and apps; AI-tools and support; Branding; Strategy; Workshops",
    "productsservices"
  );

  assert.deepEqual(lines, [
    "AI-compatible websites and apps",
    "AI-tools and support",
    "Branding",
    "Strategy",
    "Workshops",
  ]);
});
