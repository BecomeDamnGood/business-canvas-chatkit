import fs from "node:fs";
import path from "node:path";

export type ModelRoutingPurpose = "specialist" | "translation";

export type ModelRoutingConfig = {
  version: string;
  enabled: boolean;
  default_model: string;
  budget_model: string;
  translation_model: string;
  availability: {
    mode: "none" | "env_allowlist";
    env_var: string;
  };
  default_fallback_chain: string[];
  fallback_by_source: Record<string, string[]>;
  fallback_by_model: Record<string, string[]>;
  fallback_by_action_code: Record<string, string[]>;
  fallback_by_intent: Record<string, string[]>;
  fallback_by_specialist: Record<string, string[]>;
  hard_pinned_4_1: {
    action_codes: string[];
    intents: string[];
    specialists: string[];
  };
  by_action_code: Record<string, string>;
  by_intent: Record<string, string>;
  by_specialist: Record<string, string>;
};

export type ModelRoutingParams = {
  fallbackModel: string;
  routingEnabled: boolean;
  actionCode?: string;
  intentType?: string;
  specialist?: string;
  purpose?: ModelRoutingPurpose;
  configPath?: string;
};

export type ModelRoutingDecision = {
  model: string;
  candidate_model: string;
  fallback_chain: string[];
  selected_source: "primary" | "fallback";
  source:
    | "hard_pinned_4_1"
    | "action_code"
    | "intent"
    | "specialist"
    | "translation_model"
    | "default"
    | "routing_disabled"
    | "config_unavailable";
  applied: boolean;
  config_loaded: boolean;
  config_version: string;
  availability_mode?: "none" | "env_allowlist";
  availability_env_var?: string;
  availability_checked: boolean;
  config_error?: string;
};

type CacheEntry = {
  mtimeMs: number;
  parsed: { ok: true; config: ModelRoutingConfig } | { ok: false; error: string };
};

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "model-routing.json");
const cache = new Map<string, CacheEntry>();

function normalizeModel(raw: unknown, fallback: string): string {
  const model = String(raw || "").trim();
  return model || fallback;
}

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    out[normalizedKey] = normalizedValue;
  }
  return out;
}

function normalizeRecordList(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = String(key || "").trim();
    const normalizedList = normalizeList(value);
    if (!normalizedKey || normalizedList.length === 0) continue;
    out[normalizedKey] = normalizedList;
  }
  return out;
}

function parseConfig(raw: unknown): { ok: true; config: ModelRoutingConfig } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "model-routing config must be an object" };
  }
  const cfg = raw as Record<string, unknown>;
  const hardPinned = (cfg.hard_pinned_4_1 || {}) as Record<string, unknown>;
  const parsed: ModelRoutingConfig = {
    version: String(cfg.version || "v1").trim() || "v1",
    enabled: Boolean(cfg.enabled),
    default_model: normalizeModel(cfg.default_model, DEFAULT_MODEL),
    budget_model: normalizeModel(cfg.budget_model, "gpt-4o-mini"),
    translation_model: normalizeModel(cfg.translation_model, "gpt-4o-mini"),
    availability: {
      mode:
        String((cfg.availability as any)?.mode || "").trim() === "env_allowlist"
          ? "env_allowlist"
          : "none",
      env_var: String((cfg.availability as any)?.env_var || "").trim() || "BSC_AVAILABLE_MODELS",
    },
    default_fallback_chain: normalizeList(cfg.default_fallback_chain),
    fallback_by_source: normalizeRecordList(cfg.fallback_by_source),
    fallback_by_model: normalizeRecordList(cfg.fallback_by_model),
    fallback_by_action_code: normalizeRecordList(cfg.fallback_by_action_code),
    fallback_by_intent: normalizeRecordList(cfg.fallback_by_intent),
    fallback_by_specialist: normalizeRecordList(cfg.fallback_by_specialist),
    hard_pinned_4_1: {
      action_codes: normalizeList(hardPinned.action_codes),
      intents: normalizeList(hardPinned.intents),
      specialists: normalizeList(hardPinned.specialists),
    },
    by_action_code: normalizeRecord(cfg.by_action_code),
    by_intent: normalizeRecord(cfg.by_intent),
    by_specialist: normalizeRecord(cfg.by_specialist),
  };
  return { ok: true, config: parsed };
}

function loadRoutingConfig(configPath?: string):
  | { ok: true; config: ModelRoutingConfig }
  | { ok: false; error: string } {
  const filePath = String(configPath || process.env.BSC_MODEL_ROUTING_CONFIG || DEFAULT_CONFIG_PATH).trim();
  if (!filePath) return { ok: false, error: "empty config path" };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { ok: false, error: `config not found: ${filePath}` };
  }
  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.parsed;
  }
  try {
    const parsedJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const parsed = parseConfig(parsedJson);
    cache.set(filePath, { mtimeMs: stat.mtimeMs, parsed });
    return parsed;
  } catch (err: any) {
    const parsed = { ok: false as const, error: err?.message || "invalid JSON" };
    cache.set(filePath, { mtimeMs: stat.mtimeMs, parsed });
    return parsed;
  }
}

function isHardPinned(config: ModelRoutingConfig, params: ModelRoutingParams): boolean {
  const actionCode = String(params.actionCode || "").trim();
  const intentType = String(params.intentType || "").trim();
  const specialist = String(params.specialist || "").trim();
  return (
    (Boolean(actionCode) && config.hard_pinned_4_1.action_codes.includes(actionCode)) ||
    (Boolean(intentType) && config.hard_pinned_4_1.intents.includes(intentType)) ||
    (Boolean(specialist) && config.hard_pinned_4_1.specialists.includes(specialist))
  );
}

