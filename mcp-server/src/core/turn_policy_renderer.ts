import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import { MENU_LABELS } from "./menu_contract.js";
import type { CanvasState } from "./state.js";
import { actionCodeToIntent } from "../adapters/actioncode_to_intent.js";
import type { RenderedAction } from "../contracts/ui_actions.js";

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

const STEP0_NO_OUTPUT_RECAP_EN = "We did not validate your business and name yet";
const STEP0_NO_OUTPUT_PROMPT_EN =
  "What type of business are you starting or running, and what is the name? If you don't have a name yet, you can say 'TBD'.";
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

const DEFAULT_MENU_BY_STATUS: Record<string, Record<TurnOutputStatus, string>> = {
  dream: {
    no_output: "DREAM_MENU_INTRO",
    incomplete_output: "DREAM_MENU_INTRO",
    valid_output: "DREAM_MENU_REFINE",
  },
  purpose: {
    no_output: "PURPOSE_MENU_INTRO",
    incomplete_output: "PURPOSE_MENU_EXPLAIN",
    valid_output: "PURPOSE_MENU_REFINE",
  },
  bigwhy: {
    no_output: "BIGWHY_MENU_INTRO",
    incomplete_output: "BIGWHY_MENU_A",
    valid_output: "BIGWHY_MENU_REFINE",
  },
  role: {
    no_output: "ROLE_MENU_INTRO",
    incomplete_output: "ROLE_MENU_INTRO",
    valid_output: "ROLE_MENU_REFINE",
  },
  entity: {
    no_output: "ENTITY_MENU_INTRO",
    incomplete_output: "ENTITY_MENU_FORMULATE",
    valid_output: "ENTITY_MENU_EXAMPLE",
  },
  strategy: {
    no_output: "STRATEGY_MENU_INTRO",
    incomplete_output: "STRATEGY_MENU_ASK",
    valid_output: "STRATEGY_MENU_CONFIRM",
  },
  targetgroup: {
    no_output: "TARGETGROUP_MENU_INTRO",
    incomplete_output: "TARGETGROUP_MENU_EXPLAIN_MORE",
    valid_output: "TARGETGROUP_MENU_POSTREFINE",
  },
  productsservices: {
    no_output: "PRODUCTSSERVICES_MENU_CONFIRM",
    incomplete_output: "PRODUCTSSERVICES_MENU_CONFIRM",
    valid_output: "PRODUCTSSERVICES_MENU_CONFIRM",
  },
  rulesofthegame: {
    no_output: "RULES_MENU_INTRO",
    incomplete_output: "RULES_MENU_ASK_EXPLAIN",
    valid_output: "RULES_MENU_CONFIRM",
  },
  presentation: {
    no_output: "PRESENTATION_MENU_ASK",
    incomplete_output: "PRESENTATION_MENU_ASK",
    valid_output: "PRESENTATION_MENU_ASK",
  },
};

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

function parseNumberedOptions(question: unknown): string[] {
  const text = String(question || "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([1-9])[\)\.]\s+(.+)$/);
    if (!m) continue;
    const idx = Number(m[1]);
    if (idx !== out.length + 1) break;
    out.push(m[2].trim());
  }
  return out;
}

