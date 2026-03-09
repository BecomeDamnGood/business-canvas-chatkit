export type DreamRuntimeViolationCode =
  | "technology_first"
  | "execution_first"
  | "internal_only"
  | "too_vague"
  | "task_first";

export type DreamRuntimePolicyApplyResult = {
  specialist: Record<string, unknown>;
  sourceViolationCodes: DreamRuntimeViolationCode[];
  candidateViolationCodes: DreamRuntimeViolationCode[];
  candidateShapeValid: boolean;
  requiresRepair: boolean;
  repairSeed: string;
  canStage: boolean;
  suppressWordingChoice: boolean;
};

const TECHNOLOGY_FIRST_PATTERN =
  /\b(ai|artificial intelligence|kunstmatige intelligentie|software|app|platform|tool|tools|technology|technologie|automation|automatisering|algorithm|algoritme)\b/i;
const EXECUTION_FIRST_PATTERN =
  /\b(thanks to our|using our|with our|via our|dankzij|met onze|via ons|door onze)\b/i;
const INTERNAL_ONLY_PATTERN =
  /\b(employee|employees|team|teams|culture|staff|medewerker|medewerkers|teamleden|cultuur)\b/i;
const EXTERNAL_EFFECT_PATTERN =
  /\b(people|person|customers|customer|clients|communities|society|market|sector|wereld|mensen|klanten|klant|gemeenschappen|samenleving|markt|sector)\b/i;
const TOO_VAGUE_PATTERN =
  /\b(innovative|innovation|sustainable|equality|equal|inclusive|impactful|duurzaam|duurzaamheid|gelijk|gelijke|inclusief|impactvol|innovatief)\b/i;
const TASK_FIRST_PATTERN =
  /\b(people|mensen)\b.{0,48}\b(can|kunnen|able|zonder|without)\b/i;
const DREAM_LINE_PATTERN =
  /\b(dreams of a world|dreams of a future|droomt van een wereld|droomt van een toekomst)\b/i;

function normalizeComparable(raw: unknown): string {
  return String(raw || "")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeDreamLine(raw: unknown): boolean {
  const value = normalizeComparable(raw);
  if (!value) return false;
  if (value.includes("?")) return false;
  if (value.startsWith("ACTION_") || value.startsWith("__ROUTE__")) return false;
  return DREAM_LINE_PATTERN.test(value);
}

export function isStageableDreamCandidate(raw: unknown): boolean {
  const value = normalizeComparable(raw);
  if (!value) return false;
  if (!looksLikeDreamLine(value)) return false;
  const numberedLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+[\).]\s+/.test(line));
  if (numberedLines.length > 0) return false;
  const bulletLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^[\-*•]\s+/.test(line));
  if (bulletLines.length > 0) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 7) return false;
  if (words.length > 70) return false;
  const sentenceCount = value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
  if (sentenceCount < 1 || sentenceCount > 3) return false;
  return true;
}

export function detectDreamRuntimeViolations(raw: unknown): DreamRuntimeViolationCode[] {
  const value = normalizeComparable(raw);
  if (!value) return [];
  const violations: DreamRuntimeViolationCode[] = [];
  const hasTechnology = TECHNOLOGY_FIRST_PATTERN.test(value);
  const hasExecutionCue = EXECUTION_FIRST_PATTERN.test(value);
  if (hasTechnology) violations.push("technology_first");
  if (hasExecutionCue) violations.push("execution_first");
  if (INTERNAL_ONLY_PATTERN.test(value) && !EXTERNAL_EFFECT_PATTERN.test(value)) {
    violations.push("internal_only");
  }
  const words = value.split(/\s+/).filter(Boolean);
  if (TOO_VAGUE_PATTERN.test(value) && words.length <= 18) {
    violations.push("too_vague");
  }
  if (TASK_FIRST_PATTERN.test(value)) {
    violations.push("task_first");
  }
  return Array.from(new Set(violations));
}

function pickRepairSeed(params: {
  candidateValue: string;
  sourceValue: string;
  currentValue: string;
}): string {
  const candidates = [params.candidateValue, params.sourceValue, params.currentValue];
  for (const candidate of candidates) {
    const value = normalizeComparable(candidate);
    if (value) return value;
  }
  return "";
}

export function applyDreamRuntimePolicy(params: {
  specialist: Record<string, unknown>;
  userMessage?: string;
  currentValue?: string;
}): DreamRuntimePolicyApplyResult {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? { ...params.specialist }
    : {};
  const sourceValue = looksLikeDreamLine(params.userMessage) ? normalizeComparable(params.userMessage) : "";
  const candidateValue = normalizeComparable(
    specialist.dream || specialist.refined_formulation || ""
  );
  const currentValue = normalizeComparable(params.currentValue || "");
  const sourceViolationCodes = detectDreamRuntimeViolations(sourceValue);
  const candidateViolationCodes = detectDreamRuntimeViolations(candidateValue);
  const candidateShapeValid = candidateValue ? isStageableDreamCandidate(candidateValue) : true;
  const effectiveViolations =
    sourceViolationCodes.length > 0 ? sourceViolationCodes : candidateViolationCodes;
  // A canonically phrased Dream may still need refinement feedback, but that must not
  // prevent provisional staging once the line is structurally valid as a Dream sentence.
  const canStage = candidateValue ? candidateShapeValid : true;
  const requiresRepair = Boolean(candidateValue) && (!candidateShapeValid || candidateViolationCodes.length > 0);
  const repairSeed = pickRepairSeed({
    candidateValue,
    sourceValue,
    currentValue,
  });
  const suppressWordingChoice =
    sourceViolationCodes.length > 0 || candidateViolationCodes.length > 0;

  const nextSpecialist: Record<string, unknown> = {
    ...specialist,
    __dream_policy_violation_codes: effectiveViolations,
    __dream_policy_can_stage: canStage ? "true" : "false",
    __dream_policy_requires_repair: requiresRepair ? "true" : "false",
    __dream_policy_repair_seed: repairSeed,
    __dream_policy_skip_wording_choice: suppressWordingChoice ? "true" : "false",
  };

  return {
    specialist: nextSpecialist,
    sourceViolationCodes,
    candidateViolationCodes,
    candidateShapeValid,
    requiresRepair,
    repairSeed,
    canStage,
    suppressWordingChoice,
  };
}
