import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, MENU_LABEL_KEYS, labelKeyForMenuAction } from "./menu_contract.js";
import { getFinalFieldForStepId, type CanvasState } from "./state.js";
import { actionCodeToIntent } from "./actioncode_intent.js";
import type { RenderedAction, UiSingleValueContent } from "../contracts/ui_actions.js";
import {
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
  buildContractTextKeys,
} from "./ui_contract_matrix.js";
import { parseUiContractMenuForStep } from "./ui_contract_id.js";
import {
  buildStrategyContextBlock,
  extractStatementCount,
  strategyStatementsFromSources,
} from "./turn_policy/strategy_helpers.js";
import { UI_STRINGS_SOURCE_EN } from "../i18n/ui_strings_defaults.js";
import {
  evaluateRulesRuntimeGate,
  RULESOFTHEGAME_MAX_RULES,
  RULESOFTHEGAME_MIN_RULES,
} from "../steps/rulesofthegame_runtime_policy.js";
import { isStageableDreamCandidate } from "../steps/dream_runtime_policy.js";
import { isStructuredPresentationRecap } from "../handlers/run_step_presentation_recap.js";

export type TurnOutputStatus = "no_output" | "incomplete_output" | "valid_output";

export type TurnPolicyRenderParams = {
  stepId: string;
  state: CanvasState;
  specialist: Record<string, unknown>;
  previousSpecialist?: Record<string, unknown> | null;
};

export type TurnPolicyRenderResult = {
  status: TurnOutputStatus;
  confirmEligible: boolean;
  specialist: Record<string, unknown>;
  uiActionCodes: string[];
  uiActions: RenderedAction[];
  contractId: string;
  contractVersion: string;
  textKeys: string[];
};

const OFFTOPIC_STEP_LABEL_UI_KEY_BY_STEP: Record<string, string> = {
  dream: "offtopic.step.dream",
  purpose: "offtopic.step.purpose",
  bigwhy: "offtopic.step.bigwhy",
  role: "offtopic.step.role",
  entity: "offtopic.step.entity",
  strategy: "offtopic.step.strategy",
  targetgroup: "offtopic.step.targetgroup",
  productsservices: "offtopic.step.productsservices",
  rulesofthegame: "offtopic.step.rulesofthegame",
  presentation: "offtopic.step.presentation",
};

type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

function envFlagEnabled(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw);
}

function isConfirmGateAcceptedOnlyV1Enabled(): boolean {
  return envFlagEnabled("UI_CONFIRM_GATE_ACCEPTED_ONLY_V1", true);
}

function isStep0EscapeReadyGuardV1Enabled(): boolean {
  return envFlagEnabled("UI_STEP0_ESCAPE_READY_GUARD_V1", true);
}

function isSemanticInvariantsV1Enabled(): boolean {
  return envFlagEnabled("UI_SEMANTIC_INVARIANTS_V1", true);
}

function normalizeDreamRuntimeMode(raw: unknown): DreamRuntimeMode {
  const mode = String(raw || "").trim();
  if (mode === "builder_collect" || mode === "builder_scoring" || mode === "builder_refine") return mode;
  return "self";
}

function dreamRuntimeModeFromState(state: CanvasState): DreamRuntimeMode {
  return normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);
}

function provisionalForStep(state: CanvasState, stepId: string): string {
  const raw =
    (state as any).provisional_by_step && typeof (state as any).provisional_by_step === "object"
      ? ((state as any).provisional_by_step as Record<string, unknown>)
      : {};
  return String(raw[stepId] || "").trim();
}

function provisionalSourceForStep(state: CanvasState, stepId: string): string {
  const raw =
    (state as any).provisional_source_by_step && typeof (state as any).provisional_source_by_step === "object"
      ? ((state as any).provisional_source_by_step as Record<string, unknown>)
      : {};
  const source = String(raw[stepId] || "").trim();
  if (
    source === "user_input" ||
    source === "wording_pick" ||
    source === "action_route" ||
    source === "system_generated"
  ) {
    return source;
  }
  return "system_generated";
}

function isRenderableAcceptedValue(stepId: string, raw: unknown): boolean {
  const value = String(raw || "").trim();
  if (!value) return false;
  if (stepId === "dream") return isStageableDreamCandidate(value);
  if (stepId === "presentation") return isStructuredPresentationRecap(value);
  return true;
}

function isAcceptedProvisional(state: CanvasState, stepId: string): boolean {
  const provisional = provisionalForStep(state, stepId);
  if (!provisional) return false;
  if (!isRenderableAcceptedValue(stepId, provisional)) return false;
  const source = provisionalSourceForStep(state, stepId);
  return source === "user_input" || source === "wording_pick" || source === "action_route";
}

function isAcceptedOutput(stepId: string, state: CanvasState): boolean {
  const finalField = getFinalFieldForStepId(stepId);
  const committedFinal = finalField ? String((state as any)[finalField] || "").trim() : "";
  if (isRenderableAcceptedValue(stepId, committedFinal)) return true;
  return isAcceptedProvisional(state, stepId);
}

function acceptedCanonicalValueForStep(stepId: string, state: CanvasState): string {
  const finalField = getFinalFieldForStepId(stepId);
  const committedFinal = finalField ? String((state as any)[finalField] || "").trim() : "";
  if (isRenderableAcceptedValue(stepId, committedFinal)) return committedFinal;
  if (isAcceptedProvisional(state, stepId)) return provisionalForStep(state, stepId);
  return "";
}

function parseStep0Line(step0Line: string): { venture: string; name: string; status: string } {
  const ventureMatch = step0Line.match(/Venture:\s*([^|]+)/i);
  const nameMatch = step0Line.match(/Name:\s*([^|]+)/i);
  const statusMatch = step0Line.match(/Status:\s*(existing|starting)/i);
  return {
    venture: (ventureMatch?.[1] || "").trim(),
    name: (nameMatch?.[1] || "").trim(),
    status: (statusMatch?.[1] || "").trim().toLowerCase(),
  };
}

function isEscapeMenu(menuId: string): boolean {
  return menuId.endsWith("_MENU_ESCAPE");
}

function menuBelongsToStep(menuId: string, stepId: string): boolean {
  const actions = ACTIONCODE_REGISTRY.menus[menuId];
  if (!Array.isArray(actions) || actions.length === 0) return false;
  return actions.every((actionCode) => {
    const entry = ACTIONCODE_REGISTRY.actions[actionCode];
    const actionStep = String(entry?.step || "").trim();
    return actionStep === stepId || actionStep === "system";
  });
}

function normalizeChoiceLine(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function stripStructuredChoiceLinesForPrompt(promptRaw: string, state: CanvasState): string {
  const blockedSet = new Set(
    [
      uiStringFromState(state, "wordingChoiceInstruction", ""),
      uiStringFromState(state, "invariant.prompt.ask.default", ""),
      uiStringFromState(state, "generic.choicePrompt.shareOrOption", ""),
      uiStringFromState(state, "wording.choice.context.default", ""),
    ]
      .map((line) => normalizeChoiceLine(line))
      .filter(Boolean)
  );
  const kept = String(promptRaw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s*/.test(line))
    .filter((line) => !blockedSet.has(normalizeChoiceLine(line)));
  return kept.join("\n").trim();
}

function buildRenderedActions(
  menuId: string,
  actionCodes: string[],
  labels: string[],
  labelKeys: string[]
): RenderedAction[] {
  return actionCodes.map((code, idx) => {
    const entry = ACTIONCODE_REGISTRY.actions[code];
    const route = String(entry?.route || code).trim();
    return {
      id: `${code}:${idx + 1}`,
      label: String(labels[idx] || code).trim() || code,
      label_key: String(labelKeys[idx] || labelKeyForMenuAction(menuId, code, idx)).trim(),
      action_code: code,
      intent: actionCodeToIntent({ actionCode: code, route }),
      primary: idx === 0,
    };
  });
}

function isConfirmActionCode(actionCode: string): boolean {
  const entry = ACTIONCODE_REGISTRY.actions[actionCode];
  if (!entry) return false;
  if (Array.isArray(entry.flags) && entry.flags.includes("confirm")) return true;
  if (entry.route === "yes") return true;
  const upper = actionCode.toUpperCase();
  return upper.includes("_CONFIRM") || upper.includes("FINAL_CONTINUE");
}

const SINGLE_VALUE_CONFIRM_VISIBILITY_STEPS = new Set([
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "targetgroup",
]);

const SINGLE_VALUE_STRUCTURED_CONTENT_STEPS = new Set([
  ...SINGLE_VALUE_CONFIRM_VISIBILITY_STEPS,
  "dream",
]);

const PURPOSE_INTRO_VIDEO_MENU_IDS = new Set([
  "PURPOSE_MENU_INTRO",
  "PURPOSE_MENU_EXPLAIN",
  "PURPOSE_MENU_POST_ASK",
  "PURPOSE_MENU_EXAMPLES",
]);

function menuRequiresKnownOutput(menuId: string): boolean {
  const actions = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId]) ? ACTIONCODE_REGISTRY.menus[menuId] : [];
  if (actions.some((code) => isConfirmActionCode(code))) return true;
  return actions.some((code) => {
    const upper = String(code || "").trim().toUpperCase();
    return upper.includes("_REFINE_") || upper.includes("_POSTREFINE_");
  });
}

function isSemanticPurposeIntroVisibleState(params: {
  stepId: string;
  status: TurnOutputStatus;
  menuId: string;
  wordingPending: boolean;
}): boolean {
  if (params.stepId !== "purpose") return false;
  if (params.wordingPending) return false;
  if (params.status === "valid_output") return false;
  return PURPOSE_INTRO_VIDEO_MENU_IDS.has(String(params.menuId || "").trim());
}

