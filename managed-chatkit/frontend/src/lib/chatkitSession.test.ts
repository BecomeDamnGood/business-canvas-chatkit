import test from "node:test";
import assert from "node:assert/strict";

import { createClientSecretFetcher, getWorkflowId } from "./chatkitSession.ts";

test("getWorkflowId reads the Vite workflow id from env-like input", () => {
  assert.equal(getWorkflowId({ VITE_CHATKIT_WORKFLOW_ID: "wf_live_123" }), "wf_live_123");
  assert.throws(() => getWorkflowId({ VITE_CHATKIT_WORKFLOW_ID: "wf_replace_me" }), /Set VITE_CHATKIT_WORKFLOW_ID/);
});

test("createClientSecretFetcher always refreshes when ChatKit asks again", async () => {
  const originalFetch = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    calls.push({ input, init });
    return {
      ok: true,
      json: async () => ({ client_secret: "fresh-secret" }),
    } as any;
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

test("createClientSecretFetcher surfaces backend failures clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    json: async () => ({ error: "Session expired" }),
  })) as typeof fetch;

  try {
    const fetcher = createClientSecretFetcher("wf_live_123", "/api/create-session");
    await assert.rejects(() => fetcher(null), /Session expired/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
