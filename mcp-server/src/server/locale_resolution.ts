import { getFinalsSnapshot } from "../core/state.js";
import { safeString } from "../server_safe_string.js";

import { VERSION } from "./server_config.js";
import { createBootstrapSessionId, normalizeBootstrapSessionId } from "./ordering_parity.js";

function injectUiVersion(html: string): string {
  return html.replace(/__UI_VERSION__/g, VERSION);
}

function normalizeStepId(rawStepId: string): string {
  const trimmed = safeString(rawStepId ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "start") return "step_0";
  return trimmed;
}

function normalizeLocaleHint(raw: unknown): string {
  const text = safeString(raw ?? "").trim();
  if (!text) return "";
  const firstPart = text.split(",")[0]?.trim() || "";
  const firstToken = firstPart.split(";")[0]?.trim() || "";
  if (!firstToken) return "";
  const normalizedRaw = firstToken
    .replace(/_/g, "-")
    .replace(/-{2,}/g, "-");
  const parts = normalizedRaw
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const languagePart = parts[0] || "";
  if (!/^[A-Za-z]{2,3}$/.test(languagePart)) return "";
  const language = languagePart.toLowerCase();
  if (language === "und") return "";
  const rest: string[] = [];
  for (const part of parts.slice(1)) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(part)) return "";
    if (/^[A-Za-z]{4}$/.test(part)) {
      rest.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
      continue;
    }
    if (/^[A-Za-z]{2}$/.test(part) || /^[0-9]{3}$/.test(part)) {
      rest.push(part.toUpperCase());
      continue;
    }
    rest.push(part.toLowerCase());
  }
  return [language, ...rest].join("-");
}

function localeFromMetaValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeLocaleHint(item);
      if (normalized) return normalized;
    }
    return "";
  }
  return normalizeLocaleHint(value);
}

function localeFromRequestHeaders(requestInfo: unknown): string {
  const headersRaw =
    requestInfo && typeof requestInfo === "object" && (requestInfo as any).headers
      ? ((requestInfo as any).headers as unknown)
      : null;
  if (!headersRaw) return "";
  if (typeof (headersRaw as any).get === "function") {
    const fromGet = localeFromMetaValue((headersRaw as any).get("accept-language"));
    if (fromGet) return fromGet;
  }
  if (Array.isArray(headersRaw)) {
    for (const entry of headersRaw) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const key = safeString(entry[0] ?? "").toLowerCase();
      if (key !== "accept-language") continue;
      const fromTuple = localeFromMetaValue(entry[1]);
      if (fromTuple) return fromTuple;
    }
  }
  if (typeof headersRaw !== "object") return "";
  const record = headersRaw as Record<string, unknown>;
  const direct = localeFromMetaValue(record["accept-language"]);
  if (direct) return direct;
  const canonical = Object.keys(record).find(
    (key) => safeString(key || "").toLowerCase() === "accept-language"
  );
  if (!canonical) return "";
  return localeFromMetaValue(record[canonical]);
}

function normalizeLocaleHintSource(
  raw: unknown
): "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none" {
  const value = safeString(raw).trim();
  return value === "openai_locale" ||
    value === "webplus_i18n" ||
    value === "request_header" ||
    value === "message_detect"
    ? value
    : "none";
}

function normalizeHostWidgetSessionId(raw: unknown): string {
  const value = safeString(raw ?? "").trim();
  if (!value) return "";
  if (value.length > 256) return value.slice(0, 256);
  return value;
}

function mergeLocaleHintInputs(
  argsLocaleHint: unknown,
  argsLocaleSource: unknown,
  extraLocale: {
    locale_hint: string;
    locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
  }
): {
  locale_hint: string;
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
} {
  const argHint = normalizeLocaleHint(safeString(argsLocaleHint));
  const argSource = normalizeLocaleHintSource(argsLocaleSource);
  const extraHint = normalizeLocaleHint(safeString(extraLocale.locale_hint));
  const extraSource = normalizeLocaleHintSource(extraLocale.locale_hint_source);
  const mergedHint = argHint || extraHint;
  if (!mergedHint) return { locale_hint: "", locale_hint_source: "none" };
  if (argSource !== "none") return { locale_hint: mergedHint, locale_hint_source: argSource };
  if (extraSource !== "none") return { locale_hint: mergedHint, locale_hint_source: extraSource };
  return { locale_hint: mergedHint, locale_hint_source: "none" };
}

