// Unit tests for run_step: finals merge, wants_recap, off-topic policy (no LLM)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDefaultState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import {
  run_step,
  applyStateUpdate,
  buildTextForWidget,
  isWordingChoiceEligibleStep,
  isWordingChoiceEligibleContext,
  informationalActionMutatesProgress,
  isListChoiceScope,
  isMaterialRewriteCandidate,
  areEquivalentWordingVariants,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
  isMetaOfftopicFallbackTurn,
  pickDualChoiceSuggestion,
  buildWordingChoiceFromTurn,
  stripUnsupportedReformulationClaims,
  pickPrompt,
  RECAP_INSTRUCTION,
  UNIVERSAL_META_OFFTOPIC_POLICY,
  normalizeStep0AskDisplayContract,
  normalizeStep0OfftopicToAsk,
  resolveActionCodeMenuTransition,
} from "./run_step.js";
import { BigWhyZodSchema } from "../steps/bigwhy.js";
import { VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS } from "../steps/step_0_validation.js";
import { PURPOSE_INSTRUCTIONS } from "../steps/purpose.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABELS, NEXT_MENU_BY_ACTIONCODE } from "../core/ui_contract_matrix.js";
import { renderFreeTextTurnPolicy } from "../core/turn_policy_renderer.js";

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

const HOLISTIC_FLAG_KEYS = [
  "BSC_HOLISTIC_POLICY_V2",
  "BSC_OFFTOPIC_V2",
  "BSC_BULLET_RENDER_V2",
  "BSC_WORDING_CHOICE_V2",
  "BSC_TIMEOUT_GUARD_V2",
] as const;

