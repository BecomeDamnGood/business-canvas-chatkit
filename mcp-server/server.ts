// mcp-server/server.ts
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { run_step as runStepTool } from "./src/handlers/run_step.js";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

// Keep this aligned with your release tag
const VERSION = process.env.VERSION ?? "v61";

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

const UI_HTTP_PATH = "/ui/step-card";
const UI_MIME_TYPE = "text/html+skybridge";
const UI_RESOURCE_URI = "ui://widget/step-card.html";

function loadUiHtml(): string {
  return readFileSync(new URL("./ui/step-card.html", import.meta.url), "utf8");
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  // Widget resource (Skybridge)
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

 // Tool: run_step (widget-leading)
server.registerTool(
  "run_step",
  {
    title: "Run Step",
    description:
      "Widget-leading Business Strategy Canvas flow. Always call this tool for each user interaction and render using the widget output template. The user should answer via the widget (not the chat box).",
    inputSchema: {
      // ChatGPT/Widget sometimes sends this as 'start'
      current_step_id: z.string(),
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
    const current_step_id = String(args.current_step_id ?? "").trim();
    const state = (args.state ?? {}) as Record<string, any>;

    // IMPORTANT:
    // If the request is a "start" trigger, do NOT pass a meta-instruction as user_message.
    // We force a clean start so the widget shows the Step 0 question.
    const user_message_raw = String(args.user_message ?? "");
    const user_message =
      current_step_id.toLowerCase() === "start" ? "" : user_message_raw;

    // NEW: capture seed ONLY for the initial start trigger (widget will use it once after Start)
    const seed_user_message =
      current_step_id.toLowerCase() === "start" && user_message_raw.trim()
        ? user_message_raw.trim()
        : "";

    // Basic request logging (so CloudWatch shows tool calls + failures)
    console.log(
      `[run_step] step_id=${current_step_id} user_message_len=${user_message_raw.length} state_keys=${Object.keys(
        state
      ).length}`
    );

    try {
      const result = await runStepTool({
        user_message,
        state,
      });

      const structuredContent: any = {
        title: `Business Strategy Canvas Builder (${VERSION})`,
        meta: `step: ${result.state?.current_step ?? "unknown"} | specialist: ${
          result.active_specialist ?? "unknown"
        }`,
        result,
      };

      // NEW: attach seed for the widget pre-start screen
      if (seed_user_message) structuredContent.seed_user_message = seed_user_message;

      // Keep chat empty; widget renders via outputTemplate + structuredContent
      return {
        content: [{ type: "text", text: "" }],
        structuredContent,
      };
    } catch (error: any) {
      console.error("[run_step] ERROR:", error?.message ?? error, error?.meta ?? "");

      // Safe widget fallback (never throw; never return chat text)
      const fallbackResult = {
        ok: true,
        tool: "run_step",
        current_step_id: "step_0",
        active_specialist: "ValidationAndBusinessName",
        text: "",
        prompt:
          "Something went wrong on the server. Please try again (or restart the canvas).",
        specialist: {
          action: "ESCAPE",
          message: "Something went wrong on the server.",
          question: "Please try again.",
          refined_formulation: "",
          confirmation_question: "",
        },
        state: {
          state_version: "1",
          current_step: "step_0",
          active_specialist: "ValidationAndBusinessName",
          intro_shown_for_step: "",
          intro_shown_session: "false",
          last_specialist_result: {},
          step_0_final: "",
          dream_final: "",
          business_name: "TBD",
          summary_target: "unknown",
        },
        debug: {
          error: String(error?.message ?? error),
        },
      };

      const structuredContent: any = {
        title: `Business Strategy Canvas Builder (${VERSION})`,
        meta: `error: run_step failed`,
        result: fallbackResult,
      };

      // NEW: even on error, still pass seed if present (optional but nice)
      if (seed_user_message) structuredContent.seed_user_message = seed_user_message;

      return {
        content: [{ type: "text", text: "" }],
        structuredContent,
      };
    }
  }
);

return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) return void res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // OpenAI Apps verification
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Health check (App Runner)
  if (req.method === "GET" && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`VERSION=${VERSION}`);
    return;
  }

  // Widget HTML (debug)
  if (req.method === "GET" && url.pathname === UI_HTTP_PATH) {
    res.writeHead(200, { "content-type": UI_MIME_TYPE });
    res.end(loadUiHtml());
    return;
  }

  // Root (debug)
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`Business Canvas MCP server (${VERSION})`);
    return;
  }

  // MCP transport
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
