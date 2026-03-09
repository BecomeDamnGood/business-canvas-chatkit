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

function normalizeComparableInput(rawInput: string): string {
  return String(rawInput || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (!raw) return null;

  const explicitStep0 = raw.match(
    /Venture:\s*([^|]+?)\s*(?:\||$).*?Name:\s*([^|]+?)\s*(?:\||$).*?Status:\s*(existing|starting)\b/i
  );
  if (explicitStep0) {
    const venture = normalizeSeedToken(explicitStep0[1]);
    const name = normalizeSeedToken(explicitStep0[2]);
    const parsedStatus = String(explicitStep0[3] || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
    if (venture && name) {
      return { venture, name, status: parsedStatus };
    }
  }
  return null;
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

  function normalizeStep0AskDisplayContract(
    stepId: string,
    specialist: any,
    state: CanvasState,
    userInput = "",
    userIntent: Step0TurnIntent = "other"
  ): any {
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
        normalizeComparableInput(candidateStep0) !== normalizeComparableInput(step0FinalRaw);
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
