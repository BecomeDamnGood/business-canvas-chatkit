import test from "node:test";
import assert from "node:assert/strict";

import {
  parseExplicitLanguageOverride,
  resolveLanguageForTurn,
} from "./bootstrap_runtime.js";
import type { CanvasState, LanguageSource } from "./state.js";

test("ordinary business wording cannot become a language override", () => {
  assert.equal(parseExplicitLanguageOverride("We make use of creative materials."), "");
  assert.equal(parseExplicitLanguageOverride("Our role is to bring people together."), "");
  assert.equal(parseExplicitLanguageOverride("of"), "");
});

test("unambiguous language commands remain supported", () => {
  assert.equal(parseExplicitLanguageOverride("language: nl"), "nl");
  assert.equal(parseExplicitLanguageOverride("switch language to en"), "en");
  assert.equal(parseExplicitLanguageOverride("change locale to pt-BR"), "pt-BR");
});

function languageState(overrides: Record<string, unknown> = {}): CanvasState {
  return {
    language: "",
    locale: "",
    language_locked: "false",
    language_override: "false",
    language_source: "",
    ...overrides,
  } as CanvasState;
}

async function resolveLanguage(options: {
  state?: CanvasState;
  userMessage: string;
  localeHint?: string;
  localeHintSource?: string;
  inputMode?: "widget" | "chat";
  detected?: { lang: string; confident: boolean };
}) {
  let detectionCalls = 0;
  const state = await resolveLanguageForTurn({
    state: options.state || languageState(),
    userMessage: options.userMessage,
    localeHintRaw: options.localeHint || "",
    localeHintSourceRaw: options.localeHintSource || "none",
    inputMode: options.inputMode || "chat",
    model: "test",
    languageMinAlpha: 8,
    deps: {
      isForceEnglishLanguageMode: () => false,
      isUiLocaleMetaV1Enabled: () => true,
      isUiLangSourceResolverV1Enabled: () => true,
      normalizeLanguageSource: (raw): LanguageSource => {
        const value = String(raw || "");
        return value === "locale_hint" ||
          value === "message_detect" ||
          value === "explicit_override" ||
          value === "persisted"
          ? value
          : "";
      },
      ensureUiStringsForState: async (next) => next,
      detectLanguageHeuristic: async () => {
        detectionCalls += 1;
        return options.detected || { lang: "", confident: false };
      },
      bumpUiI18nCounter: () => undefined,
      withLanguageDecision: (current, language, source, decision) => ({
        ...current,
        language,
        locale: decision.locale || language,
        language_locked: decision.locked,
        language_override: decision.override,
        language_source: source,
      }),
    },
  });
  return { state, detectionCalls };
}

test("trusted host locale is used when first-message detection is unreliable", async () => {
  const result = await resolveLanguage({
    userMessage: "I run an established creative community cafe.",
    localeHint: "en-US",
    localeHintSource: "openai_locale",
    detected: { lang: "cy", confident: false },
  });

  assert.equal(result.state.language, "en");
  assert.equal(result.state.locale, "en-US");
  assert.equal(result.state.language_source, "locale_hint");
  assert.equal(result.state.language_locked, "true");
  assert.equal(result.detectionCalls, 1);
});

test("reliably detected first-message language wins over a different host locale", async () => {
  const result = await resolveLanguage({
    userMessage: "Ik wil een strategie maken voor mijn bureau Mindd.",
    localeHint: "en-US",
    localeHintSource: "openai_locale",
    detected: { lang: "nl", confident: true },
  });

  assert.equal(result.state.language, "nl");
  assert.equal(result.state.language_source, "message_detect");
  assert.equal(result.state.language_locked, "true");
  assert.equal(result.detectionCalls, 1);
});

test("widget input cannot replace an established session language", async () => {
  const result = await resolveLanguage({
    state: languageState({
      language: "en",
      locale: "en-US",
      language_locked: "true",
      language_source: "locale_hint",
    }),
    userMessage: "Dithuto tsa go penta letsopa ka dikgopolo tse di farologaneng.",
    inputMode: "widget",
    detected: { lang: "tn", confident: true },
  });

  assert.equal(result.state.language, "en");
  assert.equal(result.state.locale, "en-US");
  assert.equal(result.state.language_source, "locale_hint");
  assert.equal(result.detectionCalls, 0);
});

test("trusted host locale cannot replace an established message-based language", async () => {
  const result = await resolveLanguage({
    state: languageState({
      language: "cy",
      locale: "cy",
      language_locked: "true",
      language_source: "message_detect",
    }),
    userMessage: "I run an established creative community cafe.",
    localeHint: "en",
    localeHintSource: "webplus_i18n",
    detected: { lang: "cy", confident: true },
  });

  assert.equal(result.state.language, "cy");
  assert.equal(result.state.language_source, "message_detect");
  assert.equal(result.detectionCalls, 0);
});

test("echoed message detection cannot replace an established session language", async () => {
  const result = await resolveLanguage({
    state: languageState({
      language: "en",
      locale: "en",
      language_locked: "true",
      language_source: "locale_hint",
    }),
    userMessage: "ACTION_CONFIRM",
    localeHint: "tn",
    localeHintSource: "message_detect",
    inputMode: "widget",
  });

  assert.equal(result.state.language, "en");
  assert.equal(result.state.language_source, "locale_hint");
});

test("unreliable detection does not become session language", async () => {
  const result = await resolveLanguage({
    userMessage: "I run an established creative community cafe.",
    detected: { lang: "cy", confident: false },
  });

  assert.equal(result.state.language, "");
  assert.equal(result.state.language_source, "");
  assert.equal(result.detectionCalls, 1);
});

test("explicit language command remains the only way to switch a chosen language", async () => {
  const result = await resolveLanguage({
    state: languageState({
      language: "en",
      locale: "en-US",
      language_locked: "true",
      language_source: "locale_hint",
    }),
    userMessage: "language: nl",
    localeHint: "en-US",
    localeHintSource: "openai_locale",
  });

  assert.equal(result.state.language, "nl");
  assert.equal(result.state.language_source, "explicit_override");
  assert.equal(result.state.language_override, "true");
});
