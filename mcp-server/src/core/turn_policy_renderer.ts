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

function computeStatus(
  stepId: string,
  state: CanvasState,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): { status: TurnOutputStatus; confirmEligible: boolean; recapBody: string } {
  if (stepId === "step_0") {
    const finalLine = String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, specialist, prev);
    const parsed = parseStep0Line(finalLine);
    const hasAny = Boolean(parsed.venture || parsed.name || parsed.status);
    const valid =
      Boolean(parsed.venture) &&
      Boolean(parsed.name) &&
      (parsed.status === "existing" || parsed.status === "starting");
    if (!hasAny) return { status: "no_output", confirmEligible: false, recapBody: "" };
    const recap = [
      `Venture: ${parsed.venture || "-"}`,
      `Name: ${parsed.name || "-"}`,
      `Status: ${parsed.status || "-"}`,
    ].join("\n");
    if (valid) return { status: "valid_output", confirmEligible: true, recapBody: recap };
    return { status: "incomplete_output", confirmEligible: false, recapBody: recap };
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
        };
      }
      return { status: "no_output", confirmEligible: false, recapBody: "" };
    }
    if (dreamMode === "builder_scoring") {
      return {
        status: "no_output",
        confirmEligible: false,
        recapBody: statementBullets || candidate || finalValue,
      };
    }
    if (dreamMode === "builder_refine") {
      if (candidate || finalValue) {
        return {
          status: "valid_output",
          confirmEligible: true,
          recapBody: candidate || finalValue,
        };
      }
      return {
        status: statementCount > 0 ? "incomplete_output" : "no_output",
        confirmEligible: false,
        recapBody: statementBullets || finalValue,
      };
    }

    const dreamValue = finalValue || candidate;
    if (dreamValue) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: dreamValue,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "" };
  }

  if (stepId === "strategy") {
    if (finalValue || statementCount >= 5) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: finalValue || statementBullets || candidate,
      };
    }
    if (statementCount > 0 || candidate) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: statementBullets || candidate,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "" };
  }

  if (stepId === "rulesofthegame") {
    if (finalValue || statementCount >= 3) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: finalValue || statementBullets || candidate,
      };
    }
    if (statementCount > 0 || candidate) {
      return {
        status: "incomplete_output",
        confirmEligible: false,
        recapBody: statementBullets || candidate,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "" };
  }

  if (stepId === "productsservices") {
    if (finalValue || statementCount > 0 || candidate) {
      return {
        status: "valid_output",
        confirmEligible: true,
        recapBody: finalValue || statementBullets || candidate,
      };
    }
    return { status: "no_output", confirmEligible: false, recapBody: "" };
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
    return { status: "valid_output", confirmEligible: true, recapBody: candidate };
  }

  if (finalValue) {
    return { status: "valid_output", confirmEligible: true, recapBody: finalValue };
  }
  if (candidate) {
    return { status: "incomplete_output", confirmEligible: false, recapBody: candidate };
  }
  return { status: "no_output", confirmEligible: false, recapBody: "" };
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
  const phaseMap = (state as any).__ui_phase_by_step && typeof (state as any).__ui_phase_by_step === "object"
    ? ((state as any).__ui_phase_by_step as Record<string, unknown>)
    : {};
  const phaseMenu = ignorePhaseForOfftopicNoOutput ? "" : parseMenuFromContractId(phaseMap[stepId], stepId);
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
  const actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
  if (actionCodes.length === 0) return { menuId: "", actionCodes: [], labels: [] };

  const labels = labelsForMenu(menuId, actionCodes, specialist, prev);
  if (labels.length !== actionCodes.length) return { menuId: "", actionCodes: [], labels: [] };

  return { menuId, actionCodes, labels };
}

export function renderFreeTextTurnPolicy(params: TurnPolicyRenderParams): TurnPolicyRenderResult {
  const { stepId, state } = params;
  const specialist = params.specialist || {};
  const prev = params.previousSpecialist || {};
  const activeSpecialist = String((state as any).active_specialist ?? "").trim();
  const stepLabel = STEP_LABELS[stepId] || "Current step";
  const companyName = companyNameForPrompt(state);

  const isOfftopic = specialist.is_offtopic === true;
  const statusSource = isOfftopic ? prev : specialist;
  const { status, confirmEligible, recapBody } = computeStatus(stepId, state, statusSource, prev);
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
  const message = (() => {
    if (
      isOfftopic &&
      stepId !== "step_0" &&
      effectiveStatus !== "no_output" &&
      recapText
    ) {
      if (!answerText) return recapText;
      const answerKey = answerText.toLowerCase().replace(/\s+/g, " ").trim();
      const recapKey = recapText.toLowerCase().replace(/\s+/g, " ").trim();
      if (recapKey && answerKey.includes(recapKey)) return answerText;
      return `${answerText}\n\n${recapText}`.trim();
    }
    return answerText || (effectiveStatus === "valid_output" ? recapText : "");
  })();

  if (stepId === "step_0") {
    const parsedStep0 = parseStep0Line(
      String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, statusSource, prev)
    );
    const step0Message = (() => {
      const preserveSpecialistMessage =
        isOfftopic ||
        isStep0MetaMessage(answerText) ||
        String((specialistForDisplay as any).wants_recap || "").toLowerCase() === "true";
      if (preserveSpecialistMessage && answerText) return answerText;
      return STEP0_CARDDESC_EN;
    })();
    const step0MenuId = effectiveStatus === "valid_output" ? "STEP0_MENU_READY_START" : "";
    const step0ActionCodes = step0MenuId
      ? ((ACTIONCODE_REGISTRY.menus[step0MenuId] || []).map((code) => String(code || "").trim()).filter(Boolean))
      : [];
    const step0Labels = step0MenuId
      ? labelsForMenu(step0MenuId, step0ActionCodes, specialist, prev)
      : [];
    const step0Headline = effectiveStatus === "valid_output"
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
      menu_id: step0MenuId,
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

  const specialistForMenu =
    isOfftopic && effectiveStatus === "no_output"
      ? { ...specialistForDisplay, menu_id: "" }
      : specialistForDisplay;
  const prevForMenu =
    isOfftopic && effectiveStatus === "no_output"
      ? { ...prev, menu_id: "" }
      : prev;

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
    stepLabel,
    companyName,
    status: effectiveStatus,
    hasOptions: safeActionCodes.length > 0,
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
    menu_id: safeActionCodes.length > 0 ? menuId : "",
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
