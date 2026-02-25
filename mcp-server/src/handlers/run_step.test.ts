// Unit tests for run_step: Start gating, i18n, meta-instruction behavior
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run_step } from "./run_step.js";

async function withEnv<T>(key: string, value: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

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

test("Start gating: seedable non-empty first message bypasses Click Start and returns Step 0 readiness", async () => {
  const localeHints = ["nl-NL", "fr-FR", "zh-CN", "ja-JP"];
  for (const localeHint of localeHints) {
    const result = await run_step({
      user_message: "Help me with my business plan for my advertising agency called Mindd",
      input_mode: "chat",
      locale_hint: localeHint,
      locale_hint_source: "message_detect",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "false",
      },
    });
    assert.equal(result?.ok, true);
    assert.equal(result?.current_step_id, "step_0");
    assert.equal(String(result?.state?.step_0_final || "").includes("Name: Mindd"), true);
    assert.equal(String(result?.prompt || "").includes("Click Start"), false);
    assert.equal(String(result?.prompt || "").includes("Mindd"), true);
  }
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

test("language policy: locale hint wins over paraphrased English chat input", async () => {
  const result = await withEnv("UI_START_TRIGGER_LANG_RESOLVE_V1", "1", () =>
    withEnv("UI_STRICT_NON_EN_PENDING_V1", "1", () =>
      withEnv("UI_LOCALE_READY_GATE_V1", "1", () =>
        run_step({
          user_message: "",
          input_mode: "chat",
          locale_hint: "nl-NL",
          locale_hint_source: "openai_locale",
          state: {
            current_step: "step_0",
            intro_shown_session: "false",
            last_specialist_result: {},
            started: "true",
            initial_user_message: "I want help with my business plan for my advertising agency called Mindd.",
          },
        })
      )
    )
  );
  assert.equal(result?.ok, true);
  assert.equal(result?.state?.language, "nl");
  assert.equal(result?.state?.language_source, "locale_hint");
  assert.equal(result?.state?.ui_strings_requested_lang, "nl");
  assert.equal(result?.state?.ui_strings_status, "ready");
  assert.equal(String(result?.state?.ui_strings_lang || ""), "en");
  assert.equal(String(result?.state?.ui_strings_fallback_applied || ""), "true");
  assert.equal(String(result?.state?.ui_strings_fallback_reason || ""), "requested_lang_unavailable");
  assert.equal(String(result?.state?.ui_gate_status || ""), "ready");
  assert.equal(result?.ui?.flags?.bootstrap_waiting_locale, false);
  assert.equal(result?.ui?.flags?.bootstrap_interactive_ready, true);
  assert.equal(result?.ui?.flags?.interactive_fallback_active, false);
  assert.equal(String(result?.ui?.flags?.bootstrap_phase || ""), "ready");
  assert.equal(result?.ui?.flags?.locale_pending_background, false);
  assert.equal(String(result?.ui?.flags?.bootstrap_retry_hint || ""), "");
});

test("language policy: unsupported locale resolves ready with explicit fallback metadata", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "openai_locale",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "Help met een businessplan voor mijn reclamebureau Mindd",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(String(result?.state?.language || ""), "nl");
  assert.equal(String(result?.state?.ui_strings_status || ""), "ready");
  assert.equal(String(result?.state?.ui_strings_lang || ""), "en");
  assert.equal(String(result?.state?.ui_strings_requested_lang || ""), "nl");
  assert.equal(String(result?.state?.ui_strings_fallback_applied || ""), "true");
  assert.equal(String(result?.state?.ui_strings_fallback_reason || ""), "requested_lang_unavailable");
  assert.equal(String(result?.state?.ui_gate_status || ""), "ready");
});

test("language policy: widget ACTION_START does not let webplus_i18n override seeded NL message", async () => {
  const result = await withEnv("UI_START_TRIGGER_LANG_RESOLVE_V1", "1", () =>
    run_step({
      user_message: "ACTION_START",
      input_mode: "widget",
      locale_hint: "en-US",
      locale_hint_source: "webplus_i18n",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        initial_user_message: "help mij met mijn businessplan voor mijn reclamebureau Mindd",
      },
    })
  );
  assert.equal(result?.ok, true);
  assert.equal(String(result?.state?.language || ""), "nl");
  assert.equal(String(result?.state?.language_source || ""), "message_detect");
});

