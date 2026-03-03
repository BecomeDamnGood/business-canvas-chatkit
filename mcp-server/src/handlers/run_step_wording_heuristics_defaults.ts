import { STEP_0_ID } from "../steps/step_0_validation.js";
import { DREAM_STEP_ID } from "../steps/dream.js";
import { PURPOSE_STEP_ID } from "../steps/purpose.js";
import { BIGWHY_STEP_ID } from "../steps/bigwhy.js";
import { ROLE_STEP_ID } from "../steps/role.js";
import { ENTITY_STEP_ID } from "../steps/entity.js";
import { STRATEGY_STEP_ID } from "../steps/strategy.js";
import { TARGETGROUP_STEP_ID } from "../steps/targetgroup.js";
import { PRODUCTSSERVICES_STEP_ID } from "../steps/productsservices.js";
import { RULESOFTHEGAME_STEP_ID } from "../steps/rulesofthegame.js";
import { PRESENTATION_STEP_ID } from "../steps/presentation.js";
import {
  createRunStepWordingHeuristicHelpers,
  normalizeLightUserInput,
  normalizeListUserInput,
  normalizeUserInputAgainstSuggestion,
  tokenizeWords,
  isMaterialRewriteCandidate,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
  parseListItems,
  splitSentenceItems,
  canonicalizeComparableText,
  areEquivalentWordingVariants,
} from "./run_step_wording_heuristics.js";

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
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

function fieldForStep(stepId: string): string {
  if (stepId === STEP_0_ID) return "step_0";
  if (stepId === DREAM_STEP_ID) return "dream";
  if (stepId === PURPOSE_STEP_ID) return "purpose";
  if (stepId === BIGWHY_STEP_ID) return "bigwhy";
  if (stepId === ROLE_STEP_ID) return "role";
  if (stepId === ENTITY_STEP_ID) return "entity";
  if (stepId === STRATEGY_STEP_ID) return "strategy";
  if (stepId === TARGETGROUP_STEP_ID) return "targetgroup";
  if (stepId === PRODUCTSSERVICES_STEP_ID) return "productsservices";
  if (stepId === RULESOFTHEGAME_STEP_ID) return "rulesofthegame";
  if (stepId === PRESENTATION_STEP_ID) return "presentation_brief";
  return "";
}

const wordingHeuristicHelpers = createRunStepWordingHeuristicHelpers({
  entityStepId: ENTITY_STEP_ID,
  dreamStepId: DREAM_STEP_ID,
  roleStepId: ROLE_STEP_ID,
  fieldForStep,
  normalizeEntityPhrase,
  ensureSentenceEnd,
});

export const pickDualChoiceSuggestion = wordingHeuristicHelpers.pickDualChoiceSuggestion;
export const pickDreamSuggestionFromPreviousState = wordingHeuristicHelpers.pickDreamSuggestionFromPreviousState;
export const pickRoleSuggestionFromPreviousState = wordingHeuristicHelpers.pickRoleSuggestionFromPreviousState;

export {
  normalizeLightUserInput,
  normalizeListUserInput,
  normalizeUserInputAgainstSuggestion,
  tokenizeWords,
  isMaterialRewriteCandidate,
  isClearlyGeneralOfftopicInput,
  shouldTreatAsStepContributingInput,
  parseListItems,
  splitSentenceItems,
  canonicalizeComparableText,
  areEquivalentWordingVariants,
};
