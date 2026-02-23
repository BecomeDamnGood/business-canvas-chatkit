import type {
  BoolString,
  BootstrapDecision,
  BootstrapPhase,
  CanvasState,
  LanguageSource,
} from "../core/state.js";

export type LocaleHintSource = "openai_locale" | "webplus_i18n" | "request_header" | "none";
export type UiStringsStatus = "ready" | "pending" | "error";
export type UiTranslationMode = "critical_first" | "full";
export type UiGateReason = "translation_pending" | "translation_retry" | "";

export type BootstrapContractState = {
  phase: BootstrapPhase;
  waiting: boolean;
  ready: boolean;
  reason: "translation_pending" | "translation_retry" | "";
  since_ms: number;
  retry_hint: "poll" | "";
};

export const VIEW_CONTRACT_VERSION = "v1";

export type BootstrapFsmInput = {
  hasState: boolean;
  hasCurrentStep: boolean;
  uiStringsStatus: "ready" | "pending" | "error" | "unknown";
  uiGateStatus: "waiting_locale" | "ready" | "unknown";
  localeKnownNonEn: boolean;
  interactiveFallbackEnabled: boolean;
  retryCount: number;
  retryExhausted: boolean;
  waitingTtlExpired: boolean;
};

let bootstrapPhaseMismatchCount = 0;

function normalizeUiStringsStatus(raw: unknown): BootstrapFsmInput["uiStringsStatus"] {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "ready" || normalized === "pending" || normalized === "error") return normalized;
  return "unknown";
}

function normalizeUiGateStatus(raw: unknown): BootstrapFsmInput["uiGateStatus"] {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "waiting_locale" || normalized === "ready") return normalized;
  return "unknown";
}

export function computeBootstrapDecision(input: BootstrapFsmInput): BootstrapDecision {
  if (input.retryExhausted || input.waitingTtlExpired) {
    return {
      phase: "recovery",
      retry_hint: "none",
      interactive_allowed: false,
      render_mode: "recovery",
    };
  }
  const missingState = !input.hasState || !input.hasCurrentStep;
  const localePending =
    input.uiStringsStatus === "pending" ||
    input.uiStringsStatus === "error" ||
    (input.uiStringsStatus === "unknown" &&
      (input.uiGateStatus === "waiting_locale" || input.localeKnownNonEn)) ||
    (input.localeKnownNonEn && input.uiStringsStatus !== "ready");

  let phase: BootstrapPhase = "ready";
  if (missingState && localePending) phase = "waiting_both";
  else if (missingState) phase = "waiting_state";
  else if (localePending) phase = input.interactiveFallbackEnabled ? "interactive_fallback" : "waiting_locale";

  const waiting =
    phase === "waiting_state" ||
    phase === "waiting_locale" ||
    phase === "waiting_both" ||
    phase === "interactive_fallback";

  return {
    phase,
    retry_hint: waiting ? "poll" : "none",
    interactive_allowed: phase === "ready" || phase === "interactive_fallback",
    render_mode: waiting ? "wait_shell" : "interactive",
  };
}

function legacyPhaseFromContract(contract: Omit<BootstrapContractState, "phase">): BootstrapPhase {
  if (contract.waiting && contract.ready) return "interactive_fallback";
  if (contract.waiting && !contract.ready && contract.reason) return "waiting_locale";
  if (contract.waiting && !contract.ready) return "waiting_state";
  if (contract.ready) return "ready";
  return "init";
}