test("language policy: ACTION_BOOTSTRAP_POLL is accepted and keeps ready contract stable", async () => {
  const first = await withEnv("UI_LOCALE_READY_GATE_V1", "1", () =>
    run_step({
      user_message: "ACTION_START",
      input_mode: "chat",
      locale_hint: "nl-NL",
      locale_hint_source: "openai_locale",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        initial_user_message: "I want help with my business plan for my advertising agency called Mindd.",
      },
    })
  );
  assert.equal(String(first?.state?.ui_gate_status || ""), "ready");

  const polled = await withEnv("UI_LOCALE_READY_GATE_V1", "1", () =>
    run_step({
      user_message: "ACTION_BOOTSTRAP_POLL",
      input_mode: "widget",
      state: { ...(first?.state || {}), __bootstrap_poll: "true" } as Record<string, unknown>,
    })
  );
  assert.equal(polled?.ok, true);
  assert.equal(String(polled?.state?.ui_gate_status || ""), "ready");
  assert.equal(String(polled?.state?.ui_strings_status || ""), "ready");
  assert.equal(String(polled?.state?.bootstrap_phase || ""), "ready");
  assert.equal(polled?.ui?.flags?.bootstrap_waiting_locale, false);
  assert.equal(polled?.ui?.flags?.bootstrap_interactive_ready, true);
  assert.equal(polled?.ui?.flags?.interactive_fallback_active, false);
  assert.equal(String(polled?.ui?.flags?.bootstrap_phase || ""), "ready");
  assert.equal(String(polled?.ui?.flags?.bootstrap_retry_hint || ""), "");
});

test("language policy source: legacy __locale_wait_retry alias is removed", () => {
  const source = fs.readFileSync(new URL("./run_step.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /__locale_wait_retry/);
});

test("run_step canonicalizes legacy state.language_source transport values", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      started: "true",
      language: "nl",
      language_locked: "true",
      language_source: "openai_locale",
      last_specialist_result: {},
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(String(result?.state?.language || ""), "nl");
  assert.equal(String(result?.state?.language_source || ""), "locale_hint");
});

test("run_step blocks invalid incoming contract state instead of silently accepting it", async () => {
  const result = await run_step({
    user_message: "ACTION_START",
    input_mode: "widget",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      started: "true",
      ui_gate_status: "not_a_valid_status",
      last_specialist_result: {},
    },
  });
  assert.equal(result?.ok, false);
  assert.equal(String(result?.error?.type || ""), "invalid_state");
  assert.equal(String(result?.state?.ui_gate_status || ""), "failed");
  assert.equal(String(result?.state?.ui_gate_reason || ""), "invalid_state");
  assert.equal(String(result?.state?.bootstrap_phase || ""), "failed");
});

test("legacy chat state auto-upgrades instead of blocking and preserves NL locale", async () => {
  const chatTurn = await run_step({
    current_step_id: "step_0",
    user_message: "Help met mijn businessplan voor mijn reclamebureau Mindd",
    input_mode: "chat",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      state_version: "1",
      response_kind: "run_step",
      response_seq: 0,
    },
  });
  assert.equal(chatTurn?.ok, true);
  assert.notEqual(String(chatTurn?.state?.ui_gate_status || ""), "blocked");
  assert.equal(String(chatTurn?.state?.ui_gate_reason || ""), "");
  assert.equal(String(chatTurn?.state?.language || ""), "nl");
  assert.equal(String(chatTurn?.state?.initial_user_message || "").includes("Mindd"), true);

  const seededStep0 = String(chatTurn?.state?.step_0_final || "");
  assert.equal(seededStep0.includes("Venture:"), true);
  assert.equal(seededStep0.includes("Name: Mindd"), true);
  assert.equal(String(chatTurn?.state?.business_name || ""), "Mindd");

  const widgetStart = await run_step({
    current_step_id: "step_0",
    user_message: "ACTION_START",
    input_mode: "widget",
    locale_hint: "en",
    locale_hint_source: "webplus_i18n",
    state: chatTurn?.state || {},
  });
  assert.equal(widgetStart?.ok, true);
  assert.notEqual(String(widgetStart?.state?.ui_gate_status || ""), "blocked");
  assert.equal(String(widgetStart?.state?.language || ""), "nl");
  assert.equal(String(widgetStart?.state?.business_name || ""), "Mindd");
  assert.equal(String(widgetStart?.prompt || "").includes("Mindd"), true);
});

