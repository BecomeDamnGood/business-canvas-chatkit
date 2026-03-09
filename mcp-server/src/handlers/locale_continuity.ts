import { normalizeLangCode, normalizeLocaleHint } from "../core/bootstrap_runtime.js";

type LocaleAuthority = {
  locale: string;
  language: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasRenderableSpecialistText(specialist: Record<string, unknown>): boolean {
  return Boolean(
    String(specialist.message || "").trim() ||
      String(specialist.refined_formulation || "").trim() ||
      String(specialist.question || "").trim()
  );
}

function stampSpecialistContentLocale(
  specialist: Record<string, unknown>,
  authority: LocaleAuthority
): Record<string, unknown> {
  if (!Object.keys(specialist).length) return specialist;
  if (!authority.locale && !authority.language) return specialist;
  return {
    ...specialist,
    ...(authority.locale ? { __content_locale: authority.locale } : {}),
    ...(authority.language ? { __content_language: authority.language } : {}),
  };
}

function specialistAuthority(specialist: Record<string, unknown>): LocaleAuthority {
  const locale =
    normalizeLocaleHint(String(specialist.__content_locale || specialist.content_locale || "")) || "";
  const language =
    normalizeLangCode(
      String(
        specialist.__content_language ||
          specialist.content_language ||
          locale
      )
    ) || normalizeLangCode(locale);
  return { locale, language };
}

export function resolveStateLocaleAuthority(stateRaw: unknown): LocaleAuthority {
  const state = toRecord(stateRaw);
  const locale =
    normalizeLocaleHint(
      String(
        state.ui_strings_requested_lang ||
          state.locale ||
          state.ui_strings_lang ||
          state.language ||
          ""
      )
    ) || "";
  const language =
    normalizeLangCode(String(state.language || state.ui_strings_lang || locale || "")) ||
    normalizeLangCode(locale);
  return { locale, language };
}

export function stampResponseContentLocale(
  responseRaw: unknown,
  stateRaw?: unknown
): Record<string, unknown> {
  const response = toRecord(responseRaw);
  if (!Object.keys(response).length) return response;
  const state = toRecord(stateRaw ?? response.state);
  const authority = resolveStateLocaleAuthority(state);
  const specialist = stampSpecialistContentLocale(toRecord(response.specialist), authority);
  const lastSpecialist = stampSpecialistContentLocale(toRecord(state.last_specialist_result), authority);
  const nextState =
    Object.keys(lastSpecialist).length > 0
      ? {
          ...state,
          last_specialist_result: lastSpecialist,
        }
      : state;
  return {
    ...response,
    ...(authority.locale ? { content_locale: authority.locale } : {}),
    ...(authority.language ? { content_language: authority.language } : {}),
    ...(Object.keys(specialist).length > 0 ? { specialist } : {}),
    ...(Object.keys(nextState).length > 0 ? { state: nextState } : {}),
  };
}

export function dropIncompatibleLastSpecialistResult<T extends Record<string, unknown>>(
  stateRaw: T,
  options?: { previousAuthority?: LocaleAuthority | null }
): T {
  const state = toRecord(stateRaw) as T;
  const lastSpecialist = toRecord(state.last_specialist_result);
  if (!Object.keys(lastSpecialist).length) return state;

  const currentAuthority = resolveStateLocaleAuthority(state);
  const previousAuthority = options?.previousAuthority || null;
  const priorChanged =
    Boolean(previousAuthority) &&
    (
      String(previousAuthority?.language || "") !== String(currentAuthority.language || "") ||
      String(previousAuthority?.locale || "") !== String(currentAuthority.locale || "")
    );
  const stampedAuthority = specialistAuthority(lastSpecialist);
  const hasStampedAuthority = Boolean(stampedAuthority.language || stampedAuthority.locale);
  const stampedMismatch =
    hasStampedAuthority &&
    (
      (stampedAuthority.language && currentAuthority.language && stampedAuthority.language !== currentAuthority.language) ||
      (
        !stampedAuthority.language &&
        stampedAuthority.locale &&
        currentAuthority.locale &&
        stampedAuthority.locale !== currentAuthority.locale
      )
    );
  const unstampedMismatch = !hasStampedAuthority && priorChanged && hasRenderableSpecialistText(lastSpecialist);

  if (!stampedMismatch && !unstampedMismatch) return state;
  return {
    ...state,
    last_specialist_result: {},
  };
}
