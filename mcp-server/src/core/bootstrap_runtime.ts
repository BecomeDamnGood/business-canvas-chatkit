import type {
  BoolString,
  BootstrapPhase,
  CanvasState,
  LanguageSource,
  UiGateReason,
  UiGateStatus,
  UiStringsStatus,
} from "./state.js";

export type LocaleHintSource = "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";

export type BootstrapContractState = {
  phase: BootstrapPhase;
  waiting: boolean;
  ready: boolean;
  reason: UiGateReason;
  since_ms: number;
  retry_hint: "poll" | "";
};

export const VIEW_CONTRACT_VERSION = "v2";
export const DEFAULT_UI_GATE_FORCE_RECOVER_MS = 4000;

export type LocaleUiFlags = {
  uiLocaleReadyGateV1: boolean;
  uiInteractiveFallbackV1: boolean;
  uiBootstrapPollActionV1: boolean;
};

export function resolveUiGateForceRecoverMs(raw: unknown, fallbackMs = DEFAULT_UI_GATE_FORCE_RECOVER_MS): number {
  const fallback =
    Number.isFinite(fallbackMs) && fallbackMs > 0
      ? Math.trunc(fallbackMs)
      : DEFAULT_UI_GATE_FORCE_RECOVER_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function normalizeLangCode(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "und") return "";
  return s.split(/[-_]/)[0] || "";
}

export function normalizeLocaleHint(raw: string): string {
  const normalized = normalizeLangCode(String(raw || ""));
  if (!/^[a-z]{2,3}$/.test(normalized)) return "";
  return normalized;
}

export function countAlphaChars(input: string): number {
  const s = String(input || "");
  const matches = s.match(/\p{L}/gu);
  return matches ? matches.length : 0;
}

export function hasRenderableUiStringsForState(
  state: CanvasState | null | undefined,
  criticalKeys: string[]
): boolean {
  if (!state || typeof state !== "object") return false;
  const uiStrings =
    (state as any).ui_strings && typeof (state as any).ui_strings === "object"
      ? ((state as any).ui_strings as Record<string, unknown>)
      : null;
  if (!uiStrings) return false;
  return criticalKeys.every((key) => String(uiStrings[key] || "").trim().length > 0);
}

export function uiStringsRequestedStatusFromRaw(raw: unknown): UiStringsStatus {
  const normalized = String(raw ?? "pending").trim().toLowerCase();
  if (normalized === "ready") return "ready";
  if (normalized === "full_ready") return "full_ready";
  if (normalized === "critical_ready") return "critical_ready";
  return "pending";
}

export function enforceUiStringsReadinessInvariant(params: {
  state: CanvasState;
  criticalKeys: string[];
}): CanvasState {
  const { state, criticalKeys } = params;
  const lang = normalizeLangCode(
    String((state as any)?.language || (state as any)?.ui_strings_requested_lang || (state as any)?.ui_strings_lang || "")
  );
  if (!lang || lang === "en") return state;
  const uiStringsLang = normalizeLangCode(String((state as any)?.ui_strings_lang || ""));
  const requestedLang = normalizeLangCode(String((state as any)?.ui_strings_requested_lang || ""));
  const fallbackApplied = String((state as any)?.ui_strings_fallback_applied ?? "false") === "true";
  const uiLanguageAligned = uiStringsLang ? uiStringsLang === lang : requestedLang === lang;
  const uiStatus = uiStringsRequestedStatusFromRaw((state as any)?.ui_strings_status ?? "pending");
  if (uiStatus !== "ready") return state;
  if (fallbackApplied) return state;
  if (uiLanguageAligned && hasRenderableUiStringsForState(state, criticalKeys)) return state;
  return {
    ...(state as any),
    ui_strings_status: "pending",
    ui_bootstrap_status: "awaiting_locale",
    ui_translation_mode: "critical_first",
    ui_strings_critical_ready: "false",
    ui_strings_full_ready: "false",
    ui_strings_background_inflight: "true",
    bootstrap_phase: "waiting_locale",
  } as CanvasState;
}

export function isNonEnglishPendingUiStringsState(state: CanvasState | null | undefined): boolean {
  const lang = normalizeLangCode(String((state as any)?.language ?? ""));
  const uiStatus = uiStringsRequestedStatusFromRaw((state as any)?.ui_strings_status ?? "pending");
  return Boolean(lang) && lang !== "en" && uiStatus !== "ready";
}

