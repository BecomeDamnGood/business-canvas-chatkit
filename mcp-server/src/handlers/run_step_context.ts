import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { CanvasState } from "../core/state.js";
import type { PendingWordingChoiceTextIntent } from "./run_step_wording_heuristics.js";

export type RunStepInputMode = "widget" | "chat";

export type RunStepRoutingContext = {
  userMessage: string;
  actionCodeRaw: string;
  responseUiFlags: Record<string, boolean | string> | null;
  inputMode: RunStepInputMode;
  wordingChoiceEnabled: boolean;
  languageResolvedThisTurn: boolean;
  isBootstrapPollCall: boolean;
  motivationQuotesEnabled: boolean;
};

export type RunStepRenderingContext = {
  uiI18nTelemetry: unknown;
  lang: string;
  ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
};

export type RunStepStateContext = {
  state: CanvasState;
  transientPendingScores: number[][] | null;
  submittedUserText: string;
  submittedTextIntent: PendingWordingChoiceTextIntent | "";
  rawNormalized: string;
  pristineAtEntry: boolean;
};

export type RunStepSpecialistContext = {
  model: string;
  decideOrchestration: (routeState: CanvasState, routeUserMessage: string) => OrchestratorOutput;
  rememberLlmCall: (value: { attempts: number; usage: any; model: string }) => void;
};

export type RunStepContext = {
  routing: RunStepRoutingContext;
  rendering: RunStepRenderingContext;
  state: RunStepStateContext;
  specialist: RunStepSpecialistContext;
};

export type RunStepRouteRegistryRequest = {
  state: CanvasState;
  userMessage: string;
  actionCodeRaw: string;
  responseUiFlags: Record<string, boolean | string> | null;
  model: string;
  uiI18nTelemetry: unknown;
  transientPendingScores: number[][] | null;
  inputMode: RunStepInputMode;
  wordingChoiceEnabled: boolean;
  languageResolvedThisTurn: boolean;
  isBootstrapPollCall: boolean;
  lang: string;
};

export type RunStepPostSpecialistPipelineRequest = {
  state: CanvasState;
  userMessage: string;
  actionCodeRaw: string;
  responseUiFlags: Record<string, boolean | string> | null;
  model: string;
  uiI18nTelemetry: unknown;
  inputMode: RunStepInputMode;
  wordingChoiceEnabled: boolean;
  motivationQuotesEnabled: boolean;
  submittedUserText: string;
  submittedTextIntent: PendingWordingChoiceTextIntent | "";
  lang: string;
  rawNormalized: string;
  pristineAtEntry: boolean;
  decideOrchestration: (routeState: CanvasState, routeUserMessage: string) => OrchestratorOutput;
  ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
  rememberLlmCall: (value: { attempts: number; usage: any; model: string }) => void;
};

export function toRouteRegistryRequest(context: RunStepContext): RunStepRouteRegistryRequest {
  return {
    state: context.state.state,
    userMessage: context.routing.userMessage,
    actionCodeRaw: context.routing.actionCodeRaw,
    responseUiFlags: context.routing.responseUiFlags,
    model: context.specialist.model,
    uiI18nTelemetry: context.rendering.uiI18nTelemetry,
    transientPendingScores: context.state.transientPendingScores,
    inputMode: context.routing.inputMode,
    wordingChoiceEnabled: context.routing.wordingChoiceEnabled,
    languageResolvedThisTurn: context.routing.languageResolvedThisTurn,
    isBootstrapPollCall: context.routing.isBootstrapPollCall,
    lang: context.rendering.lang,
  };
}

export function toRunPostSpecialistPipelineRequest(
  context: RunStepContext
): RunStepPostSpecialistPipelineRequest {
  return {
    state: context.state.state,
    userMessage: context.routing.userMessage,
    actionCodeRaw: context.routing.actionCodeRaw,
    responseUiFlags: context.routing.responseUiFlags,
    model: context.specialist.model,
    uiI18nTelemetry: context.rendering.uiI18nTelemetry,
    inputMode: context.routing.inputMode,
    wordingChoiceEnabled: context.routing.wordingChoiceEnabled,
    motivationQuotesEnabled: context.routing.motivationQuotesEnabled,
    submittedUserText: context.state.submittedUserText,
    submittedTextIntent: context.state.submittedTextIntent,
    lang: context.rendering.lang,
    rawNormalized: context.state.rawNormalized,
    pristineAtEntry: context.state.pristineAtEntry,
    decideOrchestration: context.specialist.decideOrchestration,
    ensureUiStrings: context.rendering.ensureUiStrings,
    rememberLlmCall: context.specialist.rememberLlmCall,
  };
}
