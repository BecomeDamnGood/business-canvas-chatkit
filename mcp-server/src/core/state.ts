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
  "targetgroup",
  "productsservices",
  "rulesofthegame",
  "presentation",
] as const;

export type CanonicalStepId = (typeof CANONICAL_STEPS)[number];

export function isCanonicalStepId(x: unknown): x is CanonicalStepId {
  return typeof x === "string" && (CANONICAL_STEPS as readonly string[]).includes(x);
}

export const BoolStringZod = z.enum(["true", "false"]);
export type BoolString = z.infer<typeof BoolStringZod>;
export const DreamRuntimeModeZod = z.enum([
  "self",
  "builder_collect",
  "builder_scoring",
  "builder_refine",
]);
export type DreamRuntimeMode = z.infer<typeof DreamRuntimeModeZod>;

/**
 * CanvasState (canoniek)
 * - Alles string-based (parity-friendly)
 * - Geen nulls
 * - Room for future fields without breaking changes
 */
export const CanvasStateZod = z.object({
  // versioning/migrations
  state_version: z.string(),

  // routing
  current_step: z.string(), // should be canonical, but stored as string for resilience
  active_specialist: z.string(),
  intro_shown_for_step: z.string(), // stores last step-id for which intro was shown
  intro_shown_session: BoolStringZod,

  // language handling (multi-language UX)
  language: z.string(),
  language_locked: BoolStringZod, // once set from a meaningful user message, we don't auto-flip
  language_override: BoolStringZod, // true only when user explicitly requested a language
  // UI strings (localized in backend; cached per language)
  ui_strings: z.record(z.string(), z.string()),
  ui_strings_lang: z.string(),

  // last output (used for proceed triggers / transitions)
  // FIX (Zod v4): record needs key + value schema
  last_specialist_result: z.record(z.string(), z.any()),

  // stable stored lines / finals
  step_0_final: z.string(),
  dream_final: z.string(),
  purpose_final: z.string(),
  bigwhy_final: z.string(),
  role_final: z.string(),
  entity_final: z.string(),
  strategy_final: z.string(),
  targetgroup_final: z.string(),
  productsservices_final: z.string(),
  rulesofthegame_final: z.string(),
  presentation_brief_final: z.string(),

  // staged per-step value (chosen wording before explicit next-step confirm)
  provisional_by_step: z.record(z.string(), z.string()),
  __dream_runtime_mode: DreamRuntimeModeZod,
  dream_builder_statements: z.array(z.string()),

  // shared convenience fields
  business_name: z.string(),

  // reserved
  summary_target: z.string(),
});

export type CanvasState = z.infer<typeof CanvasStateZod>;

/**
 * Current state schema version
 * Bump when you change defaults/fields in a way that needs migration.
 */