function buildNumberedPrompt(labels: string[], headline: string): string {
  const numbered = labels.map((label, idx) => `${idx + 1}) ${label}`);
  if (!numbered.length) return headline;
  return `${numbered.join("\n")}\n\n${headline}`.trim();
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
  if (actionCode === "ACTION_CONFIRM_CONTINUE") return true;
  if (entry.route === "yes") return true;
  const upper = actionCode.toUpperCase();
  return upper.includes("_CONFIRM") || upper.includes("FINAL_CONTINUE");
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
  const finalValue = finalField ? String((state as any)[finalField] ?? "").trim() : "";
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
    const activeSpecialist = String((state as any).active_specialist ?? "").trim();
    const menuId = String(specialist.menu_id ?? "").trim().toUpperCase();
    const isDreamExplainerContext =
      activeSpecialist === "DreamExplainer" || menuId.startsWith("DREAM_EXPLAINER_MENU_");
    if (!isDreamExplainerContext) {
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

  if (finalValue) {
    return { status: "valid_output", confirmEligible: true, recapBody: finalValue };
  }
  if (candidate) {
    return { status: "incomplete_output", confirmEligible: false, recapBody: candidate };
  }
  return { status: "no_output", confirmEligible: false, recapBody: "" };
}

function pickMenuId(
  stepId: string,
  status: TurnOutputStatus,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): string {
  const currentMenu = String(specialist.menu_id ?? "").trim();
  if (
    currentMenu &&
    !isEscapeMenu(currentMenu) &&
    ACTIONCODE_REGISTRY.menus[currentMenu] &&
    menuBelongsToStep(currentMenu, stepId)
  ) {
    return currentMenu;
  }
  const ignorePreviousMenuFallback =
    stepId === "strategy" ||
    stepId === "productsservices" ||
    stepId === "rulesofthegame";
  if (ignorePreviousMenuFallback) {
    const defaults = DEFAULT_MENU_BY_STATUS[stepId];
    if (!defaults) return "";
    return defaults[status] || "";
  }
  const prevMenu = String(prev.menu_id ?? "").trim();
  if (
    prevMenu &&
    !isEscapeMenu(prevMenu) &&
    ACTIONCODE_REGISTRY.menus[prevMenu] &&
    menuBelongsToStep(prevMenu, stepId)
  ) {
    return prevMenu;
  }
  const defaults = DEFAULT_MENU_BY_STATUS[stepId];
  if (!defaults) return "";
  return defaults[status] || "";
}

function labelsForMenu(
  menuId: string,
  actionCodes: string[],
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): string[] {
  if (!menuId || actionCodes.length <= 0) return [];

  const fullActionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId])
    ? ACTIONCODE_REGISTRY.menus[menuId]
    : [];
  if (fullActionCodes.length === 0) return [];

  const pickAllLabels = (): string[] => {
    const currentMenu = String(specialist.menu_id ?? "").trim();
    if (currentMenu === menuId) {
      const parsed = parseNumberedOptions(specialist.question);
      if (parsed.length >= fullActionCodes.length) return parsed.slice(0, fullActionCodes.length);
    }
    const prevMenu = String(prev.menu_id ?? "").trim();
    if (prevMenu === menuId) {
      const parsed = parseNumberedOptions(prev.question);
      if (parsed.length >= fullActionCodes.length) return parsed.slice(0, fullActionCodes.length);
    }
    const fallback = MENU_LABELS[menuId] || [];
    if (fallback.length >= fullActionCodes.length) return fallback.slice(0, fullActionCodes.length);
    return [];
  };

  const allLabels = pickAllLabels();
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

const RESILIENT_FALLBACK_MENUS: Record<string, string[]> = {
  strategy: [
    "STRATEGY_MENU_CONFIRM",
    "STRATEGY_MENU_ASK",
    "STRATEGY_MENU_REFINE",
    "STRATEGY_MENU_INTRO",
  ],
  rulesofthegame: [
    "RULES_MENU_CONFIRM",
    "RULES_MENU_ASK_EXPLAIN",
    "RULES_MENU_EXAMPLE_ONLY",
    "RULES_MENU_INTRO",
  ],
  productsservices: ["PRODUCTSSERVICES_MENU_CONFIRM"],
  purpose: [
    "PURPOSE_MENU_REFINE",
    "PURPOSE_MENU_EXPLAIN",
    "PURPOSE_MENU_EXAMPLES",
    "PURPOSE_MENU_INTRO",
  ],
  role: ["ROLE_MENU_REFINE", "ROLE_MENU_ASK", "ROLE_MENU_INTRO", "ROLE_MENU_EXAMPLES"],
  entity: ["ENTITY_MENU_EXAMPLE", "ENTITY_MENU_FORMULATE", "ENTITY_MENU_INTRO"],
};

function resolveMenuContract(params: {
  stepId: string;
  status: TurnOutputStatus;
  confirmEligible: boolean;
  specialist: Record<string, unknown>;
  prev: Record<string, unknown>;
}): { menuId: string; actionCodes: string[]; labels: string[] } {
  const { stepId, status, confirmEligible, specialist, prev } = params;
  const preferredMenu = pickMenuId(stepId, status, specialist, prev);
  const defaults = DEFAULT_MENU_BY_STATUS[stepId];
  const defaultMenu = defaults ? String(defaults[status] || "").trim() : "";
  const fallbackMenus = Array.isArray(RESILIENT_FALLBACK_MENUS[stepId]) ? RESILIENT_FALLBACK_MENUS[stepId] : [];
  const menuCandidates: string[] = [];
  const pushMenu = (menuId: string): void => {
    const id = String(menuId || "").trim();
    if (!id) return;
    if (isEscapeMenu(id)) return;
    if (!ACTIONCODE_REGISTRY.menus[id]) return;
    if (!menuBelongsToStep(id, stepId)) return;
    if (!menuCandidates.includes(id)) menuCandidates.push(id);
  };
  pushMenu(preferredMenu);
  pushMenu(defaultMenu);
  for (const menu of fallbackMenus) pushMenu(menu);

  const mismatches: Array<{ menu_id: string; actions: number; labels: number }> = [];
  for (const menuId of menuCandidates) {
    const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId]) ? ACTIONCODE_REGISTRY.menus[menuId] : [];
    const actionCodes = allActions.filter((code) => (confirmEligible ? true : !isConfirmActionCode(code)));
    if (actionCodes.length === 0) continue;
    const labels = labelsForMenu(menuId, actionCodes, specialist, prev);
    if (labels.length === actionCodes.length) {
      return { menuId, actionCodes, labels };
    }
    mismatches.push({ menu_id: menuId, actions: actionCodes.length, labels: labels.length });
  }

  if (mismatches.length > 0 && (process.env.GLOBAL_TURN_POLICY_DEBUG === "1" || process.env.LOCAL_DEV === "1")) {
    console.log("[menu_contract_gap]", {
      step: stepId,
      status,
      preferred_menu: preferredMenu,
      default_menu: defaultMenu,
      candidates: menuCandidates,
      mismatches,
    });
  }
  return { menuId: "", actionCodes: [], labels: [] };
}

