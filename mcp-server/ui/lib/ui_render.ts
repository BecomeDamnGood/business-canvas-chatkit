/**
 * Main card rendering, choice buttons, stepper, formatText, error views.
 */

import {
  ORDER,
  t,
  titlesForLang,
  prestartContentForLang,
  hasPrestartContentForLang,
  getSectionTitle,
  setRuntimeUiStrings,
} from "./ui_constants.js";
import { escapeHtml, renderInlineText, renderStructuredText, stripInlineText } from "./ui_text.js";
import type { Choice } from "./ui_choices.js";
import {
  callRunStep,
  setLoading,
  setSendEnabled,
  setInlineNotice,
  clearInlineNotice,
  lockRateLimit,
  toolData,
  setLastToolOutput,
  uiLang,
  resolveWidgetPayload,
  resetHydrationRetryCycle,
} from "./ui_actions.js";
import { getIsLoading, setSessionStarted, setSessionWelcomeShown } from "./ui_state.js";

function stepIndex(stepId: string): number {
  const idx = ORDER.indexOf(stepId);
  return idx >= 0 ? idx : 0;
}

export function extractStepTitle(stepId: string, lang: string | null | undefined): string {
  const titles = titlesForLang(lang);
  const fullTitle = titles[stepId] || "";
  return fullTitle.replace(/^[^\d]*\d+:\s*/, "");
}

function uiText(lang: string | null | undefined, key: string, _fallback: string): string {
  const translated = String(t(lang, key) || "").trim();
  if (translated) return translated;
  return "";
}

function stepLabelShort(stepId: string, lang: string | null | undefined): string {
  const full = extractStepTitle(stepId, lang);
  if (stepId === "step_0") return uiText(lang, "stepLabel.validation", "");
  return full.length > 12 ? full.slice(0, 12) + "…" : full;
}

export function buildStepper(
  activeIdx: number,
  stepTitle: string | null | undefined,
  lang?: string | null
): void {
  const el = document.getElementById("stepper");
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < ORDER.length; i++) {
    const s = document.createElement("div");
    let className = "step-item step";
    if (i < activeIdx) className += " completed";
    if (i === activeIdx) className += " active";
    s.className = className;
    const label = document.createElement("div");
    label.className = "step-item-label";
    /* Keep behavior: only the active step shows a short label. */
    label.textContent = i === activeIdx ? stepLabelShort(ORDER[i], lang) : "";
    s.appendChild(label);
    const bar = document.createElement("div");
    bar.className = "step-bar";
    s.appendChild(bar);
    el.appendChild(s);
  }
}

export function dedupeBodyAgainstPrompt(bodyRaw: string, promptRaw: string): string {
  const body = String(bodyRaw || "");
  const prompt = String(promptRaw || "").trim();
  if (!body.trim() || !prompt) return body;

  const bodyTrimmed = body.trim();
  if (bodyTrimmed === prompt) return "";

  const bodyLeadingTrimmed = body.trimStart();
  if (!bodyLeadingTrimmed.startsWith(prompt)) return body;
  const rest = bodyLeadingTrimmed.slice(prompt.length);
  if (!/^\s+/.test(rest)) return body;
  return rest.replace(/^\s+/, "");
}

export function stripStructuredChoiceLines(promptRaw: string): string {
  return String(promptRaw || "").trim();
}

function setStaticStrings(lang: string): void {
  const uiSubtitle = document.getElementById("uiSubtitle");
  const byText = document.getElementById("byText");
  const btnStartText = document.getElementById("btnStartText");
  const send = document.getElementById("send");
  if (uiSubtitle) uiSubtitle.textContent = t(lang, "uiSubtitle");
  if (byText) byText.textContent = t(lang, "byText");
  if (btnStartText) btnStartText.textContent = t(lang, "btnStart");
  if (send) send.setAttribute("title", t(lang, "sendTitle"));
}

