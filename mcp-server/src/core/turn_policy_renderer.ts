import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { MENU_LABELS } from "./menu_contract.js";
import type { CanvasState } from "./state.js";
import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import {
  DEFAULT_MENU_BY_STATUS,
  UI_CONTRACT_VERSION,
  buildContractId,
  buildContractTextKeys,
  buildHeadlineForContract,
} from "./ui_contract_matrix.js";

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

const STEP_LABELS: Record<string, string> = {
  step_0: "Step 0",
  dream: "Dream",
  purpose: "Purpose",
  bigwhy: "Big Why",
  role: "Role",
  entity: "Entity",
  strategy: "Strategy",
  targetgroup: "Target Group",
  productsservices: "Products and Services",
  rulesofthegame: "Rules of the Game",
  presentation: "Presentation",
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

const STEP0_NO_OUTPUT_PROMPT_EN =
  "To get started, could you tell me what type of business you are running or want to start, and what the name is (or just say 'TBD' if you don't know the name yet)?";
const STEP0_CARDDESC_EN = "Just to set the context, we'll start with the basics.";
const STEP0_CONFIRM_SUFFIX_EN = "Are you ready to start with the first step: the Dream?";

const FINAL_FIELD_BY_STEP: Record<string, string> = {
  step_0: "step_0_final",
  dream: "dream_final",
  purpose: "purpose_final",
  bigwhy: "bigwhy_final",
  role: "role_final",
  entity: "entity_final",
  strategy: "strategy_final",
  targetgroup: "targetgroup_final",
  productsservices: "productsservices_final",
  rulesofthegame: "rulesofthegame_final",
  presentation: "presentation_brief_final",
};

type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

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

function buildNumberedPrompt(labels: string[], headline: string): string {
  const numbered = labels.map((label, idx) => `${idx + 1}) ${label}`);
  if (!numbered.length) return headline;
  return `${numbered.join("\n")}\n\n${headline}`.trim();
}

function stripStructuredChoiceLinesForPrompt(promptRaw: string): string {
  const chooserNoise = [
    /^(please\s+)?(choose|pick|select)\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+an?\s+option(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
    /^choose\s+an?\s+option\s+by\s+typing\s+.+$/i,
  ];
  const kept = String(promptRaw || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => !/^[1-9][\)\.]\s*/.test(line))
    .filter((line) => !chooserNoise.some((pattern) => pattern.test(line)));
  return kept.join("\n").trim();
}

function buildRenderedActions(actionCodes: string[], labels: string[]): RenderedAction[] {
  return actionCodes.map((code, idx) => {
    const entry = ACTIONCODE_REGISTRY.actions[code];
    const route = String(entry?.route || code).trim();
    return {
      id: `${code}:${idx + 1}`,
      label: String(labels[idx] || code).trim() || code,
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

function parseMenuFromContractId(contractIdRaw: unknown, stepId: string): string {
  const contractId = String(contractIdRaw || "").trim();
  if (!contractId) return "";
  const parts = contractId.split(":");
  if (parts.length < 3) return "";
  const [contractStep, , ...menuParts] = parts;
  if (String(contractStep || "").trim() !== stepId) return "";
  const menuId = menuParts.join(":").trim();
  if (!menuId || menuId === "NO_MENU") return "";
  return menuId;
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
  if (!raw || raw === "TBD") return "<your future company>";
  return raw;
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

function ensureSentenceEnd(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function offTopicStepLabel(stepId: string, state: CanvasState): string {
  const key = OFFTOPIC_STEP_LABEL_UI_KEY_BY_STEP[stepId] || "";
  if (!key) return STEP_LABELS[stepId] || "Current step";
  return uiStringFromState(state, key, STEP_LABELS[stepId] || "Current step");
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
  return uiStringFromState(state, "offtopic.companyFallback", "your future company");
}

function offTopicCurrentContextHeading(stepId: string, state: CanvasState): string {
  const template = uiStringFromState(state, "offtopic.current.template", "The current {0} of {1} is.");
  return ensureSentenceEnd(
    formatIndexedTemplate(template, [
      offTopicStepLabel(stepId, state),
      offTopicCompanyName(state),
    ]).trim()
  );
}

function strategySummaryLine(state: CanvasState, count: number): string {
  const template = uiStringFromState(
    state,
    "strategy.focuspoints.count.template",
    "You now have {0} focus points within your strategy. I advise you to formulate at least 4 but maximum 7 focus points."
  );
  return ensureSentenceEnd(formatIndexedTemplate(template, [String(count)]).trim());
}

function strategyOverflowWarningLine(state: CanvasState): string {
  const template = uiStringFromState(
    state,
    "strategy.focuspoints.warning.template",
    "I strongly advice you to only add a maximum of 7 focus points. can I consolidate this for you?"
  );
  return ensureSentenceEnd(template.trim());
}

function strategyCurrentHeading(state: CanvasState): string {
  const template = uiStringFromState(
    state,
    "strategy.current.template",
    "Your current Strategy for {0} is:"
  );
  return ensureSentenceEnd(formatIndexedTemplate(template, [companyNameForPrompt(state)]).trim());
}

function buildStrategyContextBlock(state: CanvasState, statements: string[]): string {
  const deduped = dedupeStatements(statements);
  if (deduped.length === 0) return "";
  const parts: string[] = [strategySummaryLine(state, deduped.length)];
  if (deduped.length > 7) {
    parts.push(strategyOverflowWarningLine(state));
  }
  parts.push(strategyCurrentHeading(state));
  parts.push(...deduped.map((line) => `- ${line}`));
  return parts.join("\n");
}

function comparableText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function englishIndefiniteArticle(nounPhrase: string): "a" | "an" {
  const lower = String(nounPhrase || "").trim().toLowerCase();
  if (!lower) return "a";
  return /^[aeiou]/.test(lower) ? "an" : "a";
}

function step0ConfirmQuestion(venture: string, name: string): string {
  const cleanVenture = String(venture || "").trim();
  const cleanName = String(name || "").trim();
  if (cleanVenture && cleanName) {
    return `You have ${englishIndefiniteArticle(cleanVenture)} ${cleanVenture} called ${cleanName}. ${STEP0_CONFIRM_SUFFIX_EN}`;
  }
  return STEP0_CONFIRM_SUFFIX_EN;
}

function isStep0MetaMessage(message: string): boolean {
  const lower = String(message || "").toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("bensteenstra.com") ||
    lower.includes("ben steenstra") ||
    lower.includes("now, back to the business strategy canvas builder")
  );
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

function extractStatementCount(
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): number {
  const currentStatements = Array.isArray(specialist.statements) ? specialist.statements : [];
  if (currentStatements.length) return currentStatements.length;
  const prevStatements = Array.isArray(prev.statements) ? prev.statements : [];
  return prevStatements.length;
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

function strategyStatementsFromSources(
  state: CanvasState,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>,
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
    provisionalForStep(state, "strategy"),
    String((state as any).strategy_final || "").trim(),
  ];
  for (const candidate of candidates) {
    const parsed = parseStrategyStatementsFromText(candidate);
    if (parsed.length > 0) return parsed;
  }
  return [];
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
      `Venture: ${parsed.venture || "-"}`,
      `Name: ${parsed.name || "-"}`,
      `Status: ${parsed.status || "-"}`,
    ].join("\n");
    if (valid) return { status: "valid_output", confirmEligible: true, recapBody: recap, statementCount: 0 };
    return { status: "incomplete_output", confirmEligible: false, recapBody: recap, statementCount: 0 };
  }

  const finalField = FINAL_FIELD_BY_STEP[stepId] || "";
  const committedFinalValue = finalField ? String((state as any)[finalField] ?? "").trim() : "";
  const provisionalValue = provisionalForStep(state, stepId);
  const finalValue = provisionalValue || committedFinalValue;
  const candidate = extractCandidate(stepId, specialist, prev);
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
      if (statementCount > 0 || candidate || finalValue) {
        return {
          status: "incomplete_output",
          confirmEligible: false,
          recapBody: statementBullets || candidate || finalValue,
          statementCount,
        };
      }
      return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
    }
    if (dreamMode === "builder_scoring") {
      return {
        status: "no_output",
        confirmEligible: false,
        recapBody: statementBullets || candidate || finalValue,
        statementCount,
      };
    }
    if (dreamMode === "builder_refine") {
      if (candidate || finalValue) {
        return {
          status: "valid_output",
          confirmEligible: true,
          recapBody: candidate || finalValue,
          statementCount,
        };
      }
      return {
        status: statementCount > 0 ? "incomplete_output" : "no_output",
        confirmEligible: false,
        recapBody: statementBullets || finalValue,
        statementCount,
      };
    }

    const dreamValue = finalValue || candidate;
    if (dreamValue) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: dreamValue,
        statementCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
  }

  if (stepId === "strategy") {
    const strategyStatements = strategyStatementsFromSources(state, specialist, prev);
    const strategyCount = strategyStatements.length;
    const strategyBullets = strategyStatements.map((line) => `• ${line}`).join("\n");
    if (strategyCount >= 4) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: strategyBullets || finalValue || candidate,
        statementCount: strategyCount,
      };
    }
    if (strategyCount > 0 || candidate) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: strategyBullets || candidate,
        statementCount: strategyCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount: 0 };
  }

  if (stepId === "rulesofthegame") {
    if (finalValue || statementCount >= 3) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: finalValue || statementBullets || candidate,
        statementCount,
      };
    }
    if (statementCount > 0 || candidate) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: statementBullets || candidate,
        statementCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
  }

  if (stepId === "productsservices") {
    if (finalValue || statementCount > 0 || candidate) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: finalValue || statementBullets || candidate,
        statementCount,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
  }

  const candidateDrivenValidSteps = new Set([
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "targetgroup",
    "presentation",
  ]);
  if (candidate && candidateDrivenValidSteps.has(stepId)) {
    return { status: "valid_output", confirmEligible: true, recapBody: candidate, statementCount };
  }

  if (finalValue) {
    return { status: "valid_output", confirmEligible: true, recapBody: finalValue, statementCount };
  }
  if (candidate) {
    return { status: "incomplete_output", confirmEligible: false, recapBody: candidate, statementCount };
  }
  return { status: "no_output", confirmEligible: false, recapBody: "", statementCount };
}

