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

const STEP0_VENTURE_PATTERNS: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /\breclamebureau\b/i, normalized: "reclamebureau" },
  { pattern: /\badvertising agency\b/i, normalized: "advertising agency" },
  { pattern: /\bmarketingbureau\b/i, normalized: "marketingbureau" },
  { pattern: /\bmarketing agency\b/i, normalized: "marketing agency" },
  { pattern: /\bcreative agency\b/i, normalized: "creative agency" },
  { pattern: /\bagency\b/i, normalized: "agency" },
  { pattern: /\bstudio\b/i, normalized: "studio" },
  { pattern: /\bconsultancy\b/i, normalized: "consultancy" },
  { pattern: /\bbedrijf\b/i, normalized: "bedrijf" },
  { pattern: /\bcompany\b/i, normalized: "company" },
];

const STEP0_NAME_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "businessplan",
  "bureau",
  "called",
  "de",
  "een",
  "for",
  "genaamd",
  "help",
  "het",
  "ik",
  "is",
  "met",
  "mijn",
  "my",
  "named",
  "om",
  "ons",
  "onze",
  "our",
  "plan",
  "reclamebureau",
  "te",
  "the",
  "to",
  "voor",
  "with",
]);

function normalizeBusinessNameToken(raw: string): string {
  const compact = String(raw || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  const stripped = compact.replace(/^[`"'“”'‘’.,:;!?()]+|[`"'“”'‘’.,:;!?()]+$/g, "").trim();
  if (!stripped) return "";
  if (stripped.length < 2 || stripped.length > 48) return "";
  const lower = stripped.toLowerCase();
  if (STEP0_NAME_STOPWORDS.has(lower)) return "";
  if (/^(tbd|none|nvt|unknown)$/i.test(lower)) return "";
  if (!/[a-z0-9]/i.test(stripped)) return "";
  return stripped;
}

export function inferStep0SeedFromInitialMessage(rawInput: string): Step0Seed | null {
  const input = String(rawInput || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!input) return null;

  const ventureMatch = STEP0_VENTURE_PATTERNS
    .map(({ pattern, normalized }) => {
      const match = pattern.exec(input);
      return match ? { match, normalized } : null;
    })
    .filter((entry): entry is { match: RegExpExecArray; normalized: string } => Boolean(entry))
    .sort((a, b) => b.match[0].length - a.match[0].length)[0];
  if (!ventureMatch) return null;

  let nameCandidate = "";
  const explicitNameMatch = input.match(
    /\b(?:genaamd|named|called)\s+([A-Za-z0-9][A-Za-z0-9&'’._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9&'’._-]*){0,2})/i
  );
  if (explicitNameMatch?.[1]) {
    nameCandidate = normalizeBusinessNameToken(explicitNameMatch[1]);
  }

  if (!nameCandidate) {
    const trailing = input.slice((ventureMatch.match.index ?? 0) + ventureMatch.match[0].length);
    const trailingTokens = trailing.split(/\s+/).map((token) => normalizeBusinessNameToken(token)).filter(Boolean);
    const firstTail = trailingTokens.find((token) => !STEP0_NAME_STOPWORDS.has(token.toLowerCase()));
    if (firstTail) nameCandidate = firstTail;
  }

  if (!nameCandidate) {
    const tailToken = normalizeBusinessNameToken(input.split(/\s+/).slice(-1)[0] || "");
    if (tailToken && !STEP0_NAME_STOPWORDS.has(tailToken.toLowerCase())) {
      nameCandidate = tailToken;
    }
  }

  if (!nameCandidate) return null;

  const lower = input.toLowerCase();
  const startingSignals = [
    /\bwant to start\b/i,
    /\bi want to start\b/i,
    /\bga starten\b/i,
    /\bgaan starten\b/i,
    /\bstarten\b/i,
    /\boprichten\b/i,
    /\bbeginnen\b/i,
    /\bnieuw bedrijf\b/i,
  ];
  const status: "existing" | "starting" =
    startingSignals.some((pattern) => pattern.test(lower)) ? "starting" : "existing";

  return {
    venture: ventureMatch.normalized,
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