export function isInteractiveFallbackState(params: {
  state: CanvasState | null | undefined;
  uiInteractiveFallbackV1: boolean;
  criticalKeys?: string[];
}): boolean {
  const { state, uiInteractiveFallbackV1 } = params;
  if (!uiInteractiveFallbackV1) return false;
  if (!isNonEnglishPendingUiStringsState(state)) return false;
  return true;
}

export function isInteractiveLocaleReady(params: {
  state: CanvasState | null | undefined;
  uiLocaleReadyGateV1: boolean;
  uiInteractiveFallbackV1: boolean;
  criticalKeys: string[];
}): boolean {
  const { state, uiLocaleReadyGateV1, criticalKeys } = params;
  if (!uiLocaleReadyGateV1) return true;
  const lang = normalizeLangCode(
    String((state as any)?.language || (state as any)?.ui_strings_requested_lang || (state as any)?.ui_strings_lang || "")
  );
  if (!lang || lang === "en") return true;
  const uiStatus = uiStringsRequestedStatusFromRaw((state as any)?.ui_strings_status ?? "pending");
  if (uiStatus !== "ready") return false;
  return hasRenderableUiStringsForState(state, criticalKeys);
}

function mapReasonFromStatus(state: CanvasState): UiGateReason {
  const raw = String((state as any)?.ui_strings_status ?? "").trim().toLowerCase();
  return raw === "error" ? "translation_retry" : "translation_pending";
}

function normalizeGateStatus(raw: unknown): UiGateStatus {
  const value = String(raw ?? "").trim();
  if (
    value === "waiting_locale" ||
    value === "ready" ||
    value === "blocked" ||
    value === "failed"
  ) {
    return value;
  }
  return "waiting_locale";
}

function normalizeGateReason(raw: unknown): UiGateReason {
  const value = String(raw ?? "").trim();
  if (
    value === "translation_pending" ||
    value === "translation_retry" ||
    value === "session_upgrade_required" ||
    value === "contract_violation" ||
    value === "invalid_state"
  ) {
    return value;
  }
  return "";
}

export function deriveBootstrapContract(params: {
  state: CanvasState | null | undefined;
  flags: LocaleUiFlags;
  criticalKeys: string[];
  nowMs: number;
}): BootstrapContractState {
  const { state, flags, criticalKeys, nowMs } = params;
  if (!state || !flags.uiLocaleReadyGateV1) {
    return { phase: "ready", waiting: false, ready: true, reason: "", since_ms: 0, retry_hint: "" };
  }
  const normalized = enforceUiStringsReadinessInvariant({ state, criticalKeys });
  const phase = String((normalized as any)?.bootstrap_phase ?? "").trim().toLowerCase();
  const gateStatus = normalizeGateStatus((normalized as any)?.ui_gate_status);
  const gateReason = normalizeGateReason((normalized as any)?.ui_gate_reason);
  if (gateStatus === "blocked" || gateStatus === "failed" || phase === "failed") {
    return {
      phase: "failed",
      waiting: false,
      ready: false,
      reason: gateReason || "invalid_state",
      since_ms: 0,
      retry_hint: "",
    };
  }
  if (phase === "recovery") {
    return { phase: "recovery", waiting: false, ready: true, reason: "", since_ms: 0, retry_hint: "" };
  }
  const waiting = isNonEnglishPendingUiStringsState(normalized);
  const reason = waiting ? mapReasonFromStatus(normalized) : "";
  const rawSince = Number((normalized as any)?.ui_gate_since_ms ?? 0);
  const since_ms = waiting && Number.isFinite(rawSince) && rawSince > 0 ? Math.trunc(rawSince) : (waiting ? nowMs : 0);
  const retry_hint = waiting && flags.uiBootstrapPollActionV1 ? "poll" : "";
  return {
    phase: waiting ? "waiting_locale" : "ready",
    waiting,
    ready: !waiting,
    reason,
    since_ms,
    retry_hint,
  };
}

