import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

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
  VERSION,
  normalizeIdempotencyKey,
} from "./server_config.js";
import { buildContentFromResult } from "./run_step_model_result.js";
import { loadUiHtml, runStepHandler } from "./run_step_transport.js";

export const RUN_STEP_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  openWorldHint: true,
  destructiveHint: false,
  idempotentHint: false,
});

export const RUN_STEP_TOOL_SECURITY_SCHEMES = Object.freeze([{ type: "noauth" }] as const);

function buildUiResourceUri(version: string): string {
  const normalizedVersion = encodeURIComponent(safeString(version || "").trim() || "v1");
  return `ui://widget/business-canvas-step-card-${normalizedVersion}.html`;
}

function buildLegacyUiResourceBaseUri(baseUrl: string): string {
  const raw = safeString(baseUrl || "").trim();
  if (!raw) return "";
  try {
    return new URL(UI_RESOURCE_PATH, raw).toString();
  } catch {
    return "";
  }
}

function buildLegacyUiResourceTemplates(baseUri: string): ResourceTemplate[] {
  if (!baseUri) return [];
  return [
    new ResourceTemplate(`${baseUri}{?v}`, { list: undefined }),
    new ResourceTemplate(`${baseUri}{?view}`, { list: undefined }),
    new ResourceTemplate(`${baseUri}{?v,view}`, { list: undefined }),
    new ResourceTemplate(`${baseUri}{?view,v}`, { list: undefined }),
  ];
}

function buildUiResourceContents(params: {
  resourceUri: string;
  baseUrl: string;
  widgetOrigin: string;
  widgetUiCsp: {
    connectDomains: string[];
    resourceDomains: string[];
  };
  widgetCompatCsp: {
    connect_domains: string[];
    resource_domains: string[];
  };
}) {
  const { resourceUri, baseUrl, widgetOrigin, widgetUiCsp, widgetCompatCsp } = params;
  return {
    contents: [
      {
        uri: resourceUri,
        mimeType: "text/html;profile=mcp-app",
        text: loadUiHtml(baseUrl),
        _meta: {
          ui: {
            csp: widgetUiCsp,
            ...(widgetOrigin ? { domain: widgetOrigin } : {}),
          },
          "openai/widgetDescription": "Business Strategy Canvas Builder widget UI",
          "openai/widgetCSP": widgetCompatCsp,
          ...(widgetOrigin ? { "openai/widgetDomain": widgetOrigin } : {}),
        },
      },
    ],
  };
}