function labelsForMenu(
  menuId: string,
  actionCodes: string[],
  _specialist: Record<string, unknown>,
  _prev: Record<string, unknown>
): string[] {
  if (!menuId || actionCodes.length <= 0) return [];

  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId]
    : [];
  if (fullActionCodes.length === 0) return [];

  const allLabels = (MENU_LABELS[menuId] || []).slice(0, fullActionCodes.length);
  if (allLabels.length !== fullActionCodes.length) return [];

  const usedIndices = new Set<number>();
  const filteredLabels: string[] = [];
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
    filteredLabels.push(String(allLabels[matchedIndex] || "").trim());
  }
  if (filteredLabels.some((label) => !label)) return [];
  return filteredLabels;
}

function resolveMenuContract(params: {
  stepId: string;
  status: TurnOutputStatus;
  confirmEligible: boolean;
  state: CanvasState;
  specialist: Record<string, unknown>;
  prev: Record<string, unknown>;
}): { menuId: string; actionCodes: string[]; labels: string[] } {
  const { stepId, status, confirmEligible, state, specialist, prev } = params;
  if (renderModeForStep(state, stepId) === "no_buttons") {
    return { menuId: "", actionCodes: [], labels: [] };
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
      return { menuId: "", actionCodes: [], labels: [] };
    }
    if (forcedMenuId) {
      const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[forcedMenuId])
        ? ACTIONCODE_REGISTRY.menus[forcedMenuId]
        : [];
      if (allActions.length === 0) return { menuId: "", actionCodes: [], labels: [] };
      const actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
      if (actionCodes.length === 0) return { menuId: "", actionCodes: [], labels: [] };
      const labels = labelsForMenu(forcedMenuId, actionCodes, specialist, prev);
      if (labels.length !== actionCodes.length) return { menuId: "", actionCodes: [], labels: [] };
      return { menuId: forcedMenuId, actionCodes, labels };
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
  const specialistPhaseMenu = parseMenuFromContractId((specialist as any).ui_contract_id, stepId);
  const previousPhaseMenu = parseMenuFromContractId((prev as any).ui_contract_id, stepId);
  const phaseMenu = (ignorePhaseForOfftopicNoOutput || forceDefaultMenuForValidOutput)
    ? ""
    : parseMenuFromContractId(phaseMap[stepId], stepId) || specialistPhaseMenu || previousPhaseMenu;
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
  if (!menuIsValidForStep(menuId)) {
    menuId = menuIsValidForStep(defaultMenu) ? defaultMenu : "";
  }

  if (!menuId || isEscapeMenu(menuId)) return { menuId: "", actionCodes: [], labels: [] };
  if (!ACTIONCODE_REGISTRY.menus[menuId]) return { menuId: "", actionCodes: [], labels: [] };
  if (!menuBelongsToStep(menuId, stepId)) return { menuId: "", actionCodes: [], labels: [] };

  const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId]) ? ACTIONCODE_REGISTRY.menus[menuId] : [];
  let actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
  if (stepId === "strategy" && menuId === "STRATEGY_MENU_CONFIRM") {
    const strategyCount = strategyStatementsFromSources(state, specialist, prev).length;
    const overflow = strategyCount > 7;
    actionCodes = actionCodes.filter((code) => {
      const normalized = String(code || "").trim();
      if (normalized === "ACTION_STRATEGY_REFINE_EXPLAIN_MORE") return !overflow;
      if (normalized === "ACTION_STRATEGY_CONSOLIDATE") return overflow;
      return true;
    });
  }
  if (actionCodes.length === 0) return { menuId: "", actionCodes: [], labels: [] };

  const labels = labelsForMenu(menuId, actionCodes, specialist, prev);
  if (labels.length !== actionCodes.length) return { menuId: "", actionCodes: [], labels: [] };

  return { menuId, actionCodes, labels };
}

