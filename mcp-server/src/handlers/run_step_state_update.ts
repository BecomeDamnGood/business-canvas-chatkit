import type { BoolString, CanvasState, ProvisionalSource } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import { isValidStepValueForStorage } from "./run_step_value_shape.js";

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
  parseListItems: (value: string) => string[];
  applyDreamRuntimePolicy: (params: {
    specialist: Record<string, unknown>;
    userMessage?: string;
    currentValue?: string;
  }) => { specialist: Record<string, unknown>; canStage: boolean };
  applyRulesRuntimePolicy: (params: {
    specialist: Record<string, unknown>;
    previousStatements?: string[];
    uiStrings?: Record<string, unknown>;
  }) => { specialist: Record<string, unknown> };
  setDreamRuntimeMode: (state: CanvasState, mode: DreamRuntimeMode) => void;
  getDreamRuntimeMode: (state: CanvasState) => DreamRuntimeMode;
};

export function createRunStepStateUpdateHelpers(deps: RunStepStateUpdateDeps) {
  function normalizeBulletItems(rawValue: unknown): string[] {
    return deps.parseListItems(String(rawValue || ""))
      .map((line) => String(line || "").replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
      .filter(Boolean);
  }

  function bulletsFromItems(items: string[]): string {
    return items
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .map((line) => `• ${line}`)
      .join("\n")
      .trim();
  }

  function listFromStatements(rawStatements: unknown): string[] {
    if (!Array.isArray(rawStatements)) return [];
    return rawStatements
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }

  function normalizeBulletConsistencyValue(rawValue: unknown): string {
    const items = normalizeBulletItems(rawValue);
    if (items.length === 0) return String(rawValue || "").trim();
    return bulletsFromItems(items);
  }

  function stripSimpleMarkup(raw: string): string {
    return String(raw || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<\/?p[^>]*>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .trim();
  }

  function looksLikeQuestion(line: string): boolean {
    return /[?？]\s*$/.test(String(line || "").trim());
  }

  function extractProductsServicesCandidateFromMessage(rawMessage: unknown): string {
    const text = stripSimpleMarkup(String(rawMessage || ""));
    if (!text) return "";

    const lines = text
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (lines.length === 0) return "";

    const bulletItems = lines
      .map((line) => line.match(/^\s*[-*•]\s+(.+)$/)?.[1] || "")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (bulletItems.length > 0) return bulletItems.join("\n");

    const paragraphs = text
      .split(/\n{2,}/)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    if (paragraphs.length >= 2) {
      const middle = paragraphs.slice(1, -1).find((part) => !looksLikeQuestion(part));
      if (middle) return middle;
      const fallbackMiddle = paragraphs[1];
      if (fallbackMiddle && !looksLikeQuestion(fallbackMiddle)) return fallbackMiddle;
    }

    return "";
  }

  /**
   * Persist state updates consistently (no nulls).
   * Contract mode: step outputs are staged per step and only committed to *_final on explicit next-step actioncodes.
   */
  function applyStateUpdate(params: ApplyStateUpdateParams): CanvasState {
    const { prev, decision, showSessionIntroUsed } = params;
    let specialistResult = params.specialistResult;

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
      if (!isValidStepValueForStorage(stepId, value)) return;
      nextState = deps.withProvisionalValue(nextState, stepId, value, provisionalSource);
    };

    if (nextStep === deps.dreamStepId) {
      const policyApplied = deps.applyDreamRuntimePolicy({
        specialist: (specialistResult || {}) as Record<string, unknown>,
        currentValue: String(
          (prev as any)?.provisional_by_step?.[deps.dreamStepId] ||
          (prev as any)?.dream_final ||
          ""
        ).trim(),
      });
      specialistResult = policyApplied.specialist;
      if (policyApplied.canStage) {
        stageFieldValue(deps.dreamStepId, specialistResult?.dream, specialistResult?.refined_formulation);
      }
    } else if (nextStep === deps.purposeStepId) {
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
      const strategyStatements = listFromStatements(specialistResult?.statements);
      const normalizedStrategy = normalizeBulletConsistencyValue(
        specialistResult?.strategy ||
        specialistResult?.refined_formulation ||
        (strategyStatements.length > 0 ? strategyStatements.join("\n") : "")
      );
      if (normalizedStrategy) {
        specialistResult.strategy = normalizedStrategy;
        specialistResult.refined_formulation = normalizedStrategy;
        if (strategyStatements.length > 0) {
          specialistResult.statements = normalizeBulletItems(normalizedStrategy);
        }
      }
      stageFieldValue(deps.strategyStepId, normalizedStrategy, specialistResult?.refined_formulation);
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
      const productsServicesStatements = listFromStatements(specialistResult?.statements);
      const normalizedProductsServices = normalizeBulletConsistencyValue(
        specialistResult?.productsservices ||
        specialistResult?.refined_formulation ||
        (productsServicesStatements.length > 0 ? productsServicesStatements.join("\n") : "")
      );
      if (normalizedProductsServices) {
        specialistResult.productsservices = normalizedProductsServices;
        specialistResult.refined_formulation = normalizedProductsServices;
        if (productsServicesStatements.length > 0) {
          specialistResult.statements = normalizeBulletItems(normalizedProductsServices);
        }
      }
      stageFieldValue(deps.productsservicesStepId, normalizedProductsServices, specialistResult?.refined_formulation);
      if (!String((nextState as any).provisional_by_step?.[deps.productsservicesStepId] || "").trim()) {
        const candidateFromMessage = extractProductsServicesCandidateFromMessage(specialistResult?.message);
        if (candidateFromMessage) {
          const normalizedFromMessage = normalizeBulletConsistencyValue(candidateFromMessage);
          nextState = deps.withProvisionalValue(
            nextState,
            deps.productsservicesStepId,
            normalizedFromMessage || candidateFromMessage,
            provisionalSource
          );
        }
      }
    }
    if (nextStep === deps.rulesofthegameStepId) {
      const previousStatements = Array.isArray((prev as any)?.last_specialist_result?.statements)
        ? ((prev as any).last_specialist_result.statements as unknown[])
          .map((line) => String(line || "").trim())
          .filter(Boolean)
        : [];
      const policyApplied = deps.applyRulesRuntimePolicy({
        specialist: (specialistResult || {}) as Record<string, unknown>,
        previousStatements,
        uiStrings:
          prev && typeof (prev as any).ui_strings === "object" && (prev as any).ui_strings !== null
            ? ((prev as any).ui_strings as Record<string, unknown>)
            : {},
      });
      specialistResult = policyApplied.specialist;
      const statementsArray = Array.isArray(specialistResult?.statements)
        ? (specialistResult.statements as unknown[])
          .map((line) => String(line || "").trim())
          .filter(Boolean)
        : [];
      const normalizedRules = normalizeBulletItems(statementsArray.join("\n"));
      const rulesValue = String(
        specialistResult.rulesofthegame ||
        specialistResult.refined_formulation ||
        ""
      ).trim();
      specialistResult.statements = normalizedRules.length > 0 ? normalizedRules : statementsArray;
      const stagedRulesValue = rulesValue || bulletsFromItems(normalizedRules);
      stageFieldValue(
        deps.rulesofthegameStepId,
        stagedRulesValue,
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

    (nextState as any).last_specialist_result =
      typeof specialistResult === "object" && specialistResult !== null ? specialistResult : {};

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
