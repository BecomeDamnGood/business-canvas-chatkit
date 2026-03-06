import test from "node:test";
import assert from "node:assert/strict";

import { UI_STRINGS_CATALOG_BY_LOCALE } from "./ui_strings_catalog.js";
import { UI_STRINGS_SOURCE_EN } from "./ui_strings_defaults.js";

const DREAM_COPY_KEYS = [
  "dreamBuilder.question.base",
  "dreamBuilder.question.more",
  "dreamBuilder.switchSelf.headline",
  "dreamBuilder.switchSelf.body.intro",
  "dreamBuilder.switchSelf.body.helper",
] as const;

test("dream copy keys exist for every catalog locale", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    for (const key of DREAM_COPY_KEYS) {
      const value = String((strings as Record<string, unknown>)[key] || "").trim();
      assert.ok(value.length > 0, `locale ${locale} missing non-empty value for ${key}`);
    }
  }
});

test("dream copy keys are explicitly localized for non-English locales", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    if (locale === "en") continue;
    for (const key of DREAM_COPY_KEYS) {
      const localized = String((strings as Record<string, unknown>)[key] || "").trim();
      const english = String((UI_STRINGS_SOURCE_EN as Record<string, unknown>)[key] || "").trim();
      assert.notEqual(localized, english, `locale ${locale} should localize ${key}`);
    }
  }
});
