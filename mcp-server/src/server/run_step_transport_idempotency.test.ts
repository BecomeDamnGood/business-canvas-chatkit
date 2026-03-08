import test from "node:test";
import assert from "node:assert/strict";

import { __createStructuredResponseForTests } from "./run_step_transport_idempotency.js";

test("tool response keeps rich payload in _meta.widget_result and model-safe payload in structuredContent", () => {
  const richResult = {
    ok: true,
    tool: "run_step",
    current_step_id: "step_0",
    text: "rijke tekst",
    prompt: "rijke prompt",
    specialist: { action: "ASK", step_0: "Venture: reclamebureau | Name: Mindd | Status: existing" },
    state: {
      current_step: "step_0",
      step_0_final: "Venture: reclamebureau | Name: Mindd | Status: existing",
      business_name: "Mindd",
      step0_bootstrap: {
        venture: "reclamebureau",
        name: "Mindd",
        status: "existing",
        source: "initial_user_message",
      },
      locale: "nl",
      language: "nl",
    },
  } as Record<string, unknown>;

  const response = __createStructuredResponseForTests({
    resultForClient: richResult,
    metaLabel: "test",
  });

  const safeResult = (response.structuredContent.result || {}) as Record<string, unknown>;
  assert.equal(safeResult.model_result_shape_version, "v2_minimal");
  assert.equal(String(safeResult.text || "").trim().length > 0, true);
  assert.equal(String(safeResult.prompt || "").trim().length > 0, true);
  assert.equal(String(safeResult.text || "").includes("rijke tekst"), false);
  assert.equal(String(safeResult.prompt || "").includes("rijke prompt"), false);

  const meta = (response.meta || {}) as Record<string, unknown>;
  const widgetResult = (meta.widget_result || {}) as Record<string, unknown>;
  assert.equal(widgetResult.text, "rijke tekst");
  assert.equal((widgetResult.state as Record<string, unknown>).business_name, "Mindd");
  assert.deepEqual((widgetResult.state as Record<string, unknown>).step0_bootstrap, {
    venture: "reclamebureau",
    name: "Mindd",
    status: "existing",
    source: "initial_user_message",
  });
  assert.equal((safeResult.state as Record<string, unknown>).business_name, undefined);
  assert.equal((safeResult.state as Record<string, unknown>).step_0_final, undefined);
  assert.equal((safeResult.state as Record<string, unknown>).step0_bootstrap, undefined);
});
