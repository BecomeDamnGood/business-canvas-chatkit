#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const serverCwd = dirname(fileURLToPath(new URL("../server.ts", import.meta.url)));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function pushCheck(checks, name, ok, details = {}) {
  checks.push({
    check: name,
    exit_code: ok ? 0 : 1,
    ok,
    ...details,
  });
}

async function waitForReady(baseUrl, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/ready`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await sleep(250);
  }
  throw new Error(`Server not ready within ${timeoutMs}ms`);
}

function findStructuredEvent(lines, eventName, correlationId = "") {
  for (const line of lines) {
    const parsed = parseJsonLine(line);
    if (!parsed || typeof parsed !== "object") continue;
    if (String(parsed.event || "") !== eventName) continue;
    if (correlationId && String(parsed.correlation_id || "") !== correlationId) continue;
    return parsed;
  }
  return null;
}

function findRawLine(lines, token) {
  return lines.find((line) => String(line).includes(token)) || "";
}

function readHeader(res, name) {
  return String(res.headers.get(name) || "");
}

function createServerHarness(config) {
  const logs = [];
  const proc = spawn("node", ["--loader", "ts-node/esm", "server.ts"], {
    cwd: serverCwd,
    env: {
      ...process.env,
      LOCAL_DEV: "1",
      HOST: "127.0.0.1",
      ...config.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let alive = true;
  proc.on("exit", () => {
    alive = false;
  });
  const onData = (chunk) => {
    const text = String(chunk || "");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) logs.push(line);
    }
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);

  async function stop() {
    if (!alive) return;
    proc.kill("SIGTERM");
    await sleep(250);
    if (alive) proc.kill("SIGKILL");
    await sleep(150);
  }

  return {
    logs,
    proc,
    isAlive: () => alive,
    stop,
    baseUrl: `http://127.0.0.1:${config.port}`,
  };
}

function unwrapJsonRpcError(payload) {
  return payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
    ? payload.error
    : null;
}

const MCP_ACCEPT_HEADER = "application/json, text/event-stream";
let jsonRpcIdCounter = 0;

function nextJsonRpcId(prefix = "rpc") {
  jsonRpcIdCounter += 1;
  return `${prefix}-${jsonRpcIdCounter}`;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function callRunStepViaMcp(baseUrl, args, headers = {}) {
  const initResp = await postJson(
    `${baseUrl}/mcp`,
    {
      jsonrpc: "2.0",
      id: nextJsonRpcId("init"),
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "release-proof", version: "1.0.0" },
      },
    },
    {
      accept: MCP_ACCEPT_HEADER,
      ...headers,
    }
  );
  const sessionId = String(initResp.headers.get("mcp-session-id") || "").trim();
  const callResp = await postJson(
    `${baseUrl}/mcp`,
    {
      jsonrpc: "2.0",
      id: nextJsonRpcId("call"),
      method: "tools/call",
      params: {
        name: "run_step",
        arguments: args,
      },
    },
    {
      accept: MCP_ACCEPT_HEADER,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...headers,
    }
  );
  const rpcError = unwrapJsonRpcError(callResp.json);
  const rpcResult =
    callResp.json && typeof callResp.json === "object" && callResp.json.result && typeof callResp.json.result === "object"
      ? callResp.json.result
      : {};
  const structuredContent =
    rpcResult.structuredContent && typeof rpcResult.structuredContent === "object"
      ? rpcResult.structuredContent
      : {};
  const modelResult =
    structuredContent.result && typeof structuredContent.result === "object"
      ? structuredContent.result
      : {};
  const widgetResult =
    rpcResult._meta &&
    typeof rpcResult._meta === "object" &&
    rpcResult._meta.widget_result &&
    typeof rpcResult._meta.widget_result === "object"
      ? rpcResult._meta.widget_result
      : {};
  return { initResp, callResp, sessionId, rpcError, modelResult, widgetResult };
}

function ensureNoPii(logs, piiTokens) {
  const hits = [];
  for (const token of piiTokens) {
    if (!token) continue;
    const found = findRawLine(logs, token);
    if (found) hits.push({ token, line: found.slice(0, 300) });
  }
  return hits;
}

