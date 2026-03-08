import type { CanvasState } from "../core/state.js";

type Step0Parsed = { venture: string; name: string; status: string };
type Step0TurnIntent = "confirm_start" | "change_name" | "other";
type Step0InteractionState = "step0_ready" | "step0_editing";

const STEP0_EDITABLE_FIELDS = ["business_name"] as const;

export type Step0Seed = {
  venture: string;
  name: string;
  status: "existing" | "starting";
};

export type Step0Bootstrap = {
  venture: string;
  name: string;
  status: "existing" | "starting";
  source: "initial_user_message" | "step_0_final";
};

type SeedCandidate = {
  value: string;
  score: number;
  source: string;
  start: number;
  end: number;
};

export function parseStep0Final(step0Final: string, fallbackName: string): Step0Parsed {
  const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
  const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
  const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);

  const venture = (ventureMatch?.[1] || "venture").trim();
  const name = (nameMatch?.[1] || fallbackName || "TBD").trim();
  const status = (statusMatch?.[1] || "starting").trim();
  return { venture, name, status };
}

export function hasValidStep0Final(step0FinalRaw: string): boolean {
  const step0Final = String(step0FinalRaw || "").trim();
  if (!step0Final) return false;
  const nameMatch = step0Final.match(/Name:\s*([^|]+)\s*(\||$)/i);
  const ventureMatch = step0Final.match(/Venture:\s*([^|]+)\s*(\||$)/i);
  const statusMatch = step0Final.match(/Status:\s*(existing|starting)\s*(\||$)/i);
  const venture = String(ventureMatch?.[1] || "").trim();
  const name = String(nameMatch?.[1] || "").trim();
  const status = String(statusMatch?.[1] || "").trim().toLowerCase();
  return Boolean(venture) && Boolean(name) && (status === "existing" || status === "starting");
}

function normalizeSeedToken(raw: unknown): string {
  return String(raw || "")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_NAME_TOKENS = new Set([
  "tbd",
  "business",
  "venture",
  "bedrijf",
  "company",
  "startup",
  "plan",
  "canvas",
  "businessplan",
  "ondernemingsplan",
]);

const RESERVED_LEADING_NAME_TOKENS = new Set([
  "called",
  "named",
  "genaamd",
  "heet",
  "for",
  "voor",
  "with",
  "met",
  "my",
  "mijn",
  "our",
  "ons",
  "onze",
]);

function normalizeSeedKey(raw: string): string {
  return normalizeSeedToken(raw).toLowerCase();
}

function looksLikeBusinessName(raw: string): boolean {
  const value = normalizeSeedToken(raw);
  if (!value) return false;
  if (value.length < 2 || value.length > 64) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9&'._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9&'._-]*){0,3}$/.test(value)) {
    return false;
  }
  const lowered = normalizeSeedKey(value);
  if (GENERIC_NAME_TOKENS.has(lowered)) return false;
  return true;
}

function looksBrandLike(raw: string): boolean {
  const value = normalizeSeedToken(raw);
  if (!value) return false;
  return /[A-Z]/.test(value) || /[0-9&._-]/.test(value);
}

function inferStatusFromInput(rawInput: string): "existing" | "starting" {
  const lowered = String(rawInput || "").toLowerCase();
  if (
    /\b(start|starting|launch|nieuw|new)\b/.test(lowered) ||
    /\b(wil|wilt|will|want)\b/.test(lowered) && /\b(start|begin|launch)\b/.test(lowered)
  ) {
    return "starting";
  }
  return "existing";
}

const VENTURE_HINTS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\breclamebureau\b/i, value: "reclamebureau" },
  { pattern: /\badvertising agency\b/i, value: "advertising agency" },
  { pattern: /\bmarketing agency\b/i, value: "marketing agency" },
  { pattern: /\bagency\b/i, value: "agency" },
  { pattern: /\bbureau\b/i, value: "bureau" },
  { pattern: /\bstudio\b/i, value: "studio" },
  { pattern: /\bconsultancy\b/i, value: "consultancy" },
  { pattern: /\bwebshop\b/i, value: "webshop" },
  { pattern: /\brestaurant\b/i, value: "restaurant" },
  { pattern: /\bpraktijk\b/i, value: "praktijk" },
  { pattern: /\bstartup\b/i, value: "startup" },
  { pattern: /\bbusiness\b/i, value: "business" },
  { pattern: /\bbedrijf\b/i, value: "bedrijf" },
];