export function applyUiGateState(params: {
  previousState: CanvasState | null | undefined;
  nextState: CanvasState;
  forceRecoverMs: number;
  flags: LocaleUiFlags;
  criticalKeys: string[];
  nowMs: number;
}): CanvasState {
  const { previousState, nextState, forceRecoverMs, flags, criticalKeys, nowMs } = params;
  const normalizedNextState = enforceUiStringsReadinessInvariant({ state: nextState, criticalKeys });
  const currentGateStatus = normalizeGateStatus((normalizedNextState as any)?.ui_gate_status);
  const currentGateReason = normalizeGateReason((normalizedNextState as any)?.ui_gate_reason);
  const currentPhase = String((normalizedNextState as any)?.bootstrap_phase ?? "").trim().toLowerCase();
  if (currentGateStatus === "blocked" || currentGateStatus === "failed" || currentPhase === "failed") {
    return {
      ...(normalizedNextState as any),
      ui_gate_status: currentGateStatus === "failed" ? "failed" : "blocked",
      ui_gate_reason: currentGateReason || "invalid_state",
      ui_gate_since_ms: 0,
      bootstrap_phase: "failed",
      bootstrap_retry_hint: "",
    } as CanvasState;
  }
  if (!flags.uiLocaleReadyGateV1) {
    return {
      ...(normalizedNextState as any),
      ui_gate_status: "ready",
      ui_gate_reason: "",
      ui_gate_since_ms: 0,
      bootstrap_phase: "ready",
      bootstrap_retry_hint: "",
    } as CanvasState;
  }
  const waiting = isNonEnglishPendingUiStringsState(normalizedNextState);
  if (!waiting) {
    return {
      ...(normalizedNextState as any),
      ui_gate_status: "ready",
      ui_gate_reason: "",
      ui_gate_since_ms: 0,
      bootstrap_phase: "ready",
      bootstrap_retry_hint: "",
    } as CanvasState;
  }
  const prevStatus = String((previousState as any)?.ui_gate_status ?? "").trim();
  const prevSinceRaw = Number((previousState as any)?.ui_gate_since_ms ?? 0);
  const sinceMs =
    prevStatus === "waiting_locale" && Number.isFinite(prevSinceRaw) && prevSinceRaw > 0
      ? Math.trunc(prevSinceRaw)
      : nowMs;
  if (nowMs - sinceMs > forceRecoverMs) {
    const uiStatus = uiStringsRequestedStatusFromRaw((normalizedNextState as any)?.ui_strings_status);
    const criticalRenderable = hasRenderableUiStringsForState(normalizedNextState, criticalKeys);
    const targetLang = normalizeLangCode(
      String(
        (normalizedNextState as any)?.language ||
          (normalizedNextState as any)?.ui_strings_requested_lang ||
          (normalizedNextState as any)?.ui_strings_lang ||
          ""
      )
    );
    const resolvedUiStringsLang = normalizeLangCode(String((normalizedNextState as any)?.ui_strings_lang || ""));
    const requestedUiStringsLang = normalizeLangCode(
      String((normalizedNextState as any)?.ui_strings_requested_lang || "")
    );
    const uiLanguageAligned =
      !targetLang ||
      targetLang === "en" ||
      (resolvedUiStringsLang ? resolvedUiStringsLang === targetLang : requestedUiStringsLang === targetLang);
    const canReady =
      criticalRenderable &&
      uiLanguageAligned &&
      (uiStatus === "ready" || flags.uiInteractiveFallbackV1);
    if (canReady) {
      return {
        ...(normalizedNextState as any),
        ui_strings_status: "ready",
        ui_bootstrap_status: "ready",
        ui_strings_critical_ready: "true",
        ui_strings_full_ready: "true",
        ui_strings_background_inflight: "false",
        ui_gate_status: "ready",
        ui_gate_reason: "",
        ui_gate_since_ms: 0,
        bootstrap_phase: "ready",
        bootstrap_retry_hint: "",
      } as CanvasState;
    }

    // Timeout must not silently flip to EN-ready. Keep locale unresolved and poll/recover explicitly.
    return {
      ...(normalizedNextState as any),
      ui_strings_status: criticalRenderable ? "critical_ready" : "pending",
      ui_bootstrap_status: "awaiting_locale",
      ui_strings_critical_ready: criticalRenderable ? "true" : "false",
      ui_strings_full_ready: "false",
      ui_strings_background_inflight: "true",
      ui_gate_status: "waiting_locale",
      ui_gate_reason: "translation_retry",
      ui_gate_since_ms: sinceMs,
      bootstrap_phase: "waiting_locale",
      bootstrap_retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
    } as CanvasState;
  }
  return {
    ...(normalizedNextState as any),
    ui_gate_status: "waiting_locale",
    ui_gate_reason: mapReasonFromStatus(normalizedNextState),
    ui_gate_since_ms: sinceMs,
    bootstrap_phase: "waiting_locale",
    bootstrap_retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
  } as CanvasState;
}

