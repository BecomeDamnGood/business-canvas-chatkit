import { createServer } from "node:http";
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
  RunStepToolInputSchema,
  RunStepToolStructuredContentOutputSchema,
} from "../contracts/mcp_tool_contract.js";
import { CURRENT_STATE_VERSION } from "../core/state.js";
import { VIEW_CONTRACT_VERSION } from "../core/bootstrap_runtime.js";
import { getPresentationTemplatePath } from "../core/presentation_paths.js";
import { createRateLimitMiddleware } from "../middleware/rateLimit.js";
import { applySecurityHeaders } from "../middleware/security.js";
import { safeString } from "../server_safe_string.js";

import { normalizeHostWidgetSessionId } from "./locale_resolution.js";
import { ensureRunStepOutputTupleParity } from "./ordering_parity.js";
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
  IDEMPOTENCY_ENTRY_TTL_MS,
  IMAGE_DIGEST,
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
  normalizeIdempotencyKey,
  port,
} from "./server_config.js";
import { summarizeBootstrapSessions } from "./ordering_parity.js";
import { summarizeIdempotencyRegistry } from "./idempotency_registry.js";
import { createAppServer } from "./mcp_registration.js";
import { resolveBaseUrl } from "./run_step_model_result.js";
import { loadUiHtml, runStepHandler } from "./run_step_transport.js";

