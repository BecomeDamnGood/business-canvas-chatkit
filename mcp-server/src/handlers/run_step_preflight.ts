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
  rawLegacyMarkers: string[];
  migrationApplied: boolean;
  migrationFromVersion: string;
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

type LegacyPreflightParams<TResponse> = {
  state: CanvasState;
  rawLegacyMarkers: string[];
  localeHint: string;
  buildFailClosedState: (
    state: CanvasState,
    reason: "session_upgrade_required" | "contract_violation" | "invalid_state",
    params: { requestedLang: string }
  ) => CanvasState;
  attachRegistryPayload: (payload: any, specialist: any, flagsOverride?: Record<string, boolean | string>) => any;
  finalizeResponse: (payload: any) => TResponse;
};

type LegacyPreflightResult<TResponse> = {
  response: TResponse | null;
  blockingMarkerClass: string;
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
    const preMigrateStateVersion = String((state as any).state_version || "").trim();
    let migrationApplied = false;
    let migrationFromVersion = "";
    if (preMigrateStateVersion && preMigrateStateVersion !== deps.currentStateVersion) {
      migrationFromVersion = preMigrateStateVersion;
    }
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
    if (incomingPhaseRaw) {
      const phaseByStep = Object.fromEntries(
        Object.entries(incomingPhaseRaw)
          .map(([stepId, contractId]) => [String(stepId || "").trim(), String(contractId || "").trim()])
          .filter(([stepId, contractId]) => stepId && contractId)
      );
      if (Object.keys(phaseByStep).length > 0) {
        (state as any).__ui_phase_by_step = phaseByStep;
      }
    }

    const incomingSessionId = String((rawState as any).__session_id || "").trim();
    const incomingSessionStartedAt = String((rawState as any).__session_started_at || "").trim();
    const incomingSessionLogFile = String((rawState as any).__session_log_file || "").trim();
    const incomingSessionTurnIndex = Number((rawState as any).__session_turn_index ?? 0);
    if (incomingSessionId) (state as any).__session_id = incomingSessionId;
    if (incomingSessionStartedAt) (state as any).__session_started_at = incomingSessionStartedAt;
    if (incomingSessionLogFile) (state as any).__session_log_file = incomingSessionLogFile;
    if (Number.isFinite(incomingSessionTurnIndex) && incomingSessionTurnIndex >= 0) {
      (state as any).__session_turn_index = Math.trunc(incomingSessionTurnIndex);
    }
    if (!String((state as any).__session_id || "").trim()) {
      (state as any).__session_id = crypto.randomUUID();
      (state as any).__session_started_at = new Date().toISOString();
      (state as any).__session_turn_index = 0;
    }
    if (!String((state as any).__session_started_at || "").trim()) {
      (state as any).__session_started_at = new Date().toISOString();
    }
    const previousTurnIndex = Number((state as any).__session_turn_index || 0);
    const nextTurnIndex = Number.isFinite(previousTurnIndex) ? previousTurnIndex + 1 : 1;
    (state as any).__session_turn_index = nextTurnIndex;
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

    const lastSpecialistResult = (state as any)?.last_specialist_result;
    const actionCodeRaw = userMessageCandidate.startsWith("ACTION_") ? userMessageCandidate : "";
    return {
      state,
      rawLegacyMarkers,
      migrationApplied,
      migrationFromVersion,
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

  function handleLegacyPreflight<TResponse>(
    params: LegacyPreflightParams<TResponse>
  ): LegacyPreflightResult<TResponse> {
    const legacyMarkers = Array.from(
      new Set([
        ...params.rawLegacyMarkers,
        ...deps.detectLegacySessionMarkers(params.state),
        ...deps.detectInvalidContractStateMarkers(params.state as unknown as Record<string, unknown>),
      ])
    );
    if (legacyMarkers.length > 0) {
      deps.logStructuredEvent?.({
        severity: "info",
        event: "legacy_preflight_ignored",
        state: params.state,
        step_id: String((params.state as any).current_step || deps.step0Id),
        details: {
          marker_count: legacyMarkers.length,
          markers: legacyMarkers,
        },
      });
    }
    return {
      response: null,
      blockingMarkerClass: "none",
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
    handleLegacyPreflight,
    applyActionCodeNormalization,
    deriveIntentTypeForRouting,
  };
}
