// mcp-server/server.ts
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createRateLimitMiddleware } from "./src/middleware/rateLimit.js";
import { applySecurityHeaders } from "./src/middleware/security.js";
import { CanvasStateZod, getDefaultState, getFinalsSnapshot } from "./src/core/state.js";
import { getPresentationTemplatePath } from "./src/core/presentation_paths.js";
import { safeString } from "./src/server_safe_string.js";

function loadDotEnv() {
  try {
    const raw = readFileSync(new URL("./.env", import.meta.url), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!key) continue;
      // Strip surrounding quotes if present.
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

loadDotEnv();

// Keep module reference cached, but force-load during boot so startup fails fast on handler/type errors.
let runStepModule: typeof import("./src/handlers/run_step.js") | null = null;
async function getRunStep() {
  if (!runStepModule) runStepModule = await import("./src/handlers/run_step.js");
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

// Keep this aligned with your release tag
const VERSION = safeString(process.env.VERSION ?? "").trim() || "v119";

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

const MCP_PATH = "/mcp";
const UI_RESOURCE_PATH = "/ui/step-card";
const UI_RESOURCE_QUERY = `?v=${encodeURIComponent(VERSION)}`;
const UI_RESOURCE_NAME = "business-canvas-widget";
const MAX_REQUEST_SIZE_BYTES = Number(process.env.MAX_REQUEST_SIZE_BYTES || 1024 * 1024); // 1MB default
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000); // 30s default

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

function injectUiVersion(html: string): string {
  return html.replace(/__UI_VERSION__/g, VERSION);
}

function normalizeStepId(rawStepId: string): string {
  const trimmed = safeString(rawStepId ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "start") return "step_0";
  return trimmed;
}

function hasNonBusinessFinals(state: Record<string, unknown> | null | undefined): boolean {
  const snapshot = getFinalsSnapshot((state ?? {}) as any);
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "business_name") continue;
    if (safeString(value ?? "").trim()) return true;
  }
  return false;
}

function isFirstStartStep(stepId: string, state: Record<string, unknown> | null | undefined): boolean {
  return stepId === "step_0" && !hasNonBusinessFinals(state);
}

function loadUiHtml(): string {
  try {
    const raw = readFileSync(new URL("./ui/step-card.bundled.html", import.meta.url), "utf-8");
    return injectUiVersion(raw);
  } catch (e) {
    console.error("[loadUiHtml] Failed:", e);
    return "<html><body>UI not available</body></html>";
  }
}

/** Shared run_step logic for MCP tool and POST /run_step (local testing). */
async function runStepHandler(args: {
  current_step_id: string;
  user_message: string;
  input_mode?: "widget" | "chat";
  state?: Record<string, unknown>;
}): Promise<{ structuredContent: Record<string, unknown> }> {
  const current_step_id = normalizeStepId(args.current_step_id ?? "");
  const state = (args.state ?? {}) as Record<string, unknown>;
  const user_message_raw = safeString(args.user_message ?? "");
  const isStart = current_step_id === "step_0";
  const user_message =
    isStart && !user_message_raw.trim() ? "" : user_message_raw;
  const seed_user_message =
    isStart && user_message_raw.trim()
      ? user_message_raw.trim()
      : "";
  const hasInitiator = safeString(state?.initial_user_message ?? "").trim() !== "";
  const stateForTool =
    isStart && user_message_raw.trim()
      ? {
          ...state,
          ...(hasInitiator ? {} : { initial_user_message: user_message_raw.trim() }),
          started: "true",
        }
      : state;

  const stepIdStr = safeString(current_step_id ?? "");
  const msgLen = typeof user_message_raw === "string" ? user_message_raw.length : 0;
  const stateKeysCount = stateForTool && typeof stateForTool === "object" && stateForTool !== null ? Object.keys(stateForTool).length : 0;
  console.log(`[run_step] step_id=${stepIdStr} user_message_len=${msgLen} state_keys=${stateKeysCount}`);

  try {
    const runStepTool = await getRunStep();
    const result = await runStepTool({
      user_message,
      input_mode: args.input_mode,
      state: stateForTool,
    });
    const { debug: _omit, ...resultForClient } = result as {
      debug?: unknown;
      [key: string]: unknown;
    };
    const stepMeta =
      safeString((result as { state?: { current_step?: string } }).state?.current_step ?? "unknown") || "unknown";
    const specialistMeta =
      safeString((result as { active_specialist?: string }).active_specialist ?? "unknown") || "unknown";
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: `step: ${stepMeta} | specialist: ${specialistMeta}`,
      result: resultForClient,
    };
    const uiPayload = buildUiStructured(resultForClient);
    if (uiPayload) structuredContent.ui = uiPayload;
    if (seed_user_message) structuredContent.seed_user_message = seed_user_message;
    return { structuredContent };
  } catch (error: unknown) {
    const err = error as any;
    const debugEnabled =
      process.env.LOCAL_DEV === "1" ||
      safeString((stateForTool as any)?.debug?.enable ?? "").toLowerCase() === "true";
    console.error("[run_step] ERROR:", safeString(err?.message ?? err), safeString(err?.meta ?? ""));
    if (err?.stack) {
      console.error("[run_step] STACK:", safeString(err.stack));
    }
    if (debugEnabled) {
      const details = err instanceof Error
        ? [err.message, err.stack].filter(Boolean).join("\n")
        : inspect(err, { depth: 8, breakLength: 120 });
      console.error("[run_step] DEV: exception details:", details);
      if (err?.cause) {
        console.error("[run_step] DEV: cause:", inspect(err.cause, { depth: 8, breakLength: 120 }));
      }
      const status = err?.status ?? err?.statusCode ?? err?.response?.status;
      if (status !== undefined) {
        console.error("[run_step] DEV: status:", safeString(status));
      }
      const code = err?.code ?? err?.response?.data?.code ?? err?.response?.data?.error?.code;
      if (code !== undefined) {
        console.error("[run_step] DEV: code:", safeString(code));
      }
      console.error("[run_step] DEV: OPENAI_API_KEY present:", Boolean(process.env.OPENAI_API_KEY));
    }
    
    // Use current state if available, otherwise use default state
    const currentState = (stateForTool && typeof stateForTool === "object" && stateForTool !== null) 
      ? stateForTool 
      : getDefaultState();
    const currentStep = safeString((currentState as any).current_step ?? "step_0") || "step_0";
    
    const fallbackResult = {
      ok: false as const,
      tool: "run_step",
      current_step_id: currentStep,
      active_specialist: "",
      text: "", // Geen chat tekst
      prompt: "",
      specialist: {},
      state: currentState,
      error: {
        type: "server_error",
        message: "Probeer opnieuw", // UI message, niet chat
        retry_action: "reload"
      },
    };
    const structuredContent: Record<string, unknown> = {
      title: `The Business Strategy Canvas Builder (${VERSION})`,
      meta: "error",
      result: fallbackResult,
    };
    const uiPayload = buildUiStructured(fallbackResult as Record<string, unknown>);
    if (uiPayload) structuredContent.ui = uiPayload;
    if (seed_user_message) structuredContent.seed_user_message = seed_user_message;
    return { structuredContent };
  }
}

