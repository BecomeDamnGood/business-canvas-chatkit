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
  isWordingChoiceEligibleStep,
  isMaterialRewriteCandidate,
  areEquivalentWordingVariants,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
  pickDualChoiceSuggestion,
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

test("off-topic overlay keeps previous statement recap when no final exists yet", async () => {
  const state = {
    ...getDefaultState(),
    current_step: "entity",
    active_specialist: "Entity",
    intro_shown_session: "true",
    intro_shown_for_step: "entity",
    started: "true",
    business_name: "Mindd",
    entity_final: "",
    last_specialist_result: {
      action: "REFINE",
      menu_id: "ENTITY_MENU_EXAMPLE",
      question:
        "1) I'm happy with this wording, go to the next step Strategy.\n2) Refine the wording for me please",
      refined_formulation: "Purpose-driven advertising agency",
      entity: "Purpose-driven advertising agency",
      confirmation_question: "",
      proceed_to_next: "false",
      wants_recap: false,
      is_offtopic: false,
    },
  };

  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state,
    })
  );
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.is_offtopic || ""), "true");
  assert.equal(String(result.text || "").includes("We have not yet defined Entity."), false);
  assert.equal(
    String(result.text || "").includes("Purpose-driven advertising agency"),
    true
  );
});

test("off-topic dream with existing candidate (no final) keeps both Dream refine actions", async () => {
  const state = {
    ...getDefaultState(),
    current_step: "dream",
    active_specialist: "Dream",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    started: "true",
    business_name: "Mindd",
    dream_final: "",
    last_specialist_result: {
      action: "REFINE",
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      refined_formulation: "Mindd dreams of a world with meaningful impact.",
      dream: "Mindd dreams of a world with meaningful impact.",
      confirmation_question: "",
      proceed_to_next: "false",
      wants_recap: false,
      is_offtopic: false,
    },
  };

  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state,
    })
  );

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.is_offtopic || ""), "true");
  assert.equal(String(result.specialist?.menu_id || ""), "DREAM_MENU_REFINE");
  assert.deepEqual(result.ui?.action_codes, [
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_REFINE_START_EXERCISE",
  ]);
  assert.equal(countNumberedOptions(String(result.prompt || "")), 2);
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
  assert.equal(
    String(result.prompt || ""),
    "What type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'."
  );
  assert.ok(String(result.text || "").includes("We did not validate your business and name yet"));
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
  assert.equal(
    String(offTopic.prompt || ""),
    "You have an advertising agency called Mindd. Are you ready to start with the first step: the Dream?"
  );
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

test("Step 0 initial ASK includes intro body text above prompt", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      ...getDefaultState(),
      current_step: "step_0",
      active_specialist: "ValidationAndBusinessName",
      intro_shown_session: "false",
      started: "true",
      step_0_final: "",
      business_name: "TBD",
      last_specialist_result: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(
    String(result.text || ""),
    "Just to set the context, we'll start with the basics."
  );
  assert.equal(
    String(result.prompt || ""),
    "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?"
  );
});

test("Step 0 ASK fallback injects canonical small intro text when specialist message is empty", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      ...getDefaultState(),
      current_step: "step_0",
      active_specialist: "ValidationAndBusinessName",
      intro_shown_session: "true",
      started: "true",
      step_0_final: "",
      business_name: "TBD",
      last_specialist_result: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.text || ""), "Just to set the context, we'll start with the basics.");
  assert.equal(String(result.prompt || ""), "Test question");
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

test("wording choice: pending selection blocks extra free-text input until pick is made", async () => {
  const state = {
    ...getDefaultState(),
    current_step: "strategy",
    active_specialist: "Strategy",
    intro_shown_session: "true",
    started: "true",
    last_specialist_result: {
      action: "ASK",
      menu_id: "STRATEGY_MENU_ASK",
      question:
        "1) Ask me some questions to clarify my Strategy\n2) Show me an example of a Strategy for my business",
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_mode: "list",
      wording_choice_target_field: "strategy",
      wording_choice_user_items: ["Focus on NL"],
      wording_choice_suggestion_items: ["Focus on profitable clients"],
      wording_choice_user_raw: "Focus on NL",
      wording_choice_user_normalized: "Focus on NL",
      wording_choice_agent_current: "Focus on profitable clients",
    },
  };
  const result = await run_step({
    user_message: "Add one more strategy point",
    input_mode: "widget",
    state,
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "strategy");
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "true");
});

