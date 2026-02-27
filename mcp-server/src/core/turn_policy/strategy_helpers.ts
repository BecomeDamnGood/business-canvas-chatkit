import type { CanvasState } from "../state.js";

type UiStringResolver = (state: CanvasState, key: string, fallback: string) => string;
type CompanyNameResolver = (state: CanvasState) => string;
type ProvisionalResolver = (state: CanvasState, stepId: string) => string;

function comparableText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStatements(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    const key = comparableText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function parseStrategyStatementsFromText(raw: string): string[] {
  const text = String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/<[^>]*>/g, " ")
    .trim();
  if (!text) return [];
  const normalizedLines = text
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^your current strategy for\b/i.test(line))
    .filter((line) => !/^the current strategy of\b/i.test(line))
    .filter((line) => !/^you now have \d+\s+focus points?/i.test(line))
    .filter((line) => !/^i strongly advice you/i.test(line));
  if (normalizedLines.length >= 2) return dedupeStatements(normalizedLines);

  const compact = normalizedLines.join(" ").replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const bulletLike = compact
    .split(/\s*[•]\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (bulletLike.length >= 2) return dedupeStatements(bulletLike);

  const semicolonParts = compact
    .split(/\s*;\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (semicolonParts.length >= 2) return dedupeStatements(semicolonParts);

  const sentenceParts = compact
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (sentenceParts.length >= 2) return dedupeStatements(sentenceParts);

  return dedupeStatements([compact]);
}

function strategySummaryLine(state: CanvasState, count: number, uiStringFromState: UiStringResolver): string {
  const template = uiStringFromState(
    state,
    "strategy.focuspoints.count.template",
    "You now have {0} focus points within your strategy. I advise you to formulate at least 4 but maximum 7 focus points."
  );
  const line = String(template || "").replace("{0}", String(count)).trim();
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

function strategyOverflowWarningLine(state: CanvasState, uiStringFromState: UiStringResolver): string {
  const template = uiStringFromState(
    state,
    "strategy.focuspoints.warning.template",
    "I strongly advice you to only add a maximum of 7 focus points. can I consolidate this for you?"
  );
  const line = String(template || "").trim();
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

function strategyCurrentHeading(
  state: CanvasState,
  uiStringFromState: UiStringResolver,
  companyNameForPrompt: CompanyNameResolver
): string {
  const template = uiStringFromState(
    state,
    "strategy.current.template",
    "Your current Strategy for {0} is:"
  );
  const line = String(template || "")
    .replace("{0}", companyNameForPrompt(state))
    .trim();
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

export function buildStrategyContextBlock(
  state: CanvasState,
  statements: string[],
  deps: {
    uiStringFromState: UiStringResolver;
    companyNameForPrompt: CompanyNameResolver;
  }
): string {
  const deduped = dedupeStatements(statements);
  if (deduped.length === 0) return "";
  const parts: string[] = [strategySummaryLine(state, deduped.length, deps.uiStringFromState)];
  if (deduped.length > 7) {
    parts.push(strategyOverflowWarningLine(state, deps.uiStringFromState));
  }
  parts.push(strategyCurrentHeading(state, deps.uiStringFromState, deps.companyNameForPrompt));
  parts.push(...deduped.map((line) => `- ${line}`));
  return parts.join("\n");
}

export function extractStatementCount(
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): number {
  const currentStatements = Array.isArray(specialist.statements) ? specialist.statements : [];
  if (currentStatements.length) return currentStatements.length;
  const prevStatements = Array.isArray(prev.statements) ? prev.statements : [];
  return prevStatements.length;
}

export function strategyStatementsFromSources(
  state: CanvasState,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>,
  deps: {
    provisionalForStep: ProvisionalResolver;
  }
): string[] {
  const specialistStatements = Array.isArray(specialist.statements)
    ? (specialist.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (specialistStatements.length > 0) return dedupeStatements(specialistStatements);

  const prevStatements = Array.isArray(prev.statements)
    ? (prev.statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (prevStatements.length > 0) return dedupeStatements(prevStatements);

  const candidates = [
    String((specialist as any).strategy || "").trim(),
    String((specialist as any).refined_formulation || "").trim(),
    String((prev as any).strategy || "").trim(),
    String((prev as any).refined_formulation || "").trim(),
    deps.provisionalForStep(state, "strategy"),
    String((state as any).strategy_final || "").trim(),
  ];
  for (const candidate of candidates) {
    const parsed = parseStrategyStatementsFromText(candidate);
    if (parsed.length > 0) return parsed;
  }
  return [];
}
