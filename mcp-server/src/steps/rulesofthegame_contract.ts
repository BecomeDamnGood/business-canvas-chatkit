export type RulesContractIntent =
  | "INTRO"
  | "ASK_COLLECT"
  | "ASK_INCOMPLETE"
  | "ASK_VALID"
  | "REFINE"
  | "ESCAPE";

export interface RulesContractShape {
  action: "INTRO" | "ASK" | "REFINE" | "ESCAPE";
  message: "required" | "optional";
  question: "empty";
  refined_formulation: "empty" | "bullets";
  rulesofthegame: "empty" | "bullets";
  statements: "empty" | "preserve_or_update";
}

export const RULESOFTHEGAME_CONTRACT_MATRIX: Record<RulesContractIntent, RulesContractShape> = {
  INTRO: {
    action: "INTRO",
    message: "required",
    question: "empty",
    refined_formulation: "empty",
    rulesofthegame: "empty",
    statements: "empty",
  },
  ASK_COLLECT: {
    action: "ASK",
    message: "optional",
    question: "empty",
    refined_formulation: "empty",
    rulesofthegame: "empty",
    statements: "empty",
  },
  ASK_INCOMPLETE: {
    action: "ASK",
    message: "optional",
    question: "empty",
    refined_formulation: "empty",
    rulesofthegame: "empty",
    statements: "preserve_or_update",
  },
  ASK_VALID: {
    action: "ASK",
    message: "optional",
    question: "empty",
    refined_formulation: "bullets",
    rulesofthegame: "bullets",
    statements: "preserve_or_update",
  },
  REFINE: {
    action: "REFINE",
    message: "optional",
    question: "empty",
    refined_formulation: "bullets",
    rulesofthegame: "bullets",
    statements: "preserve_or_update",
  },
  ESCAPE: {
    action: "ESCAPE",
    message: "required",
    question: "empty",
    refined_formulation: "empty",
    rulesofthegame: "empty",
    statements: "preserve_or_update",
  },
};

export const RULESOFTHEGAME_OUTPUT_CONTRACT_TEXT = `
CANONICAL OUTPUT CONTRACT (HARD)
- Output schema fields MUST always include:
  "action", "message", "question", "refined_formulation", "rulesofthegame", "wants_recap", "is_offtopic", "user_intent", "statements".
- Menu/buttons are runtime contract-driven via contract_id + action_codes. Never emulate buttons in message/question.

Field discipline by intent
- INTRO:
  - action="INTRO"
  - message non-empty
  - question=""
  - refined_formulation=""
  - rulesofthegame=""
  - statements=[]
- ASK_COLLECT (no rules captured yet):
  - action="ASK"
  - question=""
  - refined_formulation=""
  - rulesofthegame=""
  - statements=[]
- ASK_INCOMPLETE (1-2 rules captured):
  - action="ASK"
  - question=""
  - refined_formulation=""
  - rulesofthegame=""
  - statements=updated list
- ASK_VALID (3+ rules or explicit finalized bullet list):
  - action="ASK"
  - question=""
  - refined_formulation=bullet list
  - rulesofthegame=same bullet list
  - statements=updated list
- REFINE:
  - action="REFINE"
  - question=""
  - refined_formulation=bullet list (proposal/adjusted formulation)
  - rulesofthegame=bullet list (aligned with refined_formulation)
  - statements=preserved or updated list
- ESCAPE:
  - action="ESCAPE"
  - message non-empty (off-topic boundary + redirect handled by runtime normalization)
  - question=""
  - refined_formulation=""
  - rulesofthegame=""
  - statements=preserve PREVIOUS_STATEMENTS
`;

function uniqueTrimmed(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function parseRuleLines(raw: unknown): string[] {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return [];
  const sourceLines = text
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const rawLine of sourceLines) {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[\).])\s+/, "").trim();
    if (!line) continue;
    lines.push(line);
  }
  return uniqueTrimmed(lines);
}

function toBullets(lines: string[]): string {
  const clean = uniqueTrimmed(lines);
  if (clean.length === 0) return "";
  return clean.map((line) => `• ${line}`).join("\n");
}

function normalizeAction(raw: unknown): "INTRO" | "ASK" | "REFINE" | "ESCAPE" {
  const action = String(raw || "").trim().toUpperCase();
  if (action === "INTRO" || action === "ASK" || action === "REFINE" || action === "ESCAPE") {
    return action;
  }
  return "ASK";
}

export interface NormalizeRulesOfTheGameContractParams {
  specialist: Record<string, unknown> | null | undefined;
  previousStatements?: string[] | null | undefined;
}

export interface NormalizeRulesOfTheGameContractResult {
  specialist: Record<string, unknown>;
  intent: RulesContractIntent;
  violations: string[];
}

export function normalizeRulesOfTheGameOutputContract(
  params: NormalizeRulesOfTheGameContractParams
): NormalizeRulesOfTheGameContractResult {
  const specialist =
    params.specialist && typeof params.specialist === "object" ? { ...params.specialist } : {};
  const previousStatements = Array.isArray(params.previousStatements)
    ? params.previousStatements.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const violations: string[] = [];

  const action = normalizeAction(specialist.action);
  const refinedLines = parseRuleLines(specialist.refined_formulation);
  const rulesLines = parseRuleLines(specialist.rulesofthegame);
  let statements = Array.isArray(specialist.statements)
    ? specialist.statements.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (statements.length === 0) {
    statements = uniqueTrimmed([...rulesLines, ...refinedLines]);
  } else {
    statements = uniqueTrimmed(statements);
  }

  let intent: RulesContractIntent = "ASK_COLLECT";
  if (action === "INTRO") {
    intent = "INTRO";
  } else if (action === "ESCAPE") {
    intent = "ESCAPE";
  } else if (action === "REFINE") {
    intent = "REFINE";
  } else if (statements.length === 0) {
    intent = "ASK_COLLECT";
  } else if (statements.length < 3) {
    intent = "ASK_INCOMPLETE";
  } else {
    intent = "ASK_VALID";
  }

  if (action === "ASK" && statements.length >= 3 && rulesLines.length === 0 && refinedLines.length === 0) {
    violations.push("ask_valid_missing_bullets");
  }
  if (action === "ASK" && statements.length < 3 && (rulesLines.length > 0 || refinedLines.length > 0)) {
    violations.push("ask_incomplete_should_not_emit_final_bullets");
  }
  if (action === "REFINE" && rulesLines.length === 0 && refinedLines.length === 0) {
    violations.push("refine_missing_bullets");
  }

  const next: Record<string, unknown> = {
    ...specialist,
    action,
    question: "",
    statements: statements,
  };

  if (intent === "INTRO") {
    next.refined_formulation = "";
    next.rulesofthegame = "";
    next.statements = [];
  } else if (intent === "ESCAPE") {
    next.refined_formulation = "";
    next.rulesofthegame = "";
    next.statements = previousStatements.length > 0 ? previousStatements : statements;
  } else if (intent === "ASK_COLLECT") {
    next.refined_formulation = "";
    next.rulesofthegame = "";
    next.statements = [];
  } else if (intent === "ASK_INCOMPLETE") {
    next.refined_formulation = "";
    next.rulesofthegame = "";
    next.statements = statements;
  } else {
    const source = statements.length > 0 ? statements : uniqueTrimmed([...rulesLines, ...refinedLines]);
    const bullets = toBullets(source);
    next.refined_formulation = bullets;
    next.rulesofthegame = bullets;
    next.statements = source;
  }

  return {
    specialist: next,
    intent,
    violations,
  };
}
