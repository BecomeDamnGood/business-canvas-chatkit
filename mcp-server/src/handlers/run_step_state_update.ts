import type { BoolString, CanvasState, ProvisionalSource } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";

type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

export type ApplyStateUpdateParams = {
  prev: CanvasState;
  decision: OrchestratorOutput;
  specialistResult: any;
  showSessionIntroUsed: BoolString;
  provisionalSource?: ProvisionalSource;
};

type ApplyPostSpecialistStateMutationsParams = {
  prevState: CanvasState;
  decision: OrchestratorOutput;
  specialistResult: any;
  provisionalSource: ProvisionalSource;
};

type RunStepStateUpdateDeps = {
  step0Id: string;
  dreamStepId: string;
  purposeStepId: string;
  bigwhyStepId: string;
  roleStepId: string;
  entityStepId: string;
  strategyStepId: string;
  targetgroupStepId: string;
  productsservicesStepId: string;
  rulesofthegameStepId: string;
  presentationStepId: string;
  dreamSpecialist: string;
  dreamExplainerSpecialist: string;
  withProvisionalValue: (
    state: CanvasState,
    stepId: string,
    value: string,
    source: ProvisionalSource
  ) => CanvasState;
  postProcessRulesOfTheGame: (statements: string[], maxRules: number) => { finalRules: string[] };
  buildRulesOfTheGameBullets: (rules: string[]) => string;
  setDreamRuntimeMode: (state: CanvasState, mode: DreamRuntimeMode) => void;
  getDreamRuntimeMode: (state: CanvasState) => DreamRuntimeMode;
};

