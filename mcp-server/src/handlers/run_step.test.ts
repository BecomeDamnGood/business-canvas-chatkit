// Unit tests for run_step: Start gating, i18n, meta-instruction behavior
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("ACTION_START smoke: widget start returns first Step 0 question", async () => {
  const result = await run_step({
    user_message: "ACTION_START",
    input_mode: "widget",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.current_step_id, "step_0");
  assert.equal(result?.active_specialist, "ValidationAndBusinessName");
  assert.equal(String(result?.state?.started || "").toLowerCase(), "true");
  const prompt = String(result?.prompt || "").toLowerCase();
  assert.ok(
    prompt.includes("to get started") || prompt.includes("what type of business"),
    "start action should return first business validation question"
  );
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

test("language mode force_en: keeps language en and never triggers ui string translation call", async () => {
  const prevMode = process.env.LANGUAGE_MODE;
  process.env.LANGUAGE_MODE = "force_en";

  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: any[]) => {
    logs.push(String(args[0] ?? ""));
  };

  try {
    const result = await run_step({
      user_message: "",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        initial_user_message: "Minulla on leipomo nimeltä Sol.",
      },
    });
    assert.equal(result?.ok, true);
    assert.equal(result?.state?.language, "en");
    assert.equal(result?.state?.ui_strings_lang, "en");
    const translateLogs = logs.filter((line) => line.includes("[ui_strings_translate_call]"));
    assert.equal(translateLogs.length, 0);
  } finally {
    console.log = originalLog;
    if (prevMode === undefined) {
      delete process.env.LANGUAGE_MODE;
    } else {
      process.env.LANGUAGE_MODE = prevMode;
    }
  }
});

test("language mode LOCAL_DEV=1 defaults to English lock and never triggers ui string translation call", async () => {
  const prevLocalDev = process.env.LOCAL_DEV;
  const prevMode = process.env.LANGUAGE_MODE;
  process.env.LOCAL_DEV = "1";
  delete process.env.LANGUAGE_MODE;

  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: any[]) => {
    logs.push(String(args[0] ?? ""));
  };

  try {
    const result = await run_step({
      user_message: "",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        language: "fi",
        initial_user_message: "Minulla on leipomo nimeltä Sol.",
      },
    });
    assert.equal(result?.ok, true);
    assert.equal(result?.state?.language, "en");
    assert.equal(result?.state?.ui_strings_lang, "en");
    const translateLogs = logs.filter((line) => line.includes("[ui_strings_translate_call]"));
    assert.equal(translateLogs.length, 0);
  } finally {
    console.log = originalLog;
    if (prevLocalDev === undefined) {
      delete process.env.LOCAL_DEV;
    } else {
      process.env.LOCAL_DEV = prevLocalDev;
    }
    if (prevMode === undefined) {
      delete process.env.LANGUAGE_MODE;
    } else {
      process.env.LANGUAGE_MODE = prevMode;
    }
  }
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

test("timeout: returns structured error payload", async () => {
  const prev = process.env.TEST_FORCE_TIMEOUT;
  process.env.TEST_FORCE_TIMEOUT = "1";
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
    delete process.env.TEST_FORCE_TIMEOUT;
  } else {
    process.env.TEST_FORCE_TIMEOUT = prev;
  }
  assert.equal(result?.ok, false);
  assert.equal(result?.error?.type, "timeout");
  assert.equal(result?.error?.retry_action, "retry_same_action");
  assert.equal(result?.error?.user_message, "This is taking longer than usual. Please try again.");
});

test("Step 0 ready-start actioncode advances to Dream", async () => {
  const result = await run_step({
    user_message: "ACTION_STEP0_READY_START",
    input_mode: "widget",
    state: {
      current_step: "step_0",
      intro_shown_session: "true",
      started: "true",
      step_0_final: "Venture: advertising agency | Name: Mindd | Status: existing",
      business_name: "Mindd",
      last_specialist_result: {
        action: "ASK",
        menu_id: "STEP0_MENU_READY_START",
        question:
          "1) Yes, I'm ready. Let's start!\n\nYou have a advertising agency called Mindd. Are you ready to start with the first step: the Dream?",
      },
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.current_step_id, "dream");
  assert.equal(result?.state?.current_step, "dream");
});

test("session id persists and token markdown log is written per turn", async () => {
  const prevTokenLogging = process.env.BSC_TOKEN_LOGGING_V1;
  const prevLogDir = process.env.BSC_SESSION_LOG_DIR;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsc-session-log-test-"));
  process.env.BSC_TOKEN_LOGGING_V1 = "1";
  process.env.BSC_SESSION_LOG_DIR = logDir;

  try {
    const first = await run_step({
      user_message: "",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "false",
      },
    });
    assert.equal(first?.ok, true);
    const firstSession = String((first as any)?.state?.__session_id || "");
    assert.ok(firstSession.length > 0, "session id should be created");

    const second = await run_step({
      user_message: "ACTION_START",
      input_mode: "widget",
      state: (first as any).state,
    });
    assert.equal(second?.ok, true);
    assert.equal(String((second as any)?.state?.__session_id || ""), firstSession, "session id should persist");

    const logPath = String((second as any)?.state?.__session_log_file || "");
    assert.ok(logPath.length > 0, "session log path should be stored in state");
    assert.ok(fs.existsSync(logPath), "session log file should exist");
    const markdown = fs.readFileSync(logPath, "utf-8");
    assert.match(markdown, /# Session Token Report/);
    assert.match(markdown, /\| step_0 \|/);
  } finally {
    if (prevTokenLogging === undefined) delete process.env.BSC_TOKEN_LOGGING_V1;
    else process.env.BSC_TOKEN_LOGGING_V1 = prevTokenLogging;
    if (prevLogDir === undefined) delete process.env.BSC_SESSION_LOG_DIR;
    else process.env.BSC_SESSION_LOG_DIR = prevLogDir;
  }
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
