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

// UI resource (Skybridge)
const UI_RESOURCE_NAME = "bsc-step-card";
const UI_RESOURCE_URI = "ui://widget/step-card.html";
const UI_MIME_TYPE = "text/html+skybridge";

function loadUiHtml(): string {
  try {
    // This resolves relative to this file (server.ts) at runtime in the container
    return readFileSync(new URL("./ui/step-card.html", import.meta.url), "utf8");
  } catch (e: any) {
    // Make failure explicit (App Runner logs will show a normal error message)
    const msg = e?.message ? String(e.message) : String(e);
    throw new Error(`Failed to load UI HTML (./ui/step-card.html). ${msg}`);
  }
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });
  const uiHtml = loadUiHtml();

  // ---- Register UI as a Resource (robust across SDK variations) ----
  // Some SDK versions differ slightly in resource registration signature.
  // We detect available method(s) at runtime and register accordingly.
  const anyServer: any = server;

  const resourceHandler = async (uriObj: any) => {
    // SDK may pass a URL object, or a string. Normalize:
    const href = typeof uriObj === "string" ? uriObj : (uriObj?.href ?? UI_RESOURCE_URI);

    return {
      contents: [
        {
          uri: href,
          mimeType: UI_MIME_TYPE,
          text: uiHtml,
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    };
  };

  try {
    if (typeof anyServer.registerResource === "function") {
      // Expected signature in many versions:
      // registerResource(name, uri, options, handler(uri))
      anyServer.registerResource(UI_RESOURCE_NAME, UI_RESOURCE_URI, {}, resourceHandler);
    } else if (typeof anyServer.resource === "function") {
      // Alternative signature seen in some builds:
      // resource(name, uri, handler(uri))
      anyServer.resource(UI_RESOURCE_NAME, UI_RESOURCE_URI, resourceHandler);
    } else {
      console.warn("No resource registration method found on McpServer. UI widget may not render.");
    }
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    throw new Error(`Failed to register UI resource (${UI_RESOURCE_URI}). ${msg}`);
  }

  // ---- Tool: run_step (forced flow; widget calls this tool via window.openai.callTool) ----
  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description:
        "Runs the Business Strategy Canvas flow. Returns structured content for the widget and keeps state machine stable.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.string(), z.any()).optional(),
      },
      // Tool-level metadata (host hints)
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

      // Response-level metadata (some hosts prefer this location)
      return {
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

  // OpenAI Apps domain verification
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Health/version
  if (req.method === "GET" && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`VERSION=${VERSION}`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Business Canvas MCP server (${VERSION})`);
    return;
  }

  // MCP endpoint
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
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, host, () => {
  console.log(`Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`);
});
