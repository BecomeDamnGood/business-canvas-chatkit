export type PayloadSource = "meta.widget_result" | "none";

export type PayloadReasonCode = "meta_widget_result" | "none";

export type CanonicalWidgetEnvelope = {
  envelope: Record<string, unknown>;
  result: Record<string, unknown>;
  source: PayloadSource;
  reason_code: PayloadReasonCode;
};

export type WaitingReason = "missing_state" | "i18n_pending" | "none";
export type BootstrapPhase = "waiting_locale" | "ready" | "recovery" | "failed";
export type BootstrapRenderMode = "wait_shell" | "interactive" | "recovery";

export type ResolvedWidgetPayload = {
  result: Record<string, unknown>;
  source: PayloadSource;
  source_reason_code: PayloadReasonCode;
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

type CandidateContext = "root" | "toolOutput";

export type BootstrapOrdering = {
  bootstrap_session_id: string;
  bootstrap_epoch: number;
  response_seq: number;
  response_kind: "run_step" | "";
  host_widget_session_id: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toLower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function parsePositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function normalizeUiStringsStatus(raw: unknown): "ready" | "pending" | "critical_ready" | "unknown" {
  const status = toLower(raw);
  if (status === "ready" || status === "pending" || status === "critical_ready") return status;
  if (status === "full_ready") return "critical_ready";
  if (status === "error") return "pending";
  return "unknown";
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

function mergeMeta(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const targetMeta = toRecord(target._meta);
  const sourceWrappedMeta = toRecord(source._meta);
  const sourceMeta = Object.keys(sourceWrappedMeta).length > 0 ? sourceWrappedMeta : source;
  return {
    ...target,
    _meta: {
      ...targetMeta,
      ...sourceMeta,
    },
  };
}

export function mergeToolOutputWithResponseMetadata(
  toolOutputRaw: unknown,
  toolResponseMetadataRaw: unknown
): Record<string, unknown> {
  const toolOutput = toRecord(toolOutputRaw);
  const toolResponseMetadata = toRecord(toolResponseMetadataRaw);
  if (!Object.keys(toolOutput).length && !Object.keys(toolResponseMetadata).length) return {};
  return mergeMeta(toolOutput, toolResponseMetadata);
}

function pickMetaWidgetResult(container: Record<string, unknown>): Record<string, unknown> {
  const meta = toRecord(container._meta);
  const candidate = toRecord(meta.widget_result);
  return candidate;
}

function resolveMetaWidgetResult(raw: unknown): { result: Record<string, unknown>; source: PayloadSource } {
  const root = toRecord(raw);
  const toolOutput = mergeToolOutputWithResponseMetadata(root.toolOutput, root.toolResponseMetadata);

  // Zoekpad 1: toolOutput.result._widget_result
  // De OpenAI host zet structuredContent in window.openai.toolOutput.
  // De server embedt _widget_result in structuredContent.result.
  // Dus: window.openai.toolOutput.result._widget_result
  const toolOutputResult = toRecord(toolOutput.result);
  const fromToolOutputResult = toRecord(toolOutputResult._widget_result);
  if (Object.keys(fromToolOutputResult).length > 0) {
    return { result: fromToolOutputResult, source: "meta.widget_result" };
  }

  // Zoekpad 2: root.result._widget_result (als raw direct structuredContent is)
  const rootResult = toRecord(root.result);
  const fromRootResult = toRecord(rootResult._widget_result);
  if (Object.keys(fromRootResult).length > 0) {
    return { result: fromRootResult, source: "meta.widget_result" };
  }

  // Zoekpad 3: originele _meta.widget_result paden (bridge / lokale dev / toekomstige hosts)
  const candidates: Array<{ context: CandidateContext; payload: Record<string, unknown> }> = [
    { context: "root", payload: root },
  ];
  if (Object.keys(toolOutput).length > 0) candidates.push({ context: "toolOutput", payload: toolOutput });
  for (const candidate of candidates) {
    const widgetResult = pickMetaWidgetResult(candidate.payload);
    if (Object.keys(widgetResult).length > 0) return { result: widgetResult, source: "meta.widget_result" };
  }
  return { result: {}, source: "none" };
}

export function canonicalizeWidgetPayload(raw: unknown): CanonicalWidgetEnvelope {
  const selected = resolveMetaWidgetResult(raw);
  if (!Object.keys(selected.result).length) {
    return {
      envelope: {},
      result: {},
      source: "none",
      reason_code: "none",
    };
  }
  return {
    envelope: {
      _meta: {
        widget_result: selected.result,
      },
    },
    result: selected.result,
    source: selected.source,
    reason_code: "meta_widget_result",
  };
}

function resolveLanguageForPayload(result: Record<string, unknown>): {
  language: string;
  source: ResolvedWidgetPayload["resolved_language_source"];
} {
  const state = toRecord(result.state);
  const fromStateLanguage = toLower(state.language);
  if (fromStateLanguage) return { language: fromStateLanguage, source: "state.language" };
  const fromRequested = toLower(state.ui_strings_requested_lang);
  if (fromRequested) return { language: fromRequested, source: "state.ui_strings_requested_lang" };
  const fromUiLang = toLower(state.ui_strings_lang);
  if (fromUiLang) return { language: fromUiLang, source: "state.ui_strings_lang" };
  return { language: "", source: "none" };
}

function sessionInfoForResult(result: Record<string, unknown>): BootstrapOrdering {
  const state = toRecord(result.state);
  const responseKind = String(state.response_kind || result.response_kind || "").trim();
  return {
    bootstrap_session_id: String(state.bootstrap_session_id || "").trim(),
    bootstrap_epoch: parsePositiveInt(state.bootstrap_epoch),
    response_seq: parsePositiveInt(state.response_seq),
    response_kind: responseKind === "run_step" ? "run_step" : "",
    host_widget_session_id: String(state.host_widget_session_id || "").trim(),
  };
}

export function resolveWidgetPayload(raw: unknown): ResolvedWidgetPayload {
  const canonical = canonicalizeWidgetPayload(raw);
  const result = canonical.result;
  const state = toRecord(result.state);
  const language = resolveLanguageForPayload(result);
  const ordering = sessionInfoForResult(result);
  const resolvedBase: ResolvedWidgetPayload = {
    result,
    source: canonical.source,
    source_reason_code: canonical.reason_code,
    has_state: Object.keys(state).length > 0,
    resolved_language: language.language,
    resolved_language_source: language.source,
    ui_strings_status: normalizeUiStringsStatus(state.ui_strings_status),
    shape_version: String(result.model_result_shape_version || "").trim(),
    needs_hydration: false,
    waiting_reason: "none",
    bootstrap_phase: normalizeBootstrapPhase(state.bootstrap_phase || result.bootstrap_phase),
    bootstrap_session_id: ordering.bootstrap_session_id,
    bootstrap_epoch: ordering.bootstrap_epoch,
    response_seq: ordering.response_seq,
    response_kind: ordering.response_kind,
    host_widget_session_id: ordering.host_widget_session_id,
  };
  return resolvedBase;
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
  if (!Object.keys(resolved.result).length) return {};
  return { result: resolved.result };
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
  const mode = toLower(params.uiView.mode);
  const serverExplicitWaiting = mode === "waiting_locale" || params.uiView.waiting_locale === true;
  const phaseFromMode = phaseFromViewMode(params.uiView.mode);

  const uiStringsPending = params.uiStringsStatus === "pending";
  const localePendingByHydration =
    params.hydration.waiting_reason === "i18n_pending" ||
    params.hydration.waiting_reason === "missing_state";
  const waitingFlag = params.uiFlags.bootstrap_waiting_locale === true;
  const shouldDefaultWaiting =
    !phaseFromMode &&
    (serverExplicitWaiting ||
      waitingFlag ||
      localePendingByHydration ||
      (params.localeKnownNonEn && uiStringsPending));

  const finalPhase: BootstrapPhase = phaseFromMode || (shouldDefaultWaiting ? "waiting_locale" : "ready");
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
