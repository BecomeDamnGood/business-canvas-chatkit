import test from "node:test";
import assert from "node:assert/strict";

import { createRunStepPolicyMetaHelpers } from "./run_step_policy_meta.js";

function buildHelpers() {
  return createRunStepPolicyMetaHelpers({
    fieldForStep: () => "dream",
    wordingStepLabel: () => "Dream",
    finalFieldByStepId: {},
    provisionalValueForStep: () => "",
    parseStep0Final: () => ({ venture: "", name: "", status: "" }),
    stripChoiceInstructionNoise: (value: string) => String(value || ""),
    uiDefaultString: (key: string, fallback = "") => fallback || key,
    uiStringFromStateMap: (state: any, key: string, fallback: string) => {
      const map = state && typeof state.ui_strings === "object" ? state.ui_strings : {};
      const value = typeof map[key] === "string" ? String(map[key] || "").trim() : "";
      return value || fallback;
    },
  });
}

test("TOOL_AUDIENCE meta topic uses locale key and redirect in supported locale", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    business_name: "Mindd",
    ui_strings: {
      "meta.topic.toolAudience.body": "NL doelgroeptekst.",
      "offtopic.redirect.template": "Laten we doorgaan met de {0} van {1}.",
      "offtopic.step.dream": "droom",
      "offtopic.companyFallback": "mijn toekomstige bedrijf",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "dream",
    specialistResult: {
      action: "ASK",
      user_intent: "META_QUESTION",
      meta_topic: "TOOL_AUDIENCE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(routed.action, "ASK");
  assert.equal(routed.is_offtopic, false);
  assert.equal(routed.meta_topic, "TOOL_AUDIENCE");
  assert.match(String(routed.message || ""), /NL doelgroeptekst\./);
  assert.match(String(routed.message || ""), /Laten we doorgaan met de droom van Mindd\./);
});

test("new off-topic topics are locale-gated for unsupported locales", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "ru",
    business_name: "Mindd",
    ui_strings: {
      "meta.topic.toolAudience.body": "This should not be used for ru.",
      "offtopic.redirect.template": "Vamos continuar com o {0} de {1}.",
      "offtopic.step.dream": "sonho",
      "offtopic.companyFallback": "minha futura empresa",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "dream",
    specialistResult: {
      action: "ASK",
      message: "Mensagem original",
      user_intent: "META_QUESTION",
      meta_topic: "TOOL_AUDIENCE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(String(routed.message || ""), "Mensagem original");
  assert.equal(routed.meta_topic, "TOOL_AUDIENCE");
  assert.doesNotMatch(String(routed.message || ""), /This should not be used/);
});

test("wants_recap forces RECAP meta topic classification", () => {
  const helpers = buildHelpers();
  const metaTopic = helpers.resolveSpecialistMetaTopic({
    wants_recap: true,
    user_intent: "STEP_INPUT",
    meta_topic: "NONE",
  });
  assert.equal(metaTopic, "RECAP");
});

test("offtopic normalizer removes duplicate localized redirect before appending canonical redirect", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    business_name: "Mindd",
    ui_strings: {
      "offtopic.redirect.template": "Laten we doorgaan met de {0} van {1}.",
      "offtopic.step.dream": "droom",
      "offtopic.companyFallback": "mijn toekomstige bedrijf",
    },
  };

  const normalized = helpers.normalizeNonStep0OfftopicSpecialist({
    stepId: "dream",
    activeSpecialist: "Dream",
    userMessage: "ik weet het niet",
    specialistResult: {
      action: "ASK",
      is_offtopic: true,
      message:
        "Geen probleem, soms is het lastig om direct een droom te formuleren. Laten we doorgaan met de Droom-stap van Mindd.",
      user_intent: "OFFTOPIC",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  const message = String(normalized.message || "");
  const redirectCount = (message.match(/Laten we doorgaan met/gi) || []).length;
  assert.equal(redirectCount, 1);
  assert.doesNotMatch(message, /Droom-stap/i);
  assert.match(message, /Laten we doorgaan met de droom van Mindd\./);
});
