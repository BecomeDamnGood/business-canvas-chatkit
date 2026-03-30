import { loadModule as loadCld3 } from "cld3-asm";
import type { ZodType } from "zod";

import { __hasInjectedTestClient, callStrictJson, type LLMUsage, type StrictJsonSchema } from "../core/llm.js";
import { normalizeDreamBuilderStatements, type CanvasState } from "../core/state.js";
import type { OrchestratorOutput } from "../core/orchestrator.js";

import {
  STEP_0_SPECIALIST,
  VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS,
  ValidationAndBusinessNameJsonSchema,
  ValidationAndBusinessNameZodSchema,
  buildStep0SpecialistInput,
  type ValidationAndBusinessNameOutput,
} from "../steps/step_0_validation.js";
import {
  STEP_0_BOOTSTRAP_SPECIALIST,
  STEP_0_BOOTSTRAP_INSTRUCTIONS,
  Step0BootstrapExtractionJsonSchema,
  Step0BootstrapExtractionZodSchema,
  buildStep0BootstrapSpecialistInput,
  type Step0BootstrapExtractionOutput,
} from "../steps/step_0_bootstrap.js";
import {
  STEP_0_TURN_INTENT_SPECIALIST,
  STEP_0_TURN_INTENT_INSTRUCTIONS,
  Step0TurnIntentJsonSchema,
  Step0TurnIntentZodSchema,
  buildStep0TurnIntentSpecialistInput,
  type Step0TurnIntentOutput,
} from "../steps/step_0_turn_intent.js";

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
  type TopClusterDetailInfo,
  type DreamExplainerOutput,
} from "../steps/dream_explainer.js";
import { resolveUiStringForState } from "../i18n/ui_strings_lookup.js";

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
} from "../steps/rulesofthegame.js";
import { normalizeRulesOfTheGameOutputContract } from "../steps/rulesofthegame_contract.js";
import { applyRulesRuntimePolicy } from "../steps/rulesofthegame_runtime_policy.js";
import { applyDreamRuntimePolicy } from "../steps/dream_runtime_policy.js";

import {
  PRESENTATION_STEP_ID,
  PRESENTATION_SPECIALIST,
  PRESENTATION_INSTRUCTIONS,
  PresentationJsonSchema,
  PresentationZodSchema,
  buildPresentationSpecialistInput,
  type PresentationOutput,
} from "../steps/presentation.js";
import {
  buildExplainLightInstructions,
  shouldUseExplainLightProfile,
} from "../steps/explain_profile.js";

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

export type BuildTransientFallbackDeps = {
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

export type ErrorPayloadDeps = {
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

export type CallSpecialistStrictSafeDeps = {
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

function isPlannerContextDedupEnabled(): boolean {
  return String(process.env.BSC_DEDUP_CONTEXT_PLANNER_V1 || "1").trim() !== "0";
}

const LANGUAGE_GUARD_EXCLUDED_KEYS = new Set([
  "action",
  "feedback_mode",
  "step_support_state",
  "wants_recap",
  "is_offtopic",
  "user_intent",
  "meta_topic",
  "recognized",
  "status",
  "scoring_phase",
  "suggest_dreambuilder",
  "user_state",
  "selected_option",
  "submit_action",
  "submit_enabled",
  "__content_locale",
  "__content_language",
  "content_locale",
  "content_language",
]);

const LANGUAGE_GUARD_MIN_ALPHA = 8;
let _languageGuardCld3Promise: Promise<any> | null = null;
let _languageGuardIdentifier: any | null = null;

function normalizeLanguageGuardCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split("-")[0]
    .trim();
}

function countAlphabeticChars(input: string): number {
  return (String(input || "").match(/\p{L}/gu) || []).length;
}

function isMachineLikeLanguageGuardValue(raw: string): boolean {
  const value = String(raw || "").trim();
  if (!value) return true;
  if (/^(__ROUTE__|ACTION_|choice:)/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^\{[0-9]+\}$/.test(value)) return true;
  if (/^(true|false|existing|starting)$/i.test(value)) return true;
  return false;
}

function collectUserFacingLanguageGuardStrings(value: unknown, currentKey = ""): string[] {
  if (typeof value === "string") {
    if (LANGUAGE_GUARD_EXCLUDED_KEYS.has(currentKey)) return [];
    if (isMachineLikeLanguageGuardValue(value)) return [];
    return [String(value || "").trim()].filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUserFacingLanguageGuardStrings(item, currentKey));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectUserFacingLanguageGuardStrings(child, String(key || "").trim())
    );
  }
  return [];
}

