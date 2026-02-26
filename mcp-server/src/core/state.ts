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

/**
 * SSOT: canonical step -> persisted final field.
 * Keep this map as the single owner for step/final routing.
 */
export const STEP_FINAL_FIELD_BY_STEP_ID = {
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
} as const satisfies Record<CanonicalStepId, string>;

export type StepFinalField = (typeof STEP_FINAL_FIELD_BY_STEP_ID)[CanonicalStepId];

export function getFinalFieldForStepId(stepId: string): StepFinalField | "" {
  if (!isCanonicalStepId(stepId)) return "";
  return STEP_FINAL_FIELD_BY_STEP_ID[stepId];
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
export const PROVISIONAL_SOURCES = [
  "user_input",
  "wording_pick",
  "action_route",
  "system_generated",
] as const;
export const ProvisionalSourceZod = z.enum(PROVISIONAL_SOURCES);
export type ProvisionalSource = z.infer<typeof ProvisionalSourceZod>;
export const LANGUAGE_SOURCES = [
  "",
  "explicit_override",
  "locale_hint",
  "message_detect",
  "persisted",
] as const;
export const LanguageSourceZod = z.enum(LANGUAGE_SOURCES);
export type LanguageSource = z.infer<typeof LanguageSourceZod>;
export const IDEMPOTENCY_OUTCOMES = ["", "fresh", "replay", "conflict", "inflight"] as const;
export const IdempotencyOutcomeZod = z.enum(IDEMPOTENCY_OUTCOMES);
export type IdempotencyOutcome = z.infer<typeof IdempotencyOutcomeZod>;

export function normalizeStateLanguageSource(raw: unknown): LanguageSource {
  const source = String(raw ?? "").trim();
  if (
    source === "explicit_override" ||
    source === "locale_hint" ||
    source === "message_detect" ||
    source === "persisted"
  ) {
    return source;
  }
  // Legacy transport sources were mistakenly persisted into state.language_source.
  if (source === "openai_locale" || source === "webplus_i18n" || source === "request_header") {
    return "locale_hint";
  }
  return "";
}

function normalizeLocaleTag(raw: unknown): string {
  const normalizedRaw = String(raw ?? "")
    .trim()
    .replace(/_/g, "-")
    .replace(/-{2,}/g, "-");
  if (!normalizedRaw) return "";
  const parts = normalizedRaw
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const languagePart = parts[0] || "";
  if (!/^[A-Za-z]{2,3}$/.test(languagePart)) return "";
  const language = languagePart.toLowerCase();
  if (language === "und") return "";
  const rest: string[] = [];
  for (const part of parts.slice(1)) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(part)) return "";
    if (/^[A-Za-z]{4}$/.test(part)) {
      rest.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
      continue;
    }
    if (/^[A-Za-z]{2}$/.test(part) || /^[0-9]{3}$/.test(part)) {
      rest.push(part.toUpperCase());
      continue;
    }
    rest.push(part.toLowerCase());
  }
  return [language, ...rest].join("-");
}

function languageFromLocale(raw: unknown): string {
  const locale = normalizeLocaleTag(raw);
  if (!locale) return "";
  return locale.split("-")[0] || "";
}