const HOLISTIC_PREV_ENV: Partial<Record<(typeof HOLISTIC_FLAG_KEYS)[number], string | undefined>> = {};
test.before(() => {
  for (const key of HOLISTIC_FLAG_KEYS) {
    HOLISTIC_PREV_ENV[key] = process.env[key];
    process.env[key] = "1";
  }
});
test.after(() => {
  for (const key of HOLISTIC_FLAG_KEYS) {
    const prev = HOLISTIC_PREV_ENV[key];
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
});

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

function parseMenuFromContractId(contractIdRaw: unknown): string {
  const contractId = String(contractIdRaw || "").trim();
  const match = contractId.match(/^[^:]+:phase:([A-Z0-9_]+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function inferMenuFromActionCodes(actionCodesRaw: unknown, stepIdRaw: unknown): string {
  const actionCodes = Array.isArray(actionCodesRaw)
    ? actionCodesRaw.map((code) => String(code || "").trim()).filter(Boolean)
    : [];
  if (actionCodes.length === 0) return "";
  const stepId = String(stepIdRaw || "").trim();
  const candidates = Object.entries(ACTIONCODE_REGISTRY.menus).filter(([, menuCodes]) => {
    const normalized = Array.isArray(menuCodes)
      ? menuCodes.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    if (normalized.length !== actionCodes.length) return false;
    return normalized.every((code, idx) => code === actionCodes[idx]);
  });
  if (candidates.length === 1) return String(candidates[0]?.[0] || "").trim();
  if (!stepId) return "";
  for (const [menuId] of candidates) {
    if (String(menuId || "").toLowerCase().startsWith(`${stepId.toLowerCase()}_menu_`)) {
      return String(menuId || "").trim();
    }
  }
  return "";
}

function menuIdFromTurn(turn: any): string {
  const fromContract = parseMenuFromContractId(
    turn?.ui?.contract_id || turn?.specialist?.ui_contract_id || turn?.contract_id || ""
  );
  if (fromContract) return fromContract;
  return inferMenuFromActionCodes(
    turn?.ui?.action_codes,
    turn?.current_step_id || turn?.state?.current_step || ""
  );
}

function menuIdFromSpecialistPayload(payload: any): string {
  return parseMenuFromContractId(payload?.ui_contract_id || "");
}

function setPhaseContract(state: Record<string, unknown>, stepId: string, menuId: string): void {
  if (!stepId || !menuId) return;
  const existing =
    state.__ui_phase_by_step && typeof state.__ui_phase_by_step === "object"
      ? (state.__ui_phase_by_step as Record<string, unknown>)
      : {};
  state.__ui_phase_by_step = {
    ...existing,
    [stepId]: `${stepId}:phase:${menuId}`,
  };
}

const ESCAPE_ACTION_CODES = Object.entries(ACTIONCODE_REGISTRY.menus)
  .filter(([menuId]) => String(menuId || "").endsWith("_MENU_ESCAPE"))
  .flatMap(([, codes]) => codes);

test("resolveActionCodeMenuTransition maps informational actions to deterministic next menus", () => {
  const cases: Array<[string, string, string, string]> = [
    ["ACTION_DREAM_INTRO_EXPLAIN_MORE", "dream", "DREAM_MENU_INTRO", "DREAM_MENU_WHY"],
    ["ACTION_DREAM_WHY_GIVE_SUGGESTIONS", "dream", "DREAM_MENU_WHY", "DREAM_MENU_SUGGESTIONS"],
    ["ACTION_DREAM_INTRO_START_EXERCISE", "dream", "DREAM_MENU_INTRO", "DREAM_EXPLAINER_MENU_SWITCH_SELF"],
    ["ACTION_DREAM_WHY_START_EXERCISE", "dream", "DREAM_MENU_WHY", "DREAM_EXPLAINER_MENU_SWITCH_SELF"],
    ["ACTION_DREAM_SUGGESTIONS_START_EXERCISE", "dream", "DREAM_MENU_SUGGESTIONS", "DREAM_EXPLAINER_MENU_SWITCH_SELF"],
    ["ACTION_DREAM_REFINE_START_EXERCISE", "dream", "DREAM_MENU_REFINE", "DREAM_EXPLAINER_MENU_SWITCH_SELF"],
    ["ACTION_PURPOSE_INTRO_EXPLAIN_MORE", "purpose", "PURPOSE_MENU_INTRO", "PURPOSE_MENU_EXPLAIN"],
    ["ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS", "purpose", "PURPOSE_MENU_INTRO", "PURPOSE_MENU_POST_ASK"],
    ["ACTION_PURPOSE_EXAMPLES_ASK_3_QUESTIONS", "purpose", "PURPOSE_MENU_EXAMPLES", "PURPOSE_MENU_POST_ASK"],
    ["ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES", "purpose", "PURPOSE_MENU_EXPLAIN", "PURPOSE_MENU_EXAMPLES"],
    ["ACTION_BIGWHY_INTRO_EXPLAIN_IMPORTANCE", "bigwhy", "BIGWHY_MENU_INTRO", "BIGWHY_MENU_FROM_EXPLAIN"],
    ["ACTION_BIGWHY_INTRO_GIVE_EXAMPLE", "bigwhy", "BIGWHY_MENU_INTRO", "BIGWHY_MENU_FROM_GIVE"],
    ["ACTION_ROLE_INTRO_EXPLAIN_MORE", "role", "ROLE_MENU_INTRO", "ROLE_MENU_ASK"],
    ["ACTION_ENTITY_INTRO_EXPLAIN_MORE", "entity", "ENTITY_MENU_INTRO", "ENTITY_MENU_FORMULATE"],
    ["ACTION_STRATEGY_INTRO_EXPLAIN_MORE", "strategy", "STRATEGY_MENU_INTRO", "STRATEGY_MENU_ASK"],
    ["ACTION_STRATEGY_REFINE_EXPLAIN_MORE", "strategy", "STRATEGY_MENU_CONFIRM", "STRATEGY_MENU_ASK"],
    ["ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE", "targetgroup", "TARGETGROUP_MENU_INTRO", "TARGETGROUP_MENU_EXPLAIN_MORE"],
    ["ACTION_RULES_INTRO_EXPLAIN_MORE", "rulesofthegame", "RULES_MENU_INTRO", "RULES_MENU_GIVE_EXAMPLE_ONLY"],
    ["ACTION_RULES_ASK_EXPLAIN_MORE", "rulesofthegame", "RULES_MENU_ASK_EXPLAIN", "RULES_MENU_GIVE_EXAMPLE_ONLY"],
    ["ACTION_RULES_ASK_GIVE_EXAMPLE", "rulesofthegame", "RULES_MENU_GIVE_EXAMPLE_ONLY", "RULES_MENU_EXPLAIN_ONLY"],
  ];

  for (const [actionCode, stepId, sourceMenu, expectedMenu] of cases) {
    assert.equal(
      resolveActionCodeMenuTransition(actionCode, stepId, sourceMenu),
      expectedMenu,
      `${actionCode} should transition ${stepId} from ${sourceMenu} to ${expectedMenu}`
    );
  }
});

test("resolveActionCodeMenuTransition enforces step and source-menu guards", () => {
  assert.equal(
    resolveActionCodeMenuTransition("ACTION_DREAM_INTRO_EXPLAIN_MORE", "dream", "DREAM_MENU_REFINE"),
    "",
    "transition must not fire from the wrong source menu"
  );
  assert.equal(
    resolveActionCodeMenuTransition("ACTION_DREAM_INTRO_EXPLAIN_MORE", "purpose", "DREAM_MENU_INTRO"),
    "",
    "transition must not cross steps"
  );
  assert.equal(
    resolveActionCodeMenuTransition("ACTION_UNKNOWN", "dream", "DREAM_MENU_INTRO"),
    "",
    "unknown action code must not produce a transition"
  );
});

test("run_step hard-fails when an actioncode transition exists but source menu is invalid", async () => {
  const result = await run_step({
    input_mode: "widget",
    user_message: "ACTION_DREAM_WHY_START_EXERCISE",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      started: "true",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_MENU_INTRO",
        question:
          "1) Tell me more about why a dream matters\n2) Do a small exercise that helps to define your dream.",
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(String((result as any).error?.type || ""), "contract_violation");
  assert.equal(String((result as any).error?.action_code || ""), "ACTION_DREAM_WHY_START_EXERCISE");
});

test("NEXT_MENU_BY_ACTIONCODE contract transitions reference valid actions and menus", () => {
  for (const [actionCode, transition] of Object.entries(NEXT_MENU_BY_ACTIONCODE)) {
    const actionEntry = ACTIONCODE_REGISTRY.actions[actionCode];
    assert.ok(actionEntry, `missing action registry entry for ${actionCode}`);
    assert.equal(
      String(actionEntry?.step || ""),
      String(transition.step_id || ""),
      `step mismatch for ${actionCode}`
    );
    const renderMode = String((transition as any).render_mode || "").trim() === "no_buttons" ? "no_buttons" : "menu";
    if (renderMode === "no_buttons") continue;
    const targetMenuId = String((transition as any).to_menu_id || "").trim();
    assert.ok(targetMenuId, `missing target menu ${targetMenuId || "(empty)"} for ${actionCode}`);
    const menuActions = ACTIONCODE_REGISTRY.menus[targetMenuId];
    assert.ok(Array.isArray(menuActions) && menuActions.length > 0, `missing target menu ${targetMenuId}`);
  }
});

test("contract audit: route actions in non-escape menus never repeat the clicked button label", () => {
  const issues: Array<Record<string, unknown>> = [];
  for (const [menuIdRaw, codesRaw] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const menuId = String(menuIdRaw || "").trim();
    if (!menuId || menuId.endsWith("_MENU_ESCAPE")) continue;
    const codes = Array.isArray(codesRaw) ? codesRaw : [];
    for (let index = 0; index < codes.length; index += 1) {
      const actionCode = String(codes[index] || "").trim();
      if (!actionCode) continue;
      const actionEntry = ACTIONCODE_REGISTRY.actions[actionCode];
      const route = String(actionEntry?.route || "").trim();
      const step = String(actionEntry?.step || "").trim();
      if (!route || step === "system") continue;
      const transition = NEXT_MENU_BY_ACTIONCODE[actionCode];
      if (!transition) {
        issues.push({ type: "missing_transition", actionCode, menuId });
        continue;
      }
      if (String(transition.step_id || "").trim() !== step) {
        issues.push({
          type: "transition_step_mismatch",
          actionCode,
          menuId,
          actionStep: step,
          transitionStep: String(transition.step_id || "").trim(),
        });
        continue;
      }
      const fromMenus = Array.isArray(transition.from_menu_ids)
        ? transition.from_menu_ids.map((id) => String(id || "").trim()).filter(Boolean)
        : [];
      if (fromMenus.length > 0 && !fromMenus.includes(menuId)) {
        issues.push({
          type: "source_menu_not_covered",
          actionCode,
          menuId,
          fromMenus,
        });
        continue;
      }
      const renderMode = String(transition.render_mode || "").trim() === "no_buttons" ? "no_buttons" : "menu";
      if (renderMode === "no_buttons") continue;
      const targetMenuId = String(transition.to_menu_id || "").trim();
      if (!targetMenuId) {
        issues.push({ type: "missing_target_menu", actionCode, menuId });
        continue;
      }
      const targetCodes = ACTIONCODE_REGISTRY.menus[targetMenuId];
      if (!Array.isArray(targetCodes) || targetCodes.length === 0) {
        issues.push({
          type: "invalid_target_menu",
          actionCode,
          menuId,
          targetMenuId,
        });
        continue;
      }
      const sourceLabel = String((MENU_LABELS[menuId] || [])[index] || "").trim();
      const targetLabels = (MENU_LABELS[targetMenuId] || [])
        .map((label) => String(label || "").trim())
        .filter(Boolean);
      if (sourceLabel && targetLabels.includes(sourceLabel)) {
        issues.push({
          type: "same_button_repeated_after_click",
          actionCode,
          menuId,
          targetMenuId,
          sourceLabel,
        });
      }
    }
  }
  assert.deepEqual(issues, []);
});

test("applyStateUpdate stages step output without overwriting unrelated committed finals", () => {
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
  assert.equal((next as any).purpose_final, "", "purpose_final remains uncommitted");
  assert.equal((next as any).provisional_by_step?.purpose, "Our purpose is X", "purpose staged");
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
    __ui_phase_by_step: {
      dream: "dream:phase:DREAM_MENU_REFINE",
    },
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
  assert.equal(Array.isArray(normalTurn.ui?.action_codes), true);
  assert.deepEqual(normalTurn.ui?.action_codes, [
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_REFINE_START_EXERCISE",
  ]);
  assert.equal(
    String(normalTurn.prompt || "").includes("Refine your Dream for Acme or choose an option."),
    true
  );

  const offTopicTurn = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state: baseState,
    })
  );
  assert.equal(offTopicTurn.ok, true);
  assert.equal(String(offTopicTurn.specialist?.is_offtopic || ""), "true");
  assert.equal(Array.isArray(offTopicTurn.ui?.action_codes), true);
  assert.ok(Array.isArray(offTopicTurn.ui?.action_codes));
  assert.equal(
    countNumberedOptions(String(offTopicTurn.prompt || "")),
    offTopicTurn.ui?.action_codes?.length || 0
  );
  assert.equal(typeof offTopicTurn.ui?.contract_id, "string");
  assert.equal(String(offTopicTurn.ui?.contract_id || "").startsWith("dream:"), true);
  assert.equal(typeof offTopicTurn.ui?.contract_version, "string");
  assert.equal(Array.isArray(offTopicTurn.ui?.text_keys), true);
  assert.equal(String(offTopicTurn.prompt || "").includes("Continue Dream now"), false);
});

test("widget escape suppression: response never returns escape menu/action codes/labels", async () => {
  const result = await run_step({
    input_mode: "widget",
    user_message: "ACTION_UNKNOWN_SHOULD_NOT_ROUTE",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ESCAPE",
        menu_id: "DREAM_MENU_ESCAPE",
        question: "1) Continue Dream now\n2) Finish later",
        message: "You can Continue Dream now or Finish later.",
        is_offtopic: false,
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(menuIdFromTurn(result), "");
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.prompt || "").includes("Continue Dream now"), false);
  assert.equal(String(result.prompt || "").includes("Finish later"), false);

  const actionCodes = Array.isArray(result.ui?.action_codes) ? result.ui?.action_codes : [];
  assert.equal(actionCodes.some((code) => ESCAPE_ACTION_CODES.includes(String(code || ""))), false);
});

test("DreamExplainer off-topic keeps exercise context and only shows switch-back action", async () => {
  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      input_mode: "widget",
      user_message: "Who is Ben Steenstra?",
      state: {
        ...getDefaultState(),
        current_step: "dream",
        __dream_runtime_mode: "builder_collect",
        active_specialist: "DreamExplainer",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        started: "true",
        business_name: "Mindd",
        dream_final:
          "Mindd dreams of a world in which people feel empowered to create meaningful value and experience greater freedom and possibility in their lives.",
        __ui_phase_by_step: {
          dream: "dream:phase:DREAM_EXPLAINER_MENU_SWITCH_SELF",
        },
        last_specialist_result: {
          action: "ASK",
          menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
          question:
            "1) Switch back to self-formulate the dream\n\nLooking 5 to 10 years ahead, what major opportunity or threat do you see, and what positive change do you hope for? Write it as one clear statement.",
          suggest_dreambuilder: "true",
          statements: [
            "A world where work is a source of positive impact on people's lives.",
            "A society where lasting contributions are valued and remembered beyond individual lifetimes.",
            "A future where individuals have greater freedom over their time and choices.",
            "A culture where people feel genuine pride in their work and contributions.",
            "A world where businesses authentically reflect the values and identity of their founders.",
          ],
          is_offtopic: false,
        },
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(String(result.active_specialist || ""), "DreamExplainer");
  assert.equal(menuIdFromTurn(result), "DREAM_EXPLAINER_MENU_SWITCH_SELF");
  assert.deepEqual(result.ui?.action_codes, ["ACTION_DREAM_SWITCH_TO_SELF"]);
  assert.equal(String(result.text || "").includes("Now let's get back to the Dream Exercise."), true);
});

test("DreamExplainer repeated off-topic does not fall back to Dream specialist", async () => {
  const initialState = {
    ...getDefaultState(),
    current_step: "dream",
    __dream_runtime_mode: "builder_collect",
    active_specialist: "DreamExplainer",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    started: "true",
    business_name: "Mindd",
    dream_final:
      "Mindd dreams of a world in which people feel empowered to create meaningful value and experience greater freedom and possibility in their lives.",
    __ui_phase_by_step: {
      dream: "dream:phase:DREAM_EXPLAINER_MENU_SWITCH_SELF",
    },
    last_specialist_result: {
      action: "ASK",
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      question:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
      suggest_dreambuilder: "true",
      statements: [
        "A world where work is a source of positive impact on people's lives.",
        "A society where lasting contributions are valued and remembered beyond individual lifetimes.",
        "A future where individuals have greater freedom over their time and choices.",
        "A culture where people feel genuine pride in their work and contributions.",
        "A world where businesses authentically reflect the values and identity of their founders.",
      ],
      is_offtopic: false,
    },
  };

  const first = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      input_mode: "widget",
      user_message: "What time is it?",
      state: initialState,
    })
  );
  assert.equal(first.ok, true);
  assert.equal(String(first.active_specialist || ""), "DreamExplainer");
  assert.equal(String(first.specialist?.suggest_dreambuilder || ""), "true");
  assert.equal(menuIdFromTurn(first), "DREAM_EXPLAINER_MENU_SWITCH_SELF");

  const second = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      input_mode: "widget",
      user_message: "Who is Ben Steenstra?",
      state: (first as any).state,
    })
  );
  assert.equal(second.ok, true);
  assert.equal(String(second.active_specialist || ""), "DreamExplainer");
  assert.equal(String(second.specialist?.suggest_dreambuilder || ""), "true");
  assert.equal(menuIdFromTurn(second), "DREAM_EXPLAINER_MENU_SWITCH_SELF");
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
    __ui_phase_by_step: {
      dream: "dream:phase:DREAM_MENU_REFINE",
    },
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
  assert.equal(menuIdFromTurn(result), "DREAM_MENU_REFINE");
  assert.deepEqual(result.ui?.action_codes, [
    "ACTION_DREAM_REFINE_CONFIRM",
    "ACTION_DREAM_REFINE_START_EXERCISE",
  ]);
  assert.equal(countNumberedOptions(String(result.prompt || "")), 2);
});