function renderModeForStep(state: CanvasState, stepId: string): "menu" | "no_buttons" {
  const phaseMap =
    (state as any).__ui_render_mode_by_step && typeof (state as any).__ui_render_mode_by_step === "object"
      ? ((state as any).__ui_render_mode_by_step as Record<string, unknown>)
      : {};
  return String(phaseMap[stepId] || "").trim() === "no_buttons" ? "no_buttons" : "menu";
}

function companyNameForPrompt(state: CanvasState): string {
  const raw = String((state as any).business_name ?? "").trim();
  if (!raw || raw === "TBD") {
    return uiStringFromState(state, "offtopic.companyFallback", uiDefaultString("offtopic.companyFallback"));
  }
  return raw;
}

function uiDefaultString(key: string, fallback = ""): string {
  const value = String(UI_STRINGS_SOURCE_EN[key] || "").trim();
  return value || String(fallback || "").trim();
}

function uiStringFromState(state: CanvasState, key: string, fallback: string): string {
  const map = (state as any)?.ui_strings;
  if (map && typeof map === "object") {
    const candidate = String((map as Record<string, unknown>)[key] ?? "").trim();
    if (candidate) return candidate;
  }
  return fallback;
}

function formatIndexedTemplate(templateRaw: string, values: string[]): string {
  return String(templateRaw || "").replace(/\{(\d+)\}/g, (_match, rawIdx: string) => {
    const idx = Number(rawIdx);
    return Number.isInteger(idx) && idx >= 0 && idx < values.length ? String(values[idx] || "") : "";
  });
}

function recapLabel(state: CanvasState, key: "recap.label.venture" | "recap.label.name" | "recap.label.status", fallback: string): string {
  return uiStringFromState(state, key, uiDefaultString(key, fallback));
}

function contractHeadlineForState(params: {
  state: CanvasState;
  stepId: string;
  status: TurnOutputStatus;
  stepLabel: string;
  companyName: string;
  hasOptions: boolean;
  strategyStatementCount?: number;
}): string {
  if (params.stepId === "strategy" && Number(params.strategyStatementCount || 0) >= 1) {
    return uiStringFromState(
      params.state,
      "contract.headline.strategy.moreFocus",
      uiDefaultString("contract.headline.strategy.moreFocus")
    );
  }
  const modeKey = params.status === "no_output" ? "define" : "refine";
  const modeTemplateKey = `contract.headline.${modeKey}.${params.hasOptions ? "withOptions" : "withoutOptions"}`;
  const modeTemplate = uiStringFromState(
    params.state,
    modeTemplateKey,
    uiDefaultString(modeTemplateKey)
  );
  return formatIndexedTemplate(modeTemplate, [params.stepLabel, params.companyName]).trim();
}

function interactiveAskPromptFallback(state: CanvasState, stepId: string): string {
  if (stepId === "step_0") {
    return uiStringFromState(
      state,
      "step0.question.initial",
      uiDefaultString("step0.question.initial")
    );
  }
  return uiStringFromState(
    state,
    "invariant.prompt.ask.default",
    uiDefaultString("invariant.prompt.ask.default")
  );
}

function offTopicStepLabel(stepId: string, state: CanvasState): string {
  const key = OFFTOPIC_STEP_LABEL_UI_KEY_BY_STEP[stepId] || "";
  if (key) {
    const fallback = uiDefaultString(key);
    return uiStringFromState(state, key, fallback);
  }
  const titleFallback = uiDefaultString(`offtopic.step.${stepId}`);
  if (titleFallback) return titleFallback;
  return String(stepId || "").trim();
}

function offTopicCompanyName(state: CanvasState): string {
  const fromState = String((state as any).business_name || "").trim();
  if (fromState && fromState !== "TBD") return fromState;
  const step0Final = String((state as any).step_0_final || "").trim();
  if (step0Final) {
    const parsed = parseStep0Line(step0Final);
    const parsedName = String(parsed?.name || "").trim();
    if (parsedName && parsedName !== "TBD") return parsedName;
  }
  return uiStringFromState(state, "offtopic.companyFallback", uiDefaultString("offtopic.companyFallback"));
}

function offTopicCurrentContextHeading(stepId: string, state: CanvasState): string {
  if (stepId === "rulesofthegame") {
    const key = "sectionTitle.rulesofthegameOf";
    const template = uiStringFromState(state, key, uiDefaultString(key));
    const rendered = String(template || "").replace(/\{0\}/g, offTopicCompanyName(state)).trim();
    if (!rendered) return "";
    const base = rendered.replace(/[.!?。！？]+$/g, "").replace(/\s*:\s*$/g, "").trim();
    return base ? `${base}:` : "";
  }
  const template = uiStringFromState(
    state,
    "offtopic.current.template",
    uiDefaultString("offtopic.current.template")
  );
  const rendered = formatIndexedTemplate(template, [
    offTopicStepLabel(stepId, state),
    offTopicCompanyName(state),
  ]).trim();
  if (!rendered) return "";
  const base = rendered.replace(/[.!?]+$/g, "").replace(/\s*:\s*$/g, "").trim();
  return base ? `${base}:` : "";
}

function autoSuggestHeading(stepId: string, state: CanvasState): string {
  const template = uiStringFromState(
    state,
    "autosuggest.prefix.template",
    uiDefaultString("autosuggest.prefix.template")
  );
  const stepLabel = offTopicStepLabel(stepId, state);
  const rendered = String(template || "").includes("{0}")
    ? String(template || "").replace(/\{0\}/g, stepLabel).trim()
    : `${String(template || "").trim()} ${stepLabel}`.trim();
  if (!rendered) return "";
  return /:\s*$/.test(rendered) ? rendered : `${rendered}:`;
}

function hasCommittedAcceptedValue(stepId: string, state: CanvasState): boolean {
  const finalField = getFinalFieldForStepId(stepId);
  const committedFinal = finalField ? String((state as any)[finalField] || "").trim() : "";
  return isRenderableAcceptedValue(stepId, committedFinal);
}

function shouldUseCurrentValueHeading(stepId: string, state: CanvasState): boolean {
  if (hasCommittedAcceptedValue(stepId, state)) return true;
  return provisionalSourceForStep(state, stepId) === "wording_pick";
}

function singleValueConfirmHeading(stepId: string, state: CanvasState): string {
  return shouldUseCurrentValueHeading(stepId, state)
    ? offTopicCurrentContextHeading(stepId, state)
    : autoSuggestHeading(stepId, state);
}

function singleValueConfirmCanonicalMessage(stepId: string, state: CanvasState, canonicalValue: string): string {
  const canonical = String(canonicalValue || "").trim();
  if (!canonical) return "";
  const heading = singleValueConfirmHeading(stepId, state);
  if (!heading) return canonical;
  return `${heading}\n${canonical}`.trim();
}

function isDreamBuilderSingleValueContext(stepId: string, state: CanvasState, specialist: Record<string, unknown>): boolean {
  if (stepId !== "dream") return false;
  const runtimeMode = normalizeDreamRuntimeMode((state as any).__dream_runtime_mode);
  if (runtimeMode !== "self") return true;
  const activeSpecialist = String((state as any).active_specialist || "").trim();
  if (activeSpecialist === "DreamExplainer") return true;
  if (String((specialist as any).suggest_dreambuilder || "").trim() === "true") return true;
  const contractId = String((specialist as any).ui_contract_id || "").trim();
  const menuId = parseUiContractMenuForStep(contractId, stepId);
  return menuId.startsWith("DREAM_EXPLAINER_MENU_");
}

function canonicalParagraphBlocks(raw: string): string[] {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => String(block || "").trim())
    .filter(Boolean);
}

function sentenceBoundaryBlocks(raw: string): string[] {
  return String(raw || "")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function stripLeadingFeedbackSentence(block: string, feedbackReasonText: string): string {
  const normalizedFeedback = comparableText(feedbackReasonText);
  if (!normalizedFeedback) return String(block || "").trim();
  const sentences = sentenceBoundaryBlocks(block);
  if (sentences.length === 0) return String(block || "").trim();
  const firstSentence = String(sentences[0] || "").trim();
  if (comparableText(firstSentence) !== normalizedFeedback) return String(block || "").trim();
  return sentences.slice(1).join(" ").trim();
}

function isSingleValueCanonicalBlock(block: string, heading: string, canonicalValue: string): boolean {
  const blockKey = comparableText(block);
  const canonicalKey = comparableText(canonicalValue);
  if (!blockKey || !canonicalKey) return false;
  if (blockKey === canonicalKey) return true;
  const headingKey = comparableText(heading);
  if (!headingKey) return false;
  const lines = String(block || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const firstKey = comparableText(lines[0] || "");
    const secondKey = comparableText(lines[1] || "");
    if (firstKey === headingKey && secondKey === canonicalKey && lines.length === 2) return true;
  }
  return blockKey === comparableText(`${heading} ${canonicalValue}`);
}

function isSingleValueHeadingBlock(block: string, heading: string): boolean {
  const blockKey = comparableText(block);
  const headingKey = comparableText(heading);
  if (!blockKey || !headingKey) return false;
  return blockKey === headingKey;
}

function isSingleValueHeadingLikeBlock(block: string): boolean {
  const trimmed = String(block || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("\n")) return false;
  const normalized = trimmed.replace(/\s+/g, " ");
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 12) return false;
  return !/[.!?]$/.test(normalized);
}

const SINGLE_VALUE_INFERRED_FEEDBACK_STEPS = new Set(["purpose", "bigwhy"]);

