import type { CanvasState } from "../core/state.js";
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
      deps.uiDefaultString("offtopic.companyFallback", "my future company")
    );
  }

  function normalizeLocalizedConceptTerms(
    specialist: Record<string, unknown> | null | undefined,
    state?: CanvasState | null
  ): Record<string, unknown> | null | undefined {
    if (!specialist || typeof specialist !== "object") return specialist;
    const langRaw = String((state as Record<string, unknown> | null | undefined)?.language || "").trim().toLowerCase();
    const localeRaw = String((state as Record<string, unknown> | null | undefined)?.locale || "").trim().toLowerCase();
    const baseLang = (langRaw || localeRaw).split(/[-_]/)[0] || "";
    if (!baseLang || baseLang === "en") return specialist;

    const mapTerm = (key: string, fallback: string): string =>
      deps.uiStringFromStateMap(state || null, key, deps.uiDefaultString(key, fallback));
    const companyRef = companyReferenceForState(state);

    const replacements: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /<\s*my future company\s*>/gi, value: companyRef },
      { pattern: /\bmy future company\b/gi, value: companyRef },
      { pattern: /\bRules of the Game\b/gi, value: mapTerm("offtopic.step.rulesofthegame", "Rules of the game") },
      { pattern: /\bProducts and Services\b/gi, value: mapTerm("offtopic.step.productsservices", "Products and Services") },
      { pattern: /\bTarget Group\b/gi, value: mapTerm("offtopic.step.targetgroup", "Target Group") },
      { pattern: /\bBig Why\b/gi, value: mapTerm("offtopic.step.bigwhy", "Big Why") },
      { pattern: /\bPurpose\b/gi, value: mapTerm("offtopic.step.purpose", "Purpose") },
      { pattern: /\bDream\b/gi, value: mapTerm("offtopic.step.dream", "Dream") },
      { pattern: /\bRole\b/gi, value: mapTerm("offtopic.step.role", "Role") },
      { pattern: /\bEntity\b/gi, value: mapTerm("offtopic.step.entity", "Entity") },
      { pattern: /\bStrategy\b/gi, value: mapTerm("offtopic.step.strategy", "Strategy") },
      { pattern: /\bWhy\b/gi, value: mapTerm("concept.why", "Why") },
      { pattern: /\bVenture\b(?=\s*:)/gi, value: mapTerm("recap.label.venture", "Venture") },
      { pattern: /\bName\b(?=\s*:)/gi, value: mapTerm("recap.label.name", "Name") },
      { pattern: /\bStatus\b(?=\s*:)/gi, value: mapTerm("recap.label.status", "Status") },
    ].filter((entry) => String(entry.value || "").trim().length > 0);

    const localizeText = (input: unknown): string => {
      let text = String(input || "");
      if (!text) return "";
      for (const { pattern, value } of replacements) {
        text = text.replace(pattern, value);
      }
      return text;
    };

    const next = { ...specialist };
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
      "wording_choice_agent_current",
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
    if (Array.isArray(next.wording_choice_suggestion_items)) {
      next.wording_choice_suggestion_items = (next.wording_choice_suggestion_items as unknown[])
        .map((line) => localizeText(line))
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    }
    return next;
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
    const normalizedRefined = normalizeEntityPhrase(String(specialist.refined_formulation || ""));
    const normalizedEntity = normalizeEntityPhrase(String(specialist.entity || ""));
    const canonical = normalizedEntity || normalizedRefined;
    if (!canonical) return specialist;
    const next = { ...specialist };
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
      wordingChoicePending: boolean;
      state: CanvasState;
    }
  ): Record<string, unknown> {
    const currentStepId = String(params.currentStepId || "").trim();
    const activeSpecialist = String(params.activeSpecialist || "").trim();
    const specialist =
      specialistResult && typeof specialistResult === "object" ? specialistResult : {};
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
      params.wordingChoicePending ||
      String(specialist.wording_choice_pending || "").trim() === "true";
    const stage = String((params.state as Record<string, unknown>).__dream_builder_prompt_stage || "").trim();

    const baseQuestion = deps.uiStringFromStateMap(
      params.state,
      "dreamBuilder.question.base",
      deps.uiDefaultString("dreamBuilder.question.base")
    );
    const moreQuestion = deps.uiStringFromStateMap(
      params.state,
      "dreamBuilder.question.more",
      deps.uiDefaultString("dreamBuilder.question.more")
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

    if (!moreQuestion || (stage === "more" && moreQuestion === currentQuestion)) return specialist;
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
