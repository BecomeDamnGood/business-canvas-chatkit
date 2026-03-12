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
  en: "https://mycanvasvideos.s3.amazonaws.com/welcome/About%20the%20Business%20Strategy%20Canvas%20Builder.mp4",
  nl: "https://mycanvasvideos.s3.amazonaws.com/welcome/Over%20de%20Business%20Strategy%20Canvas%20Builder.mp4",
  de: "https://mycanvasvideos.s3.amazonaws.com/welcome/U%CC%88ber%20den%20Business%20Strategy%20Canvas%20Builder.mp4",
  es: "https://mycanvasvideos.s3.amazonaws.com/welcome/Acerca%20del%20Business%20Strategy%20Canvas%20Builder.mp4",
  fr: "https://mycanvasvideos.s3.amazonaws.com/welcome/A%CC%80%20propos%20du%20Business%20Strategy%20Canvas%20Builder.mp4",
  it: "https://mycanvasvideos.s3.amazonaws.com/welcome/Sul%20Business%20Strategy%20Canvas%20Builder.mp4",
  ja: "https://mycanvasvideos.s3.amazonaws.com/welcome/Business%20Strategy%20Canvas%20Builder%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6.mp4",
  ru: "https://mycanvasvideos.s3.amazonaws.com/welcome/%D0%9E%20%D0%BA%D0%BE%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%82%D0%BE%D1%80%D0%B5%20Business%20Strategy%20Canvas.mp4",
};

const BEN_PROFILE_VIDEO_BY_LANG: Record<string, string> = {
  en: "https://mycanvasvideos.s3.amazonaws.com/About%20Ben%20Steenstra.mp4",
  nl: "https://mycanvasvideos.s3.amazonaws.com/Over%20Ben%20Steenstra.mp4",
  it: "https://mycanvasvideos.s3.amazonaws.com/Su%20Ben%20Steenstra.mp4",
  de: "https://mycanvasvideos.s3.amazonaws.com/Uber%20Ben%20Steenstra.mp4",
  es: "https://mycanvasvideos.s3.amazonaws.com/Acerca%20de%20Ben%20Steenstra.mp4",
  fr: "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/A%CC%80_propos_de_Ben_Steenstra.mp4",
  ja: "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/%E3%80%8C%E3%83%98%E3%82%99%E3%83%B3%E3%83%BB%E3%82%B9%E3%83%86%E3%82%A3%E3%83%BC%E3%83%B3%E3%82%B9%E3%83%88%E3%83%A9%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6%E3%80%8D.mp4",
  ru: "https://mycanvasvideos.s3.amazonaws.com/bensteenstra/%D0%9E%20%D0%91%D0%B5%D0%BD%D0%B5%20%D0%A1%D1%82%D0%B5%D0%BD%D1%81%D1%82%D1%80%D0%B5.mp4",
};

const DREAM_STEP_VIDEO_BY_LANG: Record<string, string> = {
  en: "https://mycanvasvideos.s3.amazonaws.com/dream/About%20the%20Dream%20Step.mp4",
  nl: "https://mycanvasvideos.s3.amazonaws.com/dream/Over%20de%20Droom%20Stap.mp4",
  it: "https://mycanvasvideos.s3.amazonaws.com/dream/Sul%20passo%20del%20Sogno.mp4",
  de: "https://mycanvasvideos.s3.amazonaws.com/dream/U%CC%88ber%20den%20Schritt%20%E2%80%9ETraum%E2%80%9C.mp4",
  es: "https://mycanvasvideos.s3.amazonaws.com/dream/Sobre%20el%20paso%20del%20Suen%CC%83o.mp4",
  fr: "https://mycanvasvideos.s3.amazonaws.com/dream/A%CC%80%20propos%20du%20Re%CC%82ve.mp4",
  ru: "https://mycanvasvideos.s3.amazonaws.com/dream/%D0%9E%20%D1%88%D0%B0%D0%B3%D0%B5%20%C2%AB%D0%9C%D0%B5%D1%87%D1%82%D0%B0%C2%BB.mp4",
};

const PURPOSE_STEP_VIDEO_BY_LANG: Record<string, string> = {
  en: "https://mycanvasvideos.s3.amazonaws.com/purpose/About%20Purpose.mp4",
  de: "https://mycanvasvideos.s3.amazonaws.com/purpose/U%CC%88ber_den_Daseinsgrund.mp4",
  es: "https://mycanvasvideos.s3.amazonaws.com/purpose/Sobre_el_propo%CC%81sito_de_existir.mp4",
  fr: "https://mycanvasvideos.s3.amazonaws.com/purpose/A%CC%80_propos_de_la_raison_d%E2%80%99e%CC%82tre.mp4",
  it: "https://mycanvasvideos.s3.amazonaws.com/purpose/Sul%20perche%CC%81%20di%20esistere.mp4",
  nl: "https://mycanvasvideos.s3.amazonaws.com/purpose/Over%20je%20bestaansrecht.mp4",
  ru: "https://mycanvasvideos.s3.amazonaws.com/purpose/%D0%9E%20%D1%88%D0%B0%D0%B3%D0%B5%20%C2%AB%D0%9F%D1%80%D0%B5%D0%B4%D0%BD%D0%B0%D0%B7%D0%BD%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D0%B5%C2%BB.mp4",
};

function normalizeHttpUrl(rawUrl: string | null | undefined): string {
  const input = String(rawUrl || "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
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
  return normalizeHttpUrl(PRESTART_INTRO_VIDEO_BY_LANG[langBase] || "");
}

export function benProfileVideoUrlForLang(lang: string | null | undefined): string {
  const langBase = baseLang(lang);
  if (!langBase) return "";
  return normalizeHttpUrl(BEN_PROFILE_VIDEO_BY_LANG[langBase] || "");
}

export function dreamStepVideoUrlForLang(lang: string | null | undefined): string {
  const langBase = baseLang(lang);
  if (!langBase) return "";
  return normalizeHttpUrl(DREAM_STEP_VIDEO_BY_LANG[langBase] || "");
}

export function purposeStepVideoUrlForLang(lang: string | null | undefined): string {
  const langBase = baseLang(lang);
  if (!langBase) return "";
  return normalizeHttpUrl(PURPOSE_STEP_VIDEO_BY_LANG[langBase] || "");
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
