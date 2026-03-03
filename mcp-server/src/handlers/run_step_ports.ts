import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { CanvasState, ProvisionalSource } from "../core/state.js";
import type { TurnOutputStatus, TurnPolicyRenderResult } from "../core/turn_policy_renderer.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import type { UiI18nTelemetryCounters } from "./run_step_i18n_runtime.js";
import type { TurnResponseEngine } from "./run_step_turn_response_engine.js";
import type { UiContractMeta, WordingChoiceUiPayload } from "./run_step_ui_payload.js";

export type RunStepSpecialistRouting = {
  enabled: boolean;
  shadow: boolean;
  actionCode?: string;
  intentType?: string;
};

export type RunStepDreamRuntimeMode =
  | "self"
  | "builder_collect"
  | "builder_scoring"
  | "builder_refine";

export type RunStepRenderedPolicyResult = TurnPolicyRenderResult;

export type RunStepValidatedRenderedResult = {
  rendered: unknown;
  state: CanvasState;
  violation: string | null;
};

export type RunStepRenderedRouteOutput = {
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
  uiActionCodes: string[];
  uiActions: RenderedAction[];
};

export type RunStepRenderFreeTextTurnPolicy = (params: {
  stepId: string;
  state: CanvasState;
  specialist: Record<string, unknown>;
  previousSpecialist: Record<string, unknown>;
}) => TurnPolicyRenderResult;

export type RunStepValidateRenderedContractOrRecover = (params: {
  stepId: string;
  rendered: TurnPolicyRenderResult;
  state: CanvasState;
  previousSpecialist: Record<string, unknown>;
  telemetry?: UiI18nTelemetryCounters | null;
}) => RunStepValidatedRenderedResult;

export type RunStepAttachRegistryPayload<TPayload> = (
  payload: Record<string, unknown>,
  specialist: Record<string, unknown>,
  flagsOverride?: Record<string, boolean | string> | null,
  actionCodesOverride?: string[] | null,
  renderedActionsOverride?: RenderedAction[] | null,
  wordingChoiceOverride?: WordingChoiceUiPayload | null,
  contractMetaOverride?: UiContractMeta | null
) => TPayload;

export type RunStepCallSpecialistSuccess = {
  ok: true;
  value: {
    specialistResult: any;
    attempts: number;
    usage: any;
    model: string;
  };
};

export type RunStepCallSpecialistFailure<TPayload> = {
  ok: false;
  payload: TPayload;
};

type RunStepCallSpecialist<TPayload> = (
  params: { model: string; state: CanvasState; decision: OrchestratorOutput; userMessage: string },
  routing: RunStepSpecialistRouting,
  stateForError: CanvasState
) => Promise<RunStepCallSpecialistSuccess | RunStepCallSpecialistFailure<TPayload>>;

export type RunStepRouteIdPorts = {
  step0Id: string;
  step0Specialist: string;
  dreamStepId: string;
  dreamSpecialist: string;
  dreamExplainerSpecialist: string;
  roleStepId: string;
  roleSpecialist: string;
  presentationStepId: string;
  presentationSpecialist: string;
};

export type RunStepRouteTokenPorts = {
  dreamPickOneRouteToken: string;
  roleChooseForMeRouteToken: string;
  presentationMakeRouteToken: string;
  switchToSelfDreamToken: string;
  dreamStartExerciseRouteToken: string;
};

export type RunStepRouteWordingPorts = {
  wordingSelectionMessage: (stepId: string, state: CanvasState, activeSpecialist?: string) => string;
  pickPrompt: (specialist: any) => string;
  buildTextForWidget: (params: { specialist: any }) => string;
};

export type RunStepRouteStatePorts = {
  applyStateUpdate: (params: any) => CanvasState;
  setDreamRuntimeMode: (state: CanvasState, mode: RunStepDreamRuntimeMode) => void;
  getDreamRuntimeMode: (state: CanvasState) => RunStepDreamRuntimeMode;
  isUiStateHygieneSwitchV1Enabled: () => boolean;
  clearStepInteractiveState: (state: CanvasState, stepId: string) => CanvasState;
};