async function getLanguageGuardIdentifier(): Promise<any> {
  if (_languageGuardIdentifier) return _languageGuardIdentifier;
  if (!_languageGuardCld3Promise) {
    _languageGuardCld3Promise = loadCld3();
  }
  const factory = await _languageGuardCld3Promise;
  _languageGuardIdentifier = factory.create(0, 512);
  return _languageGuardIdentifier;
}

export async function detectLanguageGuardLanguage(text: string): Promise<{ lang: string; confident: boolean }> {
  const raw = String(text || "").trim();
  if (!raw || countAlphabeticChars(raw) < LANGUAGE_GUARD_MIN_ALPHA) {
    return { lang: "", confident: false };
  }
  try {
    const id = await getLanguageGuardIdentifier();
    const res = id.findLanguage(raw) || {};
    const lang = normalizeLanguageGuardCode(String(res.language || ""));
    const probability =
      typeof res.probability === "number" ? res.probability :
      typeof res.prob === "number" ? res.prob : 0;
    const reliable =
      typeof res.isReliable === "boolean" ? res.isReliable :
      typeof res.is_reliable === "boolean" ? res.is_reliable : false;
    return { lang, confident: Boolean(lang && (reliable || probability >= 0.7)) };
  } catch {
    return { lang: "", confident: false };
  }
}

export async function shouldNormalizeSpecialistResultLanguage(params: {
  specialistResult: Record<string, unknown>;
  targetLanguage: string;
  detectLanguage?: (text: string) => Promise<{ lang: string; confident: boolean }>;
}): Promise<boolean> {
  const targetLanguage = normalizeLanguageGuardCode(params.targetLanguage);
  if (!targetLanguage || targetLanguage === "und") return false;
  const detectLanguage = params.detectLanguage || detectLanguageGuardLanguage;
  const userFacingStrings = collectUserFacingLanguageGuardStrings(params.specialistResult);
  for (const candidate of userFacingStrings) {
    if (countAlphabeticChars(candidate) < LANGUAGE_GUARD_MIN_ALPHA) continue;
    const detected = await detectLanguage(candidate);
    const detectedLanguage = normalizeLanguageGuardCode(String(detected.lang || ""));
    if (detected.confident && detectedLanguage && detectedLanguage !== targetLanguage) {
      return true;
    }
  }
  return false;
}

function mergeUsageLocal(first: LLMUsage, second: LLMUsage): LLMUsage {
  const inputUnknown = first.input_tokens === null || second.input_tokens === null;
  const outputUnknown = first.output_tokens === null || second.output_tokens === null;
  const totalUnknown = first.total_tokens === null || second.total_tokens === null;
  return {
    input_tokens: inputUnknown ? null : (first.input_tokens || 0) + (second.input_tokens || 0),
    output_tokens: outputUnknown ? null : (first.output_tokens || 0) + (second.output_tokens || 0),
    total_tokens: totalUnknown ? null : (first.total_tokens || 0) + (second.total_tokens || 0),
    provider_available: first.provider_available || second.provider_available,
  };
}