const VENTURE_NAME_BLOCKLIST = new Set(VENTURE_HINTS.map((hint) => normalizeSeedKey(hint.value)));
const GENERIC_VENTURE_VALUES = new Set(["business", "bedrijf", "company", "startup"]);

function inferVentureFromInput(rawInput: string): string {
  const input = String(rawInput || "");
  for (const hint of VENTURE_HINTS) {
    if (hint.pattern.test(input)) return hint.value;
  }
  return "";
}

function scoreVentureCandidate(value: string, input: string, matchStart: number): number {
  const normalized = normalizeSeedKey(value);
  let score = GENERIC_VENTURE_VALUES.has(normalized) ? 2 : 4;
  if (value.includes(" ")) score += 1;
  const prefix = input.slice(Math.max(0, matchStart - 24), matchStart).toLowerCase();
  if (/\b(?:my|mijn|our|ons|onze|for|voor|a|an|een)\s*$/.test(prefix)) score += 1;
  return score;
}

function collectVentureCandidates(rawInput: string): SeedCandidate[] {
  const input = normalizeSeedToken(rawInput);
  if (!input) return [];
  const candidates: SeedCandidate[] = [];
  for (const hint of VENTURE_HINTS) {
    const match = input.match(hint.pattern);
    if (!match || typeof match.index !== "number") continue;
    candidates.push({
      value: normalizeSeedToken(hint.value),
      score: scoreVentureCandidate(hint.value, input, match.index),
      source: "venture_hint",
      start: match.index,
      end: match.index + String(match[0] || "").length,
    });
  }
  return candidates;
}

function extractLeadingNamePhrase(rawTail: string): string {
  const tokens = normalizeSeedToken(rawTail).split(" ").filter(Boolean);
  if (tokens.length === 0) return "";
  const firstToken = normalizeSeedKey(tokens[0]);
  if (RESERVED_LEADING_NAME_TOKENS.has(firstToken)) return "";
  const parts: string[] = [];
  for (const token of tokens) {
    if (!/^[A-Za-z0-9][A-Za-z0-9&'._-]*$/.test(token)) break;
    if (parts.length === 0 && RESERVED_LEADING_NAME_TOKENS.has(normalizeSeedKey(token))) break;
    parts.push(token);
    if (parts.length >= 3) break;
  }
  return normalizeSeedToken(parts.join(" "));
}

function scoreNameCandidate(value: string, baseScore: number): number {
  let score = baseScore;
  if (looksBrandLike(value)) score += 1;
  if (value.includes(" ")) score += 1;
  return score;
}

function collectNameCandidates(rawInput: string, ventureCandidates: SeedCandidate[]): SeedCandidate[] {
  const raw = String(rawInput || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const candidates: SeedCandidate[] = [];
  const explicitNamed = raw.match(
    /\b(?:called|named|genaamd|heet)\s+([A-Za-z0-9][A-Za-z0-9&'._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9&'._-]*){0,2})\b/i
  );
  if (explicitNamed && typeof explicitNamed.index === "number") {
    const value = normalizeSeedToken(explicitNamed[1]);
    candidates.push({
      value,
      score: scoreNameCandidate(value, 5),
      source: "explicit_named",
      start: explicitNamed.index,
      end: explicitNamed.index + String(explicitNamed[0] || "").length,
    });
  }

  const trailingTitleCase = raw.match(
    /\b([A-Z][A-Za-z0-9&'._-]*(?:\s+[A-Z][A-Za-z0-9&'._-]*){0,2})\b\s*$/
  );
  if (trailingTitleCase && typeof trailingTitleCase.index === "number") {
    const value = normalizeSeedToken(trailingTitleCase[1]);
    candidates.push({
      value,
      score: scoreNameCandidate(value, 3),
      source: "trailing_title_case",
      start: trailingTitleCase.index,
      end: trailingTitleCase.index + String(trailingTitleCase[0] || "").length,
    });
  }

  for (const ventureCandidate of ventureCandidates) {
    if (ventureCandidate.end >= raw.length) continue;
    const value = extractLeadingNamePhrase(raw.slice(ventureCandidate.end));
    if (!value) continue;
    candidates.push({
      value,
      score: scoreNameCandidate(value, 4),
      source: "after_venture",
      start: ventureCandidate.end,
      end: ventureCandidate.end + value.length,
    });
  }

  return candidates;
}

function pickBestCandidate(candidates: SeedCandidate[]): SeedCandidate | null {
  const ranked = [...candidates].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.value.length !== left.value.length) return right.value.length - left.value.length;
    return left.start - right.start;
  });
  return ranked[0] || null;
}

