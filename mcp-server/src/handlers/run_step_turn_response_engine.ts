import type { CanvasState } from "../core/state.js";
import type { TurnPolicyRenderResult } from "../core/turn_policy_renderer.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import type { UiI18nTelemetryCounters } from "./run_step_i18n_runtime.js";
import type { UiContractMeta, WordingChoiceUiPayload } from "./run_step_ui_payload.js";

type TurnResponseEngineDeps<TPayload> = {
  renderFreeTextTurnPolicy: (params: {
    stepId: string;
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist: Record<string, unknown>;
  }) => TurnPolicyRenderResult;
  validateRenderedContractOrRecover: (params: {
    stepId: string;
    rendered: TurnPolicyRenderResult;
    state: CanvasState;
    previousSpecialist: Record<string, unknown>;
    telemetry?: UiI18nTelemetryCounters | null;
  }) => {
    rendered: unknown;
    state: CanvasState;
    violation: string | null;
  };
  applyUiPhaseByStep: (state: CanvasState, stepId: string, contractId: string) => void;
  buildTextForWidget: (params: { specialist: Record<string, unknown> }) => string;
  pickPrompt: (specialist: Record<string, unknown>) => string;
  attachRegistryPayload: (
    payload: Record<string, unknown>,
    specialist: Record<string, unknown>,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    wordingChoiceOverride?: WordingChoiceUiPayload | null,
    contractMetaOverride?: UiContractMeta | null
  ) => TPayload;
  finalizeResponse: (payload: TPayload) => TPayload;
};

type TurnResponseRenderedOutput = {
  status: string;
  specialist: Record<string, unknown>;
  contractId: string;
  contractVersion: string;
  textKeys: string[];
  uiActionCodes: string[];
  uiActions: RenderedAction[];
};

export type TurnResponseRenderFailureContext = {
  state: CanvasState;
  stepId: string;
  activeSpecialist: string;
  reason: string;
  rendered: TurnResponseRenderedOutput;
};

type TurnResponseRenderSuccess = {
  state: CanvasState;
  specialist: Record<string, unknown>;
  renderedStatus: string;
  actionCodes: string[];
  renderedActions: RenderedAction[];
  contractMeta: UiContractMeta;
};

type TurnResponseRenderResult<TPayload> =
  | { ok: true; value: TurnResponseRenderSuccess }
  | { ok: false; payload: TPayload };

export type TurnResponseEngine<TPayload> = {
  renderValidateRecover: (params: {
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist: Record<string, unknown>;
    telemetry: unknown;
    onContractViolation: (context: TurnResponseRenderFailureContext) => TPayload;
  }) => TurnResponseRenderResult<TPayload>;
  attachAndFinalize: (params: {
    state: CanvasState;
    specialist: Record<string, unknown>;
    responseUiFlags?: Record<string, boolean | string> | null;
    actionCodesOverride?: string[] | null;
    renderedActionsOverride?: RenderedAction[] | null;
    wordingChoiceOverride?: WordingChoiceUiPayload | null;
    contractMetaOverride?: UiContractMeta | null;
    debug?: Record<string, unknown>;
  }) => TPayload;
  finalize: (payload: TPayload) => TPayload;
};

export function createTurnResponseEngine<TPayload>(
  deps: TurnResponseEngineDeps<TPayload>
): TurnResponseEngine<TPayload> {
  function renderValidateRecover(params: {
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist: Record<string, unknown>;
    telemetry: unknown;
    onContractViolation: (context: TurnResponseRenderFailureContext) => TPayload;
  }): TurnResponseRenderResult<TPayload> {
    const renderedRaw = deps.renderFreeTextTurnPolicy({
      stepId: String((params.state as Record<string, unknown>).current_step ?? ""),
      state: params.state,
      specialist: params.specialist,
      previousSpecialist: params.previousSpecialist,
    });

    const validated = deps.validateRenderedContractOrRecover({
      stepId: String((params.state as Record<string, unknown>).current_step ?? ""),
      rendered: renderedRaw,
      state: params.state,
      previousSpecialist: params.previousSpecialist,
      telemetry: params.telemetry as UiI18nTelemetryCounters | null | undefined,
    });

    const nextState = validated.state;
    const rendered = validated.rendered as TurnResponseRenderedOutput;
    const stepId = String((nextState as Record<string, unknown>).current_step ?? "");
    if (validated.violation) {
      (nextState as Record<string, unknown>).__render_contract_violation = String(validated.violation || "");
    }
    const contractId = String(rendered.contractId || "").trim();
    if (stepId && contractId) {
      deps.applyUiPhaseByStep(nextState, stepId, contractId);
    }
    (nextState as Record<string, unknown>).last_specialist_result = rendered.specialist;

    return {
      ok: true,
      value: {
        state: nextState,
        specialist: rendered.specialist,
        renderedStatus: rendered.status,
        actionCodes: Array.isArray(rendered.uiActionCodes) ? rendered.uiActionCodes : [],
        renderedActions: Array.isArray(rendered.uiActions) ? rendered.uiActions : [],
        contractMeta: {
          contractId,
          contractVersion: String(rendered.contractVersion || ""),
          textKeys: Array.isArray(rendered.textKeys) ? rendered.textKeys : [],
        },
      },
    };
  }

  function attachAndFinalize(params: {
    state: CanvasState;
    specialist: Record<string, unknown>;
    responseUiFlags?: Record<string, boolean | string> | null;
    actionCodesOverride?: string[] | null;
    renderedActionsOverride?: RenderedAction[] | null;
    wordingChoiceOverride?: WordingChoiceUiPayload | null;
    contractMetaOverride?: UiContractMeta | null;
    debug?: Record<string, unknown>;
  }): TPayload {
    const stateRecord = params.state as Record<string, unknown>;
    const payload = deps.attachRegistryPayload(
      {
        ok: true as const,
        tool: "run_step" as const,
        current_step_id: String(params.state.current_step),
        active_specialist: String(stateRecord.active_specialist || ""),
        text: deps.buildTextForWidget({ specialist: params.specialist }),
        prompt: deps.pickPrompt(params.specialist),
        specialist: params.specialist,
        state: params.state,
        ...(params.debug ? { debug: params.debug } : {}),
      },
      params.specialist,
      params.responseUiFlags || null,
      params.actionCodesOverride || null,
      params.renderedActionsOverride || null,
      params.wordingChoiceOverride || null,
      params.contractMetaOverride || null
    );
    return deps.finalizeResponse(payload);
  }

  function finalize(payload: TPayload): TPayload {
    return deps.finalizeResponse(payload);
  }

  return {
    renderValidateRecover,
    attachAndFinalize,
    finalize,
  };
}
