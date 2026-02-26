import { callStrictJson, type LLMUsage } from "../core/llm.js";
import { resolveModelForCall } from "../core/model_routing.js";
import type { CanvasState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";

import {
  STEP_0_ID,
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";

import {
  DREAM_STEP_ID,
  DREAM_SPECIALIST,
  DREAM_INSTRUCTIONS,
  DreamJsonSchema,
  DreamZodSchema,
  buildDreamSpecialistInput,
  type DreamOutput,
} from "../steps/dream.js";

import {
  DREAM_EXPLAINER_SPECIALIST,
  DREAM_EXPLAINER_INSTRUCTIONS,
  DreamExplainerJsonSchema,
  DreamExplainerZodSchema,
  buildDreamExplainerSpecialistInput,
  type DreamExplainerOutput,
} from "../steps/dream_explainer.js";

import {
  PURPOSE_STEP_ID,
  PURPOSE_SPECIALIST,
  PURPOSE_INSTRUCTIONS,
  PurposeJsonSchema,
  PurposeZodSchema,
  buildPurposeSpecialistInput,
  type PurposeOutput,
} from "../steps/purpose.js";

import {
  BIGWHY_STEP_ID,
  BIGWHY_SPECIALIST,
  BIGWHY_INSTRUCTIONS,
  BigWhyJsonSchema,
  BigWhyZodSchema,
  buildBigWhySpecialistInput,
  type BigWhyOutput,
} from "../steps/bigwhy.js";

import {
  ROLE_STEP_ID,
  ROLE_SPECIALIST,
  ROLE_INSTRUCTIONS,
  RoleJsonSchema,
  RoleZodSchema,
  buildRoleSpecialistInput,
  type RoleOutput,
} from "../steps/role.js";

import {
  ENTITY_STEP_ID,
  ENTITY_SPECIALIST,
  ENTITY_INSTRUCTIONS,
  EntityJsonSchema,
  EntityZodSchema,
  buildEntitySpecialistInput,
  type EntityOutput,
} from "../steps/entity.js";

import {
  STRATEGY_STEP_ID,
  STRATEGY_SPECIALIST,
  STRATEGY_INSTRUCTIONS,
  StrategyJsonSchema,
  StrategyZodSchema,
  buildStrategySpecialistInput,
  type StrategyOutput,
} from "../steps/strategy.js";

import {
  TARGETGROUP_STEP_ID,
  TARGETGROUP_SPECIALIST,
  TARGETGROUP_INSTRUCTIONS,
  TargetGroupJsonSchema,
  TargetGroupZodSchema,
  buildTargetGroupSpecialistInput,
  type TargetGroupOutput,
} from "../steps/targetgroup.js";

import {
  PRODUCTSSERVICES_STEP_ID,
  PRODUCTSSERVICES_SPECIALIST,
  PRODUCTSSERVICES_INSTRUCTIONS,
  ProductsServicesJsonSchema,
  ProductsServicesZodSchema,
  buildProductsServicesSpecialistInput,
  type ProductsServicesOutput,
} from "../steps/productsservices.js";

import {
  RULESOFTHEGAME_STEP_ID,
  RULESOFTHEGAME_SPECIALIST,
  RULESOFTHEGAME_INSTRUCTIONS,
  RulesOfTheGameJsonSchema,
  RulesOfTheGameZodSchema,
  buildRulesOfTheGameSpecialistInput,
  type RulesOfTheGameOutput,
  postProcessRulesOfTheGame,
  buildRulesOfTheGameBullets,
  buildUserFeedbackForRulesProcessing,
} from "../steps/rulesofthegame.js";
import { normalizeRulesOfTheGameOutputContract } from "../steps/rulesofthegame_contract.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  PRESENTATION_INSTRUCTIONS,
  PresentationJsonSchema,
  PresentationZodSchema,
  buildPresentationSpecialistInput,
  type PresentationOutput,
} from "../steps/presentation.js";

export type SpecialistInstructionBlocks = {
  languageLockInstruction: string;
  recapInstruction: string;
  universalMetaOfftopicPolicy: string;
  userIntentContractInstruction: string;
  metaTopicContractInstruction: string;
  offtopicFlagContractInstruction: string;
};

export type SpecialistCallParams = {
  model: string;
  state: CanvasState;
  decision: OrchestratorOutput;
  userMessage: string;
};

export type SpecialistCallResult = {
  specialistResult: any;
  attempts: number;
  usage: LLMUsage;
  model: string;
};

export type RunStepErrorLike = {
  ok: false;
  tool: "run_step";
  current_step_id: string;
  active_specialist: string;
  text: string;
  prompt: string;
  specialist: any;
  registry_version?: string;
  state: CanvasState;
  error: Record<string, unknown>;
  ui?: any;
  presentation_assets?: any;
  debug?: any;
};

type DreamRuntimeMode = "self" | "builder_collect" | "builder_scoring" | "builder_refine";

type CallSpecialistStrictDeps = {
  instructionBlocks: SpecialistInstructionBlocks;
  buildSpecialistContextBlock: (state: CanvasState) => string;
  langFromState: (state: CanvasState) => string;
  getDreamRuntimeMode: (state: CanvasState) => DreamRuntimeMode;
};

type BuildTransientFallbackDeps = {
  step0CardDescForState: (state: CanvasState | null | undefined) => string;
  step0QuestionForState: (state: CanvasState | null | undefined) => string;
  pickPrompt: (specialist: any) => string;
  renderFreeTextTurnPolicy: (params: {
    stepId: string;
    state: CanvasState;
    specialist: Record<string, unknown>;
    previousSpecialist: Record<string, unknown>;
  }) => { specialist: Record<string, unknown> };
};

type ErrorPayloadDeps = {
  resolveHolisticPolicyFlags: () => { timeoutGuardV2: boolean };
  buildTransientFallbackSpecialist: (state: CanvasState) => Record<string, unknown>;
  attachRegistryPayload: <T extends Record<string, unknown>>(
    payload: T,
    specialist: Record<string, unknown>
  ) => T;
  uiStringFromStateMap: (state: CanvasState | null | undefined, key: string, fallback: string) => string;
  uiDefaultString: (key: string, fallback: string) => string;
  logFromState?: (params: {
    severity: "info" | "warn" | "error";
    event: string;
    state: CanvasState;
    step_id?: string;
    contract_id?: string;
    details?: Record<string, unknown>;
  }) => void;
};

type CallSpecialistStrictSafeDeps = {
  callSpecialistStrict: (params: SpecialistCallParams) => Promise<SpecialistCallResult>;
  shouldLogLocalDevDiagnostics: () => boolean;
  buildRateLimitErrorPayload: (state: CanvasState, err: any) => RunStepErrorLike;
  buildTimeoutErrorPayload: (state: CanvasState, err: any) => RunStepErrorLike;
  logFromState?: (params: {
    severity: "info" | "warn" | "error";
    event: string;
    state: CanvasState;
    step_id?: string;
    contract_id?: string;
    details?: Record<string, unknown>;
  }) => void;
};

export function composeSpecialistInstructions(
  baseInstructions: string,
  contextBlock: string,
  instructionBlocks: SpecialistInstructionBlocks,
  options?: { includeUniversalMeta?: boolean }
): string {
  const blocks = [
    baseInstructions,
    instructionBlocks.languageLockInstruction,
    contextBlock,
    instructionBlocks.recapInstruction,
  ];
  if (options?.includeUniversalMeta) {
    blocks.push(instructionBlocks.universalMetaOfftopicPolicy);
  }
  blocks.push(instructionBlocks.userIntentContractInstruction);
  blocks.push(instructionBlocks.metaTopicContractInstruction);
  blocks.push(instructionBlocks.offtopicFlagContractInstruction);
  return blocks.join("\n\n");
}

export async function callSpecialistStrict(
  params: SpecialistCallParams,
  deps: CallSpecialistStrictDeps
): Promise<SpecialistCallResult> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = deps.buildSpecialistContextBlock(state);
  const lang = deps.langFromState(state);

  if (process.env.TS_NODE_TRANSPILE_ONLY === "true" && process.env.RUN_INTEGRATION_TESTS !== "1") {
    if (process.env.TEST_FORCE_RATE_LIMIT === "1") {
      const err = new Error("rate_limit_exceeded");
      (err as any).rate_limited = true;
      (err as any).retry_after_ms = 1500;
      throw err;
    }
    if (process.env.TEST_FORCE_TIMEOUT === "1") {
      const err = new Error("timeout");
      (err as any).type = "timeout";
      (err as any).retry_action = "retry_same_action";
      throw err;
    }
    const forceOfftopic = process.env.TEST_FORCE_OFFTOPIC === "1";
    const base = {
      action: "ASK",
      message: "",
      question: "Test question",
      refined_formulation: "",
      wants_recap: false,
      is_offtopic: forceOfftopic,
      user_intent: forceOfftopic ? "OFFTOPIC" : "STEP_INPUT",
      meta_topic: "NONE",
    };
    const specialistResult =
      specialist === STEP_0_SPECIALIST
        ? { ...base, business_name: "TBD", step_0: "" }
        : base;
    return {
      specialistResult,
      attempts: 0,
      usage: {
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        provider_available: false,
      },
      model,
    };
  }

  if (specialist === STEP_0_SPECIALIST) {
    const langExplicit = String((state as any).language ?? "").trim();
    const plannerInput = buildStep0SpecialistInput(userMessage, langExplicit ? lang : "");

    const res = await callStrictJson<ValidationAndBusinessNameOutput>({
      model,
      instructions: composeSpecialistInstructions(
        VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
        contextBlock,
        deps.instructionBlocks
      ),
      plannerInput,
      schemaName: "ValidationAndBusinessName",
      jsonSchema: ValidationAndBusinessNameJsonSchema as any,
      zodSchema: ValidationAndBusinessNameZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 2048,
      debugLabel: "ValidationAndBusinessName",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === DREAM_SPECIALIST) {
    const langExplicitDream = String((state as any).language ?? "").trim();
    const plannerInput = buildDreamSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitDream ? lang : ""
    );

    const res = await callStrictJson<DreamOutput>({
      model,
      instructions: composeSpecialistInstructions(DREAM_INSTRUCTIONS, contextBlock, deps.instructionBlocks),
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === DREAM_EXPLAINER_SPECIALIST) {
    const langExplicitExplainer = String((state as any).language ?? "").trim();
    const fromCanonical = Array.isArray((state as any).dream_builder_statements)
      ? ((state as any).dream_builder_statements as string[])
      : [];
    const fromLast = Array.isArray((state as any).last_specialist_result?.statements)
      ? ((state as any).last_specialist_result.statements as string[])
      : [];
    const fromScoring = Array.isArray((state as any).dream_scoring_statements)
      ? ((state as any).dream_scoring_statements as string[])
      : [];
    const previousStatements =
      fromCanonical.length > 0
        ? fromCanonical
        : fromScoring.length >= fromLast.length && fromScoring.length > 0
          ? fromScoring
          : fromLast;
    const dreamAwaitingDirection = String((state as any).dream_awaiting_direction ?? "").trim() === "true";
    const topClusters = dreamAwaitingDirection && Array.isArray((state as any).dream_top_clusters)
      ? ((state as any).dream_top_clusters as { theme: string; average: number }[])
      : undefined;
    const businessContext = dreamAwaitingDirection && topClusters
      ? {
          step_0_final: String((state as any).step_0_final ?? "").trim(),
          business_name: String((state as any).business_name ?? "").trim(),
        }
      : undefined;
    const plannerInput = buildDreamExplainerSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitExplainer ? lang : "",
      previousStatements,
      topClusters,
      businessContext,
      deps.getDreamRuntimeMode(state)
    );

    const res = await callStrictJson<DreamExplainerOutput>({
      model,
      instructions: composeSpecialistInstructions(
        DREAM_EXPLAINER_INSTRUCTIONS,
        contextBlock,
        deps.instructionBlocks,
        {
          includeUniversalMeta: true,
        }
      ),
      plannerInput,
      schemaName: "DreamExplainer",
      jsonSchema: DreamExplainerJsonSchema as any,
      zodSchema: DreamExplainerZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "DreamExplainer",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PURPOSE_SPECIALIST) {
    const plannerInput = buildPurposeSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PURPOSE_STEP_ID),
      lang
    );

    const res = await callStrictJson<PurposeOutput>({
      model,
      instructions: composeSpecialistInstructions(PURPOSE_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Purpose",
      jsonSchema: PurposeJsonSchema as any,
      zodSchema: PurposeZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Purpose",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === BIGWHY_SPECIALIST) {
    const plannerInput = buildBigWhySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || BIGWHY_STEP_ID),
      lang
    );

    const res = await callStrictJson<BigWhyOutput>({
      model,
      instructions: composeSpecialistInstructions(BIGWHY_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "BigWhy",
      jsonSchema: BigWhyJsonSchema as any,
      zodSchema: BigWhyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "BigWhy",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === ROLE_SPECIALIST) {
    const plannerInput = buildRoleSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ROLE_STEP_ID),
      lang
    );

    const res = await callStrictJson<RoleOutput>({
      model,
      instructions: composeSpecialistInstructions(ROLE_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Role",
      jsonSchema: RoleJsonSchema as any,
      zodSchema: RoleZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Role",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === ENTITY_SPECIALIST) {
    const plannerInput = buildEntitySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || ENTITY_STEP_ID),
      lang
    );

    const res = await callStrictJson<EntityOutput>({
      model,
      instructions: composeSpecialistInstructions(ENTITY_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Entity",
      jsonSchema: EntityJsonSchema as any,
      zodSchema: EntityZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Entity",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === STRATEGY_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildStrategySpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || STRATEGY_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<StrategyOutput>({
      model,
      instructions: composeSpecialistInstructions(STRATEGY_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Strategy",
      jsonSchema: StrategyJsonSchema as any,
      zodSchema: StrategyZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Strategy",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === TARGETGROUP_SPECIALIST) {
    const plannerInput = buildTargetGroupSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || TARGETGROUP_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<TargetGroupOutput>({
      model,
      instructions: composeSpecialistInstructions(TARGETGROUP_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "TargetGroup",
      jsonSchema: TargetGroupJsonSchema as any,
      zodSchema: TargetGroupZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "TargetGroup",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PRODUCTSSERVICES_SPECIALIST) {
    const plannerInput = buildProductsServicesSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRODUCTSSERVICES_STEP_ID),
      lang,
      contextBlock
    );

    const res = await callStrictJson<ProductsServicesOutput>({
      model,
      instructions: composeSpecialistInstructions(
        PRODUCTSSERVICES_INSTRUCTIONS,
        contextBlock,
        deps.instructionBlocks,
        {
          includeUniversalMeta: true,
        }
      ),
      plannerInput,
      schemaName: "ProductsServices",
      jsonSchema: ProductsServicesJsonSchema as any,
      zodSchema: ProductsServicesZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "ProductsServices",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === RULESOFTHEGAME_SPECIALIST) {
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildRulesOfTheGameSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || RULESOFTHEGAME_STEP_ID),
      lang,
      statementsFromLast
    );

    const res = await callStrictJson<RulesOfTheGameOutput>({
      model,
      instructions: composeSpecialistInstructions(RULESOFTHEGAME_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "RulesOfTheGame",
      jsonSchema: RulesOfTheGameJsonSchema as any,
      zodSchema: RulesOfTheGameZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "RulesOfTheGame",
    });

    let data = res.data;
    const normalizedRules = normalizeRulesOfTheGameOutputContract({
      specialist: data as unknown as Record<string, unknown>,
      previousStatements: statementsFromLast,
    });
    data = normalizedRules.specialist as any;

    // Apply post-processing when a Rules of the Game candidate is present.
    if (
      data &&
      typeof data === "object" &&
      typeof (data as any).rulesofthegame === "string" &&
      String((data as any).rulesofthegame || "").trim() !== ""
    ) {
      const statementsForProcessing = Array.isArray((data as any).statements)
        ? ((data as any).statements as string[])
        : [];
      const processed = postProcessRulesOfTheGame(statementsForProcessing, 6);
      const bullets = buildRulesOfTheGameBullets(processed.finalRules);

      if (bullets) {
        data = {
          ...(data as any),
          refined_formulation: bullets,
          rulesofthegame: bullets,
        };
      }

      const feedback = buildUserFeedbackForRulesProcessing(processed);
      if (feedback) {
        const baseMessage =
          typeof (data as any).message === "string" ? String((data as any).message).trim() : "";
        (data as any) = {
          ...(data as any),
          message: baseMessage ? `${baseMessage}\n\n${feedback}` : feedback,
        };
      }
    }

    return { specialistResult: data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PRESENTATION_SPECIALIST) {
    const plannerInput = buildPresentationSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRESENTATION_STEP_ID),
      lang
    );

    const res = await callStrictJson<PresentationOutput>({
      model,
      instructions: composeSpecialistInstructions(PRESENTATION_INSTRUCTIONS, contextBlock, deps.instructionBlocks, {
        includeUniversalMeta: true,
      }),
      plannerInput,
      schemaName: "Presentation",
      jsonSchema: PresentationJsonSchema as any,
      zodSchema: PresentationZodSchema,
      temperature: 0.2,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Presentation",
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  return {
    specialistResult: {
      action: "ESCAPE",
      message: "I can only help you here with The Business Strategy Canvas Builder.",
      question: "Do you want to continue with verification now?",
      refined_formulation: "",
      business_name: "TBD",
      step_0: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    attempts: 0,
    usage: {
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      provider_available: false,
    },
    model,
  };
}

export function isRateLimitError(err: any): boolean {
  return Boolean(
    err &&
    (err.rate_limited === true ||
      err.code === "rate_limit_exceeded" ||
      err.type === "rate_limit_exceeded" ||
      err.status === 429)
  );
}

export function isTimeoutError(err: any): boolean {
  return Boolean(err && err.type === "timeout");
}

export function hasUsableSpecialistForRetry(
  specialist: any,
  pickPrompt: (specialist: any) => string
): boolean {
  if (!specialist || typeof specialist !== "object") return false;
  const action = String(specialist.action || "").trim().toUpperCase();
  if (action !== "ASK") return false;
  const prompt = pickPrompt(specialist);
  const message = String(specialist.message || "").trim();
  const refined = String(specialist.refined_formulation || "").trim();
  return Boolean(prompt || message || refined);
}

export function buildTransientFallbackSpecialist(
  state: CanvasState,
  deps: BuildTransientFallbackDeps
): Record<string, unknown> {
  const last = ((state as any).last_specialist_result || {}) as Record<string, unknown>;
  if (hasUsableSpecialistForRetry(last, deps.pickPrompt)) return last;

  const stepId = String((state as any).current_step || STEP_0_ID);
  if (stepId === STEP_0_ID) {
    return {
      action: "ASK",
      message: deps.step0CardDescForState(state),
      question: deps.step0QuestionForState(state),
      refined_formulation: "",
      business_name: String((state as any).business_name || "TBD"),
      step_0: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    };
  }

  const rendered = deps.renderFreeTextTurnPolicy({
    stepId,
    state,
    specialist: {
      action: "ASK",
      message: "",
      question: "",
      refined_formulation: "",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: last,
  });
  return rendered.specialist;
}

export function buildRateLimitErrorPayload(
  state: CanvasState,
  err: any,
  deps: ErrorPayloadDeps
): RunStepErrorLike {
  const retryAfterMs = Number(err?.retry_after_ms) > 0 ? Number(err.retry_after_ms) : 1500;
  const timeoutGuardEnabled = deps.resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? deps.buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    deps.logFromState?.({
      severity: "warn",
      event: "transient_fallback_returned",
      state,
      step_id: String(state.current_step || "step_0"),
      details: {
        type: "rate_limited",
        retry_after_ms: retryAfterMs,
        client_action_id: String((state as any).__client_action_id ?? ""),
      },
    });
  }
  return deps.attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "rate_limited",
      category: "infra",
      severity: "transient",
      retryable: true,
      retry_after_ms: retryAfterMs,
      user_message: deps.uiStringFromStateMap(
        state,
        "transient.rate_limited",
        deps.uiDefaultString("transient.rate_limited", "Please wait a moment and try again.")
      ),
      retry_action: "retry_same_action",
    },
  }, last) as RunStepErrorLike;
}

export function buildTimeoutErrorPayload(
  state: CanvasState,
  err: any,
  deps: ErrorPayloadDeps
): RunStepErrorLike {
  void err;
  const timeoutGuardEnabled = deps.resolveHolisticPolicyFlags().timeoutGuardV2;
  const last = timeoutGuardEnabled
    ? deps.buildTransientFallbackSpecialist(state)
    : ((state as any).last_specialist_result || {});
  if (timeoutGuardEnabled) {
    deps.logFromState?.({
      severity: "warn",
      event: "transient_fallback_returned",
      state,
      step_id: String(state.current_step || "step_0"),
      details: {
        type: "timeout",
        client_action_id: String((state as any).__client_action_id ?? ""),
      },
    });
  }
  return deps.attachRegistryPayload({
    ok: false as const,
    tool: "run_step" as const,
    current_step_id: String(state.current_step || "step_0"),
    active_specialist: String((state as any).active_specialist || ""),
    text: "",
    prompt: "",
    specialist: last,
    state,
    error: {
      type: "timeout",
      category: "infra",
      severity: "transient",
      retryable: true,
      user_message: deps.uiStringFromStateMap(
        state,
        "transient.timeout",
        deps.uiDefaultString("transient.timeout", "This is taking longer than usual. Please try again.")
      ),
      retry_action: "retry_same_action",
    },
  }, last) as RunStepErrorLike;
}

export async function callSpecialistStrictSafe(
  params: SpecialistCallParams,
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState,
  deps: CallSpecialistStrictSafeDeps
): Promise<
  { ok: true; value: SpecialistCallResult }
  | { ok: false; payload: RunStepErrorLike }
> {
  const startedAt = Date.now();
  const logDiagnostics = deps.shouldLogLocalDevDiagnostics();
  const routeDecision = resolveModelForCall({
    fallbackModel: params.model,
    routingEnabled: routing.enabled,
    actionCode: routing.actionCode,
    intentType: routing.intentType,
    specialist: String(params.decision?.specialist_to_call ?? ""),
    purpose: "specialist",
  });
  if (
    !routeDecision.applied &&
    routing.shadow &&
    (deps.shouldLogLocalDevDiagnostics() || process.env.BSC_MODEL_ROUTING_SHADOW_LOG === "1") &&
    routeDecision.candidate_model &&
    routeDecision.candidate_model !== params.model
  ) {
    deps.logFromState?.({
      severity: "info",
      event: "model_routing_shadow",
      state: stateForError,
      step_id: String(params.decision?.current_step ?? ""),
      details: {
        specialist: String(params.decision?.specialist_to_call ?? ""),
        baseline_model: params.model,
        shadow_model: routeDecision.candidate_model,
        source: routeDecision.source,
        config_version: routeDecision.config_version,
        client_action_id: String((stateForError as any).__client_action_id ?? ""),
      },
    });
  }
  const callParams = {
    ...params,
    model: routeDecision.model,
  };
  try {
    const value = await deps.callSpecialistStrict(callParams);
    if (logDiagnostics) {
      deps.logFromState?.({
        severity: "info",
        event: "run_step_llm_call",
        state: stateForError,
        step_id: String(params.decision?.current_step ?? ""),
        details: {
          ok: true,
          specialist: String(params.decision?.specialist_to_call ?? ""),
          model: String(value.model || routeDecision.model || ""),
          model_source: routeDecision.source,
          elapsed_ms: Date.now() - startedAt,
          client_action_id: String((stateForError as any).__client_action_id ?? ""),
        },
      });
    }
    return { ok: true as const, value };
  } catch (err: any) {
    if (logDiagnostics) {
      deps.logFromState?.({
        severity: "warn",
        event: "run_step_llm_call",
        state: stateForError,
        step_id: String(params.decision?.current_step ?? ""),
        details: {
          ok: false,
          specialist: String(params.decision?.specialist_to_call ?? ""),
          model: String(routeDecision.model || ""),
          model_source: routeDecision.source,
          elapsed_ms: Date.now() - startedAt,
          client_action_id: String((stateForError as any).__client_action_id ?? ""),
          error_type: String(err?.type ?? err?.code ?? err?.name ?? "unknown"),
        },
      });
    }
    if (isRateLimitError(err)) {
      return { ok: false as const, payload: deps.buildRateLimitErrorPayload(stateForError, err) };
    }
    if (isTimeoutError(err)) {
      return { ok: false as const, payload: deps.buildTimeoutErrorPayload(stateForError, err) };
    }
    throw err;
  }
}

export function createCallSpecialistStrict(
  deps: CallSpecialistStrictDeps
): (params: SpecialistCallParams) => Promise<SpecialistCallResult> {
  return (params: SpecialistCallParams) => callSpecialistStrict(params, deps);
}

export function createBuildTransientFallbackSpecialist(
  deps: BuildTransientFallbackDeps
): (state: CanvasState) => Record<string, unknown> {
  return (state: CanvasState) => buildTransientFallbackSpecialist(state, deps);
}

export function createBuildRateLimitErrorPayload(
  deps: ErrorPayloadDeps
): (state: CanvasState, err: any) => RunStepErrorLike {
  return (state: CanvasState, err: any) => buildRateLimitErrorPayload(state, err, deps);
}

export function createBuildTimeoutErrorPayload(
  deps: ErrorPayloadDeps
): (state: CanvasState, err: any) => RunStepErrorLike {
  return (state: CanvasState, err: any) => buildTimeoutErrorPayload(state, err, deps);
}

export function createCallSpecialistStrictSafe(
  deps: CallSpecialistStrictSafeDeps
): (
  params: SpecialistCallParams,
  routing: {
    enabled: boolean;
    shadow: boolean;
    actionCode?: string;
    intentType?: string;
  },
  stateForError: CanvasState
) => Promise<{ ok: true; value: SpecialistCallResult } | { ok: false; payload: RunStepErrorLike }> {
  return (
    params: SpecialistCallParams,
    routing: {
      enabled: boolean;
      shadow: boolean;
      actionCode?: string;
      intentType?: string;
    },
    stateForError: CanvasState
  ) => callSpecialistStrictSafe(params, routing, stateForError, deps);
}
