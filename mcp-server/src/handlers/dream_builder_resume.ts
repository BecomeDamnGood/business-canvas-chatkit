type DreamTopCluster = { theme: string; average: number };

export type DreamBuilderResumeContext = {
  statements: string[];
  scoringStatements: string[];
  scores: number[][];
  topClusters: DreamTopCluster[];
  hasSavedScoreContext: boolean;
  hasReusableScoreContext: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
}

function readDreamScoreMatrix(value: unknown): number[][] {
  return Array.isArray(value)
    ? value
      .map((row) =>
        Array.isArray(row)
          ? row
            .map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : null))
            .filter((entry): entry is number => entry !== null)
          : []
      )
      .filter((row) => row.length > 0)
    : [];
}

function readDreamTopClusters(value: unknown): DreamTopCluster[] {
  return Array.isArray(value)
    ? value
      .map((entry) => {
        const record = asRecord(entry);
        const theme = String(record.theme || "").trim();
        const average = typeof record.average === "number" && Number.isFinite(record.average)
          ? record.average
          : null;
        if (!theme || average === null) return null;
        return { theme, average };
      })
      .filter((entry): entry is DreamTopCluster => Boolean(entry))
    : [];
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

export function getDreamBuilderResumeContext(state: Record<string, unknown> | null | undefined): DreamBuilderResumeContext {
  const stateRecord = asRecord(state);
  const canonicalStatements = readStringArray(stateRecord.dream_builder_statements);
  const scoringStatements = readStringArray(stateRecord.dream_scoring_statements);
  const lastStatements = readStringArray(asRecord(stateRecord.last_specialist_result).statements);
  const statements =
    canonicalStatements.length > 0
      ? canonicalStatements
      : scoringStatements.length > 0
        ? scoringStatements
        : lastStatements;
  const scores = readDreamScoreMatrix(stateRecord.dream_scores);
  const topClusters = readDreamTopClusters(stateRecord.dream_top_clusters);
  const hasSavedScoreContext =
    scoringStatements.length > 0 ||
    scores.length > 0 ||
    topClusters.length > 0 ||
    String(stateRecord.dream_awaiting_direction ?? "").trim() === "true";
  const hasReusableScoreContext =
    statements.length >= 20 &&
    topClusters.length > 0 &&
    (scoringStatements.length === 0 || sameStringArray(statements, scoringStatements)) &&
    (scores.length > 0 || topClusters.length > 0);

  return {
    statements,
    scoringStatements,
    scores,
    topClusters,
    hasSavedScoreContext,
    hasReusableScoreContext,
  };
}

export function shouldResumeDreamBuilderExercise(state: Record<string, unknown> | null | undefined): boolean {
  const resumeContext = getDreamBuilderResumeContext(state);
  return resumeContext.statements.length > 0 || resumeContext.hasReusableScoreContext;
}

export function dreamBuilderExerciseLabelKey(
  state: Record<string, unknown> | null | undefined
): "dreamBuilder.startExercise" | "dreamBuilder.resumeExercise" {
  return shouldResumeDreamBuilderExercise(state)
    ? "dreamBuilder.resumeExercise"
    : "dreamBuilder.startExercise";
}
