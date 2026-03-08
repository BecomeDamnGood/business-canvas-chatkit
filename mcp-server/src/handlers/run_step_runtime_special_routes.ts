import type { CanvasState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { LLMUsage } from "./run_step_dependencies.js";
import type {
  PendingWordingChoiceTextAnchor,
  PendingWordingChoiceTextIntent,
} from "./run_step_wording_heuristics.js";

import type { RunStepContext } from "./run_step_context.js";
import type { RunStepRoutePorts } from "./run_step_ports.js";
import { createRunStepRouteHelpers } from "./run_step_routes.js";

export type RunStepRuntimeSpecialRoutesResult<TPayload extends Record<string, unknown>> = {
  response: TPayload | null;
  context: RunStepContext;
};

export async function runStepRuntimeSpecialRoutesLayer<TPayload extends Record<string, unknown>>(params: {
  runtime: {
    state: CanvasState;
    userMessage: string;
    actionCodeRaw: string;
    responseUiFlags: Record<string, boolean | string> | null;
    inputMode: "widget" | "chat";
    wordingChoiceEnabled: boolean;
    languageResolvedThisTurn: boolean;
    isBootstrapPollCall: boolean;
    motivationQuotesEnabled: boolean;
    uiI18nTelemetry: unknown;
    transientPendingScores: number[][] | null;
    submittedUserText: string;
    submittedTextIntent: PendingWordingChoiceTextIntent | "";
    submittedTextAnchor: PendingWordingChoiceTextAnchor | "";
    rawNormalized: string;
    pristineAtEntry: boolean;
    lang: string;
    model: string;
  };
  specialist: {
    decideOrchestration: (routeState: CanvasState, routeUserMessage: string) => OrchestratorOutput;
    rememberLlmCall: (value: { attempts: number; usage: LLMUsage; model: string }) => void;
  };
  routePorts: RunStepRoutePorts<TPayload>;
}): Promise<RunStepRuntimeSpecialRoutesResult<TPayload>> {
  const routeHelpers = createRunStepRouteHelpers<TPayload>(params.routePorts);

  const context: RunStepContext = {
    routing: {
      userMessage: params.runtime.userMessage,
      actionCodeRaw: params.runtime.actionCodeRaw,
      responseUiFlags: params.runtime.responseUiFlags,
      inputMode: params.runtime.inputMode,
      wordingChoiceEnabled: params.runtime.wordingChoiceEnabled,
      languageResolvedThisTurn: params.runtime.languageResolvedThisTurn,
      isBootstrapPollCall: params.runtime.isBootstrapPollCall,
      motivationQuotesEnabled: params.runtime.motivationQuotesEnabled,
    },
    rendering: {
      uiI18nTelemetry: params.runtime.uiI18nTelemetry,
      lang: params.runtime.lang,
      ensureUiStrings: params.routePorts.contracts.ensureUiStrings,
    },
    state: {
      state: params.runtime.state,
      transientPendingScores: params.runtime.transientPendingScores,
      submittedUserText: params.runtime.submittedUserText,
      submittedTextIntent: params.runtime.submittedTextIntent,
      submittedTextAnchor: params.runtime.submittedTextAnchor,
      rawNormalized: params.runtime.rawNormalized,
      pristineAtEntry: params.runtime.pristineAtEntry,
    },
    specialist: {
      model: params.runtime.model,
      decideOrchestration: params.specialist.decideOrchestration,
      rememberLlmCall: params.specialist.rememberLlmCall,
    },
  };

  const response = await routeHelpers.handleSpecialRouteRegistry(context);
  return { response, context };
}
