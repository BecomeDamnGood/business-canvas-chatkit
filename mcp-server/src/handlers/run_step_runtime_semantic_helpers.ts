import type { CanvasState, ProvisionalSource } from "../core/state.js";
import type {
  TurnOutputStatus,
  TurnPolicyRenderResult,
} from "../core/turn_policy_renderer.js";

type ActioncodeRegistryEntry = {
  route?: string;
};

type ActioncodeRegistryShape = {
  actions: Record<string, ActioncodeRegistryEntry>;
  menus: Record<string, string[]>;
};

type PromptInvariantContext = {
  stepId: string;
  status: TurnOutputStatus;
  specialist: Record<string, unknown>;
  state: CanvasState;
};

export type SemanticTelemetryKey =
  | "semantic_prompt_missing_count"
  | "semantic_confirm_blocked_count"
  | "state_hygiene_resets_count";

type CreateRunStepRuntimeSemanticHelpersDeps = {
  step0Id: string;
  dreamStepId: string;
  dreamExplainerSwitchSelfMenuId: string;
  dreamExplainerRefineMenuId: string;
  actioncodeRegistry: ActioncodeRegistryShape;
  defaultMenuByStatus: Record<string, Partial<Record<TurnOutputStatus, string>>>;
  finalFieldByStepId: Record<string, string>;
  getDreamRuntimeMode: (state: CanvasState) => string;
  parseMenuFromContractIdForStep: (contractIdRaw: string, stepId: string) => string;
  isConfirmActionCode: (actionCode: string) => boolean;
  menuHasConfirmAction: (menuId: string) => boolean;
  inferUiRenderModeForStep: (state: CanvasState, stepId: string) => "menu" | "no_buttons";
  fieldForStep: (stepId: string) => string;
  provisionalValueForStep: (state: CanvasState, stepId: string) => string;
  provisionalSourceForStep: (state: CanvasState, stepId: string) => ProvisionalSource;
  clearStepInteractiveState: (state: CanvasState, stepId: string) => CanvasState;
  renderFreeTextTurnPolicy: (params: {
    stepId: string;
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist?: Record<string, unknown> | null;
  }) => TurnPolicyRenderResult;
  validateNonStep0OfftopicMessageShape: (
    stepId: string,
    specialist: Record<string, unknown>,
    state?: CanvasState
  ) => string | null;
  enforcePromptInvariants: (context: PromptInvariantContext) => Record<string, unknown>;
  promptFallbackForInteractiveAsk: (state: CanvasState, stepId: string) => string;
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
  uiDefaultString: (key: string, fallback?: string) => string;
  countNumberedOptions: (prompt: string) => number;
  isUiSemanticInvariantsV1Enabled: () => boolean;
  bumpUiI18nCounter: (telemetry: unknown, key: SemanticTelemetryKey) => void;
};

type SemanticViolationReason =
  | "missing_prompt_for_interactive_ask"
  | "confirm_present_without_accepted_evidence"
  | "intro_mode_must_not_expose_confirm"
  | "wording_choice_mode_requires_instruction_or_context";

const SEMANTIC_VIOLATION_REASONS = new Set<SemanticViolationReason>([
  "missing_prompt_for_interactive_ask",
  "confirm_present_without_accepted_evidence",
  "intro_mode_must_not_expose_confirm",
  "wording_choice_mode_requires_instruction_or_context",
]);

function isSemanticViolationReason(reason: string | null | undefined): reason is SemanticViolationReason {
  if (!reason) return false;
  return SEMANTIC_VIOLATION_REASONS.has(reason as SemanticViolationReason);
}