function normalizeIdempotencyOutcome(raw: unknown): IdempotencyOutcome {
  const outcome = String(raw ?? "").trim();
  if (
    outcome === "fresh" ||
    outcome === "replay" ||
    outcome === "conflict" ||
    outcome === "inflight"
  ) {
    return outcome;
  }
  return "";
}
export const UI_STRINGS_STATUSES = ["pending", "critical_ready", "ready"] as const;
export const UiStringsStatusZod = z.enum(UI_STRINGS_STATUSES);
export type UiStringsStatus = z.infer<typeof UiStringsStatusZod>;
export const UI_BOOTSTRAP_STATUSES = ["init", "awaiting_locale", "ready"] as const;
export const UiBootstrapStatusZod = z.enum(UI_BOOTSTRAP_STATUSES);
export type UiBootstrapStatus = z.infer<typeof UiBootstrapStatusZod>;
export const UI_GATE_STATUSES = ["waiting_locale", "ready", "blocked", "failed"] as const;
export const UiGateStatusZod = z.enum(UI_GATE_STATUSES);
export type UiGateStatus = z.infer<typeof UiGateStatusZod>;
export const UI_GATE_REASONS = [
  "",
  "translation_pending",
  "translation_retry",
  "session_upgrade_required",
  "contract_violation",
  "invalid_state",
] as const;
export const UiGateReasonZod = z.enum(UI_GATE_REASONS);
export type UiGateReason = z.infer<typeof UiGateReasonZod>;
export const UI_STRINGS_FALLBACK_REASONS = [
  "",
  "requested_lang_unavailable",
  "timeout",
  "invalid_requested_lang",
] as const;
export const UiStringsFallbackReasonZod = z.enum(UI_STRINGS_FALLBACK_REASONS);
export type UiStringsFallbackReason = z.infer<typeof UiStringsFallbackReasonZod>;
export const UI_TRANSLATION_MODES = ["critical_first", "full"] as const;
export const UiTranslationModeZod = z.enum(UI_TRANSLATION_MODES);
export type UiTranslationMode = z.infer<typeof UiTranslationModeZod>;
export const BOOTSTRAP_PHASES = [
  "waiting_locale",
  "ready",
  "recovery",
  "failed",
] as const;
export const BootstrapPhaseZod = z.enum(BOOTSTRAP_PHASES);
export type BootstrapPhase = z.infer<typeof BootstrapPhaseZod>;
export type BootstrapRetryHint = "poll" | "none";
export type BootstrapRenderMode = "wait_shell" | "interactive" | "recovery";
export type BootstrapDecision = {
  phase: BootstrapPhase;
  retry_hint: BootstrapRetryHint;
  interactive_allowed: boolean;
  render_mode: BootstrapRenderMode;
};

export function deriveBootstrapPhaseFromLegacy(params: {
  ui_bootstrap_status: unknown;
  ui_gate_status: unknown;
  ui_strings_status: unknown;
}): BootstrapPhase {
  const bootstrap = String(params.ui_bootstrap_status ?? "").trim();
  const gate = String(params.ui_gate_status ?? "").trim();
  const strings = String(params.ui_strings_status ?? "").trim().toLowerCase();
  if (gate === "blocked" || gate === "failed") return "failed";
  if (bootstrap === "init" && strings !== "ready") return "waiting_locale";
  if (strings && strings !== "ready") return "waiting_locale";
  if (gate === "waiting_locale") {
    return "waiting_locale";
  }
  if (bootstrap === "awaiting_locale") return "waiting_locale";
  return "ready";
}

function normalizeUiStringsStatus(raw: unknown): UiStringsStatus {
  const status = String(raw ?? "").trim().toLowerCase();
  if (
    status === "pending" ||
    status === "critical_ready" ||
    status === "ready"
  ) {
    return status as UiStringsStatus;
  }
  // Legacy alias: treat previous "full_ready" as critical-ready until full ready is explicit "ready".
  if (status === "full_ready") return "critical_ready";
  return "pending";
}

function uiStatusAllowsCritical(status: UiStringsStatus): boolean {
  return status === "critical_ready" || status === "ready";
}

function uiStatusAllowsFull(status: UiStringsStatus): boolean {
  return status === "ready";
}

