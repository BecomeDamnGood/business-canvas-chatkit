import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultState, type CanvasState, type ProvisionalSource } from "../core/state.js";
import { createRunStepStateUpdateHelpers } from "./run_step_state_update.js";

const helpers = createRunStepStateUpdateHelpers({
  step0Id: "step_0",
  dreamStepId: "dream",
  purposeStepId: "purpose",
  bigwhyStepId: "bigwhy",
  roleStepId: "role",
  entityStepId: "entity",
  strategyStepId: "strategy",
  targetgroupStepId: "targetgroup",
  productsservicesStepId: "productsservices",
  rulesofthegameStepId: "rulesofthegame",
  presentationStepId: "presentation",
  dreamSpecialist: "dream_specialist",
  dreamExplainerSpecialist: "dream_explainer",
  withProvisionalValue: (
    state: CanvasState,
    stepId: string,
    value: string,
    source: ProvisionalSource
  ) => {
    const map =
      state && typeof state.provisional_by_step === "object" && state.provisional_by_step !== null
        ? { ...(state.provisional_by_step as Record<string, string>) }
        : {};
    const sourceMap =
      state && typeof state.provisional_source_by_step === "object" && state.provisional_source_by_step !== null
        ? { ...(state.provisional_source_by_step as Record<string, "user_input" | "compare_pick" | "action_route" | "system_generated">) }
        : {};
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      delete map[stepId];
      delete sourceMap[stepId];
    } else {
      map[stepId] = trimmed;
      sourceMap[stepId] = source;
    }
    return {
      ...state,
      provisional_by_step: map,
      provisional_source_by_step: sourceMap,
    } as any;
  },
  parseListItems: (value: string) =>
    String(value || "")
      .split(/\n+/)
      .map((line) => String(line || "").replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean),
  applyDreamRuntimePolicy: ({ specialist }: { specialist: Record<string, unknown> }) => ({
    specialist,
    canStage: true,
  }),
  applyRulesRuntimePolicy: ({ specialist }: { specialist: Record<string, unknown> }) => ({
    specialist,
  }),
  setDreamRuntimeMode: (state: CanvasState, mode: string) => {
    (state as Record<string, unknown>).dream_runtime_mode = mode;
  },
  getDreamRuntimeMode: (state: CanvasState) =>
    String((state as Record<string, unknown>).dream_runtime_mode || "self") as
      | "self"
      | "builder_collect"
      | "builder_scoring"
      | "builder_refine",
} as any);

test("advancing to the next step promotes the previous provisional value to a final", () => {
  const prevState = {
    ...getDefaultState(),
    current_step: "dream",
    provisional_by_step: {
      dream: "Mindd dreams of a world in which people experience work as meaningful and fulfilling.",
    },
    provisional_source_by_step: {
      dream: "user_input" as const,
    },
  } as any;

  const nextState = helpers.applyPostSpecialistStateMutations({
    prevState,
    decision: {
      current_step: "purpose",
      specialist_to_call: "purpose_specialist",
    } as any,
    specialistResult: {
      action: "INTRO",
      message: "",
      question: "",
    },
    provisionalSource: "action_route",
  });

  assert.equal(
    String((nextState as any).dream_final || ""),
    "Mindd dreams of a world in which people experience work as meaningful and fulfilling."
  );
  assert.equal(String((nextState as any).provisional_by_step?.dream || ""), "");
});

test("advancing to the next step promotes visible last specialist wording when no provisional value exists", () => {
  const prevState = {
    ...getDefaultState(),
    current_step: "purpose",
    last_specialist_result: {
      purpose: "We believe every person deserves to feel valued in their work.",
    },
  } as any;

  const nextState = helpers.applyPostSpecialistStateMutations({
    prevState,
    decision: {
      current_step: "bigwhy",
      specialist_to_call: "bigwhy_specialist",
    } as any,
    specialistResult: {
      action: "INTRO",
      message: "",
      question: "",
    },
    provisionalSource: "action_route",
  });

  assert.equal(
    String((nextState as any).purpose_final || ""),
    "We believe every person deserves to feel valued in their work."
  );
});
