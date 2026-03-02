import { loadModule as loadCld3 } from "cld3-asm";

import {
  normalizeStateLanguageSource,
  type CanvasState,
  type BoolString,
  type LanguageSource,
} from "../core/state.js";
import {
  normalizeLangCode as localeStartNormalizeLangCode,
  normalizeLocaleHint as localeStartNormalizeLocaleHint,
  hasRenderableUiStringsForState as localeStartHasRenderableUiStringsForState,
  enforceUiStringsReadinessInvariant as localeStartEnforceUiStringsReadinessInvariant,
  isNonEnglishPendingUiStringsState as localeStartIsNonEnglishPendingUiStringsState,
  isInteractiveLocaleReady as localeStartIsInteractiveLocaleReady,
  deriveBootstrapContract as localeStartDeriveBootstrapContract,
  applyUiGateState as localeStartApplyUiGateState,
  uiStringsRequestedStatusFromRaw as localeStartUiStringsRequestedStatusFromRaw,
  resolveUiGateForceRecoverMs as localeStartResolveUiGateForceRecoverMs,
  parseExplicitLanguageOverride as localeStartParseExplicitLanguageOverride,
  resolveLanguageForTurn as localeStartResolveLanguageForTurn,
} from "../core/bootstrap_runtime.js";
import { UI_STRINGS_CATALOG_BY_LOCALE } from "../i18n/ui_strings_catalog.js";
import {
  UI_STRINGS_KEYS,
  UI_STRINGS_SCHEMA_VERSION,
  criticalUiKeysForStep,
  UI_STRINGS_SOURCE_EN,
} from "../i18n/ui_strings_defaults.js";
import {
  createStructuredLogContextFromState,
  logStructuredEvent,
} from "./run_step_response.js";

const LANGUAGE_CONFIDENCE_THRESHOLD = 0.8;
const LANGUAGE_MIN_ALPHA = 8;
let cld3FactoryPromise: Promise<any> | null = null;
let cld3Identifier: any | null = null;

type StaticUiCatalogEntry = {
  locale: string;
  lang: string;
  strings: Record<string, string>;
};

const UI_STRINGS_CATALOG_EXACT = new Map<string, StaticUiCatalogEntry>();
const UI_STRINGS_CATALOG_BY_LANG = new Map<string, StaticUiCatalogEntry>();

function normalizeCatalogLocaleTag(raw: string): string {
  return localeStartNormalizeLocaleHint(String(raw || "")) || localeStartNormalizeLangCode(String(raw || ""));
}

function buildStaticUiCatalogIndexes(): void {
  for (const [localeRaw, stringsRaw] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    const locale = normalizeCatalogLocaleTag(localeRaw);
    const lang = localeStartNormalizeLangCode(locale);
    if (!locale || !lang) continue;
    const strings =
      stringsRaw && typeof stringsRaw === "object"
        ? Object.fromEntries(
            Object.entries(stringsRaw).map(([key, value]) => [String(key || ""), String(value || "")])
          )
        : {};
    const entry: StaticUiCatalogEntry = { locale, lang, strings };
    UI_STRINGS_CATALOG_EXACT.set(locale.toLowerCase(), entry);
    if (!UI_STRINGS_CATALOG_BY_LANG.has(lang)) {
      UI_STRINGS_CATALOG_BY_LANG.set(lang, entry);
    }
  }
}

buildStaticUiCatalogIndexes();

async function getCld3Identifier(): Promise<any> {
  if (cld3Identifier) return cld3Identifier;
  if (!cld3FactoryPromise) {
    cld3FactoryPromise = loadCld3();
  }
  const factory = await cld3FactoryPromise;
  cld3Identifier = factory.create(0, 512);
  return cld3Identifier;
}