test("wording choice: material rewrite heuristic ignores mini-fix but catches substantial rewrite", () => {
  assert.equal(isMaterialRewriteCandidate("We help founders.", "We help founders."), false);
  assert.equal(
    isMaterialRewriteCandidate(
      "i want be rich",
      "I want to be rich."
    ),
    false
  );
  assert.equal(
    isMaterialRewriteCandidate(
      "We help founders with strategy.",
      "Our purpose is to help founders make strategic decisions with confidence and focus."
    ),
    true
  );
  assert.equal(
    isMaterialRewriteCandidate(
      "Companies with a purpose show less unethical behavior toward employees, customers, and their environment.",
      "Mindd believes that a clear purpose helps companies act ethically toward employees, customers, and the environment."
    ),
    true
  );
});

test("wording choice: equivalent text variants are auto-resolved (no A/B needed)", () => {
  assert.equal(
    areEquivalentWordingVariants({
      mode: "text",
      userRaw: "I want to be rich",
      suggestionRaw: "I want to be rich.",
      userItems: [],
      suggestionItems: [],
    }),
    true
  );
});

test("wording choice: equivalent list variants are auto-resolved (no A/B needed)", () => {
  assert.equal(
    areEquivalentWordingVariants({
      mode: "list",
      userRaw: "Focus on NL\nFocus on clients above 40k",
      suggestionRaw: "Focus on clients above 40k\nFocus on NL",
      userItems: [
        "Focus on NL",
        "Focus on clients above 40k",
      ],
      suggestionItems: [
        "Focus on clients above 40k.",
        "Focus on NL.",
      ],
    }),
    true
  );
  assert.equal(
    areEquivalentWordingVariants({
      mode: "list",
      userRaw: "Focus on NL\nFocus on clients above 40k",
      suggestionRaw: "Focus on NL\nFocus on clients above 40k\nAdd one more",
      userItems: [
        "Focus on NL",
        "Focus on clients above 40k",
      ],
      suggestionItems: [
        "Focus on NL",
        "Focus on clients above 40k",
        "Add one more",
      ],
    }),
    false
  );
});

test("wording choice: step_0 is never eligible for dual-choice", () => {
  assert.equal(isWordingChoiceEligibleStep("step_0"), false);
  assert.equal(isWordingChoiceEligibleStep("dream"), true);
  assert.equal(isWordingChoiceEligibleStep("purpose"), true);
});

test("off-topic guard: step-contributing input is not treated as general off-topic", () => {
  assert.equal(isClearlyGeneralOfftopicInput("Who is Ben Steenstra?"), true);
  assert.equal(shouldTreatAsStepContributingInput("I want to become Rich", "purpose"), true);
  assert.equal(shouldTreatAsStepContributingInput("What is the time in London?", "purpose"), false);
});

test("wording choice: suggestion fallback extracts rewritten content from message", () => {
  const suggestion = pickDualChoiceSuggestion(
    "dream",
    {
      refined_formulation: "",
      message:
        "That’s a strong foundation. A Dream goes beyond purpose and paints a vivid picture of the world your business wants to help create.\n\nLet’s sharpen your thought into a clear Dream statement for Mindd.\n\nMindd dreams of a world in which every company is purpose-driven and earns a sustainable right to exist.",
    },
    {}
  );
  assert.equal(
    suggestion,
    "Mindd dreams of a world in which every company is purpose-driven and earns a sustainable right to exist."
  );
});

test("wording choice: picks material candidate when refined echoes user input", () => {
  const user = "Companies with a purpose show less unethical behavior toward employees, customers, and their environment.";
  const suggestion = pickDualChoiceSuggestion(
    "purpose",
    {
      refined_formulation: user,
      message:
        "I think I understand what you mean.\n\nMindd believes that a clear purpose helps companies act ethically toward employees, customers, and the environment.",
    },
    {},
    user
  );
  assert.equal(
    suggestion,
    "Mindd believes that a clear purpose helps companies act ethically toward employees, customers, and the environment."
  );
});

