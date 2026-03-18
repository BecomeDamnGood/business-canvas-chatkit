import { z } from "zod";

import type { OrchestratorOutput } from "../core/orchestrator.js";
import {
  getFinalFieldForStepId,
  type CanvasState,
} from "../core/state.js";
import { buildUiContractId } from "../core/ui_contract_id.js";
import {
  getChooseForMeRegistryEntry,
  type StepRegistryChooseForMeField as ChooseForMeField,
} from "../steps/step_registry.js";
import {
  type RunStepContext,
  type RunStepRouteRegistryRequest,
  toRouteRegistryRequest,
} from "./run_step_context.js";
import {
  type RunStepRenderedRouteOutput,
  type RunStepRoutePorts,
} from "./run_step_ports.js";
import type { TurnResponseRenderFailureContext } from "./run_step_turn_response_engine.js";
import { canonicalPresentationRecapForState } from "./run_step_presentation_recap.js";
import {
  createStructuredLogContextFromState,
  logStructuredEvent,
} from "./run_step_response.js";
import { STEP_0_BOOTSTRAP_SPECIALIST } from "../steps/step_0_bootstrap.js";
import { getDreamBuilderResumeContext } from "./dream_builder_resume.js";
import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";

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
  & RunStepRoutePorts<TResponse>["i18n"];

type SpecialRouteHandler<TResponse> = {
  id: string;
  canHandle: (context: RouteRegistryContext) => boolean;
  handle: (context: RouteRegistryContext) => Promise<TResponse | null>;
};