function resolveLocaleHintFromExtra(extra: unknown): {
  locale_hint: string;
  locale_hint_source: "openai_locale" | "webplus_i18n" | "request_header" | "message_detect" | "none";
} {
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : null;
  if (meta) {
    const openaiLocale = localeFromMetaValue(meta["openai/locale"]);
    if (openaiLocale) {
      return { locale_hint: openaiLocale, locale_hint_source: "openai_locale" };
    }
    const webplusLocale = localeFromMetaValue(meta["webplus/i18n"]);
    if (webplusLocale) {
      return { locale_hint: webplusLocale, locale_hint_source: "webplus_i18n" };
    }
  }
  const headerLocale = localeFromRequestHeaders(
    extra && typeof extra === "object" ? (extra as any).requestInfo : null
  );
  if (headerLocale) {
    return { locale_hint: headerLocale, locale_hint_source: "request_header" };
  }
  return { locale_hint: "", locale_hint_source: "none" };
}

function resolveHostWidgetSessionIdFromExtra(extra: unknown): string {
  const meta =
    extra && typeof extra === "object" && (extra as any)._meta && typeof (extra as any)._meta === "object"
      ? ((extra as any)._meta as Record<string, unknown>)
      : null;
  if (!meta) return "";
  const direct = normalizeHostWidgetSessionId(meta["openai/widgetSessionId"]);
  if (direct) return direct;
  const fallback = normalizeHostWidgetSessionId(meta["openai/widget_session_id"]);
  return fallback;
}

function buildInternalHostWidgetSessionId(seed: unknown): string {
  const normalizedSeed = normalizeBootstrapSessionId(seed) || createBootstrapSessionId();
  return `internal:${normalizedSeed}`;
}

function resolveEffectiveHostWidgetSessionId(params: {
  provided?: unknown;
  state?: Record<string, unknown> | null | undefined;
  bootstrapSessionId?: unknown;
}): string {
  const provided = normalizeHostWidgetSessionId(params.provided);
  if (provided) return provided;
  const state = params.state && typeof params.state === "object" ? params.state : {};
  const fromState = normalizeHostWidgetSessionId((state as any).host_widget_session_id);
  if (fromState) return fromState;
  return buildInternalHostWidgetSessionId(
    normalizeBootstrapSessionId(params.bootstrapSessionId ?? (state as any).bootstrap_session_id ?? "")
  );
}

function hasNonBusinessFinals(state: Record<string, unknown> | null | undefined): boolean {
  const snapshot = getFinalsSnapshot((state ?? {}) as any);
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "business_name") continue;
    if (safeString(value ?? "").trim()) return true;
  }
  return false;
}

function isFirstStartStep(stepId: string, state: Record<string, unknown> | null | undefined): boolean {
  return stepId === "step_0" && !hasNonBusinessFinals(state);
}

const REBASE_ELIGIBLE_INTERACTIVE_ACTIONS = new Set<string>(["ACTION_START"]);

type StaleInteractiveActionPolicy = {
  normalizedAction: string;
  isInteractiveAction: boolean;
  rebaseEligible: boolean;
  reasonCode:
    | "text_input"
    | "interactive_action_not_rebase_eligible"
    | "interactive_action_rebase_eligible";
};

function classifyStaleInteractiveActionPolicy(actionRaw: unknown): StaleInteractiveActionPolicy {
  const normalizedAction = safeString(actionRaw ?? "").trim().toUpperCase();
  const isInteractiveAction = normalizedAction.startsWith("ACTION_");
  if (!isInteractiveAction) {
    return {
      normalizedAction,
      isInteractiveAction: false,
      rebaseEligible: false,
      reasonCode: "text_input",
    };
  }
  const rebaseEligible = REBASE_ELIGIBLE_INTERACTIVE_ACTIONS.has(normalizedAction);
  return {
    normalizedAction,
    isInteractiveAction: true,
    rebaseEligible,
    reasonCode: rebaseEligible
      ? "interactive_action_rebase_eligible"
      : "interactive_action_not_rebase_eligible",
  };
}

function readStateFromWidgetResult(result: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const stateRaw = (result as any).state;
  if (!stateRaw || typeof stateRaw !== "object") return null;
  return JSON.parse(JSON.stringify(stateRaw)) as Record<string, unknown>;
}


export {
  classifyStaleInteractiveActionPolicy,
  injectUiVersion,
  isFirstStartStep,
  mergeLocaleHintInputs,
  normalizeHostWidgetSessionId,
  normalizeStepId,
  readStateFromWidgetResult,
  resolveEffectiveHostWidgetSessionId,
  resolveHostWidgetSessionIdFromExtra,
  resolveLocaleHintFromExtra,
};
