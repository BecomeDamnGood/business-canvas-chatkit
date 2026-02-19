/**
 * Main card rendering, choice buttons, stepper, formatText, error views.
 */

import {
  STRATEGY_STEP_ID,
  ORDER,
  UI_STRINGS,
  baseLang,
  t,
  titlesForLang,
  prestartWelcomeForLang,
  getSectionTitle,
} from "./ui_constants.js";
import { escapeHtml, renderInlineText, stripInlineText } from "./ui_text.js";
import { extractChoicesFromPrompt, type Choice } from "./ui_choices.js";
import {
  callRunStep,
  setLoading,
  setSendEnabled,
  setInlineNotice,
  clearInlineNotice,
  lockRateLimit,
  toolData,
  setLastToolOutput,
  widgetState,
  setWidgetStateSafe,
  languageFromState,
  uiLang,
  hasToolOutput,
} from "./ui_actions.js";
import { getIsLoading, getSessionStarted, getSessionWelcomeShown, setSessionWelcomeShown } from "./ui_state.js";

function stepIndex(stepId: string): number {
  const idx = ORDER.indexOf(stepId);
  return idx >= 0 ? idx : 0;
}

export function extractStepTitle(stepId: string, lang: string | null | undefined): string {
  const titles = titlesForLang(lang);
  const fullTitle = titles[stepId] || "";
  return fullTitle.replace(/^Step \d+: /, "").replace(/^Stap \d+: /, "");
}

export function buildStepper(activeIdx: number, stepTitle: string | null | undefined): void {
  const el = document.getElementById("stepper");
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i < ORDER.length; i++) {
    const s = document.createElement("div");
    let className = "step";
    if (i < activeIdx) className += " completed";
    if (i === activeIdx) className += " active";
    s.className = className;
    s.style.position = "relative";
    if (i === activeIdx && stepTitle) {
      const title = document.createElement("div");
      title.className = "stepperTitle";
      title.id = "stepperTitle";
      title.textContent = stepTitle;
      if (i === 0) title.classList.add("align-left");
      if (i === ORDER.length - 1) title.classList.add("align-right");
      s.appendChild(title);
    }
    s.appendChild(document.createTextNode(String(i + 1).padStart(2, "0")));
    el.appendChild(s);
    if (i < ORDER.length - 1) {
      const line = document.createElement("div");
      line.className = "stepLine";
      el.appendChild(line);
    }
  }
}

