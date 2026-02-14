import { ACTIONCODE_REGISTRY } from "./actioncode_registry.js";
import type { CanvasState } from "./state.js";

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

const MENU_LABELS: Record<string, string[]> = {
  DREAM_MENU_INTRO: [
    "Tell me more about why a dream matters",
    "Do a small exercise that helps to define your dream.",
  ],
  DREAM_MENU_REFINE: [
    "I'm happy with this wording, please continue to step 3 Purpose",
    "Do a small exercise that helps to define your dream.",
  ],
  PURPOSE_MENU_INTRO: ["Explain more about why a purpose is needed."],
  PURPOSE_MENU_EXPLAIN: [
    "Ask 3 questions to help me define the Purpose.",
    "Give 3 examples of how Purpose could sound.",
  ],
  PURPOSE_MENU_REFINE: [
    "I'm happy with this wording, please continue to next step Big Why.",
    "Refine the wording",
  ],
  BIGWHY_MENU_INTRO: [
    "Give me an example of the Big Why",
    "Explain the importance of a Big Why",
  ],
  BIGWHY_MENU_A: [
    "Ask 3 tough questions to find the Big Why.",
    "Give 3 examples of what a Big Why sounds like (universal meaning-layer, not rules, not industry slogans).",
    "Give me an example of the Big Why",
  ],
  BIGWHY_MENU_REFINE: [
    "I'm happy with this wording, continue to step 5 Role",
    "Redefine the Big Why for me please",
  ],
  ROLE_MENU_INTRO: ["Give 3 short Role examples", "Explain why a Role matters"],
  ROLE_MENU_REFINE: ["Yes, this fits.", "I want to adjust it."],
  ENTITY_MENU_INTRO: [
    "Give me an example how my entity could sound",
    "Explain why having an Entity matters",
  ],
  ENTITY_MENU_FORMULATE: ["Formulate my entity for me"],
  ENTITY_MENU_EXAMPLE: [
    "I'm happy with this wording, go to the next step Strategy.",
    "Refine the wording for me please",
  ],
  STRATEGY_MENU_INTRO: ["Explain why a Strategy matters"],
  STRATEGY_MENU_ASK: [
    "Ask me some questions to clarify my Strategy",
    "Show me an example of a Strategy for my business",
  ],
  STRATEGY_MENU_CONFIRM: [
    "I'm satisfied with my Strategy. Let's go to Rules of the Game",
  ],
  TARGETGROUP_MENU_INTRO: [
    "Explain me more about Target Groups",
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_EXPLAIN_MORE: [
    "Ask me some questions to define my specific Target Group",
  ],
  TARGETGROUP_MENU_POSTREFINE: [
    "I'm happy with this wording, continue to next step Products and Services",
    "Ask me some questions to define my specific Target Group",
  ],
  PRODUCTSSERVICES_MENU_CONFIRM: [
    "This is all what we offer, continue to step Rules of the Game",
  ],
  RULES_MENU_INTRO: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_ASK_EXPLAIN: [
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  RULES_MENU_CONFIRM: [
    "These are all my rules of the game, continue to Presentation",
    "Please explain more about Rules of the Game",
    "Give one concrete example (Rule versus poster slogan)",
  ],
  PRESENTATION_MENU_ASK: ["Create my presentation now"],
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
  if (currentMenu && !isEscapeMenu(currentMenu) && ACTIONCODE_REGISTRY.menus[currentMenu]) {
    return currentMenu;
  }
  const prevMenu = String(prev.menu_id ?? "").trim();
  if (prevMenu && !isEscapeMenu(prevMenu) && ACTIONCODE_REGISTRY.menus[prevMenu]) {
    return prevMenu;
  }
  const defaults = DEFAULT_MENU_BY_STATUS[stepId];
  if (!defaults) return "";
  return defaults[status] || "";
}

function labelsForMenu(
  menuId: string,
  expectedCount: number,
  specialist: Record<string, unknown>,
  prev: Record<string, unknown>
): string[] {
  if (!menuId || expectedCount <= 0) return [];
  const currentMenu = String(specialist.menu_id ?? "").trim();
  if (currentMenu === menuId) {
    const parsed = parseNumberedOptions(specialist.question);
    if (parsed.length >= expectedCount) return parsed.slice(0, expectedCount);
  }
  const prevMenu = String(prev.menu_id ?? "").trim();
  if (prevMenu === menuId) {
    const parsed = parseNumberedOptions(prev.question);
    if (parsed.length >= expectedCount) return parsed.slice(0, expectedCount);
  }
  const fallback = MENU_LABELS[menuId] || [];
  if (fallback.length >= expectedCount) return fallback.slice(0, expectedCount);
  return [];
}

export function renderFreeTextTurnPolicy(params: TurnPolicyRenderParams): TurnPolicyRenderResult {
  const { stepId, state } = params;
  const specialist = params.specialist || {};
  const prev = params.previousSpecialist || {};
  const stepLabel = STEP_LABELS[stepId] || "Current step";
  const companyName = companyNameForPrompt(state);

  const { status, confirmEligible, recapBody } = computeStatus(stepId, state, specialist, prev);

  const headlinePrefix =
    status === "valid_output"
      ? "Refine"
      : status === "incomplete_output"
        ? "Add more"
        : "Define";
  const headline = `${headlinePrefix} your ${stepLabel} for ${companyName} or choose an option.`;

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
      status,
      confirmEligible,
      specialist: step0Specialist,
      uiActionCodes: [],
    };
  }

  const menuId = pickMenuId(stepId, status, specialist, prev);
  const allActions = Array.isArray(ACTIONCODE_REGISTRY.menus[menuId]) ? ACTIONCODE_REGISTRY.menus[menuId] : [];
  const filteredActions = allActions.filter((code) => {
    if (!confirmEligible && isConfirmActionCode(code)) return false;
    return true;
  });
  const actionCodes = filteredActions;
  const labels = labelsForMenu(menuId, actionCodes.length, specialist, prev);
  const minCount = Math.min(actionCodes.length, labels.length);
  const safeActionCodes = minCount > 0 ? actionCodes.slice(0, minCount) : [];
  const safeLabels = minCount > 0 ? labels.slice(0, minCount) : [];

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
    status,
    confirmEligible,
    specialist: nextSpecialist,
    uiActionCodes: safeActionCodes,
  };
}
