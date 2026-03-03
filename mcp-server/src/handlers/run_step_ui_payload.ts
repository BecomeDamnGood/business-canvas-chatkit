import { type CanvasState } from "../core/state.js";
import { ACTIONCODE_REGISTRY } from "../core/actioncode_registry.js";
import { MENU_LABEL_DEFAULTS, labelKeyForMenuAction } from "../core/menu_contract.js";
import { NEXT_MENU_BY_ACTIONCODE, UI_CONTRACT_VERSION } from "../core/ui_contract_matrix.js";
import { parseUiContractMenuForStep, parseUiContractStatusForStep } from "../core/ui_contract_id.js";
import { DREAM_STEP_ID } from "../steps/dream.js";
import type { RenderedAction } from "../contracts/ui_actions.js";
import type { TurnOutputStatus } from "../core/turn_policy_renderer.js";

type WordingChoiceMode = "text" | "list";

export type WordingChoiceUiPayload = {
  enabled: boolean;
  mode: WordingChoiceMode;
  user_text: string;
  suggestion_text: string;
  user_items: string[];
  suggestion_items: string[];
  instruction: string;
};

export type UiViewVariant =
  | "default"
  | "wording_choice"
  | "dream_builder_collect"
  | "dream_builder_scoring"
  | "dream_builder_refine";

type UiViewModeRoute =
  | "prestart"
  | "interactive"
  | "blocked";

export type UiViewPayload = {
  mode?: UiViewModeRoute;
  waiting_locale?: false;
  variant?: Exclude<UiViewVariant, "default">;
};

export type UiContractMeta = {
  contractId?: string;
  contractVersion?: string;
  textKeys?: string[];
};

type BootstrapContractState = {
  waiting: boolean;
  ready: boolean;
  retry_hint: boolean | string;
  phase?: string;
};

type PromptInvariantContext = {
  stepId: string;
  status: TurnOutputStatus;
  specialist: Record<string, unknown>;
  state: CanvasState;
};

export type ResolvedActionCodeTransition = {
  actionCode: string;
  stepId: string;
  sourceMenuId: string;
  targetStepId: string;
  targetMenuId: string;
  renderMode: "menu" | "no_buttons";
};

type UiPayloadHelperDeps = {
  shouldLogLocalDevDiagnostics: () => boolean;
  pickPrompt: (specialist: any) => string;
  buildTextForWidget: (params: {
    specialist: any;
    hasWidgetActions?: boolean;
    questionTextOverride?: string;
  }) => string;
  deriveBootstrapContract: (state: CanvasState | null | undefined) => BootstrapContractState;
  deriveUiViewPayload: (variant: UiViewVariant) => UiViewPayload | null;
  sanitizeWidgetActionCodes: (actionCodes: string[]) => string[];
  buildRenderedActionsFromMenu: (
    menuId: string,
    actionCodes: string[],
    state?: CanvasState | null
  ) => RenderedAction[];
  buildQuestionTextFromActions: (prompt: string) => string;
  sanitizeEscapeInWidget: (specialist: any) => any;
  isWidgetSuppressedEscapeMenuId: (menuId: string) => boolean;
  enforcePromptInvariants: (context: PromptInvariantContext) => Record<string, unknown>;
  isUiI18nV2Enabled: () => boolean;
  isMenuLabelKeysV1Enabled: () => boolean;
  isUiI18nV3LangBootstrapEnabled: () => boolean;
  isUiLocaleMetaV1Enabled: () => boolean;
  isUiLangSourceResolverV1Enabled: () => boolean;
  isUiStrictNonEnPendingV1Enabled: () => boolean;
  isUiStep0LangResetGuardV1Enabled: () => boolean;
  isUiBootstrapStateV1Enabled: () => boolean;
  isUiPendingNoFallbackTextV1Enabled: () => boolean;
  isUiStartTriggerLangResolveV1Enabled: () => boolean;
  isUiLocaleReadyGateV1Enabled: () => boolean;
  isUiNoPendingTextSuppressV1Enabled: () => boolean;
  isUiBootstrapWaitRetryV1Enabled: () => boolean;
  isUiBootstrapEventParityV1Enabled: () => boolean;
  isUiBootstrapPollActionV1Enabled: () => boolean;
  isUiWaitShellV2Enabled: () => boolean;
  isUiTranslationFastModelV1Enabled: () => boolean;
  isUiI18nCriticalKeysV1Enabled: () => boolean;
};