test("legacy widget state auto-upgrades instead of blocking and seeds Step 0 from first text turn", async () => {
  const widgetTurn = await run_step({
    current_step_id: "step_0",
    user_message: "Help mij met mijn businessplan voor mijn reclamebureau genaamd Mindd",
    input_mode: "widget",
    locale_hint: "nl",
    locale_hint_source: "message_detect",
    state: {
      state_version: "1",
      current_step: "step_0",
      language: "nl",
      language_locked: "false",
      response_kind: "run_step",
    },
  });
  assert.equal(widgetTurn?.ok, true);
  assert.notEqual(String(widgetTurn?.state?.ui_gate_status || ""), "blocked");
  assert.equal(String(widgetTurn?.state?.language || ""), "nl");
  assert.equal(String(widgetTurn?.state?.business_name || ""), "Mindd");
  assert.equal(String(widgetTurn?.state?.step_0_final || "").includes("Name: Mindd"), true);
  assert.equal(String(widgetTurn?.state?.state_version || ""), "11");
});

test("language policy: action-only follow-up keeps locale-hinted language", async () => {
  const first = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "openai_locale",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      started: "true",
      step_0_final: "Venture: advertising agency | Name: Mindd | Status: starting",
      business_name: "Mindd",
      last_specialist_result: {},
    },
  });
  assert.equal(first?.state?.language, "nl");

  const second = await run_step({
    user_message: "ACTION_STEP0_READY_START",
    input_mode: "widget",
    locale_hint: "nl-NL",
    locale_hint_source: "openai_locale",
    state: first.state,
  });
  assert.equal(second?.ok, true);
  assert.equal(second?.state?.language, "nl");
  assert.equal(second?.state?.language_source, "locale_hint");
});

test("language policy: widget-turn locale hint does not override existing chosen language", async () => {
  const seeded = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "openai_locale",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      started: "true",
      initial_user_message: "Ik wil een ondernemingsplan voor mijn reclamebureau genaamd Mindd.",
      last_specialist_result: {},
    },
  });
  assert.equal(seeded?.state?.language, "nl");
  assert.equal(seeded?.state?.language_source, "locale_hint");

  const widgetTurn = await run_step({
    user_message: "ACTION_BOOTSTRAP_POLL",
    input_mode: "widget",
    locale_hint: "en-US",
    locale_hint_source: "openai_locale",
    state: {
      ...(seeded?.state || {}),
      __bootstrap_poll: "true",
      started: "false",
    } as Record<string, unknown>,
  });
  assert.equal(widgetTurn?.ok, true);
  assert.equal(widgetTurn?.state?.language, "nl");
  assert.equal(widgetTurn?.state?.language_source, "locale_hint");
});

test("language policy: explicit override remains stronger than locale hint", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "openai_locale",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "language: en",
    },
  });
  assert.equal(result?.state?.language, "en");
  assert.equal(result?.state?.language_source, "explicit_override");
  assert.equal(result?.state?.language_override, "true");
});

test("language policy: locale_hint_source none still seeds language on first turn", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "none",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "Ik wil een ondernemingsplan voor mijn reclamebureau genaamd Mindd.",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.state?.language, "nl");
  assert.equal(result?.state?.language_source, "locale_hint");
});

