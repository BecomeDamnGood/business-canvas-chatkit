export type PayloadSource =
  | "meta.widget_result"
  | "toolResponseMetadata.widget_result"
  | "toolResponseMetadata._meta.widget_result"
  | "structured.result"
  | "structured.ui.result"
  | "structured.ui"
  | "raw.result"
  | "raw.ui.result"
  | "raw.ui"
  | "raw"
  | "none";

export type WaitingReason = "missing_state" | "i18n_pending" | "both" | "none";
export type BootstrapPhase =
  | "init"
  | "waiting_state"
  | "waiting_locale"
  | "waiting_both"
  | "interactive_fallback"
  | "ready"
  | "recovery";
export type BootstrapDecision = {
  phase: BootstrapPhase;
  retry_hint: "poll" | "none";
  interactive_allowed: boolean;
  render_mode: "wait_shell" | "interactive" | "recovery";
};

export type ResolvedWidgetPayload = {
  result: Record<string, unknown>;
  source: PayloadSource;
  has_state: boolean;
  resolved_language: string;
  resolved_language_source: "state.language" | "state.ui_strings_lang" | "result.ui_strings_lang" | "result.language" | "locale_hint" | "none";
  ui_strings_status: "ready" | "pending" | "error" | "unknown";
  shape_version: string;
  needs_hydration: boolean;
  waiting_reason: WaitingReason;
  bootstrap_phase: BootstrapPhase | "";
};

export type HydrationStatus = {
  needs_hydration: boolean;
  retry_count: number;
  retry_exhausted: boolean;
  waiting_reason: WaitingReason;
};

export type BootstrapRenderState = {
  phase: BootstrapPhase;
  render_mode: BootstrapDecision["render_mode"];
  waitingForMissingState: boolean;
  waitingForI18n: boolean;
  serverExplicitWaiting: boolean;
  forceLocaleWait: boolean;
  bootstrapWaitingLocale: boolean;
  interactiveFallbackActive: boolean;
};

type PayloadCandidate = {
  source: PayloadSource;
  value: Record<string, unknown>;
  richness: number;
  freshness: number | null;
  order: number;
};

const WIDGET_RESULT_KEYS = new Set([
  "state",
  "ui",
  "prompt",
  "text",
  "specialist",
  "current_step_id",
  "model_result_shape_version",
  "ui_strings",
  "ui_strings_lang",
  "language",
]);

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

let bootstrapPhaseMismatchCount = 0;

function normalizeBootstrapPhase(raw: unknown): BootstrapPhase | "" {
  const phase = toLower(raw);
  if (
    phase === "init" ||
    phase === "waiting_state" ||
    phase === "waiting_locale" ||
    phase === "waiting_both" ||
    phase === "interactive_fallback" ||
    phase === "ready" ||
    phase === "recovery"
  ) {
    return phase;
  }
  return "";
}

function normalizeUiStringsStatus(raw: unknown): "ready" | "pending" | "error" | "unknown" {
  const status = toLower(raw);
  if (status === "ready" || status === "pending" || status === "error") return status;
  return "unknown";
}

function normalizeUiGateStatus(raw: unknown): "waiting_locale" | "ready" | "unknown" {
  const status = toLower(raw);
  if (status === "waiting_locale" || status === "ready") return status;
  return "unknown";
}