function inferSingleValueFeedbackReason(params: {
  stepId: string;
  message: string;
  heading: string;
  canonicalValue: string;
}): string {
  if (!SINGLE_VALUE_INFERRED_FEEDBACK_STEPS.has(String(params.stepId || "").trim())) return "";
  const canonicalText = String(params.canonicalValue || "").trim();
  if (!canonicalText) return "";
  const blocks = canonicalParagraphBlocks(params.message);
  const candidates = blocks.filter((block) => {
    const trimmed = String(block || "").trim();
    if (!trimmed) return false;
    if (isSingleValueHeadingBlock(trimmed, params.heading)) return false;
    if (isSingleValueCanonicalBlock(trimmed, params.heading, canonicalText)) return false;
    return true;
  });
  if (candidates.length === 0) return "";
  const firstBlock = String(candidates[0] || "").trim();
  if (!firstBlock) return "";
  const sentences = sentenceBoundaryBlocks(firstBlock);
  if (sentences.length < 2 && candidates.length < 2) return "";
  return String(sentences[0] || firstBlock).replace(/\s+/g, " ").trim();
}

function singleValueSupportText(params: {
  message: string;
  heading: string;
  canonicalValue: string;
  feedbackReasonText?: string;
}): string {
  const feedbackReasonText = String(params.feedbackReasonText || "").trim();
  const feedbackKey = comparableText(feedbackReasonText);
  const blocks = canonicalParagraphBlocks(params.message);
  const filtered = blocks
    .map((block, index) => {
      const blockKey = comparableText(block);
      const nextBlock = String(blocks[index + 1] || "").trim();
      if (!blockKey) return "";
      if (feedbackKey && blockKey === feedbackKey) return "";
      if (isSingleValueHeadingBlock(block, params.heading)) return "";
      if (
        isSingleValueHeadingLikeBlock(block) &&
        isSingleValueCanonicalBlock(nextBlock, params.heading, params.canonicalValue)
      ) {
        return "";
      }
      if (isSingleValueCanonicalBlock(block, params.heading, params.canonicalValue)) return "";
      return feedbackKey ? stripLeadingFeedbackSentence(block, feedbackReasonText) : block;
    })
    .map((block) => String(block || "").trim())
    .filter((block) => {
      const blockKey = comparableText(block);
      if (!blockKey) return false;
      if (feedbackKey && blockKey === feedbackKey) return false;
      if (isSingleValueHeadingBlock(block, params.heading)) return false;
      if (isSingleValueCanonicalBlock(block, params.heading, params.canonicalValue)) return false;
      return true;
    });
  return filtered.join("\n\n").trim();
}

function buildSingleValueUiContent(params: {
  stepId: string;
  state: CanvasState;
  specialist: Record<string, unknown>;
  message: string;
  canonicalValue: string;
  feedbackReasonText?: string;
}): UiSingleValueContent | undefined {
  const { stepId, state, specialist, message, canonicalValue } = params;
  const canonicalText = String(canonicalValue || "").trim();
  if (!canonicalText) return undefined;
  if (!SINGLE_VALUE_STRUCTURED_CONTENT_STEPS.has(stepId)) return undefined;
  if (isDreamBuilderSingleValueContext(stepId, state, specialist)) return undefined;
  const heading = singleValueConfirmHeading(stepId, state);
  const feedbackReasonText = String(params.feedbackReasonText || "").trim();
  const supportText = singleValueSupportText({
    message,
    heading,
    canonicalValue: canonicalText,
    feedbackReasonText,
  });
  return {
    kind: "single_value",
    ...(heading ? { heading } : {}),
    canonical_text: canonicalText,
    ...(supportText ? { support_text: supportText } : {}),
    ...(feedbackReasonText ? { feedback_reason_text: feedbackReasonText } : {}),
  };
}

function hasCanonicalContextBlockShape(message: string, heading: string, canonicalValue: string): boolean {
  const canonicalKey = comparableText(canonicalValue);
  if (!canonicalKey) return false;
  const headingKey = comparableText(heading);
  const lines = String(message || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const currentKey = comparableText(lines[i] || "");
    if (!currentKey) continue;
    if (!headingKey) {
      if (currentKey === canonicalKey) return true;
      continue;
    }
    if (currentKey !== headingKey) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const nextKey = comparableText(lines[j] || "");
      if (!nextKey) continue;
      return nextKey === canonicalKey;
    }
  }
  return false;
}

