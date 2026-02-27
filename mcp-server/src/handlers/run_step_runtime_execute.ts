import type { RunStepError, RunStepSuccess } from "./run_step_runtime_types.js";

export async function runStepRuntimeExecute(
  rawArgs: unknown,
  deps: any
): Promise<RunStepSuccess | RunStepError> {
  const {
    parseRunStepIngressArgs, STEP_0_ID, ACTIONCODE_REGISTRY, normalizeState, normalizeLocaleHint,
    buildRuntimeIdempotencyScopeKey, createRuntimeIdempotencyRequestHash, buildRuntimeIdempotencyRegistryKey,
    attachRuntimeIdempotencyDiagnostics, markRuntimeIdempotencyCompleted, purgeExpiredRuntimeIdempotencyEntries,
    getRuntimeIdempotencyEntry, RUNTIME_IDEMPOTENCY_ERROR_CODES, cloneRuntimeIdempotencyResult,
    markRuntimeIdempotencyInFlight, runtimeIdempotencyDelayMs, resolveHolisticPolicyFlags,
    normalizeStateLanguageSource, logStructuredEvent, createStructuredLogContextFromState,
    deriveTransitionEventFromLegacy, orchestrateFromTransition, envFlagEnabled, createTurnLlmAccumulator,
    registerTurnLlmCall, normalizeUsage, runStepPreflightHelpers, createRunStepRuntimeFinalizeLayer,
    resolveModelForCall, shouldLogLocalDevDiagnostics, isUiTranslationFastModelV1Enabled,
    isUiI18nV3LangBootstrapEnabled, isUiStartTriggerLangResolveV1Enabled, isInteractiveLocaleReady,
    normalizeLangCode, ensureUiStringsForState, resolveLanguageForTurn, parseMenuFromContractIdForStep,
    labelKeysForMenuActionCodes, bumpUiI18nCounter, turnUsageFromAccumulator, getDreamRuntimeMode,
    DREAM_STEP_ID, DREAM_EXPLAINER_SPECIALIST, buildTextForWidget, pickPrompt, renderFreeTextTurnPolicy,
    validateRenderedContractOrRecover, applyUiPhaseByStep, runStepRuntimePreflightLayer, STEP_0_SPECIALIST,
    isUiLocaleReadyGateV1Enabled, hasUsableSpecialistForRetry, buildTransientFallbackSpecialist,
    deriveBootstrapContract, buildFailClosedState, inferCurrentMenuForStep, labelForActionInMenu,
    normalizeLanguageSource, isUiStep0LangResetGuardV1Enabled, runStepRuntimeActionRoutingLayer,
    PURPOSE_STEP_ID, BIGWHY_STEP_ID, ROLE_STEP_ID, ENTITY_STEP_ID, STRATEGY_STEP_ID, TARGETGROUP_STEP_ID,
    PRODUCTSSERVICES_STEP_ID, RULESOFTHEGAME_STEP_ID, PRESENTATION_STEP_ID, DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
    NEXT_MENU_BY_ACTIONCODE, DREAM_START_EXERCISE_ACTION_CODES, resolveActionCodeTransition,
    setUiRenderModeByStep, buildContractId, processActionCode, setDreamRuntimeMode, provisionalValueForStep,
    clearProvisionalValue, clearStepInteractiveState, isUiStateHygieneSwitchV1Enabled,
    isClearlyGeneralOfftopicInput, isWordingChoiceEligibleContext, buildWordingChoiceFromPendingSpecialist,
    applyWordingPickSelection, isWordingPickRouteToken, isRefineAdjustRouteToken, buildWordingChoiceFromTurn,
    pickWordingAgentBase, copyPendingWordingChoiceState, normalizeNonStep0OfftopicSpecialist,
    uiStringFromStateMap, uiDefaultString, attachRegistryPayload, langFromState, UI_CONTRACT_VERSION,
    DREAM_FORCE_REFINE_ROUTE_PREFIX, STRATEGY_CONSOLIDATE_ROUTE_TOKEN, DREAM_SPECIALIST, STRATEGY_SPECIALIST,
    callSpecialistStrictSafe, normalizeEntitySpecialistResult, applyCentralMetaTopicRouter,
    normalizeStep0AskDisplayContract, hasValidStep0Final, applyPostSpecialistStateMutations,
    isMetaOfftopicFallbackTurn, shouldTreatAsStepContributingInput, hasDreamSpecialistCandidate,
    buildDreamRefineFallbackSpecialist, strategyStatementsForConsolidateGuard, enforceDreamBuilderQuestionProgress,
    applyMotivationQuotesContractV11, wordingSelectionMessage, applyStateUpdate, parseStep0Final,
    step0ReadinessQuestion, step0CardDescForState, step0QuestionForState, generatePresentationAssets,
    pickDreamSuggestionFromPreviousState, pickDreamCandidateFromState, pickRoleSuggestionFromPreviousState,
    runStepRuntimeSpecialRoutesLayer, runStepRuntimePostPipelineLayer, deleteRuntimeIdempotencyEntry,
    looksLikeMetaInstruction, ROLE_SPECIALIST, PRESENTATION_SPECIALIST, DREAM_PICK_ONE_ROUTE_TOKEN,
    ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN, PRESENTATION_MAKE_ROUTE_TOKEN, SWITCH_TO_SELF_DREAM_TOKEN,
    DREAM_START_EXERCISE_ROUTE_TOKEN,
  } = deps;
  const ingressParsed = parseRunStepIngressArgs(rawArgs, { defaultStepId: STEP_0_ID });
  const incomingLanguageSourceRaw = ingressParsed.incomingLanguageSourceRaw;
  if (!ingressParsed.ok) {
    return {
      ok: false,
      tool: "run_step",
      current_step_id: ingressParsed.currentStep,
      active_specialist: String((ingressParsed.blockedState as Record<string, unknown>).active_specialist || ""),
      text: "",
      prompt: "",
      specialist: {},
      registry_version: ACTIONCODE_REGISTRY.version,
      state: ingressParsed.blockedState,
      error: {
        type: "invalid_state",
        category: "contract",
        severity: "fatal",
        retryable: false,
        message: "Input validation error for run_step.",
        retry_action: "restart_session",
        required_action: "restart_session",
        details: ingressParsed.issues,
      },
    };
  }
  const args = ingressParsed.args;
  const inputMode = args.input_mode || "chat";
  const localeHint = normalizeLocaleHint(String(args.locale_hint ?? ""));
  const localeHintSourceRaw = String(args.locale_hint_source ?? "none").trim();
  const localeHintSource =
  localeHintSourceRaw === "openai_locale" ||
  localeHintSourceRaw === "webplus_i18n" ||
  localeHintSourceRaw === "request_header" ||
  localeHintSourceRaw === "message_detect"
    ? localeHintSourceRaw
    : "none";
  const rawStateForIdempotency =
    args.state && typeof args.state === "object" && !Array.isArray(args.state)
      ? (args.state as Record<string, unknown>)
      : {};
  // SSOT ownership: server path owns idempotency registry and signals this via transient marker.
  const idempotencyRegistryOwner = String(rawStateForIdempotency.__idempotency_registry_owner || "")
    .trim()
    .toLowerCase();
  const runtimeOwnsIdempotency = idempotencyRegistryOwner !== "server";
  const idempotencyKey = String(args.idempotency_key || "").trim();
  const idempotencyScopeKey = runtimeOwnsIdempotency && idempotencyKey
    ? buildRuntimeIdempotencyScopeKey(rawStateForIdempotency)
    : "";
  const idempotencyRequestHash = runtimeOwnsIdempotency && idempotencyKey
    ? createRuntimeIdempotencyRequestHash({
        currentStepId: String(args.current_step_id || STEP_0_ID),
        defaultStepId: STEP_0_ID,
        userMessage: String(args.user_message || ""),
        inputMode: String(inputMode || "chat"),
        localeHint: String(localeHint || ""),
        localeHintSource: String(localeHintSource || "none"),
        state: rawStateForIdempotency,
      })
    : "";
  const idempotencyRecordKey =
    runtimeOwnsIdempotency && idempotencyKey && idempotencyRequestHash
      ? buildRuntimeIdempotencyRegistryKey(idempotencyScopeKey, idempotencyKey)
      : "";
  const idempotencyTracker =
    runtimeOwnsIdempotency && idempotencyKey && idempotencyRequestHash && idempotencyRecordKey
      ? {
          idempotencyKey,
          scopeKey: idempotencyScopeKey,
          requestHash: idempotencyRequestHash,
          registryKey: idempotencyRecordKey,
        }
      : null;
  const finalizeIdempotencyResult = (
    result: RunStepSuccess | RunStepError,
    options?: {
      outcome?: "fresh" | "replay" | "conflict" | "inflight";
      errorCode?: string;
      persist?: boolean;
    }
  ): RunStepSuccess | RunStepError => {
    if (!idempotencyTracker) return result;
    const outcome = options?.outcome || "fresh";
    const withDiagnostics = attachRuntimeIdempotencyDiagnostics({
      resultForClient: result as unknown as Record<string, unknown>,
      idempotencyKey,
      outcome,
      ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
    }) as RunStepSuccess | RunStepError;
    if (options?.persist === false) return withDiagnostics;
    markRuntimeIdempotencyCompleted({
      registryKey: idempotencyTracker.registryKey,
      scopeKey: idempotencyTracker.scopeKey,
      idempotencyKey: idempotencyTracker.idempotencyKey,
      requestHash: idempotencyTracker.requestHash,
      resultForClient: withDiagnostics as unknown as Record<string, unknown>,
      nowMs: Date.now(),
    });
    return withDiagnostics;
  };
  const buildIdempotencyErrorResult = (params: {
    errorType: "idempotency_conflict" | "idempotency_inflight";
    errorCode: string;
    message: string;
    retryAction: "retry_same_key" | "regenerate_key";
  }): RunStepError => {
    const normalizedState = normalizeState(args.state ?? {});
    return {
      ok: false,
      tool: "run_step",
      current_step_id: String(args.current_step_id || normalizedState.current_step || STEP_0_ID),
      active_specialist: String((normalizedState as Record<string, unknown>).active_specialist || ""),
      text: "",
      prompt: "",
      specialist: {},
      registry_version: ACTIONCODE_REGISTRY.version,
      state: normalizedState,
      error: {
        type: params.errorType,
        category: "contract",
        severity: params.errorType === "idempotency_inflight" ? "transient" : "fatal",
        retryable: params.errorType === "idempotency_inflight",
        code: params.errorCode,
        message: params.message,
        retry_action: params.retryAction,
      },
    };
  };
  if (idempotencyTracker) {
    purgeExpiredRuntimeIdempotencyEntries(Date.now());
    const existing = getRuntimeIdempotencyEntry(idempotencyTracker.registryKey);
    if (existing) {
      if (existing.requestHash !== idempotencyTracker.requestHash) {
        return finalizeIdempotencyResult(
          buildIdempotencyErrorResult({
            errorType: "idempotency_conflict",
            errorCode: RUNTIME_IDEMPOTENCY_ERROR_CODES.CONFLICT,
            message: "Deze idempotency key is al gebruikt met een ander request.",
            retryAction: "regenerate_key",
          }),
          {
            outcome: "conflict",
            errorCode: RUNTIME_IDEMPOTENCY_ERROR_CODES.CONFLICT,
            persist: false,
          }
        );
      }
      if (existing.status === "completed" && existing.resultForClient) {
        return finalizeIdempotencyResult(
          cloneRuntimeIdempotencyResult(existing.resultForClient) as unknown as RunStepSuccess | RunStepError,
          {
            outcome: "replay",
            errorCode: RUNTIME_IDEMPOTENCY_ERROR_CODES.REPLAY,
            persist: false,
          }
        );
      }
      return finalizeIdempotencyResult(
        buildIdempotencyErrorResult({
          errorType: "idempotency_inflight",
          errorCode: RUNTIME_IDEMPOTENCY_ERROR_CODES.INFLIGHT,
          message: "Een request met dezelfde idempotency key wordt al verwerkt.",
          retryAction: "retry_same_key",
        }),
        {
          outcome: "inflight",
          errorCode: RUNTIME_IDEMPOTENCY_ERROR_CODES.INFLIGHT,
          persist: false,
        }
      );
    }
    markRuntimeIdempotencyInFlight({
      registryKey: idempotencyTracker.registryKey,
      scopeKey: idempotencyTracker.scopeKey,
      idempotencyKey: idempotencyTracker.idempotencyKey,
      requestHash: idempotencyTracker.requestHash,
      nowMs: Date.now(),
    });
    const delayMs = runtimeIdempotencyDelayMs();
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  try {
  // Runtime contract marker: BSC_WORDING_CHOICE_V2 remains the single-path runtime flag.
  const policyFlags = resolveHolisticPolicyFlags();
  const wordingChoiceEnabled = policyFlags.wordingChoiceV2;
  const motivationQuotesEnabled = policyFlags.motivationQuotesV11;
  if (process.env.ACTIONCODE_LOG_INPUT_MODE === "1") {
    const incomingLanguageSourceNormalized = normalizeStateLanguageSource((args.state as Record<string, unknown>)?.language_source);
    const loggingState =
      args.state && typeof args.state === "object" ? (args.state as Record<string, unknown>) : {};
    logStructuredEvent("info", "run_step_input_mode", createStructuredLogContextFromState(loggingState, {
      step_id: args.current_step_id || loggingState.current_step,
    }), {
      inputMode,
      locale_hint: localeHint,
      locale_hint_source: localeHintSource,
      incoming_language_source_raw: incomingLanguageSourceRaw,
      incoming_language_source_normalized: incomingLanguageSourceNormalized,
    });
  }
  const decideOrchestration = (routeState: any, routeUserMessage: string) => {
    const event = deriveTransitionEventFromLegacy({ state: routeState, userMessage: routeUserMessage });
    return orchestrateFromTransition({
      state: routeState,
      userMessage: routeUserMessage,
      event,
    });
  };

  const baselineModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
  const model = baselineModel;
  const modelRoutingEnabled = envFlagEnabled("BSC_MODEL_ROUTING_V1", false);
  const modelRoutingShadow = envFlagEnabled("BSC_MODEL_ROUTING_SHADOW", true);
  const tokenLoggingEnabled = envFlagEnabled("BSC_TOKEN_LOGGING_V1", process.env.LOCAL_DEV === "1");
  const llmTurnAccumulator = createTurnLlmAccumulator();
  const uiI18nTelemetry = {
    legacy_i18n_migration_count: 0,
    ui_strings_missing_keys: 0,
    translation_fallbacks: 0,
    translation_missing_keys: 0,
    translation_html_violations: 0,
    locale_hint_used_count: 0,
    locale_hint_missing_count: 0,
    language_source_overridden_count: 0,
    ui_strings_pending_count: 0,
    parity_errors: 0,
    parity_recovered: 0,
    confirm_gate_blocked_count: 0,
    step0_escape_ready_recovered_count: 0,
    wording_body_sanitized_count: 0,
    semantic_prompt_missing_count: 0,
    semantic_confirm_blocked_count: 0,
    state_hygiene_resets_count: 0,
    wording_feedback_fallback_count: 0,
  };
  let migrationApplied = false;
  let migrationFromVersion = "";
  let blockingMarkerClass = "none";

  const rememberLlmCall = (value: { attempts: number; usage: any; model: string }) => {
    registerTurnLlmCall(llmTurnAccumulator, {
      attempts: value.attempts,
      usage: normalizeUsage(value.usage),
      model: value.model,
    });
  };

  const preflight = runStepPreflightHelpers.initializeRunStepPreflight({
    args,
    localeHint,
    localeHintSource,
    inputMode,
    uiI18nTelemetry,
  });
  migrationApplied = preflight.migrationApplied;
  migrationFromVersion = preflight.migrationFromVersion;
  let state = preflight.state;
  let rawLegacyMarkers = preflight.rawLegacyMarkers;
  const transientTextSubmit = preflight.transientTextSubmit;
  const transientPendingScores = preflight.transientPendingScores;
  const isBootstrapPollCall = preflight.isBootstrapPollCall;
  const pristineAtEntry = preflight.pristineAtEntry;
  const rawNormalized = preflight.rawNormalized;
  const lastSpecialistResult =
    (preflight.lastSpecialistResult as Record<string, unknown> | null | undefined) || {};
  let actionCodeRaw = preflight.actionCodeRaw;
  let userMessage = preflight.userMessage;
  let submittedUserText = preflight.submittedUserText;
  let clickedLabelForNoRepeat = preflight.clickedLabelForNoRepeat;
  let clickedActionCodeForNoRepeat = preflight.clickedActionCodeForNoRepeat;
  let languageResolvedThisTurn = false;
  const finalizeLayer = createRunStepRuntimeFinalizeLayer({
    routing: {
      baselineModel,
      modelRoutingEnabled,
      modelRoutingShadow,
      getState: () => state,
      getActionCodeRaw: () => actionCodeRaw,
      deriveIntentTypeForRouting: runStepPreflightHelpers.deriveIntentTypeForRouting,
      resolveModelForCall,
      shouldLogLocalDevDiagnostics,
      isUiTranslationFastModelV1Enabled,
    },
    i18n: {
      localeHint,
      localeHintSource,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      isBootstrapPollCall,
      uiI18nTelemetry,
      isUiI18nV3LangBootstrapEnabled,
      isUiStartTriggerLangResolveV1Enabled,
      isInteractiveLocaleReady,
      normalizeLangCode,
      ensureUiStringsForState,
      resolveLanguageForTurn,
      isLanguageResolvedThisTurn: () => languageResolvedThisTurn,
    },
    response: {
      tokenLoggingEnabled,
      baselineModel,
      parseMenuFromContractIdForStep,
      labelKeysForMenuActionCodes,
      onUiParityError: () => bumpUiI18nCounter(uiI18nTelemetry, "parity_errors"),
      attachRegistryPayload: (payload: any, specialist: any, flagsOverride: any, actionCodesOverride: any, renderedActionsOverride: any, wordingChoiceOverride: any, contractMetaOverride: any) =>
        attachRegistryPayload(
          payload,
          specialist,
          flagsOverride,
          actionCodesOverride,
          renderedActionsOverride,
          wordingChoiceOverride,
          contractMetaOverride
        ) as RunStepSuccess | RunStepError,
      uiI18nTelemetry,
      getMigrationApplied: () => migrationApplied,
      getMigrationFromVersion: () => migrationFromVersion,
      getBlockingMarkerClass: () => blockingMarkerClass,
      resolveTurnTokenUsage: () => ({
        usage: turnUsageFromAccumulator(llmTurnAccumulator),
        attempts: llmTurnAccumulator.attempts,
        models: [...llmTurnAccumulator.models.values()],
      }),
      getDreamRuntimeMode,
      getDreamStepId: () => DREAM_STEP_ID,
      getDreamExplainerSpecialist: () => DREAM_EXPLAINER_SPECIALIST,
      buildTextForWidget,
      pickPrompt,
      renderFreeTextTurnPolicy,
      validateRenderedContractOrRecover,
      applyUiPhaseByStep,
    },
  });

  const preflightLayer = await runStepRuntimePreflightLayer({
    ports: runStepPreflightHelpers,
    runtime: {
      state,
      rawLegacyMarkers,
      isBootstrapPollCall,
      actionCodeRaw,
      userMessage,
      submittedUserText,
      clickedLabelForNoRepeat,
      clickedActionCodeForNoRepeat,
      transientTextSubmit,
    },
    constants: {
      step0Id: STEP_0_ID,
      step0Specialist: STEP_0_SPECIALIST,
      localeHint,
      localeHintSource,
      inputMode: inputMode === "widget" ? "widget" : "chat",
    },
    finalize: {
      isUiLocaleReadyGateV1Enabled,
      resolveLocaleAndUiStringsReady: finalizeLayer.resolveLocaleAndUiStringsReady,
      ensureUiStrings: finalizeLayer.ensureUiStrings,
      finalizeResponse: finalizeLayer.finalizeResponse,
      attachRegistryPayload: (payload: any, specialist: any, flagsOverride: any) =>
        finalizeLayer.attachRegistryPayload(payload, specialist, flagsOverride),
    },
    behavior: {
      hasUsableSpecialistForRetry,
      buildTransientFallbackSpecialist,
      deriveBootstrapContract,
      buildTextForWidget,
      pickPrompt,
      buildFailClosedState,
      inferCurrentMenuForStep,
      labelForActionInMenu,
    },
    language: {
      normalizeLangCode,
      normalizeLanguageSource,
      isUiStep0LangResetGuardV1Enabled,
    },
  });
  if (preflightLayer.response) {
    return finalizeIdempotencyResult(preflightLayer.response as RunStepSuccess | RunStepError);
  }

  state = preflightLayer.state;
  actionCodeRaw = preflightLayer.actionCodeRaw;
  userMessage = preflightLayer.userMessage;
  submittedUserText = preflightLayer.submittedUserText;
  clickedLabelForNoRepeat = preflightLayer.clickedLabelForNoRepeat;
  clickedActionCodeForNoRepeat = preflightLayer.clickedActionCodeForNoRepeat;
  blockingMarkerClass = preflightLayer.blockingMarkerClass;

  const actionRoutingLayer = await runStepRuntimeActionRoutingLayer({
    runtime: {
      state,
      userMessage,
      actionCodeRaw,
      lastSpecialistResult,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      wordingChoiceEnabled,
      uiI18nTelemetry,
    },
    ids: {
      step0Id: STEP_0_ID,
      dreamStepId: DREAM_STEP_ID,
      purposeStepId: PURPOSE_STEP_ID,
      bigwhyStepId: BIGWHY_STEP_ID,
      roleStepId: ROLE_STEP_ID,
      entityStepId: ENTITY_STEP_ID,
      strategyStepId: STRATEGY_STEP_ID,
      targetgroupStepId: TARGETGROUP_STEP_ID,
      productsservicesStepId: PRODUCTSSERVICES_STEP_ID,
      rulesofthegameStepId: RULESOFTHEGAME_STEP_ID,
      presentationStepId: PRESENTATION_STEP_ID,
      dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID,
    },
    action: {
      nextMenuByActionCode: NEXT_MENU_BY_ACTIONCODE as unknown as Record<string, unknown>,
      dreamStartExerciseActionCodes: DREAM_START_EXERCISE_ACTION_CODES,
      resolveActionCodeTransition,
      inferCurrentMenuForStep,
      setUiRenderModeByStep,
      applyUiPhaseByStep,
      buildContractId,
      processActionCode,
      setDreamRuntimeMode,
      getDreamRuntimeMode,
    },
    state: {
      provisionalValueForStep,
      clearProvisionalValue,
      clearStepInteractiveState,
      isUiStateHygieneSwitchV1Enabled,
      isClearlyGeneralOfftopicInput,
      bumpUiI18nCounter: (telemetry: any, key: any) =>
        bumpUiI18nCounter(
          telemetry as any,
          key as any
        ),
    },
    wording: {
      isWordingChoiceEligibleContext,
      buildWordingChoiceFromPendingSpecialist,
      applyWordingPickSelection,
      isWordingPickRouteToken,
      isRefineAdjustRouteToken,
      buildWordingChoiceFromTurn,
      pickWordingAgentBase,
      copyPendingWordingChoiceState,
    },
    behavior: {
      ensureUiStrings: finalizeLayer.ensureUiStrings,
      normalizeNonStep0OfftopicSpecialist,
      buildTextForWidget,
      pickPrompt,
      uiStringFromStateMap,
      uiDefaultString,
      finalizeResponse: finalizeLayer.finalizeResponse,
      attachRegistryPayload: finalizeLayer.attachRegistryPayload,
      resolveResponseUiFlags: (routeToken: any) => ACTIONCODE_REGISTRY.ui_flags[routeToken] || null,
    },
  });
  if (actionRoutingLayer.response) {
    return finalizeIdempotencyResult(actionRoutingLayer.response as RunStepSuccess | RunStepError);
  }

  state = actionRoutingLayer.state;
  userMessage = actionRoutingLayer.userMessage;
  const responseUiFlags = actionRoutingLayer.responseUiFlags;

  state = await finalizeLayer.ensureLanguage(state, userMessage);
  languageResolvedThisTurn = true;
  const lang = langFromState(state);
  const uiI18nCounterPort = (telemetry: unknown, key: string) =>
    bumpUiI18nCounter(
      telemetry as any,
      key as any
    );
  const pipelinePorts = {
    ids: { step0Id: STEP_0_ID, dreamStepId: DREAM_STEP_ID, bigwhyStepId: BIGWHY_STEP_ID, strategyStepId: STRATEGY_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, strategySpecialist: STRATEGY_SPECIALIST, dreamExplainerSwitchSelfMenuId: DREAM_EXPLAINER_SWITCH_SELF_MENU_ID },
    policy: { dreamForceRefineRoutePrefix: DREAM_FORCE_REFINE_ROUTE_PREFIX, strategyConsolidateRouteToken: STRATEGY_CONSOLIDATE_ROUTE_TOKEN, bigwhyMaxWords: actionRoutingLayer.bigwhyMaxWords, uiContractVersion: UI_CONTRACT_VERSION },
    specialist: { buildRoutingContext: finalizeLayer.buildRoutingContext, callSpecialistStrictSafe },
    normalization: { normalizeEntitySpecialistResult, applyCentralMetaTopicRouter, normalizeNonStep0OfftopicSpecialist, normalizeStep0AskDisplayContract, hasValidStep0Final },
    state: { applyPostSpecialistStateMutations, getDreamRuntimeMode, isMetaOfftopicFallbackTurn, shouldTreatAsStepContributingInput, hasDreamSpecialistCandidate, buildDreamRefineFallbackSpecialist, strategyStatementsForConsolidateGuard, pickBigWhyCandidate: actionRoutingLayer.pickBigWhyCandidate, countWords: actionRoutingLayer.countWords, buildBigWhyTooLongFeedback: actionRoutingLayer.buildBigWhyTooLongFeedback, enforceDreamBuilderQuestionProgress, applyMotivationQuotesContractV11 },
    render: { renderFreeTextTurnPolicy, validateRenderedContractOrRecover, applyUiPhaseByStep, buildContractId },
    wording: { isWordingChoiceEligibleContext, buildWordingChoiceFromTurn, buildWordingChoiceFromPendingSpecialist },
    response: {
      attachRegistryPayload: finalizeLayer.attachRegistryPayload,
      turnResponseEngine: finalizeLayer.turnResponseEngine,
    },
    guard: { looksLikeMetaInstruction },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };

  const routePorts = {
    ids: { step0Id: STEP_0_ID, step0Specialist: STEP_0_SPECIALIST, dreamStepId: DREAM_STEP_ID, dreamSpecialist: DREAM_SPECIALIST, dreamExplainerSpecialist: DREAM_EXPLAINER_SPECIALIST, roleStepId: ROLE_STEP_ID, roleSpecialist: ROLE_SPECIALIST, presentationStepId: PRESENTATION_STEP_ID, presentationSpecialist: PRESENTATION_SPECIALIST },
    tokens: { dreamPickOneRouteToken: DREAM_PICK_ONE_ROUTE_TOKEN, roleChooseForMeRouteToken: ROLE_CHOOSE_FOR_ME_ROUTE_TOKEN, presentationMakeRouteToken: PRESENTATION_MAKE_ROUTE_TOKEN, switchToSelfDreamToken: SWITCH_TO_SELF_DREAM_TOKEN, dreamStartExerciseRouteToken: DREAM_START_EXERCISE_ROUTE_TOKEN },
    wording: { wordingSelectionMessage, pickPrompt, buildTextForWidget },
    state: { applyStateUpdate, setDreamRuntimeMode, getDreamRuntimeMode, isUiStateHygieneSwitchV1Enabled, clearStepInteractiveState },
    contracts: { renderFreeTextTurnPolicy, validateRenderedContractOrRecover, applyUiPhaseByStep, ensureUiStrings: finalizeLayer.ensureUiStrings, buildContractId },
    step0: { ensureStartState: finalizeLayer.ensureStartState, parseStep0Final, step0ReadinessQuestion, step0CardDescForState, step0QuestionForState },
    presentation: { generatePresentationAssets, uiStringFromStateMap, uiDefaultString },
    specialist: { callSpecialistStrictSafe, buildRoutingContext: finalizeLayer.buildRoutingContext, rememberLlmCall },
    response: { attachRegistryPayload: finalizeLayer.attachRegistryPayload, finalizeResponse: finalizeLayer.finalizeResponse, turnResponseEngine: finalizeLayer.turnResponseEngine },
    suggestions: { pickDreamSuggestionFromPreviousState, pickDreamCandidateFromState, pickRoleSuggestionFromPreviousState },
    i18n: { bumpUiI18nCounter: uiI18nCounterPort },
  };

  const specialRoutesLayer = await runStepRuntimeSpecialRoutesLayer({
    runtime: {
      state,
      userMessage,
      actionCodeRaw,
      responseUiFlags,
      inputMode: inputMode === "widget" ? "widget" : "chat",
      wordingChoiceEnabled,
      languageResolvedThisTurn,
      isBootstrapPollCall,
      motivationQuotesEnabled,
      uiI18nTelemetry,
      transientPendingScores: transientPendingScores as number[][] | null,
      submittedUserText,
      rawNormalized,
      pristineAtEntry,
      lang,
      model,
    },
    specialist: { decideOrchestration, rememberLlmCall },
    routePorts,
  });
  if (specialRoutesLayer.response) {
    return finalizeIdempotencyResult(specialRoutesLayer.response as RunStepSuccess | RunStepError);
  }

  const postPipelineResult = await runStepRuntimePostPipelineLayer({
    context: specialRoutesLayer.context,
    pipelinePorts,
  });
  return finalizeIdempotencyResult(postPipelineResult);
  } catch (error) {
    if (idempotencyTracker) {
      deleteRuntimeIdempotencyEntry(idempotencyTracker.registryKey);
    }
    throw error;
  }
}
