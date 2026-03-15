import { UI_STRINGS_CATALOG_BY_LOCALE } from "./ui_strings_catalog.js";
import { UI_STRINGS_DEFAULT } from "./ui_strings_defaults.js";

function normalizeLocaleToken(raw: unknown): string {
  return String(raw || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
}

function catalogEntryForLocale(localeRaw: unknown): Record<string, string> | null {
  const locale = normalizeLocaleToken(localeRaw);
  if (!locale) return null;
  for (const [candidateLocale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    if (normalizeLocaleToken(candidateLocale) === locale) return strings;
  }
  const baseLang = locale.split("-")[0] || "";
  if (!baseLang) return null;
  for (const [candidateLocale, strings] of Object.entries(UI_STRINGS_CATALOG_BY_LOCALE)) {
    if (normalizeLocaleToken(candidateLocale).split("-")[0] === baseLang) return strings;
  }
  return null;
}

export function resolveUiStringForLocale(localeRaw: unknown, keyRaw: unknown, fallback = ""): string {
  const key = String(keyRaw || "").trim();
  if (!key) return String(fallback || "").trim();
  const fromCatalog = String(catalogEntryForLocale(localeRaw)?.[key] || "").trim();
  if (fromCatalog) return fromCatalog;
  const fromDefault = String(UI_STRINGS_DEFAULT[key] || "").trim();
  if (fromDefault) return fromDefault;
  return String(fallback || "").trim();
}

export function resolveUiStringForState(
  state: Record<string, unknown> | null | undefined,
  keyRaw: unknown,
  fallback = ""
): string {
  const key = String(keyRaw || "").trim();
  if (!key) return String(fallback || "").trim();
  const map =
    state && typeof state.ui_strings === "object" && state.ui_strings !== null
      ? (state.ui_strings as Record<string, unknown>)
      : {};
  const fromState = String(map[key] || "").trim();
  if (fromState) return fromState;
  return resolveUiStringForLocale(
    state?.ui_strings_lang || state?.locale || state?.language || state?.ui_strings_requested_lang || "en",
    key,
    fallback
  );
}
