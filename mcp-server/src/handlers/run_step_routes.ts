import path from "node:path";
import os from "node:os";

import type { CanvasState } from "../core/state.js";

export type RenderedRouteOutput = {
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
  uiActionCodes: string[];
  uiActions: unknown[];
};

type ValidateRenderedContractResult = {
  rendered: any;
  state: CanvasState;
  violation: string | null;
};

type CallSpecialistSuccess = {
  ok: true;
  value: {
    specialistResult: any;
    attempts: number;
    usage: any;
    model: string;
  };
};

type CallSpecialistFailure<TResponse> = {
  ok: false;
  payload: TResponse;
};

type RouteRegistryDeps<TResponse> = {
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
  setDreamRuntimeMode: (state: CanvasState, mode: "self" | "builder_collect" | "builder_scoring" | "builder_refine") => void;
  getDreamRuntimeMode: (state: CanvasState) => "self" | "builder_collect" | "builder_scoring" | "builder_refine";
  renderFreeTextTurnPolicy: (params: any) => any;
  validateRenderedContractOrRecover: (params: any) => ValidateRenderedContractResult;
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
  callSpecialistStrictSafe: (...args: any[]) => Promise<CallSpecialistSuccess | CallSpecialistFailure<TResponse>>;
  buildRoutingContext: (routeOrText: string) => any;
  rememberLlmCall: (value: { attempts: number; usage: any; model: string }) => void;
  isUiStateHygieneSwitchV1Enabled: () => boolean;
  clearStepInteractiveState: (state: CanvasState, stepId: string) => CanvasState;
  bumpUiI18nCounter: (telemetry: unknown, key: string) => void;
};

export type RouteRegistryContext = {
  state: CanvasState;
  userMessage: string;
  actionCodeRaw: string;
  responseUiFlags: Record<string, boolean | string> | null;
  model: string;
  uiI18nTelemetry: unknown;
  transientPendingScores: number[][] | null;
  inputMode: "widget" | "chat";
  wordingChoiceEnabled: boolean;
  languageResolvedThisTurn: boolean;
  isBootstrapPollCall: boolean;
  lang: string;
};

type SpecialRouteHandler<TResponse> = {
  id: string;
  canHandle: (context: RouteRegistryContext) => boolean;
  handle: (context: RouteRegistryContext) => Promise<TResponse | null>;
};

