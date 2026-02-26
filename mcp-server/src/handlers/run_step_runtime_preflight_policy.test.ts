import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipStep0LanguageReset } from "./run_step_runtime_preflight_policy.js";

test("shouldSkipStep0LanguageReset returns true for trusted locale hint sources in chat", () => {
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: true,
      inputMode: "chat",
      localeHint: "nl",
      localeHintSource: "request_header",
      stateLanguageSource: "",
      stateLanguage: "",
    }),
    true
  );
});

test("shouldSkipStep0LanguageReset returns true for locale_hint state source fallback", () => {
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: true,
      inputMode: "chat",
      localeHint: "en",
      localeHintSource: "none",
      stateLanguageSource: "locale_hint",
      stateLanguage: "",
    }),
    true
  );
});

test("shouldSkipStep0LanguageReset returns true when normalized language matches locale hint", () => {
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: true,
      inputMode: "chat",
      localeHint: "de",
      localeHintSource: "none",
      stateLanguageSource: "",
      stateLanguage: "de",
    }),
    true
  );
});

test("shouldSkipStep0LanguageReset returns false when gate preconditions are not met", () => {
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: false,
      inputMode: "chat",
      localeHint: "nl",
      localeHintSource: "request_header",
      stateLanguageSource: "locale_hint",
      stateLanguage: "nl",
    }),
    false
  );
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: true,
      inputMode: "widget",
      localeHint: "nl",
      localeHintSource: "request_header",
      stateLanguageSource: "locale_hint",
      stateLanguage: "nl",
    }),
    false
  );
  assert.equal(
    shouldSkipStep0LanguageReset({
      guardEnabled: true,
      inputMode: "chat",
      localeHint: "",
      localeHintSource: "request_header",
      stateLanguageSource: "locale_hint",
      stateLanguage: "nl",
    }),
    false
  );
});