function menuBelongsToStep(menuId: string, stepId: string): boolean {
  const actions = ACTIONCODE_REGISTRY.menus[String(menuId || "").trim()];
  const safeStepId = String(stepId || "").trim();
  if (!Array.isArray(actions) || actions.length === 0 || !safeStepId) return false;
  return actions.every((actionCode) => {
    const actionStep = String(ACTIONCODE_REGISTRY.actions[actionCode]?.step || "").trim();
    return actionStep === safeStepId || actionStep === "system";
  });
}

export function resolveActionCodeTransition(
  actionCode: string,
  stepId: string,
  sourceMenuId: string
): ResolvedActionCodeTransition | null {
  const safeActionCode = String(actionCode || "").trim().toUpperCase();
  const safeStepId = String(stepId || "").trim();
  const safeSourceMenu = String(sourceMenuId || "").trim();
  const sourceMenuForMatch = safeSourceMenu || "NO_MENU";
  if (!safeActionCode || !safeStepId) return null;
  const transition = NEXT_MENU_BY_ACTIONCODE[safeActionCode];
  if (!transition) return null;
  if (String(transition.step_id || "").trim() !== safeStepId) return null;
  const fromMenus = Array.isArray(transition.from_menu_ids)
    ? transition.from_menu_ids.map((menu) => String(menu || "").trim()).filter(Boolean)
    : [];
  if (fromMenus.length > 0 && !fromMenus.includes(sourceMenuForMatch)) return null;
  const targetStepId = String(transition.to_step_id || safeStepId).trim();
  if (!targetStepId) return null;
  const renderMode: "menu" | "no_buttons" =
    String(transition.render_mode || "").trim() === "no_buttons" ? "no_buttons" : "menu";
  const targetMenuId = String(transition.to_menu_id || "").trim();
  if (renderMode === "menu") {
    if (!targetMenuId) return null;
    if (!menuBelongsToStep(targetMenuId, targetStepId)) return null;
  }
  return {
    actionCode: safeActionCode,
    stepId: safeStepId,
    sourceMenuId: sourceMenuForMatch,
    targetStepId,
    targetMenuId: renderMode === "menu" ? targetMenuId : "",
    renderMode,
  };
}

export function resolveActionCodeMenuTransition(
  actionCode: string,
  stepId: string,
  sourceMenuId: string
): string {
  const resolved = resolveActionCodeTransition(actionCode, stepId, sourceMenuId);
  if (!resolved) return "";
  if (resolved.renderMode !== "menu") return "";
  if (resolved.targetStepId !== String(stepId || "").trim()) return "";
  return resolved.targetMenuId;
}

