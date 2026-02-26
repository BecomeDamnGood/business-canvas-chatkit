export type RunStepRuntimePreflightLocaleHintSource =
  | "openai_locale"
  | "webplus_i18n"
  | "request_header"
  | "message_detect"
  | "none";

function localeHintSourceIsTrusted(source: RunStepRuntimePreflightLocaleHintSource): boolean {
  return (
    source === "openai_locale" ||
    source === "webplus_i18n" ||
    source === "request_header" ||
    source === "message_detect"
  );
}

export function shouldSkipStep0LanguageReset(params: {
  guardEnabled: boolean;
  inputMode: "widget" | "chat";
  localeHint: string;
  localeHintSource: RunStepRuntimePreflightLocaleHintSource;
  stateLanguageSource: string;
  stateLanguage: string;
}): boolean {
  const { guardEnabled, inputMode, localeHint, localeHintSource, stateLanguageSource, stateLanguage } = params;
  if (!guardEnabled) return false;
  if (inputMode !== "chat") return false;
  if (!localeHint) return false;

  return (
    localeHintSourceIsTrusted(localeHintSource) ||
    stateLanguageSource === "locale_hint" ||
    stateLanguage === localeHint
  );
}
