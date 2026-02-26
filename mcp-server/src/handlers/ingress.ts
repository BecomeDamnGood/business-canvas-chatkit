import { z } from "zod";

import {
  CURRENT_STATE_VERSION,
  getDefaultState,
  normalizeState,
  normalizeStateLanguageSource,
  CanvasStateZod,
  type CanvasState,
} from "../core/state.js";
import {
  normalizeLangCode as localeStartNormalizeLangCode,
  normalizeLocaleHint as localeStartNormalizeLocaleHint,
} from "../core/bootstrap_runtime.js";

export const ALLOWED_TRANSIENT_STATE_KEYS = new Set<string>([
  "__text_submit",
  "__pending_scores",
  "__bootstrap_poll",
  "__ui_telemetry",
  "__ui_phase_by_step",
  "__ui_render_mode_by_step",
  "__request_id",
  "__client_action_id",
  "__session_id",
  "__session_started_at",
  "__session_log_file",
  "__session_turn_index",
  "__session_turn_id",
  "__dream_runtime_mode",
  "__dream_builder_prompt_stage",
  "__last_clicked_action_for_contract",
  "__last_clicked_label_for_contract",
]);

export function stripUnknownTransientStateKeys(next: Record<string, unknown>): void {
  for (const key of Object.keys(next)) {
    if (!key.startsWith("__")) continue;
    if (ALLOWED_TRANSIENT_STATE_KEYS.has(key)) continue;
    delete next[key];
  }
}

export function canonicalizeStateForRunStepArgs(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const next = { ...(raw as Record<string, unknown>) };
  // Server-side SSOT: localized string map is derived by backend each turn.
  // Never trust client-echoed ui_strings payload as authoritative state.
  if (Object.prototype.hasOwnProperty.call(next, "ui_strings")) {
    delete next.ui_strings;
  }
  stripUnknownTransientStateKeys(next);
  next.language_source = normalizeStateLanguageSource(next.language_source);
  return next;
}

export const IDEMPOTENCY_KEY_MAX_LEN = 128;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeIngressIdempotencyKey(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.length > IDEMPOTENCY_KEY_MAX_LEN) return "";
  return IDEMPOTENCY_KEY_RE.test(value) ? value : "";
}

function resolveIngressIdempotencyKey(params: {
  explicit: unknown;
  state: Record<string, unknown> | null | undefined;
}): string {
  const explicit = normalizeIngressIdempotencyKey(params.explicit);
  if (explicit) return explicit;
  const state = params.state && typeof params.state === "object" ? params.state : {};
  return normalizeIngressIdempotencyKey((state as any).__client_action_id);
}

export const RunStepArgsSchema = z.object({
  current_step_id: z.string().optional().default("step_0"),
  user_message: z.string().default(""),
  input_mode: z.enum(["widget", "chat"]).optional().default("chat"),
  locale_hint: z.string().optional().default(""),
  locale_hint_source: z
    .enum(["openai_locale", "webplus_i18n", "request_header", "message_detect", "none"])
    .optional()
    .default("none"),
  idempotency_key: z
    .preprocess(normalizeIngressIdempotencyKey, z.string().max(IDEMPOTENCY_KEY_MAX_LEN).optional())
    .default(""),
  // Use CanvasStateZod schema for type safety and validation
  // .partial() makes all fields optional (for empty/partial state)
  // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
  state: z.preprocess(canonicalizeStateForRunStepArgs, CanvasStateZod.partial().passthrough().optional()),
});

export type RunStepArgs = z.infer<typeof RunStepArgsSchema>;

export function normalizeContractLang(raw: unknown): string {
  return localeStartNormalizeLangCode(String(raw ?? "")) || "";
}

export function normalizeContractLocale(raw: unknown): string {
  return localeStartNormalizeLocaleHint(String(raw ?? "")) || "";
}

export function detectLegacySessionMarkers(
  state: Record<string, unknown> | CanvasState,
  options?: { includeStateVersionMismatch?: boolean }
): string[] {
  const reasons: string[] = [];
  const includeStateVersionMismatch = options?.includeStateVersionMismatch === true;
  const stateVersion = String((state as any).state_version || "").trim();
  if (includeStateVersionMismatch && stateVersion && stateVersion !== CURRENT_STATE_VERSION) {
    reasons.push("state_version_mismatch");
  }
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  const action = String(last.action || "").trim().toUpperCase();
  if (action === "CONFIRM") {
    reasons.push("legacy_action_confirm");
  }
  if (String(last.confirmation_question || "").trim()) {
    reasons.push("legacy_confirmation_question");
  }
  for (const key of ["proceed_to_dream", "proceed_to_purpose", "proceed_to_next"]) {
    if (String((last as any)[key] || "").trim().toLowerCase() === "true") {
      reasons.push(`legacy_${key}`);
    }
  }
  if (String((state as any).__ui_phase || "").trim()) {
    reasons.push("legacy_ui_phase_marker");
  }
  return reasons;
}

export const CONTRACT_BOOTSTRAP_PHASES = new Set(["waiting_locale", "ready", "recovery", "failed"]);
export const CONTRACT_UI_GATE_STATUSES = new Set(["waiting_locale", "ready", "blocked", "failed"]);
export const CONTRACT_UI_GATE_REASONS = new Set([
  "",
  "translation_pending",
  "translation_retry",
  "session_upgrade_required",
  "contract_violation",
  "invalid_state",
]);
export const CONTRACT_UI_STRINGS_STATUSES = new Set(["pending", "critical_ready", "ready"]);
export const CONTRACT_UI_VIEW_MODES = new Set([
  "waiting_locale",
  "prestart",
  "interactive",
  "recovery",
  "blocked",
  "failed",
]);
export const CONTRACT_UI_FALLBACK_REASONS = new Set([
  "",
  "requested_lang_unavailable",
  "timeout",
  "invalid_requested_lang",
]);

