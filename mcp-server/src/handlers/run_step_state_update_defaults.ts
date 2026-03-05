import type { CanvasState, ProvisionalSource } from "../core/state.js";
import { STEP_0_ID } from "../steps/step_0_validation.js";
import { DREAM_STEP_ID, DREAM_SPECIALIST } from "../steps/dream.js";
import { DREAM_EXPLAINER_SPECIALIST } from "../steps/dream_explainer.js";
import { PURPOSE_STEP_ID } from "../steps/purpose.js";
import { BIGWHY_STEP_ID } from "../steps/bigwhy.js";
import { ROLE_STEP_ID } from "../steps/role.js";
import { ENTITY_STEP_ID } from "../steps/entity.js";
import { STRATEGY_STEP_ID } from "../steps/strategy.js";
import { TARGETGROUP_STEP_ID } from "../steps/targetgroup.js";
import { PRODUCTSSERVICES_STEP_ID } from "../steps/productsservices.js";
import {
  RULESOFTHEGAME_STEP_ID,
} from "../steps/rulesofthegame.js";
import { applyRulesRuntimePolicy } from "../steps/rulesofthegame_runtime_policy.js";
import { PRESENTATION_STEP_ID } from "../steps/presentation.js";
import { createRunStepStateUpdateHelpers } from "./run_step_state_update.js";
import { parseListItems } from "./run_step_wording_heuristics.js";

type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

function normalizedProvisionalByStep(state: any): Record<string, string> {
  const raw =
    state && typeof state.provisional_by_step === "object" && state.provisional_by_step !== null
      ? (state.provisional_by_step as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [String(key), String(value ?? "").trim()])
  );
}

function normalizedProvisionalSourceByStep(state: any): Record<string, ProvisionalSource> {
  const raw =
    state && typeof state.provisional_source_by_step === "object" && state.provisional_source_by_step !== null
      ? (state.provisional_source_by_step as Record<string, unknown>)
      : {};
  const next: Record<string, ProvisionalSource> = {};
  for (const [stepIdRaw, sourceRaw] of Object.entries(raw)) {
    const stepId = String(stepIdRaw || "").trim();
    if (!stepId) continue;
    const source = String(sourceRaw || "").trim();
    if (
      source === "user_input" ||
      source === "wording_pick" ||
      source === "action_route" ||
      source === "system_generated"
    ) {
      next[stepId] = source;
    }
  }
  return next;
}

function withProvisionalValue(
  state: CanvasState,
  stepId: string,
  value: string,
  source: ProvisionalSource
): CanvasState {
  if (!stepId) return state;
  const map = normalizedProvisionalByStep(state);
  const sourceMap = normalizedProvisionalSourceByStep(state);
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
  };
}

function setDreamRuntimeMode(state: CanvasState, mode: DreamRuntimeMode): void {
  (state as any).dream_runtime_mode = mode;
}

function getDreamRuntimeMode(state: CanvasState): DreamRuntimeMode {
  const mode = String((state as any).dream_runtime_mode || "").trim();
  if (mode === "builder_collect" || mode === "builder_scoring" || mode === "builder_refine") {
    return mode;
  }
  return "self";
}

const stateUpdateHelpers = createRunStepStateUpdateHelpers({
  step0Id: STEP_0_ID,
  dreamStepId: DREAM_STEP_ID,
  purposeStepId: PURPOSE_STEP_ID,
  bigwhyStepId: BIGWHY_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  entityStepId: ENTITY_STEP_ID,
  strategyStepId: STRATEGY_STEP_ID,
  targetgroupStepId: TARGETGROUP_STEP_ID,
  productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
  rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
  presentationStepId: PRESENTATION_STEP_ID,
  dreamSpecialist: DREAM_SPECIALIST,
  dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST,
  withProvisionalValue,
  parseListItems,
  applyRulesRuntimePolicy,
  setDreamRuntimeMode,
  getDreamRuntimeMode,
});

export const applyStateUpdate = stateUpdateHelpers.applyStateUpdate;
export const applyPostSpecialistStateMutations = stateUpdateHelpers.applyPostSpecialistStateMutations;