test("language policy: locale_hint_source none does not override existing persisted language", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "none",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      language: "en",
      language_source: "persisted",
      language_locked: "true",
      language_override: "false",
      initial_user_message: "I want help with my business plan for my advertising agency called Mindd.",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.state?.language, "en");
  assert.equal(result?.state?.language_source, "persisted");
});

test("language policy: invalid locale hint falls back to text detection", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "invalid-locale",
    locale_hint_source: "openai_locale",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      initial_user_message: "Tengo una panadería llamada Sol.",
    },
  });
  assert.equal(result?.state?.language, "es");
  assert.equal(result?.state?.language_source, "message_detect");
});

test("language policy: legacy transport language_source in state is canonicalized before parse", async () => {
  const result = await run_step({
    user_message: "",
    input_mode: "chat",
    locale_hint: "nl-NL",
    locale_hint_source: "request_header",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "true",
      language: "nl",
      language_source: "request_header",
      language_locked: "true",
      language_override: "false",
      initial_user_message: "Ik wil een ondernemingsplan voor mijn reclamebureau genaamd Mindd.",
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(result?.state?.language, "nl");
  assert.equal(result?.state?.language_source, "locale_hint");
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
    const uiStrings = (result?.state?.ui_strings || {}) as Record<string, string>;
    assert.equal(
      String(uiStrings["prestart.meta.how.value"] || ""),
      "One question at a time"
    );
    assert.equal(
      String(uiStrings["menuLabel.STEP0_MENU_READY_START.ACTION_STEP0_READY_START"] || "").length > 0,
      true
    );
    assert.equal(
      Object.values(uiStrings).some((value) => /<\s*\/?\s*[a-z][^>]*>/i.test(String(value || ""))),
      false
    );
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

test("language mode LOCAL_DEV=1 does not force English when NODE_ENV=production", async () => {
  const prevLocalDev = process.env.LOCAL_DEV;
  const prevMode = process.env.LANGUAGE_MODE;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.LOCAL_DEV = "1";
  delete process.env.LANGUAGE_MODE;
  process.env.NODE_ENV = "production";

  try {
    const result = await run_step({
      user_message: "",
      input_mode: "chat",
      locale_hint: "nl-NL",
      locale_hint_source: "openai_locale",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        initial_user_message: "Ik wil een ondernemingsplan voor mijn reclamebureau genaamd Mindd.",
      },
    });
    assert.equal(result?.ok, true);
    assert.equal(result?.state?.language, "nl");
    assert.equal(result?.state?.language_source, "locale_hint");
  } finally {
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
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
  }
});

test("language mode LOCAL_DEV=1 still forces English outside production", async () => {
  const prevLocalDev = process.env.LOCAL_DEV;
  const prevMode = process.env.LANGUAGE_MODE;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.LOCAL_DEV = "1";
  delete process.env.LANGUAGE_MODE;
  process.env.NODE_ENV = "development";

  try {
    const result = await run_step({
      user_message: "",
      state: {
        current_step: "step_0",
        intro_shown_session: "false",
        last_specialist_result: {},
        started: "true",
        initial_user_message: "Ik wil een ondernemingsplan voor mijn reclamebureau genaamd Mindd.",
      },
    });
    assert.equal(result?.ok, true);
    assert.equal(result?.state?.language, "en");
    assert.equal(result?.state?.ui_strings_lang, "en");
  } finally {
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
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
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

test("state transient allowlist keeps session metadata and strips unknown __ keys", async () => {
  const seededSessionId = "session_allowlist_seed";
  const result = await run_step({
    user_message: "ACTION_START",
    input_mode: "widget",
    state: {
      current_step: "step_0",
      intro_shown_session: "false",
      last_specialist_result: {},
      started: "false",
      __session_id: seededSessionId,
      __unknown_payload_noise: "drop_me",
    } as Record<string, unknown>,
  });

  assert.equal(result?.ok, true);
  assert.equal(String((result as any)?.state?.__session_id || ""), seededSessionId);
  assert.equal(Object.prototype.hasOwnProperty.call((result as any)?.state || {}, "__unknown_payload_noise"), false);
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