function ensureCanonicalContextBlockInMessage(params: {
  message: string;
  canonicalValue: string;
  heading: string;
}): string {
  const messageRaw = String(params.message || "").trim();
  const canonical = String(params.canonicalValue || "").trim();
  const heading = String(params.heading || "").trim();
  if (!canonical) return messageRaw;
  const canonicalKey = comparableText(canonical);
  if (!canonicalKey) return messageRaw;
  const headingKey = comparableText(heading);
  const messageKey = comparableText(messageRaw);
  const hasCanonical = Boolean(messageKey && messageKey.includes(canonicalKey));
  const hasHeading = Boolean(headingKey && messageKey.includes(headingKey));
  const canonicalBlock = heading ? `${heading}\n${canonical}` : canonical;
  if (hasCanonical && hasHeading && hasCanonicalContextBlockShape(messageRaw, heading, canonical)) {
    return messageRaw;
  }
  if (!messageRaw) return canonicalBlock;
  const paragraphs = messageRaw
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const filteredParagraphs = paragraphs.filter((paragraph) => {
    const paragraphKey = comparableText(paragraph);
    if (!paragraphKey) return false;
    if (paragraphKey === canonicalKey) return false;
    if (headingKey && paragraphKey === headingKey) return false;
    if (paragraphKey.includes(canonicalKey)) return false;
    if (headingKey && paragraphKey.includes(headingKey)) return false;
    return true;
  });
  let base = filteredParagraphs.join("\n\n").trim();
  if (hasCanonical && !hasHeading) {
    base = base.replace(canonical, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (!base) return canonicalBlock;
  return `${base}\n\n${canonicalBlock}`.trim();
}

function comparableText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractBulletStatements(raw: string): string[] {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter((line) => /^[•\-*]\s+/.test(line))
    .map((line) => line.replace(/^[•\-*]\s+/, "").trim())
    .filter(Boolean);
}

function includesStatement(textKey: string, statement: string): boolean {
  const candidate = comparableText(statement);
  if (!candidate) return false;
  return textKey.includes(candidate);
}

function answerContainsAllStatements(answerText: string, statements: string[]): boolean {
  const expected = statements.map((line) => String(line || "").trim()).filter(Boolean);
  if (expected.length === 0) return false;
  const answerKey = comparableText(answerText);
  if (!answerKey) return false;
  return expected.every((statement) => includesStatement(answerKey, statement));
}

function hasInlineNumberedSummary(paragraph: string): boolean {
  const text = String(paragraph || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const matches = text.match(/\b\d+\s*[^:\n]{0,40}:\s*/g);
  return Array.isArray(matches) && matches.length >= 2;
}

function stripInlineNumberedSummaryParagraphs(answerText: string, statements: string[]): string {
  const expected = statements.map((line) => String(line || "").trim()).filter(Boolean);
  if (expected.length === 0) return String(answerText || "").trim();
  const paragraphs = String(answerText || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";

  const kept = paragraphs.filter((paragraph) => {
    if (!hasInlineNumberedSummary(paragraph)) return true;
    const paragraphKey = comparableText(paragraph);
    const matched = expected.filter((statement) => includesStatement(paragraphKey, statement)).length;
    return matched < Math.min(2, expected.length);
  });

  return kept.join("\n\n").trim();
}

function stripStrategySummaryParagraphs(answerText: string, statements: string[]): string {
  const expected = statements.map((line) => String(line || "").trim()).filter(Boolean);
  const summaryPatterns = [
    /^so far we have these\b/i,
    /^i['’]?ve reformulated your input into valid strategy focus choices:?$/i,
    /^if you want to sharpen or adjust these, let me know\.?$/i,
    /^current strategy focus points:?$/i,
    /^you now have\s+\d+\s+focus points within your strategy:?$/i,
    /^i advise you to formulate at least 4 but maximum 7 focus points\.?$/i,
    /^your current strategy for\b/i,
  ];
  const paragraphs = String(answerText || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return "";

  const kept = paragraphs.filter((paragraph) => {
    const normalizedLines = paragraph
      .split("\n")
      .map((line) => String(line || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (normalizedLines.some((line) => summaryPatterns.some((pattern) => pattern.test(line)))) {
      return false;
    }
    const bulletLikeLines = normalizedLines.filter((line) => /^(?:[-*•]|\d+[\).])\s+/.test(line));
    if (bulletLikeLines.length < 2 || expected.length === 0) return true;
    const paragraphKey = comparableText(paragraph);
    const matched = expected.filter((statement) => includesStatement(paragraphKey, statement)).length;
    return matched < Math.min(2, expected.length);
  });

  return kept.join("\n\n").trim();
}

function dedupeListItems(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const key = comparableText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

type RecapSectionKey = "strategy" | "targetgroup" | "productsservices" | "rulesofthegame";

const RECAP_SECTION_LABELS: Record<RecapSectionKey, string[]> = {
  strategy: ["strategy", "strategie"],
  targetgroup: ["target group", "doelgroep"],
  productsservices: ["products and services", "products & services", "producten en diensten"],
  rulesofthegame: ["rules of the game", "spelregels"],
};

function escapeRegExp(text: string): string {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRecapLine(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCompositeRecapLine(rawLine: string): string[] {
  const line = normalizeRecapLine(rawLine);
  if (!line) return [];
  if (line.includes("•")) {
    return line
      .split("•")
      .map((part) => String(part || "").trim())
      .filter(Boolean);
  }
  const numbered = Array.from(line.matchAll(/(?:^|\s)(\d+[\).]\s*[^]+?)(?=\s+\d+[\).]\s+|$)/g))
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  if (numbered.length >= 2) return numbered;
  if (line.includes(";")) {
    return line
      .split(";")
      .map((part) => String(part || "").trim())
      .filter(Boolean);
  }
  return [line];
}

function detectRecapSectionLabel(lineRaw: string): { section: RecapSectionKey; rest: string } | null {
  const line = normalizeRecapLine(lineRaw);
  if (!line) return null;
  for (const [section, labels] of Object.entries(RECAP_SECTION_LABELS) as [RecapSectionKey, string[]][]) {
    for (const label of labels) {
      const re = new RegExp(`^${escapeRegExp(label)}\\s*[:\\-–]?\\s*(.*)$`, "i");
      const match = line.match(re);
      if (!match) continue;
      return { section, rest: String(match[1] || "").trim() };
    }
  }
  return null;
}

function sectionAwareRecapText(raw: string, section: RecapSectionKey): string {
  const input = String(raw || "").replace(/\r/g, "\n").trim();
  if (!input) return "";
  const allLabels = Object.values(RECAP_SECTION_LABELS).flat();
  const boundaryRegex = new RegExp(`\\s+(${allLabels.map(escapeRegExp).join("|")})\\s*[:\\-–]\\s*`, "gi");
  const withBoundaries = input.replace(boundaryRegex, (_full, label: string) => `\n${label}: `);
  const sourceLines = withBoundaries
    .split("\n")
    .map((line) => normalizeRecapLine(line))
    .filter(Boolean);
  const scoped: string[] = [];
  const generic: string[] = [];
  let active: RecapSectionKey | null = null;
  for (const line of sourceLines) {
    const detected = detectRecapSectionLabel(line);
    if (detected) {
      active = detected.section;
      if (detected.section === section && detected.rest) {
        scoped.push(...splitCompositeRecapLine(detected.rest));
      }
      continue;
    }
    const parts = splitCompositeRecapLine(line);
    if (active === null) {
      generic.push(...parts);
      continue;
    }
    if (active === section) scoped.push(...parts);
  }
  const candidateLines = scoped.length > 0 ? scoped : generic;
  return dedupeListItems(candidateLines).join("\n").trim();
}

function splitCamelTitleItems(raw: string): string[] {
  const tokens = String(raw || "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 3) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    const plain = token.replace(/^[("'\[]+|[)"'\],.;:!?]+$/g, "");
    const startsUpper = /^\p{Lu}/u.test(plain);
    if (startsUpper && current.length > 0) {
      chunks.push(current.join(" ").trim());
      current = [token];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) chunks.push(current.join(" ").trim());
  const cleaned = chunks.map((line) => String(line || "").trim()).filter(Boolean);
  return cleaned.length >= 2 ? cleaned : [];
}

function productsServicesItemsFromRecap(raw: string): string[] {
  const scoped = sectionAwareRecapText(raw, "productsservices") || String(raw || "");
  const bulletItems = extractBulletStatements(scoped);
  if (bulletItems.length >= 1) return dedupeListItems(bulletItems);
  const punctSplit = String(scoped || "")
    .replace(/\r/g, "\n")
    .split(/[;\n,]+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
    .filter(Boolean);
  if (punctSplit.length >= 2) return dedupeListItems(punctSplit);
  const titleSplit = splitCamelTitleItems(scoped);
  if (titleSplit.length >= 2) return dedupeListItems(titleSplit);
  const single = String(scoped || "").trim();
  return single ? [single] : [];
}

function genericListItemsFromRecap(raw: string, section?: RecapSectionKey): string[] {
  const scoped = section ? sectionAwareRecapText(raw, section) : "";
  const source = scoped || String(raw || "");
  const bulletItems = extractBulletStatements(source);
  if (bulletItems.length >= 1) return dedupeListItems(bulletItems);

  const numberedByLine = String(source || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/^\s*\d+[\).]\s*/, "").trim())
    .filter(Boolean);
  if (numberedByLine.length >= 2) return dedupeListItems(numberedByLine);

  const punctSplit = String(source || "")
    .replace(/\r/g, "\n")
    .split(/[;\n,]+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
    .filter(Boolean);
  if (punctSplit.length >= 2) return dedupeListItems(punctSplit);

  const compact = String(source || "").replace(/\s+/g, " ").trim();
  if (compact) {
    const sentenceSplit = (compact.match(/[^.!?。！？]+[.!?。！？]*/g) || [])
      .map((line) => String(line || "").trim().replace(/[.!?。！？]+$/g, "").trim())
      .filter(Boolean);
    if (sentenceSplit.length >= 2) return dedupeListItems(sentenceSplit);
  }

  const titleSplit = splitCamelTitleItems(source);
  if (titleSplit.length >= 2) return dedupeListItems(titleSplit);

  const single = String(source || "").trim();
  return single ? [single] : [];
}

function recapListItemsForStep(stepId: string, state: CanvasState, raw: string): string[] {
  if (stepId === "strategy") {
    const fromStrategySources = strategyStatementsFromSources(state, {}, {}, { provisionalForStep });
    if (fromStrategySources.length >= 2) return fromStrategySources;
    const fromRecap = genericListItemsFromRecap(raw, "strategy");
    if (fromRecap.length >= 2) return fromRecap;
    return fromStrategySources.length > 0 ? fromStrategySources : fromRecap;
  }
  if (stepId === "productsservices") return productsServicesItemsFromRecap(raw);
  if (stepId === "rulesofthegame") return genericListItemsFromRecap(raw, "rulesofthegame");
  return [];
}

function localeTokenListFromState(state: CanvasState, key: string): string[] {
  const value = uiStringFromState(state, key, uiDefaultString(key));
  return String(value || "")
    .split("|")
    .map((token) => String(token || "").trim().toLowerCase())
    .filter(Boolean);
}

function classifyProductsServicesVariant(
  state: CanvasState,
  items: string[]
): "single_product" | "single_service" | "single_mixed" | "plural_products" | "plural_services" | "plural_mixed" {
  const normalized = items.map((line) => String(line || "").trim()).filter(Boolean);
  if (normalized.length === 0) return "plural_mixed";
  const productTokens = localeTokenListFromState(state, "productsservices.classifier.product.tokens");
  const serviceTokens = localeTokenListFromState(state, "productsservices.classifier.service.tokens");
  let productCount = 0;
  let serviceCount = 0;
  let unknownCount = 0;
  for (const itemRaw of normalized) {
    const item = String(itemRaw || "").toLowerCase();
    const productMatch = productTokens.some((token) => token && item.includes(token));
    const serviceMatch = serviceTokens.some((token) => token && item.includes(token));
    if (productMatch && !serviceMatch) {
      productCount += 1;
    } else if (serviceMatch && !productMatch) {
      serviceCount += 1;
    } else {
      unknownCount += 1;
    }
  }
  if (normalized.length === 1) {
    if (productCount === 1) return "single_product";
    if (serviceCount === 1) return "single_service";
    return "single_mixed";
  }
  if (unknownCount === 0 && productCount > 0 && serviceCount === 0) return "plural_products";
  if (unknownCount === 0 && serviceCount > 0 && productCount === 0) return "plural_services";
  return "plural_mixed";
}

function productsServicesHeadingForState(state: CanvasState, items: string[]): string {
  const variant = classifyProductsServicesVariant(state, items);
  const key = `productsservices.current.heading.${variant}`;
  const template = uiStringFromState(state, key, uiDefaultString(key));
  const rendered = String(template || "").replace(/\{0\}/g, offTopicCompanyName(state)).trim();
  if (!rendered) return "";
  const base = rendered.replace(/[.!?。！？]+$/g, "").replace(/\s*:\s*$/g, "").trim();
  return base ? `${base}:` : "";
}

function productsServicesRecapBlock(state: CanvasState, recapText: string): string {
  const items = productsServicesItemsFromRecap(recapText);
  if (items.length === 0) return String(recapText || "").trim();
  const heading = productsServicesHeadingForState(state, items);
  const bullets = items.map((line) => `• ${line}`).join("\n");
  if (!heading) return bullets;
  return `${heading}\n${bullets}`.trim();
}

function rulesOfTheGameRecapBlock(state: CanvasState, recapText: string): string {
  const items = evaluateRulesRuntimeGate({
    acceptedOutput: true,
    acceptedValue: "",
    visibleValue: recapText,
    statements: [],
    wordingChoicePending: false,
  }).items;
  if (items.length === 0) return String(recapText || "").trim();
  const key = "sectionTitle.rulesofthegameOf";
  const template = uiStringFromState(state, key, uiDefaultString(key));
  const rendered = String(template || "").replace(/\{0\}/g, offTopicCompanyName(state)).trim();
  const base = rendered.replace(/[.!?。！？]+$/g, "").replace(/\s*:\s*$/g, "").trim();
  const heading = base ? `${base}:` : "";
  const bullets = items.map((line) => `• ${line}`).join("\n");
  if (!heading) return bullets;
  return `${heading}\n${bullets}`.trim();
}

function rulesOfTheGameCountLine(state: CanvasState, count: number): string {
  const template = uiStringFromState(
    state,
    "rulesofthegame.count.template",
    uiDefaultString("rulesofthegame.count.template")
  );
  const line = String(template || "")
    .replace(/\{0\}/g, String(count))
    .replace(/\{1\}/g, String(RULESOFTHEGAME_MIN_RULES))
    .replace(/\{2\}/g, String(RULESOFTHEGAME_MAX_RULES))
    .trim();
  if (!line) return "";
  const sentenceMatch = line.match(/^([\s\S]*?[.!?。！？])(?:\s+|$)([\s\S]*)$/);
  const firstSentence = String(sentenceMatch?.[1] || line).trim();
  const rest = String(sentenceMatch?.[2] || "").trim();
  const heading = `${firstSentence.replace(/[.!?。！？]+$/g, "").trim()}:`;
  return rest ? `${heading}\n${rest}` : heading;
}

function rulesOfTheGameCurrentHeading(state: CanvasState): string {
  const template = uiStringFromState(
    state,
    "rulesofthegame.current.template",
    uiDefaultString("rulesofthegame.current.template")
  );
  const rendered = String(template || "").replace(/\{0\}/g, offTopicCompanyName(state)).trim();
  if (!rendered) return "";
  const base = rendered.replace(/[.!?。！？]+$/g, "").replace(/\s*:\s*$/g, "").trim();
  return base ? `${base}:` : "";
}

function rulesOfTheGameContextBlock(
  state: CanvasState,
  recapText: string
): { items: string[]; block: string } {
  const items = evaluateRulesRuntimeGate({
    acceptedOutput: true,
    acceptedValue: "",
    visibleValue: recapText,
    statements: [],
    wordingChoicePending: false,
  }).items;
  if (items.length === 0) return { items: [], block: String(recapText || "").trim() };
  const parts = [
    rulesOfTheGameCountLine(state, items.length),
    rulesOfTheGameCurrentHeading(state),
    items.map((line) => `• ${line}`).join("\n"),
  ].filter(Boolean);
  return {
    items,
    block: parts.join("\n").trim(),
  };
}

function step0ConfirmQuestion(state: CanvasState, venture: string, name: string, status: string): string {
  const cleanVenture = String(venture || "").trim();
  const cleanName = String(name || "").trim();
  const suffix = uiStringFromState(
    state,
    "step0.readiness.suffix",
    uiDefaultString("step0.readiness.suffix")
  );
  const existingTemplate = uiStringFromState(
    state,
    "step0.readiness.statement.existing",
    uiDefaultString("step0.readiness.statement.existing")
  );
  const startingTemplate = uiStringFromState(
    state,
    "step0.readiness.statement.starting",
    uiDefaultString("step0.readiness.statement.starting")
  );
  const statementTemplate = String(status || "").toLowerCase() === "starting" ? startingTemplate : existingTemplate;
  if (cleanVenture && cleanName) {
    const statement = formatIndexedTemplate(statementTemplate, [cleanVenture, cleanName]).trim();
    return `${statement} ${suffix}`.trim();
  }
  return suffix;
}

function isStep0MetaTurn(specialist: Record<string, unknown>): boolean {
  const wantsRecap =
    specialist.wants_recap === true ||
    String((specialist as any).wants_recap || "").trim().toLowerCase() === "true";
  if (wantsRecap) return true;
  const userIntent = String((specialist as any).user_intent || "").trim().toUpperCase();
  if (userIntent === "META_QUESTION" || userIntent === "WHY_NEEDED" || userIntent === "RESISTANCE") {
    return true;
  }
  const metaTopic = String((specialist as any).meta_topic || "").trim().toUpperCase();
  return Boolean(metaTopic && metaTopic !== "NONE");
}

function extractCandidate(stepId: string, specialist: Record<string, unknown>, prev: Record<string, unknown>): string {
  if (stepId === "step_0") {
    return String(specialist.step_0 ?? prev.step_0 ?? "").trim();
  }
  const key = stepId === "rulesofthegame" ? "rulesofthegame" : stepId;
  const direct = String(specialist[key] ?? prev[key] ?? "").trim();
  if (direct) return direct;
  return String(specialist.refined_formulation ?? prev.refined_formulation ?? "").trim();
}

function computeStatus(
  stepId: string,
  state: CanvasState,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): { status: TurnOutputStatus; confirmEligible: boolean; recapBody: string; statementCount: number } {
  if (stepId === "step_0") {
    const finalLine = String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, specialist, prev);
    const parsed = parseStep0Line(finalLine);
    const hasAny = Boolean(parsed.venture || parsed.name || parsed.status);
    const valid =
      Boolean(parsed.venture) &&
      Boolean(parsed.name) &&
      (parsed.status === "existing" || parsed.status === "starting");
    if (!hasAny) return { status: "no_output", confirmEligible: false, recapBody: "", statementCount: 0 };
    const recap = [
      `${recapLabel(state, "recap.label.venture", "Venture")}: ${parsed.venture || "-"}`,
      `${recapLabel(state, "recap.label.name", "Name")}: ${parsed.name || "-"}`,
      `${recapLabel(state, "recap.label.status", "Status")}: ${parsed.status || "-"}`,
    ].join("\n");
    if (valid) return { status: "valid_output", confirmEligible: true, recapBody: recap, statementCount: 0 };
    return { status: "incomplete_output", confirmEligible: false, recapBody: recap, statementCount: 0 };
  }

  const finalField = getFinalFieldForStepId(stepId);
  const committedFinalRaw = finalField ? String((state as any)[finalField] ?? "").trim() : "";
  const committedFinalValue = isRenderableAcceptedValue(stepId, committedFinalRaw) ? committedFinalRaw : "";
  const provisionalValue = provisionalForStep(state, stepId);
  const acceptedOutput = isAcceptedOutput(stepId, state);
  const acceptedValue = committedFinalValue || (isAcceptedProvisional(state, stepId) ? provisionalValue : "");
  const finalValue = acceptedValue;
  const candidate = extractCandidate(stepId, specialist, prev);
  const visibleValue = acceptedValue || provisionalValue || candidate;
  const statementCount = extractStatementCount(specialist, prev);
  const statementBullets = statementCount > 0
    ? Array.from({ length: statementCount }, (_, idx) => {
        const source = Array.isArray(specialist.statements) && specialist.statements[idx]
          ? specialist.statements[idx]
          : Array.isArray(prev.statements)
            ? prev.statements[idx]
            : "";
        return String(source || "").trim();
      }).filter(Boolean).map((line) => `• ${line}`).join("\n")
    : "";

  if (stepId === "dream") {
    const dreamMode = dreamRuntimeModeFromState(state);
    if (dreamMode === "builder_collect") {
      if (statementCount > 0 || visibleValue) {
        return {
          status: "incomplete_output",
          confirmEligible: false,
          recapBody: statementBullets || visibleValue,
          statementCount,
        };
      }
      return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
    }
    if (dreamMode === "builder_scoring") {
      return {
        status: "no_output",
        confirmEligible: false,
        recapBody: statementBullets || visibleValue,
        statementCount,
      };
    }
    if (dreamMode === "builder_refine") {
      if (acceptedOutput && acceptedValue) {
        return {
          status: "valid_output",
          confirmEligible: true,
          recapBody: acceptedValue,
          statementCount,
        };
      }
      return {
        status: statementCount > 0 || Boolean(visibleValue) ? "incomplete_output" : "no_output",
        confirmEligible: false,
        recapBody: statementBullets || visibleValue,
        statementCount,
      };
    }

    if (acceptedOutput && acceptedValue) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: acceptedValue,
        statementCount,
      };
    }
    if (visibleValue) {
      return { status: "incomplete_output", confirmEligible: false, recapBody: visibleValue, statementCount };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
  }

  if (stepId === "strategy") {
    const strategyStatements = strategyStatementsFromSources(state, specialist, prev, { provisionalForStep });
    const strategyCount = strategyStatements.length;
    const strategyBullets = strategyStatements.map((line) => `• ${line}`).join("\n");
    if (strategyCount >= 4 && acceptedOutput) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: strategyBullets || acceptedValue || visibleValue,
        statementCount: strategyCount,
      };
    }
    if (strategyCount > 0 || visibleValue) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: strategyBullets || visibleValue,
        statementCount: strategyCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount: 0 };
  }

  if (stepId === "rulesofthegame") {
    const wordingChoicePending =
      String((specialist as any).wording_choice_pending || (prev as any).wording_choice_pending || "").trim() === "true";
    const rulesGate = evaluateRulesRuntimeGate({
      acceptedOutput,
      acceptedValue,
      visibleValue,
      statements: Array.isArray((specialist as any).statements) && (specialist as any).statements.length > 0
        ? (specialist as any).statements
        : (prev as any).statements,
      wordingChoicePending,
    });
    const rulesBullets = rulesGate.items.map((line) => `• ${line}`).join("\n");
    if (rulesGate.canConfirm) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: acceptedValue || rulesBullets || statementBullets || visibleValue,
        statementCount: rulesGate.count,
      };
    }
    if (rulesGate.hasVisibleValue) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: rulesBullets || statementBullets || visibleValue,
        statementCount: rulesGate.count,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount: rulesGate.count };
  }

  if (stepId === "productsservices") {
    const recapItems = productsServicesItemsFromRecap(acceptedValue || statementBullets || visibleValue);
    const hasCandidate = recapItems.length > 0 || Boolean(visibleValue) || statementCount > 0;
    if (acceptedOutput || hasCandidate) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: acceptedValue || statementBullets || visibleValue,
        statementCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
  }

  const acceptedDrivenValidSteps = new Set([
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "targetgroup",
    "presentation",
  ]);
  if (acceptedValue && acceptedDrivenValidSteps.has(stepId)) {
    return { status: "valid_output", confirmEligible: true, recapBody: acceptedValue, statementCount };
  }

  if (acceptedValue) {
    return { status: "valid_output", confirmEligible: true, recapBody: acceptedValue, statementCount };
  }
  if (visibleValue) {
    return { status: "incomplete_output", confirmEligible: false, recapBody: visibleValue, statementCount };
  }
  return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
}

