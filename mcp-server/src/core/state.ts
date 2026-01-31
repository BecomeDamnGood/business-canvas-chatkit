// src/core/state.ts
import { z } from "zod";

/**
 * Canonical step IDs (expand later as you add steps)
 */
export const CANONICAL_STEPS = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "rulesofthegame",
  "presentation",
] as const;

export type CanonicalStepId = (typeof CANONICAL_STEPS)[number];

export function isCanonicalStepId(x: unknown): x is CanonicalStepId {
  return typeof x === "string" && (CANONICAL_STEPS as readonly string[]).includes(x);
}

export const BoolStringZod = z.enum(["true", "false"]);
export type BoolString = z.infer<typeof BoolStringZod>;

/**
 * CanvasState (canoniek)
 * - Alles string-based (parity-friendly)
 * - Geen nulls
 * - Ruimte voor future fields zonder brekende changes
 */
export const CanvasStateZod = z.object({
  // versioning/migrations
  state_version: z.string(),

  // routing
  current_step: z.string(), // should be canonical, but stored as string for resilience
  active_specialist: z.string(),
  intro_shown_for_step: z.string(), // stores last step-id for which intro was shown
  intro_shown_session: BoolStringZod,

  // last output (used for proceed triggers / transitions)
  // FIX (Zod v4): record needs key + value schema
  last_specialist_result: z.record(z.string(), z.any()),

  // stable stored lines / finals
  step_0_final: z.string(),
  dream_final: z.string(),

    // shared convenience fields (optional but helpful)
  business_name: z.string(),

  // user's preferred language (kept stable across the flow)
    // user's preferred language (kept stable across the flow)
  language: z.string(),
  language_locked: BoolStringZod,

  // reserved for later
  summary_target: z.string(),

});

export type CanvasState = z.infer<typeof CanvasStateZod>;

/**
 * Current state schema version
 * Bump when you change defaults/fields in a way that needs migration.
 */
export const CURRENT_STATE_VERSION = "2";

/**
 * Hard defaults (no nulls)
 */
export function getDefaultState(): CanvasState {
  return {
    state_version: CURRENT_STATE_VERSION,

    current_step: "step_0",
    active_specialist: "",
    intro_shown_for_step: "",
    intro_shown_session: "false",

    last_specialist_result: {},

    step_0_final: "",
    dream_final: "",

    business_name: "TBD",
    language: "",

    summary_target: "unknown",

  };
}

/**
 * Normalize any incoming raw state to canonical shape:
 * - Ensures required keys exist
 * - Coerces types to safe strings/bool-strings
 * - Clamps invalid current_step to step_0
 * - Never returns nulls
 */
export function normalizeState(raw: unknown): CanvasState {
  const d = getDefaultState();

  const r: any = typeof raw === "object" && raw !== null ? raw : {};

  const state_version = String(r.state_version ?? d.state_version).trim() || d.state_version;

  const current_step_raw = String(r.current_step ?? d.current_step).trim() || d.current_step;
  const current_step = isCanonicalStepId(current_step_raw) ? current_step_raw : "step_0";

  const active_specialist = String(r.active_specialist ?? d.active_specialist);
  const intro_shown_for_step = String(r.intro_shown_for_step ?? d.intro_shown_for_step);

  const intro_shown_session_raw = String(r.intro_shown_session ?? d.intro_shown_session).trim();
  const intro_shown_session: BoolString = intro_shown_session_raw === "true" ? "true" : "false";

  const last_specialist_result =
    typeof r.last_specialist_result === "object" && r.last_specialist_result !== null
      ? (r.last_specialist_result as Record<string, any>)
      : {};

  const step_0_final = String(r.step_0_final ?? d.step_0_final);
  const dream_final = String(r.dream_final ?? d.dream_final);

  const business_name = String(r.business_name ?? d.business_name) || "TBD";

  // Keep language stable and comparable; store as lowercase (e.g. "nl", "en", "pt-br")
  const language = String(r.language ?? d.language).trim().toLowerCase();
  const language_locked_raw = String(r.language_locked ?? d.language_locked).trim();
  const language_locked: BoolString = language_locked_raw === "true" ? "true" : "false";
  const summary_target = String(r.summary_target ?? d.summary_target) || "unknown";


    const normalized: CanvasState = {
    state_version,
    current_step,
    active_specialist,
    intro_shown_for_step,
    intro_shown_session,
    last_specialist_result,
    step_0_final,
    dream_final,
    business_name,
    language,
    language_locked,
    summary_target,
  };


  // final Zod check (should always pass)
  return CanvasStateZod.parse(normalized);
}

/**
 * Migrate state from older versions to CURRENT_STATE_VERSION.
 * Keep this function deterministic and side-effect free.
 */
export function migrateState(raw: unknown): CanvasState {
  // First normalize shape and types (safe)
  let s = normalizeState(raw);

  // If already current, done
  if (s.state_version === CURRENT_STATE_VERSION) return s;

  /**
   * Example migration hooks (expand when needed)
   * - If you previously stored booleans, normalizeState already stringifies them.
   * - If you rename keys, map them here.
   */

  // v0 -> v1 (hypothetical): ensure business_name exists and defaults to TBD
  if (s.state_version !== CURRENT_STATE_VERSION) {
    s = {
      ...s,
      state_version: CURRENT_STATE_VERSION,
      business_name: s.business_name?.trim() ? s.business_name : "TBD",
    };
  }

  return CanvasStateZod.parse(s);
}

/**
 * Convenience: set current step safely (clamped)
 */
export function setCurrentStep(state: CanvasState, next: string): CanvasState {
  const step = isCanonicalStepId(next) ? next : "step_0";
  return CanvasStateZod.parse({ ...state, current_step: step });
}

/**
 * Convenience: mark that session intro has been shown
 */
export function markSessionIntroShown(state: CanvasState): CanvasState {
  return CanvasStateZod.parse({ ...state, intro_shown_session: "true" });
}

/**
 * Convenience: mark that a given step intro has been shown
 */
export function markStepIntroShown(state: CanvasState, step: string): CanvasState {
  const safe = isCanonicalStepId(step) ? step : state.current_step;
  return CanvasStateZod.parse({ ...state, intro_shown_for_step: safe });
}

/**
 * Convenience: persist Step 0 stable storage line + business name
 */
export function persistStep0(state: CanvasState, step0Line: string, businessName: string): CanvasState {
  const step_0_final = String(step0Line ?? "").trim();
  const business_name = String(businessName ?? "").trim() || "TBD";
  return CanvasStateZod.parse({
    ...state,
    step_0_final: step_0_final || state.step_0_final,
    business_name,
  });
}

/**
 * Convenience: persist Dream final (only when provided)
 */
export function persistDream(state: CanvasState, dreamLine: string): CanvasState {
  const dream_final = String(dreamLine ?? "").trim();
  return CanvasStateZod.parse({
    ...state,
    dream_final: dream_final || state.dream_final,
  });
}
