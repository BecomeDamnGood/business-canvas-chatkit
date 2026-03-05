import {
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
} from "./rulesofthegame.js";
import { UI_STRINGS_SOURCE_EN } from "../i18n/ui_strings_defaults.js";

export const RULESOFTHEGAME_MIN_RULES = 3;
export const RULESOFTHEGAME_MAX_RULES = 5;

export type RulesRuntimeGateResult = {
  items: string[];
  count: number;
  hasVisibleValue: boolean;
  hasExternalRule: boolean;
  canConfirm: boolean;
};

export type RulesRuntimePolicyApplyResult = {
  specialist: Record<string, unknown>;
  userItems: string[];
  suggestionItems: string[];
  requiresChoice: boolean;
  hasExternalRule: boolean;
  overflow: boolean;
};

const EXTERNAL_FOCUS_PATTERN =
  /\b(gratis|free|iedereen|everyone|customer|customers|klant|klanten|market|markt|competitor|concurrent|price|prijzen|pricing|korting|discount)\b/i;

function dedupeRules(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function parseRulesFromText(raw: unknown): string[] {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return [];
  const lines = text
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return dedupeRules(lines);
  const compact = String(lines[0] || "").trim();
  if (!compact) return [];
  const semicolonParts = compact
    .split(/\s*;\s*/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (semicolonParts.length > 1) return dedupeRules(semicolonParts);
  return dedupeRules([compact]);
}

function normalizeRulesArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return dedupeRules(
    raw
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
      .filter(Boolean)
  );
}

function looksExternalRule(rule: string): boolean {
  return EXTERNAL_FOCUS_PATTERN.test(String(rule || ""));
}

function uiText(
  uiStrings: Record<string, unknown>,
  key: string,
  fallback = ""
): string {
  const fromState = String(uiStrings[key] || "").trim();
  if (fromState) return fromState;
  const fromDefault = String((UI_STRINGS_SOURCE_EN as Record<string, unknown>)[key] || "").trim();
  if (fromDefault) return fromDefault;
  return String(fallback || "").trim();
}

function buildInternalSuggestion(
  rule: string,
  uiStrings: Record<string, unknown>
): string {
  const text = String(rule || "").trim();
  const fallback = uiText(uiStrings, "rules.policy.internal.suggestion.generic");
  if (!text) {
    return fallback;
  }
  if (/\b(gratis|free|price|prijzen|pricing|korting|discount)\b/i.test(text)) {
    return uiText(
      uiStrings,
      "rules.policy.internal.suggestion.pricing"
    );
  }
  return fallback;
}

function joinMessage(base: string, extra: string): string {
  const baseTrimmed = String(base || "").trim();
  const extraTrimmed = String(extra || "").trim();
  if (!baseTrimmed) return extraTrimmed;
  if (!extraTrimmed) return baseTrimmed;
  return `${baseTrimmed}\n\n${extraTrimmed}`;
}

function parseItemsFromPrioritySources(params: {
  statements?: unknown;
  acceptedValue?: unknown;
  visibleValue?: unknown;
}): string[] {
  const fromStatements = normalizeRulesArray(params.statements);
  if (fromStatements.length > 0) return fromStatements;
  const fromAccepted = parseRulesFromText(params.acceptedValue);
  if (fromAccepted.length > 0) return fromAccepted;
  return parseRulesFromText(params.visibleValue);
}

export function evaluateRulesRuntimeGate(params: {
  acceptedOutput: boolean;
  acceptedValue: unknown;
  visibleValue: unknown;
  statements: unknown;
  wordingChoicePending: boolean;
}): RulesRuntimeGateResult {
  const items = parseItemsFromPrioritySources({
    statements: params.statements,
    acceptedValue: params.acceptedValue,
    visibleValue: params.visibleValue,
  });
  const count = items.length;
  const hasVisibleValue = count > 0 || Boolean(String(params.visibleValue || "").trim());
  const hasExternalRule = items.some((line) => looksExternalRule(line));
  const canConfirm =
    params.acceptedOutput &&
    !params.wordingChoicePending &&
    count >= RULESOFTHEGAME_MIN_RULES &&
    count <= RULESOFTHEGAME_MAX_RULES &&
    !hasExternalRule;
  return {
    items,
    count,
    hasVisibleValue,
    hasExternalRule,
    canConfirm,
  };
}

export function applyRulesRuntimePolicy(params: {
  specialist: Record<string, unknown>;
  previousStatements?: string[];
  uiStrings?: Record<string, unknown>;
}): RulesRuntimePolicyApplyResult {
  const specialist = params.specialist && typeof params.specialist === "object"
    ? { ...params.specialist }
    : {};
  const policyAlreadyApplied = String((specialist as Record<string, unknown>).__rules_policy_applied || "").trim() === "true";
  const previousStatements = dedupeRules(
    Array.isArray(params.previousStatements)
      ? params.previousStatements.map((line) => String(line || "").trim()).filter(Boolean)
      : []
  );
  const uiStrings =
    params.uiStrings && typeof params.uiStrings === "object"
      ? params.uiStrings
      : {};
  const sourceItems = parseItemsFromPrioritySources({
    statements: specialist.statements,
    acceptedValue: specialist.rulesofthegame,
    visibleValue: specialist.refined_formulation,
  });
  const userItems = sourceItems.length > 0 ? sourceItems : previousStatements;
  if (userItems.length === 0) {
    return {
      specialist: {
        ...specialist,
        __rules_policy_applied: "true",
      },
      userItems: [],
      suggestionItems: [],
      requiresChoice: false,
      hasExternalRule: false,
      overflow: false,
    };
  }

  const processed = postProcessRulesOfTheGame(userItems, RULESOFTHEGAME_MAX_RULES);
  const overflow = userItems.length > RULESOFTHEGAME_MAX_RULES;
  const hasExternalRule = userItems.some((line) => looksExternalRule(line));

  const internalized = userItems.map((line) =>
    looksExternalRule(line) ? buildInternalSuggestion(line, uiStrings) : line
  );
  const suggestionItemsBase = hasExternalRule
    ? postProcessRulesOfTheGame(internalized, RULESOFTHEGAME_MAX_RULES).finalRules
    : processed.finalRules;
  const suggestionItems = dedupeRules(suggestionItemsBase);
  const userBullets = buildRulesOfTheGameBullets(userItems);
  const suggestionBullets = buildRulesOfTheGameBullets(suggestionItems);

  if (!policyAlreadyApplied && (overflow || hasExternalRule) && suggestionItems.length > 0) {
    const overflowMessage = uiText(
      uiStrings,
      "rules.policy.overflow.rationale"
    );
    const externalMessage = uiText(
      uiStrings,
      "rules.policy.external.rationale"
    );
    const choiceMessage = uiText(
      uiStrings,
      "rules.policy.choice.rationale"
    );

    const rationale = [
      overflow ? overflowMessage : "",
      hasExternalRule ? externalMessage : "",
      choiceMessage,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const pendingSpecialist: Record<string, unknown> = {
      ...specialist,
      message: joinMessage(String(specialist.message || ""), rationale),
      question: "",
      refined_formulation: "",
      rulesofthegame: "",
      statements: userItems,
      wording_choice_pending: "true",
      wording_choice_selected: "",
      wording_choice_mode: "list",
      wording_choice_target_field: "rulesofthegame",
      wording_choice_list_semantics: "full",
      wording_choice_user_raw: userBullets,
      wording_choice_user_normalized: userBullets,
      wording_choice_user_items: userItems,
      wording_choice_suggestion_items: suggestionItems,
      wording_choice_base_items: [],
      wording_choice_agent_current: suggestionBullets,
      wording_choice_variant: "",
      wording_choice_user_label: "",
      wording_choice_suggestion_label: "",
      feedback_reason_key: "",
      feedback_reason_text: rationale,
      __rules_policy_applied: "true",
    };

    return {
      specialist: pendingSpecialist,
      userItems,
      suggestionItems,
      requiresChoice: true,
      hasExternalRule,
      overflow,
    };
  }

  const finalItems = suggestionItems.length > 0 ? suggestionItems : processed.finalRules;
  const bullets = buildRulesOfTheGameBullets(finalItems);

  const acceptedSpecialist: Record<string, unknown> = {
    ...specialist,
    statements: finalItems,
    refined_formulation: bullets,
    rulesofthegame: bullets,
    wording_choice_pending: "false",
    wording_choice_selected: "",
    wording_choice_mode: "",
    wording_choice_target_field: "",
    wording_choice_list_semantics: "delta",
    wording_choice_user_raw: "",
    wording_choice_user_normalized: "",
    wording_choice_user_items: [],
    wording_choice_suggestion_items: [],
    wording_choice_base_items: [],
    wording_choice_agent_current: "",
    wording_choice_variant: "",
    wording_choice_user_label: "",
    wording_choice_suggestion_label: "",
    feedback_reason_key: "",
    feedback_reason_text: "",
    __rules_policy_applied: "true",
  };

  return {
    specialist: acceptedSpecialist,
    userItems,
    suggestionItems: finalItems,
    requiresChoice: false,
    hasExternalRule,
    overflow,
  };
}