test("off-topic dream without candidate resets to intro menu with both intro actions", async () => {
  const state = {
    ...getDefaultState(),
    current_step: "dream",
    active_specialist: "Dream",
    intro_shown_session: "true",
    intro_shown_for_step: "dream",
    started: "true",
    business_name: "Mindd",
    dream_final: "",
    __ui_phase_by_step: {
      dream: "dream:phase:DREAM_MENU_REFINE",
    },
    last_specialist_result: {
      action: "REFINE",
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      refined_formulation: "",
      dream: "",
      confirmation_question: "",
      proceed_to_next: "false",
      wants_recap: false,
      is_offtopic: false,
    },
  };

  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "What time is it in London?",
      state,
    })
  );

  assert.equal(result.ok, true);
  assert.equal(menuIdFromTurn(result), "DREAM_MENU_INTRO");
  assert.deepEqual(result.ui?.action_codes, [
    "ACTION_DREAM_INTRO_EXPLAIN_MORE",
    "ACTION_DREAM_INTRO_START_EXERCISE",
  ]);
  assert.equal(String(result.prompt || "").includes("Define your Dream for Mindd"), true);
});

test("off-topic purpose with defined output keeps the single confirm menu", async () => {
  const state = {
    ...getDefaultState(),
    current_step: "purpose",
    active_specialist: "Purpose",
    intro_shown_session: "true",
    intro_shown_for_step: "purpose",
    started: "true",
    business_name: "Mindd",
    purpose_final: "Mindd exists to restore focus and meaning in work.",
    __ui_phase_by_step: {
      purpose: "purpose:phase:PURPOSE_MENU_CONFIRM_SINGLE",
    },
    last_specialist_result: {
      action: "ASK",
      menu_id: "PURPOSE_MENU_CONFIRM_SINGLE",
      question:
        "1) I'm happy with this wording, please continue to next step Big Why.",
      refined_formulation: "Mindd exists to restore focus and meaning in work.",
      purpose: "Mindd exists to restore focus and meaning in work.",
      is_offtopic: false,
    },
  };

  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "What's the weather in London?",
      state,
    })
  );

  assert.equal(result.ok, true);
  assert.equal(menuIdFromTurn(result), "PURPOSE_MENU_CONFIRM_SINGLE");
  assert.deepEqual(result.ui?.action_codes, ["ACTION_PURPOSE_CONFIRM_SINGLE"]);
});