function resolveCandidate(config: ModelRoutingConfig, params: ModelRoutingParams): {
  model: string;
  source: ModelRoutingDecision["source"];
} {
  const actionCode = String(params.actionCode || "").trim();
  const intentType = String(params.intentType || "").trim();
  const specialist = String(params.specialist || "").trim();
  const purpose = params.purpose || "specialist";

  if (purpose === "translation") {
    const model = normalizeModel(config.translation_model, config.budget_model || config.default_model);
    return { model, source: "translation_model" };
  }

  if (isHardPinned(config, params)) {
    return { model: DEFAULT_MODEL, source: "hard_pinned_4_1" };
  }

  if (actionCode) {
    const byAction = normalizeModel(config.by_action_code[actionCode], "");
    if (byAction) return { model: byAction, source: "action_code" };
  }

  if (intentType) {
    const byIntent = normalizeModel(config.by_intent[intentType], "");
    if (byIntent) return { model: byIntent, source: "intent" };
  }

  if (specialist) {
    const bySpecialist = normalizeModel(config.by_specialist[specialist], "");
    if (bySpecialist) return { model: bySpecialist, source: "specialist" };
  }

  return { model: normalizeModel(config.default_model, DEFAULT_MODEL), source: "default" };
}

function dedupeOrderedModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of models) {
    const model = String(raw || "").trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

function computeFallbackChain(
  config: ModelRoutingConfig,
  params: ModelRoutingParams,
  candidate: { model: string; source: ModelRoutingDecision["source"] },
  fallbackModel: string
): string[] {
  const actionCode = String(params.actionCode || "").trim();
  const intentType = String(params.intentType || "").trim();
  const specialist = String(params.specialist || "").trim();
  const fromAction = actionCode ? config.fallback_by_action_code[actionCode] || [] : [];
  const fromIntent = intentType ? config.fallback_by_intent[intentType] || [] : [];
  const fromSpecialist = specialist ? config.fallback_by_specialist[specialist] || [] : [];
  const fromSource = config.fallback_by_source[candidate.source] || [];
  const fromModel = config.fallback_by_model[candidate.model] || [];
  const merged = dedupeOrderedModels([
    ...fromAction,
    ...fromIntent,
    ...fromSpecialist,
    ...fromSource,
    ...fromModel,
    ...config.default_fallback_chain,
    fallbackModel,
    config.default_model,
    DEFAULT_MODEL,
  ]);
  return merged.filter((model) => model !== candidate.model);
}

function resolveAvailability(
  config: ModelRoutingConfig
): { mode: "none" | "env_allowlist"; envVar: string; allowList: Set<string> | null } {
  const mode = config.availability.mode;
  const envVar = String(config.availability.env_var || "").trim() || "BSC_AVAILABLE_MODELS";
  if (mode !== "env_allowlist") {
    return { mode, envVar, allowList: null };
  }
  const raw = String(process.env[envVar] || process.env.BSC_AVAILABLE_MODELS || "").trim();
  if (!raw) {
    return { mode, envVar, allowList: null };
  }
  const allowList = new Set(
    raw
      .split(",")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  return { mode, envVar, allowList };
}

function pickFirstAvailable(
  orderedModels: string[],
  allowList: Set<string> | null
): { model: string; selectedSource: "primary" | "fallback" } {
  const queue = dedupeOrderedModels(orderedModels);
  if (queue.length === 0) {
    return { model: DEFAULT_MODEL, selectedSource: "fallback" };
  }
  if (!allowList || allowList.size === 0) {
    return { model: queue[0], selectedSource: queue[0] === orderedModels[0] ? "primary" : "fallback" };
  }
  for (const model of queue) {
    if (allowList.has(model)) {
      return { model, selectedSource: model === orderedModels[0] ? "primary" : "fallback" };
    }
  }
  return { model: queue[0], selectedSource: queue[0] === orderedModels[0] ? "primary" : "fallback" };
}

export function resolveModelForCall(params: ModelRoutingParams): ModelRoutingDecision {
  const fallbackModel = normalizeModel(params.fallbackModel, DEFAULT_MODEL);
  const loaded = loadRoutingConfig(params.configPath);
  if (!loaded.ok) {
    return {
      model: fallbackModel,
      candidate_model: fallbackModel,
      fallback_chain: [],
      selected_source: "primary",
      source: "config_unavailable",
      applied: false,
      config_loaded: false,
      config_version: "unknown",
      availability_mode: "none",
      availability_env_var: "BSC_AVAILABLE_MODELS",
      availability_checked: false,
      config_error: loaded.error,
    };
  }

  const config = loaded.config;
  const candidate = resolveCandidate(config, params);
  const fallbackChain = computeFallbackChain(config, params, candidate, fallbackModel);
  const availability = resolveAvailability(config);
  const selected = pickFirstAvailable([candidate.model, ...fallbackChain], availability.allowList);
  const canApply = params.routingEnabled && config.enabled;

  if (!canApply) {
    return {
      model: fallbackModel,
      candidate_model: candidate.model,
      fallback_chain: fallbackChain,
      selected_source: "fallback",
      source: "routing_disabled",
      applied: false,
      config_loaded: true,
      config_version: config.version,
      availability_mode: availability.mode,
      availability_env_var: availability.envVar,
      availability_checked: Boolean(availability.allowList),
    };
  }

  return {
    model: selected.model,
    candidate_model: candidate.model,
    fallback_chain: fallbackChain,
    selected_source: selected.selectedSource,
    source: candidate.source,
    applied: true,
    config_loaded: true,
    config_version: config.version,
    availability_mode: availability.mode,
    availability_env_var: availability.envVar,
    availability_checked: Boolean(availability.allowList),
  };
}

export function __clearModelRoutingCacheForTests(): void {
  cache.clear();
}
