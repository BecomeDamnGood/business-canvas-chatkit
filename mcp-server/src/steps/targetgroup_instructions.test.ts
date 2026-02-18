import test from "node:test";
import assert from "node:assert/strict";
import { TARGETGROUP_INSTRUCTIONS } from "./targetgroup.js";

test("TargetGroup instructions include dynamic welcome prompt pattern", () => {
  const text = TARGETGROUP_INSTRUCTIONS;
  assert.ok(
    text.includes(
      'Define the Target Group of <BUSINESS_NAME_OR_FALLBACK> or choose an option'
    ),
    "instructions must describe the dynamic intro prompt with business name or fallback"
  );
  assert.ok(
    text.includes(
      'Define the Target Group of <BUSINESS_NAME_OR_FALLBACK> or let me ask you some questions'
    ),
    "instructions must describe the dynamic explain-more prompt with business name or fallback"
  );
});

test("TargetGroup instructions include non-repetition of strategy rule", () => {
  const text = TARGETGROUP_INSTRUCTIONS;
  assert.ok(
    text.includes("GLOBAL NON-REPETITION RULE (HARD): When writing the targetgroup sentence"),
    "instructions must define a global non-repetition rule for Strategy and other STATE FINALS"
  );
  assert.ok(
    text.includes("Maximum 7 words (hard limit)."),
    "instructions must enforce a hard maximum of 7 words for the final target group"
  );
  assert.ok(
    text.includes("The targetgroup sentence must contain ONLY new segment information."),
    "instructions must state that the target group sentence may only contain new segment information"
  );
  assert.ok(
    text.includes("If a word, number, or phrase appears in Strategy/STATE FINALS, it is forbidden in targetgroup unless the user explicitly asked to repeat it."),
    "instructions must explicitly forbid repeating Strategy/STATE FINALS terms unless the user explicitly asks to repeat them"
  );
  assert.ok(
    text.includes("USER INPUT PRIORITY (HARD)"),
    "instructions must declare a hard user input priority block for specific target group descriptions"
  );
  assert.ok(
    text.includes("the final targetgroup sentence must reflect that description (possibly narrowed or cleaned up)"),
    "instructions must require the final target group to reflect a clear, specific user-defined segment"
  );
  assert.ok(
    text.includes("COPY-FIRST RULE (HARD)"),
    "instructions must define a hard copy-first rule for user-supplied target group sentences"
  );
  assert.ok(
    text.includes("MINIMAL-EDIT ASK RULE (HARD)"),
    "instructions must define a minimal-edit confirm rule for adjusting user-supplied target groups"
  );
});

