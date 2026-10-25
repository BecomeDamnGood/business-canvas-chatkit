import assert from "node:assert/strict";
import test from "node:test";

import { parseExplicitLanguageOverride } from "../core/bootstrap_runtime.js";
import { prepareUserInputSurface } from "./run_step_surface_correction.js";

test("explicit language control is identified from the raw input before surface correction", async () => {
  const rawInput = "language: en";
  const correction = await prepareUserInputSurface(
    {
      model: "test",
      state: { language: "nl", locale: "nl" } as never,
      userMessage: rawInput,
      submittedUserText: rawInput,
      actionCodeRaw: "",
      localeHint: "nl",
      normalizeLangCode: (value) => value,
    },
    parseExplicitLanguageOverride
  );

  assert.equal(correction.correctedText, rawInput);
  assert.equal(correction.source, "language_control");
});