function buildLanguageRepairInstructions(schemaName: string): string {
  const specialStep0Rule =
    schemaName === "ValidationAndBusinessName"
      ? [
          "- The field step_0 uses a fixed storage pattern.",
          '- Keep the exact keys/tokens "Venture:", "Name:", "Status:" and the exact status values "existing" / "starting".',
          "- Do not break or restructure the step_0 line.",
        ].join("\n")
      : "";
  return [
    "SPECIALIST OUTPUT LANGUAGE REPAIR (HARD)",
    "- You receive valid JSON that already matches the schema exactly.",
    "- Translate every user-facing JSON string value into LANGUAGE.",
    "- Keep the JSON structure exactly unchanged.",
    "- Do NOT change keys, enum values, booleans, numbers, route tokens, action codes, placeholders, URLs, or control fields.",
    "- Do NOT translate or alter the product name 'The Business Strategy Canvas Builder'.",
    "- Do NOT translate business names or proper names.",
    "- If a string is already in LANGUAGE, keep it as-is.",
    "- Never mix languages across user-facing strings in the result.",
    specialStep0Rule,
    "- Return ONLY valid JSON matching the schema exactly.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLanguageRepairPlannerInput(params: {
  targetLanguage: string;
  specialistResult: Record<string, unknown>;
  state: CanvasState;
}): string {
  const businessName = String((params.state as any).business_name || "").trim();
  return [
    `LANGUAGE: ${params.targetLanguage}`,
    businessName && businessName !== "TBD" ? `BUSINESS_NAME: ${businessName}` : "",
    "CURRENT_JSON:",
    JSON.stringify(params.specialistResult),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function normalizeSpecialistResultLanguage<T>(params: {
  specialistResult: T;
  targetLanguage: string;
  model: string;
  schemaName: string;
  jsonSchema: StrictJsonSchema;
  zodSchema: ZodType<T>;
  state: CanvasState;
  detectLanguage?: (text: string) => Promise<{ lang: string; confident: boolean }>;
}): Promise<{
  specialistResult: T;
  attempts: number;
  usage: LLMUsage;
  normalized: boolean;
}> {
  const targetLanguage = normalizeLanguageGuardCode(params.targetLanguage);
  if (!targetLanguage || targetLanguage === "und") {
    return {
      specialistResult: params.specialistResult,
      attempts: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, provider_available: false },
      normalized: false,
    };
  }

  const specialistResultRecord =
    params.specialistResult && typeof params.specialistResult === "object"
      ? (params.specialistResult as Record<string, unknown>)
      : {};
  const shouldNormalize = await shouldNormalizeSpecialistResultLanguage({
    specialistResult: specialistResultRecord,
    targetLanguage,
    detectLanguage: params.detectLanguage,
  });
  if (!shouldNormalize) {
    return {
      specialistResult: params.specialistResult,
      attempts: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, provider_available: false },
      normalized: false,
    };
  }

  const repaired = await callStrictJson<T>({
    model: params.model,
    instructions: buildLanguageRepairInstructions(params.schemaName),
    includeGlossary: false,
    plannerInput: buildLanguageRepairPlannerInput({
      targetLanguage,
      specialistResult: specialistResultRecord,
      state: params.state,
    }),
    schemaName: `${params.schemaName}LanguageRepair`,
    jsonSchema: params.jsonSchema,
    zodSchema: params.zodSchema,
    temperature: 0,
    topP: 1,
    maxOutputTokens: 10000,
    debugLabel: `${params.schemaName}:language_repair`,
  });

  return {
    specialistResult: repaired.data,
    attempts: repaired.attempts,
    usage: repaired.usage,
    normalized: true,
  };
}

async function callLocalizedStrictJson<T>(params: {
  model: string;
  state: CanvasState;
  targetLanguage: string;
  instructions: string;
  includeGlossary: boolean;
  plannerInput: string;
  schemaName: string;
  jsonSchema: StrictJsonSchema;
  zodSchema: ZodType<T>;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  debugLabel: string;
  enableLanguageGuard?: boolean;
}): Promise<{ data: T; attempts: number; usage: LLMUsage }> {
  const res = await callStrictJson<T>({
    model: params.model,
    instructions: params.instructions,
    includeGlossary: params.includeGlossary,
    plannerInput: params.plannerInput,
    schemaName: params.schemaName,
    jsonSchema: params.jsonSchema,
    zodSchema: params.zodSchema,
    temperature: params.temperature,
    topP: params.topP,
    maxOutputTokens: params.maxOutputTokens,
    debugLabel: params.debugLabel,
  });

  if (params.enableLanguageGuard === false) {
    return { data: res.data, attempts: res.attempts, usage: res.usage };
  }

  const normalized = await normalizeSpecialistResultLanguage<T>({
    specialistResult: res.data,
    targetLanguage: params.targetLanguage,
    model: params.model,
    schemaName: params.schemaName,
    jsonSchema: params.jsonSchema,
    zodSchema: params.zodSchema,
    state: params.state,
  });

  return {
    data: normalized.specialistResult,
    attempts: res.attempts + normalized.attempts,
    usage: mergeUsageLocal(res.usage, normalized.usage),
  };
}

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

