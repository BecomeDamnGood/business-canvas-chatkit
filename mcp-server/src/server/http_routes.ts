import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  MCP_TOOL_CONTRACT_FAMILY_VERSION,
  RUN_STEP_TOOL_COMPAT_POLICY,
  RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
} from "../contracts/mcp_tool_contract.js";
import { CURRENT_STATE_VERSION } from "../core/state.js";
import { VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import { getPresentationTemplatePath } from "../core/presentation_paths.js";
import { createRateLimitMiddleware } from "../middleware/rateLimit.js";
import { applySecurityHeaders } from "../middleware/security.js";
import { safeString } from "../server_safe_string.js";

import {
  ensureCorrelationHeader,
  getCorrelationId,
  getHeader,
  getTraceId,
  jsonRpcErrorResponse,
  logStructuredEvent,
  readBodyWithLimit,
} from "./observability.js";
import {
  BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
  DIAGNOSTICS_BEARER_TOKEN,
  IDEMPOTENCY_ENTRY_TTL_MS,
  IMAGE_DIGEST,
  MCP_CORS_ALLOW_ORIGINS,
  MCP_PATH,
  MCP_SIMULATED_HANDLE_DELAY_MS,
  MAX_REQUEST_SIZE_BYTES,
  OPENAI_APPS_CHALLENGE_PATH,
  OPENAI_APPS_CHALLENGE_TOKEN,
  REQUEST_TIMEOUT_MS,
  RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED,
  RUN_STEP_STALE_REBASE_V1_ENABLED,
  VERSION,
  delay,
  getRunStep,
  host,
  isLocalDev,
  port,
} from "./server_config.js";
import { summarizeBootstrapSessions } from "./ordering_parity.js";
import { summarizeIdempotencyRegistry } from "./idempotency_registry.js";
import { createAppServer } from "./mcp_registration.js";
import { resolveBaseUrl } from "./run_step_model_result.js";
import { loadUiHtml } from "./run_step_transport.js";

const DEFAULT_UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../ui");
const UI_ALLOWED_FILES = new Set(["step-card.bundled.html"]);
const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;
const MCP_CORS_ALLOWED_METHODS = "POST, GET, DELETE, OPTIONS";
const MCP_CORS_ALLOWED_HEADERS =
  "Content-Type, Accept, Authorization, Last-Event-ID, Mcp-Session-Id, Mcp-Protocol-Version, X-Correlation-Id";

function isWithinDirectory(baseDir: string, candidatePath: string): boolean {
  const relative = path.relative(baseDir, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveUiAssetPath(pathname: string, uiDir = DEFAULT_UI_DIR): string | null {
  if (pathname === "/ui/step-card" || pathname === "/ui/step-card/") {
    return path.join(uiDir, "step-card.bundled.html");
  }
  if (!pathname.startsWith("/ui/")) return null;
  const rest = pathname.slice("/ui/".length).replace(/\/$/, "") || "index.html";
  if (!UI_ALLOWED_FILES.has(rest)) return null;
  const resolved = path.resolve(path.join(uiDir, rest));
  if (!isWithinDirectory(uiDir, resolved)) return null;
  return resolved;
}

type ProcessShutdownControllerOptions = {
  shutdownGraceMs?: number;
  exitProcess?: (code: number) => void;
  logger?: Pick<typeof console, "log" | "warn" | "error">;
};

export function createProcessShutdownController(
  server: Server,
  options: ProcessShutdownControllerOptions = {}
): {
  handleSignal: (signal: NodeJS.Signals) => Promise<void>;
  register: () => () => void;
} {
  const shutdownGraceMs = Number(options.shutdownGraceMs) > 0
    ? Math.trunc(Number(options.shutdownGraceMs))
    : DEFAULT_SHUTDOWN_GRACE_MS;
  const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? console;
  let shutdownPromise: Promise<void> | null = null;

  const handleSignal = (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = new Promise((resolve) => {
      logger.log(`[shutdown] Received ${signal}, draining HTTP server.`);
      let settled = false;
      let forceTimer: NodeJS.Timeout | null = null;
      const finish = (code: number, err?: unknown) => {
        if (settled) return;
        settled = true;
        if (forceTimer) clearTimeout(forceTimer);
        if (err) {
          logger.error("[shutdown] HTTP server close failed:", err);
        }
        exitProcess(code);
        resolve();
      };
      forceTimer = setTimeout(() => {
        logger.warn(`[shutdown] Grace period exceeded after ${shutdownGraceMs}ms; forcing exit.`);
        finish(1);
      }, shutdownGraceMs);
      forceTimer.unref?.();
      server.close((err) => {
        if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          finish(1, err);
          return;
        }
        finish(0);
      });
    });
    return shutdownPromise;
  };

  const register = (): (() => void) => {
    const onSigterm = () => {
      void handleSignal("SIGTERM");
    };
    const onSigint = () => {
      void handleSignal("SIGINT");
    };
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);
    return () => {
      process.removeListener("SIGTERM", onSigterm);
      process.removeListener("SIGINT", onSigint);
    };
  };

  return {
    handleSignal,
    register,
  };
}

export function diagnosticsAccessAllowed(params: {
  authorizationHeader?: unknown;
  isLocalDev?: boolean;
  bearerToken?: string;
}): boolean {
  if (params.isLocalDev === true) return true;
  const expectedToken = String(params.bearerToken || "").trim();
  if (!expectedToken) return false;
  const header = safeString(params.authorizationHeader ?? "").trim();
  return header === `Bearer ${expectedToken}`;
}

export function resolveAllowedMcpCorsOrigin(
  originHeader: unknown,
  allowedOrigins: readonly string[] = MCP_CORS_ALLOW_ORIGINS
): string {
  const origin = safeString(originHeader ?? "").trim();
  if (!origin) return "";
  return allowedOrigins.includes(origin) ? origin : "";
}

function applyMcpCorsHeaders(res: any, allowedOrigin: string): void {
  if (!allowedOrigin) return;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", MCP_CORS_ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", MCP_CORS_ALLOWED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

const httpServer = async (req: any, res: any) => {
  const hostHeader = safeString(req?.headers?.host ?? "localhost");
  const url = new URL(req.url || "/", `http://${hostHeader}`);

  // Apply security headers to all responses
  applySecurityHeaders(res);

  // OpenAI Apps Challenge endpoint (for App Store submission verification)
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    if (!OPENAI_APPS_CHALLENGE_TOKEN) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Health/ready checks (App Runner + local smoke)
  const isVersionEndpoint = url.pathname === "/version";
  const isReadyEndpoint =
    url.pathname === "/health" || url.pathname === "/healthz" || url.pathname === "/ready";
  const isDiagnosticsEndpoint = url.pathname === "/diagnostics";
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (isVersionEndpoint || isReadyEndpoint || isDiagnosticsEndpoint)
  ) {
    const correlationId = getCorrelationId(req);
    const traceId = getTraceId(req) || correlationId;
    ensureCorrelationHeader(res, correlationId);
    if (
      isDiagnosticsEndpoint &&
      !diagnosticsAccessAllowed({
        authorizationHeader: req?.headers?.authorization,
        isLocalDev,
        bearerToken: DIAGNOSTICS_BEARER_TOKEN,
      })
    ) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    if (isVersionEndpoint) {
      res.writeHead(200, { "content-type": "text/plain" });
      if (req.method === "GET") {
        res.end(
          `VERSION=${VERSION}\nIMAGE_DIGEST=${IMAGE_DIGEST || "unknown"}\nCONTRACT_VERSION=${VIEW_CONTRACT_VERSION}\nSTATE_VERSION=${CURRENT_STATE_VERSION}\nTOOL_CONTRACT_FAMILY_VERSION=${MCP_TOOL_CONTRACT_FAMILY_VERSION}\nRUN_STEP_INPUT_SCHEMA_VERSION=${RUN_STEP_TOOL_INPUT_SCHEMA_VERSION}\nRUN_STEP_OUTPUT_SCHEMA_VERSION=${RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION}`
        );
      } else {
        res.end();
      }
      return;
    }
    if (isDiagnosticsEndpoint) {
      const nowMs = Date.now();
      const bootstrapSessions = summarizeBootstrapSessions(nowMs);
      const idempotency = summarizeIdempotencyRegistry(nowMs);
      const memoryUsage = process.memoryUsage();
      logStructuredEvent(
        "info",
        "diagnostics_endpoint_read",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: "",
          step_id: "",
          contract_id: "",
        },
        {
          method: req.method,
        }
      );
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "GET") {
        res.end(
          JSON.stringify({
            status: "ok",
            ready: true,
            timestamp: new Date(nowMs).toISOString(),
            uptime_s: Math.floor(process.uptime()),
            correlation_id: correlationId,
            trace_id: traceId,
            versions: {
              app: VERSION,
              state: CURRENT_STATE_VERSION,
              view_contract: VIEW_CONTRACT_VERSION,
              tool_contract_family: MCP_TOOL_CONTRACT_FAMILY_VERSION,
              run_step_input_schema: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
              run_step_output_schema: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
            },
            registries: {
              bootstrap_sessions: bootstrapSessions,
              idempotency,
            },
            limits: {
              max_request_size_bytes: MAX_REQUEST_SIZE_BYTES,
              request_timeout_ms: REQUEST_TIMEOUT_MS,
              bootstrap_session_registry_ttl_ms: BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
              idempotency_entry_ttl_ms: IDEMPOTENCY_ENTRY_TTL_MS,
            },
            runtime: {
              local_dev: isLocalDev,
              rollout_flags: {
                run_step_stale_ingest_guard_v1: RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED,
                run_step_stale_rebase_v1: RUN_STEP_STALE_REBASE_V1_ENABLED,
                run_step_stale_rebase_v1_effective:
                  RUN_STEP_STALE_INGEST_GUARD_V1_ENABLED && RUN_STEP_STALE_REBASE_V1_ENABLED,
              },
              pid: process.pid,
              memory_bytes: {
                rss: memoryUsage.rss,
                heap_total: memoryUsage.heapTotal,
                heap_used: memoryUsage.heapUsed,
                external: memoryUsage.external,
              },
            },
          })
        );
      } else {
        res.end();
      }
      return;
    }
    if (isReadyEndpoint) {
      logStructuredEvent(
        "info",
        "ready_endpoint_read",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: "",
          step_id: "",
          contract_id: "",
        },
        {
          method: req.method,
          path: url.pathname,
          ready_reason_code: "readiness_probe",
        }
      );
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "GET") {
      res.end(
        JSON.stringify({
          status: "ok",
          ready: true,
          correlation_id: correlationId,
          trace_id: traceId,
          version: VERSION,
          state_version: CURRENT_STATE_VERSION,
          contract_version: VIEW_CONTRACT_VERSION,
          tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
          run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
          run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
          run_step_compatibility: RUN_STEP_TOOL_COMPAT_POLICY,
          diagnostics_endpoint: "/diagnostics",
        })
      );
    } else {
      res.end();
    }
    return;
  }

  // Favicon: 200 + minimal 1x1 PNG so browser does not show 404
  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    const faviconPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwEHgP5fFuuHAAAAAElFTkSuQmCC",
      "base64"
    );
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    });
    res.end(faviconPng);
    return;
  }

  // Static template: Presentation PPTX
  if (req.method === "GET" && url.pathname === "/templates/presentation.pptx") {
    try {
      const filePath = getPresentationTemplatePath();
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-length": stat.size,
        "cache-control": "public, max-age=86400",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Template not found");
    }
    return;
  }

  // Generated presentations (local or server temp)
  if (req.method === "GET" && url.pathname.startsWith("/presentations/")) {
    try {
      const fileName = path.basename(url.pathname);
      const dir = path.join(os.tmpdir(), "business-canvas-presentations");
      const filePath = path.join(dir, fileName);
      const stat = fs.statSync(filePath);
      const ext = path.extname(fileName).toLowerCase();

      let contentType = "application/octet-stream";
      let disposition = `attachment; filename="${fileName}"`;
      if (ext === ".pptx") {
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (ext === ".pdf") {
        contentType = "application/pdf";
        disposition = `inline; filename="${fileName}"`;
      } else if (ext === ".png") {
        contentType = "image/png";
        disposition = `inline; filename="${fileName}"`;
      }

      res.writeHead(200, {
        "content-type": contentType,
        "content-length": stat.size,
        "content-disposition": disposition,
        "cache-control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Presentation not found");
    }
    return;
  }

  // Static root for /ui/* – runtime only requires step-card.bundled.html.
  if (req.method === "GET" && url.pathname.startsWith("/ui/")) {
    const resolved = resolveUiAssetPath(url.pathname, DEFAULT_UI_DIR);
    if (!resolved) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    try {
      const stat = fs.statSync(resolved);
      const fileName = path.basename(resolved);
      if (fileName === "step-card.template.html") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }

      const ext = path.extname(resolved).toLowerCase();
      const contentType =
        ext === ".html" ? "text/html;profile=mcp-app" :
        ext === ".js" ? "application/javascript" :
        ext === ".css" ? "text/css" :
        ext === ".svg" ? "image/svg+xml" :
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
        "application/octet-stream";
      if (fileName === "step-card.bundled.html") {
        const withVersion = loadUiHtml(resolveBaseUrl(req));
        res.writeHead(200, {
          "content-type": contentType,
          "cache-control": "no-store",
          "x-ui-version": VERSION,
        });
        res.end(withVersion);
        return;
      }
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-ui-version": VERSION,
      });
      fs.createReadStream(resolved).pipe(res);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    }
    return;
  }

  // MCP endpoint (production + local dev)
  const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    const correlationId = getCorrelationId(req);
    const traceId = getTraceId(req) || correlationId;
    const allowedCorsOrigin = resolveAllowedMcpCorsOrigin(req?.headers?.origin);
    (req as any).__correlationId = correlationId;
    ensureCorrelationHeader(res, correlationId);
    applyMcpCorsHeaders(res, allowedCorsOrigin);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const acceptHeader = getHeader(req, "accept");
    const contentType = getHeader(req, "content-type");
    const contentLength = Number(getHeader(req, "content-length") || 0);

    // Apply rate limiting
    const rateLimitMiddleware = createRateLimitMiddleware();
    let rateLimitPassed = false;
    
    await new Promise<void>((resolve) => {
      rateLimitMiddleware(req, res, () => {
        rateLimitPassed = true;
        resolve();
      });
      
      // If headers were sent (rate limit hit), resolve immediately
      if (res.headersSent) {
        resolve();
      }
    });
    
    // If rate limited, stop here
    if (!rateLimitPassed || res.headersSent) {
      return;
    }

    const baseUrl = resolveBaseUrl(req);
    const mcpServer = createAppServer(baseUrl);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    let timeout: NodeJS.Timeout | null = null;
    try {
      let parsedBody: unknown | undefined = undefined;

      // Pre-parse only when headers are spec-compliant, otherwise let SDK handle 406/415.
      const shouldPreParse =
        req.method === "POST" &&
        acceptHeader.includes("application/json") &&
        acceptHeader.includes("text/event-stream") &&
        contentType.includes("application/json");

      if (shouldPreParse) {
        let raw: Buffer;
        try {
          raw = await readBodyWithLimit(req, MAX_REQUEST_SIZE_BYTES);
        } catch (e: any) {
          const code = safeString(e?.code ?? "");
          if (code === "body_too_large") {
            logStructuredEvent(
              "warn",
              "mcp_request_rejected_body_too_large",
              {
                correlation_id: correlationId,
                trace_id: traceId,
                session_id: "",
                step_id: "",
                contract_id: "",
              },
              {
                method: req.method,
                max_size: MAX_REQUEST_SIZE_BYTES,
              }
            );
            const errPayload = jsonRpcErrorResponse(413, "Request entity too large", {
              error_code: "body_too_large",
              correlation_id: correlationId,
              trace_id: traceId,
              max_size: MAX_REQUEST_SIZE_BYTES,
            }, -32000);
            res.writeHead(errPayload.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(errPayload.payload));
            return;
          }
          logStructuredEvent(
            "warn",
            "mcp_request_aborted",
            {
              correlation_id: correlationId,
              trace_id: traceId,
              session_id: "",
              step_id: "",
              contract_id: "",
            },
            {
              method: req.method,
              code: code || "request_aborted",
            }
          );
          const errPayload = jsonRpcErrorResponse(400, "Request aborted", {
            error_code: "request_aborted",
            correlation_id: correlationId,
            trace_id: traceId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
        (req as any).__bodySize = raw.length;
        const hashPrefix = createHash("sha256").update(raw.slice(0, 256)).digest("hex");
        logStructuredEvent(
          "info",
          "mcp_request_received",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            method: req.method,
            url: req.url,
            content_type: contentType,
            accept: acceptHeader,
            content_length: contentLength,
            body_size: raw.length,
            body_hash_prefix: hashPrefix,
          }
        );
        try {
          parsedBody = JSON.parse(raw.toString("utf-8"));
        } catch (e) {
          logStructuredEvent(
            "warn",
            "mcp_request_invalid_json",
            {
              correlation_id: correlationId,
              trace_id: traceId,
              session_id: "",
              step_id: "",
              contract_id: "",
            },
            {
              method: req.method,
              body_size: raw.length,
            }
          );
          const errPayload = jsonRpcErrorResponse(400, "Parse error: Invalid JSON", {
            error_code: "invalid_json",
            correlation_id: correlationId,
            trace_id: traceId,
          });
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
      }

      timeout = setTimeout(() => {
        logStructuredEvent(
          "warn",
          "mcp_request_timeout",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            method: req.method,
            timeout_ms: REQUEST_TIMEOUT_MS,
          }
        );
        if (!res.headersSent) {
          const errPayload = jsonRpcErrorResponse(408, "Request timeout", {
            error_code: "timeout",
            correlation_id: correlationId,
            trace_id: traceId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
        }
        try { transport.close(); } catch {}
        try { mcpServer.close(); } catch {}
      }, REQUEST_TIMEOUT_MS);

      if (MCP_SIMULATED_HANDLE_DELAY_MS > 0) {
        logStructuredEvent(
          "info",
          "mcp_request_delay_injected",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            method: req.method,
            delay_ms: MCP_SIMULATED_HANDLE_DELAY_MS,
          }
        );
        await delay(MCP_SIMULATED_HANDLE_DELAY_MS);
      }

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      logStructuredEvent(
        "error",
        "mcp_request_error",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: "",
          step_id: "",
          contract_id: "",
        },
        {
          message: safeString((error as Error)?.message ?? error),
        }
      );
      if (!res.headersSent) {
        const errPayload = jsonRpcErrorResponse(500, "Internal server error", {
          error_code: "server_error",
          correlation_id: correlationId,
          trace_id: traceId,
        }, -32000);
        res.writeHead(errPayload.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(errPayload.payload));
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return;
  }

  res.writeHead(404).end("Not Found");
};

type StartServerOptions = {
  host?: string;
  port?: number;
  registerSignalHandlers?: boolean;
  shutdownGraceMs?: number;
  exitProcess?: (code: number) => void;
  logger?: Pick<typeof console, "log" | "warn" | "error">;
};

async function startServer(options: StartServerOptions = {}): Promise<Server> {
  try {
    await getRunStep();
  } catch (err) {
    console.error("[FATAL] run_step module failed to load at startup:", err);
    process.exit(1);
  }

  const listenHost = options.host ?? host;
  const listenPort = options.port ?? port;
  const logger = options.logger ?? console;
  const server = createServer(httpServer);
  const shutdownController = createProcessShutdownController(server, {
    shutdownGraceMs: options.shutdownGraceMs,
    exitProcess: options.exitProcess,
    logger,
  });
  const removeSignalHandlers = options.registerSignalHandlers === false
    ? () => {}
    : shutdownController.register();
  server.once("close", removeSignalHandlers);
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener("error", onError);
      removeSignalHandlers();
      reject(err);
    };
    server.once("error", onError);
    server.listen(listenPort, listenHost, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  logger.log(
    `Business Canvas MCP server listening on http://${listenHost}:${listenPort}${MCP_PATH} (${VERSION})`
  );
  if (isLocalDev) {
    logger.log(`Local dev: MCP http://localhost:${listenPort}${MCP_PATH}  UI http://localhost:${listenPort}/ui/step-card`);
  }
  return server;
}

export { httpServer, startServer };