const ROUTE_REGISTRY_ORDER = [
  "synthetic_dream_pick",
  "synthetic_purpose_pick",
  "synthetic_bigwhy_pick",
  "synthetic_role_pick",
  "synthetic_entity_pick",
  "synthetic_strategy_pick",
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
    ...ports.i18n,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function sanitizeStep0SeedToken(raw: unknown, fallback = ""): string {
  const value = String(raw || "")
    .replace(/[|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || String(fallback || "").trim();
}

function numericTurnIndex(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

const SubmitScoresPayloadSchema = z.object({
  action: z.literal("submit_scores"),
  scores: z.array(z.array(z.number().finite())),
});

function parseSubmitScoresPayload(
  userMessage: string,
  transientPendingScores: number[][] | null,
  actionCodeRaw = ""
): number[][] | null {
  const normalizedUserMessage = String(userMessage || "").trim();
  const normalizedActionCode = String(actionCodeRaw || "").trim().toUpperCase();
  if (
    normalizedActionCode === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES" ||
    normalizedUserMessage === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES"
  ) {
    return Array.isArray(transientPendingScores) ? transientPendingScores : null;
  }
  if (!normalizedUserMessage) return null;
  try {
    const parsed = JSON.parse(normalizedUserMessage) as unknown;
    const parsedPayload = SubmitScoresPayloadSchema.safeParse(parsed);
    if (!parsedPayload.success) return null;
    return parsedPayload.data.scores;
  } catch {
    return null;
  }
  return null;
}

function areScoresCompleteForClusters(
  scores: number[][],
  clusters: Array<{ statement_indices: number[] }>
): boolean {
  if (!Array.isArray(scores) || scores.length !== clusters.length) return false;
  return clusters.every((cluster, clusterIndex) => {
    const row = Array.isArray(scores[clusterIndex]) ? scores[clusterIndex] : [];
    return (
      row.length === cluster.statement_indices.length &&
      row.every((value) => Number.isFinite(value) && value >= 1 && value <= 10)
    );
  });
}

function clearDreamStateForSwitchToSelf(state: CanvasState, dreamStepId: string): CanvasState {
  const next: CanvasState = { ...state };
  const finalField = getFinalFieldForStepId(dreamStepId);
  if (finalField) {
    (next as Record<string, unknown>)[finalField] = "";
  }
  const provisionalByStep =
    next && typeof (next as any).provisional_by_step === "object" && (next as any).provisional_by_step !== null
      ? { ...((next as any).provisional_by_step as Record<string, unknown>) }
      : {};
  if (Object.prototype.hasOwnProperty.call(provisionalByStep, dreamStepId)) {
    delete provisionalByStep[dreamStepId];
  }
  (next as Record<string, unknown>).provisional_by_step = provisionalByStep;

  const provisionalSourceByStep =
    next &&
    typeof (next as any).provisional_source_by_step === "object" &&
    (next as any).provisional_source_by_step !== null
      ? { ...((next as any).provisional_source_by_step as Record<string, unknown>) }
      : {};
  if (Object.prototype.hasOwnProperty.call(provisionalSourceByStep, dreamStepId)) {
    delete provisionalSourceByStep[dreamStepId];
  }
  (next as Record<string, unknown>).provisional_source_by_step = provisionalSourceByStep;
  return next;
}

function provisionalValueForStep(state: CanvasState, stepId: string): string {
  const raw =
    state &&
    typeof (state as Record<string, unknown>).provisional_by_step === "object" &&
    (state as Record<string, unknown>).provisional_by_step !== null
      ? ((state as Record<string, unknown>).provisional_by_step as Record<string, unknown>)
      : {};
  return String(raw[stepId] || "").trim();
}

function presentationPersistentRecapValue(
  state: CanvasState,
  previousSpecialist: Record<string, unknown>,
  presentationStepId: string
): string {
  const previousBrief = String(previousSpecialist.presentation_brief || "").trim();
  const provisional = provisionalValueForStep(state, presentationStepId);
  const finalField = getFinalFieldForStepId(presentationStepId);
  const finalValue = finalField ? String((state as Record<string, unknown>)[finalField] || "").trim() : "";
  return canonicalPresentationRecapForState(state, previousBrief || provisional || finalValue);
}

function withPresentationRecapProvisional(
  state: CanvasState,
  presentationStepId: string,
  recap: string
): CanvasState {
  const trimmed = String(recap || "").trim();
  if (!trimmed) return state;
  const provisionalByStep =
    state &&
    typeof (state as Record<string, unknown>).provisional_by_step === "object" &&
    (state as Record<string, unknown>).provisional_by_step !== null
      ? { ...((state as Record<string, unknown>).provisional_by_step as Record<string, unknown>) }
      : {};
  provisionalByStep[presentationStepId] = trimmed;
  const provisionalSourceByStep =
    state &&
    typeof (state as Record<string, unknown>).provisional_source_by_step === "object" &&
    (state as Record<string, unknown>).provisional_source_by_step !== null
      ? { ...((state as Record<string, unknown>).provisional_source_by_step as Record<string, unknown>) }
      : {};
  provisionalSourceByStep[presentationStepId] = "action_route";
  return {
    ...state,
    provisional_by_step: provisionalByStep as Record<string, string>,
    provisional_source_by_step: provisionalSourceByStep as CanvasState["provisional_source_by_step"],
  };
}

type ChooseForMeConfig = {
  routeId: string;
  token: string;
  specialistToCall: string;
  stepId: string;
  field: ChooseForMeField;
};

function parseMenuIdFromContractId(contractIdRaw: unknown): string {
  const parts = String(contractIdRaw || "").trim().split(":");
  return String(parts[2] || "").trim().toUpperCase();
}

function currentMenuIdForStep(state: CanvasState, stepId: string): string {
  const phaseByStep =
    state &&
    typeof (state as Record<string, unknown>).__ui_phase_by_step === "object" &&
    (state as Record<string, unknown>).__ui_phase_by_step !== null
      ? ((state as Record<string, unknown>).__ui_phase_by_step as Record<string, unknown>)
      : {};
  const fromPhase = parseMenuIdFromContractId(phaseByStep[stepId]);
  if (fromPhase) return fromPhase;
  const last = asRecord((state as Record<string, unknown>).last_specialist_result || {});
  return parseMenuIdFromContractId(last.ui_contract_id);
}

function suggestionStateForStep(
  state: CanvasState,
  stepId: string
): { items: string[]; mode: string; valid_for_action_codes: string[] } | null {
  const raw =
    state &&
    typeof (state as Record<string, unknown>).suggestion_state_by_step === "object" &&
    (state as Record<string, unknown>).suggestion_state_by_step !== null
      ? ((state as Record<string, unknown>).suggestion_state_by_step as Record<string, unknown>)
      : {};
  const entry = raw[stepId];
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? (record.items as unknown[]).map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const valid_for_action_codes = Array.isArray(record.valid_for_action_codes)
    ? (record.valid_for_action_codes as unknown[]).map((value) => String(value || "").trim().toUpperCase()).filter(Boolean)
    : [];
  const mode = String(record.mode || "").trim();
  if (items.length === 0 || valid_for_action_codes.length === 0) return null;
  return { items, mode, valid_for_action_codes };
}

function strategyStatementsFromSelectedValue(value: string): string[] {
  return String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/^\s*(?:[-*•]|\d+[\).])\s*/, "").trim())
    .filter(Boolean);
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
          message: resolveUiStringForState(params.state as Record<string, unknown>, "runtime.error.contract_violation"),
          reason: params.reason,
          step: String(params.stepId || ""),
          contract_id: params.rendered.contractId,
        },
      },
      params.rendered.specialist
    );
  }

  function buildInvalidInteractiveStatePayload(params: {
    state: CanvasState;
    stepId: string;
    activeSpecialist: string;
    message: string;
    retryAction: string;
    details: Record<string, unknown>;
  }): TResponse {
    return deps.attachRegistryPayload(
      {
        ok: false as const,
        tool: "run_step" as const,
        current_step_id: String(params.stepId),
        active_specialist: String(params.activeSpecialist || ""),
        text: params.message,
        prompt: "",
        specialist: {
          action: "ASK",
          message: params.message,
          question: "",
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        },
        state: params.state,
        error: {
          type: "invalid_state",
          category: "contract",
          severity: "fatal",
          retryable: false,
          message: params.message,
          retry_action: params.retryAction,
          required_action: params.retryAction,
          details: params.details,
        },
      },
      {}
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
      onContractViolation: ({ state, stepId, activeSpecialist, rendered, reason }: TurnResponseRenderFailureContext) =>
        buildRenderedContractViolationPayload({
          state,
          stepId,
          activeSpecialist,
          rendered: rendered as unknown as RenderedRouteOutput,
          reason,
        }),
    });
    if (!renderedResult.ok) return renderedResult.payload;

    const stateWithUi = await deps.ensureUiStrings(
      renderedResult.value.state,
      String(context.actionCodeRaw || context.userMessage || "")
    );

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

  async function finalizeRenderedRoutePayload(
    context: RouteRegistryContext,
    intent: RouteTurnIntent,
    payloadExtras?: Record<string, unknown>
  ): Promise<TResponse> {
    const renderedResult = deps.turnResponseEngine.renderValidateRecover({
      state: intent.state,
      specialist: intent.specialist,
      previousSpecialist: intent.previousSpecialist,
      telemetry: context.uiI18nTelemetry,
      onContractViolation: ({ state, stepId, activeSpecialist, rendered, reason }: TurnResponseRenderFailureContext) =>
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

    return finalizeRoutePayload(
      deps.attachRegistryPayload(
        {
          ok: true as const,
          tool: "run_step" as const,
          current_step_id: String((stateWithUi as Record<string, unknown>).current_step || ""),
          active_specialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
          text: deps.buildTextForWidget({ specialist: renderedResult.value.specialist, state: stateWithUi }),
          prompt: deps.pickPrompt(renderedResult.value.specialist),
          specialist: renderedResult.value.specialist,
          state: stateWithUi,
          ...(payloadExtras || {}),
        },
        renderedResult.value.specialist,
        context.responseUiFlags,
        renderedResult.value.actionCodes,
        renderedResult.value.renderedActions,
        null,
        renderedResult.value.contractMeta
      )
    );
  }

  function createSyntheticChooseForMeHandler(config: ChooseForMeConfig): SpecialRouteHandler<TResponse> {
    return {
      id: config.routeId,
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === config.stepId &&
        context.userMessage === config.token,
      handle: async (context) => {
        const chooseForMeEntry = getChooseForMeRegistryEntry(config.stepId);
        if (!chooseForMeEntry) return null;
        const stateWithUi = await deps.ensureUiStrings(context.state, context.userMessage);
        const previousSpecialist = asRecord(
          (stateWithUi as Record<string, unknown>).last_specialist_result || {}
        );
        const currentMenuId = currentMenuIdForStep(stateWithUi, config.stepId);
        const suggestionState = suggestionStateForStep(stateWithUi, config.stepId);
        if (
          currentMenuId !== chooseForMeEntry.chooseForMe.menuId ||
          !suggestionState ||
          !suggestionState.valid_for_action_codes.includes(chooseForMeEntry.chooseForMe.actionCode) ||
          suggestionState.items.length === 0
        ) {
          return buildInvalidInteractiveStatePayload({
            state: stateWithUi,
            stepId: config.stepId,
            activeSpecialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
            message: resolveUiStringForState(
              stateWithUi as Record<string, unknown>,
              "runtime.error.choose_for_me.invalid_snapshot"
            ),
            retryAction: chooseForMeEntry.chooseForMe.actionCode,
            details: {
              reason: "missing_or_mismatched_suggestion_snapshot",
              current_menu_id: currentMenuId,
              expected_menu_id: chooseForMeEntry.chooseForMe.menuId,
              expected_action_code: chooseForMeEntry.chooseForMe.actionCode,
              has_suggestion_state: Boolean(suggestionState),
              valid_for_action_codes: suggestionState?.valid_for_action_codes || [],
              item_count: suggestionState?.items.length || 0,
            },
          });
        }

        const pickedSuggestion = String(suggestionState.items[0] || "").trim();
        if (!pickedSuggestion) {
          return buildInvalidInteractiveStatePayload({
            state: stateWithUi,
            stepId: config.stepId,
            activeSpecialist: String((stateWithUi as Record<string, unknown>).active_specialist || ""),
            message: resolveUiStringForState(
              stateWithUi as Record<string, unknown>,
              "runtime.error.choose_for_me.empty_suggestion"
            ),
            retryAction: chooseForMeEntry.chooseForMe.actionCode,
            details: {
              reason: "empty_first_suggestion",
              current_menu_id: currentMenuId,
              expected_menu_id: chooseForMeEntry.chooseForMe.menuId,
              expected_action_code: chooseForMeEntry.chooseForMe.actionCode,
            },
          });
        }

        const specialist: Record<string, unknown> = {
          action: "ASK",
          message: deps.wordingSelectionMessage(
            config.stepId,
            stateWithUi,
            String((stateWithUi as Record<string, unknown>).active_specialist || ""),
            pickedSuggestion
          ),
          question: "",
          refined_formulation: pickedSuggestion,
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
          [config.field]: pickedSuggestion,
        };
        if (config.field === "strategy") {
          specialist.statements = strategyStatementsFromSelectedValue(pickedSuggestion);
        }

        const forcedDecision = {
          specialist_to_call: config.specialistToCall,
          specialist_input: `CURRENT_STEP_ID: ${config.stepId} | USER_MESSAGE: ${config.token}`,
          current_step: config.stepId,
          intro_shown_for_step: String((stateWithUi as Record<string, unknown>).intro_shown_for_step ?? ""),
          intro_shown_session:
            String((stateWithUi as Record<string, unknown>).intro_shown_session ?? "") === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

        const nextState = deps.applyPostSpecialistStateMutations({
          prevState: stateWithUi,
          decision: forcedDecision,
          specialistResult: specialist,
          provisionalSource: "action_route",
        });
        return finalizeRouteTurnIntent(context, {
          state: nextState,
          specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist,
          responseUiFlags: context.responseUiFlags,
        });
      },
    };
  }

  const registryById: Record<string, SpecialRouteHandler<TResponse>> = {
    synthetic_dream_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_dream_pick",
      token: deps.dreamPickOneRouteToken,
      specialistToCall: deps.dreamSpecialist,
      stepId: deps.dreamStepId,
      field: "dream",
    }),
    synthetic_purpose_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_purpose_pick",
      token: deps.purposeChooseForMeRouteToken,
      specialistToCall: deps.purposeSpecialist,
      stepId: deps.purposeStepId,
      field: "purpose",
    }),
    synthetic_bigwhy_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_bigwhy_pick",
      token: deps.bigWhyChooseForMeRouteToken,
      specialistToCall: deps.bigwhySpecialist,
      stepId: "bigwhy",
      field: "bigwhy",
    }),
    synthetic_role_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_role_pick",
      token: deps.roleChooseForMeRouteToken,
      specialistToCall: deps.roleSpecialist,
      stepId: deps.roleStepId,
      field: "role",
    }),
    synthetic_entity_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_entity_pick",
      token: deps.entityChooseForMeRouteToken,
      specialistToCall: deps.entitySpecialist,
      stepId: "entity",
      field: "entity",
    }),
    synthetic_strategy_pick: createSyntheticChooseForMeHandler({
      routeId: "synthetic_strategy_pick",
      token: deps.strategyChooseForMeRouteToken,
      specialistToCall: deps.strategySpecialist,
      stepId: deps.strategyStepId,
      field: "strategy",
    }),

    presentation_generate: {
      id: "presentation_generate",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.presentationStepId &&
        context.userMessage === deps.presentationMakeRouteToken,
      handle: async (context) => {
        const previousSpecialist = asRecord(
          (context.state as Record<string, unknown>).last_specialist_result || {}
        );
        const persistentRecap = presentationPersistentRecapValue(
          context.state,
          previousSpecialist,
          deps.presentationStepId
        );
        try {
          const assets = deps.generatePresentationAssets(context.state);
          logStructuredEvent(
            "info",
            "app_usage_presentation_generated",
            createStructuredLogContextFromState(context.state, {
              step_id: deps.presentationStepId,
            }),
            {
              analytics_schema: "bsc_app_usage_v1",
              session_turn_index: numericTurnIndex((context.state as Record<string, unknown>).__session_turn_index),
              output_formats: ["pptx", "pdf", "png"],
            }
          );

          const message = deps.uiStringFromStateMap(
            context.state,
            "presentation.ready",
            deps.uiDefaultString("presentation.ready")
          );

          const specialist = {
            action: "ASK",
            message,
            question: "",
            refined_formulation: persistentRecap,
            presentation_brief: persistentRecap,
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };
          const nextState: CanvasState = {
            ...context.state,
            active_specialist: deps.presentationSpecialist,
          };
          const nextStateWithRecap = withPresentationRecapProvisional(
            nextState,
            deps.presentationStepId,
            persistentRecap
          );
          (nextStateWithRecap as Record<string, unknown>).presentation_asset_pdf_url = assets.pdfUrl;
          (nextStateWithRecap as Record<string, unknown>).presentation_asset_png_url = assets.pngUrl;
          (nextStateWithRecap as Record<string, unknown>).presentation_asset_base_name = assets.baseName;
          (nextStateWithRecap as Record<string, unknown>).presentation_asset_fingerprint = assets.assetFingerprint;

          return finalizeRenderedRoutePayload(
            context,
            {
              state: nextStateWithRecap,
              specialist,
              previousSpecialist,
              responseUiFlags: context.responseUiFlags,
            },
            {
              presentation_assets: {
                pdf_url: assets.pdfUrl,
                png_url: assets.pngUrl,
                base_name: assets.baseName,
              },
            }
          );
        } catch {
          logStructuredEvent(
            "warn",
            "app_usage_presentation_generation_failed",
            createStructuredLogContextFromState(context.state, {
              step_id: deps.presentationStepId,
            }),
            {
              analytics_schema: "bsc_app_usage_v1",
              session_turn_index: numericTurnIndex((context.state as Record<string, unknown>).__session_turn_index),
              failure_stage: "asset_generation",
            }
          );
          console.error("[presentation] Generation failed");

          const message = deps.uiStringFromStateMap(
            context.state,
            "presentation.error",
            deps.uiDefaultString("presentation.error", "")
          );

          const specialist = {
            action: "ASK",
            message,
            question: "",
            refined_formulation: persistentRecap,
            presentation_brief: persistentRecap,
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };
          const nextState: CanvasState = {
            ...context.state,
            active_specialist: deps.presentationSpecialist,
          };
          const nextStateWithRecap = withPresentationRecapProvisional(
            nextState,
            deps.presentationStepId,
            persistentRecap
          );

          return finalizeRenderedRoutePayload(context, {
            state: nextStateWithRecap,
            specialist,
            previousSpecialist,
            responseUiFlags: context.responseUiFlags,
          });
        }
      },
    },

    dream_submit_scores: {
      id: "dream_submit_scores",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
        String((context.state as Record<string, unknown>).active_specialist || "") === deps.dreamExplainerSpecialist &&
        (
          String(context.actionCodeRaw || "").trim().toUpperCase() === "ACTION_DREAM_EXPLAINER_SUBMIT_SCORES" ||
          parseSubmitScoresPayload(
            context.userMessage,
            context.transientPendingScores,
            context.actionCodeRaw
          ) !== null
        ),
      handle: async (context) => {
        const parsedScores = parseSubmitScoresPayload(
          context.userMessage,
          context.transientPendingScores,
          context.actionCodeRaw
        );
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
        if (!areScoresCompleteForClusters(parsedScores, clusters as Array<{ statement_indices: number[] }>)) {
          return finalizeRouteTurnIntent(context, {
            state: context.state,
            specialist: lastResult,
            previousSpecialist: lastResult,
            responseUiFlags: context.responseUiFlags,
            debug: {
              submit_scores_rejected: true,
              reason: "incomplete_or_invalid_scores",
            },
          });
        }

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
        const topClusterDetails = (clusters as ClusterInfo[])
          .map((cluster, clusterIndex) => {
            const row = parsedScores[clusterIndex] || [];
            const maxScore = Math.max(...row, 0);
            const topStatementIndices = cluster.statement_indices.filter((_, statementIndex) => row[statementIndex] === maxScore);
            if (maxScore <= 0 || topStatementIndices.length === 0) return null;
            return {
              theme: String((cluster as Record<string, unknown>).theme ?? "").trim() || `Category ${clusterIndex + 1}`,
              average: clusterAverages[clusterIndex]?.average || 0,
              top_statement_indices: topStatementIndices,
              top_statements: topStatementIndices
                .map((statementIndex) => String(statements[statementIndex] || "").trim())
                .filter(Boolean),
            };
          })
          .filter(
            (entry): entry is {
              theme: string;
              average: number;
              top_statement_indices: number[];
              top_statements: string[];
            } => Boolean(entry)
          )
          .filter((entry) => topClusters.some((cluster) => cluster.theme === entry.theme));

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

        deps.setDreamRuntimeMode(nextStateScores, "builder_refine");
        (nextStateScores as Record<string, unknown>).dream_builder_statements = statements;
        (nextStateScores as Record<string, unknown>).dream_scoring_statements = statements;
        (nextStateScores as Record<string, unknown>).dream_scores = parsedScores;
        (nextStateScores as Record<string, unknown>).dream_top_clusters = topClusters;
        (nextStateScores as Record<string, unknown>).dream_top_cluster_details = topClusterDetails;
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
        const nextStateFormulation = deps.applyPostSpecialistStateMutations({
          prevState: nextStateScores,
          decision: forcedDecision,
          specialistResult: formulationResult,
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
        let switchBaseState = deps.isUiStateHygieneSwitchV1Enabled()
          ? deps.clearStepInteractiveState(context.state, deps.dreamStepId)
          : context.state;

        if (switchBaseState !== context.state) {
          deps.bumpUiI18nCounter(context.uiI18nTelemetry, "state_hygiene_resets_count");
        }

        switchBaseState = clearDreamStateForSwitchToSelf(switchBaseState, deps.dreamStepId);
        deps.setDreamRuntimeMode(switchBaseState, "self");

        const switchHeadline = deps.uiStringFromStateMap(
          switchBaseState,
          "dreamBuilder.switchSelf.headline",
          deps.uiDefaultString("dreamBuilder.switchSelf.headline")
        );
        const switchIntro = deps.uiStringFromStateMap(
          switchBaseState,
          "dreamBuilder.switchSelf.body.intro",
          deps.uiDefaultString("dreamBuilder.switchSelf.body.intro")
        );
        const switchHelper = deps.uiStringFromStateMap(
          switchBaseState,
          "dreamBuilder.switchSelf.body.helper",
          deps.uiDefaultString("dreamBuilder.switchSelf.body.helper")
        );
        const switchMessage = [switchHeadline, switchIntro, switchHelper]
          .map((line) => String(line || "").trim())
          .filter(Boolean)
          .join("\n\n");

        const specialist = {
          action: "ASK",
          message: switchMessage,
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
          intro_shown_for_step: deps.dreamStepId,
          last_specialist_result: specialist,
        };

        deps.setDreamRuntimeMode(nextState, "self");
        (nextState as Record<string, unknown>).dream_awaiting_direction = "false";

        deps.applyUiPhaseByStep(
          nextState,
          deps.dreamStepId,
          buildUiContractId(deps.dreamStepId, "no_output", "DREAM_MENU_INTRO")
        );
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
          context.actionCodeRaw === "ACTION_START" &&
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
          context.actionCodeRaw === "ACTION_START" &&
          currentStep === deps.step0Id &&
          introShown !== "true" &&
          (!hasLastSpecialist || allowStartActionWithSnapshot);

        if (!shouldReturnPrestartGate && !isStartTrigger) return null;

        const initialUserMessageSeed = String((context.state as Record<string, unknown>).initial_user_message ?? "").trim();
        const startLocaleSeedText = initialUserMessageSeed || context.userMessage;
        const step0FinalField = getFinalFieldForStepId(deps.step0Id) || "step_0_final";

        const maybeHydrateBootstrapFromStep0Specialist = async (persistFinal: boolean): Promise<string> => {
          const currentBootstrap = asRecord((context.state as Record<string, unknown>).step0_bootstrap || {});
          const hasBootstrap =
            sanitizeStep0SeedToken(currentBootstrap.venture, "") !== "" &&
            sanitizeStep0SeedToken(currentBootstrap.name, "") !== "";
          if (hasBootstrap) return "";
          if (!initialUserMessageSeed) return "";

          const bootstrapDecision = {
            specialist_to_call: STEP_0_BOOTSTRAP_SPECIALIST,
            specialist_input: initialUserMessageSeed,
            current_step: deps.step0Id,
            intro_shown_for_step:
              String((context.state as Record<string, unknown>).intro_shown_for_step ?? "").trim() || deps.step0Id,
            intro_shown_session:
              String((context.state as Record<string, unknown>).intro_shown_session ?? "").trim() === "true"
                ? "true"
                : "false",
            show_step_intro: "false",
            show_session_intro: "false",
          } as unknown as OrchestratorOutput;
          const bootstrapCall = await deps.callSpecialistStrictSafe(
            {
              model: context.model,
              state: context.state,
              decision: bootstrapDecision,
              userMessage: initialUserMessageSeed,
            },
            deps.buildRoutingContext(initialUserMessageSeed),
            context.state
          );
          if (!bootstrapCall.ok) return "";

          deps.rememberLlmCall(bootstrapCall.value);
          const bootstrapResult = asRecord(bootstrapCall.value.specialistResult || {});
          const recognized = bootstrapResult.recognized === true ||
            String(bootstrapResult.recognized || "").trim().toLowerCase() === "true";
          if (!recognized) return "";
          const seededVenture = sanitizeStep0SeedToken(bootstrapResult.venture, "");
          const seededName = sanitizeStep0SeedToken(bootstrapResult.name, "");
          if (!seededVenture || !seededName) return "";
          const seededStatus =
            String(bootstrapResult.status || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
          const canonicalStep0Final = `Venture: ${seededVenture} | Name: ${seededName || "TBD"} | Status: ${seededStatus}`;
          if (seededName && seededName.toLowerCase() !== "tbd") {
            (context.state as Record<string, unknown>).business_name = seededName;
          }
          (context.state as Record<string, unknown>).step0_bootstrap = {
            venture: seededVenture,
            name: seededName || "TBD",
            status: seededStatus,
            source: "initial_user_message",
          };
          if (persistFinal) {
            (context.state as Record<string, unknown>)[step0FinalField] = canonicalStep0Final;
          }
          return canonicalStep0Final;
        };

        if (shouldReturnPrestartGate) {
          await maybeHydrateBootstrapFromStep0Specialist(false);
          const startResolution = await deps.ensureStartState(context.state, startLocaleSeedText);
          const stateWithUi = startResolution.state;
          const uiStrings = asRecord((stateWithUi as Record<string, unknown>).ui_strings);
          const startHint =
            typeof uiStrings.startHint === "string"
              ? String(uiStrings.startHint)
              : deps.uiDefaultString("startHint");

          const specialist = {
            action: "ASK",
            message: "",
            question: startHint,
            refined_formulation: "",
            business_name: (context.state as Record<string, unknown>).business_name || "TBD",
            step_0: "",
            step0_interaction_state: "step0_ready",
            is_mutable: false,
            editable_fields: [],
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
        let step0Final = String((context.state as Record<string, unknown>)[step0FinalField] ?? "").trim();
        if (!step0Final) {
          const rawBootstrap = asRecord((context.state as Record<string, unknown>).step0_bootstrap || {});
          const bootstrapVenture = sanitizeStep0SeedToken(rawBootstrap.venture, "");
          const bootstrapName = sanitizeStep0SeedToken(rawBootstrap.name, "");
          const bootstrapStatus =
            String(rawBootstrap.status || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
          const hasBootstrap = bootstrapVenture !== "" && bootstrapName !== "";
          if (hasBootstrap) {
            step0Final = `Venture: ${bootstrapVenture} | Name: ${bootstrapName} | Status: ${bootstrapStatus}`;
            (context.state as Record<string, unknown>)[step0FinalField] = step0Final;
            (context.state as Record<string, unknown>).business_name = bootstrapName;
          }
        }
        if (!step0Final) {
          const initialMsg = String((context.state as Record<string, unknown>).initial_user_message ?? "").trim();
          const seed = deps.inferStep0SeedFromInitialMessage(initialMsg || context.userMessage);
          if (seed) {
            const seededVenture = sanitizeStep0SeedToken(seed.venture, "business");
            const seededName = sanitizeStep0SeedToken(
              seed.name,
              String((context.state as Record<string, unknown>).business_name || "TBD")
            );
            const seededStatus =
              String(seed.status || "").trim().toLowerCase() === "existing" ? "existing" : "starting";
            step0Final = `Venture: ${seededVenture} | Name: ${seededName || "TBD"} | Status: ${seededStatus}`;
            (context.state as Record<string, unknown>)[step0FinalField] = step0Final;
            if (seededName && seededName.toLowerCase() !== "tbd") {
              (context.state as Record<string, unknown>).business_name = seededName;
            }
            (context.state as Record<string, unknown>).step0_bootstrap = {
              venture: seededVenture,
              name: seededName || "TBD",
              status: seededStatus,
              source: "initial_user_message",
            };
          }
        }
        if (!step0Final) {
          step0Final = await maybeHydrateBootstrapFromStep0Specialist(true);
        }

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
            step0_interaction_state: "step0_ready",
            is_mutable: false,
            editable_fields: [],
            wants_recap: false,
            is_offtopic: false,
            user_intent: "STEP_INPUT",
            meta_topic: "NONE",
          };

          const stateWithUiCanvas = stateWithUi as CanvasState;
          let nextState: CanvasState = {
            ...stateWithUiCanvas,
            business_name: name || "TBD",
            active_specialist: deps.step0Specialist,
            last_specialist_result: specialist,
          };
          (nextState as Record<string, unknown>).started = "true";

          return finalizeRouteTurnIntent(context, {
            state: nextState,
            specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
            previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
            responseUiFlags: context.responseUiFlags,
          });
        }

        const initialMsg = String((context.state as Record<string, unknown>).initial_user_message ?? "").trim();
        const langSeed = initialMsg || context.userMessage;
        const startResolution = await deps.ensureStartState(context.state, langSeed);
        const stateWithUi = startResolution.state;
        const fallbackCardDesc = String(
          deps.uiDefaultString("step0.carddesc", "")
        ).trim();
        const fallbackQuestion = String(
          deps.uiDefaultString("step0.question.initial", "")
        ).trim();
        const step0CardDesc = String(deps.step0CardDescForState(stateWithUi) || "").trim() || fallbackCardDesc;
        const step0Question = String(deps.step0QuestionForState(stateWithUi) || "").trim() || fallbackQuestion;

        const specialist = {
          action: "ASK",
          message: step0CardDesc,
          question: step0Question,
          refined_formulation: "",
          business_name: (stateWithUi as Record<string, unknown>).business_name || "TBD",
          step_0: "",
          step0_interaction_state: "step0_editing",
          is_mutable: true,
          editable_fields: ["business_name"],
          wants_recap: false,
          is_offtopic: false,
          user_intent: "STEP_INPUT",
          meta_topic: "NONE",
        };

        const stateWithUiCanvas = stateWithUi as CanvasState;
        let nextState: CanvasState = {
          ...stateWithUiCanvas,
          active_specialist: deps.step0Specialist,
          last_specialist_result: specialist,
        };
        (nextState as Record<string, unknown>).started = "true";

        return finalizeRouteTurnIntent(context, {
          state: nextState,
          specialist: asRecord((nextState as Record<string, unknown>).last_specialist_result || {}),
          previousSpecialist: asRecord((context.state as Record<string, unknown>).last_specialist_result || {}),
          responseUiFlags: context.responseUiFlags,
        });
      },
    },

    dream_start_exercise: {
      id: "dream_start_exercise",
      canHandle: (context) =>
        String((context.state as Record<string, unknown>).current_step || "") === deps.dreamStepId &&
        context.userMessage === deps.dreamStartExerciseRouteToken,
      handle: async (context) => {
        const resumeContext = getDreamBuilderResumeContext(context.state);
        const startState: CanvasState = { ...context.state };

        if (resumeContext.statements.length > 0) {
          (startState as Record<string, unknown>).dream_builder_statements = resumeContext.statements;
        }

        if (resumeContext.hasReusableScoreContext) {
          deps.setDreamRuntimeMode(startState, "builder_refine");
          (startState as Record<string, unknown>).dream_awaiting_direction = "true";
        } else {
          deps.setDreamRuntimeMode(startState, "builder_collect");
          (startState as Record<string, unknown>).dream_awaiting_direction = "false";
          if (resumeContext.hasSavedScoreContext) {
            (startState as Record<string, unknown>).dream_scores = [];
            (startState as Record<string, unknown>).dream_top_clusters = [];
            (startState as Record<string, unknown>).dream_scoring_statements = [];
          }
        }

        const routeUserMessage = resumeContext.hasReusableScoreContext ? "" : context.userMessage;

        const forcedDecision = {
          specialist_to_call: deps.dreamExplainerSpecialist,
          specialist_input: `CURRENT_STEP_ID: ${deps.dreamStepId} | USER_MESSAGE: ${routeUserMessage}`,
          current_step: deps.dreamStepId,
          intro_shown_for_step: String((startState as Record<string, unknown>).intro_shown_for_step ?? ""),
          intro_shown_session:
            (startState as Record<string, unknown>).intro_shown_session === "true" ? "true" : "false",
          show_step_intro: "false",
          show_session_intro: "false",
        } as unknown as OrchestratorOutput;

        const callDreamExplainer = await deps.callSpecialistStrictSafe(
          {
            model: context.model,
            state: startState,
            decision: forcedDecision,
            userMessage: routeUserMessage,
          },
          deps.buildRoutingContext(routeUserMessage),
          startState
        );

        if (!callDreamExplainer.ok) return finalizeRoutePayload(callDreamExplainer.payload);
        deps.rememberLlmCall(callDreamExplainer.value);

        const nextStateDream = deps.applyPostSpecialistStateMutations({
          prevState: startState,
          decision: forcedDecision,
          specialistResult: callDreamExplainer.value.specialistResult,
          provisionalSource: "action_route",
        });
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
            resumed_builder_context: resumeContext.statements.length > 0,
            reused_saved_score_context: resumeContext.hasReusableScoreContext,
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