test("Step 0 off-topic with no output always returns canonical Step 0 ask contract", async () => {
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
  assert.equal(String(result.specialist?.is_offtopic || "").toLowerCase() === "true", true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
  assert.equal(String(result.prompt || "").toLowerCase().includes("what type of business"), true);
  assert.equal(String(result.text || "").includes("Just to set the context, we'll start with the basics."), true);
  assert.equal(Array.isArray(result.ui?.action_codes), false);
});

test("Step 0 contract: meta/off-topic ASK is normalized to canonical Step 0 prompt when no step_0_final exists", () => {
  const state = {
    ...getDefaultState(),
    current_step: "step_0",
    step_0_final: "",
    business_name: "",
  };
  const specialist = {
    action: "ASK",
    message: "Ben Steenstra is a Dutch entrepreneur and author.",
    question: "Would you like to continue with the business verification now?",
    business_name: "TBD",
    step_0: "",
    is_offtopic: true,
  };
  const normalized = normalizeStep0AskDisplayContract(
    "step_0",
    specialist,
    state,
    "Who is Ben Steenstra?"
  );
  assert.equal(String(normalized.action || ""), "ASK");
  assert.equal(String(normalized.question || "").toLowerCase().includes("what type of business"), true);
  assert.equal(String(normalized.message || "").toLowerCase().includes("ben steenstra"), true);
  assert.equal(menuIdFromSpecialistPayload(normalized), "");
});

test("Step 0 contract: fallback off-topic answer is never empty for clear non-step question", () => {
  const state = {
    ...getDefaultState(),
    current_step: "step_0",
    step_0_final: "",
  };
  const specialist = {
    action: "ASK",
    message: "",
    question: "What type of business are you starting?",
    step_0: "",
    is_offtopic: true,
  };
  const normalized = normalizeStep0OfftopicToAsk(specialist, state, "What time is it in London?");
  assert.equal(String(normalized.action || ""), "ASK");
  assert.equal(String(normalized.question || "").toLowerCase().includes("what type of business"), true);
  assert.equal(String(normalized.message || "").includes("Just to set the context, we'll start with the basics."), true);
});

test("Step 0 contract: known business ASK maps to canonical readiness menu contract", () => {
  const state = {
    ...getDefaultState(),
    current_step: "step_0",
    step_0_final: "Venture: advertising agency | Name: Mindd | Status: existing",
    business_name: "Mindd",
  };
  const specialist = {
    action: "ASK",
    is_offtopic: true,
    message:
      "Ben Steenstra is a Dutch entrepreneur, author, and business strategist. You can find more about him at https://www.bensteenstra.com. Now, back to The Business Strategy Canvas Builder.",
    question: "",
    refined_formulation: "",
    business_name: "TBD",
    step_0: "",
    menu_id: "",
  };
  const normalized = normalizeStep0AskDisplayContract(
    "step_0",
    specialist,
    state,
    "Who is Ben Steenstra?"
  );
  assert.equal(String(normalized.action || ""), "ASK");
  assert.equal(
    String(normalized.question || "").includes(
      "You have a advertising agency called Mindd. Are you ready to start with the first step: the Dream?"
    ),
    true
  );
  assert.equal(String(normalized.question || "").startsWith("1) Yes, I'm ready. Let's start!"), true);
  assert.equal(String(normalized.step_0 || ""), "Venture: advertising agency | Name: Mindd | Status: existing");
});

test("Step 0 off-topic with valid output keeps readiness ASK contract when Step 0 is already known", async () => {
  const step0State = {
    ...getDefaultState(),
    current_step: "step_0",
    active_specialist: "ValidationAndBusinessName",
    intro_shown_session: "true",
    started: "true",
    step_0_final: "Venture: advertising agency | Name: Mindd | Status: existing",
    business_name: "Mindd",
    __ui_phase_by_step: {
      step_0: "step_0:phase:STEP0_MENU_READY_START",
    },
    last_specialist_result: {},
  };

  const offTopic = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "Who is Ben Steenstra?",
      state: step0State,
    })
  );
  assert.equal(offTopic.ok, true);
  assert.equal(String(offTopic.specialist?.action || ""), "ASK");
  assert.equal(menuIdFromTurn(offTopic), "STEP0_MENU_READY_START");
  assert.equal(String(offTopic.prompt || "").includes("Are you ready to start with the first step: the Dream?"), true);
  assert.equal(String(offTopic.text || "").includes("To get started, could you tell me"), false);
  assert.deepEqual(offTopic.ui?.action_codes, ["ACTION_STEP0_READY_START"]);
});

test("Step 0 renderer fallback produces readiness ASK + menu when called directly", () => {
  const state = {
    ...getDefaultState(),
    current_step: "step_0",
    step_0_final: "Venture: agency | Name: Mindd | Status: existing",
    business_name: "Mindd",
    __ui_phase_by_step: {
      step_0: "step_0:phase:STEP0_MENU_READY_START",
    },
  };
  const specialist = {
    action: "ASK",
    is_offtopic: true,
    message: "Ben Steenstra is an entrepreneur and executive coach.",
    question: "",
    refined_formulation: "",
    business_name: "TBD",
    step_0: "",
    menu_id: "",
  };

  const rendered = renderFreeTextTurnPolicy({
    stepId: "step_0",
    state: state as any,
    specialist,
    previousSpecialist: {},
  });

  assert.equal(String(rendered.specialist.action || ""), "ASK");
  assert.equal(parseMenuFromContractId((rendered as any).contractId), "");
  assert.equal(String(rendered.specialist.question || "").includes("Are you ready to start with the first step: the Dream?"), true);
  assert.equal(String(rendered.specialist.message || "").includes("This is what we have established so far"), false);
});

test("Step 0 start payload uses canonical readiness ASK menu when final exists", async () => {
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
      __ui_phase_by_step: {
        step_0: "step_0:phase:STEP0_MENU_READY_START",
      },
      last_specialist_result: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(String(result.specialist?.confirmation_question || ""), "");
  assert.equal(menuIdFromTurn(result), "STEP0_MENU_READY_START");
  assert.equal(String(result.prompt || "").includes("Are you ready to start with the first step: the Dream?"), true);
  assert.equal(String(result.prompt || "").includes("This is what we have established"), false);
  assert.equal(String(result.prompt || "").includes("Refine your Step 0"), false);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_STEP0_READY_START"]);
});