function maybeLogBootstrapMismatch(params: {
  source: "derive" | "apply";
  legacy: Omit<BootstrapContractState, "phase">;
  fsm: BootstrapContractState;
}): void {
  const { source, legacy, fsm } = params;
  const legacyPhase = legacyPhaseFromContract(legacy);
  const legacyRetry = legacy.retry_hint || "";
  const fsmRetry = fsm.retry_hint || "";
  if (
    legacy.waiting === fsm.waiting &&
    legacy.ready === fsm.ready &&
    legacy.reason === fsm.reason &&
    legacyRetry === fsmRetry &&
    legacyPhase === fsm.phase
  ) {
    return;
  }
  bootstrapPhaseMismatchCount += 1;
  console.log("[bootstrap_phase_mismatch]", {
    source,
    bootstrap_phase_mismatch_count: bootstrapPhaseMismatchCount,
    legacy_phase: legacyPhase,
    fsm_phase: fsm.phase,
    legacy_waiting: legacy.waiting,
    fsm_waiting: fsm.waiting,
    legacy_ready: legacy.ready,
    fsm_ready: fsm.ready,
    legacy_reason: legacy.reason,
    fsm_reason: fsm.reason,
    legacy_retry_hint: legacy.retry_hint,
    fsm_retry_hint: fsm.retry_hint,
  });
}

export type LocaleUiFlags = {
  uiLocaleReadyGateV1: boolean;
  uiInteractiveFallbackV1: boolean;
  uiBootstrapPollActionV1: boolean;
};

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

export function enforceUiStringsReadinessInvariant(params: {
  state: CanvasState;
  criticalKeys: string[];
}): CanvasState {
  const { state, criticalKeys } = params;
  const lang = normalizeLangCode(
    String((state as any)?.language || (state as any)?.ui_strings_requested_lang || (state as any)?.ui_strings_lang || "")
  );
  if (!lang || lang === "en") return state;
  const uiStatusRaw = String((state as any)?.ui_strings_status ?? "ready").trim().toLowerCase();
  const uiStatus = uiStatusRaw === "pending" || uiStatusRaw === "error" ? uiStatusRaw : "ready";
  if (uiStatus !== "ready") return state;
  if (hasRenderableUiStringsForState(state, criticalKeys)) return state;
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
  const uiStatusRaw = String((state as any)?.ui_strings_status ?? "ready").trim().toLowerCase();
  const uiStatus = uiStatusRaw === "pending" || uiStatusRaw === "error" ? uiStatusRaw : "ready";
  return Boolean(lang) && lang !== "en" && uiStatus !== "ready";
}

export function isInteractiveFallbackState(params: {
  state: CanvasState | null | undefined;
  uiInteractiveFallbackV1: boolean;
}): boolean {
  const { state, uiInteractiveFallbackV1 } = params;
  if (!uiInteractiveFallbackV1) return false;
  if (!isNonEnglishPendingUiStringsState(state)) return false;
  const mode = String((state as any)?.ui_translation_mode || "").trim().toLowerCase();
  return mode === "critical_first";
}

