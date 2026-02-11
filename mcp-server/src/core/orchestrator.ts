// src/core/orchestrator.ts
import { z } from "zod";
import { CANONICAL_STEPS, isCanonicalStepId, type BoolString, type CanvasState } from "./state.js";

/**
 * ORCHESTRATOR (ROUTER + STEP STATE)
 *
 * Parity-first implementation based on the logic document:
 * - Output is strict JSON (no nulls) via Zod
 * - Decides next specialist + next step
 * - Computes show_session_intro + show_step_intro
 * - Pass-through intro_shown_for_step (do NOT update it here)
 *
 * NOTE: This module is NOT user-facing.
 */

export type OrchestratorStepId = (typeof CANONICAL_STEPS)[number];

export type SpecialistName =
  | "ValidationAndBusinessName"
  | "Dream"
  | "DreamExplainer"
  | "Purpose"
  | "BigWhy"
  | "Role"
  | "Entity"
  | "Strategy"
  | "TargetGroup"
  | "ProductsServices"
  | "RulesOfTheGame"
  | "Presentation";

export const OrchestratorOutputZod = z.object({
  specialist_to_call: z.enum([
    "ValidationAndBusinessName",
    "Dream",
    "DreamExplainer",
    "Purpose",
    "BigWhy",
    "Role",
    "Entity",
    "Strategy",
    "TargetGroup",
    "ProductsServices",
    "RulesOfTheGame",
    "Presentation",
  ]),
  specialist_input: z.string(),
  current_step: z.enum([
    "step_0",
    "dream",
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
    "presentation",
  ]),
  intro_shown_for_step: z.enum(["", ...CANONICAL_STEPS] as any),
  intro_shown_session: z.enum(["true", "false"]),
  show_step_intro: z.enum(["true", "false"]),
  show_session_intro: z.enum(["true", "false"]),
});

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputZod>;

function boolStr(x: unknown): BoolString {
  return String(x ?? "").trim() === "true" ? "true" : "false";
}

function normalizeIntroShownForStep(x: unknown): string {
  return String(x ?? "").trim();
}

function normalizeCurrentStep(x: unknown): OrchestratorStepId {
  const v = String(x ?? "").trim() || "step_0";
  return isCanonicalStepId(v) ? (v as OrchestratorStepId) : "step_0";
}

function normalizeActiveSpecialist(x: unknown): string {
  return String(x ?? "").trim();
}

type TriggerFlags = {
  proceed_to_dream: BoolString;
  proceed_to_purpose: BoolString;
  proceed_to_next: BoolString; // NEW (minimal): for purpose->bigwhy->... flow
  suggest_dreambuilder: BoolString;
  action: string;
};

function readTriggersRobust(last: unknown): TriggerFlags {
  // Object preferred
  if (last && typeof last === "object" && !Array.isArray(last)) {
    const obj = last as Record<string, any>;
    return {
      proceed_to_dream: boolStr(obj.proceed_to_dream),
      proceed_to_purpose: boolStr(obj.proceed_to_purpose),
      proceed_to_next: boolStr(obj.proceed_to_next), // NEW
      suggest_dreambuilder: boolStr(obj.suggest_dreambuilder),
      action: String(obj.action ?? ""),
    };
  }

  // String fallback (tolerate spacing)
  const s = String(last ?? "");
  const has = (a: string, b: string) => s.includes(a) || s.includes(b);

  const proceed_to_dream = has('"proceed_to_dream":"true"', '"proceed_to_dream": "true"')
    ? "true"
    : "false";
  const proceed_to_purpose = has('"proceed_to_purpose":"true"', '"proceed_to_purpose": "true"')
    ? "true"
    : "false";
  const proceed_to_next = has('"proceed_to_next":"true"', '"proceed_to_next": "true"')
    ? "true"
    : "false";
  const suggest_dreambuilder = has('"suggest_dreambuilder":"true"', '"suggest_dreambuilder": "true"')
    ? "true"
    : "false";
  const action = has('"action":"CONFIRM"', '"action": "CONFIRM"') ? "CONFIRM" : "";

  return {
    proceed_to_dream,
    proceed_to_purpose,
    proceed_to_next,
    suggest_dreambuilder,
    action,
  };
}

const STEP_TO_SPECIALIST: Record<OrchestratorStepId, SpecialistName> = {
  step_0: "ValidationAndBusinessName",
  dream: "Dream",
  purpose: "Purpose",
  bigwhy: "BigWhy",
  role: "Role",
  entity: "Entity",
  strategy: "Strategy",
  targetgroup: "TargetGroup",
  productsservices: "ProductsServices",
  rulesofthegame: "RulesOfTheGame",
  presentation: "Presentation",
};