export function computeBootstrapDecision(params: {
  has_state: boolean;
  has_current_step: boolean;
  ui_strings_status: "ready" | "pending" | "error" | "unknown";
  ui_gate_status: "waiting_locale" | "ready" | "unknown";
  locale_known_non_en: boolean;
  interactive_fallback_enabled: boolean;
  retry_count: number;
  retry_exhausted: boolean;
  waiting_ttl_expired: boolean;
}): BootstrapDecision {
  const {
    has_state,
    has_current_step,
    ui_strings_status,
    ui_gate_status,
    locale_known_non_en,
    interactive_fallback_enabled,
    retry_exhausted,
    waiting_ttl_expired,
  } = params;
  if (retry_exhausted || waiting_ttl_expired) {
    return {
      phase: "recovery",
      retry_hint: "none",
      interactive_allowed: false,
      render_mode: "recovery",
    };
  }
  const missing_state = !has_state || !has_current_step;
  const locale_pending =
    ui_strings_status === "pending" ||
    ui_strings_status === "error" ||
    (ui_strings_status === "unknown" && (ui_gate_status === "waiting_locale" || locale_known_non_en)) ||
    (locale_known_non_en && ui_strings_status !== "ready");
  let phase: BootstrapPhase = "ready";
  if (missing_state && locale_pending) phase = "waiting_both";
  else if (missing_state) phase = "waiting_state";
  else if (locale_pending) phase = interactive_fallback_enabled ? "interactive_fallback" : "waiting_locale";
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

function decisionFromPhase(phase: BootstrapPhase): BootstrapDecision {
  const waiting =
    phase === "waiting_state" ||
    phase === "waiting_locale" ||
    phase === "waiting_both" ||
    phase === "interactive_fallback";
  return {
    phase,
    retry_hint: waiting ? "poll" : "none",
    interactive_allowed: phase === "ready" || phase === "interactive_fallback",
    render_mode: phase === "recovery" ? "recovery" : waiting ? "wait_shell" : "interactive",
  };
}

export function isWidgetResultLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return false;
  if (typeof (rec as { html?: unknown }).html === "string" && keys.length <= 2) return false;
  const state = rec.state;
  if (state !== undefined && (typeof state !== "object" || state === null || Array.isArray(state))) {
    return false;
  }
  for (const key of keys) {
    if (WIDGET_RESULT_KEYS.has(key)) return true;
  }
  return false;
}

