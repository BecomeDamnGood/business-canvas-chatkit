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

const VERSION = "v35";

// OpenAI Apps domain verification
const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ??
  "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

// Debug UI route (browser inspect)
const UI_HTTP_PATH = "/ui/step-card";
const UI_MIME_TYPE = "text/html+skybridge";

// Canonical widget URI (OpenAI uses this in openai/outputTemplate)
const UI_RESOURCE_URI = "ui://widget/step-card.html";

function loadUiHtml(): string {
  return readFileSync(new URL("./ui/step-card.html", import.meta.url), "utf8");
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  // Register Skybridge UI template as MCP resource (ui://...)
  server.registerResource("bsc-step-card", UI_RESOURCE_URI, {}, async () => ({
    contents: [
      {
        uri: UI_RESOURCE_URI,
        mimeType: UI_MIME_TYPE,
        text: loadUiHtml(),
        _meta: {
          "openai/widgetPrefersBorder": true,
        },
      },
    ],
  }));

  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description: "Runs the Business Strategy Canvas flow. Returns structured data for the widget.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.string(), z.any()).optional(),
      },
      _meta: {
        // Auth metadata here (SDK accepts _meta flexibly)
        securitySchemes: [{ type: "noauth" }],

        // Widget template to render when this tool is invoked
        "openai/outputTemplate": UI_RESOURCE_URI,

        // Allow widget to call tools via window.openai.callTool
        "openai/widgetAccessible": true,
      },
    },
    async (args) => {
      const result = await runCanvasStep({
        current_step_id: args.current_step_id,
        user_message: args.user_message,
        state: args.state ?? {},
      });

      // IMPORTANT: Keep the widget contract simple + app-leading:
      // - put the full result at structuredContent.result (root)
      // - keep chat text empty
      const structuredContent = {
        title: `Business Strategy Canvas Builder (${VERSION})`,
        meta: `step: ${result.state.current_step} | specialist: ${result.active_specialist}`,
        result, // <- widget reads this directly
      };

      return {
        // app-leading: keep chat output empty/minimal
        content: [{ type: "text", text: "" }],
        structuredContent,
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
    try {
      res.writeHead(200, { "content-type": UI_MIME_TYPE });
      res.end(loadUiHtml());
    } catch (e: any) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`Failed to load UI template: ${e?.message ?? String(e)}`);
    }
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
  console.log(`Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH} (${VERSION})`);
});
