import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetSharedStoreForTests,
  claimSharedAction,
  completeSharedAction,
  nextSharedResponseSeq,
  readSharedSession,
  writeSharedSession,
} from "./shared_session_store.js";
import { isStaleBootstrapPayload } from "./ordering_parity.js";

test.beforeEach(() => {
  __resetSharedStoreForTests();
});

test("claims an action once and replays its completed result", async () => {
  const request = {
    registryKey: "session:bs_test::ca_1",
    scopeKey: "session:bs_test",
    idempotencyKey: "ca_1",
    requestHash: "hash-1",
    nowMs: 1_000,
  };

  assert.deepEqual(await claimSharedAction(request), { claimed: true, existing: null });
  assert.deepEqual(await claimSharedAction(request), {
    claimed: false,
    existing: { requestHash: "hash-1", status: "inflight", resultForClient: undefined },
  });

  await completeSharedAction({
    registryKey: request.registryKey,
    requestHash: request.requestHash,
    resultForClient: { ok: true, state: { current_step: "step_2" } },
    nowMs: 2_000,
  });

  assert.deepEqual(await claimSharedAction(request), {
    claimed: false,
    existing: {
      requestHash: "hash-1",
      status: "completed",
      resultForClient: { ok: true, state: { current_step: "step_2" } },
    },
  });
});

test("allows an expired action key to be claimed again", async () => {
  const request = {
    registryKey: "session:bs_test::ca_expired",
    scopeKey: "session:bs_test",
    idempotencyKey: "ca_expired",
    requestHash: "hash-expired",
    nowMs: 1_000,
  };
  assert.equal((await claimSharedAction(request)).claimed, true);
  assert.equal(
    (await claimSharedAction({ ...request, nowMs: request.nowMs + 31 * 60 * 1_000 })).claimed,
    true
  );
});

test("keeps response sequence and latest session snapshot together", async () => {
  const sessionId = "bs_00000000-0000-4000-8000-000000000001";
  assert.equal(await nextSharedResponseSeq(sessionId, 1_000), 1);
  await writeSharedSession({
    sessionId,
    hostWidgetSessionId: "host-1",
    epoch: 1,
    lastResponseSeq: 1,
    updatedAtMs: 1_100,
    lastWidgetResult: { state: { current_step: "step_1", response_seq: 1 } },
  });
  assert.equal(await nextSharedResponseSeq(sessionId, 1_200), 2);
  await writeSharedSession({
    sessionId,
    hostWidgetSessionId: "host-1",
    epoch: 1,
    lastResponseSeq: 2,
    updatedAtMs: 1_300,
    lastWidgetResult: { state: { current_step: "step_2", response_seq: 2 } },
  });

  const snapshot = await readSharedSession(sessionId);
  assert.equal(snapshot?.lastResponseSeq, 2);
  assert.equal(
    (snapshot?.lastWidgetResult.state as Record<string, unknown>).current_step,
    "step_2"
  );
});

test("detects an older payload from the shared session snapshot", async () => {
  const sessionId = "bs_00000000-0000-4000-8000-000000000002";
  await writeSharedSession({
    sessionId,
    hostWidgetSessionId: "host-2",
    epoch: 1,
    lastResponseSeq: 4,
    updatedAtMs: 2_000,
    lastWidgetResult: { state: { current_step: "step_3", response_seq: 4 } },
  });

  const result = await isStaleBootstrapPayload({
    sessionId,
    hostWidgetSessionId: "host-2",
    epoch: 1,
    responseSeq: 2,
    nowMs: 2_100,
  });
  assert.equal(result.stale, true);
  assert.equal(result.reason, "response_seq");
  assert.equal(result.latest?.lastResponseSeq, 4);
});