export function renderFreeTextTurnPolicy(params: TurnPolicyRenderParams): TurnPolicyRenderResult {
  const { stepId, state } = params;
  const specialist = params.specialist || {};
  const prev = params.previousSpecialist || {};
  const sourceAction = String((specialist as any).action || "").trim().toUpperCase();
  const showStepIntroChrome = stepId !== "step_0" && sourceAction === "INTRO";
  const activeSpecialist = String((state as any).active_specialist ?? "").trim();
  const stepLabel = STEP_LABELS[stepId] || "Current step";
  const companyName = companyNameForPrompt(state);

  const isOfftopic = specialist.is_offtopic === true;
  const statusSource = isOfftopic ? prev : specialist;
  const { status, confirmEligible, recapBody, statementCount } = computeStatus(stepId, state, statusSource, prev);
  const candidateText = extractCandidate(stepId, statusSource, prev);
  const statementOfftopicSteps = new Set(["dream", "purpose", "bigwhy", "role", "entity", "targetgroup", "presentation"]);
  const promoteIncompleteToValidForOfftopic =
    isOfftopic &&
    status === "incomplete_output" &&
    !confirmEligible &&
    statementOfftopicSteps.has(stepId) &&
    Boolean(candidateText);
  const effectiveStatus: TurnOutputStatus = promoteIncompleteToValidForOfftopic ? "valid_output" : status;
  const effectiveConfirmEligible = promoteIncompleteToValidForOfftopic ? true : confirmEligible;

  const specialistForDisplay: Record<string, unknown> = { ...specialist };
  if (isOfftopic && stepId !== "step_0") {
    const field = stepId === "rulesofthegame" ? "rulesofthegame" : stepId;
    const finalField = FINAL_FIELD_BY_STEP[stepId] || "";
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

  const answerText =
    String((specialistForDisplay as any).message ?? "").trim() ||
    String((specialistForDisplay as any).refined_formulation ?? "").trim();
  const recapText = String(recapBody || "").trim();
  const offTopicContextHeading =
    isOfftopic && stepId !== "step_0" ? offTopicCurrentContextHeading(stepId, state) : "";
  const recapBlock =
    offTopicContextHeading && recapText
      ? `<strong>${offTopicContextHeading}</strong>\n${recapText}`
      : recapText;
  const strategyStatements =
    stepId === "strategy" ? strategyStatementsFromSources(state, statusSource, prev) : [];
  const strategyContextBlock =
    !isOfftopic && stepId === "strategy" && strategyStatements.length > 0
      ? buildStrategyContextBlock(state, strategyStatements)
      : "";
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
        return `${answerText}\n\n<strong>${offTopicContextHeading}</strong>`.trim();
      }
      return `${answerText}\n\n${recapBlock}`.trim();
    }
    if (strategyContextBlock) {
      if (!answerText) return strategyContextBlock;
      const answerKey = comparableText(answerText);
      const recapKey = comparableText(strategyContextBlock);
      if (recapKey && answerKey.includes(recapKey)) return answerText;
      return `${answerText}\n\n${strategyContextBlock}`.trim();
    }
    return answerText || (effectiveStatus === "valid_output" ? recapBlock : "");
  })();

  if (stepId === "step_0") {
    const parsedStep0 = parseStep0Line(
      String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, statusSource, prev)
    );
    const specialistQuestion = String((specialistForDisplay as any).question ?? "").trim();
    const step0Message = (() => {
      const preserveSpecialistMessage =
        sourceAction === "ESCAPE" ||
        isOfftopic ||
        isStep0MetaMessage(answerText) ||
        String((specialistForDisplay as any).wants_recap || "").toLowerCase() === "true";
      if (preserveSpecialistMessage && answerText) return answerText;
      return STEP0_CARDDESC_EN;
    })();
    const step0MenuId = sourceAction === "ESCAPE"
      ? ""
      : effectiveStatus === "valid_output"
        ? "STEP0_MENU_READY_START"
        : "";
    const step0ActionCodes = step0MenuId
      ? ((ACTIONCODE_REGISTRY.menus[step0MenuId] || []).map((code) => String(code || "").trim()).filter(Boolean))
      : [];
    const step0Labels = step0MenuId
      ? labelsForMenu(step0MenuId, step0ActionCodes, specialist, prev)
      : [];
    const step0Headline = sourceAction === "ESCAPE" && specialistQuestion
      ? specialistQuestion
      : effectiveStatus === "valid_output"
        ? step0ConfirmQuestion(parsedStep0.venture, parsedStep0.name)
        : STEP0_NO_OUTPUT_PROMPT_EN;
    const step0Question = step0ActionCodes.length > 0
      ? buildNumberedPrompt(step0Labels, step0Headline)
      : step0Headline;
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
      uiActions: buildRenderedActions(step0ActionCodes, step0Labels),
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
  const safeActionCodes = resolved.actionCodes;
  const safeLabels = resolved.labels;
  const headline = buildHeadlineForContract({
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
      ? stripStructuredChoiceLinesForPrompt(String((specialistForDisplay as any).question || "").trim())
      : "";
  const question = buildNumberedPrompt(safeLabels, dreamExplainerPrompt || headline);
  const contractId = buildContractId(stepId, effectiveStatus, menuId);
  const textKeys = buildContractTextKeys({ stepId, status: effectiveStatus, menuId });

  const nextSpecialist: Record<string, unknown> = {
    ...specialistForDisplay,
    action: "ASK",
    message,
    question,
    ui_show_step_intro_chrome: showStepIntroChrome,
    ui_contract_id: contractId,
    ui_contract_version: UI_CONTRACT_VERSION,
    ui_text_keys: textKeys,
  };

  return {
    status: effectiveStatus,
    confirmEligible: effectiveConfirmEligible,
    specialist: nextSpecialist,
    uiActionCodes: safeActionCodes,
    uiActions: buildRenderedActions(safeActionCodes, safeLabels),
    contractId,
    contractVersion: UI_CONTRACT_VERSION,
    textKeys,
  };
}