export function createRunStepRuntimeSemanticHelpers(deps: CreateRunStepRuntimeSemanticHelpersDeps) {
  function hasAcceptedOutputEvidence(state: CanvasState, stepId: string): boolean {
    const finalField = String(deps.finalFieldByStepId[stepId] || "").trim();
    const committedFinal = finalField ? String((state as Record<string, unknown>)?.[finalField] || "").trim() : "";
    if (committedFinal) return true;
    const provisional = deps.provisionalValueForStep(state, stepId);
    if (!provisional) return false;
    const source = deps.provisionalSourceForStep(state, stepId);
    return source === "user_input" || source === "wording_pick" || source === "action_route";
  }

  function validateRenderedContractTurn(
    stepId: string,
    rendered: TurnPolicyRenderResult,
    state?: CanvasState
  ): string | null {
    const specialist = (rendered.specialist || {}) as Record<string, unknown>;
    const action = String(specialist.action || "").trim().toUpperCase();
    const contractId = String(rendered.contractId || specialist.ui_contract_id || "").trim();
    const menuId = deps.parseMenuFromContractIdForStep(contractId, stepId);
    const actionCodes = Array.isArray(rendered.uiActionCodes)
      ? rendered.uiActionCodes.map((code) => String(code || "").trim()).filter(Boolean)
      : [];
    const uiActions = Array.isArray(rendered.uiActions) ? rendered.uiActions : [];
    const question = String(specialist.question || "").trim();
    const numberedCount = deps.countNumberedOptions(question);

    if (action !== "ASK") return "rendered_action_not_ask";
    if (!contractId) return "missing_contract_id";
    if (menuId && !deps.actioncodeRegistry.menus[menuId]) return "unknown_menu_id";
    if (menuId && actionCodes.length === 0) return "menu_without_action_codes";
    if (actionCodes.length !== uiActions.length) return "ui_action_count_mismatch";
    if (actionCodes.length > 0 && numberedCount !== actionCodes.length) return "numbered_prompt_action_count_mismatch";
    if (stepId === deps.dreamStepId && state) {
      const dreamMode = deps.getDreamRuntimeMode(state);
      if (dreamMode === "builder_collect") {
        if (menuId !== deps.dreamExplainerSwitchSelfMenuId) return "dream_builder_collect_menu_mismatch";
        if (actionCodes.length !== 1 || actionCodes[0] !== "ACTION_DREAM_SWITCH_TO_SELF") {
          return "dream_builder_collect_action_mismatch";
        }
      }
      if (dreamMode === "builder_refine" && menuId !== deps.dreamExplainerRefineMenuId) {
        return "dream_builder_refine_menu_mismatch";
      }
      if (dreamMode === "builder_scoring" && actionCodes.length > 0) {
        return "dream_builder_scoring_should_not_render_actions";
      }
    }

    for (const code of actionCodes) {
      if (!deps.actioncodeRegistry.actions[code]) return `unknown_action_code:${code}`;
    }
    if (state) {
      const clickedLabel = String((state as Record<string, unknown>).__last_clicked_label_for_contract || "").trim();
      const clickedActionCode = String((state as Record<string, unknown>).__last_clicked_action_for_contract || "").trim().toUpperCase();
      if (clickedLabel) {
        const clickedKey = clickedLabel.toLowerCase();
        const nextLabels = uiActions
          .map((uiAction) => String((uiAction as Record<string, unknown>)?.label || "").trim().toLowerCase())
          .filter(Boolean);
        const allowRepeatedLabel =
          clickedActionCode === "ACTION_DREAM_EXPLAINER_REFINE_ADJUST";
        if (!allowRepeatedLabel && nextLabels.includes(clickedKey)) {
          return "repeated_clicked_label_after_transition";
        }
      }
    }
    if (menuId) {
      const allowed = new Set((deps.actioncodeRegistry.menus[menuId] || []).map((code) => String(code || "").trim()));
      if (allowed.size === 0) return "menu_has_no_registry_actions";
      for (const code of actionCodes) {
        if (!allowed.has(code)) return `action_code_not_in_menu:${code}`;
      }
    }

    const hasConfirmAction = actionCodes.some((code) => deps.isConfirmActionCode(code));
    if (rendered.status === "no_output" && hasConfirmAction) {
      return "intro_mode_must_not_expose_confirm";
    }
    if (state && hasConfirmAction && !hasAcceptedOutputEvidence(state, stepId)) {
      return "confirm_present_without_accepted_evidence";
    }
    if (
      action === "ASK" &&
      (rendered.status === "no_output" || rendered.status === "incomplete_output")
    ) {
      const renderMode = state ? deps.inferUiRenderModeForStep(state, stepId) : "menu";
      const dreamMode = state && stepId === deps.dreamStepId ? deps.getDreamRuntimeMode(state) : "self";
      const promptRequired = !(renderMode === "no_buttons" || (stepId === deps.dreamStepId && dreamMode === "builder_scoring"));
      if (promptRequired && !question) {
        return "missing_prompt_for_interactive_ask";
      }
    }
    if (String((specialist as Record<string, unknown>).wording_choice_pending || "").trim() === "true") {
      const hasWordingContext =
        Boolean(String((specialist as Record<string, unknown>).message || "").trim()) ||
        Boolean(question) ||
        Boolean(String((specialist as Record<string, unknown>).wording_choice_user_raw || "").trim()) ||
        Boolean(String((specialist as Record<string, unknown>).wording_choice_user_normalized || "").trim()) ||
        Boolean(String((specialist as Record<string, unknown>).wording_choice_agent_current || "").trim()) ||
        (Array.isArray((specialist as Record<string, unknown>).wording_choice_user_items) &&
          ((specialist as Record<string, unknown>).wording_choice_user_items as unknown[]).length > 0) ||
        (Array.isArray((specialist as Record<string, unknown>).wording_choice_suggestion_items) &&
          ((specialist as Record<string, unknown>).wording_choice_suggestion_items as unknown[]).length > 0);
      if (!hasWordingContext) return "wording_choice_mode_requires_instruction_or_context";
    }

    if (stepId !== deps.step0Id && rendered.status === "valid_output") {
      if (state && deps.inferUiRenderModeForStep(state, stepId) === "no_buttons") {
        return null;
      }
      const inDreamBuilderMode =
        stepId === deps.dreamStepId &&
        state &&
        deps.getDreamRuntimeMode(state) !== "self";
      if (!inDreamBuilderMode) {
        const expectedMenuId = String(deps.defaultMenuByStatus[stepId]?.valid_output || "").trim();
        if (expectedMenuId && menuId !== expectedMenuId) {
          return `invalid_valid_output_menu:${menuId || "NO_MENU"}_expected:${expectedMenuId}`;
        }
      }
    }

    if (
      stepId !== deps.step0Id &&
      rendered.status !== "no_output" &&
      actionCodes.length === 0
    ) {
      if (state && deps.inferUiRenderModeForStep(state, stepId) === "no_buttons") {
        return null;
      }
      return "missing_action_codes_for_interactive_step";
    }

    if (
      rendered.status === "valid_output" &&
      rendered.confirmEligible &&
      menuId &&
      deps.menuHasConfirmAction(menuId)
    ) {
      const hasConfirm = actionCodes.some((code) => deps.isConfirmActionCode(code));
      if (!hasConfirm) return "missing_confirm_action_for_valid_output";
    }

    const offTopicShapeViolation = deps.validateNonStep0OfftopicMessageShape(stepId, specialist, state);
    if (offTopicShapeViolation) return offTopicShapeViolation;

    return null;
  }

  function semanticFallbackSpecialistForStep(
    stepId: string,
    specialist: Record<string, unknown>,
    reason: SemanticViolationReason,
    state: CanvasState
  ): Record<string, unknown> {
    const next = { ...specialist };
    if (reason === "missing_prompt_for_interactive_ask") {
      (next as Record<string, unknown>).question = deps.promptFallbackForInteractiveAsk(state, stepId);
    }
    if (reason === "wording_choice_mode_requires_instruction_or_context") {
      const existingMessage = String((next as Record<string, unknown>).message || "").trim();
      if (!existingMessage) {
        (next as Record<string, unknown>).message = deps.uiStringFromStateMap(
          state,
          "wording.choice.context.default",
          deps.uiDefaultString("wording.choice.context.default")
        );
      }
    }
    if (reason === "confirm_present_without_accepted_evidence" || reason === "intro_mode_must_not_expose_confirm") {
      const field = deps.fieldForStep(stepId);
      if (field) (next as Record<string, unknown>)[field] = "";
      (next as Record<string, unknown>).refined_formulation = "";
      if (Array.isArray((next as Record<string, unknown>).statements)) {
        (next as Record<string, unknown>).statements = [];
      }
    }
    return next;
  }

  function validateRenderedContractOrRecover(params: {
    stepId: string;
    rendered: TurnPolicyRenderResult;
    state: CanvasState;
    previousSpecialist: Record<string, unknown>;
    telemetry?: unknown;
  }): { rendered: TurnPolicyRenderResult; state: CanvasState; violation: string | null; recovered: boolean } {
    let rendered = params.rendered;
    let state = params.state;
    const stepId = String(params.stepId || "").trim();
    const specialistWithInvariants = deps.enforcePromptInvariants({
      stepId,
      status: rendered.status,
      specialist: (rendered.specialist || {}) as Record<string, unknown>,
      state,
    });
    rendered = {
      ...rendered,
      specialist: specialistWithInvariants,
    };
    const violation = validateRenderedContractTurn(stepId, rendered, state);
    if (!violation) {
      return { rendered, state, violation: null, recovered: false };
    }
    if (!deps.isUiSemanticInvariantsV1Enabled() || !isSemanticViolationReason(violation)) {
      return { rendered, state, violation, recovered: false };
    }
    if (violation === "missing_prompt_for_interactive_ask") {
      deps.bumpUiI18nCounter(params.telemetry, "semantic_prompt_missing_count");
    }
    if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
      deps.bumpUiI18nCounter(params.telemetry, "semantic_confirm_blocked_count");
    }
    let fallbackState = state;
    if (violation === "confirm_present_without_accepted_evidence" || violation === "intro_mode_must_not_expose_confirm") {
      fallbackState = deps.clearStepInteractiveState(fallbackState, stepId);
      deps.bumpUiI18nCounter(params.telemetry, "state_hygiene_resets_count");
    }
    const fallbackSpecialist = semanticFallbackSpecialistForStep(
      stepId,
      (rendered.specialist || {}) as Record<string, unknown>,
      violation,
      fallbackState
    );
    let rerendered = deps.renderFreeTextTurnPolicy({
      stepId,
      state: fallbackState,
      specialist: fallbackSpecialist,
      previousSpecialist: params.previousSpecialist || {},
    });
    rerendered = {
      ...rerendered,
      specialist: deps.enforcePromptInvariants({
        stepId,
        status: rerendered.status,
        specialist: (rerendered.specialist || {}) as Record<string, unknown>,
        state: fallbackState,
      }),
    };
    const rerenderViolation = validateRenderedContractTurn(stepId, rerendered, fallbackState);
    if (!rerenderViolation) {
      return { rendered: rerendered, state: fallbackState, violation: null, recovered: true };
    }
    return { rendered, state, violation, recovered: false };
  }

  return {
    validateRenderedContractOrRecover,
  };
}
