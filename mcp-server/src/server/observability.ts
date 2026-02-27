import { randomUUID } from "node:crypto";

import { safeString } from "../server_safe_string.js";

import { normalizeIdempotencyKey } from "./server_config.js";

function getHeader(req: any, name: string): string {
  return safeString(req?.headers?.[name.toLowerCase()] || "");
}

function getCorrelationId(req: any): string {
  const existing =
    getHeader(req, "x-correlation-id") ||
    getHeader(req, "x-request-id") ||
    getHeader(req, "x-amzn-trace-id") ||
    getHeader(req, "traceparent");
  return existing ? safeString(existing) : randomUUID();
}

function getTraceId(req: any): string {
  return (
    getHeader(req, "x-amzn-trace-id") ||
    getHeader(req, "traceparent") ||
    getHeader(req, "x-b3-traceid")
  );
}

function ensureCorrelationHeader(res: any, correlationId: string) {
  if (!res.headersSent) {
    res.setHeader("X-Correlation-Id", correlationId);
  }
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode: number, headers?: Record<string, string>) {
    const hdrs = headers ? { ...headers } : {};
    if (!hdrs["X-Correlation-Id"] && !hdrs["x-correlation-id"]) {
      hdrs["X-Correlation-Id"] = correlationId;
    }
    return originalWriteHead(statusCode, hdrs);
  };
}

type StructuredLogSeverity = "info" | "warn" | "error";

type StructuredLogContext = {
  correlation_id?: unknown;
  trace_id?: unknown;
  session_id?: unknown;
  step_id?: unknown;
  contract_id?: unknown;
};

const LOG_REDACT_KEY_RE = /(authorization|cookie|token|secret|password|api[_-]?key)/i;
const LOG_REDACT_VALUE_RE =
  /(bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9._-]{8,}|xox[baprs]-[a-z0-9-]{8,}|api[_-]?key\s*[:=]\s*\S+)/i;

function normalizeLogField(value: unknown, maxLen = 256): string {
  const text = safeString(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const normalized = normalizeLogField(value, 512);
    return LOG_REDACT_VALUE_RE.test(normalized) ? "[redacted]" : normalized;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    if (depth >= 2) return "[array_omitted]";
    return value.slice(0, 20).map((entry) => sanitizeLogValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object_omitted]";
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(entry, depth + 1);
    }
    return next;
  }
  return normalizeLogField(value, 256);
}

function sanitizeLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "event" || key === "severity") continue;
    if (
      key === "correlation_id" ||
      key === "trace_id" ||
      key === "session_id" ||
      key === "step_id" ||
      key === "contract_id"
    ) continue;
    next[key] = LOG_REDACT_KEY_RE.test(key) ? "[redacted]" : sanitizeLogValue(value, 0);
  }
  return next;
}

function resolveContractIdFromRecord(record: Record<string, unknown> | null | undefined): string {
  if (!record || typeof record !== "object") return "";
  const state =
    record.state && typeof record.state === "object"
      ? (record.state as Record<string, unknown>)
      : {};
  const ui =
    record.ui && typeof record.ui === "object"
      ? (record.ui as Record<string, unknown>)
      : {};
  const direct = normalizeLogField(record.contract_id ?? record.ui_contract_id ?? "", 128);
  if (direct) return direct;
  const fromState = normalizeLogField(state.contract_id ?? state.ui_contract_id ?? state.current_contract_id ?? "", 128);
  if (fromState) return fromState;
  return normalizeLogField(ui.contract_id ?? ui.view_contract_id ?? "", 128);
}

function getHeaderFromRequestInfo(requestInfo: unknown, headerName: string): string {
  const headersRaw =
    requestInfo && typeof requestInfo === "object" && (requestInfo as any).headers
      ? ((requestInfo as any).headers as unknown)
      : null;
  if (!headersRaw) return "";
  const normalizedHeaderName = headerName.toLowerCase();
  if (typeof (headersRaw as any).get === "function") {
    const fromGet = normalizeLogField((headersRaw as any).get(headerName) ?? (headersRaw as any).get(normalizedHeaderName), 512);
    if (fromGet) return fromGet;
  }
  if (Array.isArray(headersRaw)) {
    for (const entry of headersRaw) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const key = safeString(entry[0] ?? "").trim().toLowerCase();
      if (key !== normalizedHeaderName) continue;
      const value = normalizeLogField(entry[1], 512);
      if (value) return value;
    }
  }
  if (typeof headersRaw !== "object") return "";
  const record = headersRaw as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (safeString(key ?? "").trim().toLowerCase() !== normalizedHeaderName) continue;
    const normalized = normalizeLogField(value, 512);
    if (normalized) return normalized;
  }
  return "";
}

function resolveCorrelationIdFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "x-correlation-id") ||
    getHeaderFromRequestInfo(requestInfo, "x-request-id") ||
    getHeaderFromRequestInfo(requestInfo, "x-amzn-trace-id") ||
    getHeaderFromRequestInfo(requestInfo, "traceparent");
  if (fromHeaders) return fromHeaders;
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeLogField(meta["x-correlation-id"] ?? meta["x-request-id"] ?? meta["traceparent"] ?? "", 512);
}

function resolveTraceIdFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "x-amzn-trace-id") ||
    getHeaderFromRequestInfo(requestInfo, "traceparent") ||
    getHeaderFromRequestInfo(requestInfo, "x-b3-traceid");
  if (fromHeaders) return fromHeaders;
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeLogField(meta["x-amzn-trace-id"] ?? meta["traceparent"] ?? meta["x-b3-traceid"] ?? "", 512);
}

function resolveIdempotencyKeyFromExtra(extra: unknown): string {
  const requestInfo = extra && typeof extra === "object" ? (extra as any).requestInfo : null;
  const fromHeaders =
    getHeaderFromRequestInfo(requestInfo, "idempotency-key") ||
    getHeaderFromRequestInfo(requestInfo, "x-idempotency-key");
  if (fromHeaders) return normalizeIdempotencyKey(fromHeaders);
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : {};
  return normalizeIdempotencyKey(
    meta["idempotency_key"] ??
      meta["idempotency-key"] ??
      meta["x-idempotency-key"] ??
      ""
  );
}

function logStructuredEvent(
  severity: StructuredLogSeverity,
  event: string,
  context: StructuredLogContext,
  details: Record<string, unknown> = {}
): void {
  const payload = {
    event: normalizeLogField(event, 128) || "event_unknown",
    correlation_id: normalizeLogField(context.correlation_id, 512),
    trace_id: normalizeLogField(context.trace_id, 512),
    session_id: normalizeLogField(context.session_id, 128),
    step_id: normalizeLogField(context.step_id, 128),
    contract_id: normalizeLogField(context.contract_id, 128),
    severity,
    ...sanitizeLogDetails(details),
  };
  const text = JSON.stringify(payload);
  if (severity === "error") {
    console.error(text);
    return;
  }
  if (severity === "warn") {
    console.warn(text);
    return;
  }
  console.log(text);
}

function jsonRpcErrorResponse(
  status: number,
  message: string,
  data: Record<string, unknown>,
  code = -32700
) {
  return {
    status,
    payload: {
      jsonrpc: "2.0",
      error: { code, message, data },
      id: null,
    },
  };
}

type RunStepErrorCategory = "contract" | "infra" | "internal";
type RunStepErrorSeverity = "transient" | "fatal";

type RunStepErrorClassification = {
  category: RunStepErrorCategory;
  severity: RunStepErrorSeverity;
  type: "contract_violation" | "infra_transient" | "server_error";
  retry_action: "restart_session" | "retry_same_action" | "reload";
  user_message: string;
  code: string;
};

function classifyRunStepExecutionError(err: any): RunStepErrorClassification {
  const rawStatus = Number(err?.status ?? err?.statusCode ?? err?.response?.status);
  const status = Number.isFinite(rawStatus) ? rawStatus : 0;
  const rawCode = safeString(err?.code ?? err?.response?.data?.code ?? err?.response?.data?.error?.code ?? "").trim();
  const code = rawCode.toLowerCase();
  const message = safeString(err?.message ?? err ?? "").trim().toLowerCase();
  const contractSignals = [
    "contract_violation",
    "ui contract",
    "invalid_state",
    "session_upgrade_required",
    "legacy session state is blocked",
    "strict startup/i18n contract",
  ];
  const transientSignals = [
    "timeout",
    "timed out",
    "rate_limit",
    "rate limit",
    "too many requests",
    "econnreset",
    "etimedout",
    "eai_again",
    "enotfound",
    "econnrefused",
    "fetch failed",
  ];
  const hasContractSignal = contractSignals.some((token) => message.includes(token) || code.includes(token));
  const hasTransientSignal =
    transientSignals.some((token) => message.includes(token) || code.includes(token)) ||
    status === 429 ||
    status === 408 ||
    status >= 500;
  if (hasContractSignal) {
    return {
      category: "contract",
      severity: "fatal",
      type: "contract_violation",
      retry_action: "restart_session",
      user_message: "Sessie ongeldig, start opnieuw.",
      code: code || "contract_violation",
    };
  }
  if (hasTransientSignal) {
    return {
      category: "infra",
      severity: "transient",
      type: "infra_transient",
      retry_action: "retry_same_action",
      user_message: "Probeer opnieuw.",
      code: code || (status === 429 ? "rate_limited" : status === 408 ? "timeout" : "infra_transient"),
    };
  }
  return {
    category: "internal",
    severity: "fatal",
    type: "server_error",
    retry_action: "reload",
    user_message: "Probeer opnieuw.",
    code: code || "server_error",
  };
}

async function readBodyWithLimit(req: any, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const onData = (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        cleanup();
        // Drain remaining data without destroying the request
        try { req.resume(); } catch {}
        const err = new Error("body_too_large");
        (err as any).code = "body_too_large";
        reject(err);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(Buffer.concat(chunks, size));
    };
    const onError = (err: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };
    const onAborted = () => {
      if (done) return;
      done = true;
      cleanup();
      const err = new Error("aborted");
      (err as any).code = "aborted";
      reject(err);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}


export {
  classifyRunStepExecutionError,
  ensureCorrelationHeader,
  getCorrelationId,
  getHeader,
  getTraceId,
  jsonRpcErrorResponse,
  logStructuredEvent,
  normalizeLogField,
  readBodyWithLimit,
  resolveContractIdFromRecord,
  resolveCorrelationIdFromExtra,
  resolveIdempotencyKeyFromExtra,
  resolveTraceIdFromExtra,
};