const ROUTE_REGISTRY_ORDER = [
  "synthetic_dream_pick",
  "synthetic_role_pick",
  "presentation_generate",
  "dream_submit_scores",
  "dream_switch_to_self",
  "start_prestart",
  "dream_start_exercise",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function parseSubmitScoresPayload(
  userMessage: string,
  transientPendingScores: number[][] | null
): number[][] | null {
  if (!String(userMessage || "").trim()) return null;
  if (userMessage === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES") {
    return Array.isArray(transientPendingScores) ? transientPendingScores : null;
  }
  try {
    const parsed = JSON.parse(userMessage) as { action?: string; scores?: number[][] };
    if (parsed?.action === "submit_scores" && Array.isArray(parsed.scores)) {
      return parsed.scores;
    }
  } catch {
    return null;
  }
  return null;
}

function buildRenderedContractViolationResponse<TResponse>(params: {
  deps: RouteRegistryDeps<TResponse>;
  state: CanvasState;
  currentStepId: string;
  activeSpecialist: string;
  rendered: RenderedRouteOutput;
  reason: string;
}): TResponse {
  const payload = params.deps.attachRegistryPayload(
    {
      ok: false as const,
      tool: "run_step" as const,
      current_step_id: String(params.currentStepId),
      active_specialist: String(params.activeSpecialist || ""),
      text: "",
      prompt: "",
      specialist: params.rendered.specialist,
      state: params.state,
      error: {
        type: "contract_violation",
        message: "Rendered output violates the UI contract.",
        reason: params.reason,
        step: String(params.currentStepId || ""),
        contract_id: params.rendered.contractId,
      },
    },
    params.rendered.specialist
  );
  return params.deps.finalizeResponse(payload as unknown as TResponse);
}

function updateRenderedState(
  deps: RouteRegistryDeps<unknown>,
  state: CanvasState,
  rendered: RenderedRouteOutput
): CanvasState {
  (state as any).last_specialist_result = rendered.specialist;
  deps.applyUiPhaseByStep(state, String((state as any).current_step ?? ""), rendered.contractId);
  return state;
}

export function createRunStepRouteHelpers<TResponse>(deps: RouteRegistryDeps<TResponse>) {
  const registryById: Record<string, SpecialRouteHandler<TResponse>> = {
    synthetic_dream_pick: {
      id: "synthetic_dream_pick",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.dreamStepId &&
        context.userMessage === deps.dreamPickOneRouteToken,
      handle: async (context) => {
        const previousSpecialist = asRecord((context.state as any).last_specialist_result || {});
        const pickedSuggestion = deps.pickDreamSuggestionFromPreviousState(context.state, previousSpecialist);
        if (!pickedSuggestion) return null;

        const specialist = {
          action: "ASK",
          message: deps.wordingSelectionMessage(
            deps.dreamStepId,
            context.state,
            String((context.state as any).active_specialist || "")
          ),
          question: "",
          refined_formulation: pickedSuggestion,
          dream: pickedSuggestion,
          suggest_dreambuilder: "false",
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        };

        const forcedDecision: any = {
          specialist_to_call: deps.dreamSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: ${deps.dreamPickOneRouteToken}`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as any).intro_shown_for_step ?? ""),
          intro_shown_session:
            String((context.state as any).intro_shown_session ?? "") === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        };

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: specialist,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });

        deps.setDreamRuntimeMode(nextState, "self");

        const renderedRaw = deps.renderFreeTextTurnPolicy({
          stepId: String((nextState as any).current_step ?? ""),
          state: nextState,
          specialist: asRecord((nextState as any).last_specialist_result || {}),
          previousSpecialist,
        });

        const validated = deps.validateRenderedContractOrRecover({
          stepId: String((nextState as any).current_step ?? ""),
          rendered: renderedRaw,
          state: nextState,
          previousSpecialist,
          telemetry: context.uiI18nTelemetry,
        });

        nextState = validated.state;
        const rendered = validated.rendered;
        if (validated.violation) {
          return buildRenderedContractViolationResponse({
            deps,
            state: nextState,
            currentStepId: String((nextState as any).current_step ?? ""),
            activeSpecialist: deps.dreamSpecialist,
            rendered,
            reason: validated.violation,
          });
        }

        updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextState, rendered);
        const nextStateWithUi = await deps.ensureUiStrings(nextState, context.userMessage);

        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String(nextState.current_step),
            active_specialist: deps.dreamSpecialist,
            text: deps.buildTextForWidget({ specialist: rendered.specialist }),
            prompt: deps.pickPrompt(rendered.specialist),
            specialist: rendered.specialist,
            state: nextStateWithUi,
          },
          rendered.specialist,
          context.responseUiFlags,
          rendered.uiActionCodes,
          rendered.uiActions,
          null,
          {
            contractId: rendered.contractId,
            contractVersion: rendered.contractVersion,
            textKeys: rendered.textKeys,
          }
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },

    synthetic_role_pick: {
      id: "synthetic_role_pick",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.roleStepId &&
        context.userMessage === deps.roleChooseForMeRouteToken,
      handle: async (context) => {
        const previousSpecialist = asRecord((context.state as any).last_specialist_result || {});
        const pickedSuggestion = deps.pickRoleSuggestionFromPreviousState(context.state, previousSpecialist);
        if (!pickedSuggestion) return null;

        const specialist = {
          action: "ASK",
          message: deps.wordingSelectionMessage(
            deps.roleStepId,
            context.state,
            String((context.state as any).active_specialist || "")
          ),
          question: "",
          refined_formulation: pickedSuggestion,
          role: pickedSuggestion,
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        };

        const forcedDecision: any = {
          specialist_to_call: deps.roleSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.roleStepId} | USER_MESSAGE: ${deps.roleChooseForMeRouteToken}`,
          current_step: deps.roleStepId,
          intro_shown_for_step: String((context.state as any).intro_shown_for_step ?? ""),
          intro_shown_session:
            String((context.state as any).intro_shown_session ?? "") === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        };

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: specialist,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });

        const renderedRaw = deps.renderFreeTextTurnPolicy({
          stepId: String((nextState as any).current_step ?? ""),
          state: nextState,
          specialist: asRecord((nextState as any).last_specialist_result || {}),
          previousSpecialist,
        });

        const validated = deps.validateRenderedContractOrRecover({
          stepId: String((nextState as any).current_step ?? ""),
          rendered: renderedRaw,
          state: nextState,
          previousSpecialist,
          telemetry: context.uiI18nTelemetry,
        });

        nextState = validated.state;
        const rendered = validated.rendered;
        if (validated.violation) {
          return buildRenderedContractViolationResponse({
            deps,
            state: nextState,
            currentStepId: String((nextState as any).current_step ?? ""),
            activeSpecialist: deps.roleSpecialist,
            rendered,
            reason: validated.violation,
          });
        }

        updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextState, rendered);
        const nextStateWithUi = await deps.ensureUiStrings(nextState, context.userMessage);

        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String(nextState.current_step),
            active_specialist: deps.roleSpecialist,
            text: deps.buildTextForWidget({ specialist: rendered.specialist }),
            prompt: deps.pickPrompt(rendered.specialist),
            specialist: rendered.specialist,
            state: nextStateWithUi,
          },
          rendered.specialist,
          context.responseUiFlags,
          rendered.uiActionCodes,
          rendered.uiActions,
          null,
          {
            contractId: rendered.contractId,
            contractVersion: rendered.contractVersion,
            textKeys: rendered.textKeys,
          }
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },

    presentation_generate: {
      id: "presentation_generate",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.presentationStepId &&
        context.userMessage === deps.presentationMakeRouteToken,
      handle: async (context) => {
        try {
          console.log("[presentation] Generate requested", {
            cwd: process.cwd(),
            hasTemplate: deps.hasPresentationTemplate(),
          });

          const { fileName, filePath } = deps.generatePresentationPptx(context.state);
          console.log("[presentation] PPTX generated", { fileName, filePath });

          const outDir = path.join(os.tmpdir(), "business-canvas-presentations");
          const pdfPath = deps.convertPptxToPdf(filePath, outDir);
          console.log("[presentation] PDF generated", { pdfPath });
          const pngPath = deps.convertPdfToPng(pdfPath, outDir);
          console.log("[presentation] PNG generated", { pngPath });

          deps.cleanupOldPresentationFiles(outDir, 24 * 60 * 60 * 1000);

          const baseUrl = deps.baseUrlFromEnv();
          const pdfFile = path.basename(pdfPath);
          const pngFile = path.basename(pngPath);
          const pdfUrl = baseUrl ? `${baseUrl}/presentations/${pdfFile}` : `/presentations/${pdfFile}`;
          const pngUrl = baseUrl ? `${baseUrl}/presentations/${pngFile}` : `/presentations/${pngFile}`;

          const message = deps.uiStringFromStateMap(
            context.state,
            "presentation.ready",
            deps.uiDefaultString("presentation.ready", "Your presentation is ready.")
          );

          const specialist = {
            action: "ASK",
            message,
            question: "",
            refined_formulation: "",
            presentation_brief: "",
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          const payload = deps.attachRegistryPayload(
            {
              ok: true as const,
              tool: "run_step" as const,
              current_step_id: String((context.state as any).current_step || ""),
              active_specialist: deps.presentationSpecialist,
              text: deps.buildTextForWidget({ specialist }),
              prompt: "",
              specialist,
              presentation_assets: {
                pdf_url: pdfUrl,
                png_url: pngUrl,
                base_name: path.basename(fileName, ".pptx"),
              },
              state: {
                ...(context.state as any),
                active_specialist: deps.presentationSpecialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return deps.finalizeResponse(payload as unknown as TResponse);
        } catch (err) {
          console.error("[presentation] Generation failed", err);

          const message = deps.uiStringFromStateMap(
            context.state,
            "presentation.error",
            deps.uiDefaultString(
              "presentation.error",
              "Presentation generation failed. Please check that the template exists and try again."
            )
          );

          const specialist = {
            action: "ASK",
            message,
            question: "",
            refined_formulation: "",
            presentation_brief: "",
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          const payload = deps.attachRegistryPayload(
            {
              ok: true as const,
              tool: "run_step" as const,
              current_step_id: String((context.state as any).current_step || ""),
              active_specialist: deps.presentationSpecialist,
              text: deps.buildTextForWidget({ specialist }),
              prompt: "",
              specialist,
              state: {
                ...(context.state as any),
                active_specialist: deps.presentationSpecialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return deps.finalizeResponse(payload as unknown as TResponse);
        }
      },
    },

    dream_submit_scores: {
      id: "dream_submit_scores",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.dreamStepId &&
        String((context.state as any).active_specialist || "") === deps.dreamExplainerSpecialist &&
        String(context.userMessage || "").trim().length > 0,
      handle: async (context) => {
        const parsedScores = parseSubmitScoresPayload(context.userMessage, context.transientPendingScores);
        if (!parsedScores || parsedScores.length === 0) return null;

        const lastResult = asRecord((context.state as any).last_specialist_result || {});
        const clusters = Array.isArray((lastResult as any).clusters) ? ((lastResult as any).clusters as unknown[]) : [];

        const statementsFromCanonical = Array.isArray((context.state as any).dream_builder_statements)
          ? ((context.state as any).dream_builder_statements as unknown[])
          : [];
        const statementsFromLast = Array.isArray((lastResult as any).statements)
          ? ((lastResult as any).statements as unknown[])
          : [];

        const statements =
          statementsFromCanonical.length > 0
            ? statementsFromCanonical
            : statementsFromLast.length > 0
              ? statementsFromLast
              : Array.isArray((context.state as any).dream_scoring_statements)
                ? ((context.state as any).dream_scoring_statements as unknown[])
                : [];

        if (clusters.length !== parsedScores.length || statements.length === 0) return null;

        type ClusterInfo = { theme: string; statement_indices: number[] };
        const clusterAverages = (clusters as ClusterInfo[]).map((cluster, clusterIndex) => {
          const row = parsedScores[clusterIndex] || [];
          const nums = row
            .map((n) => (typeof n === "number" && !Number.isNaN(n) ? Math.max(1, Math.min(10, n)) : 0))
            .filter((n) => n > 0);
          const sum = nums.reduce((a, b) => a + b, 0);
          const average = nums.length > 0 ? sum / nums.length : 0;
          return {
            theme: String((cluster as any).theme ?? "").trim() || `Category ${clusterIndex + 1}`,
            average,
          };
        });

        const maxAverage = Math.max(...clusterAverages.map((entry) => entry.average), 0);
        const topClusters = clusterAverages.filter((entry) => entry.average === maxAverage && entry.average > 0);

        const nextStateScores = {
          ...(context.state as any),
          last_specialist_result: {
            action: "ASK",
            message: "",
            question: "",
            refined_formulation: "",
            dream: "",
            suggest_dreambuilder: "true",
            statements,
            user_state: "ok",
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
            scoring_phase: "false",
            clusters: [],
          },
        } as CanvasState;

        deps.setDreamRuntimeMode(nextStateScores, "builder_scoring");
        (nextStateScores as any).dream_builder_statements = statements;
        (nextStateScores as any).dream_scores = parsedScores;
        (nextStateScores as any).dream_top_clusters = topClusters;
        (nextStateScores as any).dream_awaiting_direction = "true";

        const forcedDecision: any = {
          specialist_to_call: deps.dreamExplainerSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: (user chose to continue without text)`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as any).intro_shown_for_step ?? "").trim() || "dream",
          intro_shown_session:
            String((context.state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        };

        const callFormulation = await deps.callSpecialistStrictSafe(
          {
            model: context.model,
            state: nextStateScores,
            decision: forcedDecision,
            userMessage: "",
          },
          deps.buildRoutingContext(context.userMessage),
          nextStateScores
        );

        if (!callFormulation.ok) return deps.finalizeResponse(callFormulation.payload);
        deps.rememberLlmCall(callFormulation.value);

        const formulationResult = callFormulation.value.specialistResult;
        const nextStateFormulation = deps.applyStateUpdate({
          prev: nextStateScores,
          decision: forcedDecision,
          specialistResult: formulationResult,
          showSessionIntroUsed: "false",
          provisionalSource: "system_generated",
        });

        (nextStateFormulation as any).dream_builder_statements = statements;
        deps.setDreamRuntimeMode(nextStateFormulation, "builder_refine");
        (nextStateFormulation as any).dream_awaiting_direction = "false";

        const renderedRaw = deps.renderFreeTextTurnPolicy({
          stepId: String((nextStateFormulation as any).current_step ?? ""),
          state: nextStateFormulation,
          specialist: asRecord(formulationResult || {}),
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
        });

        const validated = deps.validateRenderedContractOrRecover({
          stepId: String((nextStateFormulation as any).current_step ?? ""),
          rendered: renderedRaw,
          state: nextStateFormulation,
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
          telemetry: context.uiI18nTelemetry,
        });

        const rendered = validated.rendered;
        if (validated.violation) {
          return buildRenderedContractViolationResponse({
            deps,
            state: nextStateFormulation,
            currentStepId: String((nextStateFormulation as any).current_step ?? ""),
            activeSpecialist: deps.dreamExplainerSpecialist,
            rendered,
            reason: validated.violation,
          });
        }

        updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextStateFormulation, rendered);

        const nextStateWithUi = await deps.ensureUiStrings(nextStateFormulation, context.userMessage);
        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String(nextStateFormulation.current_step),
            active_specialist: deps.dreamExplainerSpecialist,
            text: deps.buildTextForWidget({ specialist: rendered.specialist }),
            prompt: deps.pickPrompt(rendered.specialist),
            specialist: rendered.specialist,
            state: nextStateWithUi,
            debug: {
              submit_scores_handled: true,
              formulation_direct: true,
              top_cluster_count: topClusters.length,
            },
          },
          rendered.specialist,
          context.responseUiFlags,
          rendered.uiActionCodes,
          rendered.uiActions,
          null,
          {
            contractId: rendered.contractId,
            contractVersion: rendered.contractVersion,
            textKeys: rendered.textKeys,
          }
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },

    dream_switch_to_self: {
      id: "dream_switch_to_self",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.dreamStepId &&
        String(context.userMessage || "").trim() === deps.switchToSelfDreamToken,
      handle: async (context) => {
        deps.setDreamRuntimeMode(context.state, "self");
        const existingDreamCandidate = deps.pickDreamCandidateFromState(context.state);

        if (!existingDreamCandidate) {
          const switchBaseState = deps.isUiStateHygieneSwitchV1Enabled()
            ? deps.clearStepInteractiveState(context.state, deps.dreamStepId)
            : context.state;

          if (switchBaseState !== context.state) {
            deps.bumpUiI18nCounter(context.uiI18nTelemetry, "state_hygiene_resets_count");
          }

          const specialist = {
            action: "ASK",
            message:
              "That's a great way to start. Writing your own dream helps clarify what really matters to you and your business.\n\nTake a moment to write a draft of your dream. I'll help you refine it if needed.",
            question: "",
            refined_formulation: "",
            dream: "",
            suggest_dreambuilder: "false",
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          let nextState = {
            ...(switchBaseState as any),
            active_specialist: deps.dreamSpecialist,
            last_specialist_result: specialist,
          } as CanvasState;

          deps.setDreamRuntimeMode(nextState, "self");
          (nextState as any).dream_awaiting_direction = "false";

          deps.applyUiPhaseByStep(
            nextState,
            deps.dreamStepId,
            deps.buildContractId(deps.dreamStepId, "no_output", "DREAM_MENU_INTRO")
          );

          const renderedRaw = deps.renderFreeTextTurnPolicy({
            stepId: String((nextState as any).current_step ?? ""),
            state: nextState,
            specialist: asRecord((nextState as any).last_specialist_result || {}),
            previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
          });

          const validated = deps.validateRenderedContractOrRecover({
            stepId: String((nextState as any).current_step ?? ""),
            rendered: renderedRaw,
            state: nextState,
            previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
            telemetry: context.uiI18nTelemetry,
          });

          nextState = validated.state;
          const rendered = validated.rendered;
          if (validated.violation) {
            return buildRenderedContractViolationResponse({
              deps,
              state: nextState,
              currentStepId: String((nextState as any).current_step ?? ""),
              activeSpecialist: deps.dreamSpecialist,
              rendered,
              reason: validated.violation,
            });
          }

          updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextState, rendered);
          const nextStateWithUi = await deps.ensureUiStrings(nextState, context.userMessage);

          const payload = deps.attachRegistryPayload(
            {
              ok: true as const,
              tool: "run_step" as const,
              current_step_id: String(nextState.current_step),
              active_specialist: deps.dreamSpecialist,
              text: deps.buildTextForWidget({ specialist: rendered.specialist }),
              prompt: deps.pickPrompt(rendered.specialist),
              specialist: rendered.specialist,
              state: nextStateWithUi,
            },
            rendered.specialist,
            context.responseUiFlags,
            rendered.uiActionCodes,
            rendered.uiActions,
            null,
            {
              contractId: rendered.contractId,
              contractVersion: rendered.contractVersion,
              textKeys: rendered.textKeys,
            }
          );

          return deps.finalizeResponse(payload as unknown as TResponse);
        }

        (context.state as any).intro_shown_for_step = "dream";
        const forcedDecision: any = {
          specialist_to_call: deps.dreamSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: I want to write my dream in my own words.`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: "dream",
          intro_shown_session:
            String((context.state as any).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        };

        const callDream = await deps.callSpecialistStrictSafe(
          {
            model: context.model,
            state: context.state,
            decision: forcedDecision,
            userMessage: "I want to write my dream in my own words.",
          },
          deps.buildRoutingContext(context.userMessage),
          context.state
        );

        if (!callDream.ok) return deps.finalizeResponse(callDream.payload);
        deps.rememberLlmCall(callDream.value);

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: callDream.value.specialistResult,
          showSessionIntroUsed: "false",
          provisionalSource: "system_generated",
        });

        deps.setDreamRuntimeMode(nextState, "self");

        const renderedRaw = deps.renderFreeTextTurnPolicy({
          stepId: String((nextState as any).current_step ?? ""),
          state: nextState,
          specialist: asRecord((nextState as any).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
        });

        const validated = deps.validateRenderedContractOrRecover({
          stepId: String((nextState as any).current_step ?? ""),
          rendered: renderedRaw,
          state: nextState,
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
          telemetry: context.uiI18nTelemetry,
        });

        nextState = validated.state;
        const rendered = validated.rendered;
        if (validated.violation) {
          return buildRenderedContractViolationResponse({
            deps,
            state: nextState,
            currentStepId: String((nextState as any).current_step ?? ""),
            activeSpecialist: deps.dreamSpecialist,
            rendered,
            reason: validated.violation,
          });
        }

        updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextState, rendered);

        const nextStateWithUi = await deps.ensureUiStrings(nextState, context.userMessage);
        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String(nextState.current_step),
            active_specialist: deps.dreamSpecialist,
            text: deps.buildTextForWidget({ specialist: rendered.specialist }),
            prompt: deps.pickPrompt(rendered.specialist),
            specialist: rendered.specialist,
            state: nextStateWithUi,
          },
          rendered.specialist,
          context.responseUiFlags,
          rendered.uiActionCodes,
          rendered.uiActions,
          null,
          {
            contractId: rendered.contractId,
            contractVersion: rendered.contractVersion,
            textKeys: rendered.textKeys,
          }
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },

    start_prestart: {
      id: "start_prestart",
      canHandle: (context) => {
        const startedAtTrigger = String((context.state as any).started ?? "").trim().toLowerCase() === "true";
        const currentStep = String((context.state as any).current_step || "");
        const introShown = String((context.state as any).intro_shown_session || "");
        const lastSpecialist = asRecord((context.state as any).last_specialist_result || {});
        const hasLastSpecialist = Object.keys(lastSpecialist).length > 0;
        const allowStartActionWithSnapshot =
          context.actionCodeRaw === "ACTION_START" && hasLastSpecialist;
        const isStartTrigger =
          (String(context.userMessage || "").trim() === "" || context.actionCodeRaw === "ACTION_START") &&
          currentStep === deps.step0Id &&
          introShown !== "true" &&
          (!hasLastSpecialist || allowStartActionWithSnapshot);
        const shouldReturnPrestartGate =
          !startedAtTrigger &&
          currentStep === deps.step0Id &&
          introShown !== "true" &&
          context.actionCodeRaw !== "ACTION_START" &&
          !context.isBootstrapPollCall;
        return shouldReturnPrestartGate || isStartTrigger;
      },
      handle: async (context) => {
        const startedAtTrigger = String((context.state as any).started ?? "").trim().toLowerCase() === "true";
        const currentStep = String((context.state as any).current_step || "");
        const introShown = String((context.state as any).intro_shown_session || "");
        const lastSpecialist = asRecord((context.state as any).last_specialist_result || {});
        const hasLastSpecialist = Object.keys(lastSpecialist).length > 0;
        const allowStartActionWithSnapshot =
          context.actionCodeRaw === "ACTION_START" && hasLastSpecialist;

        const shouldReturnPrestartGate =
          !startedAtTrigger &&
          currentStep === deps.step0Id &&
          introShown !== "true" &&
          context.actionCodeRaw !== "ACTION_START" &&
          !context.isBootstrapPollCall;

        const isStartTrigger =
          (String(context.userMessage || "").trim() === "" || context.actionCodeRaw === "ACTION_START") &&
          currentStep === deps.step0Id &&
          introShown !== "true" &&
          (!hasLastSpecialist || allowStartActionWithSnapshot);

        if (!shouldReturnPrestartGate && !isStartTrigger) return null;

        const initialUserMessageSeed = String((context.state as any).initial_user_message ?? "").trim();
        const startLocaleSeedText = initialUserMessageSeed || context.userMessage;

        if (shouldReturnPrestartGate) {
          const startResolution = await deps.ensureStartState(context.state, startLocaleSeedText);
          const stateWithUi = startResolution.state;
          const startHint =
            typeof (stateWithUi as any).ui_strings?.startHint === "string"
              ? String((stateWithUi as any).ui_strings.startHint)
              : deps.uiDefaultString("startHint", "Click Start in the widget to begin.");

          const specialist = {
            action: "ASK",
            message: "",
            question: startHint,
            refined_formulation: "",
            business_name: (context.state as any).business_name || "TBD",
            step_0: "",
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          const payload = deps.attachRegistryPayload(
            {
              ok: true as const,
              tool: "run_step" as const,
              current_step_id: String((context.state as any).current_step || ""),
              active_specialist: deps.step0Specialist,
              text: "",
              prompt: specialist.question,
              specialist,
              state: {
                ...(stateWithUi as any),
                started: "false",
                active_specialist: deps.step0Specialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return deps.finalizeResponse(payload as unknown as TResponse);
        }

        (context.state as any).intro_shown_session = "true";
        const step0Final = String((context.state as any).step_0_final ?? "").trim();

        if (step0Final) {
          const startResolution = await deps.ensureStartState(context.state, startLocaleSeedText);
          const stateWithUi = startResolution.state;
          const parsed = deps.parseStep0Final(step0Final, String((stateWithUi as any).business_name || "TBD"));
          const name = String(parsed.name || "TBD").trim();

          const specialist = {
            action: "ASK",
            message: "",
            question: deps.step0ReadinessQuestion(stateWithUi, parsed),
            refined_formulation: "",
            business_name: name || "TBD",
            step_0: step0Final,
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          const payload = deps.attachRegistryPayload(
            {
              ok: true as const,
              tool: "run_step" as const,
              current_step_id: String((context.state as any).current_step || ""),
              active_specialist: deps.step0Specialist,
              text: "",
              prompt: specialist.question,
              specialist,
              state: {
                ...(stateWithUi as any),
                started: startResolution.interactiveReady ? "true" : "false",
                active_specialist: deps.step0Specialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return deps.finalizeResponse(payload as unknown as TResponse);
        }

        const initialMsg = String((context.state as any).initial_user_message ?? "").trim();
        const langSeed = initialMsg || context.userMessage;
        const startResolution = await deps.ensureStartState(context.state, langSeed);
        const stateWithUi = startResolution.state;

        const specialist = {
          action: "ASK",
          message: deps.step0CardDescForState(stateWithUi),
          question: deps.step0QuestionForState(stateWithUi),
          refined_formulation: "",
          business_name: (stateWithUi as any).business_name || "TBD",
          step_0: "",
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        };

        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String((stateWithUi as any).current_step || ""),
            active_specialist: deps.step0Specialist,
            text: specialist.message,
            prompt: specialist.question,
            specialist,
            state: {
              ...(stateWithUi as any),
              started: startResolution.interactiveReady ? "true" : "false",
              active_specialist: deps.step0Specialist,
              last_specialist_result: specialist,
            },
          },
          specialist,
          context.responseUiFlags
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },

    dream_start_exercise: {
      id: "dream_start_exercise",
      canHandle: (context) =>
        String((context.state as any).current_step || "") === deps.dreamStepId &&
        context.userMessage === deps.dreamStartExerciseRouteToken,
      handle: async (context) => {
        deps.setDreamRuntimeMode(context.state, "builder_collect");

        const forcedDecision: any = {
          specialist_to_call: deps.dreamExplainerSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: ${context.userMessage}`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as any).intro_shown_for_step ?? ""),
          intro_shown_session:
            (context.state as any).intro_shown_session === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        };

        const callDreamExplainer = await deps.callSpecialistStrictSafe(
          {
            model: context.model,
            state: context.state,
            decision: forcedDecision,
            userMessage: context.userMessage,
          },
          deps.buildRoutingContext(context.userMessage),
          context.state
        );

        if (!callDreamExplainer.ok) return deps.finalizeResponse(callDreamExplainer.payload);
        deps.rememberLlmCall(callDreamExplainer.value);

        const nextStateDream = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: callDreamExplainer.value.specialistResult,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });

        if (Array.isArray(callDreamExplainer.value.specialistResult?.statements)) {
          (nextStateDream as any).dream_builder_statements =
            (callDreamExplainer.value.specialistResult.statements as unknown[])
              .map((line) => String(line || "").trim())
              .filter(Boolean);
        }

        const dreamScoringPhase =
          String(callDreamExplainer.value.specialistResult?.scoring_phase ?? "") === "true";
        const dreamHasClusters =
          Array.isArray(callDreamExplainer.value.specialistResult?.clusters) &&
          (callDreamExplainer.value.specialistResult.clusters as unknown[]).length > 0;

        if (dreamScoringPhase && dreamHasClusters) {
          deps.setDreamRuntimeMode(nextStateDream, "builder_scoring");
        } else if (deps.getDreamRuntimeMode(context.state) === "builder_scoring" && !dreamScoringPhase) {
          deps.setDreamRuntimeMode(nextStateDream, "builder_refine");
        } else {
          deps.setDreamRuntimeMode(nextStateDream, "builder_collect");
        }

        let rendered = deps.renderFreeTextTurnPolicy({
          stepId: String((nextStateDream as any).current_step ?? ""),
          state: nextStateDream,
          specialist: asRecord((nextStateDream as any).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
        });

        const validated = deps.validateRenderedContractOrRecover({
          stepId: String((nextStateDream as any).current_step ?? ""),
          rendered,
          state: nextStateDream,
          previousSpecialist: asRecord((context.state as any).last_specialist_result || {}),
          telemetry: context.uiI18nTelemetry,
        });

        rendered = validated.rendered;
        if (validated.violation) {
          return buildRenderedContractViolationResponse({
            deps,
            state: nextStateDream,
            currentStepId: String((nextStateDream as any).current_step ?? ""),
            activeSpecialist: String((nextStateDream as any).active_specialist || ""),
            rendered,
            reason: validated.violation,
          });
        }

        updateRenderedState(deps as unknown as RouteRegistryDeps<unknown>, nextStateDream, rendered);

        const payload = deps.attachRegistryPayload(
          {
            ok: true as const,
            tool: "run_step" as const,
            current_step_id: String(nextStateDream.current_step),
            active_specialist: String((nextStateDream as any).active_specialist || ""),
            text: deps.buildTextForWidget({ specialist: rendered.specialist }),
            prompt: deps.pickPrompt(rendered.specialist),
            specialist: rendered.specialist,
            state: nextStateDream,
            debug: {
              decision: forcedDecision,
              attempts: callDreamExplainer.value.attempts,
              language: context.lang,
              meta_user_message_ignored: false,
            },
          },
          rendered.specialist,
          context.responseUiFlags,
          rendered.uiActionCodes,
          rendered.uiActions,
          null,
          {
            contractId: rendered.contractId,
            contractVersion: rendered.contractVersion,
            textKeys: rendered.textKeys,
          }
        );

        return deps.finalizeResponse(payload as unknown as TResponse);
      },
    },
  };

  const orderedHandlers = ROUTE_REGISTRY_ORDER.map((id) => registryById[id]);

  async function handleSpecialRouteRegistry(context: RouteRegistryContext): Promise<TResponse | null> {
    for (const handler of orderedHandlers) {
      if (!handler) continue;
      if (!handler.canHandle(context)) continue;
      const response = await handler.handle(context);
      if (response) return response;
    }
    return null;
  }

  return {
    routeRegistryOrder: [...ROUTE_REGISTRY_ORDER],
    handleSpecialRouteRegistry,
  };
}