export function shouldIncludeBigWhyGlossary(userMessage: string): boolean {
  return !String(userMessage || "").trim().startsWith("__SHORTEN_BIGWHY__");
}

export function shouldIncludeGlossaryForInternalRoute(
  specialist: string,
  userMessage: string
): boolean {
  const normalizedSpecialist = String(specialist || "").trim();
  const normalizedUserMessage = String(userMessage || "").trim();

  if (normalizedSpecialist === BIGWHY_SPECIALIST) {
    return shouldIncludeBigWhyGlossary(normalizedUserMessage);
  }

  if (normalizedSpecialist === DREAM_SPECIALIST) {
    return !normalizedUserMessage.startsWith("__ROUTE__DREAM_FORCE_REFINE__");
  }

  if (normalizedSpecialist === DREAM_EXPLAINER_SPECIALIST) {
    return !(
      normalizedUserMessage.startsWith("__ROUTE__DREAM_EXPLAINER_MULTI_REWRITE_REPAIR__") ||
      normalizedUserMessage.startsWith("__ROUTE__DREAM_EXPLAINER_OVERLAP_REPAIR__") ||
      normalizedUserMessage.startsWith("__ROUTE__DREAM_EXPLAINER_CLUSTER_THEME_REPAIR__")
    );
  }

  if (normalizedSpecialist === STRATEGY_SPECIALIST) {
    return !normalizedUserMessage.startsWith("__ROUTE__STRATEGY_CONSOLIDATE__");
  }

  return true;
}

