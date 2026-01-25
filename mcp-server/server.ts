import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

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
      description: "Thin wrapper tool for Agent Builder. Returns a JSON echo of inputs.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.any()).optional()
      }
    },
    async (args) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              tool: "run_step",
              current_step_id: args.current_step_id,
              user_message: args.user_message,
              state: args.state ?? {}
            })
          }
        ]
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