export function isInteractiveLocaleReady(params: {
  state: CanvasState | null | undefined;
  uiLocaleReadyGateV1: boolean;
  uiInteractiveFallbackV1: boolean;
  criticalKeys: string[];
}): boolean {
  const { state, uiLocaleReadyGateV1, uiInteractiveFallbackV1, criticalKeys } = params;
  if (!uiLocaleReadyGateV1) return true;
  if (isInteractiveFallbackState({ state, uiInteractiveFallbackV1 })) return true;
  const lang = normalizeLangCode(
    String((state as any)?.language || (state as any)?.ui_strings_requested_lang || (state as any)?.ui_strings_lang || "")
  );
  if (!lang || lang === "en") return true;
  const uiStatusRaw = String((state as any)?.ui_strings_status ?? "ready").trim().toLowerCase();
  const uiStatus = uiStatusRaw === "pending" || uiStatusRaw === "error" ? uiStatusRaw : "ready";
  if (uiStatus !== "ready") return false;
  return hasRenderableUiStringsForState(state, criticalKeys);
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
  const lang = normalizeLangCode(String((state as any)?.language ?? ""));
  const pendingUiStrings = isNonEnglishPendingUiStringsState(state);
  const fallbackState = isInteractiveFallbackState({
    state,
    uiInteractiveFallbackV1: flags.uiInteractiveFallbackV1,
  });
  const uiStatusRaw = String((state as any)?.ui_strings_status ?? "pending").trim().toLowerCase();
  const reason: "translation_pending" | "translation_retry" = uiStatusRaw === "error"
    ? "translation_retry"
    : "translation_pending";
  const rawSince = Number((state as any)?.ui_gate_since_ms ?? 0);
  const sinceMs = Number.isFinite(rawSince) && rawSince > 0 ? Math.trunc(rawSince) : nowMs;

  const legacy: Omit<BootstrapContractState, "phase"> =
    !pendingUiStrings &&
    isInteractiveLocaleReady({
      state,
      uiLocaleReadyGateV1: flags.uiLocaleReadyGateV1,
      uiInteractiveFallbackV1: flags.uiInteractiveFallbackV1,
      criticalKeys,
    })
      ? { waiting: false, ready: true, reason: "", since_ms: 0, retry_hint: "" }
      : pendingUiStrings && fallbackState
        ? {
            waiting: true,
            ready: true,
            reason,
            since_ms: sinceMs,
            retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
          }
        : {
            waiting: true,
            ready: false,
            reason,
            since_ms: sinceMs,
            retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
          };
  const fsmDecision = computeBootstrapDecision({
    hasState: true,
    hasCurrentStep: String((state as any)?.current_step ?? "").trim().length > 0,
    uiStringsStatus: normalizeUiStringsStatus((state as any)?.ui_strings_status),
    uiGateStatus: normalizeUiGateStatus((state as any)?.ui_gate_status),
    localeKnownNonEn: Boolean(lang) && lang !== "en",
    interactiveFallbackEnabled: fallbackState,
    retryCount: 0,
    retryExhausted: false,
    waitingTtlExpired: false,
  });
  const waiting =
    fsmDecision.phase === "waiting_state" ||
    fsmDecision.phase === "waiting_locale" ||
    fsmDecision.phase === "waiting_both" ||
    fsmDecision.phase === "interactive_fallback";
  const ready =
    fsmDecision.phase === "ready" ||
    fsmDecision.phase === "interactive_fallback" ||
    fsmDecision.phase === "recovery";
  const contract: BootstrapContractState = {
    phase: fsmDecision.phase,
    waiting,
    ready,
    reason: waiting ? reason : "",
    since_ms: waiting ? sinceMs : 0,
    retry_hint: flags.uiBootstrapPollActionV1 && fsmDecision.retry_hint === "poll" ? "poll" : "",
  };
  maybeLogBootstrapMismatch({ source: "derive", legacy, fsm: contract });
  return contract;
}