async function runMainPhase() {
  const checks = [];
  const harness = createServerHarness({
    port: 8791,
    env: {
      PORT: "8791",
      MAX_REQUEST_SIZE_BYTES: "1024",
      RATE_LIMIT_REQUESTS_PER_MINUTE: "2",
      ABUSE_THRESHOLD: "50",
      REQUEST_TIMEOUT_MS: "30000",
    },
  });
  const piiSentinels = [
    "alice.releaseproof@example.com",
    "sk-live-releaseproof-123456",
    "Bearer releaseproof-token-123456",
  ];

  try {
    await waitForReady(harness.baseUrl, 30000);

    const readinessCorr = "corr-release-health-001";
    const health = await fetch(`${harness.baseUrl}/health`, {
      headers: { "x-correlation-id": readinessCorr },
    });
    const ready = await fetch(`${harness.baseUrl}/ready`, {
      headers: { "x-correlation-id": readinessCorr },
    });
    const diagnostics = await fetch(`${harness.baseUrl}/diagnostics`, {
      headers: { "x-correlation-id": readinessCorr },
    });
    const diagnosticsJson = await diagnostics.json();
    const readinessOk =
      health.status === 200 &&
      ready.status === 200 &&
      diagnostics.status === 200 &&
      readHeader(health, "x-correlation-id") === readinessCorr &&
      readHeader(ready, "x-correlation-id") === readinessCorr &&
      readHeader(diagnostics, "x-correlation-id") === readinessCorr &&
      String(diagnosticsJson?.correlation_id || "") === readinessCorr;
    pushCheck(checks, "ops_readiness_endpoints", readinessOk, {
      health_status: health.status,
      ready_status: ready.status,
      diagnostics_status: diagnostics.status,
    });

    const diagEvent = findStructuredEvent(harness.logs, "diagnostics_endpoint_read", readinessCorr);
    pushCheck(checks, "ops_readiness_structured_event", Boolean(diagEvent), {
      event: diagEvent ? "diagnostics_endpoint_read" : "missing",
    });

    const corrRunStep = "corr-release-e2e-001";
    const runStepResp = await callRunStepViaMcp(
      harness.baseUrl,
      {
        current_step_id: "step_0",
        user_message:
          "Mijn e-mail is alice.releaseproof@example.com en token is sk-live-releaseproof-123456",
        input_mode: "chat",
        state: {},
      },
      {
        "x-correlation-id": corrRunStep,
        "x-forwarded-for": "203.0.113.11",
      }
    );
    const runStepE2EOk =
      runStepResp.callResp.status === 200 &&
      readHeader(runStepResp.callResp, "x-correlation-id") === corrRunStep &&
      !runStepResp.rpcError;
    pushCheck(checks, "correlation_id_header_e2e_mcp_run_step", runStepE2EOk, {
      status: runStepResp.callResp.status,
      has_rpc_error: Boolean(runStepResp.rpcError),
    });

    await sleep(120);
    const runStepReqEvent = findStructuredEvent(harness.logs, "run_step_request", corrRunStep);
    const runStepRespEvent = findStructuredEvent(harness.logs, "run_step_response", corrRunStep);
    pushCheck(checks, "correlation_id_structured_events_e2e_mcp_run_step", Boolean(runStepReqEvent && runStepRespEvent), {
      request_event: Boolean(runStepReqEvent),
      response_event: Boolean(runStepRespEvent),
    });

    const invalidJsonCorr = "corr-chaos-invalid-json";
    const invalidJsonResp = await postJson(
      `${harness.baseUrl}/mcp`,
      "{not-json",
      {
        accept: MCP_ACCEPT_HEADER,
        "x-correlation-id": invalidJsonCorr,
        "x-forwarded-for": "198.51.100.10",
      }
    );
    const invalidJsonError = unwrapJsonRpcError(invalidJsonResp.json);
    const invalidJsonOk =
      invalidJsonResp.status === 400 &&
      String(invalidJsonError?.data?.error_code || "") === "invalid_json";
    pushCheck(checks, "chaos_invalid_json_fail_closed", invalidJsonOk, {
      status: invalidJsonResp.status,
      error_code: String(invalidJsonError?.data?.error_code || ""),
    });
    const invalidJsonEvent = findStructuredEvent(harness.logs, "mcp_request_invalid_json", invalidJsonCorr);
    pushCheck(checks, "chaos_invalid_json_structured_event", Boolean(invalidJsonEvent), {
      event: invalidJsonEvent ? "mcp_request_invalid_json" : "missing",
    });

    const tooLargeCorr = "corr-chaos-body-too-large";
    const tooLargeResp = await postJson(
      `${harness.baseUrl}/mcp`,
      {
        blob: "x".repeat(4096),
      },
      {
        accept: MCP_ACCEPT_HEADER,
        "x-correlation-id": tooLargeCorr,
        "x-forwarded-for": "198.51.100.11",
      }
    );
    const tooLargeOk = tooLargeResp.status === 413;
    pushCheck(checks, "chaos_body_too_large_fail_closed", tooLargeOk, {
      status: tooLargeResp.status,
    });
    const tooLargeEvent =
      findStructuredEvent(harness.logs, "mcp_request_rejected_body_too_large_header", tooLargeCorr) ||
      findStructuredEvent(harness.logs, "mcp_request_rejected_body_too_large", tooLargeCorr);
    pushCheck(checks, "chaos_body_too_large_structured_event", Boolean(tooLargeEvent), {
      event: tooLargeEvent ? String(tooLargeEvent.event || "") : "missing",
    });

    const wrongContractCorr = "corr-chaos-wrong-contract";
    const wrongContractResp = await callRunStepViaMcp(
      harness.baseUrl,
      {
        current_step_id: "purpose",
        user_message: "ACTION_WORDING_PICK_USER",
        input_mode: "widget",
        state: {
          state_version: "9999",
          view_contract_version: "v0_wrong",
          ui_gate_status: "not_valid",
          current_step: "purpose",
          started: "true",
        },
      },
      {
        "x-correlation-id": wrongContractCorr,
        "x-forwarded-for": "203.0.113.12",
      }
    );
    const wrongWidgetResult = wrongContractResp.widgetResult || {};
    const wrongModelResult = wrongContractResp.modelResult || {};
    const wrongErrorType = String(wrongModelResult.error?.type || wrongWidgetResult.error?.type || "");
    const wrongGateReason = String(wrongWidgetResult.state?.ui_gate_reason || wrongModelResult.state?.ui_gate_reason || "");
    const wrongContractOk =
      wrongContractResp.callResp.status === 200 &&
      !wrongContractResp.rpcError &&
      (wrongErrorType === "invalid_state" || wrongGateReason === "invalid_state" || wrongGateReason === "contract_violation");
    pushCheck(checks, "chaos_wrong_contract_version_fail_closed_mcp", wrongContractOk, {
      status: wrongContractResp.callResp.status,
      error_type: wrongErrorType,
      gate_reason: wrongGateReason,
      has_rpc_error: Boolean(wrongContractResp.rpcError),
    });
    const wrongContractEvent = findStructuredEvent(harness.logs, "run_step_response", wrongContractCorr);
    pushCheck(checks, "chaos_wrong_contract_version_structured_event_mcp", Boolean(wrongContractEvent), {
      event: wrongContractEvent ? "run_step_response" : "missing",
    });

    const idemBaseBody = {
      current_step_id: "step_0",
      user_message: "ACTION_START",
      input_mode: "widget",
      idempotency_key: "idem-release-proof-001",
      state: {
        bootstrap_session_id: "bs_11111111-1111-4111-8111-111111111111",
        bootstrap_epoch: 1,
        current_step: "step_0",
        started: "false",
      },
    };
    const idem1 = await callRunStepViaMcp(
      harness.baseUrl,
      idemBaseBody,
      { "x-correlation-id": "corr-chaos-idem-1", "x-forwarded-for": "203.0.113.21" }
    );
    const idem2 = await callRunStepViaMcp(
      harness.baseUrl,
      idemBaseBody,
      { "x-correlation-id": "corr-chaos-idem-2", "x-forwarded-for": "203.0.113.22" }
    );
    const idem2Widget = idem2.widgetResult || {};
    const idempotencyOk =
      idem1.callResp.status === 200 &&
      idem2.callResp.status === 200 &&
      !idem1.rpcError &&
      !idem2.rpcError &&
      String(idem2Widget.idempotency_outcome || idem2Widget.state?.idempotency_outcome || "") === "replay";
    pushCheck(checks, "chaos_idempotency_replay_fail_closed_mcp", idempotencyOk, {
      first_status: idem1.callResp.status,
      second_status: idem2.callResp.status,
      first_rpc_error: Boolean(idem1.rpcError),
      second_rpc_error: Boolean(idem2.rpcError),
      second_outcome: String(idem2Widget.idempotency_outcome || idem2Widget.state?.idempotency_outcome || ""),
    });
    const replayEvent = findStructuredEvent(harness.logs, "idempotency_replay_served", "corr-chaos-idem-2");
    pushCheck(checks, "chaos_idempotency_replay_structured_event_mcp", Boolean(replayEvent), {
      event: replayEvent ? "idempotency_replay_served" : "missing",
    });

    const rateHeaders = {
      accept: MCP_ACCEPT_HEADER,
      "x-forwarded-for": "203.0.113.60",
    };
    const rateReq1 = await postJson(
      `${harness.baseUrl}/mcp`,
      { jsonrpc: "2.0", id: "1", method: "ping", params: {} },
      { ...rateHeaders, "x-correlation-id": "corr-chaos-rate-1" }
    );
    const rateReq2 = await postJson(
      `${harness.baseUrl}/mcp`,
      { jsonrpc: "2.0", id: "2", method: "ping", params: {} },
      { ...rateHeaders, "x-correlation-id": "corr-chaos-rate-2" }
    );
    const rateReq3 = await postJson(
      `${harness.baseUrl}/mcp`,
      { jsonrpc: "2.0", id: "3", method: "ping", params: {} },
      { ...rateHeaders, "x-correlation-id": "corr-chaos-rate-3" }
    );
    const rateLimitedOk = rateReq3.status === 429;
    pushCheck(checks, "chaos_rate_limit_fail_closed", rateLimitedOk, {
      status_1: rateReq1.status,
      status_2: rateReq2.status,
      status_3: rateReq3.status,
    });
    const rateEvent = findStructuredEvent(harness.logs, "mcp_rate_limit_exceeded", "corr-chaos-rate-3");
    pushCheck(checks, "chaos_rate_limit_structured_event", Boolean(rateEvent), {
      event: rateEvent ? "mcp_rate_limit_exceeded" : "missing",
    });

    await sleep(120);
    const piiHits = ensureNoPii(harness.logs, piiSentinels);
    pushCheck(checks, "chaos_no_pii_in_logs", piiHits.length === 0, {
      hits: piiHits.length,
    });
  } finally {
    await harness.stop();
  }

  return checks;
}

