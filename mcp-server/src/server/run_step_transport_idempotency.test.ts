import test from "node:test";
import assert from "node:assert/strict";

import { __createStructuredResponseForTests } from "./run_step_transport_idempotency.js";

test("tool response keeps rich payload in _meta.widget_result and model-safe payload in structuredContent", () => {
  const richResult = {
    ok: true,
    tool: "run_step",
    current_step_id: "dream",
    text: "rijke tekst",
    prompt: "rijke prompt",
    specialist: { action: "ASK", dream: "waarde" },
    state: {
      current_step: "dream",
      dream_final: "gevoelige inhoud",
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
  assert.equal((widgetResult.state as Record<string, unknown>).dream_final, "gevoelige inhoud");
});
