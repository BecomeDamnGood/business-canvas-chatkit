export type PayloadSource = "meta.widget_result" | "none";

export type WaitingReason = "missing_state" | "i18n_pending" | "none";
export type BootstrapPhase = "waiting_locale" | "ready" | "recovery" | "failed";
export type BootstrapRenderMode = "wait_shell" | "interactive" | "recovery";

export type ResolvedWidgetPayload = {
  result: Record<string, unknown>;
  source: PayloadSource;
  has_state: boolean;
  resolved_language: string;
  resolved_language_source:
    | "state.language"
    | "state.ui_strings_requested_lang"
    | "state.ui_strings_lang"
    | "none";
  ui_strings_status: "ready" | "pending" | "critical_ready" | "unknown";
  shape_version: string;
  needs_hydration: boolean;
  waiting_reason: WaitingReason;
  bootstrap_phase: BootstrapPhase | "";
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  response_kind: "run_step" | "";
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

function normalizeBootstrapPhase(raw: unknown): BootstrapPhase | "" {
  const phase = toLower(raw);
  if (
    phase === "waiting_locale" ||
    phase === "ready" ||
    phase === "recovery" ||
    phase === "failed"
  ) {
    return phase;
  }
  return "";
}

function normalizeUiStringsStatus(
  raw: unknown
): "ready" | "pending" | "critical_ready" | "unknown" {
  const status = toLower(raw);
  if (status === "ready" || status === "pending" || status === "critical_ready") {
    return status;
  }
  if (status === "full_ready") return "critical_ready";
  if (status === "error") return "pending";
  return "unknown";
}

function phaseFromViewMode(raw: unknown): BootstrapPhase | "" {
  const mode = toLower(raw);
  if (mode === "waiting_locale") return "waiting_locale";
  if (mode === "recovery") return "recovery";
  if (mode === "blocked" || mode === "failed") return "failed";
  if (mode === "interactive" || mode === "prestart") return "ready";
  return "";
}

function renderModeFromPhase(phase: BootstrapPhase): BootstrapRenderMode {
  if (phase === "recovery" || phase === "failed") return "recovery";
  if (phase === "waiting_locale") return "wait_shell";
  return "interactive";
}

export function isWidgetResultLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return false;
  if (typeof (rec as { html?: unknown }).html === "string" && keys.length <= 2) return false;
  const state = rec.state;
  if (
    state !== undefined &&
    (typeof state !== "object" || state === null || Array.isArray(state))
  ) {
    return false;
  }
  for (const key of keys) {
    if (WIDGET_RESULT_KEYS.has(key)) return true;
  }
  return false;
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

export function mergeToolOutputWithResponseMetadata(
  toolOutputRaw: unknown,
  toolResponseMetadataRaw: unknown
): Record<string, unknown> {
  const toolOutput = toRecord(toolOutputRaw);
  const metadata = toRecord(toolResponseMetadataRaw);
  const merged: Record<string, unknown> = Object.keys(toolOutput).length ? { ...toolOutput } : {};
  if (!Object.keys(metadata).length) return merged;

  const mergedMeta = toRecord(merged._meta);
  // OpenAI host metadata may be either the _meta object itself or wrapped in {_meta: ...}.
  const wrappedMetadataMeta = toRecord(metadata._meta);
  const metadataMeta = Object.keys(wrappedMetadataMeta).length ? wrappedMetadataMeta : metadata;
  merged._meta = { ...mergedMeta, ...metadataMeta };
  return merged;
}

function pickWidgetResultFromMeta(raw: unknown): {
  result: Record<string, unknown>;
  source: PayloadSource;
} {
  const root = toRecord(raw);
  const meta = toRecord(root._meta);
  const candidate = meta.widget_result;
  if (isWidgetResultLike(candidate)) {
    return {
      result: candidate as Record<string, unknown>,
      source: "meta.widget_result",
    };
  }
  return {
    result: {},
    source: "none",
  };
}

function resolveLanguageForPayload(result: Record<string, unknown>): {
  language: string;
  source: ResolvedWidgetPayload["resolved_language_source"];
} {
  const state = toRecord(result.state);
  const fromStateLanguage = toLower(state.language);
  if (fromStateLanguage) return { language: fromStateLanguage, source: "state.language" };
  const fromStateRequestedLang = toLower(state.ui_strings_requested_lang);
  if (fromStateRequestedLang) {
    return { language: fromStateRequestedLang, source: "state.ui_strings_requested_lang" };
  }
  const fromStateUiLang = toLower(state.ui_strings_lang);
  if (fromStateUiLang) return { language: fromStateUiLang, source: "state.ui_strings_lang" };
  return { language: "", source: "none" };
}

function normalizeUiStringsStatusFromResult(
  result: Record<string, unknown>
): ResolvedWidgetPayload["ui_strings_status"] {
  const state = toRecord(result.state);
  return normalizeUiStringsStatus(state.ui_strings_status);
}

export function computeHydrationState(resolved: ResolvedWidgetPayload): HydrationStatus {
  const state = toRecord(resolved.result.state);
  const hasState = Object.keys(state).length > 0;
  const currentStep = hasState ? String(state.current_step || "").trim() : "";
  const needsHydration = !hasState || !currentStep;
  const uiGateStatus = toLower(state.ui_gate_status);
  const terminalGate = uiGateStatus === "blocked" || uiGateStatus === "failed";
  const i18nPending = !terminalGate && uiGateStatus === "waiting_locale";
  let waitingReason: WaitingReason = "none";
  if (!terminalGate && needsHydration) waitingReason = "missing_state";
  if (!terminalGate && i18nPending) waitingReason = "i18n_pending";
  return {
    needs_hydration: needsHydration,
    retry_count: 0,
    retry_exhausted: false,
    waiting_reason: waitingReason,
  };
}

export function resolveWidgetPayload(raw: unknown): ResolvedWidgetPayload {
  const primary = pickWidgetResultFromMeta(raw);
  const result = primary.result;
  const payloadSource: PayloadSource = Object.keys(primary.result).length ? primary.source : "none";
  const sessionInfo = sessionInfoForResult(result);
  const state = toRecord(result.state);
  const hasState = Object.keys(state).length > 0;
  const { language, source: languageSource } = resolveLanguageForPayload(result);
  const shapeVersion = String(result.model_result_shape_version || "").trim();
  const bootstrapPhase = normalizeBootstrapPhase(state.bootstrap_phase || result.bootstrap_phase);
  const temp: ResolvedWidgetPayload = {
    result,
    source: payloadSource,
    has_state: hasState,
    resolved_language: language,
    resolved_language_source: languageSource,
    ui_strings_status: normalizeUiStringsStatusFromResult(result),
    shape_version: shapeVersion,
    needs_hydration: false,
    waiting_reason: "none",
    bootstrap_phase: bootstrapPhase,
    bootstrap_session_id: sessionInfo.bootstrap_session_id,
    bootstrap_epoch: sessionInfo.bootstrap_epoch,
    response_seq: sessionInfo.response_seq,
    response_kind: (() => {
      const kind = String(state.response_kind || result.response_kind || "").trim();
      if (kind === "run_step") return kind;
      return "";
    })(),
    host_widget_session_id: sessionInfo.host_widget_session_id,
  };
  const hydration = computeHydrationState(temp);
  temp.needs_hydration = hydration.needs_hydration;
  temp.waiting_reason = hydration.waiting_reason;
  return temp;
}

export type BootstrapOrdering = {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  response_kind: "run_step" | "";
  host_widget_session_id: string;
};

export function extractBootstrapOrdering(raw: unknown): BootstrapOrdering {
  const resolved = resolveWidgetPayload(raw);
  return {
    bootstrap_session_id: resolved.bootstrap_session_id,
    bootstrap_epoch: resolved.bootstrap_epoch,
    response_seq: resolved.response_seq,
    response_kind: resolved.response_kind,
    host_widget_session_id: resolved.host_widget_session_id,
  };
}

export function normalizeToolOutput(raw: unknown): Record<string, unknown> {
  const resolved = resolveWidgetPayload(raw);
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
  void params.hydration;
  void params.uiStringsStatus;
  void params.uiFlags;
  void params.localeKnownNonEn;
  void params.hasState;
  void params.hasCurrentStep;
  const mode = toLower(params.uiView.mode);
  const serverExplicitWaiting = mode === "waiting_locale" || params.uiView.waiting_locale === true;
  const phaseFromMode = phaseFromViewMode(params.uiView.mode);
  const finalPhase: BootstrapPhase = phaseFromMode || "waiting_locale";

  const waitingForI18n = finalPhase === "waiting_locale";
  const bootstrapWaitingLocale = finalPhase !== "failed" && waitingForI18n;

  return {
    phase: finalPhase,
    render_mode: renderModeFromPhase(finalPhase),
    waitingForMissingState: false,
    waitingForI18n,
    serverExplicitWaiting,
    forceLocaleWait: false,
    bootstrapWaitingLocale,
    interactiveFallbackActive: false,
  };
}
