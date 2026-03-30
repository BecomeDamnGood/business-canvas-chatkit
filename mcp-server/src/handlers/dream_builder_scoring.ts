import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";
import type { CanvasState } from "../core/state.js";
import { asRecord, isTrueFlag, readStringArray } from "./run_step_type_guards.js";

export type DreamBuilderScoringCluster = {
  theme: string;
  statement_indices: number[];
};

function normalizedThemeStem(theme: string): string {
  return String(theme || "")
    .trim()
    .toLowerCase()
    .replace(/\s*\d+\s*$/g, "")
    .replace(/[\s._\-:]+$/g, "")
    .trim();
}

function hasNumericSuffix(theme: string): boolean {
  return /\d+\s*$/.test(String(theme || "").trim());
}

function hasGenericDreamBuilderClusterThemes(
  clustersRaw: unknown[],
  state?: CanvasState
): boolean {
  const themes = clustersRaw
    .map((cluster) => String(asRecord(cluster).theme || "").trim())
    .filter(Boolean);
  if (themes.length === 0) return true;

  const categoryTemplate = state
    ? resolveUiStringForState(state, "scoring.categoryFallback", "").trim()
    : "";
  if (categoryTemplate) {
    const exactFallbackMatch = themes.every((theme, index) => {
      const localized = String(categoryTemplate || "").replace("{0}", String(index + 1)).trim();
      return localized && theme === localized;
    });
    if (exactFallbackMatch) return true;
  }

  const numericThemes = themes.filter((theme) => hasNumericSuffix(theme));
  if (numericThemes.length < 2) return false;
  const stems = numericThemes.map((theme) => normalizedThemeStem(theme)).filter(Boolean);
  return stems.length === numericThemes.length && new Set(stems).size === 1;
}

export function hasValidDreamBuilderScoringContract(
  specialistResult: Record<string, unknown>,
  minimumStatements: number,
  state?: CanvasState
): boolean {
  if (!isTrueFlag(specialistResult.scoring_phase)) return false;
  const statements = readStringArray(specialistResult.statements);
  if (statements.length < minimumStatements) return false;
  const clustersRaw = Array.isArray(specialistResult.clusters)
    ? (specialistResult.clusters as unknown[])
    : [];
  if (clustersRaw.length === 0) return false;
  const structurallyValid = clustersRaw.every((cluster) => {
    const record = asRecord(cluster);
    const theme = String(record.theme || "").trim();
    const indices = Array.isArray(record.statement_indices)
      ? (record.statement_indices as unknown[])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0)
      : [];
    return Boolean(theme) && indices.length > 0;
  });
  if (!structurallyValid) return false;
  if (hasGenericDreamBuilderClusterThemes(clustersRaw, state)) return false;
  return true;
}

export function buildDreamBuilderScoringRepairRetrySpecialist(params: {
  specialistResult: Record<string, unknown>;
  state: CanvasState;
  statements: string[];
}): Record<string, unknown> {
  const retryMessage = resolveUiStringForState(
    params.state,
    "scoring.themeRepairFailed.message",
    "I couldn't safely group these statements into meaningful themes yet."
  ).trim();
  const retryQuestion = resolveUiStringForState(
    params.state,
    "scoring.themeRepairFailed.question",
    "Send any message and I'll try clustering them again."
  ).trim();
  return {
    ...params.specialistResult,
    action: "ASK",
    message: retryMessage || String(params.specialistResult.message || "").trim(),
    question: retryQuestion,
    feedback_reason_text: "",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    statements: readStringArray(params.statements),
    scoring_phase: "false",
    clusters: [],
  };
}