function mapPhaseToUiBootstrapStatus(params: {
  phase: BootstrapPhase;
  lang: string;
}): "init" | "awaiting_locale" | "ready" {
  const { phase, lang } = params;
  if (phase === "ready" || phase === "recovery") return "ready";
  if (phase === "interactive_fallback") return "awaiting_locale";
  if (phase === "waiting_locale" || phase === "waiting_both") return "awaiting_locale";
  if (phase === "waiting_state") return lang ? "awaiting_locale" : "init";
  return "init";
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
  const prevStatus = String((previousState as any)?.ui_gate_status ?? "").trim();
  const prevSinceRaw = Number((previousState as any)?.ui_gate_since_ms ?? 0);
  const waitingLocaleExpired =
    prevStatus === "waiting_locale" &&
    Number.isFinite(prevSinceRaw) &&
    prevSinceRaw > 0 &&
    nowMs - prevSinceRaw > forceRecoverMs;
  if (!flags.uiLocaleReadyGateV1) {
    return {
      ...(normalizedNextState as any),
      ui_gate_status: "ready",
      ui_gate_reason: "",
      ui_gate_since_ms: 0,
      bootstrap_phase: "ready",
    } as CanvasState;
  }

  const lang = normalizeLangCode(String((normalizedNextState as any)?.language ?? ""));
  const pendingUiStrings = isNonEnglishPendingUiStringsState(normalizedNextState);
  const fallbackState = isInteractiveFallbackState({
    state: normalizedNextState,
    uiInteractiveFallbackV1: flags.uiInteractiveFallbackV1,
  });
  const nextUiStatusRaw = String((normalizedNextState as any)?.ui_strings_status ?? "pending").trim().toLowerCase();
  const reason: UiGateReason = nextUiStatusRaw === "error" ? "translation_retry" : "translation_pending";
  const sinceMs =
    prevStatus === "waiting_locale" && Number.isFinite(prevSinceRaw) && prevSinceRaw > 0
      ? Math.trunc(prevSinceRaw)
      : nowMs;
  const legacy: Omit<BootstrapContractState, "phase"> =
    waitingLocaleExpired
      ? { waiting: false, ready: true, reason: "", since_ms: 0, retry_hint: "" }
      : pendingUiStrings && fallbackState
        ? {
            waiting: true,
            ready: true,
            reason,
            since_ms: sinceMs,
            retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
          }
        : pendingUiStrings
          ? {
              waiting: true,
              ready: false,
              reason,
              since_ms: sinceMs,
              retry_hint: flags.uiBootstrapPollActionV1 ? "poll" : "",
            }
          : {
              waiting: false,
              ready: true,
              reason: "",
              since_ms: 0,
              retry_hint: "",
            };
  const fsmDecision = computeBootstrapDecision({
    hasState: true,
    hasCurrentStep: String((normalizedNextState as any)?.current_step ?? "").trim().length > 0,
    uiStringsStatus: normalizeUiStringsStatus((normalizedNextState as any)?.ui_strings_status),
    uiGateStatus: normalizeUiGateStatus((normalizedNextState as any)?.ui_gate_status),
    localeKnownNonEn: Boolean(lang) && lang !== "en",
    interactiveFallbackEnabled: fallbackState,
    retryCount: 0,
    retryExhausted: false,
    waitingTtlExpired: waitingLocaleExpired,
  });
  const waiting =
    fsmDecision.phase === "waiting_state" ||
    fsmDecision.phase === "waiting_locale" ||
    fsmDecision.phase === "waiting_both" ||
    fsmDecision.phase === "interactive_fallback";
  const ready =
    fsmDecision.phase === "ready" ||
    fsmDecision.phase === "interactive_fallback" ||
    fsmDecision.phase === "recovery";
  const contract: BootstrapContractState = {
    phase: fsmDecision.phase,
    waiting,
    ready,
    reason: waiting ? reason : "",
    since_ms: waiting ? sinceMs : 0,
    retry_hint: flags.uiBootstrapPollActionV1 && fsmDecision.retry_hint === "poll" ? "poll" : "",
  };
  maybeLogBootstrapMismatch({ source: "apply", legacy, fsm: contract });

  if (contract.phase === "recovery") {
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
      bootstrap_phase: "recovery",
    } as CanvasState;
  }
  if (!contract.waiting) {
    return {
      ...(normalizedNextState as any),
      ui_gate_status: "ready",
      ui_gate_reason: "",
      ui_gate_since_ms: 0,
      bootstrap_phase: contract.phase,
    } as CanvasState;
  }
  return {
    ...(normalizedNextState as any),
    ui_gate_status: "waiting_locale",
    ui_gate_reason: contract.reason,
    ui_gate_since_ms: contract.since_ms,
    bootstrap_phase: contract.phase,
  } as CanvasState;
}