export function computeUiBootstrapStatus(params: {
  state: CanvasState | null | undefined;
  uiStatusRaw: string;
  uiBootstrapStateV1: boolean;
}): "init" | "awaiting_locale" | "ready" {
  const { state, uiStatusRaw, uiBootstrapStateV1 } = params;
  if (!uiBootstrapStateV1) return "ready";
  const phaseRaw = String((state as any)?.bootstrap_phase ?? "").trim().toLowerCase();
  if (phaseRaw === "ready") return "ready";
  if (phaseRaw === "failed") return "ready";
  if (phaseRaw === "recovery" || phaseRaw === "waiting_locale") return "awaiting_locale";
  const status = uiStringsRequestedStatusFromRaw(uiStatusRaw);
  if (status === "ready") return "ready";
  const lang = normalizeLangCode(String((state as any)?.language ?? ""));
  return lang ? "awaiting_locale" : "init";
}

export function parseExplicitLanguageOverride(message: string): string {
  const raw = String(message ?? "").trim().toLowerCase();
  if (!raw) return "";

  const codeMatch = raw.match(/\b(lang|language)\s*[:=]\s*([a-z]{2,3})\b/);
  if (codeMatch && codeMatch[2]) {
    const code = codeMatch[2].slice(0, 2);
    return code;
  }

  const keywords = [
    "switch", "change", "use", "speak", "language", "lang",
  ];
  const hasKeyword = keywords.some((k) => raw.includes(k));
  if (!hasKeyword) return "";

  const nameMap: Record<string, string> = {
    english: "en",
    german: "de",
    deutsch: "de",
    french: "fr",
    spanish: "es",
    italian: "it",
    portuguese: "pt",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    arabic: "ar",
    hindi: "hi",
    turkish: "tr",
    russian: "ru",
  };

  for (const [name, code] of Object.entries(nameMap)) {
    if (raw.includes(name)) return code;
  }

  return "";
}

export type UiI18nCounterKey =
  | "locale_hint_used_count"
  | "locale_hint_missing_count"
  | "language_source_overridden_count";