test("Step 0 initial ASK shows context line above canonical prompt", async () => {
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

test("Step 0 ASK fallback keeps context line and canonical question", async () => {
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
  assert.equal(
    String(result.prompt || ""),
    "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?"
  );
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
      __ui_phase_by_step: {
        dream: "dream:phase:DREAM_MENU_REFINE",
      },
      last_specialist_result: {
        action: "REFINE",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.ui?.action_codes), true);
  assert.equal((result.ui?.action_codes || []).length > 0, true);
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

test("wording choice: only spelling-only corrections bypass A/B panel", () => {
  assert.equal(isMaterialRewriteCandidate("We help founders.", "We help founders."), false);
  assert.equal(
    isMaterialRewriteCandidate(
      "Compony values should lead decisions.",
      "Company values should lead decisions."
    ),
    false
  );
  assert.equal(
    isMaterialRewriteCandidate(
      "i want be rich",
      "I want to be rich."
    ),
    true
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

test("wording choice: grammar/content changes in Dream still require A/B panel", () => {
  const rebuilt = buildWordingChoiceFromTurn({
    stepId: "dream",
    activeSpecialist: "Dream",
    previousSpecialist: {
      action: "ASK",
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      dream: "",
      refined_formulation: "",
    },
    specialistResult: {
      action: "ASK",
      menu_id: "DREAM_MENU_REFINE",
      message: "That is a strong conviction.",
      refined_formulation: "Mindd dreams of a world in which purpose-driven companies create lasting value.",
      dream: "Mindd dreams of a world in which purpose-driven companies create lasting value.",
    },
    userTextRaw: "I believe companies should be purpose driven",
    isOfftopic: false,
  });

  assert.equal(Boolean(rebuilt.wordingChoice), true);
  assert.equal(String(rebuilt.specialist?.wording_choice_pending || ""), "true");
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
    false
  );
  assert.equal(
    areEquivalentWordingVariants({
      mode: "list",
      userRaw: "Compony values first\nBuild long term trust",
      suggestionRaw: "Company values first\nBuild long term trust",
      userItems: [
        "Compony values first",
        "Build long term trust",
      ],
      suggestionItems: [
        "Company values first",
        "Build long term trust",
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
  assert.equal(isWordingChoiceEligibleContext("dream", "DreamExplainer"), true);
  assert.equal(isWordingChoiceEligibleContext("dream", "Dream"), true);
  assert.equal(
    isWordingChoiceEligibleContext("dream", "Dream", { suggest_dreambuilder: "true" }, {}),
    true
  );
  assert.equal(
    isWordingChoiceEligibleContext(
      "dream",
      "Dream",
      { menu_id: "DREAM_EXPLAINER_MENU_ASK" },
      {}
    ),
    true
  );
  assert.equal(
    isWordingChoiceEligibleContext("dream", "DreamExplainer", { scoring_phase: "true" }, {}),
    true
  );
  assert.equal(
    isWordingChoiceEligibleContext("dream", "DreamExplainer", { scoring_phase: "true" }, {}, "builder_scoring"),
    false
  );
});

test("list-choice scope includes DreamBuilder specialist", () => {
  assert.equal(isListChoiceScope("dream", "DreamExplainer"), true);
  assert.equal(isListChoiceScope("dream", "Dream"), false);
});

test("buildTextForWidget: DreamBuilder avoids duplicate plain list when statements panel is present", () => {
  const line1 = "A world where work contributes to a positive difference in people's lives.";
  const line2 = "A future where businesses are built to create lasting impact for generations.";
  const text = buildTextForWidget({
    specialist: {
      menu_id: "DREAM_EXPLAINER_MENU_ASK",
      suggest_dreambuilder: "true",
      message: `Your current Dream for Mindd is:\n\n${line1}\n${line2}`,
      refined_formulation: `${line1}\n${line2}`,
      statements: [line1, line2],
    },
  });

  assert.equal(text.includes(line1), false);
  assert.equal(text.includes(line2), false);
  assert.equal(text.includes("Your current Dream for Mindd is:"), false);
});

test("buildTextForWidget strips generic choose lines when menu is interactive", () => {
  const text = buildTextForWidget({
    specialist: {
      menu_id: "PURPOSE_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to next step Big Why.\n2) Refine the wording",
      message:
        "I'll propose a Purpose based on your Dream.\n\nWe exist to enrich lives.\n\nPlease choose 1 or 2.\nChoose an option below.",
      refined_formulation: "",
    },
  });

  assert.equal(text.includes("Please choose 1 or 2"), false);
  assert.equal(text.includes("Choose an option below"), false);
  assert.equal(text.includes("We exist to enrich lives."), true);
});

test("buildTextForWidget strips leaked headline tails ending with 'or choose an option'", () => {
  const text = buildTextForWidget({
    specialist: {
      menu_id: "DREAM_MENU_REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.\n\nRefine your Dream for Mindd or choose an option.",
      message:
        "That's a good question about the time in London.\n\nContinue the Dream for Mindd or choose an option.\nMindd dreams of a world in which companies are guided by a deeper purpose.",
      refined_formulation: "",
    },
    hasWidgetActions: true,
  });

  assert.equal(
    /continue the dream for mindd or/i.test(String(text || "")),
    false,
    "leaked headline tail must not remain in card text"
  );
  assert.equal(
    text.includes("Mindd dreams of a world in which companies are guided by a deeper purpose."),
    true
  );
});

test("buildTextForWidget strips prompt/menu echo lines from DreamExplainer body text", () => {
  const prompt =
    "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.";
  const text = buildTextForWidget({
    specialist: {
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      question: prompt,
      message:
        "<strong>1) Switch back to self-formulate the dream</strong>\n\n1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.\n\nYour Dream statements",
      refined_formulation: "",
      suggest_dreambuilder: "true",
    },
  });

  assert.equal(text.includes("1) Switch back to self-formulate the dream"), false);
  assert.equal(
    text.includes("What more do you see changing in the future, positive or negative? Let your imagination run free."),
    false
  );
  assert.equal(text.includes("Your Dream statements"), true);
});

test("buildTextForWidget strips prompt/menu echo using ui question override when specialist question is plain", () => {
  const uiQuestion =
    "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.";
  const text = buildTextForWidget({
    specialist: {
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      question: "What more do you see changing in the future, positive or negative? Let your imagination run free.",
      message:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.\n\nYour Dream statements",
      refined_formulation:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.\n\nYour Dream statements",
      suggest_dreambuilder: "true",
    },
    questionTextOverride: uiQuestion,
  });

  assert.equal(text.includes("1) Switch back to self-formulate the dream"), false);
  assert.equal(
    text.includes("What more do you see changing in the future, positive or negative? Let your imagination run free."),
    false
  );
  assert.equal(text.includes("Your Dream statements"), true);
});

test("buildTextForWidget does not re-inject prompt when DreamBuilder body becomes empty after sanitization", () => {
  const uiQuestion =
    "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.";
  const text = buildTextForWidget({
    specialist: {
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      question: uiQuestion,
      message:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.\n\nYour Dream statements\n\n1. A\n2. B",
      refined_formulation: "",
      suggest_dreambuilder: "true",
      statements: ["A", "B"],
    },
    questionTextOverride: uiQuestion,
  });

  assert.equal(text.includes("1) Switch back to self-formulate the dream"), false);
  assert.equal(
    text.includes("What more do you see changing in the future, positive or negative? Let your imagination run free."),
    false
  );
});

test("buildTextForWidget strips generic choose lines when widget actions are present", () => {
  const text = buildTextForWidget({
    specialist: {
      menu_id: "",
      question: "",
      message: "Please choose one option.",
      refined_formulation: "Refined sentence stays visible.",
    },
    hasWidgetActions: true,
  });

  assert.equal(text.includes("Please choose one option."), false);
  assert.equal(text.includes("Refined sentence stays visible."), true);
});

test("buildTextForWidget strips choose-noise for all confirm-filtered single-action menus", () => {
  const riskCases = [
    { stepId: "dream", menuId: "DREAM_MENU_REFINE", expectedAction: "ACTION_DREAM_REFINE_START_EXERCISE", field: "dream" },
    { stepId: "dream", menuId: "DREAM_EXPLAINER_MENU_REFINE", expectedAction: "ACTION_DREAM_EXPLAINER_REFINE_ADJUST", field: "dream" },
    { stepId: "purpose", menuId: "PURPOSE_MENU_REFINE", expectedAction: "ACTION_PURPOSE_REFINE_ADJUST", field: "purpose" },
    { stepId: "bigwhy", menuId: "BIGWHY_MENU_REFINE", expectedAction: "ACTION_BIGWHY_REFINE_ADJUST", field: "bigwhy" },
    { stepId: "role", menuId: "ROLE_MENU_REFINE", expectedAction: "ACTION_ROLE_REFINE_ADJUST", field: "role" },
    { stepId: "entity", menuId: "ENTITY_MENU_EXAMPLE", expectedAction: "ACTION_ENTITY_EXAMPLE_REFINE", field: "entity" },
    { stepId: "strategy", menuId: "STRATEGY_MENU_CONFIRM", expectedAction: "ACTION_STRATEGY_REFINE_EXPLAIN_MORE", field: "strategy" },
    { stepId: "targetgroup", menuId: "TARGETGROUP_MENU_POSTREFINE", expectedAction: "ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS", field: "targetgroup" },
    { stepId: "rulesofthegame", menuId: "RULES_MENU_REFINE", expectedAction: "ACTION_RULES_REFINE_ADJUST", field: "rulesofthegame" },
  ] as const;

  for (const risk of riskCases) {
    const state = getDefaultState();
    (state as any).current_step = risk.stepId;
    (state as any).business_name = "Mindd";
    setPhaseContract(state as any, risk.stepId, risk.menuId);

    const specialist: Record<string, unknown> = {
      action: "ASK",
      menu_id: risk.menuId,
      question: "",
      message: "Generated candidate.\n\nPlease choose 1 or 2.",
      refined_formulation: "",
    };
    specialist[risk.field] = "";

    const rendered = renderFreeTextTurnPolicy({
      stepId: risk.stepId,
      state,
      specialist,
    });

    assert.deepEqual(
      rendered.uiActionCodes,
      [risk.expectedAction],
      `${risk.menuId} must degrade to the non-confirm action only`
    );
    assert.equal(
      countNumberedOptions(String(rendered.specialist.question || "")),
      1,
      `${risk.menuId} question must stay in parity with one remaining action`
    );

    const text = buildTextForWidget({
      specialist: rendered.specialist,
      hasWidgetActions: rendered.uiActionCodes.length > 0,
    });
    assert.equal(
      /please\s+choose\s+1\s+or\s+2/i.test(String(text || "")),
      false,
      `${risk.menuId} text must not leak the generic choose-line`
    );
  }
});

test("buildTextForWidget strips chooser-noise for every registered menu in widget mode", () => {
  for (const [menuId, actionCodes] of Object.entries(ACTIONCODE_REGISTRY.menus)) {
    const question = actionCodes.map((_, idx) => `${idx + 1}) Option ${idx + 1}`).join("\n");
    const text = buildTextForWidget({
      specialist: {
        menu_id: menuId,
        question,
        message:
          "Generated candidate text.\n\nPlease choose 1 or 2.\nSelect 1 or 2.\n**Pick one option.**",
        refined_formulation: "",
      },
      hasWidgetActions: true,
    });

    assert.equal(
      /please\s+choose\s+1\s+or\s+2/i.test(String(text || "")),
      false,
      `${menuId} must not leak "Please choose 1 or 2" in card text`
    );
    assert.equal(
      /select\s+1\s+or\s+2/i.test(String(text || "")),
      false,
      `${menuId} must not leak "Select 1 or 2" in card text`
    );
    assert.equal(
      /pick\s+one\s+option/i.test(String(text || "")),
      false,
      `${menuId} must not leak generic pick-line in card text`
    );
  }
});

test("informational action mutation guard flags implicit output injection", () => {
  const state = getDefaultState();
  const previous: Record<string, unknown> = {};
  const mutating = informationalActionMutatesProgress(
    "bigwhy",
    {
      action: "ASK",
      message: "Based on the Dream and Purpose, your Big Why could sound like this:",
      bigwhy: "A world where every business creates meaningful value for society.",
      refined_formulation: "A world where every business creates meaningful value for society.",
    },
    previous,
    state
  );
  assert.equal(mutating, true);

  const notMutating = informationalActionMutatesProgress(
    "bigwhy",
    {
      action: "ASK",
      message: "Here are 3 example directions you can use as inspiration.",
      bigwhy: "",
      refined_formulation: "",
    },
    previous,
    state
  );
  assert.equal(notMutating, false);
});

test("wording choice: Rules of the game uses list-choice scope like Strategy", () => {
  assert.equal(isListChoiceScope("strategy", "Strategy"), true);
  assert.equal(isListChoiceScope("rulesofthegame", "RulesOfTheGame"), true);
  assert.equal(isListChoiceScope("dream", "Dream"), false);
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

test("meta off-topic fallback marks Ben/info step messages as off-topic outside step_0", () => {
  assert.equal(
    isMetaOfftopicFallbackTurn({
      stepId: "dream",
      userMessage: "Who is Ben Steenstra?",
      specialistResult: {
        is_offtopic: false,
        message:
          "Ben Steenstra is a serial entrepreneur and executive coach.\n\nFor more information visit: https://www.bensteenstra.com\n\nYou are in the Dream step now. Choose an option below to continue.",
      },
    }),
    true
  );
  assert.equal(
    isMetaOfftopicFallbackTurn({
      stepId: "step_0",
      userMessage: "Who is Ben Steenstra?",
      specialistResult: {
        is_offtopic: false,
        message: "Ben Steenstra is a Dutch entrepreneur.",
      },
    }),
    false
  );
});

test("wording choice: DreamExplainer rewrite is eligible for user-vs-suggestion panel in builder collect/refine", () => {
  const previousSpecialist = {
    action: "ASK",
    menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
    statements: [],
  };
  const specialistResult = {
    action: "ASK",
    menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
    message:
      "I've rewritten your wishes as future-facing statements about broader change and added them.",
    question:
      "What more do you see changing in the future, positive or negative? Let your imagination run free.",
    statements: [
      "In the next 5 to 10 years, more people will seek work that makes a positive difference.",
      "Society will value the creation of lasting legacies that benefit future generations.",
      "There will be a greater emphasis on personal freedom in how people use their time.",
      "People will increasingly seek pride and meaning in the work they do.",
      "Businesses will be expected to reflect authentic values.",
    ],
    refined_formulation: "",
    dream: "",
  };
  const userRaw = [
    "I want my work to make a positive difference in people's lives.",
    "I want to build something that lasts beyond me.",
    "I want to create freedom in my time and choices.",
    "I want to feel proud when I talk about what I do.",
  ].join("\n");

  const rebuilt = buildWordingChoiceFromTurn({
    stepId: "dream",
    activeSpecialist: "DreamExplainer",
    previousSpecialist,
    specialistResult,
    userTextRaw: userRaw,
    isOfftopic: false,
  });

  assert.equal(Boolean(rebuilt.wordingChoice), true);
  assert.equal(String(rebuilt.specialist?.wording_choice_pending || ""), "true");
});

test("wording choice runtime rebuild is contract-eligible across steps (not DreamExplainer-only)", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /const eligibleForWordingChoiceTurn = isWordingChoiceEligibleContext\(/);
  assert.match(source, /stepId:\s*currentStepForWordingChoice/);
  assert.match(source, /activeSpecialist:\s*currentSpecialistForWordingChoice/);
  assert.doesNotMatch(source, /stepId:\s*DREAM_STEP_ID,\s*\n\s*activeSpecialist:\s*String\(\(nextState as any\)\.active_specialist \|\| ""\)/);
});

test("message contract: strips reformulation claims when no choice/output is available", () => {
  const input = [
    "You've provided some clear focus points, which is a great start.",
    "",
    "I've reformulated your input into valid strategy focus choices:",
    "",
    "If you want to sharpen or adjust these, let me know.",
  ].join("\n");
  const cleaned = stripUnsupportedReformulationClaims(input);
  assert.equal(cleaned.includes("provided some clear focus points"), false);
  assert.equal(cleaned.includes("reformulated your input"), false);
  assert.equal(cleaned.includes("If you want to sharpen or adjust these, let me know."), true);
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

test("wording choice: generic acknowledgement is not used as suggestion fallback", () => {
  const user = "Mindd believes in empowering companies to become purpose-driven and create lasting value.";
  const suggestion = pickDualChoiceSuggestion(
    "purpose",
    {
      refined_formulation: "",
      message: "I think I understand what you mean.",
    },
    {},
    user
  );
  assert.equal(suggestion, "");
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

test("wording choice: pending list mode does not repeat suggestion paragraph in body text", () => {
  const s1 = "A growing number of people will seek meaningful work that positively impacts others in the next 5 to 10 years.";
  const s2 = "More businesses will focus on creating lasting legacies that endure for generations.";
  const s3 = "The desire for autonomy and freedom in work and life will become a defining trend.";
  const text = buildTextForWidget({
    specialist: {
      wording_choice_pending: "true",
      wording_choice_mode: "list",
      wording_choice_user_items: [
        "I want my work to make a positive difference in people's lives.",
        "I want to build something that lasts beyond me.",
      ],
      wording_choice_suggestion_items: [s1, s2, s3],
      wording_choice_agent_current: `${s1} ${s2} ${s3}`,
      message: `I've rewritten your wishes as future-facing statements and added them:\n\n${s1} ${s2} ${s3}\n\nStatements 1 to 3 noted. If you mean something different, tell me and I'll adjust.`,
      refined_formulation: "",
    },
  });

  assert.equal(text.includes(s2), false);
  assert.equal(text.includes("I've rewritten your wishes as future-facing statements and added them:"), true);
  assert.equal(text.includes("Statements 1 to 3 noted."), true);
});

test("step transition fast-path is actioncode-driven (no legacy confirm gate)", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /const ACTIONCODE_STEP_TRANSITIONS:\s*Record<string,\s*string>/);
  assert.match(source, /ACTION_STEP0_READY_START:\s*DREAM_STEP_ID/);
  assert.match(source, /if \(actionCodeRaw && ACTIONCODE_STEP_TRANSITIONS\[actionCodeRaw\]\)/);
});

test("step transition commits staged value and clears provisional state", async () => {
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
      provisional_by_step: {
        dream: "Mindd dreams of a world where purpose-driven companies create lasting value.",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "purpose");
  assert.equal(
    String((result.state as any)?.dream_final || ""),
    "Mindd dreams of a world where purpose-driven companies create lasting value."
  );
  assert.equal(String((result.state as any)?.provisional_by_step?.dream || ""), "");
});

test("Dream readiness guard accepts explicit start-exercise route in widget mode", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /const explicitDreamExerciseRoute\s*=\s*userMessage === "__ROUTE__DREAM_START_EXERCISE__";/);
  assert.match(source, /const useDreamExplainerGuard =[\s\S]*state\.current_step === DREAM_STEP_ID && explicitDreamExerciseRoute/);
  assert.doesNotMatch(source, /lastResult\.suggest_dreambuilder/);
});

test("single-path flags: only wording-choice runtime flag remains active", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /BSC_WORDING_CHOICE_V2/);
  assert.match(source, /policyFlags\.wordingChoiceV2/);
  assert.doesNotMatch(source, /policyFlags\.offtopicV2/);
  assert.doesNotMatch(source, /policyFlags\.bulletRenderV2/);
  assert.doesNotMatch(source, /policyFlags\.timeoutGuardV2/);
});

test("switch-to-self without existing dream candidate returns Dream intro menu (Define, not Refine)", async () => {
  const result = await run_step({
    user_message: "ACTION_DREAM_SWITCH_TO_SELF",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      started: "true",
      dream_final: "",
      __ui_phase_by_step: {
        dream: "dream:phase:DREAM_EXPLAINER_MENU_SWITCH_SELF",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
        suggest_dreambuilder: "true",
        message: "We will start the exercise to help clarify the Dream now.",
        question:
          "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.active_specialist || ""), "Dream");
  assert.equal(menuIdFromTurn(result), "DREAM_MENU_INTRO");
  assert.equal(String(result.prompt || "").includes("Define your Dream for"), true);
  assert.equal(String(result.prompt || "").includes("Refine your Dream for"), false);
  assert.deepEqual(result.ui?.action_codes || [], [
    "ACTION_DREAM_INTRO_EXPLAIN_MORE",
    "ACTION_DREAM_INTRO_START_EXERCISE",
  ]);
});

test("switch-to-self ignores long statement-like refined text as Dream candidate", async () => {
  const longListLike =
    "People’s lives will be positively impacted by meaningful work and businesses. Businesses and their contributions will have lasting influence beyond the founders. Society will value freedom in time and choices for individuals. People will feel genuine pride in the work they do. Businesses will increasingly reflect the values and identity of their founders. Solutions will address problems that people deeply care about.";
  const result = await run_step({
    user_message: "ACTION_DREAM_SWITCH_TO_SELF",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      started: "true",
      dream_final: "",
      __ui_phase_by_step: {
        dream: "dream:phase:DREAM_EXPLAINER_MENU_SWITCH_SELF",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
        suggest_dreambuilder: "true",
        refined_formulation: longListLike,
        message: "So far we have these statements.",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.active_specialist || ""), "Dream");
  assert.equal(menuIdFromTurn(result), "DREAM_MENU_INTRO");
  assert.equal(String(result.prompt || "").includes("Define your Dream for"), true);
  assert.equal(String(result.prompt || "").includes("Refine your Dream for"), false);
});

test("bullet consistency helpers remain, but no runtime overlay gate exists", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /function isBulletConsistencyStep\(stepId: string\): boolean/);
  assert.match(source, /stepId === STRATEGY_STEP_ID/);
  assert.match(source, /stepId === PRODUCTSSERVICES_STEP_ID/);
  assert.match(source, /stepId === RULESOFTHEGAME_STEP_ID/);
  assert.doesNotMatch(source, /const shouldApplyBulletConsistencyPolicy\s*=/);
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
      __ui_phase_by_step: {
        purpose: "purpose:phase:PURPOSE_MENU_REFINE",
      },
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
  assert.equal(String(result.specialist?.action || ""), "ASK");
  assert.equal(menuIdFromTurn(result), "PURPOSE_MENU_REFINE");
  const selectionQuestion = String(result.specialist?.question || "");
  assert.equal(
    selectionQuestion.startsWith(
      "1) I'm happy with this wording, please continue to next step Big Why.\n2) Refine the wording"
    ),
    true
  );
  assert.equal(
    String(result.specialist?.message || ""),
    "You chose your own wording and that's fine. Please note: A Purpose should capture deeper meaning, not just operational wording.\n\nYour current Purpose for Mindd is:"
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
      __ui_phase_by_step: {
        strategy: "strategy:phase:STRATEGY_MENU_REFINE",
      },
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
  assert.equal(menuIdFromTurn(result), "STRATEGY_MENU_REFINE");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 1);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_STRATEGY_REFINE_EXPLAIN_MORE"]);
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
      __ui_phase_by_step: {
        strategy: "strategy:phase:STRATEGY_MENU_ASK",
      },
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
  assert.equal(menuIdFromTurn(result), "STRATEGY_MENU_ASK");
  assert.equal(countNumberedOptions(String(result.specialist?.question || "")), 2);
  assert.deepEqual(result.ui?.action_codes, ["ACTION_STRATEGY_ASK_3_QUESTIONS", "ACTION_STRATEGY_ASK_GIVE_EXAMPLES"]);
  assert.equal(String(result.specialist?.message || ""), "Your current Strategy for Mindd is:");
  assert.equal(String(result.specialist?.message || "").includes("Focus point 1 noted:"), false);
  assert.equal(
    /Your current Strategy for Mindd is:\n\nFocus exclusively on clients in the Netherlands/i.test(
      String(result.specialist?.message || "")
    ),
    false
  );
});

test("wording choice: strategy suggestion pick removes duplicate 'Focus point noted' lines even without statements array", async () => {
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
      __ui_phase_by_step: {
        strategy: "strategy:phase:STRATEGY_MENU_REFINE",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "",
        question: "Is there more that Mindd will always focus on?",
        confirmation_question: "",
        message:
          "Both focus points are noted.\nFocus point 1 noted: Focus exclusively on clients in the Netherlands.\nFocus point 2 noted: Focus on clients with an annual budget above 40,000 euros.\nIf you meant something different, tell me and I'll adjust.",
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
  const message = String(result.specialist?.message || "");
  assert.equal(message.includes("Focus point 1 noted:"), false);
  assert.equal(message.includes("Focus point 2 noted:"), false);
  assert.equal(message, "Your current Strategy for Mindd is:");
});

test("informational action: strategy explain-more remains on contract ask menu", async () => {
  const result = await run_step({
    user_message: "ACTION_STRATEGY_REFINE_EXPLAIN_MORE",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "strategy",
      active_specialist: "Strategy",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      __ui_phase_by_step: {
        strategy: "strategy:phase:STRATEGY_MENU_CONFIRM",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "STRATEGY_MENU_CONFIRM",
        question:
          "1) Explain why a Strategy matters",
        message: "So far we have these 2 strategic focus points.",
        statements: [
          "Focus exclusively on clients in the Netherlands",
          "Focus on clients with an annual budget above 40,000 euros",
        ],
        strategy:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
        refined_formulation:
          "Focus exclusively on clients in the Netherlands\nFocus on clients with an annual budget above 40,000 euros",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "strategy");
  assert.equal(menuIdFromTurn(result).startsWith("STRATEGY_MENU_"), true);
  assert.ok(Array.isArray(result.ui?.action_codes));
  assert.ok((result.ui?.action_codes || []).length >= 1);
  assert.equal(String(result.specialist?.message || "").includes("Focus point 1 noted:"), false);
  assert.equal(menuIdFromTurn(result).endsWith("_MENU_ESCAPE"), false);
});

test("informational action: purpose explain-more remains on contract menu", async () => {
  const result = await run_step({
    user_message: "ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      __ui_phase_by_step: {
        purpose: "purpose:phase:PURPOSE_MENU_INTRO",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "PURPOSE_MENU_INTRO",
        question: "1) Explain more about why a purpose is needed.",
        message: "Please define your purpose or ask for more explanation.",
        purpose: "",
        refined_formulation: "",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "purpose");
  assert.equal(menuIdFromTurn(result).endsWith("_MENU_ESCAPE"), false);
  assert.ok(Array.isArray(result.ui?.action_codes));
  assert.ok((result.ui?.action_codes || []).length >= 1);
  assert.equal(menuIdFromTurn(result), "PURPOSE_MENU_EXPLAIN");
});

test("informational action: purpose ask-3-questions keeps explain/examples buttons (no repeated ask-3 button)", async () => {
  const result = await run_step({
    user_message: "ACTION_PURPOSE_EXPLAIN_ASK_3_QUESTIONS",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      __ui_phase_by_step: {
        purpose: "purpose:phase:PURPOSE_MENU_EXPLAIN",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "PURPOSE_MENU_INTRO",
        question:
          "1) Explain more about why a purpose is needed.\n2) Ask 3 questions to help me define the Purpose.",
        message: "Please define your purpose or ask for more explanation.",
        purpose: "",
        refined_formulation: "",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "purpose");
  assert.equal(menuIdFromTurn(result), "PURPOSE_MENU_POST_ASK");
  assert.deepEqual(result.ui?.action_codes || [], [
    "ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
    "ACTION_PURPOSE_EXPLAIN_GIVE_EXAMPLES",
  ]);
});

test("informational action: rules explain-more shows only concrete-example button", async () => {
  const result = await run_step({
    user_message: "ACTION_RULES_ASK_EXPLAIN_MORE",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "rulesofthegame",
      active_specialist: "RulesOfTheGame",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      __ui_phase_by_step: {
        rulesofthegame: "rulesofthegame:phase:RULES_MENU_ASK_EXPLAIN",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "RULES_MENU_ASK_EXPLAIN",
        question:
          "1) Please explain more about Rules of the Game\n2) Give one concrete example (Rule versus poster slogan)",
        message: "Rules context.",
        rulesofthegame: "",
        refined_formulation: "",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.current_step_id || ""), "rulesofthegame");
  assert.equal(menuIdFromTurn(result), "RULES_MENU_GIVE_EXAMPLE_ONLY");
  assert.deepEqual(result.ui?.action_codes || [], ["ACTION_RULES_ASK_GIVE_EXAMPLE"]);
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
      __ui_phase_by_step: {
        rulesofthegame: "rulesofthegame:phase:RULES_MENU_ASK_EXPLAIN",
      },
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

  assert.equal(result.ok, false);
  assert.equal(String(result.error?.type || ""), "session_upgrade_required");
  assert.ok(Array.isArray((result.error as any)?.markers));
  assert.equal(((result.error as any)?.markers || []).includes("legacy_action_confirm"), true);
});

test("informational context policy scope excludes presentation step", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /function isInformationalContextPolicyStep\(stepId: string\): boolean/);
  const fnMatch = source.match(
    /function isInformationalContextPolicyStep\(stepId: string\): boolean \{[\s\S]*?\n\}/
  );
  assert.ok(fnMatch && fnMatch[0], "scope helper exists");
  const fnBody = String(fnMatch?.[0] || "");
  assert.match(fnBody, /stepId === DREAM_STEP_ID/);
  assert.match(fnBody, /stepId === RULESOFTHEGAME_STEP_ID/);
  assert.doesNotMatch(fnBody, /stepId === PRESENTATION_STEP_ID/);
});

test("informational context overlay is removed from runtime path", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const shouldApplyInformationalContextPolicy\s*=/);
  assert.doesNotMatch(source, /infoPolicyHasValidMenuContract/);
});

test("menu safety overlay is removed from runtime path", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const shouldApplyMenuSafetyPolicy\s*=/);
});

test("bullet consistency policy derives statements from bulleted message content", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /function extractBulletedItemsFromMessage\(messageRaw: string\): string\[]/);
  assert.match(source, /const fromMessageBullets = extractBulletedItemsFromMessage\(rawMessage\)/);
  assert.match(source, /const statements = fromStatements.length > 0[\s\S]*fromMessageBullets/);
});

test("DreamExplainer off-topic handling uses explicit contract branch", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.match(source, /const isDreamExplainerOfftopicTurn\s*=/);
  assert.match(source, /buildContractId\(\s*currentStepId,\s*rendered\.status,\s*DREAM_EXPLAINER_SWITCH_SELF_MENU_ID\s*\)/);
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
      __ui_phase_by_step: {
        entity: "entity:phase:ENTITY_MENU_EXAMPLE",
      },
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
  assert.equal(menuIdFromTurn(result), "ENTITY_MENU_EXAMPLE");
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

  assert.equal(result.ok, false);
  assert.equal(String(result.error?.type || ""), "session_upgrade_required");
  assert.ok(Array.isArray((result.error as any)?.markers));
  assert.equal(((result.error as any)?.markers || []).includes("legacy_action_confirm"), true);
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

  assert.equal(result.ok, false);
  assert.equal(String(result.error?.type || ""), "session_upgrade_required");
  assert.ok(Array.isArray((result.error as any)?.markers));
  assert.equal(((result.error as any)?.markers || []).includes("legacy_action_confirm"), true);
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
  assert.equal(menuIdFromTurn(result), "RULES_MENU_ASK_EXPLAIN");
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
  assert.equal(menuIdFromTurn(result), "ENTITY_MENU_EXAMPLE");
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

test("wording choice: dream off-topic keeps pending wording panel visible", async () => {
  const result = await withEnv("TEST_FORCE_OFFTOPIC", "1", () =>
    run_step({
      user_message: "What's the weather in London?",
      input_mode: "widget",
      state: {
        ...getDefaultState(),
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        started: "true",
        business_name: "Mindd",
        last_specialist_result: {
          action: "REFINE",
          menu_id: "DREAM_MENU_REFINE",
          question:
            "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
          refined_formulation: "Mindd dreams of a world where purpose drives action.",
          dream: "Mindd dreams of a world where purpose drives action.",
          wording_choice_pending: "true",
          wording_choice_user_raw: "Mindd dreams of a world where purpose matters.",
          wording_choice_user_normalized: "Mindd dreams of a world where purpose matters.",
          wording_choice_agent_current: "Mindd dreams of a world where purpose drives action.",
          wording_choice_mode: "text",
          wording_choice_target_field: "dream",
        },
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.is_offtopic || ""), "true");
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "true");
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(Boolean((result.ui as any)?.wording_choice?.enabled), true);
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
      __ui_phase_by_step: {
        purpose: "purpose:phase:PURPOSE_MENU_REFINE",
      },
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
      __ui_phase_by_step: {
        purpose: "purpose:phase:PURPOSE_MENU_REFINE",
      },
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
  assert.equal(Boolean((result.ui as any)?.wording_choice?.enabled), true);
});

test("wording choice: DreamExplainer pending panel is visible in DreamBuilder collect/refine mode", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "DreamExplainer",
      __dream_runtime_mode: "builder_refine",
      intro_shown_session: "true",
      started: "true",
      __ui_phase_by_step: {
        dream: "dream:phase:DREAM_EXPLAINER_MENU_REFINE",
      },
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_EXPLAINER_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Refine this formulation",
        suggest_dreambuilder: "true",
        statements: ["Impact one", "Impact two"],
        refined_formulation: "Impact one\nImpact two",
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "dream",
        wording_choice_user_raw: "impact one, impact two",
        wording_choice_user_normalized: "Impact one, impact two.",
        wording_choice_user_items: ["Impact one", "Impact two"],
        wording_choice_agent_current: "1) Impact one\n2) Impact two",
        wording_choice_suggestion_items: ["Impact one", "Impact two"],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(String(result.specialist?.wording_choice_pending || ""), "true");
  assert.equal(String(result.ui?.flags?.require_wording_pick || ""), "true");
  assert.equal(Boolean((result.ui as any)?.wording_choice?.enabled), true);
});

test("wording choice: DreamExplainer pick does not prepend generic current-dream line", async () => {
  const result = await run_step({
    user_message: "ACTION_WORDING_PICK_SUGGESTION",
    input_mode: "widget",
    state: {
      ...getDefaultState(),
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_session: "true",
      started: "true",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "DREAM_EXPLAINER_MENU_REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Refine this formulation",
        suggest_dreambuilder: "true",
        statements: ["Impact one", "Impact two"],
        refined_formulation: "Impact one\nImpact two",
        wording_choice_pending: "true",
        wording_choice_mode: "list",
        wording_choice_target_field: "dream",
        wording_choice_user_raw: "impact one, impact two",
        wording_choice_user_normalized: "Impact one, impact two.",
        wording_choice_user_items: ["Impact one", "Impact two"],
        wording_choice_agent_current: "1) Impact one\n2) Impact two",
        wording_choice_suggestion_items: ["Impact one", "Impact two"],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(
    String(result.specialist?.message || "").toLowerCase().includes("your current dream for"),
    false
  );
});