export function sanitizeBootstrapIngressState(params: {
  previousState: CanvasState | null | undefined;
  candidateState: CanvasState;
  forceRecoverMs: number;
  flags: LocaleUiFlags;
  criticalKeys: string[];
  nowMs: number;
}): { state: CanvasState; readyClaimRejected: boolean } {
  const { previousState, candidateState, forceRecoverMs, flags, criticalKeys, nowMs } = params;
  const lang = normalizeLangCode(
    String(
      (candidateState as any)?.language ||
      (candidateState as any)?.ui_strings_requested_lang ||
      (candidateState as any)?.ui_strings_lang ||
      ""
    )
  );
  const claimsReady =
    String((candidateState as any)?.ui_strings_status ?? "").trim().toLowerCase() === "ready" &&
    String((candidateState as any)?.ui_strings_critical_ready ?? "").trim().toLowerCase() === "true";
  const criticalRenderable = lang === "en" || hasRenderableUiStringsForState(candidateState, criticalKeys);
  const gated = applyUiGateState({
    previousState,
    nextState: candidateState,
    forceRecoverMs,
    flags,
    criticalKeys,
    nowMs,
  });
  const readyClaimRejected =
    claimsReady &&
    !criticalRenderable &&
    String((gated as any)?.ui_strings_status ?? "").trim().toLowerCase() !== "ready";
  return { state: gated, readyClaimRejected };
}

export function computeUiBootstrapStatus(params: {
  state: CanvasState | null | undefined;
  uiStatusRaw: string;
  uiBootstrapStateV1: boolean;
}): "init" | "awaiting_locale" | "ready" {
  const { state, uiStatusRaw, uiBootstrapStateV1 } = params;
  if (!uiBootstrapStateV1) return "ready";
  const lang = normalizeLangCode(String((state as any)?.language ?? ""));
  const phaseRaw = String((state as any)?.bootstrap_phase ?? "").trim();
  const phase =
    phaseRaw === "init" ||
    phaseRaw === "waiting_state" ||
    phaseRaw === "waiting_locale" ||
    phaseRaw === "waiting_both" ||
    phaseRaw === "interactive_fallback" ||
    phaseRaw === "ready" ||
    phaseRaw === "recovery"
      ? (phaseRaw as BootstrapPhase)
      : null;
  if (phase) {
    return mapPhaseToUiBootstrapStatus({ phase, lang });
  }
  const status = uiStatusRaw === "pending" || uiStatusRaw === "error" ? uiStatusRaw : "ready";
  if (status === "ready") return "ready";
  if (isNonEnglishPendingUiStringsState(state)) return "awaiting_locale";
  return lang ? "awaiting_locale" : "init";
}

export function uiStringsRequestedStatusFromRaw(raw: unknown): UiStringsStatus {
  const normalized = String(raw ?? "ready").trim().toLowerCase();
  if (normalized === "pending" || normalized === "error") return normalized;
  return "ready";
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
    localeHintSourceRaw === "request_header"
      ? localeHintSourceRaw
      : "none";
  const trustedLocaleHintSource = localeHintSource !== "none";
  if (deps.isUiLocaleMetaV1Enabled()) {
    if (localeHint) {
      deps.bumpUiI18nCounter(telemetry, "locale_hint_used_count");
    } else {
      deps.bumpUiI18nCounter(telemetry, "locale_hint_missing_count");
    }
  }

  if (deps.isUiLangSourceResolverV1Enabled() && localeHint) {
    const isWidgetTurn = inputMode === "widget";
    const canUseLocaleHint = isWidgetTurn ? !current : (trustedLocaleHintSource || !current);
    if (!canUseLocaleHint || locked) {
      const persisted = current && !currentSource
        ? deps.withLanguageDecision(state, current, "persisted", {
            locked: locked ? "true" : "false",
            override: override ? "true" : "false",
          })
        : state;
      return deps.ensureUiStringsForState(persisted, model, telemetry);
    }
    if (current && current !== localeHint) {
      deps.bumpUiI18nCounter(telemetry, "language_source_overridden_count");
    }
    const next = deps.withLanguageDecision(state, localeHint, "locale_hint", {
      locked: "true",
      override: "false",
    });
    return deps.ensureUiStringsForState(next, model, telemetry);
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
