// Rate limiting and request size limiting middleware for MCP endpoint
const store = {};
// Configurable limits (can be overridden via env vars)
const RATE_LIMIT_REQUESTS_PER_MINUTE = Number(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || 60);
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024); // 1MB default
const ABUSE_THRESHOLD = Number(process.env.ABUSE_THRESHOLD || 100); // requests per minute
const ABUSE_BAN_DURATION_MS = 5 * 60 * 1000; // 5 minutes
function getClientIp(req) {
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
function getTraceId(req) {
    const headers = req?.headers || {};
    return (headers["x-request-id"] ||
        headers["x-amzn-trace-id"] ||
        headers["x-amz-apigw-id"] ||
        headers["x-b3-traceid"] ||
        headers["traceparent"] ||
        "").toString();
}
function logRequestMeta(prefix, req, extra) {
    const meta = {
        ip: getClientIp(req),
        method: req?.method,
        url: req?.url,
        traceId: getTraceId(req),
        contentLength: Number(req?.headers?.["content-length"] || 0),
        ...extra,
    };
    console.warn(prefix, JSON.stringify(meta));
}
function isRateLimited(ip) {
    const now = Date.now();
    const entry = store[ip];
    // Check if banned
    if (entry?.bannedUntil && now < entry.bannedUntil) {
        const retryAfter = Math.ceil((entry.bannedUntil - now) / 1000);
        return { limited: true, retryAfter };
    }
    // Clean up expired entries
    if (entry && entry.resetTime < now) {
        delete store[ip];
    }
    return { limited: false };
}
function recordRequest(ip) {
    const now = Date.now();
    const entry = store[ip];
    if (!entry || entry.resetTime < now) {
        // New window
        store[ip] = {
            count: 1,
            resetTime: now + RATE_LIMIT_WINDOW_MS,
        };
    }
    else {
        // Increment count
        entry.count++;
        // Check abuse threshold
        if (entry.count >= ABUSE_THRESHOLD) {
            entry.bannedUntil = now + ABUSE_BAN_DURATION_MS;
            console.warn(`[rateLimit] IP ${ip} banned for ${ABUSE_BAN_DURATION_MS}ms due to abuse (${entry.count} requests)`);
        }
    }
}
function logCostSignal(req, startTime, actualBodySize) {
    const duration = Date.now() - startTime;
    const ip = getClientIp(req);
    const method = req.method;
    const url = req.url;
    // Use actual body size if available, otherwise fall back to content-length header
    const bodySize = actualBodySize ??
        Number(req.__bodySize || 0) ??
        Number(req.headers["content-length"] || 0);
    // Estimate tokens (rough approximation: ~4 chars per token)
    const estimatedTokens = Math.ceil(bodySize / 4);
    console.log(`[costSignal] IP=${ip} method=${method} url=${url} duration=${duration}ms bodySize=${bodySize}bytes estimatedTokens=${estimatedTokens}`);
}
/**
 * Rate limiting middleware for MCP endpoint
 * Returns middleware function that checks rate limits and request size
 * Includes request timeout and improved body size checking
 */
export function createRateLimitMiddleware() {
    return async (req, res, next) => {
        const ip = getClientIp(req);
        const startTime = Date.now();
        // Check if rate limited
        const rateLimitCheck = isRateLimited(ip);
        if (rateLimitCheck.limited) {
            logRequestMeta("[rateLimit] Rate limit exceeded", req, {
                retryAfter: rateLimitCheck.retryAfter || 60,
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
            logRequestMeta("[rateLimit] Request entity too large (content-length)", req, {
                maxSize: MAX_REQUEST_SIZE_BYTES,
            });
            res.writeHead(413, {
                "Content-Type": "application/json",
            });
            res.end(JSON.stringify({ error: "Request entity too large", maxSize: MAX_REQUEST_SIZE_BYTES }));
            return;
        }
        // Record request
        recordRequest(ip);
        // Log cost signal after response with actual body size (if available)
        const originalEnd = res.end.bind(res);
        res.end = function (chunk, encoding, cb) {
            // Use body size if provided by pre-parse layer, otherwise use content-length header
            const bodySizeForLog = Number(req.__bodySize || 0) || contentLength;
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
        console.log(`[rateLimit] Cleaned up ${cleaned} expired entries`);
    }
}, 5 * 60 * 1000); // Every 5 minutes
