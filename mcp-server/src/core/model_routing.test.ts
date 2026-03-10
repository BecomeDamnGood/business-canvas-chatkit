import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __clearModelRoutingCacheForTests, resolveModelForCall } from "./model_routing.js";

function writeConfig(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsc-routing-"));
  const filePath = path.join(dir, "model-routing.json");
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

test("model routing precedence: hard-pinned > action_code > intent > specialist > default", () => {
  __clearModelRoutingCacheForTests();
  const configPath = writeConfig({
    version: "test-v1",
    enabled: true,
    default_model: "gpt-4.1",
    budget_model: "gpt-4o-mini",
    translation_model: "gpt-4o-mini",
    hard_pinned_4_1: {
      action_codes: ["ACTION_HARD"],
      intents: ["CONFIRM"],
      specialists: ["Presentation"],
    },
    by_action_code: { ACTION_X: "gpt-4o-mini" },
    by_intent: { REQUEST_EXPLANATION: "gpt-4o-mini" },
    by_specialist: { Purpose: "gpt-4o-mini" },
  });

  const hardPinned = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "ACTION_HARD",
    intentType: "REQUEST_EXPLANATION",
    specialist: "Purpose",
    configPath,
  });
  assert.equal(hardPinned.model, "gpt-4.1");
  assert.equal(hardPinned.source, "hard_pinned_4_1");

  const byAction = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "ACTION_X",
    intentType: "REQUEST_EXPLANATION",
    specialist: "Purpose",
    configPath,
  });
  assert.equal(byAction.model, "gpt-4o-mini");
  assert.equal(byAction.source, "action_code");

  const byIntent = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "",
    intentType: "REQUEST_EXPLANATION",
    specialist: "Purpose",
    configPath,
  });
  assert.equal(byIntent.model, "gpt-4o-mini");
  assert.equal(byIntent.source, "intent");

  const bySpecialist = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "",
    intentType: "",
    specialist: "Purpose",
    configPath,
  });
  assert.equal(bySpecialist.model, "gpt-4o-mini");
  assert.equal(bySpecialist.source, "specialist");

  const byDefault = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "",
    intentType: "",
    specialist: "",
    configPath,
  });
  assert.equal(byDefault.model, "gpt-4.1");
  assert.equal(byDefault.source, "default");
});

test("model routing supports translation model", () => {
  __clearModelRoutingCacheForTests();
  const configPath = writeConfig({
    version: "test-v2",
    enabled: true,
    default_model: "gpt-4.1",
    budget_model: "gpt-4o-mini",
    translation_model: "gpt-4o-mini",
    hard_pinned_4_1: { action_codes: [], intents: [], specialists: [] },
    by_action_code: {},
    by_intent: {},
    by_specialist: {},
  });

  const translation = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    purpose: "translation",
    configPath,
  });
  assert.equal(translation.model, "gpt-4o-mini");
  assert.equal(translation.source, "translation_model");
});

test("model routing disabled keeps fallback model but still exposes candidate for shadow", () => {
  __clearModelRoutingCacheForTests();
  const configPath = writeConfig({
    version: "test-v3",
    enabled: true,
    default_model: "gpt-4.1",
    budget_model: "gpt-4o-mini",
    translation_model: "gpt-4o-mini",
    hard_pinned_4_1: { action_codes: [], intents: [], specialists: [] },
    by_action_code: { ACTION_X: "gpt-4o-mini" },
    by_intent: {},
    by_specialist: {},
  });

  const routed = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: false,
    actionCode: "ACTION_X",
    configPath,
  });
  assert.equal(routed.model, "gpt-4.1");
  assert.equal(routed.candidate_model, "gpt-4o-mini");
  assert.equal(routed.source, "routing_disabled");
  assert.equal(routed.applied, false);
});

test("invalid or missing config safely falls back to baseline model", () => {
  __clearModelRoutingCacheForTests();
  const missing = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    configPath: "/tmp/does-not-exist-model-routing.json",
  });
  assert.equal(missing.model, "gpt-4.1");
  assert.equal(missing.source, "config_unavailable");
  assert.equal(missing.applied, false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsc-routing-bad-"));
  const badFile = path.join(dir, "model-routing.json");
  fs.writeFileSync(badFile, "{not-valid-json", "utf-8");
  const invalid = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    configPath: badFile,
  });
  assert.equal(invalid.model, "gpt-4.1");
  assert.equal(invalid.source, "config_unavailable");
  assert.equal(invalid.applied, false);
});

