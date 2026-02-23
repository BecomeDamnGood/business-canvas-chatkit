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
export type BootstrapRenderMode = "wait_shell" | "interactive" | "recovery";

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
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  response_kind: "open_canvas" | "run_step" | "";
  host_widget_session_id: string;
};

export type HydrationStatus = {
  needs_hydration: boolean;
  retry_count: number;
  retry_exhausted: boolean;
  waiting_reason: WaitingReason;
};

export type BootstrapRenderState = {
  phase: BootstrapPhase;
  render_mode: BootstrapRenderMode;
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
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  host_widget_session_id: string;
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

function phaseFromViewMode(raw: unknown): BootstrapPhase | "" {
  const mode = toLower(raw);
  if (mode === "waiting_locale") return "waiting_locale";
  if (mode === "recovery") return "recovery";
  if (mode === "interactive" || mode === "prestart") return "ready";
  return "";
}

function renderModeFromPhase(phase: BootstrapPhase): BootstrapRenderMode {
  if (phase === "recovery") return "recovery";
  if (
    phase === "waiting_state" ||
    phase === "waiting_locale" ||
    phase === "waiting_both" ||
    phase === "interactive_fallback"
  ) {
    return "wait_shell";
  }
  return "interactive";
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

function parsePositiveInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return 0;
}

function sessionInfoForResult(result: Record<string, unknown>): {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  host_widget_session_id: string;
} {
  const state = toRecord(result.state);
  return {
    bootstrap_session_id: String(state.bootstrap_session_id || result.bootstrap_session_id || "").trim(),
    bootstrap_epoch: parsePositiveInt(state.bootstrap_epoch || result.bootstrap_epoch),
    response_seq: parsePositiveInt(state.response_seq || result.response_seq),
    host_widget_session_id: String(
      state.host_widget_session_id ||
      result.host_widget_session_id ||
      (toRecord(result.ui).flags && toRecord(toRecord(result.ui).flags).host_widget_session_id) ||
      ""
    ).trim(),
  };
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
    const sessionInfo = sessionInfoForResult(rec);
    candidates.push({
      source,
      value: rec,
      richness: computePayloadRichness(rec),
      freshness: freshnessForResult(rec),
      order: order + orderOffset,
      bootstrap_session_id: sessionInfo.bootstrap_session_id,
      bootstrap_epoch: sessionInfo.bootstrap_epoch,
      response_seq: sessionInfo.response_seq,
      host_widget_session_id: sessionInfo.host_widget_session_id,
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
  let scoped = candidates;
  const hostScopedCandidates = candidates.filter((candidate) => candidate.host_widget_session_id);
  if (hostScopedCandidates.length > 0) {
    let hostAnchor = hostScopedCandidates[0];
    for (let i = 1; i < hostScopedCandidates.length; i += 1) {
      const cur = hostScopedCandidates[i];
      if (cur.response_seq !== hostAnchor.response_seq) {
        if (cur.response_seq > hostAnchor.response_seq) hostAnchor = cur;
        continue;
      }
      if (cur.bootstrap_epoch !== hostAnchor.bootstrap_epoch) {
        if (cur.bootstrap_epoch > hostAnchor.bootstrap_epoch) hostAnchor = cur;
        continue;
      }
      if (cur.order < hostAnchor.order) hostAnchor = cur;
    }
    const hostScoped = candidates.filter((candidate) => {
      if (candidate.host_widget_session_id !== hostAnchor.host_widget_session_id) return false;
      if (hostAnchor.bootstrap_epoch > 0 && candidate.bootstrap_epoch !== hostAnchor.bootstrap_epoch) return false;
      if (hostAnchor.response_seq > 0 && candidate.response_seq !== hostAnchor.response_seq) return false;
      return true;
    });
    if (hostScoped.length > 0) {
      if (hostScoped.length < candidates.length) {
        console.warn("[host_session_mismatch_dropped]", {
          kept_host_widget_session_id: hostAnchor.host_widget_session_id,
          dropped_candidate_count: candidates.length - hostScoped.length,
        });
      }
      scoped = hostScoped;
    }
  }
  const candidatesWithSession = scoped.filter(
    (candidate) => candidate.bootstrap_session_id && candidate.bootstrap_epoch > 0
  );
  if (candidatesWithSession.length > 0) {
    let anchor = candidatesWithSession[0];
    const anchorPool = candidatesWithSession;
    for (let i = 1; i < anchorPool.length; i += 1) {
      const cur = anchorPool[i];
      if (cur.bootstrap_epoch !== anchor.bootstrap_epoch) {
        if (cur.bootstrap_epoch > anchor.bootstrap_epoch) anchor = cur;
        continue;
      }
      if (cur.response_seq !== anchor.response_seq) {
        if (cur.response_seq > anchor.response_seq) anchor = cur;
        continue;
      }
      if (cur.order < anchor.order) anchor = cur;
    }
    scoped = scoped.filter((candidate) => {
      if (candidate.bootstrap_session_id !== anchor.bootstrap_session_id) return false;
      if (candidate.bootstrap_epoch !== anchor.bootstrap_epoch) return false;
      if (anchor.host_widget_session_id && candidate.host_widget_session_id !== anchor.host_widget_session_id) {
        return false;
      }
      if (anchor.response_seq > 0 && candidate.response_seq !== anchor.response_seq) return false;
      return true;
    });
    if (!scoped.length) scoped = [anchor];
  }

  let best = scoped[0];
  for (let i = 1; i < scoped.length; i += 1) {
    const cur = scoped[i];
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
    bootstrap_session_id: best?.bootstrap_session_id || "",
    bootstrap_epoch: best?.bootstrap_epoch || 0,
    response_seq: best?.response_seq || 0,
    response_kind: (() => {
      const state = toRecord(result.state);
      const kind = String(state.response_kind || result.response_kind || "").trim();
      if (kind === "open_canvas" || kind === "run_step") return kind;
      return "";
    })(),
    host_widget_session_id: best?.host_widget_session_id || "",
  };
  const hydration = computeHydrationState(temp, options?.retryState);
  temp.needs_hydration = hydration.needs_hydration;
  temp.waiting_reason = hydration.waiting_reason;
  return temp;
}

export type BootstrapOrdering = {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  response_kind: "open_canvas" | "run_step" | "";
  host_widget_session_id: string;
};

export function extractBootstrapOrdering(raw: unknown, options?: { fallbackRaw?: unknown }): BootstrapOrdering {
  const resolved = resolveWidgetPayload(raw, options);
  return {
    bootstrap_session_id: resolved.bootstrap_session_id,
    bootstrap_epoch: resolved.bootstrap_epoch,
    response_seq: resolved.response_seq,
    response_kind: resolved.response_kind,
    host_widget_session_id: resolved.host_widget_session_id,
  };
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
  uiStringsStatus: ResolvedWidgetPayload["ui_strings_status"];
  uiFlags: Record<string, unknown>;
  uiView: Record<string, unknown>;
  localeKnownNonEn: boolean;
  hasState?: boolean;
  hasCurrentStep?: boolean;
}): BootstrapRenderState {
  const { hydration, uiStringsStatus, uiFlags, uiView, localeKnownNonEn } = params;
  const waitingForMissingStateByHydration =
    hydration.waiting_reason === "missing_state" || hydration.waiting_reason === "both";
  const waitingForI18nByHydration =
    hydration.waiting_reason === "i18n_pending" || hydration.waiting_reason === "both";
  const serverExplicitWaiting = toLower(uiView.mode) === "waiting_locale" || uiView.waiting_locale === true;
  const forceLocaleWait = localeKnownNonEn && uiStringsStatus !== "ready";
  const phaseFromMode = phaseFromViewMode(uiView.mode);
  const phaseFromPayloadRaw = normalizeBootstrapPhase(uiView.bootstrap_phase || uiFlags.bootstrap_phase);
  const phaseFromPayload =
    phaseFromPayloadRaw === "interactive_fallback" ? "waiting_locale" : phaseFromPayloadRaw;

  let finalPhase: BootstrapPhase;
  if (hydration.retry_exhausted) {
    finalPhase = "recovery";
  } else if (phaseFromMode) {
    finalPhase = phaseFromMode;
  } else if (phaseFromPayload) {
    finalPhase = phaseFromPayload;
  } else if (waitingForMissingStateByHydration && waitingForI18nByHydration) {
    finalPhase = "waiting_both";
  } else if (waitingForMissingStateByHydration) {
    finalPhase = "waiting_state";
  } else if (waitingForI18nByHydration || forceLocaleWait) {
    finalPhase = "waiting_locale";
  } else {
    finalPhase = "ready";
  }

  const hydrationPhase: BootstrapPhase = waitingForMissingStateByHydration
    ? (waitingForI18nByHydration ? "waiting_both" : "waiting_state")
    : (waitingForI18nByHydration ? "waiting_locale" : "ready");
  if (hydrationPhase !== finalPhase && !phaseFromPayload && !phaseFromMode) {
    bootstrapPhaseMismatchCount += 1;
    console.log("[bootstrap_phase_mismatch_ui]", {
      bootstrap_phase_mismatch_count: bootstrapPhaseMismatchCount,
      hydration_phase: hydrationPhase,
      resolved_phase: finalPhase,
    });
  }
  const waitingForMissingState = finalPhase === "recovery"
    ? waitingForMissingStateByHydration
    : (finalPhase === "waiting_state" || finalPhase === "waiting_both");
  const waitingForI18n = finalPhase === "recovery"
    ? (!waitingForMissingStateByHydration && waitingForI18nByHydration)
    : (finalPhase === "waiting_locale" || finalPhase === "waiting_both");
  const bootstrapWaitingLocale =
    finalPhase === "recovery"
      ? false
      : (waitingForI18n || serverExplicitWaiting || forceLocaleWait);
  const effectivePhase: BootstrapPhase =
    bootstrapWaitingLocale && finalPhase === "ready" ? "waiting_locale" : finalPhase;
  const interactiveFallbackActive = false;
  return {
    phase: effectivePhase,
    render_mode: renderModeFromPhase(effectivePhase),
    waitingForMissingState,
    waitingForI18n,
    serverExplicitWaiting,
    forceLocaleWait,
    bootstrapWaitingLocale,
    interactiveFallbackActive,
  };
}