function clearElement(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendTextNode(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  if (className) el.className = className;
  el.textContent = String(text || "");
  return el;
}

function renderPrestartContent(cardDesc: HTMLElement, lang: string): void {
  const content = prestartContentForLang(lang);
  clearElement(cardDesc);
  cardDesc.appendChild(appendTextNode("p", "card-headline", content.headline));

  const sectionProven = appendTextNode("div", "section", "");
  sectionProven.appendChild(appendTextNode("div", "section-title", content.provenTitle));
  sectionProven.appendChild(appendTextNode("div", "section-body", content.provenBody));
  cardDesc.appendChild(sectionProven);

  cardDesc.appendChild(appendTextNode("div", "divider", ""));

  const sectionOutcomes = appendTextNode("div", "section", "");
  sectionOutcomes.appendChild(appendTextNode("div", "section-title", content.outcomesTitle));
  const deliverables = appendTextNode("div", "deliverables", "");
  for (const item of [content.outcome1, content.outcome2, content.outcome3]) {
    const deliverable = appendTextNode("div", "deliverable", "");
    deliverable.appendChild(appendTextNode("div", "deliverable-dot", ""));
    deliverable.appendChild(document.createTextNode(item));
    deliverables.appendChild(deliverable);
  }
  sectionOutcomes.appendChild(deliverables);
  cardDesc.appendChild(sectionOutcomes);

  cardDesc.appendChild(appendTextNode("div", "divider", ""));

  const metaRow = appendTextNode("div", "meta-row", "");
  const metaHow = appendTextNode("div", "meta-item", "");
  metaHow.appendChild(appendTextNode("div", "meta-label", content.howLabel));
  metaHow.appendChild(appendTextNode("div", "meta-value", content.howValue));
  metaRow.appendChild(metaHow);
  const metaTime = appendTextNode("div", "meta-item", "");
  metaTime.appendChild(appendTextNode("div", "meta-label", content.timeLabel));
  metaTime.appendChild(appendTextNode("div", "meta-value", content.timeValue));
  metaRow.appendChild(metaTime);
  cardDesc.appendChild(metaRow);
}

function renderPrestartSkeleton(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const skeleton = appendTextNode("div", "skeleton-stack", "");
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  skeleton.appendChild(appendTextNode("div", "skeleton-line", ""));
  cardDesc.appendChild(skeleton);
}

function renderBootstrapWaitShell(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "14px";
  const waitTitle = uiText(lang, "prestart.loading", "");
  if (waitTitle) {
    shell.appendChild(
      appendTextNode(
        "div",
        "bootstrap-wait-title",
        waitTitle
      )
    );
  }

  for (const width of ["68%", "92%", "84%", "56%"]) {
    const line = appendTextNode("div", "skeleton-line", "");
    (line as HTMLElement).style.width = width;
    (line as HTMLElement).style.height = "12px";
    (line as HTMLElement).style.borderRadius = "999px";
    (line as HTMLElement).style.opacity = "0.9";
    shell.appendChild(line);
  }

  cardDesc.appendChild(shell);
}

function renderHydrationRecovery(cardDesc: HTMLElement, lang: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "12px";
  shell.appendChild(
    appendTextNode(
      "div",
      "bootstrap-recovery-title",
      uiText(lang, "hydration.retry.title", "")
    )
  );
  shell.appendChild(
    appendTextNode(
      "div",
      "bootstrap-recovery-copy",
      uiText(lang, "hydration.retry.body", "")
    )
  );
  const btn = appendTextNode(
    "button",
    "choiceBtn",
    uiText(lang, "hydration.retry.action", "")
  ) as HTMLButtonElement;
  btn.id = "btnHydrationRetry";
  btn.type = "button";
  shell.appendChild(btn);
  cardDesc.appendChild(shell);
}

function blockedMessageForReason(
  lang: string,
  reason: string,
  fallbackMessage: string
): { title: string; body: string } {
  if (reason === "session_upgrade_required") {
    return {
      title: uiText(lang, "error.session_upgrade.title", ""),
      body: uiText(lang, "error.session_upgrade.body", "") || fallbackMessage || "",
    };
  }
  if (reason === "contract_violation") {
    return {
      title: uiText(lang, "error.contract.title", ""),
      body: uiText(lang, "error.contract.body", "") || fallbackMessage || "",
    };
  }
  return {
    title: uiText(lang, "error.generic.title", ""),
    body: uiText(lang, "error.generic.body", "") || fallbackMessage || "",
  };
}

function renderBlockedState(cardDesc: HTMLElement, lang: string, title: string, body: string): void {
  clearElement(cardDesc);
  const shell = appendTextNode("div", "bootstrap-wait-shell", "");
  (shell as HTMLElement).style.display = "grid";
  (shell as HTMLElement).style.gap = "12px";
  shell.appendChild(appendTextNode("div", "bootstrap-recovery-title", title));
  shell.appendChild(appendTextNode("div", "bootstrap-recovery-copy", body));
  cardDesc.appendChild(shell);
}

export function renderChoiceButtons(choices: Choice[] | null | undefined, resultData: Record<string, unknown>): void {
  const wrap = document.getElementById("choiceWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const state = (resultData?.state as Record<string, unknown>) || {};
  const uiPayload =
    resultData && typeof resultData.ui === "object" && resultData.ui
      ? (resultData.ui as Record<string, unknown>)
      : {};
  const structuredActions = Array.isArray(uiPayload.actions)
    ? (uiPayload.actions as Array<Record<string, unknown>>)
    : [];
  const _unusedChoices = Array.isArray(choices) ? choices : [];
  void _unusedChoices;
  const lang = uiLang(state);
  if (structuredActions.length === 0) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "flex";
  const isLoading = getIsLoading();
  for (const action of structuredActions) {
    const labelKey = String(action?.label_key || "").trim();
    const labelFromPayload = stripInlineText(String(action?.label || "")).trim();
    const label = labelFromPayload || (labelKey ? String(t(lang, labelKey) || "").trim() : "");
    const actionCode = String(action?.action_code || "").trim();
    if (!label || !actionCode) continue;
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = isLoading;
    btn.addEventListener("click", () => {
      if (getIsLoading()) return;
      callRunStep(actionCode);
    });
    wrap.appendChild(btn);
  }
  if (wrap.childNodes.length === 0) {
    wrap.style.display = "none";
    setInlineNotice(t(lang, "optionsDisplayError"));
  }
}

function renderWordingChoicePanel(resultData: Record<string, unknown>, lang: string): boolean {
  const wrap = document.getElementById("wordingChoiceWrap");
  const headingEl = document.getElementById("wordingChoiceHeading");
  const userTextEl = document.getElementById("wordingChoiceUserText");
  const userListEl = document.getElementById("wordingChoiceUserList");
  const suggestionTextEl = document.getElementById("wordingChoiceSuggestionText");
  const suggestionListEl = document.getElementById("wordingChoiceSuggestionList");
  const instructionEl = document.getElementById("wordingChoiceInstruction");
  const userBtn = document.getElementById("wordingChoicePickUser") as HTMLButtonElement | null;
  const suggestionBtn = document.getElementById("wordingChoicePickSuggestion") as HTMLButtonElement | null;
  if (
    !wrap ||
    !headingEl ||
    !userTextEl ||
    !userListEl ||
    !suggestionTextEl ||
    !suggestionListEl ||
    !instructionEl ||
    !userBtn ||
    !suggestionBtn
  ) {
    return false;
  }

  const uiPayload =
    resultData && typeof resultData.ui === "object" && resultData.ui
      ? (resultData.ui as Record<string, unknown>)
      : {};
  const flags =
    uiPayload && typeof uiPayload.flags === "object" && uiPayload.flags
      ? (uiPayload.flags as Record<string, unknown>)
      : {};
  const wording =
    uiPayload && typeof uiPayload.wording_choice === "object" && uiPayload.wording_choice
      ? (uiPayload.wording_choice as Record<string, unknown>)
      : {};
  const requirePick = String(flags.require_wording_pick || "false") === "true";
  const enabled = requirePick || wording.enabled === true;
  if (!enabled) {
    (wrap as HTMLElement).style.display = "none";
    return false;
  }

  const mode = String(wording.mode || "text") === "list" ? "list" : "text";
  const userText = String(wording.user_text || "").trim();
  const suggestionText = String(wording.suggestion_text || "").trim();
  const userItems = Array.isArray(wording.user_items) ? wording.user_items : [];
  const suggestionItems = Array.isArray(wording.suggestion_items) ? wording.suggestion_items : [];
  const instruction = String(wording.instruction || "").trim() || t(lang, "wordingChoiceInstruction");
  const ensureLabelColon = (value: string): string => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /[:]\s*$/.test(trimmed) ? trimmed : `${trimmed}:`;
  };
  const userLabel = ensureLabelColon(t(lang, "wordingChoiceHeading"));
  const suggestionLabel = ensureLabelColon(t(lang, "wordingChoiceSuggestionLabel"));
  const normalizeListItem = (value: unknown): string =>
    String(value || "")
      .replace(/^\s*(?:[-*•·]\s+|\d+[\.\)]\s+)/, "")
      .trim();

  headingEl.textContent = "";
  (headingEl as HTMLElement).style.display = "none";
  instructionEl.textContent = instruction;
  userTextEl.textContent = userLabel || uiText(lang, "wordingChoiceHeading", "");
  suggestionTextEl.textContent =
    suggestionLabel || uiText(lang, "wordingChoiceSuggestionLabel", "");

  if (mode === "list") {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "block";
    (suggestionListEl as HTMLElement).style.display = "block";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    for (const item of userItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = normalizeListItem(item);
      userListEl.appendChild(li);
    }
    for (const item of suggestionItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = normalizeListItem(item);
      suggestionListEl.appendChild(li);
    }
    userBtn.textContent = uiText(lang, "wordingChoice.chooseVersion", "");
    suggestionBtn.textContent = uiText(lang, "wordingChoice.chooseVersion", "");
  } else {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "none";
    (suggestionListEl as HTMLElement).style.display = "none";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    userBtn.textContent = userText || uiText(lang, "wordingChoice.useInputFallback", "");
    suggestionBtn.textContent = suggestionText || suggestionLabel;
  }
  userBtn.disabled = getIsLoading();
  suggestionBtn.disabled = getIsLoading();
  (wrap as HTMLElement).style.display = "flex";
  return enabled;
}

