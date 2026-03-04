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

export function inferStep0SeedFromInitialMessage(_rawInput: string): Step0Seed | null {
  // Intentionally disabled: step-0 inference must come from specialist output, not local hardcoded parsing.
  return null;
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
  buildBenProfileWidgetProfile: (state: CanvasState) => {
    image_url: string;
    image_alt: string;
  };
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
          __widget_profile_image_url: deps.buildBenProfileWidgetProfile(state).image_url,
          __widget_profile_image_alt: deps.buildBenProfileWidgetProfile(state).image_alt,
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
          __widget_profile_image_url: deps.buildBenProfileWidgetProfile(state).image_url,
          __widget_profile_image_alt: deps.buildBenProfileWidgetProfile(state).image_alt,
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