export function createRunStepStateUpdateHelpers(deps: RunStepStateUpdateDeps) {
  /**
   * Persist state updates consistently (no nulls).
   * Contract mode: step outputs are staged per step and only committed to *_final on explicit next-step actioncodes.
   */
  function applyStateUpdate(params: ApplyStateUpdateParams): CanvasState {
    const { prev, decision, specialistResult, showSessionIntroUsed } = params;

    const action = String(specialistResult?.action ?? "");
    const isOfftopic = specialistResult?.is_offtopic === true;
    const nextStep = String(decision.current_step ?? "");
    const activeSpecialist = String(decision.specialist_to_call ?? "");
    const provisionalSource: ProvisionalSource = params.provisionalSource || "system_generated";

    let nextState: CanvasState = {
      ...prev,
      current_step: nextStep,
      active_specialist: activeSpecialist,
      last_specialist_result:
        typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {},
      intro_shown_session: showSessionIntroUsed === "true" ? "true" : (prev as any).intro_shown_session,
      intro_shown_for_step: action === "INTRO" ? nextStep : (prev as any).intro_shown_for_step,
    };

    // Contract rule: off-topic turns must never mutate canonical finals.
    if (isOfftopic) {
      return nextState;
    }

    if (nextStep === deps.step0Id) {
      if (typeof specialistResult?.step_0 === "string" && specialistResult.step_0.trim()) {
        (nextState as any).step_0_final = specialistResult.step_0.trim();
        nextState = deps.withProvisionalValue(
          nextState,
          deps.step0Id,
          specialistResult.step_0.trim(),
          provisionalSource
        );
      }
      if (typeof specialistResult?.business_name === "string" && specialistResult.business_name.trim()) {
        (nextState as any).business_name = specialistResult.business_name.trim();
      }
    }

    const stageFieldValue = (stepId: string, raw: unknown, secondaryRaw?: unknown): void => {
      const primary = typeof raw === "string" ? raw.trim() : "";
      const fallback = typeof secondaryRaw === "string" ? secondaryRaw.trim() : "";
      const value = primary || fallback;
      if (!value) return;
      nextState = deps.withProvisionalValue(nextState, stepId, value, provisionalSource);
    };

    if (nextStep === deps.dreamStepId) {
      stageFieldValue(deps.dreamStepId, specialistResult?.dream, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.purposeStepId) {
      stageFieldValue(deps.purposeStepId, specialistResult?.purpose, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.bigwhyStepId) {
      stageFieldValue(deps.bigwhyStepId, specialistResult?.bigwhy, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.roleStepId) {
      stageFieldValue(deps.roleStepId, specialistResult?.role, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.entityStepId) {
      stageFieldValue(deps.entityStepId, specialistResult?.entity, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.strategyStepId) {
      stageFieldValue(deps.strategyStepId, specialistResult?.strategy, specialistResult?.refined_formulation);
    }
    if (nextStep === deps.targetgroupStepId) {
      const value = String(specialistResult?.targetgroup || specialistResult?.refined_formulation || "").trim();
      const firstSentence = value.split(/[.!?]/)[0].trim();
      if (firstSentence) {
        const words = firstSentence.split(/\s+/).filter(Boolean);
        const trimmed = words.length > 10 ? words.slice(0, 10).join(" ") : firstSentence;
        nextState = deps.withProvisionalValue(nextState, deps.targetgroupStepId, trimmed, provisionalSource);
      }
    }
    if (nextStep === deps.productsservicesStepId) {
      stageFieldValue(
        deps.productsservicesStepId,
        specialistResult?.productsservices,
        specialistResult?.refined_formulation
      );
    }
    if (nextStep === deps.rulesofthegameStepId) {
      const statementsArray = Array.isArray(specialistResult.statements)
        ? (specialistResult.statements as string[])
        : [];
      const processed = deps.postProcessRulesOfTheGame(statementsArray, 6);
      const bullets = deps.buildRulesOfTheGameBullets(processed.finalRules);
      stageFieldValue(
        deps.rulesofthegameStepId,
        bullets,
        specialistResult?.rulesofthegame || specialistResult?.refined_formulation
      );
    }
    if (nextStep === deps.presentationStepId) {
      stageFieldValue(
        deps.presentationStepId,
        specialistResult?.presentation_brief,
        specialistResult?.refined_formulation
      );
    }

    return nextState;
  }

  function applyPostSpecialistStateMutations(params: ApplyPostSpecialistStateMutationsParams): CanvasState {
    const { decision, prevState, provisionalSource, specialistResult } = params;

    let nextState = applyStateUpdate({
      prev: prevState,
      decision,
      specialistResult,
      showSessionIntroUsed: "false",
      provisionalSource,
    });

    if (
      decision.specialist_to_call === deps.dreamExplainerSpecialist &&
      Array.isArray(specialistResult?.statements)
    ) {
      const canonicalStatements = (specialistResult.statements as unknown[])
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      (nextState as any).dream_builder_statements = canonicalStatements;
    }
    if (
      decision.specialist_to_call === deps.dreamExplainerSpecialist &&
      String((prevState as any).dream_awaiting_direction ?? "").trim() === "true"
    ) {
      (nextState as any).dream_awaiting_direction = "false";
    }
    if (
      decision.specialist_to_call === deps.dreamExplainerSpecialist &&
      specialistResult &&
      Array.isArray(specialistResult.statements) &&
      specialistResult.statements.length >= 20
    ) {
      (nextState as any).dream_scoring_statements = specialistResult.statements;
    }
    if (String((nextState as any).current_step || "") === deps.dreamStepId) {
      if (decision.specialist_to_call === deps.dreamSpecialist) {
        deps.setDreamRuntimeMode(nextState, "self");
      } else if (decision.specialist_to_call === deps.dreamExplainerSpecialist) {
        const scoringPhase = String(specialistResult?.scoring_phase ?? "") === "true";
        const hasClusters =
          Array.isArray(specialistResult?.clusters) &&
          (specialistResult.clusters as unknown[]).length > 0;
        if (scoringPhase && hasClusters) {
          deps.setDreamRuntimeMode(nextState, "builder_scoring");
        } else if (deps.getDreamRuntimeMode(prevState) === "builder_scoring" && !scoringPhase) {
          deps.setDreamRuntimeMode(nextState, "builder_refine");
        } else if (deps.getDreamRuntimeMode(prevState) === "builder_refine" && !scoringPhase) {
          deps.setDreamRuntimeMode(nextState, "builder_refine");
        } else {
          deps.setDreamRuntimeMode(nextState, "builder_collect");
        }
      }
    } else {
      deps.setDreamRuntimeMode(nextState, "self");
    }

    return nextState;
  }

  return {
    applyStateUpdate,
    applyPostSpecialistStateMutations,
  };
}