export function detectInvalidContractStateMarkers(stateRaw: Record<string, unknown> | null | undefined): string[] {
  const state = stateRaw && typeof stateRaw === "object" ? stateRaw : {};
  const markers: string[] = [];
  const localeRaw = String((state as any).locale ?? "").trim();
  if (localeRaw && !normalizeContractLocale(localeRaw)) {
    markers.push("invalid_locale");
  }
  const uiGateStatus = String((state as any).ui_gate_status ?? "").trim();
  if (uiGateStatus && !CONTRACT_UI_GATE_STATUSES.has(uiGateStatus)) {
    markers.push("invalid_ui_gate_status");
  }
  const uiGateReason = String((state as any).ui_gate_reason ?? "").trim();
  if (uiGateReason && !CONTRACT_UI_GATE_REASONS.has(uiGateReason)) {
    markers.push("invalid_ui_gate_reason");
  }
  const uiStringsStatus = String((state as any).ui_strings_status ?? "").trim().toLowerCase();
  if (uiStringsStatus && !CONTRACT_UI_STRINGS_STATUSES.has(uiStringsStatus)) {
    markers.push("invalid_ui_strings_status");
  }
  const bootstrapPhase = String((state as any).bootstrap_phase ?? "").trim().toLowerCase();
  if (bootstrapPhase && !CONTRACT_BOOTSTRAP_PHASES.has(bootstrapPhase)) {
    markers.push("invalid_bootstrap_phase");
  }
  return markers;
}

export function buildFailClosedState(
  stateRaw: CanvasState | null | undefined,
  reason: "session_upgrade_required" | "contract_violation" | "invalid_state",
  options?: {
    requestedLang?: string;
  }
): CanvasState {
  const normalized = stateRaw ? normalizeState(stateRaw) : getDefaultState();
  const locale =
    normalizeContractLocale(
      (normalized as any).locale ||
        options?.requestedLang ||
        (normalized as any).ui_strings_requested_lang ||
        (normalized as any).language
    ) || "en";
  const language = normalizeContractLang((normalized as any).language || locale) || "en";
  const requestedLang =
    normalizeContractLocale(options?.requestedLang || (normalized as any).ui_strings_requested_lang || locale) || "en";
  const resolvedLanguage = language || requestedLang;
  const normalizedLanguageSource = normalizeStateLanguageSource((normalized as any).language_source);
  const uiStringsLang = normalizeContractLocale((normalized as any).ui_strings_lang || "");
  return {
    ...(normalized as any),
    locale,
    language: resolvedLanguage,
    language_source:
      normalizedLanguageSource || (resolvedLanguage ? "locale_hint" : ""),
    ui_gate_status: reason === "invalid_state" ? "failed" : "blocked",
    ui_gate_reason: reason,
    ui_gate_since_ms: 0,
    ui_bootstrap_status: "ready",
    bootstrap_phase: "failed",
    bootstrap_retry_hint: "",
    ui_strings_requested_lang: requestedLang,
    ui_strings_lang: uiStringsLang || (normalizeContractLang(requestedLang) === "en" ? "en" : ""),
    ui_strings_fallback_applied: "false",
    ui_strings_fallback_reason: "",
  } as CanvasState;
}

export type RunStepIngressParseResult =
  | {
      ok: true;
      args: RunStepArgs;
      incomingLanguageSourceRaw: string;
    }
  | {
      ok: false;
      currentStep: string;
      blockedState: CanvasState;
      issues: z.ZodIssue[];
      incomingLanguageSourceRaw: string;
    };

export function parseRunStepIngressArgs(
  rawArgs: unknown,
  options?: { defaultStepId?: string }
): RunStepIngressParseResult {
  const defaultStepId = String(options?.defaultStepId || "step_0").trim() || "step_0";
  const incomingLanguageSourceRaw =
    rawArgs && typeof rawArgs === "object" && (rawArgs as any).state && typeof (rawArgs as any).state === "object"
      ? String(((rawArgs as any).state as Record<string, unknown>).language_source ?? "").trim()
      : "";
  const parsedArgs = RunStepArgsSchema.safeParse(rawArgs);
  if (parsedArgs.success) {
    const parsedState =
      parsedArgs.data.state && typeof parsedArgs.data.state === "object" && !Array.isArray(parsedArgs.data.state)
        ? (parsedArgs.data.state as Record<string, unknown>)
        : {};
    const idempotencyKey = resolveIngressIdempotencyKey({
      explicit: parsedArgs.data.idempotency_key,
      state: parsedState,
    });
    return {
      ok: true,
      args: {
        ...parsedArgs.data,
        idempotency_key: idempotencyKey,
      },
      incomingLanguageSourceRaw,
    };
  }

  const rawObject =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};
  const rawStateObject =
    rawObject.state && typeof rawObject.state === "object" && !Array.isArray(rawObject.state)
      ? (rawObject.state as Record<string, unknown>)
      : {};
  const currentStep = String(rawObject.current_step_id ?? rawStateObject.current_step ?? defaultStepId).trim() || defaultStepId;
  const requestedLang =
    normalizeContractLocale(
      String(
        rawObject.locale_hint ??
          rawStateObject.ui_strings_requested_lang ??
          rawStateObject.locale ??
          rawStateObject.language ??
          ""
      )
    ) || "en";
  const blockedState = buildFailClosedState(
    normalizeState(rawStateObject),
    "invalid_state",
    { requestedLang }
  );
  return {
    ok: false,
    currentStep,
    blockedState,
    issues: parsedArgs.error.issues,
    incomingLanguageSourceRaw,
  };
}
