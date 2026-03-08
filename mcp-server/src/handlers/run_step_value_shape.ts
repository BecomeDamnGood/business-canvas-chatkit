import { isStageableDreamCandidate } from "../steps/dream_runtime_policy.js";

function normalizeCandidateSurface(raw: unknown): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

const EXAMPLE_WORD_RE =
  /\b(example|examples|voorbeeld|voorbeelden|beispiel|beispiele|ejemplo|ejemplos|exemple|exemples|esempio|esempi)\b/i;
const STEP_HINT_RE =
  /\b(role|rol|dream|droom|purpose|doel|big\s*why|target\s*group|doelgroep|entity|strategie|strategy|products?|services?|spelregels?|rules?)\b/i;
const INTRO_LEAD_RE =
  /^(here(?:\s+are|\s+is)?|hier\s+zijn|voici|hier\s+sind|ecco|aqu[ií]\s+(?:hay|est[aá]n)|estos?\s+son)\b/i;
const CHOICE_HINT_RE =
  /\b(choose|kies|select|w[aä]hl|chois|scegli|option|optie|click|klik|for me|voor mij)\b/i;
const NUMBERED_EXAMPLES_LEAD_RE =
  /^(?:\d+|one|two|three|een|twee|drie|un|deux|trois|uno|dos|tres|ein|zwei|drei)\b.{0,24}\b(example|examples|voorbeeld|voorbeelden|beispiel|beispiele|ejemplo|ejemplos|exemple|exemples|esempio|esempi)\b/i;

export function looksLikeExamplesFramingLine(raw: unknown): boolean {
  const text = normalizeCandidateSurface(raw);
  if (!text) return false;
  const lower = text.toLowerCase();
  const endsWithColon = /:\s*$/.test(text);
  const hasExampleWord = EXAMPLE_WORD_RE.test(lower);
  const hasStepHint = STEP_HINT_RE.test(lower);
  const hasIntroLead = INTRO_LEAD_RE.test(lower);
  const hasChoiceHint = CHOICE_HINT_RE.test(lower);
  const hasNumberedExamplesLead = NUMBERED_EXAMPLES_LEAD_RE.test(lower);

  if (hasExampleWord && hasIntroLead) return true;
  if (hasNumberedExamplesLead && hasStepHint) return true;
  if (endsWithColon && hasStepHint && (hasExampleWord || hasIntroLead)) return true;
  if (hasExampleWord && hasChoiceHint && hasStepHint) return true;
  return false;
}

export function isValidStepValueForStorage(stepId: string, raw: unknown): boolean {
  const value = normalizeCandidateSurface(raw);
  if (!value) return false;
  if (stepId !== "step_0" && stepId !== "presentation" && looksLikeExamplesFramingLine(value)) return false;
  if (stepId === "dream") return isStageableDreamCandidate(value);
  return true;
}
