import crypto from "node:crypto";

import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { actionCodeToIntent } from "../core/actioncode_intent.js";
import type { CanvasState } from "../core/state.js";

type LocaleHintSource =
  | "openai_locale"
  | "webplus_i18n"
  | "request_header"
  | "message_detect"
  | "none";

type BootstrapContract = {
  waiting: boolean;
  ready: boolean;
  retry_hint: string;
  phase?: string;
};

type RunStepPreflightDeps = {
  step0Id: string;
  currentStateVersion: string;
  actionBootstrapPollToken: string;
  normalizeState: (state: unknown) => CanvasState;
  migrateState: (state: CanvasState) => CanvasState;
  isSupportedStateVersion: (value: unknown) => boolean;
  normalizeStateLanguageSource: (value: unknown) => string;
  detectLegacySessionMarkers: (state: CanvasState) => string[];
  detectInvalidContractStateMarkers: (state: Record<string, unknown>) => string[];
  syncDreamRuntimeMode: (state: CanvasState) => void;
  isPristineStateForStart: (state: CanvasState) => boolean;
  extractUserMessageFromWrappedInput: (raw: string) => string;
  looksLikeMetaInstruction: (userMessage: string) => boolean;
  maybeSeedStep0CandidateFromInitialMessage: (state: CanvasState, message: string) => CanvasState;
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
  logStructuredEvent?: (params: {
    severity: "info" | "warn" | "error";
    event: string;
    state: CanvasState | Record<string, unknown> | null | undefined;
    step_id?: string;
    contract_id?: string;
    details?: Record<string, unknown>;
  }) => void;
};

type InitializePreflightParams = {
  args: { state?: unknown; user_message?: unknown };
  localeHint: string;
  localeHintSource: LocaleHintSource;
  inputMode: string;
  uiI18nTelemetry: unknown;
};

type InitializePreflightResult = {
  state: CanvasState;
  serverState: RunStepServerTransientState;
  rawLegacyMarkers: string[];
  migrationApplied: boolean;
  migrationFromVersion: string;
  unsupportedStateVersion: boolean;
  transientTextSubmit: string;
  transientPendingScores: number[][] | null;
  isBootstrapPollCall: boolean;
  pristineAtEntry: boolean;
  rawNormalized: string;
  userMessageCandidate: string;
  lastSpecialistResult: any;
  actionCodeRaw: string;
  isActionCodeTurnForPolicy: boolean;
  userMessage: string;
  submittedUserText: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
};

