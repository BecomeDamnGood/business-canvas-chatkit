#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = String(process.env.SMOKE_PORT || process.env.PORT || "8787").trim() || "8787";
const baseUrl = `http://127.0.0.1:${port}`;
const legacyWidgetBaseUrl =
  String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${port}`).trim().replace(/\/+$/, "");
const serverCwd = dirname(fileURLToPath(new URL("../server.ts", import.meta.url)));
const readyTimeoutMs = Number(process.env.SMOKE_READY_TIMEOUT_MS || 30000);
const bundlePath = path.resolve(serverCwd, "ui/step-card.bundled.html");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractResult(payload) {
  const result = payload?.result?.structuredContent?.result ?? payload?.structuredContent?.result;
  assert.equal(Boolean(result && typeof result === "object"), true, "model result payload ontbreekt");
  return result;
}

function extractWidgetResult(payload) {
  const result = payload?.result?._meta?.widget_result ?? payload?._meta?.widget_result;
  assert.equal(Boolean(result && typeof result === "object"), true, "widget result payload ontbreekt");
  return result;
}

function extractJsonRpcError(payload) {
  return payload?.error && typeof payload.error === "object" ? payload.error : null;
}

async function waitForReady(maxMs = 30000, isServerAlive = () => true) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (!isServerAlive()) {
      throw new Error("Server proces stopte voordat /ready beschikbaar werd");
    }
    try {
      const res = await fetch(`${baseUrl}/ready`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await sleep(500);
  }
  throw new Error(`Server niet ready binnen ${maxMs}ms`);
}

let mcpSessionId = "";
let rpcId = 0;
let mcpInitialized = false;

async function postMcp(body, headers = {}) {
  const reqHeaders = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...headers,
  };
  if (mcpSessionId && !reqHeaders["mcp-session-id"]) {
    reqHeaders["mcp-session-id"] = mcpSessionId;
  }
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: reqHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const sessionFromHeader = String(res.headers.get("mcp-session-id") || "").trim();
  if (sessionFromHeader) {
    mcpSessionId = sessionFromHeader;
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function ensureMcpInitialized() {
  if (mcpInitialized) return;
  const init = await postMcp({
    jsonrpc: "2.0",
    id: `init-${++rpcId}`,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "runtime-smoke", version: "1.0.0" },
    },
  });
  assert.equal(init.status, 200, "MCP initialize moet 200 geven");
  assert.equal(Boolean(extractJsonRpcError(init.json)), false, "MCP initialize mag geen JSON-RPC error geven");
  mcpInitialized = true;
}

async function readResourceUri(resourceUri) {
  const readRes = await postMcp({
    jsonrpc: "2.0",
    id: `read-${++rpcId}`,
    method: "resources/read",
    params: { uri: resourceUri },
  });
  assert.equal(readRes.status, 200, `resources/read moet 200 geven voor ${resourceUri}`);
  assert.equal(Boolean(extractJsonRpcError(readRes.json)), false, `resources/read mag geen JSON-RPC error geven voor ${resourceUri}`);

  const content = readRes.json?.result?.contents?.[0];
  assert.equal(Boolean(content), true, `resources/read content ontbreekt voor ${resourceUri}`);
  assert.equal(String(content?.uri || ""), resourceUri, `resources/read content URI mismatch voor ${resourceUri}`);
  assert.equal(
    String(content?.mimeType || ""),
    "text/html;profile=mcp-app",
    `resources/read content mimeType mismatch voor ${resourceUri}`
  );
  assert.equal(typeof content?.text === "string" && content.text.length > 0, true, `resources/read HTML ontbreekt voor ${resourceUri}`);
}

async function readUiResource() {
  await ensureMcpInitialized();

  const toolsRes = await postMcp({
    jsonrpc: "2.0",
    id: `tools-${++rpcId}`,
    method: "tools/list",
    params: {},
  });
  assert.equal(toolsRes.status, 200, "tools/list moet 200 geven");
  assert.equal(Boolean(extractJsonRpcError(toolsRes.json)), false, "tools/list mag geen JSON-RPC error geven");

  const runStepTool = toolsRes.json?.result?.tools?.find?.((tool) => tool?.name === "run_step");
  assert.equal(Boolean(runStepTool), true, "run_step tool ontbreekt in tools/list");

  const resourceUri = String(runStepTool?._meta?.ui?.resourceUri || "");
  assert.equal(resourceUri.startsWith("ui://"), true, "run_step resourceUri moet ui:// gebruiken");
  assert.equal(
    String(runStepTool?._meta?.["openai/outputTemplate"] || ""),
    resourceUri,
    "openai/outputTemplate moet exact gelijk zijn aan ui.resourceUri"
  );

  const resourcesRes = await postMcp({
    jsonrpc: "2.0",
    id: `resources-${++rpcId}`,
    method: "resources/list",
    params: {},
  });
  assert.equal(resourcesRes.status, 200, "resources/list moet 200 geven");
  assert.equal(Boolean(extractJsonRpcError(resourcesRes.json)), false, "resources/list mag geen JSON-RPC error geven");

  const listedResource = resourcesRes.json?.result?.resources?.find?.((resource) => resource?.uri === resourceUri);
  assert.equal(Boolean(listedResource), true, "UI resource ontbreekt in resources/list");
  assert.equal(
    String(listedResource?.mimeType || ""),
    "text/html;profile=mcp-app",
    "resources/list UI mimeType mismatch"
  );
  await readResourceUri(resourceUri);

  const legacyBaseUri = `${legacyWidgetBaseUrl}/ui/step-card`;
  const legacyUris = [
    legacyBaseUri,
    `${legacyBaseUri}?v=v474`,
    `${legacyBaseUri}?view=default`,
    `${legacyBaseUri}?v=2026-08-12-ui-template-corsfix&view=default`,
    `${legacyBaseUri}?view=default&v=2026-08-12-ui-template-corsfix`,
  ];
  for (const legacyUri of legacyUris) {
    await readResourceUri(legacyUri);
  }
}

async function callRunStep(body) {
  await ensureMcpInitialized();
  const res = await postMcp({
    jsonrpc: "2.0",
    id: `call-${++rpcId}`,
    method: "tools/call",
    params: {
      name: "run_step",
      arguments: body,
    },
  });
  const rpcError = extractJsonRpcError(res.json);
  assert.equal(
    Boolean(rpcError),
    false,
    `run_step tools/call JSON-RPC error: ${String(rpcError?.message || "unknown")}`
  );
  return { status: res.status, json: res.json, result: extractResult(res.json) };
}

async function main() {
  const startedAt = performance.now();
  const bundledHtml = fs.readFileSync(bundlePath, "utf8");
  assert.equal(bundledHtml.includes("text_compare"), true, "bundle mist text_compare support");
  assert.equal(bundledHtml.includes("list_compare"), true, "bundle mist list_compare support");
  assert.equal(bundledHtml.includes("compare_pick"), true, "bundle mist compare_pick surface support");
  assert.equal(
    bundledHtml.includes('"wording_choice"'),
    false,
    "bundle bevat nog een verboden legacy publieke compare-kind string"
  );
  const blockedRuntimeTerms = [
    ["he", "ygen"].join(""),
    ["app", ".", "he", "ygen", ".", "com"].join(""),
    ["fra", "me", "Domains"].join(""),
    ["fra", "me", "_", "domains"].join(""),
    ["<", "if", "rame"].join(""),
    ["open", "External"].join(""),
    ["redirect", "_", "domains"].join(""),
  ];
  for (const term of blockedRuntimeTerms) {
    assert.equal(
      bundledHtml.toLowerCase().includes(term.toLowerCase()),
      false,
      `bundle bevat verboden submission term: ${term}`
    );
  }

  const server = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: serverCwd,
    env: {
      ...process.env,
      LOCAL_DEV: process.env.LOCAL_DEV || "1",
      PORT: port,
      HOST: process.env.HOST || "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutTail = "";
  let stderrTail = "";
  let serverAlive = true;
  server.on("exit", () => {
    serverAlive = false;
  });
  server.stdout.on("data", (buf) => {
    stdoutTail = `${stdoutTail}${String(buf)}`.slice(-4000);
  });
  server.stderr.on("data", (buf) => {
    stderrTail = `${stderrTail}${String(buf)}`.slice(-4000);
  });

  const stopServer = async () => {
    if (server.killed || !serverAlive) return;
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!server.killed && serverAlive) server.kill("SIGKILL");
  };

  try {
    await waitForReady(readyTimeoutMs, () => serverAlive);

    const versionRes = await fetch(`${baseUrl}/version`);
    assert.equal(versionRes.ok, true, "/version moet 200 geven");
    const versionText = await versionRes.text();
    assert.equal(versionText.includes("VERSION="), true, "/version mist VERSION");
    assert.equal(versionText.includes("STATE_VERSION="), true, "/version mist STATE_VERSION");

    const readyRes = await fetch(`${baseUrl}/ready`);
    assert.equal(readyRes.ok, true, "/ready moet 200 geven");
    const readyJson = await readyRes.json();
    assert.equal(readyJson?.ready, true, "/ready payload mist ready=true");

    await readUiResource();

    const first = await callRunStep({
      current_step_id: "step_0",
      user_message: "Marketing agency Mindd",
      input_mode: "chat",
      state: {},
    });
    assert.equal(first.status, 200, "step_0 smoke request moet 200 geven");
    assert.equal(first.result.current_step_id, "step_0", "step_0 result mismatch");
    assert.equal(Boolean(first.result.state && typeof first.result.state === "object"), true, "step_0 state ontbreekt");
    for (const key of [
      "bootstrap_session_id",
      "idempotency_key",
      "host_widget_session_id",
      "response_seq",
      "client_action_id_echo",
      "action_code_echo",
    ]) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(first.result, key),
        false,
        `model-visible result bevat intern veld: ${key}`
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(first.result.state || {}, key),
        false,
        `model-visible state bevat intern veld: ${key}`
      );
    }
    const firstWidgetResult = extractWidgetResult(first.json);
    assert.equal(
      Boolean(firstWidgetResult.state && typeof firstWidgetResult.state === "object"),
      true,
      "widget_result state ontbreekt"
    );

    const idempotencyKey = `smoke-idem-${Date.now()}`;
    const duplicatePayload = {
      current_step_id: "step_0",
      user_message: "Marketing agency Mindd",
      input_mode: "chat",
      idempotency_key: idempotencyKey,
      state: firstWidgetResult.state,
    };
    const duplicate1 = await callRunStep(duplicatePayload);
    const duplicate2 = await callRunStep(duplicatePayload);
    const duplicateWidget1 = extractWidgetResult(duplicate1.json);
    const duplicateWidget2 = extractWidgetResult(duplicate2.json);

    const duplicateSeq1 = Number(duplicateWidget1.response_seq || duplicateWidget1.state?.response_seq || 0);
    const duplicateSeq2 = Number(duplicateWidget2.response_seq || duplicateWidget2.state?.response_seq || 0);
    assert.equal(duplicateSeq1 > 0, true, "duplicate #1 response_seq ontbreekt");
    assert.equal(duplicateSeq2 > 0, true, "duplicate #2 response_seq ontbreekt");

    const duplicateBehavior =
      duplicateSeq2 === duplicateSeq1 ? "replay" : duplicateSeq2 > duplicateSeq1 ? "fresh" : "invalid";
    assert.notEqual(duplicateBehavior, "invalid", "duplicate request gedrag ongeldig");

    const conflictCandidate = await callRunStep({
      ...duplicatePayload,
      user_message: "Different payload",
    });
    const conflictWidget = extractWidgetResult(conflictCandidate.json);
    const conflictSeq = Number(conflictWidget.response_seq || conflictWidget.state?.response_seq || 0);
    const conflictErrorType = String(conflictWidget?.error?.type || "");
    const conflictBehavior =
      conflictErrorType === "idempotency_conflict"
        ? "conflict"
        : conflictSeq >= duplicateSeq2
          ? "accepted"
          : "invalid";
    assert.notEqual(conflictBehavior, "invalid", "duplicate/conflict gedrag ongeldig");

    const durationMs = Math.round(performance.now() - startedAt);
    console.log(
      JSON.stringify(
        {
          smoke: "runtime",
          status: "PASS",
          duration_ms: durationMs,
          checks: {
            bundle_compare_kinds: "ok",
            server_start: "ok",
            ready: "ok",
            step0: "ok",
            duplicate_behavior: duplicateBehavior,
            duplicate_conflict_behavior: conflictBehavior,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          smoke: "runtime",
          status: "FAIL",
          message: String(error?.message || error || "unknown"),
          server_stdout_tail: stdoutTail.trim(),
          server_stderr_tail: stderrTail.trim(),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

await main();
