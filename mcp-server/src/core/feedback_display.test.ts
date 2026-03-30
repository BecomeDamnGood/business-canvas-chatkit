import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCompareFeedbackForDisplay,
  isMeaningfulUserPickFeedbackText,
  sanitizeUserPickFeedbackTextForDisplay,
} from "./feedback_display.js";
import { UI_STRINGS_SOURCE_EN } from "../i18n/ui_strings_defaults.js";
import { UI_STRINGS_LOCALE_NL } from "../i18n/ui_strings/locales/ui_strings_nl.js";

function resolveFromMap(map: Record<string, string>) {
  return (key: string, fallback = "") => String(map[key] || fallback || "").trim();
}

test("generic user-pick acknowledgment alone is not treated as meaningful explicit feedback", () => {
  const meaningful = isMeaningfulUserPickFeedbackText({
    stepId: "dream",
    rawText: UI_STRINGS_SOURCE_EN["compare.feedback.user_pick.ack.default"],
    resolveString: resolveFromMap(UI_STRINGS_SOURCE_EN),
  });

  assert.equal(meaningful, false);
});

test("warm user-pick feedback with an affirmation and reminder stays meaningful", () => {
  const rawText =
    "Keeping your own wording is completely okay. If you continue with it, keep the future you want to create clearly visible in the sentence.";

  assert.equal(
    sanitizeUserPickFeedbackTextForDisplay(rawText),
    rawText
  );
  assert.equal(
    isMeaningfulUserPickFeedbackText({
      stepId: "dream",
      rawText,
      resolveString: resolveFromMap(UI_STRINGS_SOURCE_EN),
    }),
    true
  );
});

test("harsh provider-side compare feedback is softened through the central display policy", () => {
  const softened = formatCompareFeedbackForDisplay({
    stepId: "dream",
    rawReason:
      "The original input was too focused on the provider side and did not express the broader human effect or the desired future state.",
    resolveString: resolveFromMap(UI_STRINGS_SOURCE_EN),
  });

  assert.equal(
    softened,
    UI_STRINGS_SOURCE_EN["compare.feedback.reason.soft.provider_future.default"]
  );
});

test("Dutch target-group compare feedback keeps the softened localized rewrite", () => {
  const softened = formatCompareFeedbackForDisplay({
    stepId: "targetgroup",
    rawReason: "Deze doelgroep is te breed om richting te geven aan je keuzes.",
    resolveString: resolveFromMap(UI_STRINGS_LOCALE_NL),
  });

  assert.equal(
    softened,
    UI_STRINGS_LOCALE_NL["compare.feedback.reason.soft.targetgroup.too_broad.default"]
  );
});
