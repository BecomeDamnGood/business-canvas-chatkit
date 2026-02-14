// Unit tests for run_step: finals merge, wants_recap, off-topic policy (no LLM)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDefaultState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import {
  run_step,
  applyStateUpdate,
  enforceDreamMenuContract,
  pickPrompt,
  RECAP_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
} from "./run_step.js";
import { BigWhyZodSchema } from "../steps/bigwhy.js";
import { VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS } from "../steps/step_0_validation.js";
import { PURPOSE_INSTRUCTIONS } from "../steps/purpose.js";

async function withEnv<T>(key: string, value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[key];
  process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
}

function countNumberedOptions(text: string): number {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const m = line.match(/^([1-9])[\)\.]\s+/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx !== count + 1) break;
    count += 1;
  }
  return count;
}

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
    is_offtopic: false,
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

test("Dream menu contract: ESCAPE menu is never rewritten by Dream contract", () => {
  const specialist = {
    action: "ASK",
    menu_id: "DREAM_MENU_ESCAPE",
    question: "Continue?",
    confirmation_question: "old confirm prompt",
  };
  const corrected = enforceDreamMenuContract(
    specialist,
    {
      ...getDefaultState(),
      current_step: "dream",
      business_name: "Acme",
    } as any
  );
  assert.deepEqual(corrected, specialist);
});

test("Dream menu contract: INTRO menu rewrites leaked Refine prompt tail to Define", () => {
  const corrected = enforceDreamMenuContract(
    {
      action: "ASK",
      menu_id: "DREAM_MENU_INTRO",
      question:
        "1) Tell me more about why a dream matters\n2) Do a small exercise that helps to define your dream.\n\nRefine the Dream of Acme or choose an option.",
      confirmation_question: "",
    },
    {
      ...getDefaultState(),
      current_step: "dream",
      business_name: "Acme",
    } as any
  );
  assert.equal(String(corrected.question).includes("Refine the Dream of"), false);
  assert.ok(String(corrected.question).includes("Define the Dream of Acme or choose an option."));
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

test("off-topic overlay applies only when specialist returns is_offtopic=true", async () => {
  const baseState = {
    ...getDefaultState(),
    current_step: "dream",
    active_specialist: "Dream",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    started: "true",
    business_name: "Acme",
    dream_final: "Become the trusted local partner.",
    last_specialist_result: {
      action: "REFINE",
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    },
  };

  const normalTurn = await run_step({
    user_message: "We serve local makers.",
    state: baseState,
  });
  assert.equal(normalTurn.ok, true);
  assert.equal(String(normalTurn.prompt || ""), "Test question");

  const offTopicTurn = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state: baseState,
    })
  );
  assert.equal(offTopicTurn.ok, true);
  assert.equal(String(offTopicTurn.specialist?.is_offtopic || ""), "true");
  assert.equal(String(offTopicTurn.specialist?.menu_id || ""), "DREAM_MENU_REFINE");
  assert.ok(Array.isArray(offTopicTurn.ui?.action_codes));
  assert.equal(
    countNumberedOptions(String(offTopicTurn.prompt || "")),
    offTopicTurn.ui?.action_codes?.length || 0
  );
  assert.equal(String(offTopicTurn.prompt || "").includes("Continue Dream now"), false);
});

test("Step 0 off-topic overlay with no output: no continue/menu buttons", async () => {
  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state: {
        ...getDefaultState(),
        current_step: "step_0",
        active_specialist: "ValidationAndBusinessName",
        intro_shown_session: "true",
        started: "true",
        last_specialist_result: {},
      },
    })
  );
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.is_offtopic || ""), "true");
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
  assert.ok(String(result.prompt || "").includes("Define your Step 0"));
  assert.ok(String(result.text || "").includes("We have not yet defined Step 0."));
  assert.equal(Array.isArray(result.ui?.action_codes), false);
});

test("Step 0 off-topic overlay with valid output: continue shown, no step menu buttons", async () => {
  const step0State = {
    ...getDefaultState(),
    current_step: "step_0",
    active_specialist: "ValidationAndBusinessName",
    intro_shown_session: "true",
    started: "true",
    step_0_final: "Venture: advertising agency | Name: Mindd | Status: existing",
    business_name: "Mindd",
    last_specialist_result: {},
  };

  const offTopic = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state: step0State,
    })
  );
  assert.equal(offTopic.ok, true);
  assert.equal(String(offTopic.specialist?.action || ""), "CONFIRM");
  assert.ok(String(offTopic.prompt || "").includes("Refine your Step 0 for Mindd or choose an option."));
  assert.equal(Array.isArray(offTopic.ui?.action_codes), false);
});

test("Step 0 legacy confirm prompt is preserved (no global renderer rewrite)", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      ...getDefaultState(),
      current_step: "step_0",
      active_specialist: "ValidationAndBusinessName",
      intro_shown_session: "false",
      started: "true",
      step_0_final: "Venture: advertising agency | Name: Mindd | Status: existing",
      business_name: "Mindd",
      last_specialist_result: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "CONFIRM");
  assert.equal(
    String(result.specialist?.confirmation_question || ""),
    "You have a advertising agency called Mindd. Are you ready to start with the first step: the Dream?"
  );
  assert.equal(
    String(result.prompt || ""),
    "You have a advertising agency called Mindd. Are you ready to start with the first step: the Dream?"
  );
  assert.equal(String(result.prompt || "").includes("This is what we have established"), false);
  assert.equal(String(result.prompt || "").includes("Refine your Step 0"), false);
  assert.equal(String(result.specialist?.menu_id || ""), "");
  assert.equal(Array.isArray(result.ui?.action_codes), false);
});

test("global free-text policy: ActionCode turn bypasses renderer", async () => {
  const result = await run_step({
    user_message: "ACTION_DREAM_REFINE_START_EXERCISE",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      started: "true",
      dream_final: "Become the trusted local partner.",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.ui?.action_codes), false);
});
