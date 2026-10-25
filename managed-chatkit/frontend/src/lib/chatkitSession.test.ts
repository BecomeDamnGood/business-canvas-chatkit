import test from "node:test";
import assert from "node:assert/strict";

import { createClientSecretFetcher, getWorkflowId } from "./chatkitSession.ts";

void test("getWorkflowId reads the Vite workflow id from env-like input", () => {
  assert.equal(getWorkflowId({ VITE_CHATKIT_WORKFLOW_ID: "wf_live_123" }), "wf_live_123");
  assert.throws(() => getWorkflowId({ VITE_CHATKIT_WORKFLOW_ID: "wf_replace_me" }), /Set VITE_CHATKIT_WORKFLOW_ID/);
});

void test("createClientSecretFetcher always refreshes when ChatKit asks again", async () => {
  const originalFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ input, init });
    return Promise.resolve(
      new Response(JSON.stringify({ client_secret: "fresh-secret" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }) as typeof fetch;

  try {
    const fetcher = createClientSecretFetcher("wf_live_123", "/api/create-session");
    const secret = await fetcher("stale-secret");
    assert.equal(secret, "fresh-secret");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

void test("createClientSecretFetcher surfaces backend failures clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    )) as typeof fetch;

  try {
    const fetcher = createClientSecretFetcher("wf_live_123", "/api/create-session");
    await assert.rejects(() => fetcher(null), /Session expired/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