const RECAP_KNOWN_STEP_ORDER = [
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
] as const;

function isRecapRequestedSpecialist(specialist: Record<string, unknown>): boolean {
  const wantsRecap =
    specialist.wants_recap === true ||
    String((specialist as any).wants_recap || "").trim().toLowerCase() === "true";
  if (wantsRecap) return true;
  const userIntent = String((specialist as any).user_intent || "").trim().toUpperCase();
  if (userIntent === "RECAP_REQUEST") return true;
  const metaTopic = String((specialist as any).meta_topic || "").trim().toUpperCase();
  return metaTopic === "RECAP";
}

function knownValueForStep(state: CanvasState, stepId: string): string {
  const finalField = getFinalFieldForStepId(stepId);
  const finalValue = finalField ? String((state as any)[finalField] || "").trim() : "";
  if (isRenderableAcceptedValue(stepId, finalValue)) return finalValue;
  const provisional = provisionalForStep(state, stepId);
  return isRenderableAcceptedValue(stepId, provisional) ? provisional : "";
}

function isPersistentRecapContextStep(stepId: string): boolean {
  return stepId === "presentation";
}

function persistentRecapContextFeedback(stepId: string, state: CanvasState): string {
  if (stepId !== "presentation") return "";
  return uiStringFromState(
    state,
    "presentation.recapVisibleFeedback",
    uiDefaultString(
      "presentation.recapVisibleFeedback",
      "The summary is already visible on screen. Tell me what to adjust, or create the presentation."
    )
  ).trim();
}