export function render(overrideToolOutput?: unknown): void {
  const data = toolData(overrideToolOutput);

  if (data && Object.keys(data).length) setLastToolOutput(data);

  const resolved = resolveWidgetPayload(data);
  const result = resolved.result;
  const state = (result?.state as Record<string, unknown>) || {};
  const errorObj = result?.error as { type?: string; user_message?: string; retry_after_ms?: number } | null;
  const transientError = errorObj && (errorObj.type === "rate_limited" || errorObj.type === "timeout");
  const uiPayload =
    result?.ui && typeof result.ui === "object"
      ? (result.ui as Record<string, unknown>)
      : {};
  const uiFlags =
    uiPayload && typeof uiPayload.flags === "object" && uiPayload.flags
      ? (uiPayload.flags as Record<string, unknown>)
      : {};
  const uiI18n =
    uiPayload && typeof uiPayload.i18n === "object" && uiPayload.i18n
      ? (uiPayload.i18n as Record<string, unknown>)
      : {};
  void uiI18n;

  const overrideStrings =
    (state?.ui_strings && typeof state.ui_strings === "object" ? state.ui_strings : null);
  const overrideLang = String((state?.ui_strings_lang || "") as string)
    .trim()
    .toLowerCase();
  const localeCandidate = resolved.resolved_language ||
    String((state?.language || "") as string).trim().toLowerCase();
  const lang = overrideLang || localeCandidate || "en";

  const latestRoot = (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__;
  const latestState = latestRoot?.state && typeof latestRoot.state === "object"
    ? (latestRoot.state as Record<string, unknown>)
    : {};
  const stateForLatest = Object.keys(state).length > 0 ? state : latestState;
  (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ = {
    state: stateForLatest,
    lang,
  };

  const uiView =
    uiPayload && typeof uiPayload.view === "object" && uiPayload.view
      ? (uiPayload.view as Record<string, unknown>)
      : {};
  const uiStringsStatus = String((state?.ui_strings_status || "")).trim().toLowerCase();
  const viewMode = String(uiView.mode || "").trim().toLowerCase();
  const uiGateReason = String((state?.ui_gate_reason || "")).trim().toLowerCase();
  const serverExplicitWaiting = viewMode === "waiting_locale";
  const serverExplicitPrestart = viewMode === "prestart";
  const serverExplicitInteractive = viewMode === "interactive";
  const serverExplicitRecovery = viewMode === "recovery";
  const serverExplicitBlocked = viewMode === "blocked";
  const serverExplicitFailed = viewMode === "failed";
  const hasExplicitServerRouting =
    serverExplicitWaiting ||
    serverExplicitPrestart ||
    serverExplicitInteractive ||
    serverExplicitRecovery ||
    serverExplicitBlocked ||
    serverExplicitFailed;
  const bootstrapWaitingLocale = serverExplicitWaiting;
  const waitingGateActive = bootstrapWaitingLocale;
  const overrideStringsMap = overrideStrings as Record<string, string> | null;
  const hasOverrideStrings = Boolean(overrideStringsMap) && Object.keys(overrideStringsMap || {}).length > 0;
  setRuntimeUiStrings(hasOverrideStrings ? overrideStringsMap : {});
  if (!hasExplicitServerRouting) {
    const inputWrap = document.getElementById("inputWrap");
    const btnStart = document.getElementById("btnStart");
    const startHint = document.getElementById("startHint");
    const choiceWrap = document.getElementById("choiceWrap");
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    const sectionTitleEl = document.getElementById("sectionTitle");
    const uiSubtitle = document.getElementById("uiSubtitle");
    const badge = document.getElementById("badge");
    if (inputWrap) (inputWrap as HTMLElement).style.display = "none";
    if (choiceWrap) (choiceWrap as HTMLElement).style.display = "none";
    if (wordingChoiceWrap) (wordingChoiceWrap as HTMLElement).style.display = "none";
    if (btnStart) (btnStart as HTMLElement).style.display = "none";
    if (startHint) {
      startHint.textContent = "";
      (startHint as HTMLElement).style.display = "none";
    }
    if (prompt) prompt.textContent = "";
    if (sectionTitleEl) sectionTitleEl.textContent = "";
    if (uiSubtitle) uiSubtitle.textContent = "";
    if (badge) {
      badge.textContent = "";
      (badge as HTMLElement).style.display = "none";
    }
    buildStepper(0, "", lang);
    if (cardDesc) {
      const prestartEl = cardDesc as HTMLElement;
      prestartEl.classList.remove("has-grid");
      prestartEl.classList.remove("is-step0-ask-layout");
      renderBootstrapWaitShell(prestartEl, lang);
    }
    if (getIsLoading()) setLoading(false);
    return;
  }

  if (transientError) {
    if (errorObj.type === "rate_limited") {
      setInlineNotice(
        errorObj.user_message ||
          uiText(lang, "transient.rate_limited", "")
      );
      lockRateLimit(errorObj.retry_after_ms ?? 1500);
    } else {
      setInlineNotice(
        errorObj.user_message ||
          uiText(lang, "transient.timeout", "")
      );
    }
    if (result?.ok === false) return;
  } else {
    clearInlineNotice();
  }

  const showPreStart =
    serverExplicitPrestart &&
    !waitingGateActive &&
    !serverExplicitBlocked &&
    !serverExplicitFailed &&
    !serverExplicitRecovery;

  const current =
    !showPreStart ? (state.current_step as string) || "step_0" : "step_0";
  const idx = stepIndex(current);
  const stepTitle = bootstrapWaitingLocale
    ? ""
    : current === "step_0"
      ? uiText(lang, "stepLabel.validation", "")
      : extractStepTitle(current, lang);
  buildStepper(idx, stepTitle, lang);

  const badge = document.getElementById("badge");
  if (badge) badge.textContent = String(idx + 1).padStart(2, "0");

  const inputWrap = document.getElementById("inputWrap");
  const btnStart = document.getElementById("btnStart");
  const startHint = document.getElementById("startHint");
  if (!inputWrap || !btnStart || !startHint) return;
  const isLoading = getIsLoading();

  if (
    waitingGateActive ||
    serverExplicitBlocked ||
    serverExplicitFailed ||
    serverExplicitRecovery
  ) {
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    const uiSubtitle = document.getElementById("uiSubtitle");
    if (badge) {
      badge.textContent = "";
      (badge as HTMLElement).style.display = "none";
    }
    const waitingSectionTitle = document.getElementById("sectionTitle");
    if (waitingSectionTitle) waitingSectionTitle.textContent = "";
    if (cardDesc) {
      const prestartEl = cardDesc as HTMLElement;
      prestartEl.classList.remove("has-grid");
      prestartEl.classList.remove("is-step0-ask-layout");
      if (serverExplicitBlocked || serverExplicitFailed) {
        const errorMessage =
          String((result?.error as Record<string, unknown> | undefined)?.message || "").trim() ||
          String((result?.error as Record<string, unknown> | undefined)?.user_message || "").trim();
        const blockedCopy = blockedMessageForReason(lang, uiGateReason, errorMessage);
        renderBlockedState(prestartEl, lang, blockedCopy.title, blockedCopy.body);
      } else if (serverExplicitRecovery) {
        renderHydrationRecovery(prestartEl, lang);
        const retryBtn = document.getElementById("btnHydrationRetry") as HTMLButtonElement | null;
        if (retryBtn) {
          retryBtn.disabled = getIsLoading();
          retryBtn.onclick = () => {
            if (getIsLoading()) return;
            setLoading(true);
            resetHydrationRetryCycle({ trigger_poll: true, source: "render_retry_button" });
          };
        }
      } else {
        renderBootstrapWaitShell(prestartEl, lang);
      }
    }
    if (prompt) prompt.textContent = "";
    if (uiSubtitle) uiSubtitle.textContent = "";
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    (btnStart as HTMLElement).style.display = "none";
    setSessionStarted(false);
    setSessionWelcomeShown(false);
    if (isLoading) setLoading(false);
    return;
  }

  setStaticStrings(lang);

  const specialist = (result?.specialist as Record<string, unknown>) || {};
  const sectionTitleEl = document.getElementById("sectionTitle");
  const showStepIntroChrome = uiFlags.show_step_intro_chrome === true;
  const showBadge = showPreStart || showStepIntroChrome;
  if (badge) {
    (badge as HTMLElement).style.display = showBadge ? "block" : "none";
  }

  if (sectionTitleEl) {
    if (showPreStart && current === "step_0") {
      sectionTitleEl.textContent = uiText(lang, "sectionTitle.step_0", "");
    } else if (!showPreStart && current !== "step_0" && showStepIntroChrome) {
      const businessName = String((state?.business_name || "")).trim();
      sectionTitleEl.textContent = getSectionTitle(lang, current, businessName);
    } else {
      sectionTitleEl.textContent = "";
    }
  }

  const activeSpecialist = String(state?.active_specialist || "");
  const dreamRuntimeMode = (() => {
    const raw = String((state as Record<string, unknown> | undefined)?.__dream_runtime_mode || "").trim();
    if (raw === "builder_collect" || raw === "builder_scoring" || raw === "builder_refine") return raw;
    return "self";
  })();
  const isDreamExplainerMode = current === "dream" && dreamRuntimeMode !== "self";
  const lastSpecialist = (state?.last_specialist_result as Record<string, unknown>) || {};
  const isDreamStepPreExercise = false;

  if (showPreStart) {
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
    (btnStart as HTMLElement).style.display = "inline-flex";
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    if (cardDesc) {
      const prestartEl = cardDesc as HTMLElement;
      const hasPrestartContent = hasPrestartContentForLang(lang);
      const showSkeleton = uiStringsStatus !== "ready" || !hasPrestartContent;
      prestartEl.classList.remove("has-grid");
      prestartEl.classList.remove("is-step0-ask-layout");
      if (showSkeleton) renderPrestartSkeleton(prestartEl, lang);
      else renderPrestartContent(prestartEl, lang);
    }
    if (prompt) prompt.textContent = "";
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    if (isLoading) setLoading(false);
    return;
  }

  inputWrap.style.display = "none";
  inputWrap.classList.toggle("is-step0-ask-layout", current === "step_0");
  (btnStart as HTMLElement).style.display = "none";
  startHint.textContent = "";
  (startHint as HTMLElement).style.display = "none";

  const isDreamDirectionView =
    current === "dream" && String(state.dream_awaiting_direction || "").trim() === "true";

  const bodyRaw = ((): string => {
    if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "text")) {
      return typeof result.text === "string" ? result.text : "";
    }
    if (result?.specialist && typeof result.specialist === "object") {
      const sp = result.specialist as Record<string, unknown>;
      return (
        String(sp.message || "").trim() ||
        String(sp.refined_formulation || "").trim() ||
        String(sp.question || "").trim() ||
        ""
      );
    }
    return "";
  })();
  const uiViewVariant = String((uiView.variant || "")).trim();
  const hasExplicitViewVariant = uiViewVariant.length > 0;
  const isViewModeWordingChoice = uiViewVariant === "wording_choice";
  const isViewModeDreamBuilderCollect = uiViewVariant === "dream_builder_collect";
  const isViewModeDreamBuilderRefine = uiViewVariant === "dream_builder_refine";
  const isViewModeDreamBuilderScoring = uiViewVariant === "dream_builder_scoring";
  const uiQuestionText = String(uiPayload.questionText || "").trim();
  const structuredActions = Array.isArray(uiPayload.actions)
    ? (uiPayload.actions as Array<Record<string, unknown>>)
    : [];
  const hasStructuredActions = structuredActions.length > 0;
  const promptRaw = (
    (result?.prompt && typeof result.prompt === "string" ? result.prompt : "") ||
    (uiPayload.prompt && typeof (uiPayload.prompt as Record<string, unknown>).body === "string"
      ? String((uiPayload.prompt as Record<string, unknown>).body || "")
      : "")
  ) as string;
  const promptSource = uiQuestionText || promptRaw;
  let body: string;
  if (isDreamDirectionView && promptSource) {
    body = promptSource;
  } else {
    body = bodyRaw || "";
  }
  const cardDescEl = document.getElementById("cardDesc");

  const hasBodyContent = stripInlineText(String(body || "")).trim().length > 0;
  const hasPromptContent = stripInlineText(String(promptSource || "")).trim().length > 0;
  const hasRenderableInteractiveContent = hasBodyContent || hasPromptContent || hasStructuredActions;
  if (!hasRenderableInteractiveContent) {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
    if (cardDescEl) {
      cardDescEl.classList.remove("has-grid");
      cardDescEl.classList.remove("is-step0-ask-layout");
      renderBootstrapWaitShell(cardDescEl, lang);
    }
    const prompt = document.getElementById("prompt");
    if (prompt) prompt.textContent = "";
    inputWrap.style.display = "none";
    setSendEnabled(false);
    if (isLoading) setLoading(false);
    return;
  }

  if (cardDescEl) {
    cardDescEl.style.display = "block";
    cardDescEl.classList.add("has-grid");
    const isStep0AskLayout = current === "step_0";
    cardDescEl.classList.toggle("is-step0-ask-layout", isStep0AskLayout);
    renderStructuredText(cardDescEl, body || "");
    cardDescEl.classList.remove("is-ben-profile");
  }

  const previewWrap = document.getElementById("presentationPreview");
  const previewImg = document.getElementById("presentationThumb") as HTMLImageElement;
  const previewLink = document.getElementById("presentationThumbLink") as HTMLAnchorElement;
  const previewDownload = document.getElementById("presentationDownload") as HTMLAnchorElement;
  const presentationAssets = result?.presentation_assets as { png_url?: string; pdf_url?: string } | null;
  if (previewWrap && previewImg && previewLink && previewDownload) {
    if (presentationAssets?.png_url && presentationAssets?.pdf_url) {
      previewWrap.classList.add("visible");
      previewImg.src = String(presentationAssets.png_url);
      previewLink.href = String(presentationAssets.pdf_url);
      previewDownload.href = String(presentationAssets.pdf_url);
    } else {
      previewWrap.classList.remove("visible");
      previewImg.removeAttribute("src");
      previewLink.removeAttribute("href");
      previewDownload.removeAttribute("href");
    }
  }

  const purposeInstructionHintEl = document.getElementById("purposeInstructionHint");
  if (purposeInstructionHintEl) {
    const showPurposeHint =
      current === "purpose" &&
      (uiFlags.showPurposeHint as boolean) === true;
    if (showPurposeHint) {
      purposeInstructionHintEl.style.display = "block";
      purposeInstructionHintEl.textContent = uiText(
        lang,
        "purposeInstructionHint",
        ""
      );
    } else {
      purposeInstructionHintEl.style.display = "none";
    }
  }

  const statementsPanelEl = document.getElementById("statementsPanel");
  const statementsTitleEl = document.getElementById("statementsTitle");
  const statementsCountEl = document.getElementById("statementsCount");
  const statementsListEl = document.getElementById("statementsList");
  const specialistStatements = (result?.specialist as Record<string, unknown>)?.statements;
  let statementsArray = Array.isArray(specialistStatements) ? (specialistStatements as string[]) : [];
  const lastStatements = Array.isArray((lastSpecialist as { statements?: unknown[] }).statements)
    ? (lastSpecialist as { statements: unknown[] }).statements
    : [];
  if (
    current === "dream" &&
    isDreamExplainerMode &&
    (!statementsArray || statementsArray.length === 0)
  ) {
    if (lastStatements.length > 0) {
      statementsArray = lastStatements as string[];
    } else if (
      Array.isArray(state.dream_builder_statements) &&
      (state.dream_builder_statements as unknown[]).length > 0
    ) {
      statementsArray = state.dream_builder_statements as string[];
    }
  }

  const isScoringView =
    current === "dream" &&
    (
      isViewModeDreamBuilderScoring ||
      (
        isDreamExplainerMode &&
        String(specialist.scoring_phase || "") === "true" &&
        Array.isArray(specialist.clusters) &&
        (specialist.clusters as unknown[]).length > 0 &&
        Array.isArray(statementsArray) &&
        statementsArray.length >= 20
      )
    );

  if (isScoringView) {
    const clusters = specialist.clusters as Array<{ statement_indices: number[]; theme?: string }>;
    if (cardDescEl) cardDescEl.style.display = "none";
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
    const hideBtns = ["btnGoToNextStep", "btnStartDreamExercise"];
    for (const id of hideBtns) {
      const el = document.getElementById(id);
      if (el) (el as HTMLElement).style.display = "none";
    }
    const showPrompt = document.getElementById("prompt");
    if (showPrompt) {
      showPrompt.textContent = t(lang, "scoringDreamQuestion");
      showPrompt.style.display = "none";
    }
    inputWrap.style.display = "none";
    const btnSelfDream = document.getElementById("btnSwitchToSelfDream");
    if (btnSelfDream) {
      (btnSelfDream as HTMLElement).style.display = "inline-flex";
      btnSelfDream.textContent = t(lang, "btnSwitchToSelfDream");
    }

    const scoringPanelEl = document.getElementById("scoringPanel");
    if (scoringPanelEl) {
      scoringPanelEl.classList.add("visible");
      scoringPanelEl.style.display = "block";
    }
    const scoringIntro = document.getElementById("scoringIntro");
    if (scoringIntro) {
      const introLines = [t(lang, "scoringIntro1"), t(lang, "scoringIntro2"), t(lang, "scoringIntro3")]
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      scoringIntro.textContent = introLines.join("\n");
    }

    const win = globalThis as unknown as { __dreamScoringScores?: unknown[][] };
    if (!win.__dreamScoringScores) win.__dreamScoringScores = [];
    const scoringScores = win.__dreamScoringScores;
    for (let ci = 0; ci < clusters.length; ci++) {
      if (!scoringScores[ci]) scoringScores[ci] = [];
      const indices = clusters[ci].statement_indices || [];
      for (let si = 0; si < indices.length; si++) {
        if (scoringScores[ci][si] === undefined) scoringScores[ci][si] = "";
      }
      scoringScores[ci].length = indices.length;
    }
    scoringScores.length = clusters.length;

    const scoringClustersEl = document.getElementById("scoringClusters");
    if (!scoringClustersEl) return;
    scoringClustersEl.innerHTML = "";
    for (let cii = 0; cii < clusters.length; cii++) {
      const cluster = clusters[cii];
      const indices = cluster.statement_indices || [];
      const themeName = String(cluster.theme || "").trim() ||
        uiText(lang, "scoring.categoryFallback", "").replace("{0}", String(cii + 1));
      const clusterDiv = document.createElement("div");
      clusterDiv.className = "scoringCluster";
      clusterDiv.setAttribute("data-cluster-index", String(cii));
      let filled = 0,
        sum = 0;
      for (let si = 0; si < indices.length; si++) {
        const v = scoringScores[cii][si];
        const n = Number(v);
        if (v !== "" && v !== undefined && !isNaN(n) && n >= 1 && n <= 10) {
          filled++;
          sum += n;
        }
      }
      const avgText = filled === 0 ? uiText(lang, "scoring.avg.empty", "") : (sum / filled).toFixed(1);
      const showStats = filled > 0;
      const avgHtml = showStats
        ? '<span class="avgScore">' + t(lang, "scoringAvg").replace("X", avgText) + "</span>"
        : "";
      clusterDiv.innerHTML =
        '<div class="scoringClusterHeader"><span class="themeName">' +
        escapeHtml(themeName) +
        "</span>" +
        avgHtml +
        '</div><div class="scoringClusterRows"></div>';
      const rowsEl = clusterDiv.querySelector(".scoringClusterRows");
      for (let si = 0; si < indices.length; si++) {
        const stIdx = indices[si];
        const numIdx = typeof stIdx !== "number" ? parseInt(String(stIdx), 10) : stIdx;
        if (isNaN(numIdx) || numIdx < 0 || !statementsArray || numIdx >= statementsArray.length)
          continue;
        const stText = statementsArray[numIdx];
        const row = document.createElement("div");
        row.className = "scoringRow";
        const stSpan = document.createElement("span");
        stSpan.className = "statementText";
        stSpan.textContent = stText;
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.className = "scoreInput";
        input.setAttribute("data-cluster", String(cii));
        input.setAttribute("data-statement", String(si));
        const rawVal = scoringScores[cii][si];
        const numVal = rawVal !== "" && rawVal !== undefined ? Number(rawVal) : NaN;
        input.value =
          !isNaN(numVal) && numVal >= 1 && numVal <= 10 ? String(Math.round(numVal)) : "";
        input.placeholder = uiText(lang, "scoring.input.placeholder", "");
        input.setAttribute("aria-label", uiText(lang, "scoring.aria.scoreInput", ""));
        row.appendChild(stSpan);
        row.appendChild(input);
        if (rowsEl) rowsEl.appendChild(row);
      }
      scoringClustersEl.appendChild(clusterDiv);
    }

    function updateScoringClusterHeader(ci: number): void {
      const clusterDiv = document.querySelector(
        '.scoringCluster[data-cluster-index="' + ci + '"]'
      );
      if (!clusterDiv) return;
      const indices = clusters[ci].statement_indices || [];
      let filled = 0,
        sum = 0;
      for (let si = 0; si < indices.length; si++) {
        const v = scoringScores[ci][si];
        const n = Number(v);
        if (v !== "" && v !== undefined && !isNaN(n) && n >= 1 && n <= 10) {
          filled++;
          sum += n;
        }
      }
      const avgText = filled === 0 ? uiText(lang, "scoring.avg.empty", "") : (sum / filled).toFixed(1);
      const themeName = String(clusters[ci].theme || "").trim() ||
        uiText(lang, "scoring.categoryFallback", "").replace("{0}", String(ci + 1));
      const showStats = filled > 0;
      const avgHtml = showStats
        ? '<span class="avgScore">' + t(lang, "scoringAvg").replace("X", avgText) + "</span>"
        : "";
      const headerEl = clusterDiv.querySelector(".scoringClusterHeader");
      if (headerEl)
        headerEl.innerHTML =
          '<span class="themeName">' + escapeHtml(themeName) + "</span>" + avgHtml;
    }

    function allScoringFilled(): boolean {
      for (let ci = 0; ci < clusters.length; ci++) {
        for (let si = 0; si < (scoringScores[ci] || []).length; si++) {
          const v = scoringScores[ci][si];
          const n = Number(v);
          if (v === "" || v === undefined || isNaN(n) || n < 1 || n > 10) return false;
        }
      }
      return true;
    }

    function updateScoringDreamQuestionVisibility(): void {
      const filled = allScoringFilled();
      const promptEl = document.getElementById("prompt");
      if (promptEl) promptEl.style.display = filled ? "block" : "none";
      if (inputWrap) inputWrap.style.display = filled ? "flex" : "none";
    }

    updateScoringDreamQuestionVisibility();

    scoringClustersEl.querySelectorAll(".scoreInput").forEach((input) => {
      input.addEventListener("input", () => {
        const ci = parseInt((input as HTMLElement).getAttribute("data-cluster") || "0", 10);
        const si = parseInt((input as HTMLElement).getAttribute("data-statement") || "0", 10);
        let val = (input as HTMLInputElement).value.trim();
        const n = Number(val);
        if (val !== "" && (isNaN(n) || n < 1 || n > 10)) {
          (input as HTMLInputElement).value = "";
          val = "";
        } else if (val !== "" && n >= 1 && n <= 10) {
          (input as HTMLInputElement).value = String(Math.round(n));
          val = (input as HTMLInputElement).value;
        }
        scoringScores[ci][si] = val;
        updateScoringClusterHeader(ci);
        const btnScoringContinue = document.getElementById("btnScoringContinue");
        if (btnScoringContinue)
          (btnScoringContinue as HTMLButtonElement).disabled = !allScoringFilled();
        updateScoringDreamQuestionVisibility();
      });
    });

    const btnScoringContinueEl = document.getElementById("btnScoringContinue");
    if (btnScoringContinueEl) {
      btnScoringContinueEl.textContent = t(lang, "btnScoringContinue");
      (btnScoringContinueEl as HTMLButtonElement).disabled = !allScoringFilled();
      btnScoringContinueEl.onclick = () => {
        if (!allScoringFilled() || getIsLoading()) return;
        const payload: number[][] = [];
        for (let ci = 0; ci < clusters.length; ci++) {
          const row: number[] = [];
          for (let si = 0; si < (scoringScores[ci] || []).length; si++) {
            const v = Number(scoringScores[ci][si]);
            row.push(isNaN(v) ? 0 : Math.max(1, Math.min(10, v)));
          }
          payload.push(row);
        }
        const actionCode = String((state as Record<string, unknown>).ui_action_text_submit || "").trim();
        if (!actionCode) return;
        win.__dreamScoringScores = [];
        callRunStep(actionCode, { __pending_scores: payload });
      };
    }

    (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ =
      { state, lang };

    if (isLoading) setLoading(false);
    return;
  }

  const scoringPanelPost = document.getElementById("scoringPanel");
  if (scoringPanelPost) {
    scoringPanelPost.classList.remove("visible");
    scoringPanelPost.style.display = "none";
  }
  if (cardDescEl) cardDescEl.style.display = "block";
  const promptPost = document.getElementById("prompt");
  if (promptPost) promptPost.style.display = "block";

  if (isViewModeWordingChoice) {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  } else if (isDreamDirectionView) {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  } else if (
    current === "dream" &&
    (isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine || (!hasExplicitViewVariant && isDreamExplainerMode)) &&
    Array.isArray(statementsArray) &&
    statementsArray.length > 0 &&
    statementsArray.length < 20
  ) {
    if (statementsPanelEl) statementsPanelEl.style.display = "block";
    if (statementsTitleEl)
      statementsTitleEl.textContent = t(lang, "dreamBuilder.statements.title");
    if (statementsCountEl)
      statementsCountEl.textContent = t(lang, "dreamBuilder.statements.count").replace(
        "N",
        String(statementsArray.length)
      );
    if (statementsListEl) {
      statementsListEl.innerHTML = "";
      const ordered = document.createElement("ol");
      ordered.className = "statementsListOrdered";
      for (let i = 0; i < statementsArray.length; i += 1) {
        const statementText = String(statementsArray[i] || "")
          .replace(/^\s*\d+[\.\)]\s*/, "")
          .trim();
        const li = document.createElement("li");
        li.className = "statementsListItem";

        const num = document.createElement("span");
        num.className = "statementsListNum";
        num.textContent = `${i + 1}.`;

        const text = document.createElement("span");
        text.className = "statementsListText";
        text.textContent = statementText;

        li.appendChild(num);
        li.appendChild(text);
        ordered.appendChild(li);
      }
      statementsListEl.appendChild(ordered);
    }
  } else {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  }

  let choicesArr: Choice[] = [];
  let promptText = isDreamDirectionView ? "" : promptSource;
  if (hasStructuredActions) {
    promptText = isDreamDirectionView ? "" : stripStructuredChoiceLines(promptSource);
  } else {
    choicesArr = [];
    promptText = isDreamDirectionView ? "" : promptSource;
  }

  let requireWordingPick = false;
  const suppressWordingChoice = isViewModeDreamBuilderScoring;
  if (!suppressWordingChoice) {
    requireWordingPick = renderWordingChoicePanel(result, lang);
  } else {
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
  }

  const promptEl = document.getElementById("prompt");
  if (promptEl) {
    const hasPromptText = String(promptText || "").trim().length > 0;
    const hasBodyText = stripInlineText(String(body || "")).trim().length > 0;
    const showPromptDivider = hasPromptText && hasBodyText;
    promptEl.classList.toggle("with-divider", showPromptDivider);
    promptEl.classList.toggle("choice-pending", requireWordingPick);
    renderInlineText(promptEl, promptText || "");
  }
  if (requireWordingPick) {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) {
      choiceWrap.innerHTML = "";
      choiceWrap.style.display = "none";
    }
  } else {
    renderChoiceButtons(choicesArr, result);
  }

  const renderedChoiceButtons = (() => {
    const choiceWrap = document.getElementById("choiceWrap");
    if (!choiceWrap) return false;
    return choiceWrap.childNodes.length > 0;
  })();
  const choiceMode =
    !requireWordingPick && (renderedChoiceButtons || hasStructuredActions);

  const textSubmitActionCode = String((state as Record<string, unknown>).ui_action_text_submit || "").trim();
  const textSubmitAvailable = textSubmitActionCode.length > 0;
  inputWrap.style.display = choiceMode || !textSubmitAvailable ? "none" : "flex";
  if (!textSubmitAvailable) setSendEnabled(false);
  const sde = document.getElementById("btnStartDreamExercise");
  const sb = document.getElementById("btnSwitchToSelfDream");

  if (choiceMode) {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "flex";
    if (sde) (sde as HTMLElement).style.display = "none";
    if (sb) (sb as HTMLElement).style.display = "none";
  } else {
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    if (sde) (sde as HTMLElement).style.display = "none";
    if (sb) (sb as HTMLElement).style.display = "none";
  }

  const btnGoToNextStepEl = document.getElementById("btnGoToNextStep");
  if (btnGoToNextStepEl) {
    (btnGoToNextStepEl as HTMLElement).style.display = "none";
    (btnGoToNextStepEl as HTMLButtonElement).disabled = getIsLoading();
  }

  const isDreamConfirm = false;
  const btnDreamConfirmEl = document.getElementById("btnDreamConfirm");
  if (btnDreamConfirmEl) {
    (btnDreamConfirmEl as HTMLElement).style.display =
      isDreamConfirm && !getIsLoading() ? "inline-flex" : "none";
    (btnDreamConfirmEl as HTMLButtonElement).disabled = getIsLoading();
  }

  const debugMode = /\bdebug=1\b/.test(String(typeof window !== "undefined" ? window.location.search : ""));
  const debugEl = document.getElementById("debugOverlay");
  if (debugEl) {
    if (debugMode) {
      const debugPayload = {
        current_step: current,
        active_specialist: activeSpecialist,
        "specialist.action": String(specialist.action || ""),
        promptRaw200: (promptRaw || "").slice(0, 200),
              choicesLength: choicesArr.length,
              choiceLabels: choicesArr.map((c) => c.label),
        isDreamStepPreExercise,
        isDreamExplainerMode,
        isLoading: getIsLoading(),
      };
      debugEl.textContent = JSON.stringify(debugPayload, null, 2);
      debugEl.classList.add("visible");
      debugEl.setAttribute("aria-hidden", "false");
    } else {
      debugEl.textContent = "";
      debugEl.classList.remove("visible");
      debugEl.setAttribute("aria-hidden", "true");
    }
  }

  const btnGoToNextStepEl2 = document.getElementById("btnGoToNextStep");
  if (btnGoToNextStepEl2) btnGoToNextStepEl2.textContent = t(lang, "btnGoToNextStep");
  const btnStartDreamExerciseEl = document.getElementById("btnStartDreamExercise");
  if (btnStartDreamExerciseEl) {
    btnStartDreamExerciseEl.textContent = t(lang, "dreamBuilder.startExercise");
    (btnStartDreamExerciseEl as HTMLButtonElement).disabled = getIsLoading();
  }
  const btnSwitchToSelfDreamEl = document.getElementById("btnSwitchToSelfDream");
  if (btnSwitchToSelfDreamEl) {
    btnSwitchToSelfDreamEl.textContent = t(lang, "btnSwitchToSelfDream");
    (btnSwitchToSelfDreamEl as HTMLButtonElement).disabled = getIsLoading();
  }
  const btnDreamConfirmEl2 = document.getElementById("btnDreamConfirm");
  if (btnDreamConfirmEl2) {
    btnDreamConfirmEl2.textContent = t(lang, "btnDreamConfirm");
    (btnDreamConfirmEl2 as HTMLButtonElement).disabled = getIsLoading();
  }

  const input = document.getElementById("input");
  if (input) (input as HTMLInputElement).placeholder = t(lang, "inputPlaceholder");

  const inputVal = ((document.getElementById("input") as HTMLInputElement)?.value || "").trim();
  setSendEnabled(inputVal.length > 0);

  (globalThis as { __BSC_LATEST__?: { state: Record<string, unknown>; lang: string } }).__BSC_LATEST__ =
    { state, lang };

  if (getIsLoading()) setLoading(false);
}
