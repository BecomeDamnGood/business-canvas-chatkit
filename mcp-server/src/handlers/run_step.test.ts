// Unit tests for run_step: Start gating, i18n, meta-instruction behavior
import test from "node:test";
import assert from "node:assert/strict";
import { run_step } from "./run_step.js";

test("Start gating: when state.started is not true, start trigger returns Click Start prompt", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "false",
    },
  });
  assert.equal(result?.ok, true);
  assert.ok(result?.prompt?.includes("Click Start"), "prompt tells user to click Start");
  assert.ok(result?.specialist?.question?.includes("Click Start"), "specialist question matches");
});

test("Start gating: empty state without started yields Click Start (no advance)", async () => {
  const result = await run_step({ user_message: "", state: {} });
  assert.equal(result?.ok, true);
  assert.ok(result?.prompt?.includes("Click Start"), "prompt tells user to click Start");
});

test("i18n: detect language from initial_user_message on start trigger", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "Tengo una panadería llamada Sol.",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.state?.language, "es");
  assert.equal(result?.state?.language_locked, "true");
});

test("language policy: explicit override wins", async () => {
  const result = await run_step({
    user_message: "",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "language: fr",
    },
  });
  assert.equal(result?.state?.language, "fr");
  assert.equal(result?.state?.language_locked, "true");
  assert.equal(result?.state?.language_override, "true");
});

test("rate limit: returns structured error payload", async () => {
  const prev = process.env.TEST_FORCE_RATE_LIMIT;
  process.env.TEST_FORCE_RATE_LIMIT = "1";
  const result = await run_step({
    user_message: "test",
    state: {
      current_step: "step_0",
      intro_shown_session: "true",
      last_specialist_result: {},
      started: "true",
    },
  });
  if (prev === undefined) {
    delete process.env.TEST_FORCE_RATE_LIMIT;
  } else {
    process.env.TEST_FORCE_RATE_LIMIT = prev;
  }
  assert.equal(result?.ok, false);
  assert.equal(result?.error?.type, "rate_limited");
  assert.equal(result?.error?.retry_action, "retry_same_action");
  assert.equal(result?.error?.user_message, "Please wait a moment and try again.");
  assert.ok(Number(result?.error?.retry_after_ms) > 0);
});

// Meta-filter: first message is never dropped (pristineAtEntry ? rawNormalized : ...) in run_step.ts.
// Bullets/requirements/goals no longer trigger looksLikeMetaInstruction; only injection markers do.
// Full flow with bulleted brief would require LLM mock; covered by code review and manual test.
// Finals merge and wants_recap tests live in run_step_finals.test.ts (no LLM).

test(
  "__SWITCH_TO_SELF_DREAM__ routes to Dream specialist without intro and restores Dream step",
  { skip: process.env.RUN_INTEGRATION_TESTS !== "1" || !process.env.OPENAI_API_KEY },
  async () => {
  const result = await run_step({
    user_message: "__SWITCH_TO_SELF_DREAM__",
    state: {
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_for_step: "dream",
      intro_shown_session: "true",
      last_specialist_result: { action: "ASK", suggest_dreambuilder: "true" },
      started: "true",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.active_specialist, "Dream", "routes to normal Dream specialist");
  assert.equal(result?.state?.active_specialist, "Dream");
  assert.equal(result?.state?.intro_shown_for_step, "dream", "intro not shown again");
  assert.ok(result?.prompt?.trim().length > 0, "short prompt to write dream in own words");
  }
);