const httpServer = async (req: any, res: any) => {
  const hostHeader = safeString(req?.headers?.host ?? "localhost");
  const url = new URL(req.url || "/", `http://${hostHeader}`);

  // Apply security headers to all responses
  applySecurityHeaders(res);

  // OpenAI Apps Challenge endpoint (for App Store submission verification)
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
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

  // --- Local dev only: /test and /run_step (no impact on production / MCP) ---
  if (isLocalDev) {
    // POST /run_step — bridge endpoint: same handler as MCP tool, same structuredContent shape.
    if (req.method === "POST" && url.pathname === "/run_step") {
      const correlationId = getCorrelationId(req);
      const traceId = getTraceId(req) || correlationId;
      ensureCorrelationHeader(res, correlationId);
      let raw: Buffer;
      try {
        raw = await readBodyWithLimit(req, MAX_REQUEST_SIZE_BYTES);
      } catch (e: any) {
        const code = safeString(e?.code ?? "");
        if (code === "body_too_large") {
          logStructuredEvent(
            "warn",
            "post_run_step_body_too_large",
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
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({
            error: "body_too_large",
            error_code: "body_too_large",
            max_size: MAX_REQUEST_SIZE_BYTES,
          }));
          return;
        }
        logStructuredEvent(
          "warn",
          "post_run_step_request_aborted",
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
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "request_aborted", error_code: "request_aborted" }));
        return;
      }
      let parsedBody: unknown = {};
      try {
        parsedBody = JSON.parse(raw.toString("utf-8") || "{}");
      } catch {
        logStructuredEvent(
          "warn",
          "post_run_step_invalid_json",
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
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json", error_code: "invalid_json" }));
        return;
      }
      const parsedArgsResult = RunStepToolInputSchema.safeParse(parsedBody);
      if (!parsedArgsResult.success) {
        logStructuredEvent(
          "warn",
          "post_run_step_invalid_payload",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            method: req.method,
            issue_count: parsedArgsResult.error.issues.length,
          }
        );
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "invalid_run_step_payload",
            error_code: "invalid_run_step_payload",
            issues: parsedArgsResult.error.issues,
          })
        );
        return;
      }
      try {
        const args = parsedArgsResult.data;
        const parsedState =
          args.state && typeof args.state === "object" && !Array.isArray(args.state)
            ? (args.state as Record<string, unknown>)
            : {};
        const idempotencyKeyFromHeaders =
          normalizeIdempotencyKey(getHeader(req, "idempotency-key")) ||
          normalizeIdempotencyKey(getHeader(req, "x-idempotency-key"));
        const handlerOutput = await runStepHandler({
          current_step_id: safeString(args.current_step_id ?? "step_0") || "step_0",
          user_message: safeString(args.user_message ?? ""),
          input_mode: args.input_mode,
          locale_hint: safeString(args.locale_hint ?? ""),
          locale_hint_source: args.locale_hint_source ?? "none",
          idempotency_key:
            normalizeIdempotencyKey(args.idempotency_key) ||
            idempotencyKeyFromHeaders ||
            normalizeIdempotencyKey(
              parsedState.__client_action_id ?? ""
            ),
          correlation_id: correlationId,
          trace_id: traceId,
          host_widget_session_id: normalizeHostWidgetSessionId(args.host_widget_session_id),
          state: parsedState,
        });
        const parityOutput = ensureRunStepOutputTupleParity({
          structuredContent: handlerOutput.structuredContent,
          meta: handlerOutput.meta,
          requestState: parsedState,
          requestHostWidgetSessionId: normalizeHostWidgetSessionId(args.host_widget_session_id),
          correlationId,
          traceId,
          defaultStepId: safeString(args.current_step_id ?? "step_0") || "step_0",
        });
        const structuredContent = parityOutput.structuredContent;
        const meta = parityOutput.meta;
        const hasMetaWidgetResult =
          meta &&
          typeof meta === "object" &&
          (meta as any).widget_result &&
          typeof (meta as any).widget_result === "object";
        if (!hasMetaWidgetResult) {
          throw new Error("meta_widget_result_missing");
        }
        const parsedStructuredContent = RunStepToolStructuredContentOutputSchema.parse(structuredContent);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ structuredContent: parsedStructuredContent, ...(meta ? { _meta: meta } : {}) }));
      } catch (e) {
        logStructuredEvent(
          "error",
          "post_run_step_error",
          {
            correlation_id: correlationId,
            trace_id: traceId,
            session_id: "",
            step_id: "",
            contract_id: "",
          },
          {
            message: safeString((e as Error)?.message ?? e),
          }
        );
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: safeString((e as Error)?.message ?? e) }));
      }
      return;
    }

    // GET /test — step-card HTML + injected openai bridge (callTool → fetch /run_step, set toolOutput, dispatch openai:set_globals).
    if (req.method === "GET" && (url.pathname === "/test" || url.pathname === "/test/")) {
      const widgetHtml = loadUiHtml();
      const OPENAI_BRIDGE = `
  <script>
    (function() {
      if (typeof globalThis.openai !== "undefined") return;
      globalThis.openai = {
        callTool: async function(name, args) {
          const resp = await fetch("/run_step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          });
          const data = await resp.json();
          return data;
        },
        toolOutput: null,
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    })();
  </script>
`;
      const withBridge = widgetHtml.replace("<body>", "<body>" + OPENAI_BRIDGE);
      res.writeHead(200, { "content-type": "text/html" });
      res.end(withBridge);
      return;
    }
  }

  // Static root for /ui/* – serve step-card.bundled.html, lib/*.js, assets, etc.
  if (req.method === "GET" && url.pathname.startsWith("/ui/")) {
    const uiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ui");
    let filePath: string;
    if (url.pathname === "/ui/step-card" || url.pathname === "/ui/step-card/") {
      filePath = path.join(uiDir, "step-card.bundled.html");
    } else {
      const rest = url.pathname.slice("/ui/".length).replace(/\/$/, "") || "index.html";
      filePath = path.join(uiDir, rest);
    }
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(uiDir)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
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
        const withVersion = loadUiHtml();
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
    (req as any).__correlationId = correlationId;
    ensureCorrelationHeader(res, correlationId);

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

httpServer.listen = createServer(httpServer).listen.bind(createServer(httpServer));

async function startServer(): Promise<void> {
  try {
    await getRunStep();
  } catch (err) {
    console.error("[FATAL] run_step module failed to load at startup:", err);
    process.exit(1);
  }

  httpServer.listen(port, host, () => {
    console.log(
      `Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`
    );
    if (isLocalDev) {
      console.log(`Local dev: GET http://localhost:${port}/test  POST http://localhost:${port}/run_step`);
    }
  });
}

export { httpServer, startServer };