test("wording choice: pending state blocks confirm action until choice is made", async () => {
  const result = await run_step({
    user_message: "ACTION_DREAM_REFINE_CONFIRM",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      started: "true",
      dream_final: "",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
        refined_formulation: "Mindd dreams of a world with equitable access.",
        wording_choice_pending: "true",
        wording_choice_user_raw: "Mindd should support access.",
        wording_choice_user_normalized: "Mindd should support access.",
        wording_choice_agent_current: "Mindd dreams of a world with equitable access.",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.current_step_id, "dream");
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(Array.isArray(result.ui?.action_codes), false);
});

test("wording choice: pending text mode does not repeat suggestion in body text", async () => {
  const suggestion = "Mindd dreams of a world with equitable access.";
  const result = await run_step({
    user_message: "ACTION_DREAM_REFINE_CONFIRM",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      started: "true",
      dream_final: "",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
        message: `Intro paragraph.\n\n${suggestion}`,
        refined_formulation: suggestion,
        wording_choice_pending: "true",
        wording_choice_mode: "text",
        wording_choice_user_raw: "Mindd should support access.",
        wording_choice_user_normalized: "Mindd should support access.",
        wording_choice_agent_current: suggestion,
        wording_choice_target_field: "dream",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(String(result.text || "").includes(suggestion), false);
});

test("Dream readiness confirm is excluded from hard-confirm fast path", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /const isDreamReadinessConfirmTurn\s*=/);
  assert.match(source, /actionCodeRaw === "ACTION_CONFIRM_CONTINUE"/);
  assert.match(source, /HARD_CONFIRM_ACTIONS\.has\(actionCodeRaw\)\s*&&\s*!isDreamReadinessConfirmTurn/);
});

test("wording choice: selecting user variant updates candidate and clears pending", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "PURPOSE_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to next step Big Why.\n2) Refine the wording",
        message: "A Purpose should capture deeper meaning, not just operational wording.",
        refined_formulation: "Mindd exists to restore focus and meaning in work.",
        wording_choice_pending: "true",
        wording_choice_user_raw: "Mindd helps teams with clarity",
        wording_choice_user_normalized: "Mindd helps teams with clarity.",
        wording_choice_agent_current: "Mindd exists to restore focus and meaning in work.",
        wording_choice_mode: "text",
        wording_choice_target_field: "purpose",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "false");
  assert.equal(String(result.specialist?.wording_choice_selected || ""), "user");
  assert.equal(String(result.specialist?.purpose || ""), "Mindd helps teams with clarity.");
  assert.equal(String(result.specialist?.action || ""), "REFINE");
  assert.equal(String(result.specialist?.menu_id || ""), "PURPOSE_MENU_REFINE");
  assert.equal(
    String(result.specialist?.question || ""),
    "1) I'm happy with this wording, please continue to next step Big Why.\n2) Refine the wording"
  );
  assert.equal(
    String(result.specialist?.message || ""),
    "You chose your own wording and that's fine. But please remember that A Purpose should capture deeper meaning, not just operational wording.\n\nYour current Purpose for Mindd is:"
  );
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
});

test("wording choice: selection message falls back to your future company when name is missing", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_SUGGESTION",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      started: "true",
      business_name: "TBD",
      step_0_final: "",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
        refined_formulation: "Mindd dreams of a world with equitable access.",
        wording_choice_pending: "true",
        wording_choice_user_raw: "I want to help teams",
        wording_choice_user_normalized: "I want to help teams.",
        wording_choice_agent_current: "Mindd dreams of a world with equitable access.",
        wording_choice_mode: "text",
        wording_choice_target_field: "dream",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.message || ""), "Your current Dream for your future company is:");
});

test("wording choice: user pick preserves multi-line strategy input and shows feedback", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "strategy",
      active_specialist: "Strategy",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "STRATEGY_MENU_REFINE",
        message: "This wording is still broad and could be sharpened with clearer focus points.",
        question: "Refine your strategy or choose an option.",
        refined_formulation: "1) Focus\n2) Execute",
        wording_choice_pending: "true",
        wording_choice_user_raw: "1) Build trust with clients\n2) Run monthly workshops",
        wording_choice_user_normalized: "1) Build trust with clients\n2) Run monthly workshops",
        wording_choice_agent_current: "1) Focus\n2) Execute",
        wording_choice_mode: "list",
        wording_choice_target_field: "strategy",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.strategy || ""), "Build trust with clients\nRun monthly workshops");
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.menu_id || ""), "STRATEGY_MENU_ASK");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_STRATEGY_ASK_3_QUESTIONS", "ACTION_STRATEGY_ASK_GIVE_EXAMPLES"]);
  assert.match(
    String(result.specialist?.message || ""),
    /You chose your own wording and that's fine\./
  );
  assert.match(
    String(result.specialist?.message || ""),
    /This wording is still broad and could be sharpened with clearer focus points\./
  );
});

