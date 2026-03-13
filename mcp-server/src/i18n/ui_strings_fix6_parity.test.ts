import test from "node:test";
import assert from "node:assert/strict";

import { UI_STRINGS_CATALOG_BY_LOCALE } from "./ui_strings_catalog.js";
import { UI_STRINGS_SOURCE_EN } from "./ui_strings_defaults.js";

const FIX6_UI_KEYS = [
  "menuLabel.PRESENTATION_MENU_RECREATE.ACTION_PRESENTATION_MAKE",
  "wording.feedback.user_pick.ack.default",
  "wording.feedback.user_pick.reason.default",
] as const;

test("fix 6 ui keys exist for every catalog locale", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    for (const key of FIX6_UI_KEYS) {
      const value = String((strings as Record<string, unknown>)[key] || "").trim();
      assert.ok(value.length > 0, `locale ${locale} missing non-empty value for ${key}`);
    }
  }
});

test("fix 6 ui keys are explicitly localized for non-English locales", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    if (locale === "en") continue;
    for (const key of FIX6_UI_KEYS) {
      const localized = String((strings as Record<string, unknown>)[key] || "").trim();
      const english = String((UI_STRINGS_SOURCE_EN as Record<string, unknown>)[key] || "").trim();
      assert.notEqual(localized, english, `locale ${locale} should localize ${key}`);
    }
  }
});
