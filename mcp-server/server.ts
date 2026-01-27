import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

// OpenAI Apps domain verification
const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

// UI template settings
const UI_HTTP_PATH = "/ui/step-card";
const UI_TEMPLATE_URI = "resource://ui/step-card";
const UI_MIME_TYPE = "text/html+skybridge";

function loadStepCardHtml(): string {
  // This resolves to mcp-server/ui/step-card.html when running from server.ts
  const fileUrl = new URL("./ui/step-card.html", import.meta.url);
  return readFileSync(fileUrl, "utf-8");
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  // Register UI resource if the SDK supports it, but do not crash if it does not.
  // We also serve the same template over plain HTTP at /ui/step-card as a fallback.
  const html = loadStepCardHtml();
  const anyServer = server as any;

  if (typeof anyServer.registerResource === "function") {
    try {
      anyServer.registerResource(
        UI_TEMPLATE_URI,
        {
          title: "Step Output Card",
          description: "Minimal Skybridge UI template for rendering tool output.",
          mimeType: UI_MIME_TYPE
        },
        async () => {
          return {
            contents: [
              {
                uri: UI_TEMPLATE_URI,
                mimeType: UI_MIME_TYPE,
                text: html
              }
            ]
          };
        }
      );
    } catch (e) {
      console.warn("registerResource failed, continuing with HTTP fallback only:", e);
    }
  }

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
      description: "Thin wrapper tool for Agent Builder. Returns a JSON echo of inputs and a UI template payload.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.any()).optional()
      }
    },
    async (args) => {
      const payload = {
        ok: true,
        tool: "run_step",
        current_step_id: args.current_step_id,
        user_message: args.user_message,
        state: args.state ?? {}
      };

      const bodyText =
        `current_step_id: ${payload.current_step_id}\n` +
        `user_message: ${payload.user_message}\n\n` +
        `state:\n${JSON.stringify(payload.state, null, 2)}`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload)
          }
        ],
        structuredContent: {
          title: "Run Step Result",
          body: bodyText,
          meta: `template: ${UI_TEMPLATE_URI}`
        },
        _meta: {
          // Primary: MCP resource URI
          "openai/outputTemplate": UI_TEMPLATE_URI,
          // Fallback: direct HTTP URL path (useful in some hosts)
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

  // Domain verification endpoint must return only the token, as plain text.
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Serve Skybridge UI template over plain HTTP as a fallback.
  if (req.method === "GET" && url.pathname === UI_HTTP_PATH) {
    try {
      const html = loadStepCardHtml();
      res.writeHead(200, { "content-type": UI_MIME_TYPE });
      res.end(html);
    } catch (e) {
      console.error("Failed to serve UI template:", e);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Failed to load UI template");
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("Business Canvas MCP server");
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
  console.log(`Business Canvas MCP server listening on http://${host}:${port}${MCP_PATH}`);
});