export function renderFreeTextTurnPolicy(params: TurnPolicyRenderParams): TurnPolicyRenderResult {
  const { stepId, state } = params;
  const specialist = params.specialist || {};
  const prev = params.previousSpecialist || {};
  const stepLabel = STEP_LABELS[stepId] || "Current step";
  const companyName = companyNameForPrompt(state);

  const { status, confirmEligible, recapBody } = computeStatus(stepId, state, specialist, prev);
  const isOfftopic = specialist.is_offtopic === true;
  const candidateText = extractCandidate(stepId, specialist, prev);
  const statementOfftopicSteps = new Set(["dream", "purpose", "bigwhy", "role", "entity", "targetgroup", "presentation"]);
  const promoteIncompleteToValidForOfftopic =
    isOfftopic &&
    status === "incomplete_output" &&
    !confirmEligible &&
    statementOfftopicSteps.has(stepId) &&
    Boolean(candidateText);
  const effectiveStatus: TurnOutputStatus = promoteIncompleteToValidForOfftopic ? "valid_output" : status;
  const effectiveConfirmEligible = promoteIncompleteToValidForOfftopic ? true : confirmEligible;

  const headlinePrefix =
    isOfftopic
      ? (effectiveStatus === "no_output" ? "Define" : "Continue with")
      : effectiveStatus === "valid_output"
        ? "Refine"
        : effectiveStatus === "incomplete_output"
          ? "Add more"
          : "Define";
  const headlineBase = `${headlinePrefix} your ${stepLabel} for ${companyName}`;

  const answerText = String(specialist.message ?? "").trim() || String(specialist.refined_formulation ?? "").trim();
  const recap = status === "no_output"
    ? `We have not yet defined ${stepLabel}.`
    : `<strong>This is what we have established so far based on our dialogue:</strong>\n${recapBody}`.trim();
  const message = [answerText, recap].filter(Boolean).join("\n\n").trim();

  if (stepId === "step_0") {
    const parsedStep0 = parseStep0Line(
      String((state as any).step_0_final ?? "").trim() || extractCandidate(stepId, specialist, prev)
    );
    const step0Recap = status === "no_output"
      ? STEP0_NO_OUTPUT_RECAP_EN
      : `<strong>This is what we have established so far based on our dialogue:</strong>\n${recapBody}`.trim();
    const step0Message = [answerText, step0Recap].filter(Boolean).join("\n\n").trim();
    const confirmQuestion = confirmEligible
      ? step0ConfirmQuestion(parsedStep0.venture, parsedStep0.name)
      : "";
    const step0Specialist: Record<string, unknown> = {
      ...specialist,
      action: confirmEligible ? "CONFIRM" : "ASK",
      message: step0Message,
      question: confirmEligible ? "" : STEP0_NO_OUTPUT_PROMPT_EN,
      confirmation_question: confirmQuestion,
      menu_id: "",
    };
    return {
      status: effectiveStatus,
      confirmEligible,
      specialist: step0Specialist,
      uiActionCodes: [],
      uiActions: [],
    };
  }

  const resolved = resolveMenuContract({
    stepId,
    status: effectiveStatus,
    confirmEligible: effectiveConfirmEligible,
    specialist,
    prev,
  });
  const menuId = resolved.menuId;
  const safeActionCodes = resolved.actionCodes;
  const safeLabels = resolved.labels;
  const headline = safeActionCodes.length > 0
    ? `${headlineBase} or choose an option.`
    : `${headlineBase}.`;

  const question = buildNumberedPrompt(safeLabels, headline);

  const nextSpecialist: Record<string, unknown> = {
    ...specialist,
    action: "ASK",
    message,
    question,
    confirmation_question: "",
    menu_id: safeActionCodes.length > 0 ? menuId : "",
  };

  return {
    status: effectiveStatus,
    confirmEligible: effectiveConfirmEligible,
    specialist: nextSpecialist,
    uiActionCodes: safeActionCodes,
    uiActions: buildRenderedActions(safeActionCodes, safeLabels),
  };
}
