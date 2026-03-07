import { readFileSync } from "node:fs";

import {
  normalizeIngressIdempotencyKey,
} from "../handlers/ingress.js";
import { safeString } from "../server_safe_string.js";

function loadDotEnv() {
  try {
    const raw = readFileSync(new URL("../../.env", import.meta.url), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!key) continue;
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file found; ignore.
  }
}

const nodeEnv = safeString(process.env.NODE_ENV ?? "").trim().toLowerCase();
const shouldLoadDotEnv =
  process.env.LOCAL_DEV === "1" || nodeEnv === "development" || nodeEnv === "test";
if (shouldLoadDotEnv) {
  loadDotEnv();
}

let runStepModule: typeof import("../handlers/run_step.js") | null = null;
async function getRunStep() {
  if (!runStepModule) runStepModule = await import("../handlers/run_step.js");
  return runStepModule.run_step;
}

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const isLocalDev = process.env.LOCAL_DEV === "1";

const VERSION = safeString(process.env.VERSION ?? "").trim() || "v119";
const IMAGE_DIGEST = safeString(process.env.IMAGE_DIGEST ?? "").trim();

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN = safeString(process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "").trim();

const MCP_PATH = "/mcp";
const UI_RESOURCE_PATH = "/ui/step-card";
const UI_RESOURCE_QUERY = `?v=${encodeURIComponent(VERSION)}`;
const UI_RESOURCE_NAME = "business-canvas-widget";
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const MCP_SIMULATED_HANDLE_DELAY_MS = Number(process.env.MCP_SIMULATED_HANDLE_DELAY_MS || 0);
const BOOTSTRAP_SESSION_REGISTRY_TTL_MS = Number(process.env.BOOTSTRAP_SESSION_REGISTRY_TTL_MS || 30 * 60 * 1000);
const IDEMPOTENCY_ENTRY_TTL_MS = Number(process.env.IDEMPOTENCY_ENTRY_TTL_MS || BOOTSTRAP_SESSION_REGISTRY_TTL_MS);
const BOOTSTRAP_SESSION_ID_PREFIX = "bs_";
const IDEMPOTENCY_ERROR_CODES = {
  REPLAY: "idempotency_replay",
  CONFLICT: "idempotency_key_conflict",
  INFLIGHT: "idempotency_replay_inflight",
} as const;

function parsePositiveInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function envFlagEnabled(name: string, fallback: boolean): boolean {
  const raw = safeString(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw);
}

const RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED = envFlagEnabled("RUN_STEP_STALE_INGEST_GUARD_V1", false);
const RUN_STEP_STALE_REBASE_V1_ENABLED = envFlagEnabled("RUN_STEP_STALE_REBASE_V1", false);

function enforceRuntimeSecretsPolicy(): void {
  const isProduction = nodeEnv === "production" && !isLocalDev;
  if (!isProduction) return;
  const apiKey = safeString(process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY in production. Configure runtime secret injection (e.g. secret manager) before startup."
    );
  }
  const explicitSource = safeString(
    process.env.BSC_RUNTIME_SECRET_SOURCE ?? process.env.OPENAI_API_KEY_SOURCE ?? ""
  )
    .trim()
    .toLowerCase();
  const inferredSource = process.env.AWS_EXECUTION_ENV ? "aws_secrets_manager" : "";
  const effectiveSource = explicitSource || inferredSource;
  const allowedSources = new Set([
    "aws_secrets_manager",
    "gcp_secret_manager",
    "azure_key_vault",
    "hashicorp_vault",
    "runtime_secret_injection",
  ]);
  if (!effectiveSource || !allowedSources.has(effectiveSource)) {
    throw new Error(
      "Invalid or missing runtime secret source in production. Set BSC_RUNTIME_SECRET_SOURCE to an approved secret manager source."
    );
  }
}

enforceRuntimeSecretsPolicy();

function delay(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const normalizeIdempotencyKey = normalizeIngressIdempotencyKey;

export {
  BOOTSTRAP_SESSION_ID_PREFIX,
  BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
  IDEMPOTENCY_ENTRY_TTL_MS,
  IDEMPOTENCY_ERROR_CODES,
  IMAGE_DIGEST,
  MCP_PATH,
  MCP_SIMULATED_HANDLE_DELAY_MS,
  MAX_REQUEST_SIZE_BYTES,
  OPENAI_APPS_CHALLENGE_PATH,
  OPENAI_APPS_CHALLENGE_TOKEN,
  REQUEST_TIMEOUT_MS,
  RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED,
  RUN_STEP_STALE_REBASE_V1_ENABLED,
  UI_RESOURCE_NAME,
  UI_RESOURCE_PATH,
  UI_RESOURCE_QUERY,
  VERSION,
  delay,
  getRunStep,
  host,
  isLocalDev,
  normalizeIdempotencyKey,
  parsePositiveInt,
  port,
};
