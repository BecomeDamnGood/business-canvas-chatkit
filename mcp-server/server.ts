// mcp-server/server.ts
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { runCanvasStep } from "./agents.js";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

const VERSION = "v12-agents";

// OpenAI Apps domain verification
const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

// UI (Skybridge)
const UI_RESOURCE_NAME = "bsc-step-card";
const UI_RESOURCE_URI = "ui://widget/step-card.html";
const UI_MIME_TYPE = "text/html+skybridge";

// ---- Crash-proof global logging (so App Runner logs show the REAL error) ----
process.on("uncaughtException", (err: any) => {
  console.error("[FATAL] uncaughtException:", err?.stack || err);
});
process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] unhandledRejection:", reason?.stack || reason);
});

// ---- Fallback UI so the server never fails to boot ----
function fallbackUiHtml(reason: string): string {
  const safe = String(reason || "Unknown").slice(0, 5000);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Business Canvas UI (fallback)</title>
    <style>
      body{ font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin:0; padding:18px; }
      .card{ border:1px solid rgba(0,0,0,0.12); border-radius:14px; padding:14px; }
      .t{ font-weight:800; font-size:16px; margin:0 0 6px; }
      .m{ color:#475569; white-space:pre-wrap; }
      code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="t">UI template fallback loaded</p>
      <div class="m">
        <p>This means the widget HTML could not be loaded or registered.</p>
        <p><strong>Reason:</strong></p>
        <code>${safe.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>
      </div>
    </div>
  </body>
</html>`;
}

function safeLoadUiHtml(): { html: string; error?: string } {
  try {
    // Read relative to this file at runtime in the container
    const html = readFileSync(new URL("./ui/step-card.html", import.meta.url), "utf8");
    return { html };
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    console.error("[UI] Failed to read ./ui/step-card.html:", msg);
    return { html: fallbackUiHtml(msg), error: msg };
  }
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });
  const anyServer: any = server;

  // ---- Register UI Resource (NEVER crash the server if this fails) ----
  const ui = safeLoadUiHtml();

  const resourceHandler = async (uriObj: any) => {
    const href = typeof uriObj === "string" ? uriObj : (uriObj?.href ?? UI_RESOURCE_URI);
    return {
      contents: [
        {
          uri: href,
          mimeType: UI_MIME_TYPE,
          text: ui.html,
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    };
  };

  try {
    if (typeof anyServer.registerResource === "function") {
      anyServer.registerResource(UI_RESOURCE_NAME, UI_RESOURCE_URI, {}, resourceHandler);
      console.log("[UI] Resource registered via registerResource:", UI_RESOURCE_URI);
    } else if (typeof anyServer.resource === "function") {
      anyServer.resource(UI_RESOURCE_NAME, UI_RESOURCE_URI, resourceHandler);
      console.log("[UI] Resource registered via resource():", UI_RESOURCE_URI);
    } else {
      console.warn("[UI] No resource registration method found on McpServer. Widget may not render.");
    }
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    // Do NOT throw — keep server alive.
    console.error("[UI] Resource registration failed (continuing without widget):", msg);
  }

  // ---- Tool: run_step ----
  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description: "Runs the Business Strategy Canvas flow. Returns structured content for the widget.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.string(), z.any()).optional(),
      },
      _meta: {
        "openai/outputTemplate": UI_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
        "openai/toolInvocation/invoking": "Running step…",
        "openai/toolInvocation/invoked": "Step updated.",
      } as any,
    } as any,
    async (args: any) => {
      const result = await runCanvasStep({
        current_step_id: args.current_step_id,
        user_message: args.user_message,
        state: args.state ?? {},
      });

      return {
        // Keep content minimal to reduce chat “extra text”
        content: [{ type: "text", text: result.text || "" }],
        structuredContent: {
          ui: {
            version: result.version ?? "agents-v1",
            active_specialist: result.active_specialist,
            text: result.text,
            specialist: result.specialist,
            state: result.state,
          },
        },
        _meta: {
          "openai/outputTemplate": UI_RESOURCE_URI,
          "openai/widgetAccessible": true,
          "openai/resultCanProduceWidget": true,
        },
      };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  if (req.method === "GET" && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`VERSION=${VERSION}`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Business Canvas MCP server (${VERSION})`);
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    let mcpServer: any;
    let transport: any;

    try {
      mcpServer = createAppServer();
      transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

      res.on("close", () => {
        try {
          transport?.close?.();
        } catch {}
        try {
          mcpServer?.close?.();
        } catch {}
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error: any) {
      console.error("Error handling MCP request:", error?.stack || error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, host, () => {
  console.log(`Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`);
});