function uiStatusIsReady(status: UiStringsStatus): boolean {
  return status === "ready";
}

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
  locale: z.string(),
  language_locked: BoolStringZod, // once set from a meaningful user message, we don't auto-flip
  language_override: BoolStringZod, // true only when user explicitly requested a language
  language_source: LanguageSourceZod,
  // UI strings (localized in backend; cached per language)
  ui_strings: z.record(z.string(), z.string()),
  ui_strings_lang: z.string(),
  ui_strings_version: z.string(),
  ui_strings_status: UiStringsStatusZod,
  ui_strings_requested_lang: z.string(),
  ui_strings_fallback_applied: BoolStringZod,
  ui_strings_fallback_reason: UiStringsFallbackReasonZod,
  ui_bootstrap_status: UiBootstrapStatusZod,
  ui_gate_status: UiGateStatusZod,
  ui_gate_reason: UiGateReasonZod,
  ui_gate_since_ms: z.number().int().nonnegative(),
  ui_translation_mode: UiTranslationModeZod,
  ui_strings_critical_ready: BoolStringZod,
  ui_strings_full_ready: BoolStringZod,
  ui_strings_background_inflight: BoolStringZod,
  bootstrap_phase: BootstrapPhaseZod.optional(),
  bootstrap_session_id: z.string().optional(),
  bootstrap_epoch: z.number().int().positive().optional(),
  view_contract_version: z.string().optional(),
  response_seq: z.number().int().nonnegative().optional(),
  response_kind: z.enum(["run_step"]).optional(),
  host_widget_session_id: z.string().optional(),
  idempotency_key: z.string(),
  idempotency_outcome: IdempotencyOutcomeZod,
  idempotency_error_code: z.string(),

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
  provisional_source_by_step: z.record(z.string(), ProvisionalSourceZod),
  __dream_runtime_mode: DreamRuntimeModeZod,
  dream_builder_statements: z.array(z.string()),

  // shared convenience fields
  business_name: z.string(),
  quote_last_by_step: z.record(z.string(), z.string()),

  // reserved
  summary_target: z.string(),
});

export type CanvasState = z.infer<typeof CanvasStateZod>;

/**
 * Current state schema version
 * Bump when you change defaults/fields in a way that needs migration.
 */