type BootstrapPollPreprocessParams<TResponse> = {
  state: CanvasState;
  isBootstrapPollCall: boolean;
  actionCodeRaw: string;
  userMessage: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
  step0Specialist: string;
  isUiLocaleReadyGateV1Enabled: () => boolean;
  resolveLocaleAndUiStringsReady: (
    state: CanvasState,
    routeOrText: string
  ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
  hasUsableSpecialistForRetry: (specialist: any) => boolean;
  buildTransientFallbackSpecialist: (state: CanvasState) => any;
  deriveBootstrapContract: (state: CanvasState) => BootstrapContract;
  buildTextForWidget: (params: { specialist: any; state?: CanvasState | null }) => string;
  pickPrompt: (specialist: any) => string;
  attachRegistryPayload: (payload: any, specialist: any, flagsOverride?: Record<string, boolean | string>) => any;
  finalizeResponse: (payload: any) => TResponse;
};

type BootstrapPollPreprocessResult<TResponse> = {
  state: CanvasState;
  actionCodeRaw: string;
  userMessage: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
  response: TResponse | null;
};

type NormalizeActionCodeParams = {
  state: CanvasState;
  actionCodeRaw: string;
  userMessage: string;
  submittedUserText: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
  transientTextSubmit: string;
  inputMode: string;
  inferCurrentMenuForStep: (state: CanvasState, stepId: string) => string;
  labelForActionInMenu: (menuId: string, actionCode: string) => string;
};

type NormalizeActionCodeResult = {
  state: CanvasState;
  actionCodeRaw: string;
  userMessage: string;
  submittedUserText: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
};

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_TURN_INDEX = 1_000_000;

export type RunStepServerTransientState = {
  sessionId: string;
  sessionStartedAt: string;
  sessionTurnIndex: number;
  uiPhaseByStep: Record<string, string>;
};

function normalizeIncomingSessionId(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  return SESSION_ID_RE.test(value) ? value : "";
}

function normalizeIncomingSessionStartedAt(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

function normalizeIncomingSessionTurnIndex(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const normalized = Math.trunc(n);
  if (normalized > MAX_SESSION_TURN_INDEX) return MAX_SESSION_TURN_INDEX;
  return normalized;
}

export function applyRunStepServerTransients(
  state: CanvasState,
  serverState: RunStepServerTransientState
): CanvasState {
  const runtimeState = state as Record<string, unknown>;
  runtimeState.__session_id = serverState.sessionId;
  runtimeState.__session_started_at = serverState.sessionStartedAt;
  runtimeState.__session_turn_index = serverState.sessionTurnIndex;
  runtimeState.__ui_phase_by_step = { ...serverState.uiPhaseByStep };
  return state;
}

export function createRunStepPreflightHelpers(deps: RunStepPreflightDeps) {
  function initializeRunStepPreflight(params: InitializePreflightParams): InitializePreflightResult {
    const rawState = (params.args.state ?? {}) as Record<string, unknown>;
    const uiTelemetry = (rawState as any).__ui_telemetry;
    if (uiTelemetry && typeof uiTelemetry === "object") {
      deps.logStructuredEvent?.({
        severity: "info",
        event: "ui_telemetry_seen",
        state: rawState,
        step_id: String(rawState.current_step || deps.step0Id),
        details: {
          keys: Object.keys(uiTelemetry as Record<string, unknown>).slice(0, 20),
        },
      });
    }

    const transientTextSubmit = typeof (rawState as any).__text_submit === "string"
      ? String((rawState as any).__text_submit)
      : "";
    const transientPendingScores = Array.isArray((rawState as any).__pending_scores)
      ? ((rawState as any).__pending_scores as number[][])
      : null;
    const isBootstrapPollMarker =
      String((rawState as any).__bootstrap_poll || "").trim().toLowerCase() === "true";
    const isBootstrapPollAction =
      String(params.args.user_message ?? "").trim().toUpperCase() === deps.actionBootstrapPollToken;
    const isBootstrapPollCall = isBootstrapPollMarker || isBootstrapPollAction;

    const rawStateContractMarkers = deps.detectInvalidContractStateMarkers(rawState);
    let state = deps.normalizeState(params.args.state ?? {});
    const incomingStateVersion = String(rawState.state_version ?? "").trim();
    const preMigrateStateVersion = String((state as any).state_version || "").trim();
    let migrationApplied = false;
    let migrationFromVersion = "";
    const unsupportedStateVersion =
      incomingStateVersion !== "" && !deps.isSupportedStateVersion(incomingStateVersion);
    if (preMigrateStateVersion && preMigrateStateVersion !== deps.currentStateVersion) {
      migrationFromVersion = preMigrateStateVersion;
    }
    if (!unsupportedStateVersion) {
      try {
        state = deps.migrateState(state);
        if (migrationFromVersion && String((state as any).state_version || "") === deps.currentStateVersion) {
          migrationApplied = true;
        }
      } catch {
        if (!migrationFromVersion) {
          migrationFromVersion = preMigrateStateVersion || "";
        }
      }
    } else if (!migrationFromVersion) {
      migrationFromVersion = incomingStateVersion;
    }
    const incomingLanguageSource = deps.normalizeStateLanguageSource((rawState as any).language_source);
    if (incomingLanguageSource && !deps.normalizeStateLanguageSource((state as any).language_source)) {
      (state as any).language_source = incomingLanguageSource;
    }
    let rawLegacyMarkers = [
      ...deps.detectLegacySessionMarkers(state),
      ...rawStateContractMarkers,
    ];
    if (migrationApplied) {
      rawLegacyMarkers = rawLegacyMarkers.filter((marker) => marker !== "state_version_mismatch");
    }
    if (migrationFromVersion && !migrationApplied) {
      rawLegacyMarkers.push("state_version_mismatch");
    }

    const incomingPhaseRaw =
      rawState && typeof (rawState as any).__ui_phase_by_step === "object" && (rawState as any).__ui_phase_by_step !== null
        ? ((rawState as any).__ui_phase_by_step as Record<string, unknown>)
        : null;
    const uiPhaseByStep = incomingPhaseRaw
      ? Object.fromEntries(
        Object.entries(incomingPhaseRaw)
          .map(([stepId, contractId]) => [String(stepId || "").trim(), String(contractId || "").trim()])
          .filter(([stepId, contractId]) => stepId && contractId)
      )
      : {};

    const incomingSessionId = normalizeIncomingSessionId((rawState as any).__session_id);
    const incomingSessionStartedAt = normalizeIncomingSessionStartedAt((rawState as any).__session_started_at);
    const incomingSessionTurnIndex = normalizeIncomingSessionTurnIndex((rawState as any).__session_turn_index);
    const serverState: RunStepServerTransientState = {
      sessionId: incomingSessionId || crypto.randomUUID(),
      sessionStartedAt: incomingSessionStartedAt || new Date().toISOString(),
      sessionTurnIndex: incomingSessionTurnIndex ?? 0,
      uiPhaseByStep,
    };
    // __session_log_file is server-owned and never trusted from client state.
    const previousTurnIndex = Number(serverState.sessionTurnIndex || 0);
    const nextTurnIndex = Number.isFinite(previousTurnIndex) ? previousTurnIndex + 1 : 1;
    serverState.sessionTurnIndex = nextTurnIndex;
    const requestScopedTurnId = String((rawState as any).__request_id || "").trim();
    (state as any).__session_turn_id = requestScopedTurnId || crypto.randomUUID();
    if ((state as any).__ui_telemetry) {
      delete (state as any).__ui_telemetry;
    }
    if ((state as any).__bootstrap_poll) {
      delete (state as any).__bootstrap_poll;
    }
    const fromArgs = String(rawState?.initial_user_message ?? "").trim();
    if (fromArgs && !String((state as any).initial_user_message ?? "").trim()) {
      (state as any).initial_user_message = fromArgs;
    }
    if (String(rawState?.started ?? "").trim().toLowerCase() === "true") {
      (state as any).started = "true";
    }

    deps.syncDreamRuntimeMode(state);
    const pristineAtEntry = deps.isPristineStateForStart(state);

    const userMessageRaw = String(params.args.user_message ?? "");
    const extracted = deps.extractUserMessageFromWrappedInput(userMessageRaw);
    const rawNormalized = extracted ? extracted : userMessageRaw;

    const userMessageCandidate =
      pristineAtEntry ? rawNormalized : (deps.looksLikeMetaInstruction(rawNormalized) ? "" : rawNormalized);

    const currentStepAtEntry = String((state as any).current_step || deps.step0Id).trim() || deps.step0Id;
    const startedAtEntry = String((state as any).started || "").trim().toLowerCase() === "true";
    const candidateText = String(userMessageCandidate ?? "").trim();
    const candidateCanSeed =
      candidateText !== "" &&
      !/^[0-9]+$/.test(candidateText) &&
      !candidateText.startsWith("ACTION_");
    const prestartBufferingTurn = currentStepAtEntry === deps.step0Id && !startedAtEntry;
    if (candidateCanSeed && (prestartBufferingTurn || String((state as any).initial_user_message ?? "").trim() === "")) {
      // Keep the latest meaningful prestart input so ACTION_START can consume it.
      (state as any).initial_user_message = candidateText;
    }
    const bufferedInitialUserMessage = String((state as any).initial_user_message ?? "").trim();
    if (bufferedInitialUserMessage) {
      state = deps.maybeSeedStep0CandidateFromInitialMessage(state, bufferedInitialUserMessage);
    }

    const lastSpecialistResult = (state as any)?.last_specialist_result;
    const actionCodeRaw = userMessageCandidate.startsWith("ACTION_") ? userMessageCandidate : "";
    return {
      state,
      serverState,
      rawLegacyMarkers,
      migrationApplied,
      migrationFromVersion,
      unsupportedStateVersion,
      transientTextSubmit,
      transientPendingScores,
      isBootstrapPollCall,
      pristineAtEntry,
      rawNormalized,
      userMessageCandidate,
      lastSpecialistResult,
      actionCodeRaw,
      isActionCodeTurnForPolicy: actionCodeRaw !== "" && actionCodeRaw !== "ACTION_TEXT_SUBMIT",
      userMessage: userMessageCandidate,
      submittedUserText: "",
      clickedLabelForNoRepeat: "",
      clickedActionCodeForNoRepeat: "",
    };
  }

  async function preprocessBootstrapPoll<TResponse>(
    params: BootstrapPollPreprocessParams<TResponse>
  ): Promise<BootstrapPollPreprocessResult<TResponse>> {
    let state = params.state;
    let actionCodeRaw = params.actionCodeRaw;
    let userMessage = params.userMessage;
    let clickedActionCodeForNoRepeat = params.clickedActionCodeForNoRepeat;
    let clickedLabelForNoRepeat = params.clickedLabelForNoRepeat;

    if (!params.isBootstrapPollCall || !params.isUiLocaleReadyGateV1Enabled()) {
      return {
        state,
        actionCodeRaw,
        userMessage,
        clickedActionCodeForNoRepeat,
        clickedLabelForNoRepeat,
        response: null,
      };
    }

    const languageSeed = String((state as any).initial_user_message || "").trim();
    const localeResolution = await params.resolveLocaleAndUiStringsReady(state, languageSeed);
    state = localeResolution.state;
    void params.deriveBootstrapContract(state);
    actionCodeRaw = "";
    userMessage = "";
    clickedActionCodeForNoRepeat = "";
    clickedLabelForNoRepeat = "";
    (state as any).__last_clicked_action_for_contract = "";
    (state as any).__last_clicked_label_for_contract = "";
    return {
      state,
      actionCodeRaw,
      userMessage,
      clickedActionCodeForNoRepeat,
      clickedLabelForNoRepeat,
      response: null,
    };
  }

  function applyActionCodeNormalization(params: NormalizeActionCodeParams): NormalizeActionCodeResult {
    let state = params.state;
    let actionCodeRaw = params.actionCodeRaw;
    let userMessage = params.userMessage;
    let submittedUserText = params.submittedUserText;
    let clickedLabelForNoRepeat = params.clickedLabelForNoRepeat;
    let clickedActionCodeForNoRepeat = params.clickedActionCodeForNoRepeat;

    if (actionCodeRaw) {
      const sourceStep = String(state.current_step || "").trim();
      const menuId = params.inferCurrentMenuForStep(state, sourceStep);
      if (menuId) {
        const expectedCount = ACTIONCODE_REGISTRY.menus[menuId]?.length;
        deps.logStructuredEvent?.({
          severity: "info",
          event: "actioncode_click",
          state,
          step_id: sourceStep || deps.step0Id,
          contract_id: String(((state as any).__ui_phase_by_step || {})[sourceStep] || ""),
          details: {
            registry_version: ACTIONCODE_REGISTRY.version,
            menu_id: menuId,
            expected_count: expectedCount ?? 0,
            action_code: actionCodeRaw,
            input_mode: params.inputMode,
          },
        });
      }
      const sourceMenu = params.inferCurrentMenuForStep(state, sourceStep);
      clickedActionCodeForNoRepeat = String(actionCodeRaw || "").trim().toUpperCase();
      clickedLabelForNoRepeat = params.labelForActionInMenu(sourceMenu, clickedActionCodeForNoRepeat);
      (state as any).__last_clicked_action_for_contract = clickedActionCodeForNoRepeat;
      (state as any).__last_clicked_label_for_contract = clickedLabelForNoRepeat;
    }

    if (actionCodeRaw === "ACTION_TEXT_SUBMIT") {
      const submitted = String(params.transientTextSubmit ?? "").trim();
      submittedUserText = submitted;
      userMessage = submitted;
      actionCodeRaw = "";
      clickedActionCodeForNoRepeat = "";
      clickedLabelForNoRepeat = "";
      (state as any).__last_clicked_action_for_contract = "";
      (state as any).__last_clicked_label_for_contract = "";
      const currentStep = String((state as any).current_step || deps.step0Id).trim() || deps.step0Id;
      const started = String((state as any).started || "").trim().toLowerCase() === "true";
      const submittedCanSeed =
        submitted !== "" &&
        !/^[0-9]+$/.test(submitted) &&
        !submitted.startsWith("ACTION_");
      const prestartBufferingTurn = currentStep === deps.step0Id && !started;
      if (submittedCanSeed && (prestartBufferingTurn || String((state as any).initial_user_message ?? "").trim() === "")) {
        // Buffer latest prestart text; it will be used once the user taps ACTION_START.
        (state as any).initial_user_message = submitted;
      }
    }

    return {
      state,
      actionCodeRaw,
      userMessage,
      submittedUserText,
      clickedLabelForNoRepeat,
      clickedActionCodeForNoRepeat,
    };
  }

  function deriveIntentTypeForRouting(actionCode: string, routeOrText: string): string {
    const normalizedActionCode = String(actionCode || "").trim();
    const normalizedRoute = String(routeOrText || "").trim();
    if (!normalizedActionCode && !normalizedRoute) return "";
    try {
      const routeFromRegistry =
        normalizedActionCode && ACTIONCODE_REGISTRY.actions[normalizedActionCode]
          ? String(ACTIONCODE_REGISTRY.actions[normalizedActionCode]?.route || "").trim()
          : "";
      const intent = actionCodeToIntent({
        actionCode: normalizedActionCode,
        route: routeFromRegistry || normalizedRoute,
      });
      return String(intent?.type || "").trim();
    } catch {
      return "";
    }
  }

  return {
    initializeRunStepPreflight,
    preprocessBootstrapPoll,
    applyActionCodeNormalization,
    deriveIntentTypeForRouting,
  };
}
