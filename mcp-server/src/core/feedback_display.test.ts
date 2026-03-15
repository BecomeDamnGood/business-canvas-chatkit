import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeFeedbackReasonForDisplay } from "./feedback_display.js";

function resolveString(key: string, fallback = ""): string {
  const strings: Record<string, string> = {
    "offtopic.step.purpose": "Purpose",
    "wording.feedback.compare.intro.template":
      "I think I understand what you mean. For a stronger {0}, it helps to keep this in mind.",
  };
  return strings[key] || fallback;
}

test("sanitizeFeedbackReasonForDisplay suppresses pure Dutch generic acknowledgment", () => {
  assert.equal(
    sanitizeFeedbackReasonForDisplay({
      stepId: "purpose",
      rawReason: "Ik denk dat ik begrijp wat je bedoelt.",
      resolveString,
    }),
    ""
  );
});

test("sanitizeFeedbackReasonForDisplay suppresses pure English generic acknowledgment", () => {
  assert.equal(
    sanitizeFeedbackReasonForDisplay({
      stepId: "purpose",
      rawReason: "I think I understand what you mean.",
      resolveString,
    }),
    ""
  );
});

test("sanitizeFeedbackReasonForDisplay keeps rationale after a generic acknowledgment opener", () => {
  assert.equal(
    sanitizeFeedbackReasonForDisplay({
      stepId: "purpose",
      rawReason:
        "I think I understand what you mean. Your current wording is still too broad and does not yet show the concrete change Mindd creates.",
      resolveString,
    }),
    "Your current wording is still too broad and does not yet show the concrete change Mindd creates."
  );
});

test("sanitizeFeedbackReasonForDisplay keeps Dutch rationale after a generic acknowledgment opener", () => {
  assert.equal(
    sanitizeFeedbackReasonForDisplay({
      stepId: "purpose",
      rawReason:
        "Ik denk dat ik begrijp wat je bedoelt. Je formulering blijft nog te algemeen en laat niet concreet zien welke verandering Mindd mogelijk maakt.",
      resolveString,
    }),
    "Je formulering blijft nog te algemeen en laat niet concreet zien welke verandering Mindd mogelijk maakt."
  );
});

test("sanitizeFeedbackReasonForDisplay keeps encouragement when the sentence also contains concrete rationale", () => {
  assert.equal(
    sanitizeFeedbackReasonForDisplay({
      stepId: "purpose",
      rawReason:
        "Dat is al een sterk beginpunt, maar je formulering blijft nog te algemeen en maakt niet concreet voor wie je verschil maakt.",
      resolveString,
    }),
    "Dat is al een sterk beginpunt, maar je formulering blijft nog te algemeen en maakt niet concreet voor wie je verschil maakt."
  );
});