function buildContentFromResult(
  result: Record<string, unknown> | null | undefined,
  options?: { isFirstStart?: boolean }
): string {
  // App-only contract: keep chat silent on success.
  if (!result || typeof result !== "object") return "";
  const hasError = Boolean((result as any).error);
  if (hasError) return "Open de app om verder te gaan.";
  if (options?.isFirstStart) return "Canvas Builder geopend in de app.";
  return "";
}

function buildUiStructured(result: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const uiObj = (result as any).ui && typeof (result as any).ui === "object" ? (result as any).ui : {};
  const prompt = safeString((result as any).prompt ?? "");
  const text = safeString((result as any).text ?? "");
  const promptBody = prompt || text || "";
  const actionCodes = Array.isArray(uiObj.action_codes) ? uiObj.action_codes : [];
  const options = actionCodes.map((code: unknown, idx: number) => ({
    id: safeString(idx + 1),
    actionCode: safeString(code),
  }));
  const flags =
    uiObj.flags && typeof uiObj.flags === "object" ? (uiObj.flags as Record<string, boolean>) : {};
  const expectedChoiceCount =
    typeof uiObj.expected_choice_count === "number"
      ? uiObj.expected_choice_count
      : (actionCodes.length ? actionCodes.length : undefined);
  return {
    prompt: { body: promptBody },
    options,
    state: {
      menu_id: safeString((result as any)?.specialist?.menu_id ?? ""),
      expected_choice_count: expectedChoiceCount,
      flags,
    },
    view: { version: VERSION },
  };
}

