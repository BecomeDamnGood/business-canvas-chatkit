import type { CanvasState } from "../core/state.js";
import {
  type RunStepRuntimePreflightLocaleHintSource,
} from "./run_step_runtime_preflight_policy.js";

type RunStepRuntimePreflightPorts<TPayload extends Record<string, unknown>> = {
  preprocessBootstrapPoll: (params: {
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
    hasUsableSpecialistForRetry: (specialist: unknown) => boolean;
    buildTransientFallbackSpecialist: (state: CanvasState) => Record<string, unknown>;
    deriveBootstrapContract: (state: CanvasState) => {
      waiting: boolean;
      ready: boolean;
      retry_hint: string;
      phase?: string;
    };
    buildTextForWidget: (params: { specialist: Record<string, unknown> }) => string;
    pickPrompt: (specialist: Record<string, unknown>) => string;
    attachRegistryPayload: (
      payload: Record<string, unknown>,
      specialist: Record<string, unknown>,
      flagsOverride?: Record<string, boolean | string>
    ) => TPayload;
    finalizeResponse: (payload: TPayload) => TPayload;
  }) => Promise<{
    state: CanvasState;
    actionCodeRaw: string;
    userMessage: string;
    clickedLabelForNoRepeat: string;
    clickedActionCodeForNoRepeat: string;
    response: TPayload | null;
  }>;
  handleLegacyPreflight: (params: {
    state: CanvasState;
    rawLegacyMarkers: string[];
    localeHint: string;
    buildFailClosedState: (
      state: CanvasState,
      reason: "session_upgrade_required" | "contract_violation" | "invalid_state",
      params: { requestedLang: string }
    ) => CanvasState;
    attachRegistryPayload: (
      payload: Record<string, unknown>,
      specialist: Record<string, unknown>,
      flagsOverride?: Record<string, boolean | string>
    ) => TPayload;
    finalizeResponse: (payload: TPayload) => TPayload;
  }) => {
    response: TPayload | null;
    blockingMarkerClass: string;
  };
  applyActionCodeNormalization: (params: {
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
  }) => {
    state: CanvasState;
    actionCodeRaw: string;
    userMessage: string;
    submittedUserText: string;
    clickedLabelForNoRepeat: string;
    clickedActionCodeForNoRepeat: string;
  };
};

export type RunStepRuntimePreflightState<TPayload extends Record<string, unknown>> = {
  state: CanvasState;
  actionCodeRaw: string;
  userMessage: string;
  submittedUserText: string;
  clickedLabelForNoRepeat: string;
  clickedActionCodeForNoRepeat: string;
  blockingMarkerClass: string;
  response: TPayload | null;
};