function buildKnownFactsRecap(state: CanvasState): string {
  const blocks: string[] = [];

  const step0 = parseStep0Line(String((state as any).step_0_final || "").trim());
  const venture = String(step0.venture || "").trim();
  const name = String(step0.name || "").trim();
  if (venture) {
    blocks.push(
      `${recapLabel(state, "recap.label.venture", "Venture")}:\n${venture}`
    );
  }
  if (name) {
    blocks.push(
      `${recapLabel(state, "recap.label.name", "Name")}:\n${name}`
    );
  }

  for (const stepId of RECAP_KNOWN_STEP_ORDER) {
    const value = knownValueForStep(state, stepId);
    if (!value) continue;
    const label = offTopicStepLabel(stepId, state);
    if (!label) continue;
    if (stepId === "strategy" || stepId === "productsservices" || stepId === "rulesofthegame") {
      const recapItems = recapListItemsForStep(stepId, state, value);
      if (recapItems.length > 0) {
        blocks.push(`${label}:\n${recapItems.map((item) => `• ${item}`).join("\n")}`);
        continue;
      }
    }
    blocks.push(`${label}:\n${value}`);
  }

  return blocks.join("\n\n").trim();
}

function labelsForMenu(
  menuId: string,
  actionCodes: string[],
  state: CanvasState
): string[] {
  if (!menuId || actionCodes.length <= 0) return [];

  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId]
    : [];
  if (fullActionCodes.length === 0) return [];

  const usedIndices = new Set<number>();
  const filteredLabels: string[] = [];
  const labelKeys = labelKeysForMenu(menuId, actionCodes);
  if (labelKeys.length !== actionCodes.length) return [];
  const fullLabelKeys = labelKeysForMenu(menuId, fullActionCodes);
  if (fullLabelKeys.length !== fullActionCodes.length) return [];
  for (const actionCode of actionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (String(fullActionCodes[i] || "").trim() !== String(actionCode || "").trim()) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    const fallbackKey = String(fullLabelKeys[matchedIndex] || "").trim();
    const fallback = String(MENU_LABEL_DEFAULTS[fallbackKey] || "").trim();
    if (!fallback) return [];
    const key = String(labelKeys[filteredLabels.length] || "").trim();
    filteredLabels.push(uiStringFromState(state, key, fallback));
  }
  if (filteredLabels.some((label) => !label)) return [];
  return filteredLabels;
}

function labelKeysForMenu(menuId: string, actionCodes: string[]): string[] {
  if (!menuId || actionCodes.length <= 0) return [];
  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId]
    : [];
  if (fullActionCodes.length === 0) return [];

  const allLabelKeys = (MENU_LABEL_KEYS[menuId] || []).slice(0, fullActionCodes.length);
  if (allLabelKeys.length !== fullActionCodes.length) {
    return actionCodes.map((actionCode, idx) => labelKeyForMenuAction(menuId, actionCode, idx));
  }

  const usedIndices = new Set<number>();
  const filteredLabelKeys: string[] = [];
  for (const actionCode of actionCodes) {
    let matchedIndex = -1;
    for (let i = 0; i < fullActionCodes.length; i += 1) {
      if (usedIndices.has(i)) continue;
      if (String(fullActionCodes[i] || "").trim() !== String(actionCode || "").trim()) continue;
      matchedIndex = i;
      break;
    }
    if (matchedIndex < 0) return [];
    usedIndices.add(matchedIndex);
    filteredLabelKeys.push(String(allLabelKeys[matchedIndex] || "").trim());
  }
  if (filteredLabelKeys.some((labelKey) => !labelKey)) return [];
  return filteredLabelKeys;
}

function resolveMenuContract(params: {
  stepId: string;
  status: TurnOutputStatus;
  confirmEligible: boolean;
  state: CanvasState;
  specialist: Record<string, unknown>;
  prev: Record<string, unknown>;
}): { menuId: string; actionCodes: string[]; labels: string[]; labelKeys: string[] } {
  const { stepId, status, confirmEligible, state, specialist, prev } = params;
  if (renderModeForStep(state, stepId) === "no_buttons") {
    return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
  }
  if (stepId === "dream") {
    const dreamMode = dreamRuntimeModeFromState(state);
    const forcedMenuId =
      dreamMode === "builder_collect"
        ? "DREAM_EXPLAINER_MENU_SWITCH_SELF"
        : dreamMode === "builder_refine"
          ? "DREAM_EXPLAINER_MENU_REFINE"
          : "";
    if (dreamMode === "builder_scoring") {
      return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
    }
    if (forcedMenuId) {
      const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[forcedMenuId])
        ? ACTIONCODE_REGISTRY.menus[forcedMenuId]
        : [];
      if (allActions.length === 0) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
      const actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
      if (actionCodes.length === 0) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
      const labels = labelsForMenu(forcedMenuId, actionCodes, state);
      const labelKeys = labelKeysForMenu(forcedMenuId, actionCodes);
      if (labels.length !== actionCodes.length || labelKeys.length !== actionCodes.length) {
        return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
      }
      return { menuId: forcedMenuId, actionCodes, labels, labelKeys };
    }
  }

  const defaults = DEFAULT_MENU_BY_STATUS[stepId];
  const defaultMenu = defaults ? String(defaults[status] || "").trim() : "";
  const isOfftopic = specialist.is_offtopic === true;
  const ignorePhaseForOfftopicNoOutput = isOfftopic && status === "no_output";
  const forceDefaultMenuForValidOutput = stepId !== "step_0" && status === "valid_output";
  const phaseMap = (state as any).__ui_phase_by_step && typeof (state as any).__ui_phase_by_step === "object"
    ? ((state as any).__ui_phase_by_step as Record<string, unknown>)
    : {};
  const specialistPhaseMenu = parseUiContractMenuForStep((specialist as any).ui_contract_id, stepId);
  const previousPhaseMenu = parseUiContractMenuForStep((prev as any).ui_contract_id, stepId);
  const phaseMenu = (ignorePhaseForOfftopicNoOutput || forceDefaultMenuForValidOutput)
    ? ""
    : parseUiContractMenuForStep(phaseMap[stepId], stepId) || specialistPhaseMenu || previousPhaseMenu;
  const menuIsValidForStep = (menuRaw: string): boolean => {
    const menu = String(menuRaw || "").trim();
    if (!menu || isEscapeMenu(menu)) return false;
    if (!ACTIONCODE_REGISTRY.menus[menu]) return false;
    if (!menuBelongsToStep(menu, stepId)) return false;
    return true;
  };
  let menuId = menuIsValidForStep(phaseMenu)
    ? phaseMenu
    : defaultMenu;
  if (
    status === "no_output" &&
    SINGLE_VALUE_CONFIRM_VISIBILITY_STEPS.has(stepId) &&
    menuRequiresKnownOutput(menuId)
  ) {
    menuId = menuIsValidForStep(defaultMenu) ? defaultMenu : "";
  }
  if (!menuIsValidForStep(menuId)) {
    menuId = menuIsValidForStep(defaultMenu) ? defaultMenu : "";
  }

  if (!menuId || isEscapeMenu(menuId)) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
  if (!ACTIONCODE_REGISTRY.menus[menuId]) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
  if (!menuBelongsToStep(menuId, stepId)) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };

  const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId]) ? ACTIONCODE_REGISTRY.menus[menuId] : [];
  let actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
  if (stepId === "strategy" && menuId === "STRATEGY_MENU_CONFIRM") {
    const strategyCount = strategyStatementsFromSources(state, specialist, prev, { provisionalForStep }).length;
    const overflow = strategyCount > 7;
    actionCodes = actionCodes.filter((code) => {
      const normalized = String(code || "").trim();
      if (normalized === "ACTION_STRATEGY_REFINE_EXPLAIN_MORE") return !overflow;
      if (normalized === "ACTION_STRATEGY_CONSOLIDATE") return overflow;
      return true;
    });
  }
  if (actionCodes.length === 0) return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };

  const labels = labelsForMenu(menuId, actionCodes, state);
  const labelKeys = labelKeysForMenu(menuId, actionCodes);
  if (labels.length !== actionCodes.length || labelKeys.length !== actionCodes.length) {
    return { menuId: "", actionCodes: [], labels: [], labelKeys: [] };
  }

  return { menuId, actionCodes, labels, labelKeys };
}