test("wording choice: strategy suggestion pick restores buttons and keeps progress recap line", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_SUGGESTION",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "strategy",
      active_specialist: "Strategy",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "",
        question: "Is there more that Mindd will always focus on?",
        confirmation_question: "",
        message:
          "Both focus points are noted.\nFocus point 1 noted: Focus exclusively on clients in the Netherlands.\nFocus point 2 noted: Focus on clients with an annual budget above 40,000 euros.\nIf you meant something different, tell me and I'll adjust.\nSo far we have these 2 strategic focus points.",
        statements: [
          "Focus exclusively on clients in the Netherlands",
          "Focus on clients with an annual budget above 40,000 euros",
        ],
        strategy:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        refined_formulation:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        wording_choice_pending: "true",
        wording_choice_user_raw:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        wording_choice_user_normalized:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        wording_choice_agent_current:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        wording_choice_mode: "list",
        wording_choice_target_field: "strategy",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.menu_id || ""), "STRATEGY_MENU_ASK");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_STRATEGY_ASK_3_QUESTIONS", "ACTION_STRATEGY_ASK_GIVE_EXAMPLES"]);
  assert.match(String(result.specialist?.message || ""), /This is what we have established so far based on our dialogue/);
  assert.match(String(result.specialist?.message || ""), /• Focus exclusively on clients in the Netherlands/);
  assert.match(String(result.specialist?.message || ""), /• Focus on clients with an annual budget above 40,000 euros/);
  assert.equal(String(result.specialist?.message || "").includes("Focus point 1 noted:"), false);
  assert.equal(
    /Your current Strategy for Mindd is:\n\nFocus exclusively on clients in the Netherlands/i.test(
      String(result.specialist?.message || "")
    ),
    false
  );
});

test("wording choice: generic Purpose acknowledgement is replaced with step-specific feedback", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "CONFIRM",
        menu_id: "",
        question: "",
        confirmation_question:
          "Is this an accurate formulation of the Purpose of Mindd, or do you want to refine it?",
        message: "I think I understand what you mean.",
        refined_formulation:
          "Mindd believes that a clear purpose helps companies act ethically toward employees, customers, and the environment.",
        wording_choice_pending: "true",
        wording_choice_user_raw:
          "Companies with a purpose show less unethical behavior toward employees, customers, and their environment and therefor get more rich.",
        wording_choice_user_normalized:
          "Companies with a purpose show less unethical behavior toward employees, customers, and their environment and therefor get more rich.",
        wording_choice_agent_current:
          "Mindd believes that a clear purpose helps companies act ethically toward employees, customers, and the environment.",
        wording_choice_mode: "text",
        wording_choice_target_field: "purpose",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.match(
    String(result.specialist?.message || ""),
    /Purpose should express deeper meaning and contribution, not personal outcomes like money or status\./
  );
  assert.equal(String(result.specialist?.menu_id || ""), "PURPOSE_MENU_REFINE");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_PURPOSE_REFINE_CONFIRM", "ACTION_PURPOSE_REFINE_ADJUST"]);
});

test("wording choice: Entity user pick restores contract menu buttons when source prompt has no numbered options", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "entity",
      active_specialist: "Entity",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "",
        question: "How would you qualify the agency in a few words so someone immediately understands what kind of agency it is?",
        confirmation_question: "",
        message: "The container word 'Advertising Agency' is correct, but it is still broad.",
        entity: "Strategic Advertising Agency.",
        refined_formulation: "Strategic Advertising Agency.",
        wording_choice_pending: "true",
        wording_choice_user_raw: "Advertising Agency",
        wording_choice_user_normalized: "Advertising Agency.",
        wording_choice_agent_current: "Strategic Advertising Agency.",
        wording_choice_mode: "text",
        wording_choice_target_field: "entity",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.menu_id || ""), "ENTITY_MENU_EXAMPLE");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_ENTITY_EXAMPLE_CONFIRM", "ACTION_ENTITY_EXAMPLE_REFINE"]);
});