function resolveBaseUrl(req?: any): string {
  const explicit = safeString(process.env.PUBLIC_BASE_URL ?? process.env.BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (isLocalDev) {
    const portStr = safeString(process.env.PORT ?? port).trim();
    return `http://localhost:${portStr}`;
  }
  if (req) {
    const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
    if (host) {
      const protoHeader = getHeader(req, "x-forwarded-proto");
      const scheme = protoHeader ? protoHeader.split(",")[0].trim() : "https";
      return `${scheme}://${host}`.replace(/\/+$/, "");
    }
  }
  return "";
}

function createAppServer(baseUrl: string): McpServer {
  const server = new McpServer(
    {
      name: "business-canvas-chatkit",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register UI resource
  const uiResourceUri = baseUrl
    ? `${baseUrl}${UI_RESOURCE_PATH}${UI_RESOURCE_QUERY}`
    : `${UI_RESOURCE_PATH}${UI_RESOURCE_QUERY}`;
  
  server.registerResource(
    UI_RESOURCE_NAME,
    uiResourceUri,
    {
      mimeType: "text/html;profile=mcp-app",
      description: "Business Strategy Canvas Builder widget UI",
    },
    async () => {
      // Return the UI HTML content
      return {
        contents: [
          {
            uri: uiResourceUri,
            text: loadUiHtml(),
          },
        ],
      };
    }
  );

  const RunStepInputSchema = z.object({
    // ChatGPT/Widget sometimes sends this as "start" or omits it
    current_step_id: z.string().optional().default("step_0"),
    user_message: z.string().optional().default(""),
    input_mode: z.enum(["widget", "chat"]).optional(),
    // Use CanvasStateZod schema for type safety and validation
    // .partial() makes all fields optional (for empty/partial state)
    // .passthrough() allows extra fields for backwards compatibility (transient fields, etc.)
    state: CanvasStateZod.partial().passthrough().optional(),
  });

  server.registerTool(
    "run_step",
    {
      title: "Business Strategy Canvas Builder",
      description:
        "Use this tool whenever the user asks for a business plan, strategy, canvas, or growing an agency/business. This tool drives the primary UI experience (Business Strategy Canvas Builder). Start by calling run_step with current_step_id: \"step_0\" and the user's message. Keep chat output minimal; the UI should ask questions and capture answers via structuredContent.",
      inputSchema: RunStepInputSchema,
      annotations: {
        readOnlyHint: false, // Tool generates files and modifies state
        openWorldHint: false, // No external posts
        destructiveHint: false, // No destructive actions
      },
      // Note: securitySchemes is in _meta per MCP SDK implementation requirements.
      // The MCP SDK does not support top-level securitySchemes in the current version.
      // This is included in the MCP response JSON that ChatGPT/OpenAI receives.
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: {
          resourceUri: uiResourceUri,
          visibility: ["model","app"],
        },
        "openai/outputTemplate": uiResourceUri,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Thinking...",
        "openai/toolInvocation/invoked": "Updated",
      },
    },
    async (args) => {
      const normalizedStepId = normalizeStepId(args.current_step_id ?? "");
      const isFirstStart = isFirstStartStep(
        normalizedStepId,
        (args.state ?? {}) as Record<string, unknown>
      );
      const { structuredContent } = await runStepHandler({
        current_step_id: safeString(args.current_step_id ?? ""),
        user_message: safeString(args.user_message ?? ""),
        input_mode: args.input_mode,
        state: (args.state ?? {}) as Record<string, unknown>,
      });
      const contentText = buildContentFromResult(
        (structuredContent && (structuredContent as any).result) ? (structuredContent as any).result : null,
        { isFirstStart }
      );
      return {
        content: [{ type: "text", text: contentText }],
        structuredContent,
      };
    }
  );

  return server;
}

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

  // Health check (App Runner)
  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    if (req.method === "GET") {
      res.end(`VERSION=${VERSION}`);
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
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const args = JSON.parse(body || "{}") as {
          current_step_id?: string;
          user_message?: string;
          input_mode?: "widget" | "chat";
          state?: Record<string, unknown>;
        };
        const { structuredContent } = await runStepHandler({
          current_step_id: safeString(args.current_step_id ?? "step_0") || "step_0",
          user_message: safeString(args.user_message ?? ""),
          input_mode: args.input_mode,
          state: args.state,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ structuredContent }));
      } catch (e) {
        console.error("[POST /run_step]", e);
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
          return data.structuredContent || data;
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
      if (path.basename(resolved) === "step-card.bundled.html") {
        const withVersion = loadUiHtml();
        res.writeHead(200, {
          "content-type": contentType,
          "cache-control": "public, max-age=3600",
          "x-ui-version": VERSION,
        });
        res.end(withVersion);
        return;
      }
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
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
            const errPayload = jsonRpcErrorResponse(413, "Request entity too large", {
              error_code: "body_too_large",
              correlation_id: correlationId,
              max_size: MAX_REQUEST_SIZE_BYTES,
            }, -32000);
            res.writeHead(errPayload.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(errPayload.payload));
            return;
          }
          const errPayload = jsonRpcErrorResponse(400, "Request aborted", {
            error_code: "request_aborted",
            correlation_id: correlationId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
        (req as any).__bodySize = raw.length;
        const hashPrefix = createHash("sha256").update(raw.slice(0, 256)).digest("hex");
        console.warn(
          "[mcp] request",
          JSON.stringify({
            correlationId,
            method: req.method,
            url: req.url,
            contentType,
            accept: acceptHeader,
            contentLength,
            bodySize: raw.length,
            bodyHashPrefix: hashPrefix,
          })
        );
        try {
          parsedBody = JSON.parse(raw.toString("utf-8"));
        } catch (e) {
          const errPayload = jsonRpcErrorResponse(400, "Parse error: Invalid JSON", {
            error_code: "invalid_json",
            correlation_id: correlationId,
          });
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
          return;
        }
      }

      timeout = setTimeout(() => {
        if (!res.headersSent) {
          const errPayload = jsonRpcErrorResponse(408, "Request timeout", {
            error_code: "timeout",
            correlation_id: correlationId,
          }, -32000);
          res.writeHead(errPayload.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(errPayload.payload));
        }
        try { transport.close(); } catch {}
        try { mcpServer.close(); } catch {}
      }, REQUEST_TIMEOUT_MS);

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        const errPayload = jsonRpcErrorResponse(500, "Internal server error", {
          error_code: "server_error",
          correlation_id: correlationId,
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

void startServer();
