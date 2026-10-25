import assert from "node:assert/strict";
import test from "node:test";

import { buildRunStepContext } from "./run_step_transport_context.js";
import { createIdempotencyTracker } from "./run_step_transport_idempotency.js";

const SESSION_ID = "bs_00000000-0000-4000-8000-000000000101";

function buildContext(userMessage = "Marketing agency Mindd") {
  return buildRunStepContext({
    current_step_id: "step_0",
    user_message: userMessage,
    input_mode: "chat",
    idempotency_key: "retry-1",
    state: {
      bootstrap_session_id: SESSION_ID,
      bootstrap_epoch: 1,
      response_seq: 1,
      host_widget_session_id: `internal:${SESSION_ID}`,
    },
  });
}

test("identical retries keep the same request hash despite generated action metadata", () => {
  const first = buildContext();
  const retry = buildContext();

  assert.notEqual(first.clientActionId, retry.clientActionId);
  assert.equal(
    createIdempotencyTracker(first)?.requestHash,
    createIdempotencyTracker(retry)?.requestHash
  );
});

test("reusing an idempotency key for different user input keeps producing a conflict hash", () => {
  const first = buildContext();
  const changed = buildContext("Different payload");

  assert.notEqual(
    createIdempotencyTracker(first)?.requestHash,
    createIdempotencyTracker(changed)?.requestHash
  );
});
