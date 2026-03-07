import test from "node:test";
import assert from "node:assert/strict";

import { resolveLanguageForTurn, normalizeLangCode } from "./bootstrap_runtime.js";
import { getDefaultState, normalizeStateLanguageSource, type CanvasState, type LanguageSource } from "./state.js";

function buildState(overrides: Record<string, unknown>): CanvasState {
  return {
    ...getDefaultState(),
    ...overrides,
  } as CanvasState;
}

function withLanguageDecision(
  state: CanvasState,
  language: string,
  source: LanguageSource,
  options: { locked: "true" | "false"; override: "true" | "false"; locale?: string }
): CanvasState {
  const locale = String(options.locale || language || "").trim().toLowerCase();
  return {
    ...(state as any),
    language: normalizeLangCode(language) || normalizeLangCode(locale) || "",
    locale,
    language_source: source,
    language_locked: options.locked,
    language_override: options.override,
  } as CanvasState;
}

function makeDeps(detectedLang = "nl") {
  return {
    isForceEnglishLanguageMode: () => false,
    isUiLocaleMetaV1Enabled: () => true,
    isUiLangSourceResolverV1Enabled: () => true,
    normalizeLanguageSource: (raw: unknown) => normalizeStateLanguageSource(raw),
    ensureUiStringsForState: async (state: CanvasState) => state,
    detectLanguageHeuristic: async () => ({ lang: detectedLang, confident: true }),
    bumpUiI18nCounter: () => {},
    withLanguageDecision,
  };
}

test("widget turn uses upstream message-detect locale hint as strong signal", async () => {
  const state = buildState({
    language: "en",
    locale: "en",
    language_locked: "false",
    language_override: "false",
    language_source: "",
  });

  const resolved = await resolveLanguageForTurn({
    state,
    userMessage: "Ik wil een businessplan maken voor mijn reclamebureau Mindd",
    localeHintRaw: "nl",
    localeHintSourceRaw: "message_detect",
    inputMode: "widget",
    model: "test-model",
    languageMinAlpha: 8,
    deps: makeDeps("en"),
  });

  assert.equal(String((resolved as any).language || ""), "nl");
  assert.equal(String((resolved as any).locale || ""), "nl");
  assert.equal(String((resolved as any).language_source || ""), "message_detect");
  assert.equal(String((resolved as any).language_locked || ""), "true");
});

test("widget turn defers browser locale hint to message detection when text is detectable", async () => {
  const state = buildState({
    language: "en",
    locale: "en",
    language_locked: "false",
    language_override: "false",
    language_source: "",
  });

  const resolved = await resolveLanguageForTurn({
    state,
    userMessage: "Ik wil een businessplan maken voor mijn reclamebureau Mindd",
    localeHintRaw: "en",
    localeHintSourceRaw: "webplus_i18n",
    inputMode: "widget",
    model: "test-model",
    languageMinAlpha: 8,
    deps: makeDeps("nl"),
  });

  assert.equal(String((resolved as any).language || ""), "nl");
  assert.equal(String((resolved as any).locale || ""), "nl");
  assert.equal(String((resolved as any).language_source || ""), "message_detect");
});

test("locale_hint decision does not hard-lock language", async () => {
  const state = buildState({
    language: "en",
    locale: "en",
    language_locked: "false",
    language_override: "false",
    language_source: "",
  });

  const resolved = await resolveLanguageForTurn({
    state,
    userMessage: "",
    localeHintRaw: "nl",
    localeHintSourceRaw: "request_header",
    inputMode: "widget",
    model: "test-model",
    languageMinAlpha: 8,
    deps: makeDeps("en"),
  });

  assert.equal(String((resolved as any).language || ""), "nl");
  assert.equal(String((resolved as any).language_source || ""), "locale_hint");
  assert.equal(String((resolved as any).language_locked || ""), "false");
});

test("detectable user text can correct previously locked locale_hint language", async () => {
  const state = buildState({
    language: "en",
    locale: "en",
    language_locked: "true",
    language_override: "false",
    language_source: "locale_hint",
  });

  const resolved = await resolveLanguageForTurn({
    state,
    userMessage: "Ik wil een businessplan maken voor mijn reclamebureau Mindd",
    localeHintRaw: "en",
    localeHintSourceRaw: "request_header",
    inputMode: "widget",
    model: "test-model",
    languageMinAlpha: 8,
    deps: makeDeps("nl"),
  });

  assert.equal(String((resolved as any).language || ""), "nl");
  assert.equal(String((resolved as any).language_source || ""), "message_detect");
  assert.equal(String((resolved as any).language_locked || ""), "true");
});

test("chat turn keeps locked message-detect language despite conflicting locale hint", async () => {
  const state = buildState({
    language: "nl",
    locale: "nl",
    language_locked: "true",
    language_override: "false",
    language_source: "message_detect",
  });

  const resolved = await resolveLanguageForTurn({
    state,
    userMessage: "Ik wil doorgaan in het Nederlands",
    localeHintRaw: "en",
    localeHintSourceRaw: "openai_locale",
    inputMode: "chat",
    model: "test-model",
    languageMinAlpha: 8,
    deps: makeDeps("nl"),
  });

  assert.equal(String((resolved as any).language || ""), "nl");
  assert.equal(String((resolved as any).locale || ""), "nl");
  assert.equal(String((resolved as any).language_source || ""), "message_detect");
  assert.equal(String((resolved as any).language_locked || ""), "true");
});
