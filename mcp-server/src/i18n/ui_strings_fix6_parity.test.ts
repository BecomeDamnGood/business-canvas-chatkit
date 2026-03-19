import test from "node:test";
import assert from "node:assert/strict";

import { UI_STRINGS_CATALOG_BY_LOCALE } from "./ui_strings_catalog.js";
import { UI_STRINGS_SOURCE_EN } from "./ui_strings_defaults.js";

const FIX6_UI_KEYS = [
  "compare.feedback.compare.intro.template",
  "compare.feedback.user_pick.ack.default",
  "compare.feedback.user_pick.reason.default",
  "compare.feedback.dream_builder.rewrite.default",
  "compareGroupedUserLabel",
  "compareGroupedCompareSuggestionLabel",
  "compareGroupedCompareInstruction",
  "compareGroupedCompareRetainedHeading",
  "menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE",
  "menuLabel.PURPOSE_MENU_INTRO.ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
  "menuLabel.PURPOSE_MENU_POST_ASK.ACTION_PURPOSE_INTRO_EXPLAIN_MORE",
  "menuLabel.ROLE_MENU_INTRO.ACTION_ROLE_INTRO_EXPLAIN_MORE",
  "menuLabel.ENTITY_MENU_INTRO.ACTION_ENTITY_INTRO_EXPLAIN_MORE",
  "menuLabel.STRATEGY_MENU_INTRO.ACTION_STRATEGY_INTRO_EXPLAIN_MORE",
  "menuLabel.STRATEGY_MENU_REFINE.ACTION_STRATEGY_REFINE_EXPLAIN_MORE",
  "menuLabel.STRATEGY_MENU_QUESTIONS.ACTION_STRATEGY_QUESTIONS_EXPLAIN_MORE",
  "menuLabel.STRATEGY_MENU_CONFIRM.ACTION_STRATEGY_REFINE_EXPLAIN_MORE",
  "menuLabel.TARGETGROUP_MENU_INTRO.ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE",
  "menuLabel.TARGETGROUP_MENU_EXPLAIN_MORE.ACTION_TARGETGROUP_EXPLAIN_ASK_QUESTIONS",
  "menuLabel.TARGETGROUP_MENU_EXPLAIN_ONLY.ACTION_TARGETGROUP_INTRO_EXPLAIN_MORE",
  "menuLabel.TARGETGROUP_MENU_POSTREFINE.ACTION_TARGETGROUP_POSTREFINE_ASK_QUESTIONS",
  "menuLabel.RULES_MENU_INTRO.ACTION_RULES_INTRO_EXPLAIN_MORE",
  "menuLabel.RULES_MENU_ASK_EXPLAIN.ACTION_RULES_ASK_EXPLAIN_MORE",
  "menuLabel.RULES_MENU_EXPLAIN_ONLY.ACTION_RULES_ASK_EXPLAIN_MORE",
  "menuLabel.RULES_MENU_CONFIRM.ACTION_RULES_ASK_EXPLAIN_MORE",
  "menuLabel.DREAM_EXPLAINER_MENU_CONFIRM_SINGLE.ACTION_DREAM_EXPLAINER_REFINE_ADJUST",
  "menuLabel.PURPOSE_MENU_REFINE.ACTION_PURPOSE_REFINE_ADJUST",
  "menuLabel.BIGWHY_MENU_REFINE.ACTION_BIGWHY_REFINE_ADJUST",
  "menuLabel.ROLE_MENU_REFINE.ACTION_ROLE_REFINE_ADJUST",
  "menuLabel.ENTITY_MENU_EXAMPLE.ACTION_ENTITY_EXAMPLE_REFINE",
  "menuLabel.RULES_MENU_REFINE.ACTION_RULES_REFINE_ADJUST",
  "menuLabel.PRESENTATION_MENU_RECREATE.ACTION_PRESENTATION_MAKE",
] as const;

test("fix-program ui keys exist for every catalog locale", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    for (const key of FIX6_UI_KEYS) {
      const value = String((strings as Record<string, unknown>)[key] || "").trim();
      assert.ok(value.length > 0, `locale ${locale} missing non-empty value for ${key}`);
    }
  }
});

test("fix-program ui keys are explicitly localized for non-English locales", () => {
  for (const [locale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    if (locale === "en") continue;
    for (const key of FIX6_UI_KEYS) {
      const localized = String((strings as Record<string, unknown>)[key] || "").trim();
      const english = String((UI_STRINGS_SOURCE_EN as Record<string, unknown>)[key] || "").trim();
      assert.notEqual(localized, english, `locale ${locale} should localize ${key}`);
    }
  }
});