export const CURRENT_STATE_VERSION = "12";
export const DEFAULT_VIEW_CONTRACT_VERSION = "v3_ssot_rigid";

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
    locale: "",
    language_locked: "false",
    language_override: "false",
    language_source: "",
    ui_strings: {},
    ui_strings_lang: "",
    ui_strings_version: "",
    ui_strings_status: "pending",
    ui_strings_requested_lang: "",
    ui_strings_fallback_applied: "false",
    ui_strings_fallback_reason: "",
    ui_bootstrap_status: "init",
    ui_gate_status: "waiting_locale",
    ui_gate_reason: "translation_pending",
    ui_gate_since_ms: 0,
    ui_translation_mode: "critical_first",
    ui_strings_critical_ready: "false",
    ui_strings_full_ready: "false",
    ui_strings_background_inflight: "true",
    view_contract_version: DEFAULT_VIEW_CONTRACT_VERSION,
    idempotency_key: "",
    idempotency_outcome: "",
    idempotency_error_code: "",

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
    provisional_source_by_step: {},
    __dream_runtime_mode: "self",
    dream_builder_statements: [],

    business_name: "TBD",
    quote_last_by_step: {},

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

  const locale = normalizeLocaleTag((r as any).locale ?? r.language ?? d.locale);
  const language = languageFromLocale(r.language ?? locale) || languageFromLocale(locale);
  const language_locked_raw = String(r.language_locked ?? d.language_locked).trim();
  const language_locked: BoolString = language_locked_raw === "true" ? "true" : "false";
  const language_override_raw = String(r.language_override ?? d.language_override).trim();
  const language_override: BoolString = language_override_raw === "true" ? "true" : "false";
  const language_source = normalizeStateLanguageSource((r as any).language_source ?? d.language_source);
  const ui_strings_raw =
    typeof (r as any).ui_strings === "object" && (r as any).ui_strings !== null
      ? (r as any).ui_strings
      : d.ui_strings;
  const ui_strings = Object.fromEntries(
    Object.entries(ui_strings_raw || {}).map(([k, v]) => [String(k), String(v ?? "")])
  );
  const ui_strings_lang = String((r as any).ui_strings_lang ?? d.ui_strings_lang).trim().toLowerCase();
  const ui_strings_version = String((r as any).ui_strings_version ?? d.ui_strings_version).trim();
  const ui_strings_status = normalizeUiStringsStatus((r as any).ui_strings_status ?? d.ui_strings_status);
  const ui_strings_requested_lang = String((r as any).ui_strings_requested_lang ?? d.ui_strings_requested_lang)
    .trim()
    .toLowerCase();
  const ui_strings_fallback_applied_raw = String(
    (r as any).ui_strings_fallback_applied ?? d.ui_strings_fallback_applied
  ).trim();
  const ui_strings_fallback_applied: BoolString =
    ui_strings_fallback_applied_raw === "true" ? "true" : "false";
  const ui_strings_fallback_reason_raw = String(
    (r as any).ui_strings_fallback_reason ?? d.ui_strings_fallback_reason
  ).trim();
  const ui_strings_fallback_reason: UiStringsFallbackReason =
    ui_strings_fallback_reason_raw === "requested_lang_unavailable" ||
    ui_strings_fallback_reason_raw === "timeout" ||
    ui_strings_fallback_reason_raw === "invalid_requested_lang"
      ? ui_strings_fallback_reason_raw
      : "";
  const ui_bootstrap_status_raw = String((r as any).ui_bootstrap_status ?? d.ui_bootstrap_status).trim();
  const ui_bootstrap_status: UiBootstrapStatus =
    ui_bootstrap_status_raw === "awaiting_locale" || ui_bootstrap_status_raw === "ready"
      ? ui_bootstrap_status_raw
      : "init";
  const ui_gate_status_raw = String((r as any).ui_gate_status ?? d.ui_gate_status).trim();
  const ui_gate_status: UiGateStatus =
    ui_gate_status_raw === "waiting_locale" ||
    ui_gate_status_raw === "ready" ||
    ui_gate_status_raw === "blocked" ||
    ui_gate_status_raw === "failed"
      ? ui_gate_status_raw
      : "waiting_locale";
  const ui_gate_reason_raw = String((r as any).ui_gate_reason ?? d.ui_gate_reason).trim();
  const ui_gate_reason: UiGateReason =
    ui_gate_reason_raw === "translation_pending" ||
    ui_gate_reason_raw === "translation_retry" ||
    ui_gate_reason_raw === "session_upgrade_required" ||
    ui_gate_reason_raw === "contract_violation" ||
    ui_gate_reason_raw === "invalid_state"
      ? ui_gate_reason_raw
      : "";
  const ui_gate_since_raw = Number((r as any).ui_gate_since_ms ?? d.ui_gate_since_ms);
  const ui_gate_since_ms = Number.isFinite(ui_gate_since_raw) && ui_gate_since_raw >= 0
    ? Math.trunc(ui_gate_since_raw)
    : 0;
  const ui_translation_mode_raw = String((r as any).ui_translation_mode ?? d.ui_translation_mode).trim();
  const ui_translation_mode: UiTranslationMode =
    ui_translation_mode_raw === "critical_first" || ui_translation_mode_raw === "full"
      ? ui_translation_mode_raw
      : "full";
  const ui_strings_critical_ready_raw = String(
    (r as any).ui_strings_critical_ready ?? d.ui_strings_critical_ready
  ).trim();
  const ui_strings_critical_ready: BoolString = ui_strings_critical_ready_raw === "true" ? "true" : "false";
  const ui_strings_full_ready_raw = String((r as any).ui_strings_full_ready ?? d.ui_strings_full_ready).trim();
  const ui_strings_full_ready: BoolString = ui_strings_full_ready_raw === "true" ? "true" : "false";
  const ui_strings_background_inflight_raw = String(
    (r as any).ui_strings_background_inflight ?? d.ui_strings_background_inflight
  ).trim();
  const ui_strings_background_inflight: BoolString =
    ui_strings_background_inflight_raw === "true" ? "true" : "false";
  const bootstrap_phase_raw = String((r as any).bootstrap_phase ?? "").trim().toLowerCase();
  const bootstrap_phase: BootstrapPhase =
    bootstrap_phase_raw === "waiting_locale" ||
    bootstrap_phase_raw === "ready" ||
    bootstrap_phase_raw === "recovery" ||
    bootstrap_phase_raw === "failed"
      ? (bootstrap_phase_raw as BootstrapPhase)
      : (
        bootstrap_phase_raw === "init" ||
        bootstrap_phase_raw === "waiting_state" ||
        bootstrap_phase_raw === "waiting_both" ||
        bootstrap_phase_raw === "interactive_fallback"
          ? "waiting_locale"
          : deriveBootstrapPhaseFromLegacy({
              ui_bootstrap_status,
              ui_gate_status,
              ui_strings_status,
            })
      );
  const bootstrap_phase_canonical: BootstrapPhase = bootstrap_phase;
  const bootstrap_session_id = String((r as any).bootstrap_session_id ?? "").trim();
  const bootstrap_epoch_raw = Number((r as any).bootstrap_epoch ?? 0);
  const bootstrap_epoch =
    Number.isFinite(bootstrap_epoch_raw) && bootstrap_epoch_raw > 0
      ? Math.trunc(bootstrap_epoch_raw)
      : 0;
  const view_contract_version =
    String((r as any).view_contract_version ?? "").trim() || DEFAULT_VIEW_CONTRACT_VERSION;
  const response_seq_raw = Number((r as any).response_seq ?? 0);
  const response_seq =
    Number.isFinite(response_seq_raw) && response_seq_raw >= 0
      ? Math.trunc(response_seq_raw)
      : 0;
  const response_kind_raw = String((r as any).response_kind ?? "").trim();
  const response_kind: "run_step" | "" =
    response_kind_raw === "run_step" ? "run_step" : "";
  const host_widget_session_id = String((r as any).host_widget_session_id ?? "").trim();
  const idempotency_key = String((r as any).idempotency_key ?? "").trim();
  const idempotency_outcome = normalizeIdempotencyOutcome((r as any).idempotency_outcome);
  const idempotency_error_code = String((r as any).idempotency_error_code ?? "").trim();

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
  const provisional_source_raw =
    typeof r.provisional_source_by_step === "object" && r.provisional_source_by_step !== null
      ? (r.provisional_source_by_step as Record<string, unknown>)
      : {};
  const provisional_source_by_step = Object.fromEntries(
    Object.entries(provisional_source_raw)
      .map(([k, v]) => {
        const source = String(v || "").trim();
        if (
          source !== "user_input" &&
          source !== "wording_pick" &&
          source !== "action_route" &&
          source !== "system_generated"
        ) {
          return null;
        }
        return [String(k), source] as const;
      })
      .filter((entry): entry is readonly [string, "user_input" | "wording_pick" | "action_route" | "system_generated"] => Boolean(entry))
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
  const quote_last_by_step_raw =
    typeof (r as any).quote_last_by_step === "object" && (r as any).quote_last_by_step !== null
      ? ((r as any).quote_last_by_step as Record<string, unknown>)
      : {};
  const quote_last_by_step = Object.fromEntries(
    Object.entries(quote_last_by_step_raw).map(([k, v]) => [String(k), String(v ?? "")])
  );
  const summary_target = String(r.summary_target ?? d.summary_target) || "unknown";

  const normalized: CanvasState = {
    state_version,
    current_step,
    active_specialist,
    intro_shown_for_step,
    intro_shown_session,

    language,
    locale,
    language_locked,
    language_override,
    language_source,
    ui_strings,
    ui_strings_lang,
    ui_strings_version,
    ui_strings_status,
    ui_strings_requested_lang,
    ui_strings_fallback_applied,
    ui_strings_fallback_reason,
    ui_bootstrap_status,
    ui_gate_status,
    ui_gate_reason,
    ui_gate_since_ms,
    ui_translation_mode,
    ui_strings_critical_ready,
    ui_strings_full_ready,
    ui_strings_background_inflight,
    bootstrap_phase: bootstrap_phase_canonical,
    ...(bootstrap_session_id ? { bootstrap_session_id } : {}),
    ...(bootstrap_epoch > 0 ? { bootstrap_epoch } : {}),
    view_contract_version,
    ...(response_seq > 0 ? { response_seq } : {}),
    ...(response_kind ? { response_kind } : {}),
    ...(host_widget_session_id ? { host_widget_session_id } : {}),
    idempotency_key,
    idempotency_outcome,
    idempotency_error_code,

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
    provisional_source_by_step,
    __dream_runtime_mode,
    dream_builder_statements,

    business_name,
    quote_last_by_step,
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

  // v11 -> v12: add canonical locale field (BCP47-like) while keeping language as base code.
  if (s.state_version === "11") {
    const locale = normalizeLocaleTag(
      (s as any).locale || (s as any).ui_strings_requested_lang || (s as any).language || ""
    );
    const language = languageFromLocale((s as any).language || locale) || "";
    s = {
      ...s,
      state_version: "12",
      locale,
      language,
    };
    return CanvasStateZod.parse(s);
  }

  // v10 -> v11: add explicit ui fallback metadata.
  if (s.state_version === "10") {
    s = {
      ...s,
      state_version: "11",
      ui_strings_fallback_applied:
        String((s as any).ui_strings_fallback_applied ?? "false").trim() === "true" ? "true" : "false",
      ui_strings_fallback_reason: (() => {
        const reason = String((s as any).ui_strings_fallback_reason ?? "").trim();
        if (
          reason === "requested_lang_unavailable" ||
          reason === "timeout" ||
          reason === "invalid_requested_lang"
        ) {
          return reason;
        }
        return "";
      })(),
    };
    return migrateState(s);
  }

  // v9 -> v10: add critical-first translation metadata.
  if (s.state_version === "9") {
    const uiStatus = normalizeUiStringsStatus((s as any).ui_strings_status ?? "pending");
    s = {
      ...s,
      state_version: "10",
      ui_translation_mode: uiStatusAllowsFull(uiStatus) ? "full" : "critical_first",
      ui_strings_critical_ready: uiStatusAllowsCritical(uiStatus) ? "true" : "false",
      ui_strings_full_ready: uiStatusAllowsFull(uiStatus) ? "true" : "false",
      ui_strings_background_inflight: uiStatusAllowsFull(uiStatus) ? "false" : "true",
    };
    return migrateState(s);
  }

  // v8 -> v9: add locale-ready UI gate metadata.
  if (s.state_version === "8") {
    const uiStatus = normalizeUiStringsStatus((s as any).ui_strings_status ?? "pending");
    const gateStatus: UiGateStatus = uiStatusIsReady(uiStatus) ? "ready" : "waiting_locale";
    const gateReason: UiGateReason = gateStatus === "ready" ? "" : "translation_pending";
    const sinceRaw = Number((s as any).ui_gate_since_ms ?? 0);
    const ui_gate_since_ms =
      gateStatus === "ready"
        ? 0
        : Number.isFinite(sinceRaw) && sinceRaw > 0
          ? Math.trunc(sinceRaw)
          : 0;
    s = {
      ...s,
      state_version: "9",
      ui_gate_status: gateStatus,
      ui_gate_reason: gateReason,
      ui_gate_since_ms,
      ui_translation_mode: uiStatusAllowsFull(uiStatus) ? "full" : "critical_first",
      ui_strings_critical_ready: uiStatusAllowsCritical(uiStatus) ? "true" : "false",
      ui_strings_full_ready: uiStatusAllowsFull(uiStatus) ? "true" : "false",
      ui_strings_background_inflight: uiStatusAllowsFull(uiStatus) ? "false" : "true",
    };
    return migrateState(s);
  }

  // v7 -> v8: add UI bootstrap status metadata.
  if (s.state_version === "7") {
    const bootstrapRaw = String((s as any).ui_bootstrap_status ?? "").trim();
    const bootstrapFromStatus = normalizeUiStringsStatus((s as any).ui_strings_status ?? "pending");
    const ui_bootstrap_status =
      bootstrapRaw === "init" || bootstrapRaw === "awaiting_locale" || bootstrapRaw === "ready"
        ? bootstrapRaw
        : uiStatusIsReady(bootstrapFromStatus)
          ? "ready"
          : "awaiting_locale";
    s = {
      ...s,
      state_version: "8",
      ui_bootstrap_status,
      ui_translation_mode: ui_bootstrap_status === "ready" ? "full" : "critical_first",
      ui_strings_critical_ready: ui_bootstrap_status === "ready" ? "true" : "false",
      ui_strings_full_ready: ui_bootstrap_status === "ready" ? "true" : "false",
      ui_strings_background_inflight: ui_bootstrap_status === "ready" ? "false" : "true",
    };
    return migrateState(s);
  }

  // v6 -> v7: add language source + ui_strings status metadata.
  if (s.state_version === "6") {
    const language_source = normalizeStateLanguageSource((s as any).language_source ?? "");
    const ui_strings_status = normalizeUiStringsStatus((s as any).ui_strings_status ?? "pending");
    s = {
      ...s,
      state_version: "7",
      language_source,
      ui_strings_status,
      ui_strings_requested_lang: String((s as any).ui_strings_requested_lang ?? "").trim().toLowerCase(),
      ui_translation_mode: uiStatusAllowsFull(ui_strings_status) ? "full" : "critical_first",
      ui_strings_critical_ready: uiStatusAllowsCritical(ui_strings_status) ? "true" : "false",
      ui_strings_full_ready: uiStatusAllowsFull(ui_strings_status) ? "true" : "false",
      ui_strings_background_inflight: uiStatusAllowsFull(ui_strings_status) ? "false" : "true",
    };
    return migrateState(s);
  }

  // v5 -> v6: add source map for staged values (legacy staged values default to system_generated).
  if (s.state_version === "5") {
    const staged = typeof (s as any).provisional_by_step === "object" && (s as any).provisional_by_step !== null
      ? ((s as any).provisional_by_step as Record<string, unknown>)
      : {};
    const existingSources =
      typeof (s as any).provisional_source_by_step === "object" && (s as any).provisional_source_by_step !== null
        ? ((s as any).provisional_source_by_step as Record<string, unknown>)
        : {};
    const nextSources: Record<string, ProvisionalSource> = {};
    for (const [stepIdRaw, valueRaw] of Object.entries(staged)) {
      const stepId = String(stepIdRaw || "").trim();
      const value = String(valueRaw || "").trim();
      if (!stepId || !value) continue;
      const existing = String(existingSources[stepId] || "").trim();
      if (
        existing === "user_input" ||
        existing === "wording_pick" ||
        existing === "action_route" ||
        existing === "system_generated"
      ) {
        nextSources[stepId] = existing;
      } else {
        nextSources[stepId] = "system_generated";
      }
    }
    s = {
      ...s,
      state_version: "6",
      provisional_source_by_step: nextSources,
      ui_translation_mode: "full",
      ui_strings_critical_ready: "false",
      ui_strings_full_ready: "false",
      ui_strings_background_inflight: "false",
    };
    return migrateState(s);
  }

  // v4 -> v5: add ui string schema version marker to support deterministic text refresh.
  if (s.state_version === "4") {
    s = {
      ...s,
      state_version: "5",
      ui_strings_version: String((s as any).ui_strings_version ?? "").trim(),
      ui_translation_mode: "full",
      ui_strings_critical_ready: "false",
      ui_strings_full_ready: "false",
      ui_strings_background_inflight: "false",
    };
    return migrateState(s);
  }

  // v3 -> v4: hard reset legacy confirm/proceed sessions (no compatibility layer).
  if (s.state_version === "3") {
    const fresh = getDefaultState();
    s = {
      ...fresh,
      language: String((s as any).language ?? "").trim().toLowerCase(),
      language_locked: String((s as any).language_locked ?? "false") === "true" ? "true" : "false",
      language_override: String((s as any).language_override ?? "false") === "true" ? "true" : "false",
      quote_last_by_step:
        typeof (s as any).quote_last_by_step === "object" && (s as any).quote_last_by_step !== null
          ? Object.fromEntries(
              Object.entries((s as any).quote_last_by_step as Record<string, unknown>).map(([k, v]) => [
                String(k),
                String(v ?? ""),
              ])
            )
          : {},
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
      ui_strings_version: String((s as any).ui_strings_version ?? "").trim(),
      provisional_by_step: {},
      ui_translation_mode: "full",
      ui_strings_critical_ready: "false",
      ui_strings_full_ready: "false",
      ui_strings_background_inflight: "false",
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
    quote_last_by_step:
      typeof (s as any).quote_last_by_step === "object" && (s as any).quote_last_by_step !== null
        ? Object.fromEntries(
            Object.entries((s as any).quote_last_by_step as Record<string, unknown>).map(([k, v]) => [
              String(k),
              String(v ?? ""),
            ])
          )
        : {},
    rulesofthegame_final: String((s as any).rulesofthegame_final ?? ""),
    presentation_brief_final: String((s as any).presentation_brief_final ?? ""),
    targetgroup_final: "",
    productsservices_final: "",
    ui_translation_mode: "full",
    ui_strings_critical_ready: "false",
    ui_strings_full_ready: "false",
    ui_strings_background_inflight: "false",
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
  ...Object.values(STEP_FINAL_FIELD_BY_STEP_ID),
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
