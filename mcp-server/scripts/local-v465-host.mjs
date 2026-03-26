import http from "node:http";

const HOST_PORT = Number(process.env.HOST_PORT || 8787);
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 8789);
const UPSTREAM_ORIGIN = `http://127.0.0.1:${UPSTREAM_PORT}`;

function copyHeaders(sourceHeaders, res, options = {}) {
  const skip = new Set((options.skip || []).map((value) => String(value).toLowerCase()));
  for (const [key, value] of Object.entries(sourceHeaders || {})) {
    if (skip.has(String(key).toLowerCase())) continue;
    if (typeof value === "undefined") continue;
    res.setHeader(key, value);
  }
}

function localBootstrapScript() {
  return `<script>
(() => {
  const host = (window.openai && typeof window.openai === "object") ? window.openai : {};
  const query = new URLSearchParams(window.location.search);
  const forcedLang = query.get("lang");
  if (forcedLang) host.locale = forcedLang;
  if (!host.widgetState || typeof host.widgetState !== "object") {
    host.widgetState = {};
  }
  function applyToolResult(toolInput, toolResult) {
    host.toolInput = toolInput || {};
    host.toolOutput = (toolResult && typeof toolResult.structuredContent === "object") ? toolResult.structuredContent : {};
    host.toolResponseMetadata = (toolResult && typeof toolResult._meta === "object") ? toolResult._meta : {};
    window.dispatchEvent(new CustomEvent("openai:set_globals", {
      detail: { globals: host }
    }));
  }
  async function callTool(name, args) {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: String(Date.now()),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });
    const payload = await response.json();
    const toolResult = payload && payload.result ? payload.result : {};
    applyToolResult(args || {}, toolResult);
    return {
      toolOutput: host.toolOutput,
      toolResponseMetadata: host.toolResponseMetadata
    };
  }
  host.callTool = callTool;
  window.openai = host;
  async function bootstrap() {
    await callTool("run_step", {
      current_step_id: "step_0",
      user_message: "",
      input_mode: "widget",
      state: {}
    });
  }
  bootstrap().catch((error) => {
    console.error("[local_v465_host_bootstrap_failed]", error);
  });
})();
</script>`;
}

function injectBootstrap(html) {
  const marker = "</body>";
  const injection = localBootstrapScript();
  if (html.includes(marker)) {
    return html.replace(marker, `${injection}\n${marker}`);
  }
  return `${html}\n${injection}`;
}

function requestOptions(req) {
  const headers = { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` };
  return {
    hostname: "127.0.0.1",
    port: UPSTREAM_PORT,
    path: req.url || "/",
    method: req.method || "GET",
    headers,
  };
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Missing URL");
    return;
  }

  const upstreamReq = http.request(requestOptions(req), (upstreamRes) => {
    const chunks = [];
    upstreamRes.on("data", (chunk) => chunks.push(chunk));
    upstreamRes.on("end", () => {
      const body = Buffer.concat(chunks);
      const isHtmlStepCard =
        (req.method || "GET").toUpperCase() === "GET" &&
        req.url.startsWith("/ui/step-card");

      if (isHtmlStepCard) {
        const html = body.toString("utf8");
        const injected = injectBootstrap(html);
        res.statusCode = upstreamRes.statusCode || 200;
        copyHeaders(upstreamRes.headers, res, { skip: ["content-length"] });
        res.setHeader("content-length", Buffer.byteLength(injected));
        res.setHeader("x-local-host-wrapper", "v465");
        res.end(injected);
        return;
      }

      res.statusCode = upstreamRes.statusCode || 200;
      copyHeaders(upstreamRes.headers, res);
      res.end(body);
    });
  });

  upstreamReq.on("error", (error) => {
    res.statusCode = 502;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`Upstream proxy error: ${error.message}`);
  });

  req.on("data", (chunk) => upstreamReq.write(chunk));
  req.on("end", () => upstreamReq.end());
});

server.listen(HOST_PORT, "0.0.0.0", () => {
  console.log(`[local-v465-host] http://localhost:${HOST_PORT} -> ${UPSTREAM_ORIGIN}`);
});