test("wording choice: Big Why user pick downgrades generic confirm to contract refine menu", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "bigwhy",
      active_specialist: "BigWhy",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "CONFIRM",
        menu_id: "",
        question: "",
        confirmation_question: "Does this capture the Big Why of Mindd, and do you want to continue to the next step Role?",
        message: "I think I understand what you mean.",
        bigwhy:
          "People deserve to live in a world where every business acts as a force for meaningful, sustainable impact, not just profit.",
        refined_formulation:
          "People deserve to live in a world where every business acts as a force for meaningful, sustainable impact, not just profit.",
        wording_choice_pending: "true",
        wording_choice_user_raw:
          "People deserve to live in a world where every business acts as a force for meaningful, sustainable impact, not just profit.",
        wording_choice_user_normalized:
          "People deserve to live in a world where every business acts as a force for meaningful, sustainable impact, not just profit.",
        wording_choice_agent_current:
          "People deserve to live in a world where every business acts as a force for meaningful, sustainable impact, not just profit.",
        wording_choice_mode: "text",
        wording_choice_target_field: "bigwhy",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.menu_id || ""), "BIGWHY_MENU_REFINE");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
  assert.deepEqual(result.ui?.action_codes, ["ACTION_BIGWHY_REFINE_CONFIRM", "ACTION_BIGWHY_REFINE_ADJUST"]);
});

test("wording choice: Role user pick restores contract refine menu instead of generic continue", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "role",
      active_specialist: "Role",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "CONFIRM",
        menu_id: "",
        question: "",
        confirmation_question: "Are you ready to continue to Entity?",
        message: "I think I understand what you mean.",
        role: "Mindd sets standards for purpose-driven business.",
        refined_formulation: "Mindd sets standards for purpose-driven business.",
        wording_choice_pending: "true",
        wording_choice_user_raw: "We offer the best quality.",
        wording_choice_user_normalized: "We offer the best quality.",
        wording_choice_agent_current: "Mindd sets standards for purpose-driven business.",
        wording_choice_mode: "text",
        wording_choice_target_field: "role",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.menu_id || ""), "ROLE_MENU_REFINE");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
  assert.deepEqual(result.ui?.action_codes, ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"]);
});

test("wording choice: Rules user pick keeps incomplete-status menu buttons", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_USER",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "rulesofthegame",
      active_specialist: "RulesOfTheGame",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "",
        question: "Do you want to add more rules?",
        confirmation_question: "",
        message: "So far we have these 2 rules.",
        statements: ["Always be transparent", "Keep promises"],
        rulesofthegame: "Always be transparent\nKeep promises",
        refined_formulation: "Always be transparent\nKeep promises",
        wording_choice_pending: "true",
        wording_choice_user_raw: "Always be transparent\nKeep promises",
        wording_choice_user_normalized: "Always be transparent\nKeep promises",
        wording_choice_agent_current: "Always be transparent\nKeep promises",
        wording_choice_mode: "text",
        wording_choice_target_field: "rulesofthegame",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.menu_id || ""), "RULES_MENU_ASK_EXPLAIN");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_RULES_ASK_EXPLAIN_MORE", "ACTION_RULES_ASK_GIVE_EXAMPLE"]);
});

test("wording choice: Entity suggestion pick normalizes sentence-like suggestion to short phrase", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_SUGGESTION",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "entity",
      active_specialist: "Entity",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "ENTITY_MENU_EXAMPLE",
        question:
          "1) I'm happy with this wording, go to the next step Strategy.\n2) Refine the wording for me please\n\nRefine your Entity in your own words or choose an option.",
        message: "This how your entity could sound like:",
        refined_formulation:
          "We are a values-based brand studio\n\nHow does that sound to you? Do you recognize your self in it?",
        entity: "We are a values-based brand studio",
        wording_choice_pending: "true",
        wording_choice_user_raw: "Strategic Advertising Agency.",
        wording_choice_user_normalized: "Strategic Advertising Agency.",
        wording_choice_agent_current:
          "We are a values-based brand studio\n\nHow does that sound to you? Do you recognize your self in it?",
        wording_choice_mode: "text",
        wording_choice_target_field: "entity",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.entity || ""), "a values-based brand studio");
  assert.equal(String(result.specialist?.refined_formulation || ""), "a values-based brand studio");
  assert.equal(String(result.specialist?.menu_id || ""), "ENTITY_MENU_EXAMPLE");
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
});