export type RunStepRouteContractPorts = {
  renderFreeTextTurnPolicy: RunStepRenderFreeTextTurnPolicy;
  validateRenderedContractOrRecover: RunStepValidateRenderedContractOrRecover;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
  buildContractId: (stepId: string, status: TurnOutputStatus, menuId: string) => string;
};

export type RunStepRouteStep0Ports = {
  ensureStartState: (
    state: CanvasState,
    routeOrText: string
  ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
  parseStep0Final: (...args: any[]) => any;
  inferStep0SeedFromInitialMessage: (
    rawInput: string
  ) => { venture: string; name: string; status: "existing" | "starting" } | null;
  step0ReadinessQuestion: (...args: any[]) => string;
  step0CardDescForState: (state: CanvasState | null | undefined) => string;
  step0QuestionForState: (state: CanvasState | null | undefined) => string;
};

export type RunStepRoutePresentationPorts = {
  generatePresentationAssets: (state: CanvasState) => {
    pdfUrl: string;
    pngUrl: string;
    baseName: string;
    assetFingerprint: string;
  };
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
};

export type RunStepRouteSpecialistPorts<TResponse> = {
  callSpecialistStrictSafe: RunStepCallSpecialist<TResponse>;
  buildRoutingContext: (routeOrText: string) => RunStepSpecialistRouting;
  rememberLlmCall: (value: { attempts: number; usage: any; model: string }) => void;
};

export type RunStepRouteResponsePorts<TResponse> = {
  attachRegistryPayload: RunStepAttachRegistryPayload<TResponse>;
  finalizeResponse: (response: TResponse) => TResponse;
  turnResponseEngine: TurnResponseEngine<TResponse>;
};

export type RunStepRouteSuggestionPorts = {
  pickDreamSuggestionFromPreviousState: (state: CanvasState, previousSpecialist: Record<string, unknown>) => string;
  pickDreamCandidateFromState: (state: CanvasState) => string;
  pickRoleSuggestionFromPreviousState: (state: CanvasState, previousSpecialist: Record<string, unknown>) => string;
};

export type RunStepRouteI18nPorts = {
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
};

export type RunStepRoutePorts<TResponse> = {
  ids: RunStepRouteIdPorts;
  tokens: RunStepRouteTokenPorts;
  wording: RunStepRouteWordingPorts;
  state: RunStepRouteStatePorts;
  contracts: RunStepRouteContractPorts;
  step0: RunStepRouteStep0Ports;
  presentation: RunStepRoutePresentationPorts;
  specialist: RunStepRouteSpecialistPorts<TResponse>;
  response: RunStepRouteResponsePorts<TResponse>;
  suggestions: RunStepRouteSuggestionPorts;
  i18n: RunStepRouteI18nPorts;
};

export type RunStepPipelineIdPorts = {
  step0Id: string;
  dreamStepId: string;
  bigwhyStepId: string;
  strategyStepId: string;
  dreamSpecialist: string;
  dreamExplainerSpecialist: string;
  strategySpecialist: string;
  dreamExplainerSwitchSelfMenuId: string;
};

export type RunStepPipelinePolicyPorts = {
  dreamForceRefineRoutePrefix: string;
  strategyConsolidateRouteToken: string;
  bigwhyMaxWords: number;
  uiContractVersion: string;
};

export type RunStepPipelineSpecialistPorts<TPayload> = {
  buildRoutingContext: (routeOrText: string) => RunStepSpecialistRouting;
  callSpecialistStrictSafe: RunStepCallSpecialist<TPayload>;
};

export type RunStepPipelineNormalizationPorts = {
  normalizeLocalizedConceptTerms: (
    specialist: Record<string, unknown> | null | undefined,
    state?: CanvasState | null
  ) => Record<string, unknown> | null | undefined;
  normalizeEntitySpecialistResult: (stepId: string, specialist: any, state?: CanvasState | null) => any;
  applyCentralMetaTopicRouter: (params: {
    stepId: string;
    specialistResult: Record<string, unknown>;
    previousSpecialist?: Record<string, unknown>;
    state: CanvasState;
  }) => Record<string, unknown>;
  normalizeNonStep0OfftopicSpecialist: (params: {
    stepId: string;
    activeSpecialist: string;
    userMessage: string;
    specialistResult: any;
    previousSpecialist: Record<string, unknown>;
    state: CanvasState;
  }) => any;
  normalizeStep0AskDisplayContract: (
    stepId: string,
    specialist: any,
    state: CanvasState,
    userInput?: string
  ) => any;
  hasValidStep0Final: (value: string) => boolean;
};

export type RunStepPipelineStatePorts = {
  applyPostSpecialistStateMutations: (params: {
    prevState: CanvasState;
    decision: OrchestratorOutput;
    specialistResult: any;
    provisionalSource: ProvisionalSource;
  }) => CanvasState;
  getDreamRuntimeMode: (state: CanvasState) => RunStepDreamRuntimeMode;
  isMetaOfftopicFallbackTurn: (params: {
    stepId: string;
    userMessage: string;
    specialistResult: any;
  }) => boolean;
  shouldTreatAsStepContributingInput: (userMessage: string, stepId: string) => boolean;
  hasDreamSpecialistCandidate: (specialistResult: any) => boolean;
  buildDreamRefineFallbackSpecialist: (base: any, userInput: string, state: CanvasState) => any;
  strategyStatementsForConsolidateGuard: (result: any, state: CanvasState) => string[];
  pickBigWhyCandidate: (result: any) => string;
  countWords: (text: string) => number;
  buildBigWhyTooLongFeedback: (stateForText: CanvasState) => any;
  enforceDreamBuilderQuestionProgress: (
    specialistResult: any,
    params: {
      currentStepId: string;
      activeSpecialist: string;
      canonicalStatementCount: number;
      wordingChoicePending: boolean;
      state: CanvasState;
    }
  ) => any;
  applyMotivationQuotesContractV11: (params: any) => {
    specialistResult: Record<string, unknown>;
    suppressChoices: boolean;
  };
};

export type RunStepPipelineRenderPorts = {
  renderFreeTextTurnPolicy: RunStepRenderFreeTextTurnPolicy;
  validateRenderedContractOrRecover: RunStepValidateRenderedContractOrRecover;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  buildContractId: (stepId: string, status: TurnOutputStatus, menuId: string) => string;
};

export type RunStepPipelineWordingPorts = {
  isWordingChoiceEligibleContext: (
    stepId: string,
    activeSpecialist: string,
    specialist?: Record<string, unknown> | null,
    previousSpecialist?: Record<string, unknown> | null,
    dreamRuntimeModeRaw?: unknown
  ) => boolean;
  buildWordingChoiceFromTurn: (params: {
    stepId: string;
    state: CanvasState;
    activeSpecialist: string;
    previousSpecialist: Record<string, unknown>;
    specialistResult: Record<string, unknown>;
    userTextRaw: string;
    isOfftopic: boolean;
    forcePending?: boolean;
    dreamRuntimeModeRaw?: unknown;
  }) => {
    specialist: Record<string, unknown>;
    wordingChoice?: WordingChoiceUiPayload | null;
  };
  buildWordingChoiceFromPendingSpecialist: (
    specialistResult: any,
    state: CanvasState | null | undefined,
    activeSpecialist: string,
    previousSpecialist: Record<string, unknown>,
    stepId: string,
    dreamRuntimeModeRaw?: unknown
  ) => WordingChoiceUiPayload | null;
};

export type RunStepPipelineResponsePorts<TPayload> = {
  attachRegistryPayload: RunStepAttachRegistryPayload<TPayload>;
  turnResponseEngine: TurnResponseEngine<TPayload>;
};

export type RunStepPipelineGuardPorts = {
  looksLikeMetaInstruction: (userMessage: string) => boolean;
};

export type RunStepPipelineI18nPorts = {
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
};

export type RunStepPipelinePorts<TPayload> = {
  ids: RunStepPipelineIdPorts;
  policy: RunStepPipelinePolicyPorts;
  specialist: RunStepPipelineSpecialistPorts<TPayload>;
  normalization: RunStepPipelineNormalizationPorts;
  state: RunStepPipelineStatePorts;
  render: RunStepPipelineRenderPorts;
  wording: RunStepPipelineWordingPorts;
  response: RunStepPipelineResponsePorts<TPayload>;
  guard: RunStepPipelineGuardPorts;
  i18n: RunStepPipelineI18nPorts;
};

export type { UiContractMeta };
