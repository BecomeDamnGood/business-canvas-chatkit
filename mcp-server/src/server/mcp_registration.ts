import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  MCP_TOOL_CONTRACT_FAMILY_VERSION,
  RUN_STEP_TOOL_CONTRACT_META,
  RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
  RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
  RunStepToolInputSchema,
  RunStepToolStructuredContentOutputSchema,
} from "../contracts/mcp_tool_contract.js";
import { safeString } from "../server_safe_string.js";

import {
  isFirstStartStep,
  mergeLocaleHintInputs,
  normalizeHostWidgetSessionId,
  normalizeStepId,
  resolveHostWidgetSessionIdFromExtra,
  resolveLocaleHintFromExtra,
} from "./locale_resolution.js";
import {
  hasCompleteOrderingTuple,
  normalizeBootstrapSessionId,
  readBootstrapOrdering,
} from "./ordering_parity.js";
import {
  logStructuredEvent,
  resolveContractIdFromRecord,
  resolveCorrelationIdFromExtra,
  resolveIdempotencyKeyFromExtra,
  resolveTraceIdFromExtra,
} from "./observability.js";
import {
  UI_RESOURCE_NAME,
  UI_RESOURCE_PATH,
  UI_RESOURCE_QUERY,
  VERSION,
  normalizeIdempotencyKey,
} from "./server_config.js";
import { buildContentFromResult } from "./run_step_model_result.js";
import { loadUiHtml, runStepHandler } from "./run_step_transport.js";

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

  server.registerTool(
    "run_step",
    {
      title: "Business Strategy Canvas Builder",
      description:
        "Use this tool to open or progress the Business Strategy Canvas Builder UI. Do not generate business content in chat. Do not summarize or explain what the app shows. After calling this tool, output nothing or at most one short neutral sentence confirming the app is open. All questions and interaction happen inside the app UI.",
      inputSchema: RunStepToolInputSchema,
      annotations: {
        readOnlyHint: false, // Tool generates files and modifies state
        openWorldHint: false, // No external posts
        destructiveHint: false, // No destructive actions
        idempotentHint: false,
      },
      outputSchema: RunStepToolStructuredContentOutputSchema,
      // Note: securitySchemes is in _meta per MCP SDK implementation requirements.
      // The MCP SDK does not support top-level securitySchemes in the current version.
      // This is included in the MCP response JSON that ChatGPT/OpenAI receives.
      _meta: {
        securitySchemes: [{ type: "noauth" }],
        ui: {
          resourceUri: uiResourceUri,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": uiResourceUri,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Thinking...",
        "openai/toolInvocation/invoked": "Updated",
        contract: RUN_STEP_TOOL_CONTRACT_META,
      },
    },
    async (args, extra) => {
      const normalizedStepId = normalizeStepId(args.current_step_id ?? "");
      const isFirstStart = isFirstStartStep(
        normalizedStepId,
        (args.state ?? {}) as Record<string, unknown>
      );
      const correlationId = resolveCorrelationIdFromExtra(extra);
      const traceId = resolveTraceIdFromExtra(extra) || correlationId;
      const localeFromExtra = resolveLocaleHintFromExtra(extra);
      const hostWidgetSessionId = normalizeHostWidgetSessionId(
        args.host_widget_session_id ?? resolveHostWidgetSessionIdFromExtra(extra)
      );
      const mergedLocale = mergeLocaleHintInputs(
        args.locale_hint,
        args.locale_hint_source,
        localeFromExtra
      );
      const idempotencyKey =
        normalizeIdempotencyKey(args.idempotency_key) ||
        resolveIdempotencyKeyFromExtra(extra) ||
        normalizeIdempotencyKey(
          (args.state as Record<string, unknown> | undefined)?.__client_action_id ?? ""
        );
      const handlerOutput = await runStepHandler({
        current_step_id: safeString(args.current_step_id ?? ""),
        user_message: safeString(args.user_message ?? ""),
        input_mode: args.input_mode,
        locale_hint: mergedLocale.locale_hint,
        locale_hint_source: mergedLocale.locale_hint_source,
        idempotency_key: idempotencyKey,
        correlation_id: correlationId,
        trace_id: traceId,
        host_widget_session_id: hostWidgetSessionId,
        state: (args.state ?? {}) as Record<string, unknown>,
      });
      const structuredContent = handlerOutput.structuredContent;
      const meta = handlerOutput.meta;
      const structuredResult =
        structuredContent &&
        typeof structuredContent === "object" &&
        (structuredContent as any).result &&
        typeof (structuredContent as any).result === "object"
          ? ((structuredContent as any).result as Record<string, unknown>)
          : {};
      const hasMetaWidgetResult =
        meta &&
        typeof meta === "object" &&
        (meta as any).widget_result &&
        typeof (meta as any).widget_result === "object";
      const hasStructuredResult = Object.keys(structuredResult).length > 0;
      const contentSource = hasMetaWidgetResult
        ? ((meta as any).widget_result as Record<string, unknown>)
        : structuredResult;
      const renderSourceOrdering = readBootstrapOrdering(contentSource);
      const contentSourceState =
        contentSource && typeof contentSource === "object" && contentSource.state && typeof contentSource.state === "object"
          ? (contentSource.state as Record<string, unknown>)
          : {};
      const renderSource = hasMetaWidgetResult
        ? "meta.widget_result"
        : (hasStructuredResult ? "structuredContent.result" : "none");
      const renderSourceReasonCode = hasMetaWidgetResult
        ? "meta_widget_result_authoritative"
        : (hasStructuredResult ? "structured_content_result_fallback" : "render_source_missing");
      const renderSourceStepId =
        safeString(
          (contentSource as any)?.current_step_id ??
          contentSourceState.current_step ??
          normalizedStepId ??
          "step_0"
        ) || "step_0";
      logStructuredEvent(
        hasMetaWidgetResult || hasStructuredResult ? "info" : "error",
        "run_step_render_source_selected",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: renderSourceOrdering.sessionId || normalizeBootstrapSessionId(contentSourceState.bootstrap_session_id),
          step_id: renderSourceStepId,
          contract_id: resolveContractIdFromRecord(contentSource || { state: args.state ?? {} }),
        },
        {
          render_source: renderSource,
          render_source_reason_code: renderSourceReasonCode,
          render_source_tuple_complete: hasCompleteOrderingTuple(renderSourceOrdering),
          host_widget_session_id_present: renderSourceOrdering.hostWidgetSessionId ? "true" : "false",
        }
      );
      const contentText = buildContentFromResult(contentSource, { isFirstStart });
      const parsedStructuredContent = RunStepToolStructuredContentOutputSchema.parse(structuredContent);
      return {
        content: [{ type: "text", text: contentText }],
        structuredContent: parsedStructuredContent,
        ...(meta ? { _meta: meta } : {}),
      };
    }
  );

  console.log("[mcp_tool_contract]", {
    run_step_visibility: ["model", "app"],
    run_step_output_template: true,
    ui_resource_uri: uiResourceUri,
    tool_contract_family_version: MCP_TOOL_CONTRACT_FAMILY_VERSION,
    run_step_input_schema_version: RUN_STEP_TOOL_INPUT_SCHEMA_VERSION,
    run_step_output_schema_version: RUN_STEP_TOOL_OUTPUT_SCHEMA_VERSION,
  });

  return server;
}

export { createAppServer };