function isValidSeedNameCandidate(raw: string, ventureRaw: string): boolean {
  const value = normalizeSeedToken(raw);
  if (!looksLikeBusinessName(value)) return false;
  const lowered = normalizeSeedKey(value);
  if (VENTURE_NAME_BLOCKLIST.has(lowered)) return false;
  if (lowered === normalizeSeedKey(ventureRaw)) return false;
  return true;
}

function normalizeIntentInput(rawInput: string): string {
  return String(rawInput || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectStep0TurnIntent(rawInput: string): Step0TurnIntent {
  const normalized = normalizeIntentInput(rawInput);
  if (!normalized) return "other";
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length > 0 && tokens.length <= 10) {
    const first = tokens[0];
    if (["ja", "yes", "ok", "okay", "zeker", "prima", "ready", "klaar", "start"].includes(first)) {
      return "confirm_start";
    }
    const hasProgress = tokens.some((token) =>
      ["start", "begin", "beginnen", "doorgaan", "verder", "continue", "proceed"].includes(token)
    );
    const hasConfirm = tokens.some((token) =>
      ["ja", "yes", "zeker", "klaar", "ready", "ok", "okay"].includes(token)
    );
    if (hasProgress && hasConfirm) return "confirm_start";
  }

  const changeNamePatterns = [
    /\b(?:name|naam)\s*(?:is|=|:)\s+\S+/i,
    /\b(?:called|named|genaamd|heet)\s+\S+/i,
    /\b(?:my name is|de naam is|het heet|its name is|it is called)\b/i,
  ];
  if (changeNamePatterns.some((pattern) => pattern.test(normalized))) return "change_name";
  return "other";
}

function normalizeBusinessName(rawName: string): string {
  const normalized = normalizeSeedToken(rawName);
  if (!normalized) return "";
  return normalized;
}

function normalizedNameEquals(left: string, right: string): boolean {
  return normalizeBusinessName(left).toLowerCase() === normalizeBusinessName(right).toLowerCase();
}

function toStep0Status(rawStatus: string): "existing" | "starting" {
  return String(rawStatus || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
}

function composeStep0Final(ventureRaw: string, nameRaw: string, statusRaw: string): string {
  const venture = normalizeSeedToken(ventureRaw) || "business";
  const name = normalizeBusinessName(nameRaw) || "TBD";
  const status = toStep0Status(statusRaw);
  return `Venture: ${venture} | Name: ${name} | Status: ${status}`;
}

function normalizeStep0BootstrapSource(rawSource: unknown): Step0Bootstrap["source"] {
  return String(rawSource || "").trim() === "step_0_final" ? "step_0_final" : "initial_user_message";
}

function buildStep0Bootstrap(
  ventureRaw: unknown,
  nameRaw: unknown,
  statusRaw: unknown,
  sourceRaw: unknown
): Step0Bootstrap | null {
  const venture = normalizeSeedToken(ventureRaw);
  const name = normalizeBusinessName(String(nameRaw || ""));
  if (!venture || !name) return null;
  return {
    venture,
    name,
    status: toStep0Status(String(statusRaw || "")),
    source: normalizeStep0BootstrapSource(sourceRaw),
  };
}

export function composeStep0FinalFromBootstrap(bootstrap: Step0Bootstrap): string {
  return composeStep0Final(bootstrap.venture, bootstrap.name, bootstrap.status);
}

export function resolveStep0BootstrapFromState(
  state: CanvasState | Record<string, unknown> | null | undefined
): Step0Bootstrap | null {
  const stateRecord =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : {};
  const fromState = buildStep0Bootstrap(
    (stateRecord.step0_bootstrap as Record<string, unknown> | undefined)?.venture,
    (stateRecord.step0_bootstrap as Record<string, unknown> | undefined)?.name,
    (stateRecord.step0_bootstrap as Record<string, unknown> | undefined)?.status,
    (stateRecord.step0_bootstrap as Record<string, unknown> | undefined)?.source
  );
  if (fromState) return fromState;

  const step0FinalRaw = String(stateRecord.step_0_final || "").trim();
  if (!hasValidStep0Final(step0FinalRaw)) return null;
  const parsed = parseStep0Final(step0FinalRaw, String(stateRecord.business_name || "TBD"));
  return buildStep0Bootstrap(parsed.venture, parsed.name, parsed.status, "step_0_final");
}

function applyStep0InteractionMetadata(next: Record<string, unknown>, state: Step0InteractionState): void {
  next.step0_interaction_state = state;
  if (state === "step0_editing") {
    next.is_mutable = true;
    next.editable_fields = [...STEP0_EDITABLE_FIELDS];
    return;
  }
  next.is_mutable = false;
  next.editable_fields = [];
}

export function inferStep0SeedFromInitialMessage(rawInput: string): Step0Seed | null {
  const raw = String(rawInput || "").replace(/\s+/g, " ").trim();
  const input = normalizeSeedToken(rawInput);
  if (!input) return null;
  const status = inferStatusFromInput(input);

  const explicitStep0 = raw.match(
    /Venture:\s*([^|]+?)\s*(?:\||$).*?Name:\s*([^|]+?)\s*(?:\||$).*?Status:\s*(existing|starting)\b/i
  );
  if (explicitStep0) {
    const venture = normalizeSeedToken(explicitStep0[1]);
    const name = normalizeSeedToken(explicitStep0[2]);
    const parsedStatus = String(explicitStep0[3] || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
    if (venture && looksLikeBusinessName(name)) {
      return { venture, name, status: parsedStatus };
    }
  }

  const ventureCandidates = collectVentureCandidates(raw);
  const bestVenture = pickBestCandidate(ventureCandidates);
  if (!bestVenture || bestVenture.score < 3) return null;

  const nameCandidates = collectNameCandidates(raw, ventureCandidates).filter((candidate) =>
    isValidSeedNameCandidate(candidate.value, bestVenture.value)
  );
  const bestName = pickBestCandidate(nameCandidates);
  if (!bestName || bestName.score < 4) return null;

  return {
    venture: bestVenture.value,
    name: bestName.value,
    status,
  };
}

export function maybeSeedStep0CandidateFromInitialMessage(state: CanvasState, sourceMessage: string): CanvasState {
  const authoritativeBootstrap = resolveStep0BootstrapFromState(state);
  if (authoritativeBootstrap) {
    return {
      ...(state as any),
      step0_bootstrap: authoritativeBootstrap,
    } as CanvasState;
  }
  const seed = inferStep0SeedFromInitialMessage(sourceMessage);
  if (!seed) return state;
  const currentBusinessName = String((state as any).business_name || "").trim();
  const nextState: Record<string, unknown> = {
    ...(state as any),
    step0_bootstrap: {
      venture: seed.venture,
      name: seed.name,
      status: seed.status,
      source: "initial_user_message",
    } satisfies Step0Bootstrap,
  };
  if (!currentBusinessName || currentBusinessName.toLowerCase() === "tbd") {
    nextState.business_name = seed.name;
  }
  return nextState as CanvasState;
}

type RunStepStep0DisplayDeps = {
  step0Id: string;
  resolveSpecialistMetaTopic: (specialist: Record<string, unknown>) => string;
  buildBenProfileMessage: (state: CanvasState) => string;
  step0ReadinessQuestion: (state: CanvasState | null | undefined, parsed: Step0Parsed) => string;
  step0CardDescForState: (state: CanvasState | null | undefined) => string;
  step0QuestionForState: (state: CanvasState | null | undefined) => string;
  stripChoiceInstructionNoise: (value: string) => string;
};

export function createRunStepStep0DisplayHelpers(deps: RunStepStep0DisplayDeps) {
  function normalizeStep0OfftopicToAsk(specialist: any, state: CanvasState, userInput = ""): any {
    const next = specialist && typeof specialist === "object" ? { ...specialist } : {};
    void userInput;
    const rawMessage = String(next.message || "").trim();
    const cleanedMessage = deps.stripChoiceInstructionNoise(rawMessage);
    const hasMessage = Boolean(cleanedMessage);
    const output = {
      ...next,
      action: "ASK",
      message: hasMessage ? cleanedMessage : deps.step0CardDescForState(state),
      question: deps.step0QuestionForState(state),
      wording_choice_pending: "false",
      wording_choice_selected: "",
      wording_choice_list_semantics: "delta",
      feedback_reason_key: "",
      feedback_reason_text: "",
      step_0: "",
      is_offtopic: true,
    };
    applyStep0InteractionMetadata(output, "step0_editing");
    return output;
  }

  function normalizeStep0AskDisplayContract(stepId: string, specialist: any, state: CanvasState, userInput = ""): any {
    if (stepId !== deps.step0Id || !specialist || typeof specialist !== "object") return specialist;
    const action = String(specialist.action || "").trim().toUpperCase();
    const next = { ...specialist };
    const step0FinalRaw = String((state as any).step_0_final || "").trim();
    const hasStep0 = hasValidStep0Final(step0FinalRaw);
    const normalizedInput = String(userInput || "").trim();
    const metaTopic = deps.resolveSpecialistMetaTopic(next as Record<string, unknown>);
    const isBenMeta = metaTopic === "BEN_PROFILE";
    if (action === "INTRO") {
      next.action = "ASK";
      next.message = "";
      next.question = deps.step0QuestionForState(state);
    }
    const currentContractId = String(next.ui_contract_id || "").trim();
    void currentContractId;
    if (isBenMeta) {
      if (hasStep0) {
        const parsed = parseStep0Final(step0FinalRaw, String((state as any).business_name || "TBD"));
        const output = {
          ...next,
          action: "ASK",
          message: deps.buildBenProfileMessage(state),
          question: deps.step0ReadinessQuestion(state, parsed),
          business_name: parsed.name || "TBD",
          step_0: step0FinalRaw,
          wording_choice_pending: "false",
          wording_choice_selected: "",
          wording_choice_list_semantics: "delta",
          feedback_reason_key: "",
          feedback_reason_text: "",
          is_offtopic: true,
        };
        applyStep0InteractionMetadata(output, "step0_ready");
        return output;
      }
      return normalizeStep0OfftopicToAsk(
        {
          ...next,
          message: deps.buildBenProfileMessage(state),
          is_offtopic: true,
        },
        state,
        normalizedInput
      );
    }
    if (hasStep0 && (action === "ASK" || action === "ESCAPE")) {
      const parsedFromState = parseStep0Final(step0FinalRaw, String((state as any).business_name || "TBD"));
      const userIntent = detectStep0TurnIntent(normalizedInput);
      const incomingStep0Raw = String(next.step_0 || "").trim();
      const incomingHasValidStep0 = hasValidStep0Final(incomingStep0Raw);
      const incomingParsed = incomingHasValidStep0
        ? parseStep0Final(incomingStep0Raw, String(next.business_name || parsedFromState.name || "TBD"))
        : null;
      const incomingBusinessName = normalizeBusinessName(String(next.business_name || ""));
      const candidateName = normalizeBusinessName(incomingParsed?.name || incomingBusinessName);
      const candidateStep0 = incomingParsed
        ? composeStep0Final(incomingParsed.venture, incomingParsed.name, incomingParsed.status)
        : (candidateName
            ? composeStep0Final(parsedFromState.venture, candidateName, parsedFromState.status)
            : "");
      const hasTupleMutation =
        Boolean(candidateStep0) &&
        normalizeIntentInput(candidateStep0) !== normalizeIntentInput(step0FinalRaw);
      const hasNameMutation =
        Boolean(candidateName) &&
        candidateName.toLowerCase() !== "tbd" &&
        !normalizedNameEquals(candidateName, parsedFromState.name);
      const shouldApplyEdit =
        userIntent === "change_name" && (hasNameMutation || hasTupleMutation);
      if (shouldApplyEdit && candidateStep0) {
        const parsedEdit = parseStep0Final(candidateStep0, parsedFromState.name || "TBD");
        next.action = "ASK";
        next.question = deps.step0ReadinessQuestion(state, parsedEdit);
        next.business_name = parsedEdit.name || "TBD";
        next.step_0 = candidateStep0;
        next.wording_choice_pending = "false";
        next.wording_choice_selected = "";
        next.wording_choice_list_semantics = "delta";
        next.feedback_reason_key = "";
        next.feedback_reason_text = "";
        if (!String(next.message || "").trim()) {
          next.message = deps.step0CardDescForState(state);
        }
        applyStep0InteractionMetadata(next, "step0_editing");
        return next;
      }
      next.action = "ASK";
      next.question = deps.step0ReadinessQuestion(state, parsedFromState);
      next.business_name = parsedFromState.name || "TBD";
      next.step_0 = step0FinalRaw;
      next.wording_choice_pending = "false";
      next.wording_choice_selected = "";
      next.wording_choice_list_semantics = "delta";
      next.feedback_reason_key = "";
      next.feedback_reason_text = "";
      applyStep0InteractionMetadata(next, "step0_ready");
      return next;
    }
    if (String(next.action || "").trim() !== "ASK") return next;
    next.message = deps.step0CardDescForState(state);
    next.question = deps.step0QuestionForState(state);
    applyStep0InteractionMetadata(next, "step0_editing");
    return next;
  }

  return {
    normalizeStep0AskDisplayContract,
    normalizeStep0OfftopicToAsk,
  };
}