export function formatText(text: string | null | undefined): string {
  if (!text) return "";
  const htmlTagPlaceholders: string[] = [];
  let placeholderIndex = 0;
  let temp = text.replace(/<[^>]+>/g, (match) => {
    htmlTagPlaceholders[placeholderIndex] = match;
    return `__HTML_TAG_${placeholderIndex++}__`;
  });
  temp = temp.replace(/\n\n+/g, "<br><br>");
  temp = temp.replace(/\n/g, "<br>");
  temp = temp.replace(/__HTML_TAG_(\d+)__/g, (_match, index) => {
    return htmlTagPlaceholders[parseInt(index, 10)] || "";
  });
  temp = temp.replace(/<\/li>\s*<br>\s*<li>/gi, "</li><li>");
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  temp = temp.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return temp;
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
  const lines = String(promptRaw || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return "";
  const chooserNoise = [
    /^(please\s+)?(choose|pick|select)\s+\d+(?:\s*(?:,|\/|or|and)\s*\d+)*\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+an?\s+option(\s+below)?\.?$/i,
    /^(please\s+)?(choose|pick|select)\s+one\s+of\s+the\s+options(\s+below)?\.?$/i,
    /^choose\s+an?\s+option\s+by\s+typing\s+.+$/i,
  ];
  const kept: string[] = [];
  for (const line of lines) {
    const normalized = String(line || "").trim();
    if (/^\s*[1-9][\)\.]\s+/.test(normalized)) continue;
    if (chooserNoise.some((pattern) => pattern.test(normalized))) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function setStaticStrings(lang: string): void {
  const uiSubtitle = document.getElementById("uiSubtitle");
  const byText = document.getElementById("byText");
  const btnStart = document.getElementById("btnStart");
  const send = document.getElementById("send");
  if (uiSubtitle) uiSubtitle.textContent = t(lang, "uiSubtitle");
  if (byText) byText.textContent = t(lang, "byText");
  if (btnStart) btnStart.textContent = t(lang, "btnStart");
  if (send) send.setAttribute("title", t(lang, "sendTitle"));
}

export function renderChoiceButtons(choices: Choice[] | null | undefined, resultData: Record<string, unknown>): void {
  const wrap = document.getElementById("choiceWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const specialist = (resultData?.specialist as Record<string, unknown>) || {};
  const menuId = String(specialist?.menu_id || "").trim();
  const state = (resultData?.state as Record<string, unknown>) || {};
  const currentStep = String(state?.current_step || "").trim();
  const uiPayload =
    resultData && typeof resultData.ui === "object" && resultData.ui
      ? (resultData.ui as Record<string, unknown>)
      : {};
  const structuredActions = Array.isArray(uiPayload.actions)
    ? (uiPayload.actions as Array<Record<string, unknown>>)
    : [];
  const choicesArr = Array.isArray(choices) ? choices : [];
  const registryVersion = String(resultData?.registry_version || "").trim();
  const registryActionCodes = Array.isArray(uiPayload.action_codes) ? uiPayload.action_codes : [];
  const expectedChoiceCount =
    typeof uiPayload.expected_choice_count === "number"
      ? uiPayload.expected_choice_count
      : registryActionCodes.length;
  const labelsCount = choicesArr.length;
  const lang = uiLang(state);

  function showOptionsError(): void {
    if (!wrap) return;
    wrap.style.display = "flex";
    wrap.innerHTML = "";
    const err = document.createElement("div");
    err.className = "choiceError";
    err.textContent = t(lang, "optionsDisplayError");
    wrap.appendChild(err);
  }

  const choicesCopy = [...choicesArr];

  if (structuredActions.length > 0) {
    const isLoading = getIsLoading();
    const langForStructured = uiLang(state);
    wrap.style.display = "flex";
    for (const action of structuredActions) {
      const label = stripInlineText(String(action?.label || "")).trim();
      const actionCode = String(action?.action_code || "").trim();
      if (!label || !actionCode) {
        console.warn("[structured_actions_invalid]", {
          registry_version: registryVersion,
          menu_id: menuId,
          current_step: currentStep,
        });
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "choiceBtn";
      btn.type = "button";
      btn.textContent = label;
      btn.disabled = isLoading;
      btn.addEventListener("click", () => {
        if (getIsLoading()) return;
        if (registryVersion && menuId) {
          console.log("[actioncode_click]", {
            registryVersion,
            menuId,
            currentStep,
            action_code: actionCode,
            source: "structured_actions",
          });
        }
        callRunStep(actionCode);
      });
      wrap.appendChild(btn);
    }
    if (wrap.childNodes.length === 0) {
      wrap.style.display = "none";
      setInlineNotice(t(langForStructured, "optionsDisplayError"));
    }
    return;
  }

  if (choicesArr.length === 0) {
    if (menuId || registryActionCodes.length > 0) {
      console.warn("[actioncodes_labels_missing]", {
        registry_version: registryVersion,
        menu_id: menuId,
        current_step: currentStep,
        labels_count: labelsCount,
        expected_choice_count: expectedChoiceCount,
      });
      showOptionsError();
      return;
    }
    wrap.style.display = "none";
    return;
  }

  if (!menuId) {
    console.warn("[menu_contract_missing]", {
      registry_version: registryVersion,
      current_step: currentStep,
      labels_count: labelsCount,
    });
    showOptionsError();
    return;
  }

  if (!registryActionCodes.length) {
      console.warn("[actioncodes_missing]", {
        registry_version: registryVersion,
        menu_id: menuId,
        current_step: currentStep,
        labels_count: labelsCount,
    });
    showOptionsError();
    return;
  }

  const expectedCount =
    typeof expectedChoiceCount === "number" ? expectedChoiceCount : registryActionCodes.length;
  if (expectedCount !== labelsCount) {
    console.warn("[actioncodes_count_mismatch]", {
      registry_version: registryVersion,
      menu_id: menuId,
      current_step: currentStep,
      labels_count: labelsCount,
      expected_choice_count: expectedCount,
    });
    showOptionsError();
    return;
  }

  for (const c of choicesCopy) {
    const label = stripInlineText(String(c.label || "")).trim();
    if (!label) {
      console.error("Empty choice label", { menuId, currentStep, choiceIndex: c.value });
      showOptionsError();
      return;
    }
  }

  if (registryVersion && menuId) {
    console.log("[actioncode_render]", { registryVersion, menuId, currentStep });
  }

  wrap.style.display = "flex";
  const isLoading = getIsLoading();
  let renderIndex = 0;
  for (const c of choicesCopy) {
    const label = stripInlineText(String(c.label || "")).trim();
    const actionCode = registryActionCodes[renderIndex];
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = isLoading;
    btn.addEventListener("click", () => {
      if (getIsLoading()) return;
      if (registryVersion && menuId) {
        console.log("[actioncode_click]", {
          registryVersion,
          menuId,
          currentStep,
          action_code: actionCode,
        });
      }
      callRunStep(actionCode);
    });
    wrap.appendChild(btn);
    renderIndex += 1;
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

  headingEl.textContent = "";
  (headingEl as HTMLElement).style.display = "none";
  instructionEl.textContent = instruction;
  userTextEl.textContent = userLabel || "This is your input:";
  suggestionTextEl.textContent = suggestionLabel || "This would be my suggestion:";

  if (mode === "list") {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "block";
    (suggestionListEl as HTMLElement).style.display = "block";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    for (const item of userItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = String(item || "");
      userListEl.appendChild(li);
    }
    for (const item of suggestionItems as unknown[]) {
      const li = document.createElement("li");
      li.textContent = String(item || "");
      suggestionListEl.appendChild(li);
    }
    userBtn.textContent = "Choose this version";
    suggestionBtn.textContent = "Choose this version";
  } else {
    (userTextEl as HTMLElement).style.display = "block";
    (suggestionTextEl as HTMLElement).style.display = "block";
    (userListEl as HTMLElement).style.display = "none";
    (suggestionListEl as HTMLElement).style.display = "none";
    userListEl.innerHTML = "";
    suggestionListEl.innerHTML = "";
    userBtn.textContent = userText || "Use this input";
    suggestionBtn.textContent = suggestionText || suggestionLabel;
  }
  userBtn.disabled = getIsLoading();
  suggestionBtn.disabled = getIsLoading();
  (wrap as HTMLElement).style.display = "flex";
  return requirePick;
}

export function render(overrideToolOutput?: unknown): void {
  const data = toolData(overrideToolOutput);

  if (data && Object.keys(data).length) setLastToolOutput(data);

  const result =
    (data && data.result)
      ? (data.result as Record<string, unknown>)
      : (data && data.ui && (data.ui as Record<string, unknown>).result)
        ? ((data.ui as Record<string, unknown>).result as Record<string, unknown>)
        : (data && data.ui)
          ? (data.ui as Record<string, unknown>)
          : {};

  const state = (result?.state as Record<string, unknown>) || {};
  const errorObj = result?.error as { type?: string; user_message?: string; retry_after_ms?: number } | null;
  const transientError =
    errorObj &&
    (errorObj.type === "rate_limited" || errorObj.type === "timeout");
  if (transientError) {
    if (errorObj.type === "rate_limited") {
      setInlineNotice(errorObj.user_message || "Please wait a moment and try again.");
      lockRateLimit(errorObj.retry_after_ms ?? 1500);
    } else {
      setInlineNotice(errorObj.user_message || "This is taking longer than usual. Please try again.");
    }
    if (result?.ok === false) return;
  } else {
    clearInlineNotice();
  }

  const overrideStrings =
    (state?.ui_strings && typeof state.ui_strings === "object" ? state.ui_strings : null) ||
    (result?.ui_strings && typeof result.ui_strings === "object" ? result.ui_strings : null);
  const overrideLang = String((state?.ui_strings_lang || "") as string).trim().toLowerCase();
  const lang = uiLang(state);
  if (overrideStrings) {
    const bucket = overrideLang || baseLang(lang);
    UI_STRINGS[bucket] = { ...UI_STRINGS.default, ...(overrideStrings as Record<string, string>) };
  }
  setStaticStrings(lang);

  const ws = widgetState();
  const langPersist = languageFromState(state);
  if (
    langPersist &&
    (!ws.language ||
      String(ws.language).toLowerCase().trim() !== String(langPersist).toLowerCase().trim())
  ) {
    setWidgetStateSafe({ language: langPersist });
  }

  const hasToolOutputVal = hasToolOutput();
  const persistedStarted = String((ws?.started || "")).toLowerCase() === "true";
  const sessionStarted = getSessionStarted();
  const showPreStart = !sessionStarted;

  const current =
    !showPreStart && hasToolOutputVal ? (state.current_step as string) || "step_0" : "step_0";
  const idx = stepIndex(current);
  const stepTitle = extractStepTitle(current, lang);
  buildStepper(idx, stepTitle);

  const badge = document.getElementById("badge");
  if (badge) badge.textContent = String(idx + 1);

  const inputWrap = document.getElementById("inputWrap");
  const btnStart = document.getElementById("btnStart");
  const startHint = document.getElementById("startHint");
  if (!inputWrap || !btnStart || !startHint) return;

  const specialist = (result?.specialist as Record<string, unknown>) || {};
  const sectionTitleEl = document.getElementById("sectionTitle");

  if (sectionTitleEl) {
    if (!showPreStart && current !== "step_0") {
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
  const isLoading = getIsLoading();

  if (showPreStart) {
    inputWrap.style.display = "none";
    const choiceWrap = document.getElementById("choiceWrap");
    if (choiceWrap) choiceWrap.style.display = "none";
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
    (btnStart as HTMLElement).style.display = "inline-flex";
    const cardDesc = document.getElementById("cardDesc");
    const prompt = document.getElementById("prompt");
    if (cardDesc) cardDesc.innerHTML = formatText(prestartWelcomeForLang(lang));
    if (prompt) prompt.textContent = "";
    startHint.textContent = "";
    (startHint as HTMLElement).style.display = "none";
    if (isLoading) setLoading(false);
    return;
  }

  inputWrap.style.display = "flex";
  (btnStart as HTMLElement).style.display = "none";
  startHint.textContent = "";
  (startHint as HTMLElement).style.display = "none";

  const isDreamDirectionView =
    current === "dream" && String(state.dream_awaiting_direction || "").trim() === "true";

  const bodyRaw = ((): string => {
    let raw = (result?.text && typeof result.text === "string" ? result.text : "") as string;
    if (!raw && result?.specialist && typeof result.specialist === "object") {
      const sp = result.specialist as Record<string, unknown>;
      raw =
        String(sp.message || "").trim() ||
        String(sp.refined_formulation || "").trim() ||
        String(sp.question || "").trim() ||
        "";
    }
    return raw;
  })();
  const uiPayload =
    result?.ui && typeof result.ui === "object"
      ? (result.ui as Record<string, unknown>)
      : {};
  const uiViewMode = String(uiPayload.view_mode || "").trim();
  const hasExplicitViewMode = uiViewMode.length > 0;
  const isViewModeWordingChoice = uiViewMode === "wording_choice";
  const isViewModeDreamBuilderCollect = uiViewMode === "dream_builder_collect";
  const isViewModeDreamBuilderRefine = uiViewMode === "dream_builder_refine";
  const isViewModeDreamBuilderScoring = uiViewMode === "dream_builder_scoring";
  const uiQuestionText = String(uiPayload.questionText || "").trim();
  const structuredActions = Array.isArray(uiPayload.actions)
    ? (uiPayload.actions as Array<Record<string, unknown>>)
    : [];
  const hasStructuredActions = structuredActions.length > 0;
  const promptRaw = (result?.prompt && typeof result.prompt === "string" ? result.prompt : "") as string;
  const promptSource = uiQuestionText || promptRaw;
  const bodyRawDedupe = dedupeBodyAgainstPrompt(bodyRaw, promptSource);

  let body: string;
  const sessionWelcomeShown = getSessionWelcomeShown();
  if (isDreamDirectionView && promptSource) {
    body = promptSource;
  } else if (!sessionWelcomeShown) {
    body = `${prestartWelcomeForLang(lang)}\n\n${bodyRawDedupe || ""}`.trim();
    setSessionWelcomeShown(true);
  } else {
    body = bodyRawDedupe || "";
  }

  const cardDescEl = document.getElementById("cardDesc");
  if (cardDescEl) {
    cardDescEl.style.display = "block";
    renderInlineText(cardDescEl, body || "");
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
    const uiFlags =
      result?.ui && typeof result.ui === "object" && (result.ui as Record<string, unknown>).flags
        ? ((result.ui as Record<string, unknown>).flags as Record<string, unknown>)
        : {};
    const menuId = String((result?.specialist as Record<string, unknown>)?.menu_id || "").trim();
    const purposeHintAllowedMenus = new Set(["PURPOSE_MENU_EXPLAIN", "PURPOSE_MENU_EXAMPLES"]);
    const showPurposeHint =
      current === "purpose" &&
      (uiFlags.showPurposeHint as boolean) === true &&
      purposeHintAllowedMenus.has(menuId);
    if (showPurposeHint) {
      purposeInstructionHintEl.style.display = "block";
      purposeInstructionHintEl.textContent =
        t(lang, "purposeInstructionHint") || "Answer the question, formulate your own Purpose, or choose an option";
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
      scoringIntro.textContent =
        t(lang, "scoringIntro1") + "\n\n" + t(lang, "scoringIntro2") + "\n\n" + t(lang, "scoringIntro3");
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
      const themeName = String(cluster.theme || "").trim() || "Category " + (cii + 1);
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
      const avgText = filled === 0 ? "—" : (sum / filled).toFixed(1);
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
        input.placeholder = "0";
        input.setAttribute("aria-label", "Score 1 to 10");
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
      const avgText = filled === 0 ? "—" : (sum / filled).toFixed(1);
      const themeName = String(clusters[ci].theme || "").trim() || "Category " + (ci + 1);
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
        win.__dreamScoringScores = [];
        callRunStep(JSON.stringify({ action: "submit_scores", scores: payload }));
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

  if (isDreamDirectionView) {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  } else if (
    current === "dream" &&
    (isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine || (!hasExplicitViewMode && isDreamExplainerMode)) &&
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
    if (statementsListEl)
      statementsListEl.textContent = statementsArray
        .map((s, i) => (i + 1) + ". " + String(s))
        .join("\n");
  } else {
    if (statementsPanelEl) statementsPanelEl.style.display = "none";
  }

  let choicesArr: Choice[] = [];
  let promptText = isDreamDirectionView ? "" : promptSource;
  if (hasStructuredActions) {
    promptText = isDreamDirectionView ? "" : stripStructuredChoiceLines(promptSource);
  } else {
    const parsed = extractChoicesFromPrompt(promptSource);
    choicesArr = Array.isArray(parsed.choices) ? parsed.choices : [];
    promptText = isDreamDirectionView ? "" : parsed.promptShown;
  }
  let requireWordingPick = false;
  const suppressWordingChoice =
    (hasExplicitViewMode && !isViewModeWordingChoice) ||
    (current === "dream" && isDreamExplainerMode && !isViewModeWordingChoice);
  if (!suppressWordingChoice) {
    requireWordingPick = renderWordingChoicePanel(result, lang);
  } else {
    const wordingChoiceWrap = document.getElementById("wordingChoiceWrap");
    if (wordingChoiceWrap) wordingChoiceWrap.style.display = "none";
  }

  const promptEl = document.getElementById("prompt");
  if (promptEl) renderInlineText(promptEl, promptText || "");
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
    !requireWordingPick && (renderedChoiceButtons || hasStructuredActions || choicesArr.length > 0);
  let statementCount =
    (Array.isArray(statementsArray) ? statementsArray.length : 0) || 0;
  if (
    current === "dream" &&
    isDreamExplainerMode &&
    statementCount < 20 &&
    lastStatements.length >= 20
  ) {
    statementCount = lastStatements.length;
  }
  const effectiveStatementsForButton =
    (Array.isArray(statementsArray) ? statementsArray.length : 0) ||
    (Array.isArray((specialist as { statements?: unknown[] }).statements)
      ? (specialist as { statements: unknown[] }).statements.length
      : 0) ||
    0;
  const inDreamBuilderView = hasExplicitViewMode
    ? (isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine || isViewModeDreamBuilderScoring)
    : isDreamExplainerMode;
  const showGoToNextStep =
    current === "dream" &&
    inDreamBuilderView &&
    effectiveStatementsForButton >= 20 &&
    !isViewModeDreamBuilderScoring &&
    !requireWordingPick;

  inputWrap.style.display = "flex";
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
    if (sde) {
      (sde as HTMLElement).style.display = isDreamStepPreExercise ? "inline-flex" : "none";
    }
    if (sb) {
      const showSwitchByMode = hasExplicitViewMode
        ? (isViewModeDreamBuilderCollect || isViewModeDreamBuilderRefine)
        : isDreamExplainerMode;
      (sb as HTMLElement).style.display =
        showSwitchByMode
          ? "inline-flex"
          : "none";
    }
  }

  const btnGoToNextStepEl = document.getElementById("btnGoToNextStep");
  if (btnGoToNextStepEl) {
    (btnGoToNextStepEl as HTMLElement).style.display =
      showGoToNextStep && !getIsLoading() ? "inline-flex" : "none";
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
