import type { CanvasState } from "../core/state.js";

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
    specialist: Record<string, unknown> | null | undefined
  ): Record<string, unknown> | null | undefined {
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
    const isOfftopic =
      specialist.is_offtopic === true ||
      String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
    if (isOfftopic) return specialist;
    const scoringPhase = String(specialist.scoring_phase || "").trim() === "true";
    if (scoringPhase) return specialist;

    const currentQuestion = String(specialist.question || "").trim();
    if (!currentQuestion) return specialist;

    const specialistStatementsCount = Array.isArray(specialist.statements)
      ? (specialist.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
      : 0;
    const hasCollectedInput =
      params.canonicalStatementCount > 0 ||
      specialistStatementsCount > 0 ||
      params.wordingChoicePending ||
      String(specialist.wording_choice_pending || "").trim() === "true";
    if (!hasCollectedInput) return specialist;

    const stage = String((params.state as Record<string, unknown>).__dream_builder_prompt_stage || "").trim();
    if (stage === "more") return specialist;
    const nextQuestion = deps.uiStringFromStateMap(
      params.state,
      "dreamBuilder.question.more",
      deps.uiDefaultString(
        "dreamBuilder.question.more",
        "What more do you see changing in the future, positive or negative? Let your imagination run free."
      )
    );
    if (!nextQuestion || nextQuestion === currentQuestion) return specialist;
    (params.state as Record<string, unknown>).__dream_builder_prompt_stage = "more";
    return {
      ...specialist,
      question: nextQuestion,
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
    const offTopicFlag = specialist.is_offtopic === true || String(specialist.is_offtopic || "").trim().toLowerCase() === "true";
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

  function compactWordingPanelBody(messageRaw: string): string {
    const message = String(messageRaw || "").replace(/\r/g, "\n").trim();
    if (!message) return "";
    const lines = message
      .split("\n")
      .map((line) => String(line || "").replace(/<[^>]+>/g, " ").trim())
      .filter(Boolean)
      .filter((line) => !/^\s*(?:[-*•]|\d+[\).])\s+/.test(line))
      .filter((line) => {
        const normalized = line.toLowerCase();
        if (!normalized) return false;
        if (normalized.includes("this is your input")) return false;
        if (normalized.includes("this would be my suggestion")) return false;
        if (normalized.includes("if you meant something different")) return false;
        if (/\b(i['’]?ve|i have)\s+(reformulat\w*|rewritten|broadened|converted)\b/i.test(normalized)) return false;
        if (/^statement\s*\d+\s*:/i.test(normalized)) return false;
        if (/^statements?\s+\d+\s*(?:to|-)\s*\d+/i.test(normalized)) return false;
        return true;
      });
    if (lines.length === 0) return "";
    const firstLine = String(lines[0] || "").trim();
    if (!firstLine) return "";
    const firstSentence = firstLine
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean)[0] || "";
    return deps.ensureSentenceEnd(firstSentence || firstLine);
  }

  return {
    normalizeEntityPhrase,
    normalizeEntitySpecialistResult,
    enforceDreamBuilderQuestionProgress,
    isMetaOfftopicFallbackTurn,
    compactWordingPanelBody,
  };
}