export type BootstrapContractState = {
  phase?: "waiting_locale" | "ready" | "recovery" | "failed";
  waiting: boolean;
  ready: boolean;
  reason:
    | "translation_pending"
    | "translation_retry"
    | "session_upgrade_required"
    | "contract_violation"
    | "invalid_state"
    | "";
  since_ms: number;
  retry_hint: "poll" | "";
};

export type UiI18nTelemetryCounters = {
  legacy_i18n_migration_count: number;
  ui_strings_missing_keys: number;
  translation_fallbacks: number;
  translation_missing_keys: number;
  translation_html_violations: number;
  locale_hint_used_count: number;
  locale_hint_missing_count: number;
  language_source_overridden_count: number;
  ui_strings_pending_count: number;
  parity_errors: number;
  parity_recovered: number;
  confirm_gate_blocked_count: number;
  step0_escape_ready_recovered_count: number;
  wording_body_sanitized_count: number;
  semantic_prompt_missing_count: number;
  semantic_confirm_blocked_count: number;
  state_hygiene_resets_count: number;
  wording_feedback_fallback_count: number;
};

type RunStepI18nRuntimeDeps = {
  step0Id: string;
  isForceEnglishLanguageMode: () => boolean;
  isUiLocaleReadyGateV1Enabled: () => boolean;
  isUiBootstrapPollActionV1Enabled: () => boolean;
  isUiNoPendingTextSuppressV1Enabled: () => boolean;
  isUiPendingNoFallbackTextV1Enabled: () => boolean;
  isUiLocaleMetaV1Enabled: () => boolean;
  isUiLangSourceResolverV1Enabled: () => boolean;
};

type UiCatalogMatchKind = "exact" | "base" | "fallback_en";

type UiCatalogResolution = {
  strings: Record<string, string>;
  match_kind: UiCatalogMatchKind;
  matched_locale: string;
  ui_strings_lang: string;
  fallback_applied: BoolString;
  fallback_reason: "" | "requested_lang_unavailable" | "invalid_requested_lang";
  translated_key_count: number;
  critical_keys_missing: number;
};

