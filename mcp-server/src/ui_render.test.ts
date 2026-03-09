import test from "node:test";
import assert from "node:assert/strict";

import {
  actionRoleForStateKey,
  resolveActionCodeForStateKey,
  resolveActionPayloadModeForStateKey,
  shouldSuppressMainCardForWordingChoice,
} from "../ui/lib/ui_render.js";
import { benProfileVideoUrlForLang, dreamStepVideoUrlForLang } from "../ui/lib/ui_constants.js";

test("shouldSuppressMainCardForWordingChoice suppresses the main card for wording-choice view variants", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice({}, "wording_choice"),
    true
  );
});

test("shouldSuppressMainCardForWordingChoice suppresses the main card for explicit picker payloads", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        wording_choice: {
          enabled: true,
        },
      },
      "default"
    ),
    true
  );
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        flags: {
          require_wording_pick: true,
        },
      },
      "default"
    ),
    true
  );
});

test("shouldSuppressMainCardForWordingChoice keeps the main card enabled for non-picker payloads", () => {
  assert.equal(
    shouldSuppressMainCardForWordingChoice(
      {
        content: {
          kind: "single_value",
          heading: "Wat denk je van deze formulering",
        },
      },
      "default"
    ),
    false
  );
});

test("resolveActionCodeForStateKey falls back to action contract when lean state omits start action", () => {
  const result = {
    ui: {
      action_contract: {
        actions: [
          {
            role: "start",
            action_code: "ACTION_START",
          },
        ],
      },
    },
  };

  assert.equal(actionRoleForStateKey("ui_action_start"), "start");
  assert.equal(resolveActionCodeForStateKey(result, {}, "ui_action_start"), "ACTION_START");
});

test("resolveActionCodeForStateKey keeps state fallback when action contract is absent", () => {
  assert.equal(
    resolveActionCodeForStateKey({}, { ui_action_dream_switch_to_self: "__ROUTE__DREAM_SWITCH_TO_SELF__" }, "ui_action_dream_switch_to_self"),
    "__ROUTE__DREAM_SWITCH_TO_SELF__"
  );
});

test("resolveActionPayloadModeForStateKey falls back to action contract payload mode for text submit", () => {
  const result = {
    ui: {
      action_contract: {
        actions: [
          {
            role: "text_submit",
            action_code: "ACTION_SUBMIT",
            payload_mode: "scores",
          },
        ],
      },
    },
  };

  assert.equal(resolveActionPayloadModeForStateKey(result, {}, "ui_action_text_submit"), "scores");
});

test("benProfileVideoUrlForLang returns only configured language-specific videos", () => {
  assert.match(benProfileVideoUrlForLang("nl"), /youtube-nocookie\.com\/embed\/5TLxnL2OkQo/);
  assert.match(benProfileVideoUrlForLang("en"), /youtube-nocookie\.com\/embed\/kV4oF2mUZXI/);
  assert.match(benProfileVideoUrlForLang("it"), /youtube-nocookie\.com\/embed\/S7_GwDJZIAs/);
  assert.match(benProfileVideoUrlForLang("de"), /youtube-nocookie\.com\/embed\/T18fvylOojg/);
  assert.match(benProfileVideoUrlForLang("es"), /youtube-nocookie\.com\/embed\/eLSh19ZZ2yM/);
  assert.equal(benProfileVideoUrlForLang("fr"), "");
  assert.equal(benProfileVideoUrlForLang("pt-BR"), "");
});

test("dreamStepVideoUrlForLang returns only configured language-specific videos", () => {
  assert.match(dreamStepVideoUrlForLang("nl"), /youtube-nocookie\.com\/embed\/kksn8roVbQg/);
  assert.match(dreamStepVideoUrlForLang("en"), /youtube-nocookie\.com\/embed\/94cmzR2w62o/);
  assert.match(dreamStepVideoUrlForLang("it"), /youtube-nocookie\.com\/embed\/g-fbHy78uIw/);
  assert.match(dreamStepVideoUrlForLang("de"), /youtube-nocookie\.com\/embed\/KtzkZFE4m5Q/);
  assert.match(dreamStepVideoUrlForLang("es"), /youtube-nocookie\.com\/embed\/-36ryKgLiPo/);
  assert.equal(dreamStepVideoUrlForLang("fr"), "");
  assert.equal(dreamStepVideoUrlForLang("pt-BR"), "");
});