test("wording choice: off-topic overlay never exposes wording choice panel", async () => {
  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      input_mode: "widget",
      state: {
        ...getDefaultState(),
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        started: "true",
        last_specialist_result: {
          action: "REFINE",
          menu_id: "PURPOSE_MENU_REFINE",
          refined_formulation: "Mindd exists to restore focus and meaning in work.",
          wording_choice_pending: "true",
          wording_choice_user_raw: "Mindd helps teams with clarity",
          wording_choice_user_normalized: "Mindd helps teams with clarity.",
          wording_choice_agent_current: "Mindd exists to restore focus and meaning in work.",
        },
      },
    })
  );
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.is_offtopic || ""), "true");
  assert.equal(
    Boolean((result.ui as any)?.wording_choice?.enabled),
    false
  );
});

test("wording choice: obvious off-topic question in Strategy does not open A/B choice", async () => {
  const result = await run_step({
    user_message: "What have we spoken about so far?",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "strategy",
      active_specialist: "Strategy",
      intro_shown_session: "true",
      started: "true",
      last_specialist_result: {
        action: "ASK",
        menu_id: "STRATEGY_MENU_REFINE",
        question: "1) Explain why a Strategy matters",
        refined_formulation: "",
        strategy: "Focus on clients in the Netherlands",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.notEqual(String(result.specialist?.wording_choice_pending || ""), "true");
  assert.equal(Boolean((result.ui as any)?.wording_choice?.enabled), false);
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "");
});

test("wording choice: list pick stores merged committed list and clears stale pending fields", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_SUGGESTION",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "strategy",
      active_specialist: "Strategy",
      intro_shown_session: "true",
      started: "true",
      last_specialist_result: {
        action: "ASK",
        menu_id: "STRATEGY_MENU_REFINE",
        question: "1) Explain why a Strategy matters",
        message: "Please click what suits you best.",
        refined_formulation: "Focus on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        strategy: "Focus on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_user_raw: "work with healthy and profitable clients",
        wording_choice_user_normalized: "Work with healthy and profitable clients.",
        wording_choice_user_items: ["Work with healthy and profitable clients"],
        wording_choice_base_items: [
          "Focus on clients in the Netherlands",
          "Focus on clients with an annual budget above 40,000 euros",
        ],
        wording_choice_agent_current:
          "Focus on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros\nPrioritize partnerships with healthy and profitable clients",
        wording_choice_suggestion_items: ["Prioritize partnerships with healthy and profitable clients"],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "false");
  assert.equal(String(result.specialist?.wording_choice_user_raw || ""), "");
  assert.equal(String(result.specialist?.wording_choice_user_normalized || ""), "");
  assert.deepEqual(result.specialist?.wording_choice_base_items, [
    "Focus on clients in the Netherlands",
    "Focus on clients with an annual budget above 40,000 euros",
    "Prioritize partnerships with healthy and profitable clients",
  ]);
});

test("wording choice: refine adjust rebuilds pending choice from stored user variant", async () => {
  const result = await run_step({
    user_message: "ACTION_PURPOSE_REFINE_ADJUST",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      started: "true",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "PURPOSE_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to next step Big Why.\n2) Refine the wording",
        refined_formulation: "Mindd exists to restore focus and meaning in work.",
        wording_choice_pending: "false",
        wording_choice_selected: "user",
        wording_choice_user_raw: "Mindd helps teams with clarity",
        wording_choice_user_normalized: "Mindd helps teams with clarity.",
        wording_choice_agent_current: "Mindd exists to restore focus and meaning in work.",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "true");
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(Array.isArray(result.ui?.action_codes), false);
  assert.equal(
    String((result.ui as any)?.wording_choice?.suggestion_text || ""),
    "Mindd exists to restore focus and meaning in work."
  );
});

test("wording choice: pending list mode returns full user and suggestion items", async () => {
  const result = await run_step({
    user_message: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_session: "true",
      started: "true",
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_EXPLAINER_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Refine this formulation",
        refined_formulation: "1) Impact one\n2) Impact two",
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_user_raw: "impact one, impact two",
        wording_choice_user_normalized: "Impact one, impact two.",
        wording_choice_user_items: ["Impact one", "Impact two"],
        wording_choice_agent_current: "1) Impact one\n2) Impact two",
        wording_choice_suggestion_items: ["Impact one", "Impact two"],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(String((result.ui as any)?.wording_choice?.mode || ""), "list");
  assert.deepEqual((result.ui as any)?.wording_choice?.user_items, ["Impact one", "Impact two"]);
  assert.deepEqual((result.ui as any)?.wording_choice?.suggestion_items, ["Impact one", "Impact two"]);
});