export function createRunStepI18nRuntimeHelpers(deps: RunStepI18nRuntimeDeps) {
  function normalizeLangCode(raw: string): string {
    return localeStartNormalizeLangCode(raw);
  }

  function normalizeLocaleHint(raw: string): string {
    return localeStartNormalizeLocaleHint(raw);
  }

  function criticalUiKeysForState(state: CanvasState | null | undefined): string[] {
    const step = String((state as any)?.current_step || deps.step0Id).trim() || deps.step0Id;
    return criticalUiKeysForStep(step);
  }

  function hasRenderableUiStringsForState(state: CanvasState | null | undefined): boolean {
    return localeStartHasRenderableUiStringsForState(state, criticalUiKeysForState(state));
  }

  function enforceUiStringsReadinessInvariant(state: CanvasState): CanvasState {
    return localeStartEnforceUiStringsReadinessInvariant({
      state,
      criticalKeys: criticalUiKeysForState(state),
    });
  }

  function isNonEnglishPendingUiStringsState(state: CanvasState | null | undefined): boolean {
    return localeStartIsNonEnglishPendingUiStringsState(state);
  }

  function isInteractiveLocaleReady(state: CanvasState | null | undefined): boolean {
    return localeStartIsInteractiveLocaleReady({
      state,
      uiLocaleReadyGateV1: deps.isUiLocaleReadyGateV1Enabled(),
      criticalKeys: criticalUiKeysForState(state),
    });
  }

  function deriveBootstrapContract(state: CanvasState | null | undefined): BootstrapContractState {
    return localeStartDeriveBootstrapContract({
      state,
      flags: {
        uiLocaleReadyGateV1: deps.isUiLocaleReadyGateV1Enabled(),
        uiBootstrapPollActionV1: deps.isUiBootstrapPollActionV1Enabled(),
      },
      criticalKeys: criticalUiKeysForState(state),
      nowMs: Date.now(),
    });
  }

  function normalizeLanguageSource(raw: unknown): LanguageSource {
    return normalizeStateLanguageSource(raw);
  }

  function shouldSuppressFallbackText(state: CanvasState | null | undefined): boolean {
    if (deps.isUiNoPendingTextSuppressV1Enabled()) return false;
    if (!deps.isUiPendingNoFallbackTextV1Enabled()) return false;
    if (!isNonEnglishPendingUiStringsState(state)) return false;
    const source = normalizeLanguageSource((state as any)?.language_source);
    if (source === "locale_hint" || source === "explicit_override") return true;
    const explicitOverride = String((state as any)?.language_override ?? "").trim().toLowerCase() === "true";
    return explicitOverride;
  }

  function applyUiGateState(
    previousState: CanvasState | null | undefined,
    nextState: CanvasState
  ): CanvasState {
    return localeStartApplyUiGateState({
      previousState,
      nextState,
      forceRecoverMs: localeStartResolveUiGateForceRecoverMs(process.env.UI_GATE_FORCE_RECOVER_MS),
      flags: {
        uiLocaleReadyGateV1: deps.isUiLocaleReadyGateV1Enabled(),
        uiBootstrapPollActionV1: deps.isUiBootstrapPollActionV1Enabled(),
      },
      criticalKeys: criticalUiKeysForState(nextState),
      nowMs: Date.now(),
    });
  }

  function bumpUiI18nCounter(
    telemetry: UiI18nTelemetryCounters | null | undefined,
    key: keyof UiI18nTelemetryCounters,
    amount = 1
  ): void {
    if (!telemetry) return;
    telemetry[key] = Number(telemetry[key] || 0) + Math.max(0, Math.trunc(amount));
  }

  function looksLikeHtml(input: string): boolean {
    return /<\s*\/?\s*[a-z][^>]*>/i.test(String(input || ""));
  }

  async function detectLanguageHeuristic(text: string): Promise<{ lang: string; confident: boolean }> {
    const raw = String(text ?? "").trim();
    if (!raw) return { lang: "", confident: false };

    try {
      const id = await getCld3Identifier();
      const res = id.findLanguage(raw) || {};
      const lang = normalizeLangCode(res.language);
      const prob =
        typeof res.probability === "number" ? res.probability :
        typeof res.prob === "number" ? res.prob : 0;
      const reliable =
        typeof res.isReliable === "boolean" ? res.isReliable :
        typeof res.is_reliable === "boolean" ? res.is_reliable : false;
      const confident = Boolean(reliable || (prob && prob >= LANGUAGE_CONFIDENCE_THRESHOLD));
      return { lang, confident };
    } catch {
      return { lang: "", confident: false };
    }
  }

  function uiStringsRequestedStatusFromRaw(
    raw: unknown
  ): "ready" | "pending" | "critical_ready" {
    return localeStartUiStringsRequestedStatusFromRaw(raw);
  }

  function resolveUiStringsFromCatalog(
    requestedLocaleRaw: string,
    criticalKeys: string[],
    telemetry?: UiI18nTelemetryCounters | null
  ): UiCatalogResolution {
    const requestedLocale = normalizeLocaleHint(requestedLocaleRaw);
    const requestedLang = normalizeLangCode(requestedLocale);
    if (!requestedLocale || !requestedLang || requestedLang === "und") {
      bumpUiI18nCounter(telemetry, "translation_fallbacks");
      return {
        strings: { ...UI_STRINGS_SOURCE_EN },
        match_kind: "fallback_en",
        matched_locale: "en",
        ui_strings_lang: "en",
        fallback_applied: "true",
        fallback_reason: "invalid_requested_lang",
        translated_key_count: 0,
        critical_keys_missing: criticalKeys.length,
      };
    }

    const exact = UI_STRINGS_CATALOG_EXACT.get(requestedLocale.toLowerCase()) || null;
    const byLang = UI_STRINGS_CATALOG_BY_LANG.get(requestedLang) || null;
    const chosen = exact || byLang;

    if (!chosen || !chosen.strings || typeof chosen.strings !== "object") {
      bumpUiI18nCounter(telemetry, "translation_fallbacks");
      return {
        strings: { ...UI_STRINGS_SOURCE_EN },
        match_kind: "fallback_en",
        matched_locale: "en",
        ui_strings_lang: "en",
        fallback_applied: "true",
        fallback_reason: "requested_lang_unavailable",
        translated_key_count: 0,
        critical_keys_missing: criticalKeys.length,
      };
    }

    let translatedKeyCount = 0;
    let criticalKeysMissing = 0;
    const merged: Record<string, string> = {};
    for (const key of UI_STRINGS_KEYS) {
      const fallback = String(UI_STRINGS_SOURCE_EN[key] || "");
      const raw = chosen.strings[key];
      const candidate = typeof raw === "string" ? String(raw) : "";
      if (candidate.trim() && !looksLikeHtml(candidate)) {
        merged[key] = candidate;
        if (candidate !== fallback) translatedKeyCount += 1;
        continue;
      }
      merged[key] = fallback;
      if (criticalKeys.includes(key)) {
        criticalKeysMissing += 1;
      }
    }

    if (criticalKeysMissing > 0) {
      bumpUiI18nCounter(telemetry, "translation_missing_keys", criticalKeysMissing);
    }

    return {
      strings: merged,
      match_kind: exact ? "exact" : "base",
      matched_locale: chosen.locale,
      ui_strings_lang: requestedLocale,
      fallback_applied: "false",
      fallback_reason: "",
      translated_key_count: translatedKeyCount,
      critical_keys_missing: criticalKeysMissing,
    };
  }

  async function ensureUiStringsForState(
    state: CanvasState,
    model: string,
    telemetry?: UiI18nTelemetryCounters | null,
    options?: {
      allowBackgroundFull?: boolean;
    }
  ): Promise<CanvasState> {
    void model;
    void options;
    if (deps.isForceEnglishLanguageMode()) {
      const forced = {
        ...(state as any),
        language: "en",
        locale: "en",
        language_locked: "true",
        language_override: "false",
        language_source: "persisted",
        ui_strings: UI_STRINGS_SOURCE_EN,
        ui_strings_lang: "en",
        ui_strings_version: UI_STRINGS_SCHEMA_VERSION,
        ui_strings_status: "ready",
        ui_strings_requested_lang: "en",
        ui_bootstrap_status: "ready",
        ui_translation_mode: "full",
        ui_strings_critical_ready: "true",
        ui_strings_full_ready: "true",
        ui_strings_background_inflight: "false",
        ui_strings_fallback_applied: "false",
        ui_strings_fallback_reason: "",
      } as CanvasState;
      const gated = applyUiGateState(state, forced);
      logStructuredEvent("info", "ui_gate_decision", createStructuredLogContextFromState(gated as Record<string, unknown>), {
        source: "force_en",
        locale: String((gated as any).locale || ""),
        language: String((gated as any).language || ""),
        ui_strings_requested_lang: String((gated as any).ui_strings_requested_lang || ""),
        ui_strings_lang: String((gated as any).ui_strings_lang || ""),
        ui_strings_status: String((gated as any).ui_strings_status || ""),
        ui_gate_status: String((gated as any).ui_gate_status || ""),
        ui_gate_reason: String((gated as any).ui_gate_reason || ""),
        bootstrap_phase: String((gated as any).bootstrap_phase || ""),
      });
      return gated;
    }
    const locale =
      normalizeLocaleHint(
        String((state as any).locale ?? (state as any).ui_strings_requested_lang ?? (state as any).language ?? "")
      ) || "en";
    const lang = normalizeLangCode(locale) || "en";
    const criticalKeys = criticalUiKeysForState(state);
    if (lang === "en") {
      const englishReady = {
        ...(state as any),
        locale,
        language: "en",
        ui_strings: UI_STRINGS_SOURCE_EN,
        ui_strings_lang: locale,
        ui_strings_version: UI_STRINGS_SCHEMA_VERSION,
        ui_strings_status: "ready",
        ui_strings_requested_lang: locale,
        ui_bootstrap_status: "ready",
        ui_translation_mode: "full",
        ui_strings_critical_ready: "true",
        ui_strings_full_ready: "true",
        ui_strings_background_inflight: "false",
        ui_strings_fallback_applied: "false",
        ui_strings_fallback_reason: "",
      } as CanvasState;
      const gated = applyUiGateState(state, englishReady);
      logStructuredEvent("info", "ui_gate_decision", createStructuredLogContextFromState(gated as Record<string, unknown>), {
        source: "english_default",
        locale: String((gated as any).locale || ""),
        language: String((gated as any).language || ""),
        ui_strings_requested_lang: String((gated as any).ui_strings_requested_lang || ""),
        ui_strings_lang: String((gated as any).ui_strings_lang || ""),
        ui_strings_status: String((gated as any).ui_strings_status || ""),
        ui_gate_status: String((gated as any).ui_gate_status || ""),
        ui_gate_reason: String((gated as any).ui_gate_reason || ""),
        bootstrap_phase: String((gated as any).bootstrap_phase || ""),
      });
      return gated;
    }

    const catalogResolution = resolveUiStringsFromCatalog(locale, criticalKeys, telemetry);
    logStructuredEvent(
      "info",
      "ui_strings_catalog_resolve",
      createStructuredLogContextFromState(state as Record<string, unknown>),
      {
        requested_locale: locale,
        requested_lang: lang,
        match_kind: catalogResolution.match_kind,
        matched_locale: catalogResolution.matched_locale,
        translated_key_count: catalogResolution.translated_key_count,
        total_key_count: UI_STRINGS_KEYS.length,
        critical_keys_missing: catalogResolution.critical_keys_missing,
        fallback_applied: catalogResolution.fallback_applied,
        fallback_reason: catalogResolution.fallback_reason,
      }
    );

    const localizedReady = {
      ...(state as any),
      locale,
      language: lang,
      ui_strings: catalogResolution.strings,
      ui_strings_lang: catalogResolution.ui_strings_lang,
      ui_strings_version: UI_STRINGS_SCHEMA_VERSION,
      ui_strings_status: "ready",
      ui_strings_requested_lang: locale,
      ui_bootstrap_status: "ready",
      ui_translation_mode: "full",
      ui_strings_critical_ready: "true",
      ui_strings_full_ready: "true",
      ui_strings_background_inflight: "false",
      ui_strings_fallback_applied: catalogResolution.fallback_applied,
      ui_strings_fallback_reason: catalogResolution.fallback_reason,
    } as CanvasState;
    const gated = applyUiGateState(state, localizedReady);
    logStructuredEvent("info", "ui_gate_decision", createStructuredLogContextFromState(gated as Record<string, unknown>), {
      source: "static_catalog",
      locale: String((gated as any).locale || ""),
      language: String((gated as any).language || ""),
      ui_strings_requested_lang: String((gated as any).ui_strings_requested_lang || ""),
      ui_strings_lang: String((gated as any).ui_strings_lang || ""),
      ui_strings_status: String((gated as any).ui_strings_status || ""),
      ui_gate_status: String((gated as any).ui_gate_status || ""),
      ui_gate_reason: String((gated as any).ui_gate_reason || ""),
      bootstrap_phase: String((gated as any).bootstrap_phase || ""),
      fallback_applied: String((gated as any).ui_strings_fallback_applied || "false"),
      fallback_reason: String((gated as any).ui_strings_fallback_reason || ""),
    });
    return gated;
  }

  function withLanguageDecision(
    state: CanvasState,
    language: string,
    source: LanguageSource,
    options: { locked: BoolString; override: BoolString; locale?: string }
  ): CanvasState {
    const normalizedLocale = normalizeLocaleHint(String(options.locale || "")) || normalizeLocaleHint(language) || "";
    const normalizedLanguage = normalizeLangCode(language) || normalizeLangCode(normalizedLocale) || "";
    return {
      ...(state as any),
      language: normalizedLanguage,
      locale: normalizedLocale || normalizedLanguage,
      language_locked: options.locked,
      language_override: options.override,
      language_source: source,
    } as CanvasState;
  }

  async function resolveLanguageForTurn(
    state: CanvasState,
    userMessage: string,
    localeHintRaw: string,
    localeHintSourceRaw: string,
    inputMode: "widget" | "chat",
    model: string,
    telemetry?: UiI18nTelemetryCounters | null,
    options?: {
      allowBackgroundFull?: boolean;
    }
  ): Promise<CanvasState> {
    const allowBackgroundFull = options?.allowBackgroundFull === true;
    const resolved = await localeStartResolveLanguageForTurn({
      state,
      userMessage,
      localeHintRaw,
      localeHintSourceRaw,
      inputMode,
      model,
      languageMinAlpha: LANGUAGE_MIN_ALPHA,
      deps: {
        isForceEnglishLanguageMode: deps.isForceEnglishLanguageMode,
        isUiLocaleMetaV1Enabled: deps.isUiLocaleMetaV1Enabled,
        isUiLangSourceResolverV1Enabled: deps.isUiLangSourceResolverV1Enabled,
        normalizeLanguageSource,
        ensureUiStringsForState: (stateForUi, modelForUi, telemetryForUi) =>
          ensureUiStringsForState(stateForUi, modelForUi, telemetryForUi as UiI18nTelemetryCounters | null | undefined, {
            allowBackgroundFull,
          }),
        detectLanguageHeuristic,
        bumpUiI18nCounter: (telemetryRaw, key, amount) =>
          bumpUiI18nCounter(telemetryRaw as UiI18nTelemetryCounters | null | undefined, key as keyof UiI18nTelemetryCounters, amount),
        withLanguageDecision,
      },
      telemetry,
    });
    logStructuredEvent("info", "ui_locale_resolve", createStructuredLogContextFromState(resolved as Record<string, unknown>), {
      input_mode: inputMode,
      locale_hint: String(localeHintRaw || ""),
      locale_hint_source: String(localeHintSourceRaw || ""),
      resolved_locale: String((resolved as any).locale || ""),
      resolved_language: String((resolved as any).language || ""),
      language_source: String((resolved as any).language_source || ""),
      ui_strings_requested_lang: String((resolved as any).ui_strings_requested_lang || ""),
      ui_strings_lang: String((resolved as any).ui_strings_lang || ""),
      ui_strings_status: String((resolved as any).ui_strings_status || ""),
    });
    return resolved;
  }

  function parseExplicitLanguageOverride(message: string): string {
    return localeStartParseExplicitLanguageOverride(message);
  }

  function langFromState(state: CanvasState): string {
    if (deps.isForceEnglishLanguageMode()) return "en";
    const locale = normalizeLocaleHint(String((state as any).locale ?? ""));
    const lang = normalizeLangCode(String((state as any).language ?? "")) || normalizeLangCode(locale);
    return lang || "en";
  }

  return {
    normalizeLangCode,
    normalizeLocaleHint,
    hasRenderableUiStringsForState,
    enforceUiStringsReadinessInvariant,
    isNonEnglishPendingUiStringsState,
    isInteractiveLocaleReady,
    deriveBootstrapContract,
    shouldSuppressFallbackText,
    normalizeLanguageSource,
    applyUiGateState,
    bumpUiI18nCounter,
    uiStringsRequestedStatusFromRaw,
    ensureUiStringsForState,
    resolveLanguageForTurn,
    parseExplicitLanguageOverride,
    langFromState,
  };
}