function parseFreshness(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function freshnessForResult(result: Record<string, unknown>): number | null {
  const direct = parseFreshness(result.updated_at_ms ?? result.result_version ?? result.turn_index);
  if (direct !== null) return direct;
  const state = toRecord(result.state);
  return parseFreshness(state.updated_at_ms ?? state.result_version ?? state.turn_index);
}

function computePayloadRichness(result: Record<string, unknown>): number {
  const state = toRecord(result.state);
  const ui = toRecord(result.ui);
  let score = 0;
  if (Object.keys(state).length) score += 40;
  if (String(state.current_step || "").trim()) score += 40;
  if (Object.keys(ui).length) score += 30;
  if (String(result.prompt || "").trim()) score += 20;
  if (String(result.text || "").trim()) score += 20;
  if (toRecord(result.specialist) && Object.keys(toRecord(result.specialist)).length) score += 15;
  if (String(result.current_step_id || "").trim()) score += 10;
  if (String(result.model_result_shape_version || "").trim()) score += 5;
  return score;
}

function candidateValue(root: Record<string, unknown>, path: string): unknown {
  const segs = path.split(".");
  let cur: unknown = root;
  for (const seg of segs) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function mergeToolOutputWithResponseMetadata(
  toolOutputRaw: unknown,
  toolResponseMetadataRaw: unknown
): Record<string, unknown> {
  const toolOutput = toRecord(toolOutputRaw);
  const metadata = toRecord(toolResponseMetadataRaw);
  const merged: Record<string, unknown> = Object.keys(toolOutput).length ? { ...toolOutput } : {};
  if (!Object.keys(metadata).length) return merged;

  const mergedMeta = toRecord(merged._meta);
  const metadataMeta = toRecord(metadata._meta);
  const mergedMetaNext: Record<string, unknown> = { ...mergedMeta, ...metadataMeta };
  if (metadata.widget_result !== undefined) {
    mergedMetaNext.widget_result = metadata.widget_result;
  } else if (metadataMeta.widget_result !== undefined && mergedMetaNext.widget_result === undefined) {
    mergedMetaNext.widget_result = metadataMeta.widget_result;
  }
  merged._meta = mergedMetaNext;
  merged.toolResponseMetadata = metadata;
  return merged;
}

function collectPayloadCandidates(raw: unknown, orderOffset = 0): PayloadCandidate[] {
  const root = toRecord(raw);
  const structured = toRecord(root.structuredContent);
  const meta = toRecord(root._meta);
  const toolResponseMetadata = toRecord(root.toolResponseMetadata);
  const toolResponseMetadataMeta = toRecord(toolResponseMetadata._meta);
  const candidates: PayloadCandidate[] = [];
  const add = (source: PayloadSource, value: unknown, order: number): void => {
    if (!isWidgetResultLike(value)) return;
    const rec = value as Record<string, unknown>;
    candidates.push({
      source,
      value: rec,
      richness: computePayloadRichness(rec),
      freshness: freshnessForResult(rec),
      order: order + orderOffset,
    });
  };
  add("meta.widget_result", meta.widget_result, 0);
  add("toolResponseMetadata.widget_result", toolResponseMetadata.widget_result, 1);
  add("toolResponseMetadata._meta.widget_result", toolResponseMetadataMeta.widget_result, 2);
  add("structured.result", structured.result, 3);
  add("structured.ui.result", candidateValue(structured, "ui.result"), 4);
  add("structured.ui", structured.ui, 5);
  add("raw.result", root.result, 6);
  add("raw.ui.result", candidateValue(root, "ui.result"), 7);
  add("raw.ui", root.ui, 8);
  add("raw", root, 9);
  return candidates;
}

function pickBestCandidate(candidates: PayloadCandidate[]): PayloadCandidate | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const cur = candidates[i];
    if (cur.richness !== best.richness) {
      if (cur.richness > best.richness) best = cur;
      continue;
    }
    const bestHasFreshness = best.freshness !== null;
    const curHasFreshness = cur.freshness !== null;
    if (bestHasFreshness && curHasFreshness && cur.freshness !== best.freshness) {
      if ((cur.freshness as number) > (best.freshness as number)) best = cur;
      continue;
    }
    if (cur.order < best.order) best = cur;
  }
  return best;
}

function resolveLanguageForPayload(result: Record<string, unknown>): {
  language: string;
  source: ResolvedWidgetPayload["resolved_language_source"];
} {
  const state = toRecord(result.state);
  const fromStateLanguage = toLower(state.language);
  if (fromStateLanguage) return { language: fromStateLanguage, source: "state.language" };
  const fromStateUiLang = toLower(state.ui_strings_lang);
  if (fromStateUiLang) return { language: fromStateUiLang, source: "state.ui_strings_lang" };
  const fromResultUiLang = toLower(result.ui_strings_lang);
  if (fromResultUiLang) return { language: fromResultUiLang, source: "result.ui_strings_lang" };
  const fromResultLanguage = toLower(result.language);
  if (fromResultLanguage) return { language: fromResultLanguage, source: "result.language" };
  const fromLocaleHint = toLower(result.locale_hint);
  if (fromLocaleHint) return { language: fromLocaleHint, source: "locale_hint" };
  return { language: "", source: "none" };
}

function normalizeUiStringsStatusFromResult(result: Record<string, unknown>): ResolvedWidgetPayload["ui_strings_status"] {
  const state = toRecord(result.state);
  return normalizeUiStringsStatus(state.ui_strings_status || result.ui_strings_status);
}

