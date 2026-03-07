import test from "node:test";
import assert from "node:assert/strict";

import { parseRunStepIngressArgs, normalizeIngressIdempotencyKey } from "./ingress.js";

test("normalizeIngressIdempotencyKey accepteert alleen contract-safe sleutelvorm", () => {
  assert.equal(normalizeIngressIdempotencyKey("req-1:abc_DEF.42"), "req-1:abc_DEF.42");
  assert.equal(normalizeIngressIdempotencyKey(""), "");
  assert.equal(normalizeIngressIdempotencyKey("bad key with spaces"), "");
  assert.equal(normalizeIngressIdempotencyKey("x".repeat(129)), "");
});

test("parseRunStepIngressArgs gebruikt expliciete idempotency_key wanneer geldig", () => {
  const parsed = parseRunStepIngressArgs({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    idempotency_key: "turn-001",
    state: {},
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.args.idempotency_key, "turn-001");
});

test("parseRunStepIngressArgs valt terug op state.__client_action_id", () => {
  const parsed = parseRunStepIngressArgs({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    state: {
      __client_action_id: "state-action-77",
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.args.idempotency_key, "state-action-77");
});

test("parseRunStepIngressArgs negeert ongeldige expliciete key en gebruikt fallback", () => {
  const parsed = parseRunStepIngressArgs({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    idempotency_key: "invalid key",
    state: {
      __client_action_id: "fallback-001",
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.args.idempotency_key, "fallback-001");
});

test("parseRunStepIngressArgs verwijdert server-owned transient state keys", () => {
  const parsed = parseRunStepIngressArgs({
    current_step_id: "step_0",
    user_message: "Hallo",
    state: {
      __session_log_file: "/tmp/evil-path.md",
      __session_turn_index: 99,
      __request_id: "evil-request-id",
      __trace_id: "evil-trace-id",
      __client_action_id: "safe-client-action",
      __unknown_transient: "drop-me",
      language_source: "openai_locale",
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const state = (parsed.args.state || {}) as Record<string, unknown>;
  assert.equal("__session_log_file" in state, false);
  assert.equal("__session_turn_index" in state, false);
  assert.equal("__request_id" in state, false);
  assert.equal("__trace_id" in state, false);
  assert.equal("__unknown_transient" in state, false);
  assert.equal(state.__client_action_id, "safe-client-action");
  assert.equal(state.language_source, "locale_hint");
});
