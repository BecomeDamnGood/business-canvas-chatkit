import path from "node:path";
import os from "node:os";

import type { OrchestratorOutput } from "../core/orchestrator.js";
import type { CanvasState } from "../core/state.js";
import {
  type RunStepContext,
  type RunStepRouteRegistryRequest,
  toRouteRegistryRequest,
} from "./run_step_context.js";
import {
  type RunStepRenderedRouteOutput,
  type RunStepRoutePorts,
} from "./run_step_ports.js";

export type RenderedRouteOutput = RunStepRenderedRouteOutput;
export type RouteRegistryContext = RunStepRouteRegistryRequest;

type RunStepRouteFlatPorts<TResponse> =
  & RunStepRoutePorts<TResponse>["ids"]
  & RunStepRoutePorts<TResponse>["tokens"]
  & RunStepRoutePorts<TResponse>["wording"]
  & RunStepRoutePorts<TResponse>["state"]
  & RunStepRoutePorts<TResponse>["contracts"]
  & RunStepRoutePorts<TResponse>["step0"]
  & RunStepRoutePorts<TResponse>["presentation"]
  & RunStepRoutePorts<TResponse>["specialist"]
  & RunStepRoutePorts<TResponse>["response"]
  & RunStepRoutePorts<TResponse>["suggestions"]
  & RunStepRoutePorts<TResponse>["i18n"];

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

function flattenRunStepRoutePorts<TResponse>(ports: RunStepRoutePorts<TResponse>): RunStepRouteFlatPorts<TResponse> {
  return {
    ...ports.ids,
    ...ports.tokens,
    ...ports.wording,
    ...ports.state,
    ...ports.contracts,
    ...ports.step0,
    ...ports.presentation,
    ...ports.specialist,
    ...ports.response,
    ...ports.suggestions,
    ...ports.i18n,
  };
}

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

type RouteTurnIntent = {
  state: CanvasState;
  specialist: Record<string, unknown>;
  previousSpecialist: Record<string, unknown>;
  responseUiFlags: Record<string, boolean | string> | null;
  debug?: Record<string, unknown>;
};