export function computeHydrationState(
  resolved: ResolvedWidgetPayload,
  retryState?: { retry_count?: number; retry_exhausted?: boolean }
): HydrationStatus {
  const state = toRecord(resolved.result.state);
  const hasState = Object.keys(state).length > 0;
  const currentStep = hasState ? String(state.current_step || "").trim() : "";
  const needsHydration = !hasState || !currentStep;
  const uiGateStatus = toLower(state.ui_gate_status || resolved.result.ui_gate_status);
  const i18nPending =
    resolved.ui_strings_status === "pending" ||
    resolved.ui_strings_status === "error" ||
    (resolved.ui_strings_status === "unknown" && uiGateStatus === "waiting_locale");
  let waitingReason: WaitingReason = "none";
  if (needsHydration && i18nPending) waitingReason = "both";
  else if (needsHydration) waitingReason = "missing_state";
  else if (i18nPending) waitingReason = "i18n_pending";
  return {
    needs_hydration: needsHydration,
    retry_count: Number(retryState?.retry_count ?? 0),
    retry_exhausted: Boolean(retryState?.retry_exhausted),
    waiting_reason: waitingReason,
  };
}

export function resolveWidgetPayload(
  raw: unknown,
  options?: { fallbackRaw?: unknown; retryState?: { retry_count?: number; retry_exhausted?: boolean } }
): ResolvedWidgetPayload {
  const candidates = collectPayloadCandidates(raw);
  if (options?.fallbackRaw !== undefined) {
    const fallbackCandidates = collectPayloadCandidates(options.fallbackRaw, 100);
    if (fallbackCandidates.length) candidates.push(...fallbackCandidates);
  }
  const best = pickBestCandidate(candidates);
  const result = best ? best.value : {};
  const state = toRecord(result.state);
  const hasState = Object.keys(state).length > 0;
  const { language, source } = resolveLanguageForPayload(result);
  const shapeVersion = String(result.model_result_shape_version || "").trim();
  const bootstrapPhase = normalizeBootstrapPhase(state.bootstrap_phase || result.bootstrap_phase);
  const temp: ResolvedWidgetPayload = {
    result,
    source: best ? best.source : "none",
    has_state: hasState,
    resolved_language: language,
    resolved_language_source: source,
    ui_strings_status: normalizeUiStringsStatusFromResult(result),
    shape_version: shapeVersion,
    needs_hydration: false,
    waiting_reason: "none",
    bootstrap_phase: bootstrapPhase,
  };
  const hydration = computeHydrationState(temp, options?.retryState);
  temp.needs_hydration = hydration.needs_hydration;
  temp.waiting_reason = hydration.waiting_reason;
  return temp;
}

export function normalizeToolOutput(
  raw: unknown,
  options?: { fallbackRaw?: unknown; retryState?: { retry_count?: number; retry_exhausted?: boolean } }
): Record<string, unknown> {
  const root = toRecord(raw);
  const structured = toRecord(root.structuredContent);
  const resolved = resolveWidgetPayload(raw, options);
  if (Object.keys(resolved.result).length) {
    structured.result = resolved.result;
    const uiFromResult = toRecord(resolved.result.ui);
    if (Object.keys(uiFromResult).length && Object.keys(toRecord(structured.ui)).length === 0) {
      structured.ui = uiFromResult;
    }
  }
  if (Object.keys(structured).length) return structured;
  if (Object.keys(resolved.result).length) return { result: resolved.result };
  return {};
}

