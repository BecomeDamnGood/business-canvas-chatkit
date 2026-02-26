import type { CanvasState } from "../core/state.js";

type CreateRunStepRuntimeDreamHelpersDeps = {
  strategyStepId: string;
  tokenizeWords: (value: string) => string[];
  parseListItems: (value: string) => string[];
  provisionalValueForStep: (state: CanvasState, stepId: string) => string;
  ensureSentenceEnd: (value: string) => string;
};

export function createRunStepRuntimeDreamHelpers(deps: CreateRunStepRuntimeDreamHelpersDeps) {
  function hasMeaningfulDreamCandidateText(rawValue: unknown): boolean {
    const value = String(rawValue || "").replace(/\r/g, "\n").trim();
    if (!value) return false;
    const numberedLines = value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => /^\d+[\).]\s+/.test(line));
    if (numberedLines.length >= 3) return false;
    const bulletLines = value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => /^[\-*•]\s+/.test(line));
    if (bulletLines.length >= 3) return false;
    const words = deps.tokenizeWords(value);
    if (words.length < 5) return false;
    if (words.length > 70) return false;
    const sentenceCount = value
      .split(/[.!?]+/)
      .map((part) => part.trim())
      .filter(Boolean).length;
    if (sentenceCount > 3) return false;
    return true;
  }

  function pickDreamCandidateFromState(state: CanvasState): string {
    const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
    const candidates = [
      String((state as any).dream_final || "").trim(),
      String(last.dream || "").trim(),
      String(last.refined_formulation || "").trim(),
    ];
    for (const candidate of candidates) {
      if (hasMeaningfulDreamCandidateText(candidate)) return candidate;
    }
    return "";
  }

  function hasDreamSpecialistCandidate(result: unknown): boolean {
    const source =
      result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    const dreamValue = String(source.dream || "").trim();
    const refinedValue = String(source.refined_formulation || "").trim();
    return Boolean(dreamValue || refinedValue);
  }

  function strategyStatementsForConsolidateGuard(result: unknown, state: CanvasState): string[] {
    const source =
      result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    const direct = Array.isArray(source.statements)
      ? (source.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    if (direct.length > 0) return direct;
    const rawCombined = String(source.strategy || source.refined_formulation || "").trim();
    if (rawCombined) {
      return deps.parseListItems(rawCombined)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    }
    const fallback = String(
      (state as any).strategy_final || deps.provisionalValueForStep(state, deps.strategyStepId) || ""
    ).trim();
    return deps.parseListItems(fallback)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }

  function fallbackDreamCandidateFromUserInput(userInput: string, state: CanvasState): string {
    const raw = String(userInput || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
    const fallbackCompany = String((state as any)?.business_name || "").trim();
    const company = fallbackCompany && fallbackCompany !== "TBD" ? fallbackCompany : "The business";
    if (!raw) {
      return `${company} dreams of a world in which people experience more meaning and long-term value.`;
    }
    const trimmed = raw.replace(/[.!?]+$/g, "").trim();
    if (/dreams of a world in which/i.test(trimmed)) return deps.ensureSentenceEnd(trimmed);
    const normalizedRest = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    return `${company} dreams of a world in which ${normalizedRest}.`;
  }

  function buildDreamRefineFallbackSpecialist(
    base: Record<string, unknown> | null | undefined,
    userInput: string,
    state: CanvasState
  ): Record<string, unknown> {
    const fallback = fallbackDreamCandidateFromUserInput(userInput, state);
    return {
      ...(base && typeof base === "object" ? base : {}),
      action: "REFINE",
      message: "",
      question: "",
      refined_formulation: fallback,
      dream: "",
      suggest_dreambuilder: "false",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };
  }

  return {
    hasMeaningfulDreamCandidateText,
    pickDreamCandidateFromState,
    hasDreamSpecialistCandidate,
    strategyStatementsForConsolidateGuard,
    fallbackDreamCandidateFromUserInput,
    buildDreamRefineFallbackSpecialist,
  };
}
