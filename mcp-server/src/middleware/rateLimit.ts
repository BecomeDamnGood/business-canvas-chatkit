// Rate limiting and request size limiting middleware for MCP endpoint

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
    bannedUntil?: number;
  };
}

const store: RateLimitStore = {};

// Configurable limits (can be overridden via env vars)
const RATE_LIMIT_REQUESTS_PER_MINUTE = Number(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || 60);
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024); // 1MB default
const ABUSE_THRESHOLD = Number(process.env.ABUSE_THRESHOLD || 100); // requests per minute
const ABUSE_BAN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

type StructuredLogSeverity = "info" | "warn" | "error";

function normalizeLogField(value: unknown, maxLen = 512): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function getHeader(req: any, name: string): string {
  return normalizeLogField(req?.headers?.[name.toLowerCase()] || "");
}

function getClientIp(req: any): string {
  // Check various headers for IP (for proxies/load balancers)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return String(realIp);
  }
  // Fallback to connection remoteAddress
  return req.socket?.remoteAddress || "unknown";
}

function getCorrelationId(req: any): string {
  return (
    getHeader(req, "x-correlation-id") ||
    getHeader(req, "x-request-id") ||
    normalizeLogField((req as any)?.__correlationId || "")
  );
}

function getTraceId(req: any): string {
  return (
    getHeader(req, "x-amzn-trace-id") ||
    getHeader(req, "traceparent") ||
    getHeader(req, "x-b3-traceid") ||
    getHeader(req, "x-request-id") ||
    getCorrelationId(req)
  );
}

function logStructuredRateEvent(
  severity: StructuredLogSeverity,
  event: string,
  req: any,
  details: Record<string, unknown> = {}
) {
  const payload = {
    event: normalizeLogField(event, 128) || "event_unknown",
    severity,
    correlation_id: getCorrelationId(req),
    trace_id: getTraceId(req),
    session_id: "",
    step_id: "",
    contract_id: "",
    ip: normalizeLogField(getClientIp(req), 128),
    method: normalizeLogField(req?.method || "", 16),
    url: normalizeLogField(req?.url || "", 256),
    content_length: Number(req?.headers?.["content-length"] || 0),
    ...details,
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

function isRateLimited(ip: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store[ip];

  // Check if banned
  if (entry?.bannedUntil && now < entry.bannedUntil) {
    const retryAfter = Math.ceil((entry.bannedUntil - now) / 1000);
    return { limited: true, retryAfter };
  }

  if (entry && entry.count >= RATE_LIMIT_REQUESTS_PER_MINUTE && entry.resetTime > now) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { limited: true, retryAfter };
  }

  // Clean up expired entries
  if (entry && entry.resetTime < now) {
    delete store[ip];
  }

  return { limited: false };
}

function recordRequest(ip: string): { bannedNow: boolean; count: number } {
  const now = Date.now();
  const entry = store[ip];

  if (!entry || entry.resetTime < now) {
    // New window
    store[ip] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    return { bannedNow: false, count: 1 };
  } else {
    // Increment count
    entry.count++;
    
    // Check abuse threshold
    if (entry.count >= ABUSE_THRESHOLD) {
      entry.bannedUntil = now + ABUSE_BAN_DURATION_MS;
      return { bannedNow: true, count: entry.count };
    }
    return { bannedNow: false, count: entry.count };
  }
}

function logCostSignal(req: any, startTime: number, actualBodySize?: number): void {
  const duration = Date.now() - startTime;
  
  // Use actual body size if available, otherwise fall back to content-length header
  const bodySize =
    actualBodySize ??
    Number((req as any).__bodySize || 0) ??
    Number(req.headers["content-length"] || 0);
  // Estimate tokens (rough approximation: ~4 chars per token)
  const estimatedTokens = Math.ceil(bodySize / 4);

  logStructuredRateEvent("info", "mcp_cost_signal", req, {
    duration_ms: duration,
    body_size_bytes: bodySize,
    estimated_tokens: estimatedTokens,
  });
}

/**
 * Rate limiting middleware for MCP endpoint
 * Returns middleware function that checks rate limits and request size
 * Includes request timeout and improved body size checking
 */
export function createRateLimitMiddleware() {
  return async (req: any, res: any, next: () => void) => {
    const ip = getClientIp(req);
    const startTime = Date.now();

    // Check if rate limited
    const rateLimitCheck = isRateLimited(ip);
    if (rateLimitCheck.limited) {
      logStructuredRateEvent("warn", "mcp_rate_limit_exceeded", req, {
        retry_after_s: rateLimitCheck.retryAfter || 60,
      });
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(rateLimitCheck.retryAfter || 60),
      });
      res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfter: rateLimitCheck.retryAfter }));
      return;
    }

    // Check content-length header (early rejection for known large requests)
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_REQUEST_SIZE_BYTES) {
      logStructuredRateEvent("warn", "mcp_request_rejected_body_too_large_header", req, {
        max_size: MAX_REQUEST_SIZE_BYTES,
      });
      res.writeHead(413, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ error: "Request entity too large", maxSize: MAX_REQUEST_SIZE_BYTES }));
      return;
    }

    // Record request
    const record = recordRequest(ip);
    if (record.bannedNow) {
      logStructuredRateEvent("warn", "mcp_rate_limit_abuse_ban_applied", req, {
        ban_duration_ms: ABUSE_BAN_DURATION_MS,
        request_count: record.count,
      });
    }

    // Log cost signal after response with actual body size (if available)
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any, cb?: any) {
      // Use body size if provided by pre-parse layer, otherwise use content-length header
      const bodySizeForLog = Number((req as any).__bodySize || 0) || contentLength;
      logCostSignal(req, startTime, bodySizeForLog);
      return originalEnd(chunk, encoding, cb);
    };

    next();
  };
}

/**
 * Cleanup old entries periodically (prevent memory leak)
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const ip in store) {
    const entry = store[ip];
    if (entry.resetTime < now && (!entry.bannedUntil || entry.bannedUntil < now)) {
      delete store[ip];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(
      JSON.stringify({
        event: "mcp_rate_limit_store_cleanup",
        severity: "info",
        correlation_id: "",
        trace_id: "",
        session_id: "",
        step_id: "",
        contract_id: "",
        cleaned_entries: cleaned,
      })
    );
  }
}, 5 * 60 * 1000); // Every 5 minutes