export async function callSpecialistStrict(
  params: SpecialistCallParams,
  deps: CallSpecialistStrictDeps
): Promise<SpecialistCallResult> {
  const { model, state, decision, userMessage } = params;
  const specialist = String(decision.specialist_to_call ?? "");
  const contextBlock = deps.buildSpecialistContextBlock(state);
  const plannerContextBlock = isPlannerContextDedupEnabled() ? "" : contextBlock;
  const lang = deps.langFromState(state);
  const intentType = String((state as any).__turn_last_routing_intent_type || "").trim();
  const explainLight = shouldUseExplainLightProfile(intentType);
  const composeInstructions = (
    baseInstructions: string,
    options?: { includeUniversalMeta?: boolean }
  ): string => {
    const base = explainLight ? buildExplainLightInstructions(baseInstructions) : baseInstructions;
    const includeUniversalMeta = explainLight ? false : Boolean(options?.includeUniversalMeta);
    return composeSpecialistInstructions(base, contextBlock, deps.instructionBlocks, {
      includeUniversalMeta,
    });
  };

  if (
    process.env.TS_NODE_TRANSPILE_ONLY === "true" &&
    process.env.RUN_INTEGRATION_TESTS !== "1" &&
    !(specialist === STEP_0_BOOTSTRAP_SPECIALIST && __hasInjectedTestClient())
  ) {
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
      specialist === STEP_0_TURN_INTENT_SPECIALIST
        ? {
            intent: "other",
          }
        : specialist === STEP_0_SPECIALIST
        ? {
            ...base,
            business_name: "TBD",
            step_0: "",
            step0_interaction_state: "step0_editing",
            is_mutable: true,
            editable_fields: ["business_name"],
          }
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

    const res = await callLocalizedStrictJson<ValidationAndBusinessNameOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(VALIDATION_AND_BUSINESS_NAME_INSTRUCTIONS),
      includeGlossary: false,
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

  if (specialist === STEP_0_BOOTSTRAP_SPECIALIST) {
    const langExplicit = String((state as any).language ?? "").trim();
    const plannerInput = buildStep0BootstrapSpecialistInput(userMessage, langExplicit ? lang : "");

    const res = await callLocalizedStrictJson<Step0BootstrapExtractionOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(STEP_0_BOOTSTRAP_INSTRUCTIONS),
      includeGlossary: false,
      plannerInput,
      schemaName: "Step0BootstrapExtractor",
      jsonSchema: Step0BootstrapExtractionJsonSchema as any,
      zodSchema: Step0BootstrapExtractionZodSchema,
      temperature: 0,
      topP: 1,
      maxOutputTokens: 400,
      debugLabel: "Step0BootstrapExtractor",
      enableLanguageGuard: false,
    });

    return { specialistResult: res.data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === STEP_0_TURN_INTENT_SPECIALIST) {
    const langExplicit = String((state as any).language ?? "").trim();
    const plannerInput = buildStep0TurnIntentSpecialistInput({
      userMessage,
      currentStep0Final: String((state as any).step_0_final ?? ""),
      currentBusinessName: String((state as any).business_name ?? ""),
      candidateStep0: String((decision as any).step0_candidate ?? ""),
      candidateBusinessName: String((decision as any).step0_candidate_business_name ?? ""),
      language: langExplicit ? lang : "",
    });

    const res = await callLocalizedStrictJson<Step0TurnIntentOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(STEP_0_TURN_INTENT_INSTRUCTIONS),
      includeGlossary: false,
      plannerInput,
      schemaName: "Step0TurnIntentClassifier",
      jsonSchema: Step0TurnIntentJsonSchema as any,
      zodSchema: Step0TurnIntentZodSchema,
      temperature: 0,
      topP: 1,
      maxOutputTokens: 120,
      debugLabel: "Step0TurnIntentClassifier",
      enableLanguageGuard: false,
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

    const res = await callLocalizedStrictJson<DreamOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(DREAM_INSTRUCTIONS),
      includeGlossary: shouldIncludeGlossaryForInternalRoute(specialist, userMessage),
      plannerInput,
      schemaName: "Dream",
      jsonSchema: DreamJsonSchema as any,
      zodSchema: DreamZodSchema,
      temperature: 0.3,
      topP: 1,
      maxOutputTokens: 10000,
      debugLabel: "Dream",
    });

    const currentDreamValue = String(
      ((state as any).provisional_by_step || {})[DREAM_STEP_ID] ||
      (state as any).dream_final ||
      ""
    ).trim();
    const policyApplied = applyDreamRuntimePolicy({
      specialist: (res.data as unknown as Record<string, unknown>) || {},
      userMessage,
      currentValue: currentDreamValue,
    });

    return { specialistResult: policyApplied.specialist, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === DREAM_EXPLAINER_SPECIALIST) {
    const langExplicitExplainer = String((state as any).language ?? "").trim();
    const fromCanonical = Array.isArray((state as any).dream_builder_statements)
      ? normalizeDreamBuilderStatements((state as any).dream_builder_statements)
      : [];
    const fromLast = Array.isArray((state as any).last_specialist_result?.statements)
      ? normalizeDreamBuilderStatements((state as any).last_specialist_result.statements)
      : [];
    const fromScoring = Array.isArray((state as any).dream_scoring_statements)
      ? normalizeDreamBuilderStatements((state as any).dream_scoring_statements)
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
    const topClusterDetails = dreamAwaitingDirection && Array.isArray((state as any).dream_top_cluster_details)
      ? ((state as any).dream_top_cluster_details as TopClusterDetailInfo[])
      : undefined;
    const businessContext = dreamAwaitingDirection && topClusters
      ? {
          step_0_final: String((state as any).step_0_final ?? "").trim(),
          business_name: String((state as any).business_name ?? "").trim(),
        }
      : undefined;
    const plannerDreamRuntimeMode =
      topClusters && topClusters.length > 0 ? "builder_refine" : deps.getDreamRuntimeMode(state);
    const plannerInput = buildDreamExplainerSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || DREAM_STEP_ID),
      langExplicitExplainer ? lang : "",
      previousStatements,
      topClusters,
      topClusterDetails,
      businessContext,
      plannerDreamRuntimeMode
    );

    const res = await callLocalizedStrictJson<DreamExplainerOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(DREAM_EXPLAINER_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: shouldIncludeGlossaryForInternalRoute(specialist, userMessage),
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

    const res = await callLocalizedStrictJson<PurposeOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(PURPOSE_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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

    const res = await callLocalizedStrictJson<BigWhyOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(BIGWHY_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: shouldIncludeGlossaryForInternalRoute(specialist, userMessage),
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

    const res = await callLocalizedStrictJson<RoleOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(ROLE_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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

    const res = await callLocalizedStrictJson<EntityOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(ENTITY_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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

    const res = await callLocalizedStrictJson<StrategyOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(STRATEGY_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: shouldIncludeGlossaryForInternalRoute(specialist, userMessage),
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
      plannerContextBlock
    );

    const res = await callLocalizedStrictJson<TargetGroupOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(TARGETGROUP_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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
    const lastResult = (state as any).last_specialist_result || {};
    const statementsFromLast = Array.isArray(lastResult.statements) ? lastResult.statements : [];
    const plannerInput = buildProductsServicesSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRODUCTSSERVICES_STEP_ID),
      lang,
      statementsFromLast,
      plannerContextBlock
    );

    const res = await callLocalizedStrictJson<ProductsServicesOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(PRODUCTSSERVICES_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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

    const res = await callLocalizedStrictJson<RulesOfTheGameOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(RULESOFTHEGAME_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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

    const previousStatements = Array.isArray(statementsFromLast)
      ? statementsFromLast.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    const policyApplied = applyRulesRuntimePolicy({
      specialist: (data as unknown as Record<string, unknown>) || {},
      previousStatements,
      uiStrings:
        state && typeof (state as any).ui_strings === "object" && (state as any).ui_strings !== null
          ? ((state as any).ui_strings as Record<string, unknown>)
          : {},
    });
    data = policyApplied.specialist as any;

    return { specialistResult: data, attempts: res.attempts, usage: res.usage, model };
  }

  if (specialist === PRESENTATION_SPECIALIST) {
    const plannerInput = buildPresentationSpecialistInput(
      userMessage,
      (state as any).intro_shown_for_step,
      String(decision.current_step || PRESENTATION_STEP_ID),
      lang
    );

    const res = await callLocalizedStrictJson<PresentationOutput>({
      model,
      state,
      targetLanguage: lang,
      instructions: composeInstructions(PRESENTATION_INSTRUCTIONS, {
        includeUniversalMeta: true,
      }),
      includeGlossary: true,
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
      message: resolveUiStringForState(
        state as Record<string, unknown>,
        "runtime.error.unsupported_specialist.message"
      ),
      question: resolveUiStringForState(
        state as Record<string, unknown>,
        "runtime.error.unsupported_specialist.question"
      ),
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

export function createCallSpecialistStrict(
  deps: CallSpecialistStrictDeps
): (params: SpecialistCallParams) => Promise<SpecialistCallResult> {
  return (params: SpecialistCallParams) => callSpecialistStrict(params, deps);
}

export {
  isRateLimitError,
  isTimeoutError,
  hasUsableSpecialistForRetry,
  buildTransientFallbackSpecialist,
  buildRateLimitErrorPayload,
  buildTimeoutErrorPayload,
  createBuildTransientFallbackSpecialist,
  createBuildRateLimitErrorPayload,
  createBuildTimeoutErrorPayload,
} from "./specialist_dispatch_fallbacks.js";
export {
  callSpecialistStrictSafe,
  createCallSpecialistStrictSafe,
} from "./specialist_dispatch_safe.js";