export function renderFreeTextTurnPolicy(params: TurnPolicyRenderParams): TurnPolicyRenderResult {
  const { stepId, state } = params;
  const specialist = params.specialist || {};
  const prev = params.previousSpecialist || {};
  const sourceAction = String((specialist as any).action || "").trim().toUpperCase();
  const legacyShowStepIntroChrome = stepId !== "step_0" && sourceAction === "INTRO";
  const activeSpecialist = String((state as any).active_specialist ?? "").trim();
  const stepLabel = offTopicStepLabel(stepId, state);
  const companyName = companyNameForPrompt(state);

  const isOfftopic = specialist.is_offtopic === true;
  const statusSource = isOfftopic ? prev : specialist;
  const { status, confirmEligible, recapBody, statementCount } = computeStatus(stepId, state, statusSource, prev);
  const candidateText = extractCandidate(stepId, statusSource, prev);
  const statementOfftopicSteps = new Set(["dream", "purpose", "bigwhy", "role", "entity", "targetgroup", "presentation"]);
  const allowOfftopicPromotion = !isConfirmGateAcceptedOnlyV1Enabled();
  const promoteIncompleteToValidForOfftopic =
    allowOfftopicPromotion &&
    isOfftopic &&
    status === "incomplete_output" &&
    !confirmEligible &&
    statementOfftopicSteps.has(stepId) &&
    Boolean(candidateText);
  const effectiveStatus: TurnOutputStatus = promoteIncompleteToValidForOfftopic ? "valid_output" : status;
  let effectiveConfirmEligible = promoteIncompleteToValidForOfftopic ? true : confirmEligible;
  if (isSemanticInvariantsV1Enabled() && effectiveStatus === "no_output") {
    effectiveConfirmEligible = false;
  }

  const specialistForDisplay: Record<string, unknown> = { ...specialist };
  const recapRequested = isRecapRequestedSpecialist(specialistForDisplay);
  const wordingPending = String((specialistForDisplay as any).wording_choice_pending || "").trim() === "true";
  if (isOfftopic && stepId !== "step_0") {
    const field = stepId === "rulesofthegame" ? "rulesofthegame" : stepId;
    const finalField = getFinalFieldForStepId(stepId);
    const existingField = String((specialistForDisplay as any)[field] || "").trim();
    const existingRefined = String((specialistForDisplay as any).refined_formulation || "").trim();
    const previousField = String((prev as any)[field] || "").trim();
    const stateFinal = finalField ? String((state as any)[finalField] || "").trim() : "";
    const stateProvisional = provisionalForStep(state, stepId);
    const carry = previousField || stateProvisional || stateFinal;
    if (!existingField && carry) {
      (specialistForDisplay as any)[field] = carry;
    }
    if (!existingRefined && carry) {
      (specialistForDisplay as any).refined_formulation = carry;
    }
    if (
      (!Array.isArray((specialistForDisplay as any).statements) ||
        (specialistForDisplay as any).statements.length === 0) &&
      Array.isArray((prev as any).statements) &&
      (prev as any).statements.length > 0
    ) {
      (specialistForDisplay as any).statements = (prev as any).statements;
    }
  }

  let answerText =
    String((specialistForDisplay as any).message ?? "").trim() ||
    String((specialistForDisplay as any).refined_formulation ?? "").trim();
  if (recapRequested) {
    if (isPersistentRecapContextStep(stepId)) {
      const persistentFeedback = persistentRecapContextFeedback(stepId, state);
      if (persistentFeedback) {
        answerText = persistentFeedback;
      }
    } else {
      const knownRecap = buildKnownFactsRecap(state);
      if (knownRecap) {
        answerText = knownRecap;
      }
    }
  }
  const recapText = String(recapBody || "").trim();
  const currentContextHeadingForStep =
    stepId !== "step_0" ? offTopicCurrentContextHeading(stepId, state) : "";
  const offTopicContextHeading =
    isOfftopic && stepId !== "step_0" ? offTopicCurrentContextHeading(stepId, state) : "";
  const defaultRecapBlock =
    offTopicContextHeading && recapText
      ? `${offTopicContextHeading}\n${recapText}`
      : recapText;
  const recapBlock =
    stepId === "productsservices" && recapText
      ? productsServicesRecapBlock(state, recapText)
      : stepId === "rulesofthegame" && recapText
        ? rulesOfTheGameRecapBlock(state, recapText)
      : defaultRecapBlock;
  const strategyStatements =
    stepId === "strategy" ? strategyStatementsFromSources(state, statusSource, prev, { provisionalForStep }) : [];
  const strategyContextBlock =
    !isOfftopic && stepId === "strategy" && strategyStatements.length > 0 && !wordingPending
      ? buildStrategyContextBlock(state, strategyStatements, { uiStringFromState, companyNameForPrompt })
      : "";
  const rulesContext =
    !isOfftopic && stepId === "rulesofthegame" && recapText && !wordingPending
      ? rulesOfTheGameContextBlock(state, recapText)
      : { items: [], block: "" };
  const message = (() => {
    if (
      isOfftopic &&
      stepId !== "step_0" &&
      effectiveStatus !== "no_output" &&
      recapText
    ) {
      if (!answerText) return recapBlock;
      const answerKey = comparableText(answerText);
      const recapKey = comparableText(recapText);
      const headingKey = comparableText(offTopicContextHeading);
      if (recapKey && answerKey.includes(recapKey)) {
        if (!headingKey || answerKey.includes(headingKey)) return answerText;
        return `${answerText}\n\n${offTopicContextHeading}`.trim();
      }
      return `${answerText}\n\n${recapBlock}`.trim();
    }
    if (strategyContextBlock) {
      const withoutInlineSummary = stripInlineNumberedSummaryParagraphs(answerText, strategyStatements);
      const cleanedAnswer = stripStrategySummaryParagraphs(withoutInlineSummary, strategyStatements);
      if (!cleanedAnswer) return strategyContextBlock;
      const answerKey = comparableText(cleanedAnswer);
      const recapKey = comparableText(strategyContextBlock);
      if (recapKey && answerKey.includes(recapKey)) return cleanedAnswer;
      return `${cleanedAnswer}\n\n${strategyContextBlock}`.trim();
    }
    if (rulesContext.block) {
      const cleanedAnswer = stripInlineNumberedSummaryParagraphs(answerText, rulesContext.items);
      if (!cleanedAnswer) return rulesContext.block;
      const answerKey = comparableText(cleanedAnswer);
      const recapKey = comparableText(rulesContext.block);
      if (recapKey && answerKey.includes(recapKey)) return cleanedAnswer;
      if (answerContainsAllStatements(cleanedAnswer, rulesContext.items)) return cleanedAnswer;
      return `${cleanedAnswer}\n\n${rulesContext.block}`.trim();
    }
    if (effectiveStatus === "valid_output" && recapText) {
      const recapStatements =
        stepId === "productsservices"
          ? productsServicesItemsFromRecap(recapText)
          : extractBulletStatements(recapText);
      const cleanedAnswer =
        stepId === "rulesofthegame"
          ? stripInlineNumberedSummaryParagraphs(answerText, recapStatements)
          : answerText;
      if (!cleanedAnswer) return recapBlock;
      const answerKey = comparableText(cleanedAnswer);
      const recapKey = comparableText(recapText);
      const cleanedLooksLikeGenericCurrentHeadingOnly =
        Boolean(cleanedAnswer) &&
        Boolean(currentContextHeadingForStep) &&
        comparableText(cleanedAnswer) === comparableText(currentContextHeadingForStep);
      if (recapKey && answerKey.includes(recapKey)) return cleanedAnswer;
      if (answerContainsAllStatements(cleanedAnswer, recapStatements)) return cleanedAnswer;
      if (cleanedLooksLikeGenericCurrentHeadingOnly) return `${cleanedAnswer}\n${recapText}`.trim();
      return `${cleanedAnswer}\n\n${recapBlock}`.trim();
    }
    return answerText || (effectiveStatus === "valid_output" ? recapBlock : "");
  })();

  if (stepId === "step_0") {
    const parsedStep0 = parseStep0Line(
      String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, statusSource, prev)
    );
    const hasKnownStep0Output =
      Boolean(parsedStep0.venture) &&
      Boolean(parsedStep0.name) &&
      (parsedStep0.status === "existing" || parsedStep0.status === "starting");
    const step0CardDesc = uiStringFromState(state, "step0.carddesc", uiDefaultString("step0.carddesc"));
    const step0InitialQuestion = uiStringFromState(
      state,
      "step0.question.initial",
      uiDefaultString("step0.question.initial")
    );
    const specialistQuestion = String((specialistForDisplay as any).question ?? "").trim();
    const step0Message = (() => {
      const preserveSpecialistMessage =
        sourceAction === "ESCAPE" ||
        isOfftopic ||
        isStep0MetaTurn(specialistForDisplay as Record<string, unknown>) ||
        String((specialistForDisplay as any).wants_recap || "").toLowerCase() === "true";
      if (preserveSpecialistMessage && answerText) return answerText;
      return step0CardDesc;
    })();
    const suppressEscapeMenu =
      sourceAction === "ESCAPE" &&
      !(isStep0EscapeReadyGuardV1Enabled() && hasKnownStep0Output);
    const step0MenuId = suppressEscapeMenu
      ? ""
      : effectiveStatus === "valid_output"
        ? "STEP0_MENU_READY_START"
        : "";
    const step0ActionCodes = step0MenuId
      ? ((ACTIONCODE_REGISTRY.menus[step0MenuId] || []).map((code) => String(code || "").trim()).filter(Boolean))
      : [];
    const step0Labels = step0MenuId
      ? labelsForMenu(step0MenuId, step0ActionCodes, state)
      : [];
    const step0LabelKeys = step0MenuId
      ? labelKeysForMenu(step0MenuId, step0ActionCodes)
      : [];
    const preserveEscapeHeadline =
      sourceAction === "ESCAPE" &&
      specialistQuestion &&
      !(isStep0EscapeReadyGuardV1Enabled() && hasKnownStep0Output);
    const step0Headline = preserveEscapeHeadline
      ? specialistQuestion
      : effectiveStatus === "valid_output"
        ? step0ConfirmQuestion(state, parsedStep0.venture, parsedStep0.name, parsedStep0.status)
        : step0InitialQuestion;
    const step0HeadlineSafe =
      isSemanticInvariantsV1Enabled() &&
      (effectiveStatus === "no_output" || effectiveStatus === "incomplete_output") &&
      !String(step0Headline || "").trim()
        ? interactiveAskPromptFallback(state, stepId)
        : step0Headline;
    const step0Question = step0HeadlineSafe;
    const step0ContractId = buildContractId(stepId, effectiveStatus, step0MenuId);
    const step0TextKeys = buildContractTextKeys({ stepId, status: effectiveStatus, menuId: step0MenuId });
    const step0Specialist: Record<string, unknown> = {
      ...specialistForDisplay,
      action: "ASK",
      message: step0Message,
      question: step0Question,
      ui_contract_id: step0ContractId,
      ui_contract_version: UI_CONTRACT_VERSION,
      ui_text_keys: step0TextKeys,
    };
    return {
      status: effectiveStatus,
      confirmEligible: effectiveConfirmEligible,
      specialist: step0Specialist,
      uiActionCodes: step0ActionCodes,
      uiActions: buildRenderedActions(step0MenuId, step0ActionCodes, step0Labels, step0LabelKeys),
      contractId: step0ContractId,
      contractVersion: UI_CONTRACT_VERSION,
      textKeys: step0TextKeys,
    };
  }

  const specialistForMenu = specialistForDisplay;
  const prevForMenu = prev;

  const resolved = resolveMenuContract({
    stepId,
    status: effectiveStatus,
    confirmEligible: effectiveConfirmEligible,
    state,
    specialist: specialistForMenu,
    prev: prevForMenu,
  });
  const menuId = resolved.menuId;
  let safeActionCodes = resolved.actionCodes;
  let safeLabels = resolved.labels;
  let safeLabelKeys = resolved.labelKeys;
  const canonicalAcceptedValue = acceptedCanonicalValueForStep(stepId, state);
  const shouldEnforceConfirmVisibility = SINGLE_VALUE_CONFIRM_VISIBILITY_STEPS.has(stepId);
  if (shouldEnforceConfirmVisibility && safeActionCodes.some((code) => isConfirmActionCode(code)) && !canonicalAcceptedValue) {
    const retainedIndices = safeActionCodes
      .map((code, idx) => (isConfirmActionCode(code) ? -1 : idx))
      .filter((idx) => idx >= 0);
    safeActionCodes = retainedIndices.map((idx) => safeActionCodes[idx]);
    safeLabels = retainedIndices.map((idx) => safeLabels[idx]);
    safeLabelKeys = retainedIndices.map((idx) => safeLabelKeys[idx]);
  }
  const wordingChoiceSelected = String((specialistForDisplay as any).wording_choice_selected || "").trim();
  const wordingPresentation =
    String((specialistForDisplay as any).wording_choice_presentation || "").trim() === "canonical"
      ? "canonical"
      : "picker";
  const showStepIntroChrome =
    stepId === "purpose"
      ? isSemanticPurposeIntroVisibleState({
          stepId,
          status: effectiveStatus,
          menuId,
          wordingPending,
        }) || legacyShowStepIntroChrome
      : legacyShowStepIntroChrome;
  const headline = contractHeadlineForState({
    state,
    stepId,
    stepLabel,
    companyName,
    status: effectiveStatus,
    hasOptions: safeActionCodes.length > 0,
    strategyStatementCount: stepId === "strategy" ? statementCount : 0,
  });

  const dreamExplainerPrompt =
    stepId === "dream" &&
    activeSpecialist === "DreamExplainer" &&
    !isOfftopic &&
    menuId === "DREAM_EXPLAINER_MENU_SWITCH_SELF"
      ? stripStructuredChoiceLinesForPrompt(
          String((specialistForDisplay as any).question || "").trim(),
          state
        )
      : "";
  const fallbackPrompt =
    isSemanticInvariantsV1Enabled() &&
    (effectiveStatus === "no_output" || effectiveStatus === "incomplete_output") &&
    !String(headline || "").trim()
      ? interactiveAskPromptFallback(state, stepId)
      : "";
  const question =
    wordingPending && wordingPresentation === "picker"
      ? ""
      : stripStructuredChoiceLinesForPrompt(dreamExplainerPrompt || headline || fallbackPrompt, state);
  const contractId = buildContractId(stepId, effectiveStatus, menuId);
  const textKeys = buildContractTextKeys({ stepId, status: effectiveStatus, menuId });
  const pendingCanonicalValue =
    wordingPending && wordingPresentation === "canonical"
      ? String((specialistForDisplay as any).wording_choice_agent_current || specialistForDisplay.refined_formulation || "")
        .trim()
      : "";
  const explicitFeedbackReasonForDisplay =
    wordingChoiceSelected === "user"
      ? ""
      : String((specialistForDisplay as any).feedback_reason_text || "").trim();
  const feedbackReasonForDisplay =
    explicitFeedbackReasonForDisplay ||
    inferSingleValueFeedbackReason({
      stepId,
      message: String(message || ""),
      heading: singleValueConfirmHeading(stepId, state),
      canonicalValue: pendingCanonicalValue || canonicalAcceptedValue,
    });
  let messageForDisplay =
    isSemanticInvariantsV1Enabled() &&
    wordingPending &&
    wordingPresentation === "picker" &&
    !String(message || "").trim()
      ? uiStringFromState(
          state,
          "wording.choice.context.default",
          ""
        )
      : message;
  if (wordingPending && wordingPresentation === "canonical" && pendingCanonicalValue) {
    messageForDisplay = singleValueSupportText({
      message: messageForDisplay,
      heading: singleValueConfirmHeading(stepId, state),
      canonicalValue: pendingCanonicalValue,
      feedbackReasonText: feedbackReasonForDisplay,
    });
  }
  const useSingleValueConfirmSsot =
    shouldEnforceConfirmVisibility &&
    Boolean(canonicalAcceptedValue) &&
    effectiveStatus === "valid_output" &&
    !isOfftopic &&
    !wordingPending &&
    !recapRequested;
  if (useSingleValueConfirmSsot) {
    const canonicalMessage = singleValueConfirmCanonicalMessage(stepId, state, canonicalAcceptedValue);
    messageForDisplay = feedbackReasonForDisplay
      ? `${feedbackReasonForDisplay}\n\n${canonicalMessage}`.trim()
      : canonicalMessage;
  } else if (shouldEnforceConfirmVisibility && canonicalAcceptedValue && !wordingPending) {
    messageForDisplay = ensureCanonicalContextBlockInMessage({
      message: messageForDisplay,
      canonicalValue: canonicalAcceptedValue,
      heading: offTopicCurrentContextHeading(stepId, state),
    });
  }
  const singleValueUiCanonicalValue = (() => {
    if (recapRequested) return "";
    if (isOfftopic) return "";
    if (
      !wordingPending &&
      effectiveStatus === "valid_output" &&
      canonicalAcceptedValue &&
      SINGLE_VALUE_STRUCTURED_CONTENT_STEPS.has(stepId)
    ) {
      return canonicalAcceptedValue;
    }
    return "";
  })();
  const singleValueUiContent = buildSingleValueUiContent({
    stepId,
    state,
    specialist: specialistForDisplay,
    message: messageForDisplay,
    canonicalValue: singleValueUiCanonicalValue,
    feedbackReasonText: feedbackReasonForDisplay,
  });

  const {
    ui_content: _staleUiContent,
    ...specialistForDisplayWithoutUiContent
  } = specialistForDisplay as Record<string, unknown>;

  const nextSpecialist: Record<string, unknown> = {
    ...specialistForDisplayWithoutUiContent,
    action: "ASK",
    message: messageForDisplay,
    question,
    ui_show_step_intro_chrome: showStepIntroChrome,
    ...(singleValueUiContent ? { ui_content: singleValueUiContent } : {}),
    ...((useSingleValueConfirmSsot || recapRequested) ? { __suppress_refined_append: "true" } : {}),
    ui_contract_id: contractId,
    ui_contract_version: UI_CONTRACT_VERSION,
    ui_text_keys: textKeys,
  };

  return {
    status: effectiveStatus,
    confirmEligible: effectiveConfirmEligible,
    specialist: nextSpecialist,
    uiActionCodes: safeActionCodes,
    uiActions: buildRenderedActions(menuId, safeActionCodes, safeLabels, safeLabelKeys),
    contractId,
    contractVersion: UI_CONTRACT_VERSION,
    textKeys,
  };
}