export function createRunStepRouteHelpers<TResponse>(ports: RunStepRoutePorts<TResponse>) {
  const deps = flattenRunStepRoutePorts(ports);

  function finalizeRoutePayload(payload: TResponse): TResponse {
    return deps.turnResponseEngine.finalize(payload);
  }

  function buildRenderedContractViolationPayload(params: {
    state: CanvasState;
    stepId: string;
    activeSpecialist: string;
    rendered: RenderedRouteOutput;
    reason: string;
  }): TResponse {
    return deps.attachRegistryPayload(
      {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(params.stepId),
        active_specialist: String(params.activeSpecialist || ""),
        text: "",
        prompt: "",
        specialist: params.rendered.specialist,
        state: params.state,
        error: {
          type: "contract_violation",
          message: "Rendered output violates the UI contract.",
          reason: params.reason,
          step: String(params.stepId || ""),
          contract_id: params.rendered.contractId,
        },
      },
      params.rendered.specialist
    );
  }

  async function finalizeRouteTurnIntent(
    context: RouteRegistryContext,
    intent: RouteTurnIntent
  ): Promise<TResponse> {
    const renderedResult = deps.turnResponseEngine.renderValidateRecover({
      state: intent.state,
      specialist: intent.specialist,
      previousSpecialist: intent.previousSpecialist,
      telemetry: context.uiI18nTelemetry,
      onContractViolation: ({ state, stepId, activeSpecialist, rendered, reason }) =>
        buildRenderedContractViolationPayload({
          state,
          stepId,
          activeSpecialist,
          rendered: rendered as unknown as RenderedRouteOutput,
          reason,
        }),
    });
    if (!renderedResult.ok) return renderedResult.payload;

    const stateWithUi = await deps.ensureUiStrings(renderedResult.value.state, context.userMessage);

    return deps.turnResponseEngine.attachAndFinalize({
      state: stateWithUi,
      specialist: renderedResult.value.specialist,
      responseUiFlags: intent.responseUiFlags,
      actionCodesOverride: renderedResult.value.actionCodes,
      renderedActionsOverride: renderedResult.value.renderedActions,
      contractMetaOverride: renderedResult.value.contractMeta,
      debug: intent.debug,
    });
  }

  const registryById: Record<string, SpecialRouteHandler<TResponse>> = {
    synthetic_dream_pick: {
      id: "synthetic_dream_pick",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
        context.userMessage === deps.dreamPickOneRouteToken,
      handle: async (context) => {
        const previousSpecialist = asRecord((context.state as Record<string, unknown>).last_specialist_result || {});
        const pickedSuggestion = deps.pickDreamSuggestionFromPreviousState(context.state, previousSpecialist);
        if (!pickedSuggestion) return null;

        const specialist = {
          action: "ASK",
          message: deps.wordingSelectionMessage(
            deps.dreamStepId,
            context.state,
            String((context.state as Record<string, unknown>).active_specialist || "")
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

        const forcedDecision = {
          specialist_to_call: deps.dreamSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: ${deps.dreamPickOneRouteToken}`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as Record<string, unknown>).intro_shown_for_step ?? ""),
          intro_shown_session:
            String((context.state as Record<string, unknown>).intro_shown_session ?? "") === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: specialist,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });

        deps.setDreamRuntimeMode(nextState, "self");
        return finalizeRouteTurnIntent(context, {
          state: nextState,
          specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist,
          responseUiFlags: context.responseUiFlags,
        });
      },
    },

    synthetic_role_pick: {
      id: "synthetic_role_pick",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.roleStepId &&
        context.userMessage === deps.roleChooseForMeRouteToken,
      handle: async (context) => {
        const previousSpecialist = asRecord((context.state as Record<string, unknown>).last_specialist_result || {});
        const pickedSuggestion = deps.pickRoleSuggestionFromPreviousState(context.state, previousSpecialist);
        if (!pickedSuggestion) return null;

        const specialist = {
          action: "ASK",
          message: deps.wordingSelectionMessage(
            deps.roleStepId,
            context.state,
            String((context.state as Record<string, unknown>).active_specialist || "")
          ),
          question: "",
          refined_formulation: pickedSuggestion,
          role: pickedSuggestion,
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        };

        const forcedDecision = {
          specialist_to_call: deps.roleSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.roleStepId} | USER_MESSAGE: ${deps.roleChooseForMeRouteToken}`,
          current_step: deps.roleStepId,
          intro_shown_for_step: String((context.state as Record<string, unknown>).intro_shown_for_step ?? ""),
          intro_shown_session:
            String((context.state as Record<string, unknown>).intro_shown_session ?? "") === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: specialist,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });
        return finalizeRouteTurnIntent(context, {
          state: nextState,
          specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist,
          responseUiFlags: context.responseUiFlags,
        });
      },
    },

    presentation_generate: {
      id: "presentation_generate",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.presentationStepId &&
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
              current_step_id: String((context.state as Record<string, unknown>).current_step || ""),
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
                ...(context.state as Record<string, unknown>),
                active_specialist: deps.presentationSpecialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return finalizeRoutePayload(payload as unknown as TResponse);
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
              current_step_id: String((context.state as Record<string, unknown>).current_step || ""),
              active_specialist: deps.presentationSpecialist,
              text: deps.buildTextForWidget({ specialist }),
              prompt: "",
              specialist,
              state: {
                ...(context.state as Record<string, unknown>),
                active_specialist: deps.presentationSpecialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return finalizeRoutePayload(payload as unknown as TResponse);
        }
      },
    },

    dream_submit_scores: {
      id: "dream_submit_scores",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
        String((context.state as Record<string, unknown>).active_specialist || "") === deps.dreamExplainerSpecialist &&
        String(context.userMessage || "").trim().length > 0,
      handle: async (context) => {
        const parsedScores = parseSubmitScoresPayload(context.userMessage, context.transientPendingScores);
        if (!parsedScores || parsedScores.length === 0) return null;

        const lastResult = asRecord((context.state as Record<string, unknown>).last_specialist_result || {});
        const clusters = Array.isArray((lastResult as Record<string, unknown>).clusters) ? ((lastResult as Record<string, unknown>).clusters as unknown[]) : [];

        const statementsFromCanonical = Array.isArray((context.state as Record<string, unknown>).dream_builder_statements)
          ? ((context.state as Record<string, unknown>).dream_builder_statements as unknown[])
          : [];
        const statementsFromLast = Array.isArray((lastResult as Record<string, unknown>).statements)
          ? ((lastResult as Record<string, unknown>).statements as unknown[])
          : [];

        const statements =
          statementsFromCanonical.length > 0
            ? statementsFromCanonical
            : statementsFromLast.length > 0
              ? statementsFromLast
              : Array.isArray((context.state as Record<string, unknown>).dream_scoring_statements)
                ? ((context.state as Record<string, unknown>).dream_scoring_statements as unknown[])
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
            theme: String((cluster as Record<string, unknown>).theme ?? "").trim() || `Category ${clusterIndex + 1}`,
            average,
          };
        });

        const maxAverage = Math.max(...clusterAverages.map((entry) => entry.average), 0);
        const topClusters = clusterAverages.filter((entry) => entry.average === maxAverage && entry.average > 0);

        const nextStateScores: CanvasState = {
          ...context.state,
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
        };

        deps.setDreamRuntimeMode(nextStateScores, "builder_scoring");
        (nextStateScores as Record<string, unknown>).dream_builder_statements = statements;
        (nextStateScores as Record<string, unknown>).dream_scores = parsedScores;
        (nextStateScores as Record<string, unknown>).dream_top_clusters = topClusters;
        (nextStateScores as Record<string, unknown>).dream_awaiting_direction = "true";

        const forcedDecision = {
          specialist_to_call: deps.dreamExplainerSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: (user chose to continue without text)`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as Record<string, unknown>).intro_shown_for_step ?? "").trim() || "dream",
          intro_shown_session:
            String((context.state as Record<string, unknown>).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

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

        if (!callFormulation.ok) return finalizeRoutePayload(callFormulation.payload);
        deps.rememberLlmCall(callFormulation.value);

        const formulationResult = callFormulation.value.specialistResult;
        const nextStateFormulation = deps.applyStateUpdate({
          prev: nextStateScores,
          decision: forcedDecision,
          specialistResult: formulationResult,
          showSessionIntroUsed: "false",
          provisionalSource: "system_generated",
        });

        (nextStateFormulation as Record<string, unknown>).dream_builder_statements = statements;
        deps.setDreamRuntimeMode(nextStateFormulation, "builder_refine");
        (nextStateFormulation as Record<string, unknown>).dream_awaiting_direction = "false";
        return finalizeRouteTurnIntent(context, {
          state: nextStateFormulation,
          specialist: asRecord((nextStateFormulation as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
          responseUiFlags: context.responseUiFlags,
          debug: {
            submit_scores_handled: true,
            formulation_direct: true,
            top_cluster_count: topClusters.length,
          },
        });
      },
    },

    dream_switch_to_self: {
      id: "dream_switch_to_self",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
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

          let nextState: CanvasState = {
            ...switchBaseState,
            active_specialist: deps.dreamSpecialist,
            last_specialist_result: specialist,
          };

          deps.setDreamRuntimeMode(nextState, "self");
          (nextState as Record<string, unknown>).dream_awaiting_direction = "false";

          deps.applyUiPhaseByStep(
            nextState,
            deps.dreamStepId,
            deps.buildContractId(deps.dreamStepId, "no_output", "DREAM_MENU_INTRO")
          );
          return finalizeRouteTurnIntent(context, {
            state: nextState,
            specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
            previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
            responseUiFlags: context.responseUiFlags,
          });
        }

        (context.state as Record<string, unknown>).intro_shown_for_step = "dream";
        const forcedDecision = {
          specialist_to_call: deps.dreamSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: I want to write my dream in my own words.`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: "dream",
          intro_shown_session:
            String((context.state as Record<string, unknown>).intro_shown_session ?? "").trim() === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

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

        if (!callDream.ok) return finalizeRoutePayload(callDream.payload);
        deps.rememberLlmCall(callDream.value);

        let nextState = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: callDream.value.specialistResult,
          showSessionIntroUsed: "false",
          provisionalSource: "system_generated",
        });

        deps.setDreamRuntimeMode(nextState, "self");
        return finalizeRouteTurnIntent(context, {
          state: nextState,
          specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
          responseUiFlags: context.responseUiFlags,
        });
      },
    },

    start_prestart: {
      id: "start_prestart",
      canHandle: (context) => {
        const startedAtTrigger = String((context.state as Record<string, unknown>).started ?? "").trim().toLowerCase() === "true";
        const currentStep = String((context.state as Record<string, unknown>).current_step || "");
        const introShown = String((context.state as Record<string, unknown>).intro_shown_session || "");
        const lastSpecialist = asRecord((context.state as Record<string, unknown>).last_specialist_result || {});
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
        const startedAtTrigger = String((context.state as Record<string, unknown>).started ?? "").trim().toLowerCase() === "true";
        const currentStep = String((context.state as Record<string, unknown>).current_step || "");
        const introShown = String((context.state as Record<string, unknown>).intro_shown_session || "");
        const lastSpecialist = asRecord((context.state as Record<string, unknown>).last_specialist_result || {});
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

        const initialUserMessageSeed = String((context.state as Record<string, unknown>).initial_user_message ?? "").trim();
        const startLocaleSeedText = initialUserMessageSeed || context.userMessage;

        if (shouldReturnPrestartGate) {
          const startResolution = await deps.ensureStartState(context.state, startLocaleSeedText);
          const stateWithUi = startResolution.state;
          const uiStrings = asRecord((stateWithUi as Record<string, unknown>).ui_strings);
          const startHint =
            typeof uiStrings.startHint === "string"
              ? String(uiStrings.startHint)
              : deps.uiDefaultString("startHint", "Click Start in the widget to begin.");

          const specialist = {
            action: "ASK",
            message: "",
            question: startHint,
            refined_formulation: "",
            business_name: (context.state as Record<string, unknown>).business_name || "TBD",
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
              current_step_id: String((context.state as Record<string, unknown>).current_step || ""),
              active_specialist: deps.step0Specialist,
              text: "",
              prompt: specialist.question,
              specialist,
              state: {
                ...(stateWithUi as Record<string, unknown>),
                started: "false",
                active_specialist: deps.step0Specialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return finalizeRoutePayload(payload as unknown as TResponse);
        }

        (context.state as Record<string, unknown>).intro_shown_session = "true";
        const step0Final = String((context.state as Record<string, unknown>).step_0_final ?? "").trim();

        if (step0Final) {
          const startResolution = await deps.ensureStartState(context.state, startLocaleSeedText);
          const stateWithUi = startResolution.state;
          const parsed = deps.parseStep0Final(step0Final, String((stateWithUi as Record<string, unknown>).business_name || "TBD"));
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
              current_step_id: String((context.state as Record<string, unknown>).current_step || ""),
              active_specialist: deps.step0Specialist,
              text: "",
              prompt: specialist.question,
              specialist,
              state: {
                ...(stateWithUi as Record<string, unknown>),
                started: startResolution.interactiveReady ? "true" : "false",
                active_specialist: deps.step0Specialist,
                last_specialist_result: specialist,
              },
            },
            specialist,
            context.responseUiFlags
          );

          return finalizeRoutePayload(payload as unknown as TResponse);
        }

        const initialMsg = String((context.state as Record<string, unknown>).initial_user_message ?? "").trim();
        const langSeed = initialMsg || context.userMessage;
        const startResolution = await deps.ensureStartState(context.state, langSeed);
        const stateWithUi = startResolution.state;

        const specialist = {
          action: "ASK",
          message: deps.step0CardDescForState(stateWithUi),
          question: deps.step0QuestionForState(stateWithUi),
          refined_formulation: "",
          business_name: (stateWithUi as Record<string, unknown>).business_name || "TBD",
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
            current_step_id: String((stateWithUi as Record<string, unknown>).current_step || ""),
            active_specialist: deps.step0Specialist,
            text: specialist.message,
            prompt: specialist.question,
            specialist,
            state: {
              ...(stateWithUi as Record<string, unknown>),
              started: startResolution.interactiveReady ? "true" : "false",
              active_specialist: deps.step0Specialist,
              last_specialist_result: specialist,
            },
          },
          specialist,
          context.responseUiFlags
        );

        return finalizeRoutePayload(payload as unknown as TResponse);
      },
    },

    dream_start_exercise: {
      id: "dream_start_exercise",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
        context.userMessage === deps.dreamStartExerciseRouteToken,
      handle: async (context) => {
        deps.setDreamRuntimeMode(context.state, "builder_collect");

        const forcedDecision = {
          specialist_to_call: deps.dreamExplainerSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: ${context.userMessage}`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((context.state as Record<string, unknown>).intro_shown_for_step ?? ""),
          intro_shown_session:
            (context.state as Record<string, unknown>).intro_shown_session === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

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

        if (!callDreamExplainer.ok) return finalizeRoutePayload(callDreamExplainer.payload);
        deps.rememberLlmCall(callDreamExplainer.value);

        const nextStateDream = deps.applyStateUpdate({
          prev: context.state,
          decision: forcedDecision,
          specialistResult: callDreamExplainer.value.specialistResult,
          showSessionIntroUsed: "false",
          provisionalSource: "action_route",
        });

        if (Array.isArray(callDreamExplainer.value.specialistResult?.statements)) {
          (nextStateDream as Record<string, unknown>).dream_builder_statements =
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
        return finalizeRouteTurnIntent(context, {
          state: nextStateDream,
          specialist: asRecord((nextStateDream as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
          responseUiFlags: context.responseUiFlags,
          debug: {
            decision: forcedDecision,
            attempts: callDreamExplainer.value.attempts,
            language: context.lang,
            meta_user_message_ignored: false,
          },
        });
      },
    },
  };

  const orderedHandlers = ROUTE_REGISTRY_ORDER.map((id) => registryById[id]);

  async function handleSpecialRouteRegistry(context: RunStepContext): Promise<TResponse | null> {
    const routeContext = toRouteRegistryRequest(context);
    for (const handler of orderedHandlers) {
      if (!handler) continue;
      if (!handler.canHandle(routeContext)) continue;
      const response = await handler.handle(routeContext);
      if (response) return response;
    }
    return null;
  }

  return {
    routeRegistryOrder: [...ROUTE_REGISTRY_ORDER],
    handleSpecialRouteRegistry,
  };
}
