import {
  patchPendingInteractionState,
  readPendingInteractionState,
  type CanvasState,
} from "../core/state.js";
import { isTrueFlag } from "./run_step_type_guards.js";

type CreateRunStepRuntimeSpecialistHelpersDeps = {
  step0Id: string;
  dreamStepId: string;
  entityStepId: string;
  dreamExplainerSpecialist: string;
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
  ensureSentenceEnd: (raw: string) => string;
  resolveMotivationUserIntent: (specialist: Record<string, unknown>) => string;
  resolveSpecialistMetaTopic: (specialist: Record<string, unknown>) => string;
};

export function createRunStepRuntimeSpecialistHelpers(deps: CreateRunStepRuntimeSpecialistHelpersDeps) {
  function parseBusinessNameFromStep0Final(state?: CanvasState | null): string {
    const raw = String((state as Record<string, unknown> | null | undefined)?.step_0_final || "").trim();
    if (!raw) return "";
    const match = raw.match(/Name:\s*([^|]+)\s*(\||$)/i);
    return String(match?.[1] || "").trim();
  }

  function companyReferenceForState(state?: CanvasState | null): string {
    const direct = String((state as Record<string, unknown> | null | undefined)?.business_name || "").trim();
    if (direct && direct !== "TBD") return direct;
    const parsed = parseBusinessNameFromStep0Final(state);
    if (parsed && parsed !== "TBD") return parsed;
    return deps.uiStringFromStateMap(
      state || null,
      "offtopic.companyFallback",
      deps.uiDefaultString("offtopic.companyFallback", "")
    );
  }

  function normalizeLocalizedConceptTerms(
    specialist: Record<string, unknown> | null | undefined,
    state?: CanvasState | null
  ): Record<string, unknown> | null | undefined {
    if (!specialist || typeof specialist !== "object") return specialist;
    const materialized = { ...(specialist as Record<string, unknown>) };
    const langRaw = String((state as Record<string, unknown> | null | undefined)?.language || "").trim().toLowerCase();
    const localeRaw = String((state as Record<string, unknown> | null | undefined)?.locale || "").trim().toLowerCase();
    const baseLang = (langRaw || localeRaw).split(/[-_]/)[0] || "";
    if (!baseLang || baseLang === "en") return materialized;

    const mapTerm = (key: string): string =>
      deps.uiStringFromStateMap(state || null, key, deps.uiDefaultString(key, ""));
    const companyRef = companyReferenceForState(state);

    const replacements: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /<\s*my future company\s*>/gi, value: companyRef },
      { pattern: /\bmy future company\b/gi, value: companyRef },
      { pattern: /\bRules of the Game\b/gi, value: mapTerm("offtopic.step.rulesofthegame") },
      { pattern: /\bProducts and Services\b/gi, value: mapTerm("offtopic.step.productsservices") },
      { pattern: /\bTarget Group\b/gi, value: mapTerm("offtopic.step.targetgroup") },
      { pattern: /\bBig Why\b/gi, value: mapTerm("offtopic.step.bigwhy") },
      { pattern: /\bPurpose\b/gi, value: mapTerm("offtopic.step.purpose") },
      { pattern: /\bDream\b/gi, value: mapTerm("offtopic.step.dream") },
      { pattern: /\bRole\b/gi, value: mapTerm("offtopic.step.role") },
      { pattern: /\bEntity\b/gi, value: mapTerm("offtopic.step.entity") },
      { pattern: /\bStrategy\b/gi, value: mapTerm("offtopic.step.strategy") },
      { pattern: /\bWhy\b/gi, value: mapTerm("concept.why") },
      { pattern: /\bVenture\b(?=\s*:)/gi, value: mapTerm("recap.label.venture") },
      { pattern: /\bName\b(?=\s*:)/gi, value: mapTerm("recap.label.name") },
      { pattern: /\bStatus\b(?=\s*:)/gi, value: mapTerm("recap.label.status") },
    ].filter((entry) => String(entry.value || "").trim().length > 0);

    const localizeText = (input: unknown): string => {
      let text = String(input || "");
      if (!text) return "";
      for (const { pattern, value } of replacements) {
        text = text.replace(pattern, value);
      }
      return text;
    };

    const next = { ...materialized };
    const compareState = readPendingInteractionState(materialized);
    const localizableKeys = [
      "message",
      "question",
      "refined_formulation",
      "dream",
      "purpose",
      "bigwhy",
      "role",
      "entity",
      "strategy",
      "targetgroup",
      "productsservices",
      "rulesofthegame",
      "presentation_brief",
    ];
    for (const key of localizableKeys) {
      const raw = String(next[key] || "");
      if (!raw) continue;
      next[key] = localizeText(raw);
    }
    if (Array.isArray(next.statements)) {
      next.statements = (next.statements as unknown[])
        .map((line) => localizeText(line))
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    }
    let localized = next;
    if (compareState) {
      const renderModel = compareState.render_model;
      localized = patchPendingInteractionState(localized, {
        render_model: {
          ...renderModel,
          suggestion_text: localizeText(renderModel.suggestion_text),
          suggestion_items: renderModel.suggestion_items
            .map((line) => localizeText(line))
            .map((line) => String(line || "").trim())
            .filter(Boolean),
        },
      });
    }
    return localized;
  }

  function normalizeEntityPhrase(raw: string): string {
    let next = String(raw || "").replace(/\r/g, "\n").trim();
    if (!next) return "";
    next = next.split(/\n{2,}/)[0].trim();
    next = next.replace(/\s+/g, " ").trim();
    next = next.replace(/\s*How does that sound to you\?.*$/i, "").trim();
    next = next.replace(/^we\s+are\s+/i, "");
    next = next.replace(/^we['’]re\s+/i, "");
    next = next.replace(/^it\s+is\s+/i, "");
    next = next.replace(/^it['’]s\s+/i, "");
    next = next.replace(/[“”"']+/g, "").trim();
    next = next.replace(/[.!?]+$/g, "").trim();
    return next;
  }

  function normalizeEntitySpecialistResult(
    stepId: string,
    specialist: Record<string, unknown> | null | undefined,
    state?: CanvasState | null
  ): Record<string, unknown> | null | undefined {
    void state;
    if (stepId !== deps.entityStepId || !specialist || typeof specialist !== "object") return specialist;
    const materialized = { ...(specialist as Record<string, unknown>) };
    const normalizedRefined = normalizeEntityPhrase(String(materialized.refined_formulation || ""));
    const normalizedEntity = normalizeEntityPhrase(String(materialized.entity || ""));
    const canonical = normalizedEntity || normalizedRefined;
    if (!canonical) return materialized;
    const next = { ...materialized };
    if (normalizedRefined) next.refined_formulation = normalizedRefined;
    next.entity = canonical;
    return next;
  }

  function enforceDreamBuilderQuestionProgress(
    specialistResult: Record<string, unknown> | null | undefined,
    params: {
      currentStepId: string;
      activeSpecialist: string;
      canonicalStatementCount: number;
      comparePending: boolean;
      state: CanvasState;
    }
  ): Record<string, unknown> {
    const currentStepId = String(params.currentStepId || "").trim();
    const activeSpecialist = String(params.activeSpecialist || "").trim();
    const specialist =
      specialistResult && typeof specialistResult === "object"
        ? ({ ...(specialistResult as Record<string, unknown>) })
        : {};
    if (currentStepId !== deps.dreamStepId || activeSpecialist !== deps.dreamExplainerSpecialist) {
      return specialist;
    }
    const isOfftopic = isTrueFlag(specialist.is_offtopic);
    if (isOfftopic) return specialist;
    const scoringPhase = String(specialist.scoring_phase || "").trim() === "true";
    if (scoringPhase) return specialist;

    const currentQuestion = String(specialist.question || "").trim();
    const specialistStatementsCount = Array.isArray(specialist.statements)
      ? (specialist.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
      : 0;
    const hasCollectedInput =
      params.canonicalStatementCount > 0 ||
      specialistStatementsCount > 0 ||
      params.comparePending;
    const stage = String((params.state as Record<string, unknown>).__dream_builder_prompt_stage || "").trim();

    const baseQuestion = deps.uiStringFromStateMap(
      params.state,
      "dreamBuilder.question.base",
      deps.uiDefaultString("dreamBuilder.question.base")
    );
    const moreQuestion =
      deps.uiStringFromStateMap(
        params.state,
        "dreamBuilder.question.more",
        deps.uiDefaultString("dreamBuilder.question.more")
      ) ||
      deps.uiStringFromStateMap(
        params.state,
        "dreamBuilder.question.base",
        deps.uiDefaultString("dreamBuilder.question.base")
      );

    if (!hasCollectedInput) {
      if (stage !== "base" && stage !== "") return specialist;
      if (!baseQuestion || baseQuestion === currentQuestion) return specialist;
      (params.state as Record<string, unknown>).__dream_builder_prompt_stage = "base";
      return {
        ...specialist,
        question: baseQuestion,
      };
    }

    if (!moreQuestion || (stage === "more" && moreQuestion === currentQuestion)) {
      return specialist;
    }
    (params.state as Record<string, unknown>).__dream_builder_prompt_stage = "more";
    return {
      ...specialist,
      question: moreQuestion,
    };
  }

  function isMetaOfftopicFallbackTurn(params: {
    stepId: string;
    userMessage: string;
    specialistResult: unknown;
  }): boolean {
    void params.userMessage;
    const stepId = String(params.stepId || "").trim();
    if (!stepId || stepId === deps.step0Id) return false;
    const specialist: Record<string, unknown> =
      params.specialistResult && typeof params.specialistResult === "object"
        ? (params.specialistResult as Record<string, unknown>)
        : {};
    const offTopicFlag = isTrueFlag(specialist.is_offtopic);
    if (offTopicFlag) return false;

    const userIntent = deps.resolveMotivationUserIntent(specialist);
    if (
      userIntent === "META_QUESTION" ||
      userIntent === "RECAP_REQUEST" ||
      userIntent === "WHY_NEEDED" ||
      userIntent === "RESISTANCE"
    ) {
      return true;
    }
    const metaTopic = deps.resolveSpecialistMetaTopic(specialist);
    return metaTopic !== "NONE";
  }

  return {
    normalizeLocalizedConceptTerms,
    normalizeEntityPhrase,
    normalizeEntitySpecialistResult,
    enforceDreamBuilderQuestionProgress,
    isMetaOfftopicFallbackTurn,
  };
}
