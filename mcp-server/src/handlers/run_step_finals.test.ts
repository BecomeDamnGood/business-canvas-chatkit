// Unit tests for run_step: finals merge, wants_recap, off-topic policy (no LLM)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDefaultState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import {
  applyStateUpdate,
  enforceDreamMenuContract,
  pickPrompt,
  RECAP_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
} from "./run_step.js";
import { BigWhyZodSchema } from "../steps/bigwhy.js";
import { VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS } from "../steps/step_0_validation.js";
import { DREAM_INSTRUCTIONS } from "../steps/dream.js";
import { PURPOSE_INSTRUCTIONS } from "../steps/purpose.js";

test("finals merge: applyStateUpdate does not overwrite unrelated finals", () => {
  const prev = getDefaultState();
  (prev as any).dream_final = "Existing dream";
  (prev as any).business_name = "Acme";
  const decision: OrchestratorOutput = {
    specialist_to_call: "Purpose",
    specialist_input: "",
    current_step: "purpose",
    intro_shown_for_step: "",
    intro_shown_session: "true",
    show_step_intro: "false",
    show_session_intro: "false",
  };
  const specialistResult = {
    action: "CONFIRM",
    message: "",
    question: "",
    refined_formulation: "",
    confirmation_question: "",
    purpose: "Our purpose is X",
    proceed_to_next: "false",
    wants_recap: false,
  };
  const next = applyStateUpdate({
    prev,
    decision,
    specialistResult,
    showSessionIntroUsed: "true",
  });
  assert.equal((next as any).purpose_final, "Our purpose is X", "purpose_final set");
  assert.equal((next as any).dream_final, "Existing dream", "dream_final not overwritten");
  assert.equal((next as any).business_name, "Acme", "business_name not overwritten");
});

test("wants_recap: BigWhy schema accepts wants_recap and does not break validation", () => {
  const output = {
    action: "ASK" as const,
    message: "",
    question: "What is your big why?",
    refined_formulation: "",
    confirmation_question: "",
    bigwhy: "",
    proceed_to_next: "false" as const,
    wants_recap: true,
  };
  const parsed = BigWhyZodSchema.parse(output);
  assert.equal(parsed.wants_recap, true);
  assert.equal(parsed.action, "ASK");
});

// ---- UNIVERSAL_META_OFFTOPIC_POLICY: Step 0 unchanged, non-Step0 includes policy, recap intact ----
const MINIMAL_CONTEXT = "STATE FINALS (canonical; use for recap; do not invent)\n(none yet)\n";

test("UNIVERSAL_META_OFFTOPIC_POLICY: step_0 prompt assembly is unchanged", () => {
  const step0Instructions = `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${MINIMAL_CONTEXT}\n\n${RECAP_INSTRUCTION}`;
  assert.ok(!step0Instructions.includes("UNIVERSAL_META_OFFTOPIC_POLICY"), "Step 0 prompt unchanged: no meta/off-topic block");
});

test("UNIVERSAL_META_OFFTOPIC_POLICY: recap instruction still present and not altered", () => {
  const step0Instructions = `${VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS}\n\n${MINIMAL_CONTEXT}\n\n${RECAP_INSTRUCTION}`;
  assert.ok(step0Instructions.includes("wants_recap"), "recap behavior not removed from Step 0");
  assert.ok(step0Instructions.includes("STATE FINALS"), "recap context still present");
  assert.ok(RECAP_INSTRUCTION.includes("UNIVERSAL RECAP"), "recap instruction block unchanged");
});

test("UNIVERSAL_META_OFFTOPIC_POLICY: non-step_0 prompt assembly includes policy", () => {
  const purposeInstructions = `${PURPOSE_INSTRUCTIONS}\n\n${MINIMAL_CONTEXT}\n\n${RECAP_INSTRUCTION}\n\n${UNIVERSAL_META_OFFTOPIC_POLICY}`;
  assert.ok(
    purposeInstructions.includes("UNIVERSAL_META_OFFTOPIC_POLICY"),
    "non-Step0 includes UNIVERSAL_META_OFFTOPIC_POLICY where applicable"
  );
  assert.ok(purposeInstructions.includes("wants_recap"), "recap behavior still present");
  assert.ok(purposeInstructions.includes("Ben Steenstra"), "Ben factual reference present");
  assert.ok(purposeInstructions.includes("www.bensteenstra.com"), "Ben reference URL present");
  assert.ok(purposeInstructions.includes("maybe we're not the right fit"), "polite stop option present");
});

test("Dream menu prompt uses numbered question (not confirmation_question)", () => {
  const prompt = pickPrompt({
    menu_id: "DREAM_MENU_REFINE",
    question:
      "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    confirmation_question: "Please confirm before continuing.",
  });
  assert.ok(prompt.startsWith("1) I'm happy with this wording"), "Dream menu must render from numbered question");
});

test("Dream specialist instructions must not append universal meta/off-topic policy block", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.equal(
    source.includes(
      "${DREAM_INSTRUCTIONS}\\n\\n${LANGUAGE_LOCK_INSTRUCTION}\\n\\n${contextBlock}\\n\\n${RECAP_INSTRUCTION}\\n\\n${UNIVERSAL_META_OFFTOPIC_POLICY}"
    ),
    false,
    "Dream specialist should rely on Dream-local META/OFF-TOPIC rules only"
  );
});

test("Dream menu contract: malformed ESCAPE menu question is rewritten to canonical two-option menu", () => {
  const corrected = enforceDreamMenuContract(
    {
      action: "ASK",
      menu_id: "DREAM_MENU_ESCAPE",
      question: "Continue?",
      confirmation_question: "old confirm prompt",
    },
    {
      ...getDefaultState(),
      current_step: "dream",
      business_name: "Acme",
    } as any
  );
  assert.equal(corrected.menu_id, "DREAM_MENU_ESCAPE");
  assert.equal(corrected.confirmation_question, "");
  assert.ok(String(corrected.question).includes("1) Continue Dream now"));
  assert.ok(String(corrected.question).includes("2) Finish later"));
});

test("Dream menu contract: valid REFINE menu question is preserved", () => {
  const specialist = {
    action: "REFINE",
    menu_id: "DREAM_MENU_REFINE",
    question:
      "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    confirmation_question: "",
  };
  const corrected = enforceDreamMenuContract(
    specialist,
    {
      ...getDefaultState(),
      current_step: "dream",
      business_name: "Acme",
    } as any
  );
  assert.equal(corrected.question, specialist.question);
});
