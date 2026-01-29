// mcp-server/server.ts
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Tool wiring: use src/handlers/run_step.ts (compiled to .js in dist builds)
import { run_step } from "./src/handlers/run_step.js";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

const VERSION = "v39";

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ??
  "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

const UI_HTTP_PATH = "/ui/step-card";
const UI_MIME_TYPE = "text/html+skybridge";
const UI_RESOURCE_URI = "ui://widget/step-card.html";

function loadUiHtml(): string {
  return readFileSync(new URL("./ui/step-card.html", import.meta.url), "utf8");
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  server.registerResource("bsc-step-card", UI_RESOURCE_URI, {}, async () => ({
    contents: [
      {
        uri: UI_RESOURCE_URI,
        mimeType: UI_MIME_TYPE,
        text: loadUiHtml(),
        _meta: { "openai/widgetPrefersBorder": true },
      },
    ],
  }));

  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description:
        "Widget-leading Business Strategy Canvas flow. Always call this tool for each user interaction and render using the widget output template. The user should answer via the widget (not the chat box).",
      inputSchema: {
        // UI currently sends this; backend may ignore it safely.
        current_step_id: z.string().optional(),
        user_message: z.string(),
        state: z.record(z.string(), z.any()).optional(),
      },
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        "openai/outputTemplate": UI_RESOURCE_URI,
        "openai/widgetAccessible": true,
      },
    },
    async (args) => {
      // Delegate all orchestration/steps/integration to the handler
      const result = await run_step({
        user_message: args.user_message,
        state: args.state ?? {},
      });

      const structuredContent = {
        title: `Business Strategy Canvas Builder (${VERSION})`,
        meta: `step: ${result.state.current_step} | specialist: ${result.state.active_specialist ?? ""}`,
        result,
      };

      return {
        // Keep chat minimal; widget-leading
        content: [{ type: "text", text: "" }],
        structuredContent,
      };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) return void res.writeHead(400).end("Missing URL");
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
    res.end(loadUiHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`Business Canvas MCP server (${VERSION})`);
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
  console.log(
    `Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`
  );
});
