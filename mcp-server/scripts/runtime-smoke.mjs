#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = String(process.env.SMOKE_PORT || process.env.PORT || "8787").trim() || "8787";
const baseUrl = `http://127.0.0.1:${port}`;
const serverCwd = dirname(fileURLToPath(new URL("../server.ts", import.meta.url)));
const readyTimeoutMs = Number(process.env.SMOKE_READY_TIMEOUT_MS || 30000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractResult(payload) {
  const result = payload?.structuredContent?.result;
  assert.equal(Boolean(result && typeof result === "object"), true, "structuredContent.result ontbreekt");
  return result;
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

async function postRunStep(body) {
  const res = await fetch(`${baseUrl}/run_step`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json, result: extractResult(json) };
}

async function main() {
  const startedAt = performance.now();
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

    const first = await postRunStep({
      current_step_id: "step_0",
      user_message: "Marketing agency Mindd",
      input_mode: "chat",
      state: {},
    });
    assert.equal(first.status, 200, "step_0 smoke request moet 200 geven");
    assert.equal(first.result.current_step_id, "step_0", "step_0 result mismatch");
    assert.equal(Boolean(first.result.state && typeof first.result.state === "object"), true, "step_0 state ontbreekt");

    const idempotencyKey = `smoke-idem-${Date.now()}`;
    const duplicatePayload = {
      current_step_id: "step_0",
      user_message: "Marketing agency Mindd",
      input_mode: "chat",
      idempotency_key: idempotencyKey,
      state: first.result.state,
    };
    const duplicate1 = await postRunStep(duplicatePayload);
    const duplicate2 = await postRunStep(duplicatePayload);

    const duplicateSeq1 = Number(duplicate1.result.response_seq || 0);
    const duplicateSeq2 = Number(duplicate2.result.response_seq || 0);
    assert.equal(duplicateSeq1 > 0, true, "duplicate #1 response_seq ontbreekt");
    assert.equal(duplicateSeq2 > 0, true, "duplicate #2 response_seq ontbreekt");

    const duplicateBehavior =
      duplicateSeq2 === duplicateSeq1 ? "replay" : duplicateSeq2 > duplicateSeq1 ? "fresh" : "invalid";
    assert.notEqual(duplicateBehavior, "invalid", "duplicate request gedrag ongeldig");

    const conflictCandidate = await postRunStep({
      ...duplicatePayload,
      user_message: "Different payload",
    });
    const conflictSeq = Number(conflictCandidate.result.response_seq || 0);
    const conflictErrorType = String(conflictCandidate.result?.error?.type || "");
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