async function runTimeoutPhase() {
  const checks = [];
  const harness = createServerHarness({
    port: 8792,
    env: {
      PORT: "8792",
      REQUEST_TIMEOUT_MS: "5",
      MCP_SIMULATED_HANDLE_DELAY_MS: "50",
      RATE_LIMIT_REQUESTS_PER_MINUTE: "100",
      MAX_REQUEST_SIZE_BYTES: "1024",
    },
  });
  try {
    await waitForReady(harness.baseUrl, 30000);
    const timeoutCorr = "corr-chaos-timeout";
    const timeoutResp = await postJson(
      `${harness.baseUrl}/mcp`,
      {
        jsonrpc: "2.0",
        id: "timeout-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "release-proof", version: "1.0.0" },
        },
      },
      {
        accept: MCP_ACCEPT_HEADER,
        "x-correlation-id": timeoutCorr,
        "x-forwarded-for": "203.0.113.99",
      }
    );
    const timeoutError = unwrapJsonRpcError(timeoutResp.json);
    const timeoutOk =
      timeoutResp.status === 408 &&
      String(timeoutError?.data?.error_code || "") === "timeout";
    pushCheck(checks, "chaos_simulated_timeout_fail_closed", timeoutOk, {
      status: timeoutResp.status,
      error_code: String(timeoutError?.data?.error_code || ""),
    });
    const timeoutEvent = findStructuredEvent(harness.logs, "mcp_request_timeout", timeoutCorr);
    pushCheck(checks, "chaos_simulated_timeout_structured_event", Boolean(timeoutEvent), {
      event: timeoutEvent ? "mcp_request_timeout" : "missing",
    });
  } finally {
    await harness.stop();
  }
  return checks;
}

async function main() {
  const startedAt = nowIso();
  const checks = [];
  let fatalError = "";

  try {
    const mainChecks = await runMainPhase();
    const timeoutChecks = await runTimeoutPhase();
    checks.push(...mainChecks, ...timeoutChecks);
  } catch (error) {
    fatalError = String(error?.message || error || "unknown");
    pushCheck(checks, "release_proof_script_runtime_error", false, { message: fatalError });
  }

  const failed = checks.filter((check) => check.exit_code !== 0);
  const payload = {
    check_id: "release_proof_verification",
    started_at: startedAt,
    finished_at: nowIso(),
    status: failed.length === 0 ? "PASS" : "FAIL",
    failed_checks: failed.length,
    checks,
    ...(fatalError ? { fatal_error: fatalError } : {}),
  };
  console.log(JSON.stringify(payload, null, 2));
  if (failed.length > 0) process.exit(1);
}

await main();
