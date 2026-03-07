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
    ui_strings_lang: "sv",
    business_name: "Mindd",
    ui_strings: {
      "meta.topic.toolAudience.body": "This should not be used for sv.",
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

test("presentation media capability question is deterministically routed to fixed meta topic answer", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    ui_strings: {
      "meta.topic.presentationMediaNotSupported.body":
        "Helaas is het nu nog niet mogelijk om afbeeldingen of logo's te verwerken in de presentatie. We werken er hard aan om dit in de toekomst mogelijk te maken.",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "presentation",
    userMessage: "kan ik afbeeldingen of een logo toevoegen aan de presentatie?",
    specialistResult: {
      action: "ASK",
      message: "orig",
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(routed.action, "ASK");
  assert.equal(routed.meta_topic, "PRESENTATION_MEDIA_NOT_SUPPORTED");
  assert.equal(routed.is_offtopic, false);
  assert.equal(
    String(routed.message || ""),
    "Helaas is het nu nog niet mogelijk om afbeeldingen of logo's te verwerken in de presentatie. We werken er hard aan om dit in de toekomst mogelijk te maken."
  );
});

test("NO_STARTING_POINT meta topic uses localized body without redirect append", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    business_name: "Mindd",
    ui_strings: {
      "meta.topic.noStartingPoint.body": "NL geen-startpunttekst.",
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
      meta_topic: "NO_STARTING_POINT",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(routed.action, "ASK");
  assert.equal(routed.meta_topic, "NO_STARTING_POINT");
  assert.equal(String(routed.message || ""), "NL geen-startpunttekst.");
  assert.doesNotMatch(String(routed.message || ""), /Laten we doorgaan met/);
});

test("no-starting-point intent in user message is deterministically routed", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    ui_strings: {
      "meta.topic.noStartingPoint.body": "NL geen-startpunttekst.",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "strategy",
    userMessage: "ik wil iets met AI doen, maar geen onderwerp/markt/probleem",
    specialistResult: {
      action: "ASK",
      message: "orig",
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(routed.meta_topic, "NO_STARTING_POINT");
  assert.equal(routed.is_offtopic, false);
  assert.equal(String(routed.message || ""), "NL geen-startpunttekst.");
});

test("media capability phrase does not trigger forced presentation topic outside presentation step", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    ui_strings: {},
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "strategy",
    userMessage: "kan ik afbeeldingen of een logo toevoegen aan de presentatie?",
    specialistResult: {
      action: "ASK",
      message: "orig",
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(routed.meta_topic, "NONE");
  assert.equal(String(routed.message || ""), "orig");
});

test("dream INTRO message is sourced from ui_strings catalog key", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    ui_strings: {
      "dream.intro.body": "Catalog intro body for dream.",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "dream",
    specialistResult: {
      action: "INTRO",
      message: "LLM generated intro that should be ignored",
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(String(routed.message || ""), "Catalog intro body for dream.");
});

test("purpose INTRO message is sourced from ui_strings catalog key and formats company placeholder", () => {
  const helpers = buildHelpers();
  const state: any = {
    ui_strings_lang: "nl",
    business_name: "Mindd",
    ui_strings: {
      "purpose.intro.body": "Dit is de bestaansreden-intro voor {0}.",
      "offtopic.companyFallback": "mijn toekomstige bedrijf",
    },
  };

  const routed = helpers.applyCentralMetaTopicRouter({
    stepId: "purpose",
    specialistResult: {
      action: "INTRO",
      message: "LLM generated intro that should be ignored",
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
    },
    previousSpecialist: {},
    state,
  }) as Record<string, unknown>;

  assert.equal(String(routed.message || ""), "Dit is de bestaansreden-intro voor Mindd.");
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
