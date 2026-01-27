// mcp-server/server.ts
import { createServer } from "node:http";
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

// UI template settings
const UI_HTTP_PATH = "/ui/step-card";
const UI_MIME_TYPE = "text/html+skybridge";

function stepCardHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Step Output Card</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 16px; }
      .card { border: 1px solid rgba(0,0,0,0.12); border-radius: 14px; padding: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
      .title { font-size: 16px; font-weight: 700; margin: 0 0 8px 0; }
      .body { font-size: 14px; line-height: 1.45; margin: 0; white-space: pre-wrap; }
      .muted { opacity: 0.7; font-size: 12px; margin-top: 10px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h3 class="title" id="title">Step Output</h3>
      <p class="body" id="body">No content</p>
      <div class="muted" id="meta"></div>
    </div>

    <script>
      function pickData() {
        return (
          (globalThis.__SKYBRIDGE__ && globalThis.__SKYBRIDGE__.data) ||
          globalThis.skybridgeData ||
          globalThis.templateData ||
          {}
        );
      }

      const data = pickData();
      const title = data.title || "Step Output";
      const body = data.body || data.text || "No content";
      const meta = data.meta || "";

      document.getElementById("title").textContent = title;
      document.getElementById("body").textContent = body;
      document.getElementById("meta").innerHTML = meta ? "<code>" + meta + "</code>" : "";
    </script>
  </body>
</html>`;
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check. Returns pong plus an optional echo message.",
      inputSchema: { message: z.string().optional() }
    },
    async (args) => {
      const message = args?.message;
      return { content: [{ type: "text", text: message ? `pong: ${message}` : "pong" }] };
    }
  );

  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description: "Runs the Business Canvas agents flow (router + specialists + integrator). Returns UI template metadata.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const result = await runCanvasStep({
        current_step_id: args.current_step_id,
        user_message: args.user_message,
        state: args.state ?? {}
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: {
          title: `Business Canvas (${VERSION})`,
          body: result.text,
          meta: `step: ${result.state.current_step} | specialist: ${result.active_specialist} | templateUrl: ${UI_HTTP_PATH}`
        },
        _meta: {
          "openai/outputTemplateUrl": UI_HTTP_PATH
        }
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

  if (req.method === "GET" && url.pathname === UI_HTTP_PATH) {
    res.writeHead(200, { "content-type": UI_MIME_TYPE });
    res.end(stepCardHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Business Canvas MCP server (${VERSION})`);
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    const mcpServer = createAppServer();
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
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
