import type { CanvasState } from "../core/state.js";

type Step0Parsed = { venture: string; name: string; status: string };

export type Step0Seed = {
  venture: string;
  name: string;
  status: "existing" | "starting";
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

function isPlausibleName(raw: string): boolean {
  const value = normalizeSeedToken(raw);
  if (!value) return false;
  if (value.length < 2 || value.length > 48) return false;
  const lowered = value.toLowerCase();
  if (["tbd", "business", "venture", "bedrijf", "company", "startup", "plan", "canvas"].includes(lowered)) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9&'._-]*$/.test(value);
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

function inferVentureFromInput(rawInput: string): string {
  const input = String(rawInput || "");
  for (const hint of VENTURE_HINTS) {
    if (hint.pattern.test(input)) return hint.value;
  }
  return "";
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
    if (venture && isPlausibleName(name)) {
      return { venture, name, status: parsedStatus };
    }
  }

  const explicitNamed = input.match(/\b(?:called|named|genaamd|heet)\s+([A-Za-z0-9][A-Za-z0-9&'._-]{1,48})\b/i);
  const pronounVentureName = input.match(
    /\b(?:my|mijn|our|ons|onze)\s+([A-Za-z][A-Za-z0-9&'/-]*(?:\s+[A-Za-z][A-Za-z0-9&'/-]*){0,2})\s+([A-Za-z0-9][A-Za-z0-9&'._-]{1,48})\b/i
  );
  const trailingTitleCase = input.match(/\b([A-Z][A-Za-z0-9&'._-]{1,48})\b\s*$/);

  const ventureFromPattern = normalizeSeedToken(pronounVentureName?.[1] || "");
  const venture = ventureFromPattern || inferVentureFromInput(input);
  const nameCandidate = normalizeSeedToken(
    explicitNamed?.[1] || pronounVentureName?.[2] || trailingTitleCase?.[1] || ""
  );
  if (!venture || !isPlausibleName(nameCandidate)) return null;

  return {
    venture,
    name: nameCandidate,
    status,
  };
}

export function maybeSeedStep0CandidateFromInitialMessage(state: CanvasState, sourceMessage: string): CanvasState {
  const seed = inferStep0SeedFromInitialMessage(sourceMessage);
  if (!seed) return state;
  const currentBusinessName = String((state as any).business_name || "").trim();
  if (currentBusinessName && currentBusinessName.toLowerCase() !== "tbd") return state;
  return {
    ...(state as any),
    business_name: seed.name,
  } as CanvasState;
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
    return {
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
        return {
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
      const parsed = parseStep0Final(step0FinalRaw, String((state as any).business_name || "TBD"));
      next.action = "ASK";
      next.question = deps.step0ReadinessQuestion(state, parsed);
      next.business_name = parsed.name || "TBD";
      next.step_0 = step0FinalRaw;
      next.wording_choice_pending = "false";
      next.wording_choice_selected = "";
      next.wording_choice_list_semantics = "delta";
      next.feedback_reason_key = "";
      next.feedback_reason_text = "";
      return next;
    }
    if (String(next.action || "").trim() !== "ASK") return next;
    next.message = deps.step0CardDescForState(state);
    next.question = deps.step0QuestionForState(state);
    return next;
  }

  return {
    normalizeStep0AskDisplayContract,
    normalizeStep0OfftopicToAsk,
  };
}
