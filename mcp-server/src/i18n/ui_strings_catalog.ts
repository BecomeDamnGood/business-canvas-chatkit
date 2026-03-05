/**
 * Static UI string catalog for welcome/bootstrap keys.
 * Source: welkomstscherm-vertaalpakket-alle-talen.md
 *
 * Runtime contract: server resolves locale and sends final ui_strings to the widget.
 */
import { UI_STRINGS_LOCALE_EN } from "./ui_strings/locales/ui_strings_en.js";
import { UI_STRINGS_LOCALE_ES } from "./ui_strings/locales/ui_strings_es.js";
import { UI_STRINGS_LOCALE_PT_BR } from "./ui_strings/locales/ui_strings_pt_br.js";
import { UI_STRINGS_LOCALE_FR } from "./ui_strings/locales/ui_strings_fr.js";
import { UI_STRINGS_LOCALE_DE } from "./ui_strings/locales/ui_strings_de.js";
import { UI_STRINGS_LOCALE_HI } from "./ui_strings/locales/ui_strings_hi.js";
import { UI_STRINGS_LOCALE_JA } from "./ui_strings/locales/ui_strings_ja.js";
import { UI_STRINGS_LOCALE_ID } from "./ui_strings/locales/ui_strings_id.js";
import { UI_STRINGS_LOCALE_IT } from "./ui_strings/locales/ui_strings_it.js";
import { UI_STRINGS_LOCALE_NL } from "./ui_strings/locales/ui_strings_nl.js";
import { UI_STRINGS_LOCALE_KO } from "./ui_strings/locales/ui_strings_ko.js";
import { UI_STRINGS_LOCALE_ZH_HANS } from "./ui_strings/locales/ui_strings_zh_hans.js";
import { UI_STRINGS_LOCALE_RU } from "./ui_strings/locales/ui_strings_ru.js";
import { UI_STRINGS_LOCALE_HU } from "./ui_strings/locales/ui_strings_hu.js";

export const UI_STRINGS_CATALOG_BY_LOCALE: Record<string, Record<string, string>> = {
  "en": UI_STRINGS_LOCALE_EN,
  "es": UI_STRINGS_LOCALE_ES,
  "pt-BR": UI_STRINGS_LOCALE_PT_BR,
  "fr": UI_STRINGS_LOCALE_FR,
  "de": UI_STRINGS_LOCALE_DE,
  "hi": UI_STRINGS_LOCALE_HI,
  "ja": UI_STRINGS_LOCALE_JA,
  "id": UI_STRINGS_LOCALE_ID,
  "it": UI_STRINGS_LOCALE_IT,
  "nl": UI_STRINGS_LOCALE_NL,
  "ko": UI_STRINGS_LOCALE_KO,
  "zh-Hans": UI_STRINGS_LOCALE_ZH_HANS,
  "ru": UI_STRINGS_LOCALE_RU,
  "hu": UI_STRINGS_LOCALE_HU,
} as const;

export const UI_STRINGS_CATALOG_LOCALES: string[] = Object.keys(UI_STRINGS_CATALOG_BY_LOCALE);
export const UI_STRINGS_CATALOG_KEYS: string[] = Object.keys(UI_STRINGS_CATALOG_BY_LOCALE.en || {});