test("model routing applies fallback chain when primary model is unavailable", () => {
  __clearModelRoutingCacheForTests();
  const envVar = "BSC_AVAILABLE_MODELS_TEST";
  const previous = process.env[envVar];
  process.env[envVar] = "gpt-4o-mini";
  try {
    const configPath = writeConfig({
      version: "test-v4",
      enabled: true,
      default_model: "gpt-4.1-mini",
      budget_model: "gpt-4o-mini",
      translation_model: "gpt-4o-mini",
      availability: {
        mode: "env_allowlist",
        env_var: envVar,
      },
      default_fallback_chain: ["gpt-4o-mini"],
      fallback_by_source: {},
      fallback_by_model: {},
      fallback_by_action_code: {
        ACTION_X: ["gpt-4o-mini"],
      },
      fallback_by_intent: {},
      fallback_by_specialist: {},
      hard_pinned_4_1: { action_codes: [], intents: [], specialists: [] },
      by_action_code: { ACTION_X: "gpt-4.1" },
      by_intent: {},
      by_specialist: {},
    });

    const routed = resolveModelForCall({
      fallbackModel: "gpt-4.1-mini",
      routingEnabled: true,
      actionCode: "ACTION_X",
      configPath,
    });
    assert.equal(routed.candidate_model, "gpt-4.1");
    assert.equal(routed.model, "gpt-4o-mini");
    assert.equal(routed.selected_source, "fallback");
    assert.equal(routed.availability_checked, true);
    assert.ok(routed.fallback_chain.includes("gpt-4o-mini"));
  } finally {
    if (previous === undefined) delete process.env[envVar];
    else process.env[envVar] = previous;
  }
});

test("model routing keeps primary model when availability allowlist is not configured", () => {
  __clearModelRoutingCacheForTests();
  const configPath = writeConfig({
    version: "test-v5",
    enabled: true,
    default_model: "gpt-4.1-mini",
    budget_model: "gpt-4o-mini",
    translation_model: "gpt-4o-mini",
    availability: {
      mode: "env_allowlist",
      env_var: "UNSET_ENV_VAR_FOR_ROUTING_TEST",
    },
    default_fallback_chain: ["gpt-4.1", "gpt-4o-mini"],
    fallback_by_source: {},
    fallback_by_model: {},
    fallback_by_action_code: {},
    fallback_by_intent: {},
    fallback_by_specialist: {},
    hard_pinned_4_1: { action_codes: [], intents: [], specialists: [] },
    by_action_code: { ACTION_X: "gpt-4.1-mini" },
    by_intent: {},
    by_specialist: {},
  });

  const routed = resolveModelForCall({
    fallbackModel: "gpt-4.1",
    routingEnabled: true,
    actionCode: "ACTION_X",
    configPath,
  });
  assert.equal(routed.candidate_model, "gpt-4.1-mini");
  assert.equal(routed.model, "gpt-4.1-mini");
  assert.equal(routed.selected_source, "primary");
  assert.equal(routed.availability_checked, false);
});

test("model routing reuses a fresh stat result across repeated calls", () => {
  __clearModelRoutingCacheForTests();
  const configPath = writeConfig({
    version: "test-v6",
    enabled: true,
    default_model: "gpt-4.1",
    budget_model: "gpt-4o-mini",
    translation_model: "gpt-4o-mini",
    hard_pinned_4_1: { action_codes: [], intents: [], specialists: [] },
    by_action_code: {},
    by_intent: {},
    by_specialist: {},
  });

  const originalStatSync = fs.statSync;
  let statCalls = 0;
  (fs as any).statSync = (...args: any[]) => {
    statCalls += 1;
    return originalStatSync(...args);
  };

  try {
    resolveModelForCall({
      fallbackModel: "gpt-4.1",
      routingEnabled: true,
      configPath,
    });
    resolveModelForCall({
      fallbackModel: "gpt-4.1",
      routingEnabled: true,
      configPath,
    });
  } finally {
    (fs as any).statSync = originalStatSync;
  }

  assert.equal(statCalls, 1);
});