export async function resolveLanguageForTurn(params: {
  state: CanvasState;
  userMessage: string;
  localeHintRaw: string;
  localeHintSourceRaw: LocaleHintSource | string;
  inputMode: "widget" | "chat";
  model: string;
  languageMinAlpha: number;
  deps: {
    isForceEnglishLanguageMode: () => boolean;
    isUiLocaleMetaV1Enabled: () => boolean;
    isUiLangSourceResolverV1Enabled: () => boolean;
    normalizeLanguageSource: (raw: unknown) => LanguageSource;
    ensureUiStringsForState: (
      state: CanvasState,
      model: string,
      telemetry?: unknown
    ) => Promise<CanvasState>;
    detectLanguageHeuristic: (text: string) => Promise<{ lang: string; confident: boolean }>;
    bumpUiI18nCounter: (telemetry: unknown, key: UiI18nCounterKey, amount?: number) => void;
    withLanguageDecision: (
      state: CanvasState,
      language: string,
      source: LanguageSource,
      options: { locked: BoolString; override: BoolString }
    ) => CanvasState;
  };
  telemetry?: unknown;
}): Promise<CanvasState> {
  const {
    state,
    userMessage,
    localeHintRaw,
    localeHintSourceRaw,
    inputMode,
    model,
    languageMinAlpha,
    deps,
    telemetry,
  } = params;

  if (deps.isForceEnglishLanguageMode()) {
    return deps.ensureUiStringsForState(
      {
        ...(state as any),
        language: "en",
        language_locked: "true",
        language_override: "false",
        language_source: "persisted",
      } as CanvasState,
      model,
      telemetry
    );
  }
  const msg = String(userMessage ?? "");

  const explicit = msg.trim() ? parseExplicitLanguageOverride(msg) : "";
  if (explicit) {
    const next = deps.withLanguageDecision(state, explicit, "explicit_override", {
      locked: "true",
      override: "true",
    });
    return deps.ensureUiStringsForState(next, model, telemetry);
  }

  const current = String((state as any).language ?? "").trim().toLowerCase();
  const currentSource = deps.normalizeLanguageSource((state as any).language_source);
  const locked = String((state as any).language_locked ?? "false") === "true";
  const override = String((state as any).language_override ?? "false") === "true";
  if (override && current) {
    const persisted = currentSource
      ? state
      : deps.withLanguageDecision(state, current, "explicit_override", {
          locked: "true",
          override: "true",
        });
    return deps.ensureUiStringsForState(persisted, model, telemetry);
  }

  const localeHint = deps.isUiLocaleMetaV1Enabled() ? normalizeLocaleHint(localeHintRaw) : "";
  const localeHintSource =
    localeHintSourceRaw === "openai_locale" ||
    localeHintSourceRaw === "webplus_i18n" ||
    localeHintSourceRaw === "request_header" ||
    localeHintSourceRaw === "message_detect"
      ? localeHintSourceRaw
      : "none";
  const trustedLocaleHintSource = localeHintSource !== "none";
  if (deps.isUiLocaleMetaV1Enabled()) {
    if (localeHint) deps.bumpUiI18nCounter(telemetry, "locale_hint_used_count");
    else deps.bumpUiI18nCounter(telemetry, "locale_hint_missing_count");
  }

  if (deps.isUiLangSourceResolverV1Enabled() && localeHint) {
    const isWidgetTurn = inputMode === "widget";
    const isBrowserLocaleHint = localeHintSource === "webplus_i18n";
    const hasDetectableMessage = countAlphaChars(msg) >= languageMinAlpha;
    const shouldDeferToMessageDetect =
      isWidgetTurn && isBrowserLocaleHint && !current && !locked && hasDetectableMessage;
    const canUseLocaleHint = isWidgetTurn
      ? (!current && trustedLocaleHintSource && !isBrowserLocaleHint)
      : (trustedLocaleHintSource || !current);
    if (!canUseLocaleHint || locked) {
      if (!shouldDeferToMessageDetect) {
        const persisted = current && !currentSource
          ? deps.withLanguageDecision(state, current, "persisted", {
              locked: locked ? "true" : "false",
              override: override ? "true" : "false",
            })
          : state;
        return deps.ensureUiStringsForState(persisted, model, telemetry);
      }
    } else {
      if (current && current !== localeHint) {
        deps.bumpUiI18nCounter(telemetry, "language_source_overridden_count");
      }
      const next = deps.withLanguageDecision(state, localeHint, "locale_hint", {
        locked: "true",
        override: "false",
      });
      return deps.ensureUiStringsForState(next, model, telemetry);
    }
  }

  if (locked && current) {
    const persisted = currentSource
      ? state
      : deps.withLanguageDecision(state, current, "persisted", {
          locked: "true",
          override: "false",
        });
    return deps.ensureUiStringsForState(persisted, model, telemetry);
  }

  if (countAlphaChars(msg) < languageMinAlpha) {
    const persisted = current && !currentSource
      ? deps.withLanguageDecision(state, current, "persisted", {
          locked: locked ? "true" : "false",
          override: override ? "true" : "false",
        })
      : state;
    return deps.ensureUiStringsForState(persisted, model, telemetry);
  }

  const detected = await deps.detectLanguageHeuristic(msg);
  if (!detected.lang) {
    const persisted = current && !currentSource
      ? deps.withLanguageDecision(state, current, "persisted", {
          locked: locked ? "true" : "false",
          override: override ? "true" : "false",
        })
      : state;
    return deps.ensureUiStringsForState(persisted, model, telemetry);
  }

  const next = deps.withLanguageDecision(state, detected.lang, "message_detect", {
    locked: "true",
    override: "false",
  });

  return deps.ensureUiStringsForState(next, model, telemetry);
}
