/**
 * SSOT UI constants and key-based i18n helpers.
 * UI copy is sourced from server-provided state.ui_strings only.
 */

export const STRATEGY_STEP_ID = "strategy";

export const ORDER = [
  "step_0",
  "dream",
  "purpose",
  "bigwhy",
  "role",
  "entity",
  "strategy",
  "targetgroup",
  "productsservices",
  "rulesofthegame",
  "presentation",
];

export type PrestartContent = {
  headline: string;
  provenTitle: string;
  provenBody: string;
  outcomesTitle: string;
  outcome1: string;
  outcome2: string;
  outcome3: string;
  howLabel: string;
  howValue: string;
  timeLabel: string;
  timeValue: string;
  skeleton: string;
};

const PRESTART_INTRO_VIDEO_BY_LANG: Record<string, string> = {
  en: "https://youtu.be/JjlY4iGWSi8",
  nl: "https://youtu.be/FD3BZit8evg",
  de: "https://youtu.be/dMnAR-eVedo",
  es: "https://youtu.be/hEfq_ciotPk",
  fr: "https://youtu.be/WalQNHy1DRo",
  ja: "https://youtu.be/o1di1BkDdKA",
};

function normalizePrestartYouTubeEmbedUrl(rawUrl: string): string {
  const input = String(rawUrl || "").trim();
  if (!input) return "";
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return "";
  }
  const host = parsed.hostname.toLowerCase();
  let videoId = "";
  if (host === "youtu.be") {
    videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
  } else if (host.endsWith("youtube.com")) {
    if (parsed.pathname.startsWith("/watch")) {
      videoId = String(parsed.searchParams.get("v") || "").trim();
    } else if (parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.replace(/^\/embed\//, "").split("/")[0] || "";
    }
  }
  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return "";
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
}

const CRITICAL_PRESTART_KEYS = [
  "prestart.headline",
  "prestart.proven.title",
  "prestart.proven.body",
  "prestart.outcomes.title",
  "prestart.outcomes.item1",
  "prestart.outcomes.item2",
  "prestart.outcomes.item3",
  "prestart.meta.how.label",
  "prestart.meta.how.value",
  "prestart.meta.time.label",
  "prestart.meta.time.value",
];

const CRITICAL_UI_KEYS_STEP0_SET = new Set<string>([
  "title.step_0",
  "stepLabel.validation",
  "sectionTitle.step_0",
  "uiSubtitle",
  "uiUseWidgetToContinue",
  "startHint",
  "inputPlaceholder",
  "btnStart",
  "btnGoToNextStep",
  "prestartWelcome",
  ...CRITICAL_PRESTART_KEYS,
  "prestart.loading",
  "step0.carddesc",
  "step0.question.initial",
  "step0.readiness.statement.existing",
  "step0.readiness.statement.starting",
  "step0.readiness.suffix",
  "transient.rate_limited",
  "transient.timeout",
]);

let runtimeUiStrings: Record<string, string> = {};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function setRuntimeUiStrings(raw: unknown): void {
  const next = asRecord(raw);
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    const safeKey = String(key || "").trim();
    if (!safeKey) continue;
    const safeValue = String(value || "").trim();
    if (!safeValue) continue;
    normalized[safeKey] = safeValue;
  }
  runtimeUiStrings = normalized;
}

export function baseLang(lang: string | null | undefined): string {
  const l = String(lang || "").toLowerCase();
  return l.split(/[-_]/)[0] || "default";
}

export function t(_lang: string | null | undefined, key: string): string {
  return String(runtimeUiStrings[key] || "").trim();
}

export function titlesForLang(lang: string | null | undefined): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const step of ORDER) {
    titles[step] = t(lang, "title." + step);
  }
  return titles;
}

export function prestartWelcomeForLang(lang: string | null | undefined): string {
  return t(lang, "prestartWelcome");
}

export function prestartIntroVideoUrlForLang(lang: string | null | undefined): string {
  const langBase = baseLang(lang);
  if (!langBase) return "";
  return normalizePrestartYouTubeEmbedUrl(PRESTART_INTRO_VIDEO_BY_LANG[langBase] || "");
}

export function hasPrestartContentForLang(lang: string | null | undefined): boolean {
  return CRITICAL_PRESTART_KEYS.every((key) => String(t(lang, key) || "").trim().length > 0);
}

export function prestartContentForLang(lang: string | null | undefined): PrestartContent {
  return {
    headline: t(lang, "prestart.headline"),
    provenTitle: t(lang, "prestart.proven.title"),
    provenBody: t(lang, "prestart.proven.body"),
    outcomesTitle: t(lang, "prestart.outcomes.title"),
    outcome1: t(lang, "prestart.outcomes.item1"),
    outcome2: t(lang, "prestart.outcomes.item2"),
    outcome3: t(lang, "prestart.outcomes.item3"),
    howLabel: t(lang, "prestart.meta.how.label"),
    howValue: t(lang, "prestart.meta.how.value"),
    timeLabel: t(lang, "prestart.meta.time.label"),
    timeValue: t(lang, "prestart.meta.time.value"),
    skeleton: t(lang, "prestart.loading"),
  };
}

export function getSectionTitle(
  lang: string | null | undefined,
  stepId: string,
  businessName: string | null | undefined
): string {
  if (stepId === "step_0") return t(lang, "title.step_0");
  if (stepId === "dream") return t(lang, "sectionTitle.dream");
  if (stepId === "presentation") return t(lang, "sectionTitle.presentation");

  const hasBusinessName =
    businessName &&
    String(businessName).trim() !== "" &&
    String(businessName).trim() !== "TBD";

  const stepsWithCompany = new Set([
    "purpose",
    "bigwhy",
    "role",
    "entity",
    "strategy",
    "targetgroup",
    "productsservices",
    "rulesofthegame",
  ]);

  if (stepsWithCompany.has(stepId)) {
    const template = t(lang, "sectionTitle." + stepId + "Of");
    const noName = t(lang, "sectionTitle." + stepId + "OfFuture");
    if (hasBusinessName && template) return template.replace(/\{0\}/g, String(businessName).trim());
    return noName;
  }

  return t(lang, "title." + stepId);
}

export const CRITICAL_UI_KEYS_STEP0: string[] = [...CRITICAL_UI_KEYS_STEP0_SET];