export function createRunStepUiPayloadHelpers(deps: UiPayloadHelperDeps) {
  function normalizeUiContractMeta(
    specialist: any,
    contractMetaOverride?: UiContractMeta | null
  ): UiContractMeta {
    const overrideId = String(contractMetaOverride?.contractId || "").trim();
    const specialistId = String(specialist?.ui_contract_id || "").trim();
    const contractId = overrideId || specialistId;

    const overrideVersion = String(contractMetaOverride?.contractVersion || "").trim();
    const specialistVersion = String(specialist?.ui_contract_version || "").trim();
    const contractVersion = overrideVersion || specialistVersion || UI_CONTRACT_VERSION;

    const overrideTextKeys: unknown[] = Array.isArray(contractMetaOverride?.textKeys)
      ? contractMetaOverride.textKeys
      : [];
    const specialistTextKeys: unknown[] = Array.isArray(specialist?.ui_text_keys) ? specialist.ui_text_keys : [];
    const textKeys = (overrideTextKeys.length > 0 ? overrideTextKeys : specialistTextKeys)
      .map((key: unknown) => String(key || "").trim())
      .filter(Boolean);

    return {
      ...(contractId ? { contractId } : {}),
      ...(contractVersion ? { contractVersion } : {}),
      ...(textKeys.length > 0 ? { textKeys } : {}),
    };
  }

  function applyUiPhaseByStep(state: CanvasState, stepId: string, contractId: string): void {
    const safeStepId = String(stepId || "").trim();
    const safeContractId = String(contractId || "").trim();
    if (!safeStepId || !safeContractId) return;
    const existing = (state as any).__ui_phase_by_step;
    const next = existing && typeof existing === "object" ? { ...existing } : {};
    next[safeStepId] = safeContractId;
    (state as any).__ui_phase_by_step = next;
  }

  function setUiRenderModeByStep(
    state: CanvasState,
    stepId: string,
    mode: "menu" | "no_buttons"
  ): void {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return;
    const existing = (state as any).__ui_render_mode_by_step;
    const next = existing && typeof existing === "object" ? { ...existing } : {};
    next[safeStepId] = mode;
    (state as any).__ui_render_mode_by_step = next;
  }

  function inferUiRenderModeForStep(state: CanvasState, stepId: string): "menu" | "no_buttons" {
    const safeStepId = String(stepId || "").trim();
    if (!safeStepId) return "menu";
    const existing =
      (state as any).__ui_render_mode_by_step && typeof (state as any).__ui_render_mode_by_step === "object"
        ? ((state as any).__ui_render_mode_by_step as Record<string, unknown>)
        : {};
    return String(existing[safeStepId] || "").trim() === "no_buttons" ? "no_buttons" : "menu";
  }

  function parseMenuFromContractIdForStep(contractIdRaw: unknown, stepId: string): string {
    return parseUiContractMenuForStep(contractIdRaw, stepId);
  }

  function parseStatusFromContractIdForStep(contractIdRaw: unknown, stepId: string): TurnOutputStatus | null {
    return parseUiContractStatusForStep(contractIdRaw, stepId);
  }

  function inferCurrentMenuForStep(state: CanvasState, stepId: string): string {
    const phaseMap =
      (state as any).__ui_phase_by_step && typeof (state as any).__ui_phase_by_step === "object"
        ? ((state as any).__ui_phase_by_step as Record<string, unknown>)
        : {};
    return parseMenuFromContractIdForStep(phaseMap[String(stepId || "").trim()], stepId);
  }

  function labelForActionInMenu(menuId: string, actionCode: string): string {
    const safeMenuId = String(menuId || "").trim();
    const safeActionCode = String(actionCode || "").trim();
    if (!safeMenuId || !safeActionCode) return "";
    const actionCodes = Array.isArray(ACTIONCODE_REGISTRY.menus[safeMenuId])
      ? ACTIONCODE_REGISTRY.menus[safeMenuId].map((code) => String(code || "").trim())
      : [];
    if (actionCodes.length === 0) return "";
    const idx = actionCodes.findIndex((code) => code === safeActionCode);
    if (idx < 0) return "";
    const labelKey = labelKeyForMenuAction(safeMenuId, safeActionCode, idx);
    return String(MENU_LABEL_DEFAULTS[labelKey] || "").trim();
  }

  function buildUiPayload(
    specialist: any,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    wordingChoiceOverride?: WordingChoiceUiPayload | null,
    stateOverride?: CanvasState | null,
    stepIdOverride?: string,
    contractMetaOverride?: UiContractMeta | null
  ): {
    action_codes?: string[];
    expected_choice_count?: number;
    actions?: RenderedAction[];
    questionText?: string;
    contract_id?: string;
    contract_version?: string;
    text_keys?: string[];
    view?: UiViewPayload;
    flags: Record<string, boolean | string>;
    wording_choice?: WordingChoiceUiPayload;
  } | undefined {
    const localDev = deps.shouldLogLocalDevDiagnostics();
    const flags: Record<string, boolean | string> = { ...(flagsOverride || {}) };
    if (String(process.env.UI_I18N_V2 || process.env.UI_I18N_V3_TEXT_KEYS || "").trim()) {
      flags.ui_i18n_v2 = deps.isUiI18nV2Enabled();
    }
    if (String(process.env.MENU_LABEL_KEYS_V1 || process.env.UI_I18N_V3_MENU_KEY_ONLY || "").trim()) {
      flags.menu_label_keys_v1 = deps.isMenuLabelKeysV1Enabled();
    }
    if (String(process.env.UI_I18N_V3_LANG_BOOTSTRAP || "").trim()) {
      flags.ui_i18n_v3_lang_bootstrap = deps.isUiI18nV3LangBootstrapEnabled();
    }
    if (String(process.env.UI_LOCALE_META_V1 || "").trim()) {
      flags.ui_locale_meta_v1 = deps.isUiLocaleMetaV1Enabled();
    }
    if (String(process.env.UI_LANG_SOURCE_RESOLVER_V1 || "").trim()) {
      flags.ui_lang_source_resolver_v1 = deps.isUiLangSourceResolverV1Enabled();
    }
    if (String(process.env.UI_STRICT_NON_EN_PENDING_V1 || "").trim()) {
      flags.ui_strict_non_en_pending_v1 = deps.isUiStrictNonEnPendingV1Enabled();
    }
    if (String(process.env.UI_STEP0_LANG_RESET_GUARD_V1 || "").trim()) {
      flags.ui_step0_lang_reset_guard_v1 = deps.isUiStep0LangResetGuardV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_STATE_V1 || "").trim()) {
      flags.ui_bootstrap_state_v1 = deps.isUiBootstrapStateV1Enabled();
    }
    if (String(process.env.UI_PENDING_NO_FALLBACK_TEXT_V1 || "").trim()) {
      flags.ui_pending_no_fallback_text_v1 = deps.isUiPendingNoFallbackTextV1Enabled();
    }
    if (String(process.env.UI_START_TRIGGER_LANG_RESOLVE_V1 || "").trim()) {
      flags.ui_start_trigger_lang_resolve_v1 = deps.isUiStartTriggerLangResolveV1Enabled();
    }
    if (String(process.env.UI_LOCALE_READY_GATE_V1 || "").trim()) {
      flags.ui_locale_ready_gate_v1 = deps.isUiLocaleReadyGateV1Enabled();
    }
    if (String(process.env.UI_NO_PENDING_TEXT_SUPPRESS_V1 || "").trim()) {
      flags.ui_no_pending_text_suppress_v1 = deps.isUiNoPendingTextSuppressV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_WAIT_RETRY_V1 || "").trim()) {
      flags.ui_bootstrap_wait_retry_v1 = deps.isUiBootstrapWaitRetryV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_EVENT_PARITY_V1 || "").trim()) {
      flags.ui_bootstrap_event_parity_v1 = deps.isUiBootstrapEventParityV1Enabled();
    }
    if (String(process.env.UI_BOOTSTRAP_POLL_ACTION_V1 || "").trim()) {
      flags.ui_bootstrap_poll_action_v1 = deps.isUiBootstrapPollActionV1Enabled();
    }
    if (String(process.env.UI_WAIT_SHELL_V2 || "").trim()) {
      flags.ui_wait_shell_v2 = deps.isUiWaitShellV2Enabled();
    }
    if (String(process.env.UI_TRANSLATION_FAST_MODEL_V1 || "").trim()) {
      flags.ui_translation_fast_model_v1 = deps.isUiTranslationFastModelV1Enabled();
    }
    if (String(process.env.UI_I18N_CRITICAL_KEYS_V1 || "").trim()) {
      flags.ui_i18n_critical_keys_v1 = deps.isUiI18nCriticalKeysV1Enabled();
    }
    const introChromeRaw = String((specialist as any)?.ui_show_step_intro_chrome || "").trim().toLowerCase();
    if ((specialist as any)?.ui_show_step_intro_chrome === true || introChromeRaw === "true") {
      flags.show_step_intro_chrome = true;
    }
    const contractMeta = normalizeUiContractMeta(specialist, contractMetaOverride);
    const rawQuestionText = deps.pickPrompt(specialist);
    const questionText = deps.buildQuestionTextFromActions(rawQuestionText);
    void renderedActionsOverride;
    const effectiveState = (stateOverride && typeof stateOverride === "object" ? stateOverride : null) as
      | CanvasState
      | null;
    if (effectiveState && deps.isUiLocaleReadyGateV1Enabled()) {
      const bootstrap = deps.deriveBootstrapContract(effectiveState);
      flags.bootstrap_waiting_locale = bootstrap.waiting;
      flags.bootstrap_interactive_ready = bootstrap.ready;
      flags.bootstrap_retry_hint = bootstrap.retry_hint;
      flags.bootstrap_phase = String(bootstrap.phase || "");
      flags.locale_pending_background = bootstrap.waiting;
    }
    const effectiveStepId = String(stepIdOverride || (effectiveState as any)?.current_step || "").trim();
    const contractMenuId = parseMenuFromContractIdForStep(contractMeta.contractId, effectiveStepId);
    const dreamRuntimeMode = String((effectiveState as any)?.__dream_runtime_mode || "").trim();
    const statementsCount = Array.isArray((specialist as any)?.statements)
      ? ((specialist as any).statements as unknown[]).map((line) => String(line || "").trim()).filter(Boolean).length
      : 0;
    const canonicalStatementsCount =
      Array.isArray((effectiveState as any)?.dream_builder_statements)
        ? ((effectiveState as any).dream_builder_statements as unknown[]).length
        : 0;
    const scoringPhase = String((specialist as any)?.scoring_phase || "").trim() === "true";
    const hasClusters =
      Array.isArray((specialist as any)?.clusters) &&
      ((specialist as any).clusters as unknown[]).length > 0;
    const wordingPickPending =
      Boolean(wordingChoiceOverride?.enabled) ||
      String((specialist as any)?.wording_choice_pending || "").trim() === "true" ||
      Boolean((flagsOverride || {}).require_wording_pick);
    let viewVariant: UiViewVariant = "default";
    if (
      effectiveStepId === DREAM_STEP_ID &&
      ((scoringPhase && hasClusters && Math.max(statementsCount, canonicalStatementsCount) >= 20) ||
        dreamRuntimeMode === "builder_scoring")
    ) {
      viewVariant = "dream_builder_scoring";
    } else if (wordingPickPending) {
      viewVariant = "wording_choice";
    } else if (effectiveStepId === DREAM_STEP_ID && dreamRuntimeMode === "builder_refine") {
      viewVariant = "dream_builder_refine";
    } else if (effectiveStepId === DREAM_STEP_ID && dreamRuntimeMode === "builder_collect") {
      viewVariant = "dream_builder_collect";
    }
    const shouldForceQuestionText = viewVariant === "wording_choice";
    const questionTextPayload = shouldForceQuestionText
      ? { questionText: String(questionText || "").trim() }
      : (questionText ? { questionText } : {});
    const view = deps.deriveUiViewPayload(viewVariant);
    if (Array.isArray(actionCodesOverride)) {
      const safeOverrideCodes = deps.sanitizeWidgetActionCodes(
        actionCodesOverride.map((code) => String(code || "").trim()).filter(Boolean)
      );
      if (safeOverrideCodes.length !== actionCodesOverride.length && localDev) {
        flags.escape_actioncodes_suppressed = true;
      }
      if (safeOverrideCodes.length > 0) {
        const renderedActions = deps.buildRenderedActionsFromMenu(contractMenuId, safeOverrideCodes, effectiveState);
        return {
          action_codes: safeOverrideCodes,
          expected_choice_count: safeOverrideCodes.length,
          ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
          ...questionTextPayload,
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(view ? { view } : {}),
          flags,
          ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
        };
      }
      if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId || view) {
        return {
          ...questionTextPayload,
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(view ? { view } : {}),
          flags,
          ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
        };
      }
      return undefined;
    }
    const menuId = contractMenuId;
    if (menuId) {
      if (deps.isWidgetSuppressedEscapeMenuId(menuId)) {
        if (localDev) flags.escape_menu_suppressed = true;
        if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId) {
          return {
            ...questionTextPayload,
            ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
            ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
            ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
            flags,
            ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
          };
        }
        return undefined;
      }
      const actionCodes = ACTIONCODE_REGISTRY.menus[menuId];
      if (actionCodes && actionCodes.length > 0) {
        const safeCodes = deps.sanitizeWidgetActionCodes(
          actionCodes.map((code) => String(code || "").trim()).filter(Boolean)
        );
        if (safeCodes.length !== actionCodes.length && localDev) {
          flags.escape_actioncodes_suppressed = true;
        }
        if (safeCodes.length === 0) {
          if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId || view) {
            return {
              ...questionTextPayload,
              ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
              ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
              ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
              ...(view ? { view } : {}),
              flags,
              ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
            };
          }
          return undefined;
        }
        const renderedActions = deps.buildRenderedActionsFromMenu(menuId, safeCodes, effectiveState);
        return {
          action_codes: safeCodes,
          expected_choice_count: safeCodes.length,
          ...(renderedActions.length > 0 ? { actions: renderedActions } : {}),
          ...questionTextPayload,
          ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
          ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
          ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
          ...(view ? { view } : {}),
          flags,
          ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
        };
      }
    }
    if (Object.keys(flags).length > 0 || wordingChoiceOverride || contractMeta.contractId || view) {
      return {
        ...questionTextPayload,
        ...(contractMeta.contractId ? { contract_id: contractMeta.contractId } : {}),
        ...(contractMeta.contractVersion ? { contract_version: contractMeta.contractVersion } : {}),
        ...(contractMeta.textKeys && contractMeta.textKeys.length > 0 ? { text_keys: contractMeta.textKeys } : {}),
        ...(view ? { view } : {}),
        flags,
        ...(wordingChoiceOverride ? { wording_choice: wordingChoiceOverride } : {}),
      };
    }
    return undefined;
  }

  function attachRegistryPayload<T extends Record<string, unknown>>(
    payload: T,
    specialist: any,
    flagsOverride?: Record<string, boolean | string> | null,
    actionCodesOverride?: string[] | null,
    renderedActionsOverride?: RenderedAction[] | null,
    wordingChoiceOverride?: WordingChoiceUiPayload | null,
    contractMetaOverride?: UiContractMeta | null
  ): T & { registry_version: string; ui?: ReturnType<typeof buildUiPayload> } {
    let safeSpecialist = deps.sanitizeEscapeInWidget(specialist);
    const payloadState = (payload as any)?.state as CanvasState | undefined;
    const payloadStepId = String((payload as any)?.current_step_id || payloadState?.current_step || "").trim();
    const phaseMap = payloadState && typeof (payloadState as any).__ui_phase_by_step === "object"
      ? ((payloadState as any).__ui_phase_by_step as Record<string, unknown>)
      : {};
    const phaseContractId = payloadStepId ? String(phaseMap[payloadStepId] || "").trim() : "";
    const effectiveContractOverride: UiContractMeta = {
      ...(contractMetaOverride || {}),
      ...(contractMetaOverride?.contractId ? {} : (phaseContractId ? { contractId: phaseContractId } : {})),
      ...(contractMetaOverride?.contractVersion ? {} : { contractVersion: UI_CONTRACT_VERSION }),
    };
    const contractIdForStatus = String(
      effectiveContractOverride.contractId || (safeSpecialist as any)?.ui_contract_id || ""
    ).trim();
    const statusForInvariants =
      payloadState && payloadStepId
        ? parseStatusFromContractIdForStep(contractIdForStatus, payloadStepId)
        : null;
    if (payloadState && payloadStepId && statusForInvariants) {
      safeSpecialist = deps.enforcePromptInvariants({
        stepId: payloadStepId,
        status: statusForInvariants,
        specialist: safeSpecialist as Record<string, unknown>,
        state: payloadState,
      });
    }
    const ui = buildUiPayload(
      safeSpecialist,
      flagsOverride,
      actionCodesOverride,
      renderedActionsOverride,
      wordingChoiceOverride,
      payloadState,
      payloadStepId,
      effectiveContractOverride
    );
    const hasWidgetActions =
      (Array.isArray(ui?.action_codes) && ui.action_codes.length > 0) ||
      (Array.isArray(ui?.actions) && ui.actions.length > 0);
    const safePayload = {
      ...payload,
      specialist: safeSpecialist,
      ...(Object.prototype.hasOwnProperty.call(payload, "text")
        ? {
            text: deps.buildTextForWidget({
              specialist: safeSpecialist,
              hasWidgetActions,
              questionTextOverride: String(ui?.questionText || ""),
            }),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "prompt")
        ? { prompt: deps.pickPrompt(safeSpecialist) }
        : {}),
    } as T;
    return {
      ...safePayload,
      registry_version: ACTIONCODE_REGISTRY.version,
      ...(ui ? { ui } : {}),
    };
  }

  return {
    normalizeUiContractMeta,
    applyUiPhaseByStep,
    setUiRenderModeByStep,
    inferUiRenderModeForStep,
    parseMenuFromContractIdForStep,
    parseStatusFromContractIdForStep,
    inferCurrentMenuForStep,
    resolveActionCodeMenuTransition,
    resolveActionCodeTransition,
    labelForActionInMenu,
    buildUiPayload,
    attachRegistryPayload,
  };
}
