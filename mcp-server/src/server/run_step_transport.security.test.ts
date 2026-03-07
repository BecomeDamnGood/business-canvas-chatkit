import test from "node:test";
import assert from "node:assert/strict";

import { __buildStructuredContentResultForTests } from "./run_step_transport.js";

test("structuredContent.result blijft model-safe en bevat geen rijke widget payload", () => {
  const richWidgetResult = {
    ok: true,
    tool: "run_step",
    current_step_id: "purpose",
    text: "Dit is rijke tekst die niet model-zichtbaar hoort te zijn.",
    prompt: "Rijke prompt",
    specialist: { action: "ASK", purpose: "Long rich content" },
    ui: { view: { mode: "interactive" }, actions: [{ action_code: "ACTION_X" }] },
    state: {
      current_step: "purpose",
      locale: "nl",
      language: "nl",
      language_source: "locale_hint",
      dream_final: "Zeer gevoelige bedrijfsinhoud",
      purpose_final: "Nog meer inhoud",
      bootstrap_session_id: "bs_123",
      bootstrap_epoch: 1,
      response_seq: 3,
    },
  } as Record<string, unknown>;

  const modelSafe = __buildStructuredContentResultForTests(richWidgetResult);

  assert.equal(modelSafe.model_result_shape_version, "v2_minimal");
  assert.equal(modelSafe.current_step_id, "purpose");
  assert.equal(modelSafe.ok, true);
  assert.equal("text" in modelSafe, false);
  assert.equal("prompt" in modelSafe, false);
  assert.equal("specialist" in modelSafe, false);
  assert.equal("ui" in modelSafe, false);

  const safeState = (modelSafe.state || {}) as Record<string, unknown>;
  assert.equal(safeState.current_step, "purpose");
  assert.equal("dream_final" in safeState, false);
  assert.equal("purpose_final" in safeState, false);
});
