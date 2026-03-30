import test from "node:test";
import assert from "node:assert/strict";

import { __setTestClient } from "../core/llm.js";
import {
  normalizeSpecialistResultLanguage,
  shouldNormalizeSpecialistResultLanguage,
} from "./specialist_dispatch.js";
import { PurposeJsonSchema, PurposeZodSchema } from "../steps/purpose.js";

function makeFakeClient(outputText: string) {
  return {
    responses: {
      create: async () => ({
        output_text: outputText,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        },
      }),
    },
  } as any;
}

test("language guard detects mixed-language specialist output when UI language is English", async () => {
  const shouldNormalize = await shouldNormalizeSpecialistResultLanguage({
    targetLanguage: "en",
    specialistResult: {
      action: "ASK",
      message:
        "Deze versie is korter en directer, waardoor de kern van Mindd's Purpose krachtiger overkomt.",
      refined_formulation:
        "Mindd exists to ensure people always have access to honest information.",
      question: "",
      purpose: "Mindd exists to ensure people always have access to honest information.",
      feedback_reason_text: "",
      user_pick_feedback_text: "",
      feedback_mode: "compare_suggestion",
      step_support_state: "ok",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
      suggestion_intro: "",
      suggestion_items: [],
      suggestion_outro: "",
      suggestion_item_style: "bullets",
    },
    detectLanguage: async (text) =>
      /deze versie is korter en directer/i.test(text)
        ? { lang: "nl", confident: true }
        : { lang: "en", confident: true },
  });

  assert.equal(shouldNormalize, true);
});

test("language guard stays idle when specialist output already matches the UI language", async () => {
  const shouldNormalize = await shouldNormalizeSpecialistResultLanguage({
    targetLanguage: "en",
    specialistResult: {
      action: "ASK",
      message: "This version is shorter and more direct, which makes Mindd's Purpose clearer.",
      refined_formulation:
        "Mindd exists to ensure people always have access to honest information.",
      question: "",
      purpose: "Mindd exists to ensure people always have access to honest information.",
      feedback_reason_text: "",
      user_pick_feedback_text: "",
      feedback_mode: "compare_suggestion",
      step_support_state: "ok",
      wants_recap: false,
      is_offtopic: false,
      user_intent: "STEP_INPUT",
      meta_topic: "NONE",
      suggestion_intro: "",
      suggestion_items: [],
      suggestion_outro: "",
      suggestion_item_style: "bullets",
    },
    detectLanguage: async () => ({ lang: "en", confident: true }),
  });

  assert.equal(shouldNormalize, false);
});

test("language guard repairs specialist output into the active UI language without changing schema structure", async () => {
  const repairedOutput = {
    action: "ASK",
    message:
      "This version is shorter and more direct, which makes the core of Mindd's Purpose stronger.",
    question: "",
    refined_formulation:
      "Mindd exists to ensure people always have access to honest information.",
    purpose: "Mindd exists to ensure people always have access to honest information.",
    suggestion_intro: "",
    suggestion_items: [],
    suggestion_outro: "",
    suggestion_item_style: "bullets",
    feedback_reason_text: "",
    user_pick_feedback_text: "",
    feedback_mode: "compare_suggestion",
    step_support_state: "ok",
    wants_recap: false,
    is_offtopic: false,
    user_intent: "STEP_INPUT",
    meta_topic: "NONE",
  };

  __setTestClient(makeFakeClient(JSON.stringify(repairedOutput)));
  try {
    const normalized = await normalizeSpecialistResultLanguage({
      targetLanguage: "en",
      model: "gpt-test",
      schemaName: "Purpose",
      jsonSchema: PurposeJsonSchema as any,
      zodSchema: PurposeZodSchema,
      state: {
        business_name: "Mindd",
        language: "en",
        ui_strings_lang: "en",
        ui_strings_requested_lang: "en",
      } as any,
      specialistResult: {
        action: "ASK",
        message:
          "Deze versie is korter en directer, waardoor de kern van Mindd's Purpose krachtiger overkomt.",
        question: "",
        refined_formulation:
          "Mindd exists to ensure people always have access to honest information.",
        purpose: "Mindd exists to ensure people always have access to honest information.",
        suggestion_intro: "",
        suggestion_items: [],
        suggestion_outro: "",
        suggestion_item_style: "bullets",
        feedback_reason_text: "",
        user_pick_feedback_text: "",
        feedback_mode: "compare_suggestion",
        step_support_state: "ok",
        wants_recap: false,
        is_offtopic: false,
        user_intent: "STEP_INPUT",
        meta_topic: "NONE",
      },
      detectLanguage: async (text) =>
        /deze versie is korter en directer/i.test(text)
          ? { lang: "nl", confident: true }
          : { lang: "en", confident: true },
    });

    assert.equal(normalized.normalized, true);
    assert.equal(normalized.specialistResult.message, repairedOutput.message);
    assert.equal(normalized.specialistResult.purpose, repairedOutput.purpose);
    assert.equal(normalized.specialistResult.feedback_mode, "compare_suggestion");
    assert.equal(normalized.specialistResult.user_intent, "STEP_INPUT");
    assert.equal(normalized.specialistResult.meta_topic, "NONE");
  } finally {
    __setTestClient(null);
  }
});