export const CURRENT_STATE_VERSION = "4";

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

    language: "",
    language_locked: "false",
    language_override: "false",
    ui_strings: {},
    ui_strings_lang: "",

    last_specialist_result: {},

    step_0_final: "",
    dream_final: "",
    purpose_final: "",
    bigwhy_final: "",
    role_final: "",
    entity_final: "",
    strategy_final: "",
    targetgroup_final: "",
    productsservices_final: "",
    rulesofthegame_final: "",
    presentation_brief_final: "",

    provisional_by_step: {},
    __dream_runtime_mode: "self",
    dream_builder_statements: [],

    business_name: "TBD",

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

  const language = String(r.language ?? d.language).trim().toLowerCase();
  const language_locked_raw = String(r.language_locked ?? d.language_locked).trim();
  const language_locked: BoolString = language_locked_raw === "true" ? "true" : "false";
  const language_override_raw = String(r.language_override ?? d.language_override).trim();
  const language_override: BoolString = language_override_raw === "true" ? "true" : "false";
  const ui_strings_raw =
    typeof (r as any).ui_strings === "object" && (r as any).ui_strings !== null
      ? (r as any).ui_strings
      : d.ui_strings;
  const ui_strings = Object.fromEntries(
    Object.entries(ui_strings_raw || {}).map(([k, v]) => [String(k), String(v ?? "")])
  );
  const ui_strings_lang = String((r as any).ui_strings_lang ?? d.ui_strings_lang).trim().toLowerCase();

  const last_specialist_result =
    typeof r.last_specialist_result === "object" && r.last_specialist_result !== null
      ? (r.last_specialist_result as Record<string, any>)
      : {};

  const step_0_final = String(r.step_0_final ?? d.step_0_final);
  const dream_final = String(r.dream_final ?? d.dream_final);
  const purpose_final = String(r.purpose_final ?? d.purpose_final);
  const bigwhy_final = String(r.bigwhy_final ?? d.bigwhy_final);
  const role_final = String(r.role_final ?? d.role_final);
  const entity_final = String(r.entity_final ?? d.entity_final);
  const strategy_final = String(r.strategy_final ?? d.strategy_final);
  const targetgroup_final = String(r.targetgroup_final ?? d.targetgroup_final);
  const productsservices_final = String(r.productsservices_final ?? d.productsservices_final);
  const rulesofthegame_final = String(r.rulesofthegame_final ?? d.rulesofthegame_final);
  const presentation_brief_final = String(r.presentation_brief_final ?? d.presentation_brief_final);
  const provisional_raw =
    typeof r.provisional_by_step === "object" && r.provisional_by_step !== null
      ? (r.provisional_by_step as Record<string, unknown>)
      : {};
  const provisional_by_step = Object.fromEntries(
    Object.entries(provisional_raw).map(([k, v]) => [String(k), String(v ?? "").trim()])
  );
  const dreamRuntimeModeRaw = String((r as any).__dream_runtime_mode ?? d.__dream_runtime_mode).trim();
  const __dream_runtime_mode: DreamRuntimeMode =
    dreamRuntimeModeRaw === "builder_collect" ||
    dreamRuntimeModeRaw === "builder_scoring" ||
    dreamRuntimeModeRaw === "builder_refine"
      ? dreamRuntimeModeRaw
      : "self";
  const dreamBuilderStatementsRaw = Array.isArray((r as any).dream_builder_statements)
    ? ((r as any).dream_builder_statements as unknown[])
    : [];
  const dream_builder_statements = dreamBuilderStatementsRaw
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  const business_name = String(r.business_name ?? d.business_name) || "TBD";
  const summary_target = String(r.summary_target ?? d.summary_target) || "unknown";

  const normalized: CanvasState = {
    state_version,
    current_step,
    active_specialist,
    intro_shown_for_step,
    intro_shown_session,

    language,
    language_locked,
    language_override,
    ui_strings,
    ui_strings_lang,

    last_specialist_result,

    step_0_final,
    dream_final,
    purpose_final,
    bigwhy_final,
    role_final,
    entity_final,
    strategy_final,
    targetgroup_final,
    productsservices_final,
    rulesofthegame_final,
    presentation_brief_final,

    provisional_by_step,
    __dream_runtime_mode,
    dream_builder_statements,

    business_name,
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

  // v3 -> v4: hard reset legacy confirm/proceed sessions (no compatibility layer).
  if (s.state_version === "3") {
    const fresh = getDefaultState();
    s = {
      ...fresh,
      language: String((s as any).language ?? "").trim().toLowerCase(),
      language_locked: String((s as any).language_locked ?? "false") === "true" ? "true" : "false",
      language_override: String((s as any).language_override ?? "false") === "true" ? "true" : "false",
      ui_strings:
        typeof (s as any).ui_strings === "object" && (s as any).ui_strings !== null
          ? Object.fromEntries(
              Object.entries((s as any).ui_strings as Record<string, unknown>).map(([k, v]) => [
                String(k),
                String(v ?? ""),
              ])
            )
          : {},
      ui_strings_lang: String((s as any).ui_strings_lang ?? "").trim().toLowerCase(),
      provisional_by_step: {},
    };
    return CanvasStateZod.parse(s);
  }

  // v2 -> v3: add targetgroup_final and productsservices_final
  if (s.state_version === "2") {
    s = {
      ...s,
      state_version: "3",
      targetgroup_final: String((s as any).targetgroup_final ?? ""),
      productsservices_final: String((s as any).productsservices_final ?? ""),
    };
    return migrateState(s);
  }

  // v1 -> v2: add missing finals + language fields (defaults)
  s = {
    ...s,
    state_version: "2",
    business_name: s.business_name?.trim() ? s.business_name : "TBD",
    language: String((s as any).language ?? "").trim().toLowerCase(),
    language_locked: String((s as any).language_locked ?? "false") === "true" ? "true" : "false",
    language_override: String((s as any).language_override ?? "false") === "true" ? "true" : "false",
    purpose_final: String((s as any).purpose_final ?? ""),
    bigwhy_final: String((s as any).bigwhy_final ?? ""),
    role_final: String((s as any).role_final ?? ""),
    entity_final: String((s as any).entity_final ?? ""),
    strategy_final: String((s as any).strategy_final ?? ""),
    rulesofthegame_final: String((s as any).rulesofthegame_final ?? ""),
    presentation_brief_final: String((s as any).presentation_brief_final ?? ""),
    targetgroup_final: "",
    productsservices_final: "",
  };

  // Recursively migrate to current version if needed
  return migrateState(s);
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

/**
 * Canonical finals keys (stable field ids for recap / "facts so far").
 * Used by orchestration to pass only non-empty finals into specialist context.
 */
export const FINALS_KEYS = [
  "business_name",
  "step_0_final",
  "dream_final",
  "purpose_final",
  "bigwhy_final",
  "role_final",
  "entity_final",
  "strategy_final",
  "targetgroup_final",
  "productsservices_final",
  "rulesofthegame_final",
  "presentation_brief_final",
] as const;

export type FinalsKey = (typeof FINALS_KEYS)[number];

/**
 * Returns a snapshot of all finals that have a non-empty value.
 * Used for recap and to pass "finals so far" into every step.
 * Steps with no final value must NOT appear in the recap; this helper enforces that.
 */
export function getFinalsSnapshot(state: CanvasState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FINALS_KEYS) {
    const v = String((state as Record<string, unknown>)[k] ?? "").trim();
    if (!v) continue;
    if (k === "business_name" && v === "TBD") continue; // placeholder, not a final
    out[k] = v;
  }
  return out;
}