export function computeBootstrapRenderState(params: {
  hydration: HydrationStatus;
  uiGateStatus: string;
  uiStringsStatus: ResolvedWidgetPayload["ui_strings_status"];
  uiFlags: Record<string, unknown>;
  uiView: Record<string, unknown>;
  localeKnownNonEn: boolean;
  hasState?: boolean;
  hasCurrentStep?: boolean;
}): BootstrapRenderState {
  const { hydration, uiGateStatus, uiStringsStatus, uiFlags, uiView, localeKnownNonEn } = params;
  const legacyWaitingForMissingState =
    hydration.waiting_reason === "missing_state" || hydration.waiting_reason === "both";
  const legacyWaitingForI18n =
    hydration.waiting_reason === "i18n_pending" || hydration.waiting_reason === "both";
  const serverExplicitWaiting =
    String(uiView.mode || "").trim().toLowerCase() === "waiting_locale" ||
    uiView.waiting_locale === true;
  const forceLocaleWait = localeKnownNonEn && uiStringsStatus !== "ready";
  const legacyBootstrapWaitingLocale =
    legacyWaitingForI18n ||
    serverExplicitWaiting ||
    forceLocaleWait ||
    uiFlags.bootstrap_waiting_locale === true ||
    (String(uiGateStatus || "").trim().toLowerCase() === "waiting_locale" && uiStringsStatus !== "ready");
  const legacyInteractiveFallbackActive =
    (!forceLocaleWait && uiFlags.interactive_fallback_active === true) ||
    (!forceLocaleWait && legacyBootstrapWaitingLocale && uiFlags.bootstrap_interactive_ready === true);
  let legacyPhase: BootstrapPhase = "ready";
  if (hydration.retry_exhausted) legacyPhase = "recovery";
  else if (legacyWaitingForMissingState && legacyWaitingForI18n) legacyPhase = "waiting_both";
  else if (legacyWaitingForMissingState) legacyPhase = "waiting_state";
  else if (legacyBootstrapWaitingLocale) legacyPhase = legacyInteractiveFallbackActive ? "interactive_fallback" : "waiting_locale";

  const hasState = params.hasState ?? !legacyWaitingForMissingState;
  const hasCurrentStep = params.hasCurrentStep ?? !legacyWaitingForMissingState;
  const fsmInputDecision = computeBootstrapDecision({
    has_state: hasState,
    has_current_step: hasCurrentStep,
    ui_strings_status: normalizeUiStringsStatus(uiStringsStatus),
    ui_gate_status: normalizeUiGateStatus(uiGateStatus),
    locale_known_non_en: localeKnownNonEn,
    interactive_fallback_enabled:
      uiFlags.interactive_fallback_active === true ||
      uiFlags.bootstrap_interactive_ready === true,
    retry_count: hydration.retry_count,
    retry_exhausted: hydration.retry_exhausted,
    waiting_ttl_expired: false,
  });
  const phaseFromPayload = normalizeBootstrapPhase(uiView.bootstrap_phase || uiFlags.bootstrap_phase);
  const finalDecision = hydration.retry_exhausted
    ? decisionFromPhase("recovery")
    : phaseFromPayload
      ? decisionFromPhase(phaseFromPayload)
      : fsmInputDecision;
  if (legacyPhase !== finalDecision.phase) {
    bootstrapPhaseMismatchCount += 1;
    console.log("[bootstrap_phase_mismatch_ui]", {
      bootstrap_phase_mismatch_count: bootstrapPhaseMismatchCount,
      legacy_phase: legacyPhase,
      fsm_phase: finalDecision.phase,
    });
  }
  const waitingForMissingState = finalDecision.phase === "recovery"
    ? legacyWaitingForMissingState
    : (finalDecision.phase === "waiting_state" || finalDecision.phase === "waiting_both");
  const waitingForI18n = finalDecision.phase === "recovery"
    ? !legacyWaitingForMissingState
    : (
      finalDecision.phase === "waiting_locale" ||
      finalDecision.phase === "waiting_both" ||
      finalDecision.phase === "interactive_fallback"
    );
  const bootstrapWaitingLocale = finalDecision.phase === "recovery"
    ? !legacyWaitingForMissingState
    : (
      finalDecision.phase === "waiting_locale" ||
      finalDecision.phase === "waiting_both" ||
      finalDecision.phase === "interactive_fallback"
    );
  const interactiveFallbackActive = finalDecision.phase === "interactive_fallback";
  return {
    phase: finalDecision.phase,
    render_mode: finalDecision.render_mode,
    waitingForMissingState,
    waitingForI18n,
    serverExplicitWaiting,
    forceLocaleWait,
    bootstrapWaitingLocale,
    interactiveFallbackActive,
  };
}