function createAppServer(baseUrl: string): McpServer {
  const s3VideoOrigin = "https://mycanvasvideos.s3.amazonaws.com";
  const widgetOrigin = (() => {
    const raw = String(baseUrl || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  })();
  const widgetUiCsp = {
    connectDomains: Array.from(new Set([widgetOrigin, s3VideoOrigin].filter(Boolean))),
    resourceDomains: Array.from(new Set([widgetOrigin, s3VideoOrigin].filter(Boolean))),
  };
  const widgetCompatCsp = {
    connect_domains: widgetUiCsp.connectDomains,
    resource_domains: widgetUiCsp.resourceDomains,
  };
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
  const uiResourceUri = buildUiResourceUri(VERSION);
  const legacyUiResourceBaseUri = buildLegacyUiResourceBaseUri(baseUrl);
  
  server.registerResource(
    UI_RESOURCE_NAME,
    uiResourceUri,
    {
      mimeType: "text/html;profile=mcp-app",
      description: "Business Strategy Canvas Builder widget UI",
    },
    async () => {
      return buildUiResourceContents({
        resourceUri: uiResourceUri,
        baseUrl,
        widgetOrigin,
        widgetUiCsp,
        widgetCompatCsp,
      });
    }
  );

  if (legacyUiResourceBaseUri) {
    server.registerResource(
      `${UI_RESOURCE_NAME}-legacy-absolute`,
      legacyUiResourceBaseUri,
      {
        mimeType: "text/html;profile=mcp-app",
        description: "Legacy absolute Business Strategy Canvas Builder widget UI",
      },
      async () =>
        buildUiResourceContents({
          resourceUri: legacyUiResourceBaseUri,
          baseUrl,
          widgetOrigin,
          widgetUiCsp,
          widgetCompatCsp,
        })
    );

    for (const [index, template] of buildLegacyUiResourceTemplates(legacyUiResourceBaseUri).entries()) {
      server.registerResource(
        `${UI_RESOURCE_NAME}-legacy-template-${index + 1}`,
        template,
        {
          mimeType: "text/html;profile=mcp-app",
          description: "Legacy absolute Business Strategy Canvas Builder widget UI",
        },
        async (requestedUri) =>
          buildUiResourceContents({
            resourceUri: requestedUri.toString(),
            baseUrl,
            widgetOrigin,
            widgetUiCsp,
            widgetCompatCsp,
          })
      );
    }
  }

  server.registerTool(
    "run_step",
    {
      title: "Business Strategy Canvas Builder",
      description:
        "Use this tool to open or progress the Business Strategy Canvas Builder UI. Do not generate business content in chat. Do not summarize or explain what the app shows. After calling this tool, output nothing. All questions and interaction happen inside the app UI.",
      inputSchema: RunStepToolInputSchema,
      annotations: RUN_STEP_TOOL_ANNOTATIONS,
      outputSchema: RunStepToolStructuredContentOutputSchema,
      // Note: securitySchemes is in _meta per MCP SDK implementation requirements.
      // The MCP SDK does not support top-level securitySchemes in the current version.
      // This is included in the MCP response JSON that ChatGPT/OpenAI receives.
      _meta: {
        securitySchemes: RUN_STEP_TOOL_SECURITY_SCHEMES,
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
      const metaWidgetResult =
        meta &&
        typeof meta === "object" &&
        (meta as any).widget_result &&
        typeof (meta as any).widget_result === "object"
          ? ((meta as any).widget_result as Record<string, unknown>)
          : null;
      const contentSource = metaWidgetResult || structuredResult;
      const renderSourceOrdering = readBootstrapOrdering(contentSource);
      const contentSourceState =
        contentSource && typeof contentSource === "object" && contentSource.state && typeof contentSource.state === "object"
          ? (contentSource.state as Record<string, unknown>)
          : {};
      const renderSource = metaWidgetResult
        ? "meta.widget_result"
        : (Object.keys(structuredResult).length > 0 ? "structuredContent.result" : "none");
      const renderSourceReasonCode = metaWidgetResult
        ? "meta_widget_result_authoritative"
        : (Object.keys(structuredResult).length > 0 ? "structured_content_result_fallback" : "render_source_missing");
      const renderSourceStepId =
        safeString(
          (contentSource as any)?.current_step_id ??
          contentSourceState.current_step ??
          normalizedStepId ??
          "step_0"
        ) || "step_0";
      logStructuredEvent(
        Object.keys(contentSource).length > 0 ? "info" : "error",
        "run_step_render_source_selected",
        {
          correlation_id: correlationId,
          trace_id: traceId,
          session_id: renderSourceOrdering.sessionId || safeString(contentSourceState.bootstrap_session_id),
          step_id: renderSourceStepId,
          contract_id: resolveContractIdFromRecord(contentSource || { state: args.state ?? {} }),
        },
        {
          render_source: renderSource,
          render_source_reason_code: renderSourceReasonCode,
          render_source_tuple_complete: !!(renderSourceOrdering.sessionId && renderSourceOrdering.epoch > 0),
          host_widget_session_id_present: renderSourceOrdering.hostWidgetSessionId ? "true" : "false",
        }
      );
      const contentText = buildContentFromResult(contentSource, { isFirstStart });
      return {
        content: [{ type: "text", text: contentText }],
        structuredContent,
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