export async function runStepRuntimePreflightLayer<TPayload extends Record<string, unknown>>(params: {
  ports: RunStepRuntimePreflightPorts<TPayload>;
  runtime: {
    state: CanvasState;
    rawLegacyMarkers: string[];
    isBootstrapPollCall: boolean;
    actionCodeRaw: string;
    userMessage: string;
    submittedUserText: string;
    clickedLabelForNoRepeat: string;
    clickedActionCodeForNoRepeat: string;
    transientTextSubmit: string;
  };
  constants: {
    step0Id: string;
    step0Specialist: string;
    localeHint: string;
    localeHintSource: RunStepRuntimePreflightLocaleHintSource;
    inputMode: "widget" | "chat";
  };
  finalize: {
    isUiLocaleReadyGateV1Enabled: () => boolean;
    resolveLocaleAndUiStringsReady: (
      state: CanvasState,
      routeOrText: string
    ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
    ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
    finalizeResponse: (payload: TPayload) => TPayload;
    attachRegistryPayload: (
      payload: Record<string, unknown>,
      specialist: Record<string, unknown>,
      flagsOverride?: Record<string, boolean | string>
    ) => TPayload;
  };
  behavior: {
    hasUsableSpecialistForRetry: (specialist: unknown) => boolean;
    buildTransientFallbackSpecialist: (state: CanvasState) => Record<string, unknown>;
    deriveBootstrapContract: (state: CanvasState) => {
      waiting: boolean;
      ready: boolean;
      retry_hint: string;
      phase?: string;
    };
    buildTextForWidget: (params: { specialist: Record<string, unknown> }) => string;
    pickPrompt: (specialist: Record<string, unknown>) => string;
    buildFailClosedState: (
      state: CanvasState,
      reason: "session_upgrade_required" | "contract_violation" | "invalid_state",
      params: { requestedLang: string }
    ) => CanvasState;
    inferCurrentMenuForStep: (state: CanvasState, stepId: string) => string;
    labelForActionInMenu: (menuId: string, actionCode: string) => string;
  };
  language: {
    normalizeLangCode: (raw: string) => string;
    normalizeLanguageSource: (raw: unknown) => string;
    isUiStep0LangResetGuardV1Enabled: () => boolean;
  };
}): Promise<RunStepRuntimePreflightState<TPayload>> {
  const { ports, runtime, constants, finalize, behavior, language } = params;
  let state = runtime.state;
  let actionCodeRaw = runtime.actionCodeRaw;
  let userMessage = runtime.userMessage;
  let submittedUserText = runtime.submittedUserText;
  let clickedLabelForNoRepeat = runtime.clickedLabelForNoRepeat;
  let clickedActionCodeForNoRepeat = runtime.clickedActionCodeForNoRepeat;

  const bootstrapPreflight = await ports.preprocessBootstrapPoll({
    state,
    isBootstrapPollCall: runtime.isBootstrapPollCall,
    actionCodeRaw,
    userMessage,
    clickedLabelForNoRepeat,
    clickedActionCodeForNoRepeat,
    step0Specialist: constants.step0Specialist,
    isUiLocaleReadyGateV1Enabled: finalize.isUiLocaleReadyGateV1Enabled,
    resolveLocaleAndUiStringsReady: finalize.resolveLocaleAndUiStringsReady,
    hasUsableSpecialistForRetry: behavior.hasUsableSpecialistForRetry,
    buildTransientFallbackSpecialist: behavior.buildTransientFallbackSpecialist,
    deriveBootstrapContract: behavior.deriveBootstrapContract,
    buildTextForWidget: behavior.buildTextForWidget,
    pickPrompt: behavior.pickPrompt,
    attachRegistryPayload: finalize.attachRegistryPayload,
    finalizeResponse: finalize.finalizeResponse,
  });

  if (bootstrapPreflight.response) {
    return {
      state: bootstrapPreflight.state,
      actionCodeRaw: bootstrapPreflight.actionCodeRaw,
      userMessage: bootstrapPreflight.userMessage,
      submittedUserText,
      clickedLabelForNoRepeat: bootstrapPreflight.clickedLabelForNoRepeat,
      clickedActionCodeForNoRepeat: bootstrapPreflight.clickedActionCodeForNoRepeat,
      blockingMarkerClass: "none",
      response: bootstrapPreflight.response,
    };
  }

  state = bootstrapPreflight.state;
  actionCodeRaw = bootstrapPreflight.actionCodeRaw;
  userMessage = bootstrapPreflight.userMessage;
  clickedActionCodeForNoRepeat = bootstrapPreflight.clickedActionCodeForNoRepeat;
  clickedLabelForNoRepeat = bootstrapPreflight.clickedLabelForNoRepeat;
  const blockingMarkerClass = "none";

  const actionCodePreflight = ports.applyActionCodeNormalization({
    state,
    actionCodeRaw,
    userMessage,
    submittedUserText,
    clickedLabelForNoRepeat,
    clickedActionCodeForNoRepeat,
    transientTextSubmit: runtime.transientTextSubmit,
    inputMode: constants.inputMode,
    inferCurrentMenuForStep: behavior.inferCurrentMenuForStep,
    labelForActionInMenu: behavior.labelForActionInMenu,
  });

  state = actionCodePreflight.state;
  actionCodeRaw = actionCodePreflight.actionCodeRaw;
  userMessage = actionCodePreflight.userMessage;
  submittedUserText = actionCodePreflight.submittedUserText;
  clickedActionCodeForNoRepeat = actionCodePreflight.clickedActionCodeForNoRepeat;
  clickedLabelForNoRepeat = actionCodePreflight.clickedLabelForNoRepeat;

  return {
    state,
    actionCodeRaw,
    userMessage,
    submittedUserText,
    clickedLabelForNoRepeat,
    clickedActionCodeForNoRepeat,
    blockingMarkerClass,
    response: null,
  };
}