function wantsFullRestartCanvas(userMessage: string): boolean {
  const t = String(userMessage ?? "").trim().toLowerCase();
  if (!t) return false;

  // Keep conservative to avoid false positives.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;

  const hasAny = (arr: string[]) => arr.some((k) => t.includes(k));

  const restartWords = [
    "restart",
    "reset",
    "start over",
    "start again",
    "begin again",
    "from scratch",
  ];

  // Prefer explicit canvas intent (but allow very short "restart/reset" messages).
  const canvasWords = ["canvas", "business strategy canvas", "business canvas", "bsc"];

  const restartHit = hasAny(restartWords);
  const canvasHit = hasAny(canvasWords);

  if (!restartHit) return false;
  if (canvasHit) return true;

  // If extremely short, allow "restart/reset" without needing "canvas".
  if (words.length <= 3 && (t === "restart" || t === "reset" || t === "opnieuw" || t === "herstart")) {
    return true;
  }

  return false;
}

// NEW (minimal): next-step mapping for proceed_to_next="true"
function nextCanonicalStep(current: OrchestratorStepId): OrchestratorStepId {
  const idx = CANONICAL_STEPS.indexOf(current);
  if (idx < 0) return "step_0";
  const next = CANONICAL_STEPS[idx + 1];
  return (next ? (next as OrchestratorStepId) : current);
}

/**
 * Returns a strict orchestrator output.
 *
 * - Does NOT reset to step_0 when off-topic.
 * - Only resets to step_0 if current_step is invalid OR user explicitly requests full restart.
 */
export function orchestrate(params: { state: CanvasState; userMessage: string }): OrchestratorOutput {
  const { state, userMessage } = params;

  // --- normalization (per logic doc) ---
  const CURRENT_STEP = normalizeCurrentStep(state.current_step);
  const INTRO_SHOWN_FOR_STEP = normalizeIntroShownForStep(state.intro_shown_for_step);
  const INTRO_SHOWN_SESSION = boolStr(state.intro_shown_session);
  const ACTIVE_SPECIALIST = normalizeActiveSpecialist(state.active_specialist);

  const triggers = readTriggersRobust(state.last_specialist_result);

  // --- routing logic (priority order) ---
  let next_step: OrchestratorStepId = CURRENT_STEP;
  let next_specialist: SpecialistName = STEP_TO_SPECIALIST[next_step];

  // Priority 0: explicit full restart (allowed by logic doc)
  if (CURRENT_STEP !== "step_0" && wantsFullRestartCanvas(userMessage)) {
    next_step = "step_0";
    next_specialist = "ValidationAndBusinessName";
  } else {
    // Priority 1: proceed triggers override everything
    if (triggers.proceed_to_dream === "true") {
      next_step = "dream";
      next_specialist = "Dream";
    } else if (triggers.proceed_to_purpose === "true") {
      next_step = "purpose";
      next_specialist = "Purpose";
    } else if (triggers.proceed_to_next === "true") {
      // NEW (minimal): advance one canonical step (purpose -> bigwhy -> role -> ... -> presentation)
      next_step = nextCanonicalStep(CURRENT_STEP);
      next_specialist = STEP_TO_SPECIALIST[next_step];
    } else if (ACTIVE_SPECIALIST === "DreamExplainer" && triggers.suggest_dreambuilder === "true") {
      // Priority 2: DreamExplainer continuation
      next_step = "dream";
      next_specialist = "DreamExplainer";
    } else if (
      CURRENT_STEP === "dream" &&
      triggers.action === "CONFIRM" &&
      triggers.suggest_dreambuilder === "true"
    ) {
      // Priority 3: DreamExplainer start (handshake only)
      next_step = "dream";
      next_specialist = "DreamExplainer";
    } else {
      // Priority 4: default routing (SAFE)
      if (isCanonicalStepId(CURRENT_STEP)) {
        next_step = CURRENT_STEP;
        next_specialist = STEP_TO_SPECIALIST[next_step];
      } else {
        next_step = "step_0";
        next_specialist = "ValidationAndBusinessName";
      }
    }
  }

  // --- intro flags logic ---
  const show_session_intro: BoolString = INTRO_SHOWN_SESSION !== "true" ? "true" : "false";
  const intro_shown_session: BoolString = "true";

  const show_step_intro: BoolString = INTRO_SHOWN_FOR_STEP !== next_step ? "true" : "false";

  // IMPORTANT: intro_shown_for_step is PASS-THROUGH here.
  const intro_shown_for_step = INTRO_SHOWN_FOR_STEP;

  // Specialist input format (must not paraphrase user message)
  const specialist_input = `CURRENT_STEP_ID: ${next_step} | USER_MESSAGE: ${String(userMessage ?? "")}`;

  const out: OrchestratorOutput = {
    specialist_to_call: next_specialist,
    specialist_input,
    current_step: next_step,
    intro_shown_for_step,
    intro_shown_session,
    show_step_intro,
    show_session_intro,
  };

  return OrchestratorOutputZod.parse(out);
}
