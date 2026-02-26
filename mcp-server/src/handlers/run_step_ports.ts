import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { CanvasState, ProvisionalSource } from "../core/state.js";
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

export type RunStepRenderedPolicyResult = {
  [key: string]: unknown;
  status: string;
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
  uiActionCodes: string[];
  uiActions: unknown[];
};

export type RunStepValidatedRenderedResult = {
  rendered: any;
  state: CanvasState;
  violation: string | null;
};

export type RunStepRenderedRouteOutput = {
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
  uiActionCodes: string[];
  uiActions: unknown[];
};

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

export type RunStepRoutePorts<TResponse> = {
  step0Id: string;
  step0Specialist: string;
  dreamStepId: string;
  dreamSpecialist: string;
  dreamExplainerSpecialist: string;
  roleStepId: string;
  roleSpecialist: string;
  presentationStepId: string;
  presentationSpecialist: string;
  dreamPickOneRouteToken: string;
  roleChooseForMeRouteToken: string;
  presentationMakeRouteToken: string;
  switchToSelfDreamToken: string;
  dreamStartExerciseRouteToken: string;
  wordingSelectionMessage: (stepId: string, state: CanvasState, activeSpecialist?: string) => string;
  pickPrompt: (specialist: any) => string;
  buildTextForWidget: (params: { specialist: any }) => string;
  applyStateUpdate: (params: any) => CanvasState;
  setDreamRuntimeMode: (state: CanvasState, mode: RunStepDreamRuntimeMode) => void;
  getDreamRuntimeMode: (state: CanvasState) => RunStepDreamRuntimeMode;
  renderFreeTextTurnPolicy: (params: any) => any;
  validateRenderedContractOrRecover: (params: any) => RunStepValidatedRenderedResult;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  ensureUiStrings: (state: CanvasState, routeOrText: string) => Promise<CanvasState>;
  ensureStartState: (
    state: CanvasState,
    routeOrText: string
  ) => Promise<{ state: CanvasState; interactiveReady: boolean }>;
  attachRegistryPayload: (...args: any[]) => any;
  finalizeResponse: (response: TResponse) => TResponse;
  pickDreamSuggestionFromPreviousState: (state: CanvasState, previousSpecialist: Record<string, unknown>) => string;
  pickDreamCandidateFromState: (state: CanvasState) => string;
  pickRoleSuggestionFromPreviousState: (state: CanvasState, previousSpecialist: Record<string, unknown>) => string;
  hasPresentationTemplate: () => boolean;
  generatePresentationPptx: (state: CanvasState) => { fileName: string; filePath: string };
  convertPptxToPdf: (pptxPath: string, outDir: string) => string;
  convertPdfToPng: (pdfPath: string, outDir: string) => string;
  cleanupOldPresentationFiles: (outDir: string, maxAgeMs: number) => void;
  baseUrlFromEnv: () => string;
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
  buildContractId: (...args: any[]) => string;
  parseStep0Final: (...args: any[]) => any;
  step0ReadinessQuestion: (...args: any[]) => string;
  step0CardDescForState: (state: CanvasState | null | undefined) => string;
  step0QuestionForState: (state: CanvasState | null | undefined) => string;
  callSpecialistStrictSafe: (
    params: { model: string; state: CanvasState; decision: OrchestratorOutput; userMessage: string },
    routing: RunStepSpecialistRouting,
    stateForError: CanvasState
  ) => Promise<RunStepCallSpecialistSuccess | RunStepCallSpecialistFailure<TResponse>>;
  buildRoutingContext: (routeOrText: string) => RunStepSpecialistRouting;
  rememberLlmCall: (value: { attempts: number; usage: any; model: string }) => void;
  isUiStateHygieneSwitchV1Enabled: () => boolean;
  clearStepInteractiveState: (state: CanvasState, stepId: string) => CanvasState;
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
};

export type RunStepPipelinePorts<TPayload> = {
  step0Id: string;
  dreamStepId: string;
  bigwhyStepId: string;
  strategyStepId: string;
  dreamSpecialist: string;
  dreamExplainerSpecialist: string;
  strategySpecialist: string;
  dreamExplainerSwitchSelfMenuId: string;
  dreamForceRefineRoutePrefix: string;
  strategyConsolidateRouteToken: string;
  bigwhyMaxWords: number;
  uiContractVersion: string;
  buildRoutingContext: (routeOrText: string) => RunStepSpecialistRouting;
  callSpecialistStrictSafe: (
    params: { model: string; state: CanvasState; decision: OrchestratorOutput; userMessage: string },
    routing: RunStepSpecialistRouting,
    stateForError: CanvasState
  ) => Promise<RunStepCallSpecialistSuccess | RunStepCallSpecialistFailure<TPayload>>;
  attachRegistryPayload: (...args: any[]) => TPayload;
  normalizeEntitySpecialistResult: (stepId: string, specialist: any) => any;
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
  renderFreeTextTurnPolicy: (params: any) => RunStepRenderedPolicyResult;
  validateRenderedContractOrRecover: (params: any) => RunStepValidatedRenderedResult;
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  buildContractId: (stepId: string, status: any, menuId: string) => string;
  isWordingChoiceEligibleContext: (
    stepId: string,
    activeSpecialist: string,
    specialist?: Record<string, unknown> | null,
    previousSpecialist?: Record<string, unknown> | null,
    dreamRuntimeModeRaw?: unknown
  ) => boolean;
  buildWordingChoiceFromTurn: (params: {
    stepId: string;
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
    activeSpecialist: string,
    previousSpecialist: Record<string, unknown>,
    stepId: string,
    dreamRuntimeModeRaw?: unknown
  ) => WordingChoiceUiPayload | null;
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
  buildTextForWidget: (params: { specialist: any }) => string;
  pickPrompt: (specialist: any) => string;
  looksLikeMetaInstruction: (userMessage: string) => boolean;
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
};

export type { UiContractMeta };
