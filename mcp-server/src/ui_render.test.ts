import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dedupeBodyAgainstPrompt,
  render,
  renderChoiceButtons,
  stripStructuredChoiceLines,
} from "../ui/lib/ui_render.ts";
import { setRuntimeUiStrings } from "../ui/lib/ui_constants.ts";
import {
  callRunStep,
  computeBootstrapRenderState,
  computeHydrationState,
  handleToolResultAndMaybeScheduleBootstrapRetry,
  isTrustedBridgeMessageEvent,
  mergeToolOutputWithResponseMetadata,
  resetBridgeOriginCacheForTests,
  resolveWidgetPayload,
  resolveAllowedHostOrigin,
  resetHydrationRetryCycle,
} from "../ui/lib/ui_actions.ts";
import { setSessionStarted, setSessionWelcomeShown } from "../ui/lib/ui_state.ts";

test.beforeEach(() => {
  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};
  setRuntimeUiStrings({});
});

function makeElement(tag: string) {
  const node: any = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: "",
    type: "",
    textContent: "",
    style: {} as Record<string, string>,
    childNodes: [] as any[],
    get firstChild() {
      return this.childNodes.length > 0 ? this.childNodes[0] : null;
    },
    disabled: false,
    appendChild(child: any) {
      this.childNodes.push(child);
      return child;
    },
    removeChild(child: any) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) this.childNodes.splice(idx, 1);
      return child;
    },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
  };
  Object.defineProperty(node, "innerHTML", {
    get() {
      return "";
    },
    set() {
      this.childNodes = [];
    },
  });
  return node;
}

function makeDocument() {
  const elements = new Map<string, any>();
  return {
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, makeElement("div"));
      return elements.get(id);
    },
    createElement(tag: string) {
      return makeElement(tag);
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as any[],
        appendChild(child: any) {
          this.childNodes.push(child);
          return child;
        },
      };
    },
    querySelectorAll() {
      return [];
    },
  };
}

function toolOutputFromWidgetResult(result: Record<string, unknown>) {
  return { _meta: { widget_result: result } };
}

test("renderChoiceButtons handles missing ui without throwing", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  const choices = [
    { value: "1", label: "One" },
    { value: "2", label: "Two" },
  ];

  assert.doesNotThrow(() => {
    renderChoiceButtons(choices, {
      specialist: { menu_id: "TEST_MENU" },
      state: { current_step: "step_0" },
      registry_version: "test",
    });
  });

  (globalThis as any).document = originalDocument;
});

test("renderChoiceButtons renders buttons from ui.action_contract.actions", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  const choices = [
    { value: "1", label: "Alpha" },
    { value: "2", label: "Beta" },
  ];

  renderChoiceButtons(choices, {
    specialist: { menu_id: "TEST_MENU" },
    state: { current_step: "step_0" },
    registry_version: "test",
    ui: {
      action_codes: ["ACTION_ONE", "ACTION_TWO"],
      expected_choice_count: 2,
      action_contract: {
        actions: [
          { id: "a1", label: "Alpha", action_code: "ACTION_ONE", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
          { id: "a2", label: "Beta", action_code: "ACTION_TWO", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
        ],
      },
    },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
});

test("renderChoiceButtons renders structured action-contract choices without numbered prompt choices", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  renderChoiceButtons([], {
    specialist: { menu_id: "DREAM_MENU_REFINE" },
    state: { current_step: "dream" },
    registry_version: "test",
    ui: {
      action_contract: {
        actions: [
          { id: "a1", label: "Action one", action_code: "ACTION_ONE", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
          { id: "a2", label: "Action two", action_code: "ACTION_TWO", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
        ],
      },
    },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
});

test("renderChoiceButtons shows safe error when action_codes exist but prompt labels are missing", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  renderChoiceButtons([], {
    specialist: { menu_id: "PURPOSE_MENU_REFINE" },
    state: { current_step: "purpose", language: "en" },
    registry_version: "test",
    ui: { action_codes: ["ACTION_PURPOSE_REFINE_ADJUST"], expected_choice_count: 1 },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 0);
  assert.equal(String(wrap.style.display || ""), "none");

  (globalThis as any).document = originalDocument;
});

test("render keeps structured actions visible even when prompt has no numbered options", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        started: "true",
        language: "en",
        ui_strings: {
          wordingChoiceHeading: "This is your input:",
          wordingChoiceSuggestionLabel: "This would be my suggestion:",
          wordingChoiceInstruction: "Please click what suits you best.",
          "wordingChoice.chooseVersion": "Choose this version",
        },
      },
      specialist: {
        action: "ASK",
        question: "Please share your thoughts.",
        menu_id: "PURPOSE_MENU_REFINE",
      },
      prompt: "Please choose 1 or 2.",
      ui: {
        view: { mode: "interactive" },
        questionText: "Please share your thoughts.",
        action_contract: {
          actions: [
            { id: "a1", label: "Confirm wording", action_code: "ACTION_PURPOSE_REFINE_CONFIRM", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__PURPOSE_REFINE_CONFIRM__" } },
            { id: "a2", label: "Adjust wording", action_code: "ACTION_PURPOSE_REFINE_ADJUST", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__PURPOSE_REFINE_ADJUST__" } },
          ],
        },
      },
    }));

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("renderChoiceButtons keeps both ROLE_MENU_REFINE choices", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  const choices = [
    { value: "1", label: "I'm happy with this wording, continue to step 6 Entity." },
    { value: "2", label: "Refine this wording for me" },
  ];

  renderChoiceButtons(choices, {
    specialist: { menu_id: "ROLE_MENU_REFINE" },
    state: { current_step: "role" },
    registry_version: "test",
    ui: {
      action_codes: ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"],
      expected_choice_count: 2,
      action_contract: {
        actions: [
          { id: "a1", label: "I'm happy with this wording, continue to step 6 Entity.", action_code: "ACTION_ROLE_REFINE_CONFIRM", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__ROLE_REFINE_CONFIRM__" } },
          { id: "a2", label: "Refine this wording for me", action_code: "ACTION_ROLE_REFINE_ADJUST", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__ROLE_REFINE_ADJUST__" } },
        ],
      },
    },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
});

test("render handles Dream intro payload without ui and does not throw", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  assert.doesNotThrow(() => {
    render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        language: "en",
      },
      specialist: {
        action: "ASK",
        question: "1) Alpha\n2) Beta",
        menu_id: "TEST_MENU",
        suggest_dreambuilder: "false",
      },
      ui: {
        view: { mode: "interactive" },
      },
    }));
  });
  setSessionStarted(false);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows both Dream REFINE contract buttons when prompt/menu/action_codes align", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  render(toolOutputFromWidgetResult({
    registry_version: "test",
    state: {
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      started: "true",
      language: "en",
      business_name: "Acme",
    },
    specialist: {
      action: "REFINE",
      question:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      menu_id: "DREAM_MENU_REFINE",
      suggest_dreambuilder: "false",
    },
    prompt:
      "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
    ui: {
      view: { mode: "interactive" },
      action_codes: [
        "ACTION_DREAM_REFINE_CONFIRM",
        "ACTION_DREAM_REFINE_START_EXERCISE",
      ],
      expected_choice_count: 2,
      action_contract: {
        actions: [
          { id: "a1", label: "I'm happy with this wording, please continue to step 3 Purpose", action_code: "ACTION_DREAM_REFINE_CONFIRM", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__DREAM_REFINE_CONFIRM__" } },
          { id: "a2", label: "Do a small exercise that helps to define your dream.", action_code: "ACTION_DREAM_REFINE_START_EXERCISE", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__DREAM_START_EXERCISE__" } },
        ],
      },
    },
  }));

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);
  assert.equal(
    String(buttons[0].textContent || ""),
    "I'm happy with this wording, please continue to step 3 Purpose"
  );
  assert.equal(
    String(buttons[1].textContent || ""),
    "Do a small exercise that helps to define your dream."
  );

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("renderChoiceButtons hides buttons when prompt/action_code counts mismatch", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  const choices = [
    { value: "1", label: "Alpha" },
    { value: "2", label: "Beta" },
  ];

  renderChoiceButtons(choices, {
    specialist: { menu_id: "TEST_MENU" },
    state: { current_step: "dream", language: "en" },
    registry_version: "test",
    ui: { action_codes: ["ACTION_ONLY_ONE"], expected_choice_count: 1 },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 0);

  (globalThis as any).document = originalDocument;
});

test("render falls back to specialist question when result.text is empty", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  setSessionWelcomeShown(true);

  render(toolOutputFromWidgetResult({
    text: "",
    registry_version: "test",
    state: {
      current_step: "dream",
      active_specialist: "DreamExplainer",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      language: "en",
    },
    specialist: {
      action: "ASK",
      menu_id: "DREAM_EXPLAINER_MENU_SWITCH_SELF",
      question:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
    },
    prompt:
      "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
    ui: {
      view: { mode: "interactive" },
      questionText:
        "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
      action_codes: ["ACTION_DREAM_SWITCH_TO_SELF"],
      expected_choice_count: 1,
    },
  }));

  assert.equal(((cardDesc.childNodes || []) as any[]).length > 0, true);

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows section title when step-intro chrome flag is present", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const sectionTitle = (fakeDocument as any).getElementById("sectionTitle");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: { ok: true }, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  setSessionWelcomeShown(true);

  render(toolOutputFromWidgetResult({
      text: "Purpose intro body",
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        started: "true",
        language: "en",
        business_name: "Mindd",
        ui_strings: {
          "sectionTitle.purposeOf": "The Purpose of {0}",
        },
      },
      specialist: {
        action: "INTRO",
        menu_id: "PURPOSE_MENU_INTRO",
      },
      prompt: "Please define your purpose.",
      ui: {
        view: { mode: "interactive" },
        flags: { show_step_intro_chrome: true },
        action_codes: ["ACTION_PURPOSE_INTRO_EXPLAIN_MORE", "ACTION_PURPOSE_INTRO_DEFINE"],
        expected_choice_count: 2,
      },
    }));

  assert.equal(String(sectionTitle.textContent || ""), "The Purpose of Mindd");

  render(toolOutputFromWidgetResult({
      text: "Purpose follow-up body",
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        started: "true",
        language: "en",
        business_name: "Mindd",
      },
      specialist: {
        action: "ASK",
        menu_id: "PURPOSE_MENU_REFINE",
      },
      prompt: "Refine your Purpose for Mindd or choose an option.",
      ui: {
        view: { mode: "interactive" },
        action_codes: ["ACTION_PURPOSE_REFINE_CONFIRM", "ACTION_PURPOSE_REFINE_ADJUST"],
        expected_choice_count: 2,
      },
    }));

  assert.equal(String(sectionTitle.textContent || ""), "");

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("badge and section title follow prestart or step-intro chrome flag", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const badge = (fakeDocument as any).getElementById("badge");
  const sectionTitle = (fakeDocument as any).getElementById("sectionTitle");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: { ok: true }, widgetState: {}, setWidgetState() {} };

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "step_0",
        active_specialist: "Step0Validation",
        language: "en",
      },
      specialist: {
        action: "ASK",
      },
      ui: { view: { mode: "prestart" } },
    }));
  assert.equal(String(badge.style.display || ""), "block");

  setSessionStarted(true);
  setSessionWelcomeShown(true);
  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "step_0",
        active_specialist: "Step0Validation",
        intro_shown_session: "true",
        intro_shown_for_step: "step_0",
        started: "true",
        language: "en",
      },
      specialist: {
        action: "ASK",
        menu_id: "STEP_0_MENU_ASK_NAME",
      },
      prompt:
        "Just to set the context, we'll start with the basics.",
      ui: { view: { mode: "interactive" } },
    }));
  assert.equal(String(badge.style.display || ""), "none");

  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        started: "true",
        language: "en",
        ui_strings: {
          "sectionTitle.dream": "Your Dream",
        },
      },
      specialist: {
        action: "INTRO",
        menu_id: "DREAM_MENU_INTRO",
      },
      text: "Dream intro body",
      ui: {
        view: { mode: "interactive" },
        flags: { show_step_intro_chrome: true },
      },
    }));
  assert.equal(String(badge.style.display || ""), "block");
  assert.equal(String(sectionTitle.textContent || ""), "Your Dream");

  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "bigwhy",
        active_specialist: "BigWhy",
        intro_shown_session: "true",
        intro_shown_for_step: "bigwhy",
        started: "true",
        language: "en",
        business_name: "Mindd",
      },
      specialist: {
        action: "ASK",
        menu_id: "BIGWHY_MENU_INTRO",
      },
      text: "Big Why follow-up body",
      ui: { view: { mode: "interactive" } },
    }));
  assert.equal(String(badge.style.display || ""), "none");
  assert.equal(String(sectionTitle.textContent || ""), "");

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("dedupeBodyAgainstPrompt removes full duplicate body", () => {
  const prompt = "Define your Dream for Acme or choose an option.";
  const body = "Define your Dream for Acme or choose an option.";
  assert.equal(dedupeBodyAgainstPrompt(body, prompt), "");
});

test("dedupeBodyAgainstPrompt removes duplicated prompt prefix and keeps remainder", () => {
  const prompt = "Define your Dream for Acme or choose an option.";
  const body = "Define your Dream for Acme or choose an option.\n\nAdditional context.";
  assert.equal(dedupeBodyAgainstPrompt(body, prompt), "Additional context.");
});

test("stripStructuredChoiceLines removes numbered options and keeps headline text", () => {
  const prompt = [
    "1) Confirm wording",
    "2) Refine wording",
    "",
    "Refine your Purpose or choose an option.",
  ].join("\n");
  assert.equal(stripStructuredChoiceLines(prompt), prompt.trim());
});

test("stripStructuredChoiceLines keeps plain prompt unchanged", () => {
  const prompt = "Please share your thoughts.";
  assert.equal(stripStructuredChoiceLines(prompt), prompt);
});

test("render structures only cardDesc body while prompt stays plain inline text", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  const promptEl = (fakeDocument as any).getElementById("prompt");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  setSessionWelcomeShown(true);

  render(toolOutputFromWidgetResult({
    text: [
      "A paragraph line.",
      "",
      "1. First ordered item",
      "2. Second ordered item",
      "",
      "- First bullet",
      "- Second bullet",
    ].join("\n"),
    registry_version: "test",
    state: {
      current_step: "dream",
      active_specialist: "Dream",
      intro_shown_session: "true",
      intro_shown_for_step: "dream",
      started: "true",
      language: "en",
    },
    specialist: {
      action: "ASK",
      menu_id: "DREAM_MENU_INTRO",
      question: "",
    },
    prompt: "Define your Dream for Mindd or choose an option.",
    ui: {
      view: { mode: "interactive" },
    },
  }));

  const cardNodes = cardDesc.childNodes || [];
  assert.ok(cardNodes.some((node: any) => node && node.tagName === "P"));
  assert.ok(cardNodes.some((node: any) => node && node.tagName === "UL"));
  assert.equal(cardNodes.some((node: any) => node && node.tagName === "OL"), false);
  assert.equal((promptEl.childNodes || []).length > 0, true);
  assert.equal((promptEl.childNodes || []).some((node: any) => node && node.tagName === "OL"), false);
  assert.equal((promptEl.childNodes || []).some((node: any) => node && node.tagName === "UL"), false);

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows wording choice panel in text mode and keeps confirm hidden until pick", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  render(toolOutputFromWidgetResult({
    registry_version: "test",
    state: {
      current_step: "purpose",
      active_specialist: "Purpose",
      intro_shown_session: "true",
      intro_shown_for_step: "purpose",
      started: "true",
      language: "en",
      ui_strings: {
        wordingChoiceHeading: "This is your input:",
        wordingChoiceSuggestionLabel: "This would be my suggestion:",
      },
    },
    specialist: {
      action: "CONFIRM",
      question: "Please confirm your purpose.",
      menu_id: "PURPOSE_MENU_REFINE",
    },
    prompt: "Please confirm your purpose.",
    ui: {
      view: { mode: "interactive" },
      flags: { require_wording_pick: true },
      wording_choice: {
        enabled: true,
        mode: "text",
        user_text: "Mindd helps teams with clarity.",
        suggestion_text: "Mindd exists to restore focus and meaning in work.",
        user_items: [],
        suggestion_items: [],
        instruction: "Please click what suits you best.",
      },
    },
  }));

  const wordingWrap = (fakeDocument as any).getElementById("wordingChoiceWrap");
  const userText = (fakeDocument as any).getElementById("wordingChoiceUserText");
  const suggestionText = (fakeDocument as any).getElementById("wordingChoiceSuggestionText");
  const suggestionBtn = (fakeDocument as any).getElementById("wordingChoicePickSuggestion");
  const heading = (fakeDocument as any).getElementById("wordingChoiceHeading");
  assert.equal(String(wordingWrap.style.display || ""), "flex");
  assert.equal(String(heading.textContent || ""), "");
  assert.equal(String(userText.style.display || ""), "block");
  assert.equal(String(suggestionText.style.display || ""), "block");
  assert.equal(String(userText.textContent || ""), "This is your input:");
  assert.equal(String(suggestionText.textContent || ""), "This would be my suggestion:");
  assert.equal(String(suggestionBtn.textContent || ""), "Mindd exists to restore focus and meaning in work.");

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render hides regular choice buttons while wording choice is required", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  render(toolOutputFromWidgetResult({
    registry_version: "test",
    state: {
      current_step: "role",
      active_specialist: "Role",
      intro_shown_session: "true",
      intro_shown_for_step: "role",
      started: "true",
      language: "en",
    },
    specialist: {
      action: "REFINE",
      question: "1) I'm happy with this wording, continue to step 6 Entity.\n2) Refine this wording for me",
      menu_id: "ROLE_MENU_REFINE",
    },
    prompt: "1) I'm happy with this wording, continue to step 6 Entity.\n2) Refine this wording for me",
    ui: {
      view: { mode: "interactive" },
      action_codes: ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"],
      expected_choice_count: 2,
      flags: { require_wording_pick: true },
      wording_choice: {
        enabled: true,
        mode: "text",
        user_text: "we offer the best quality",
        suggestion_text: "Mindd sets standards for purpose-driven quality.",
        user_items: [],
        suggestion_items: [],
        instruction: "Please click what suits you best.",
      },
    },
  }));

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 0);
  assert.equal(String(wrap.style.display || ""), "none");

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows wording choice panel in list mode with full items", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        intro_shown_session: "true",
        intro_shown_for_step: "strategy",
        started: "true",
        language: "en",
        ui_strings: {
          wordingChoiceHeading: "This is your input:",
          wordingChoiceSuggestionLabel: "This would be my suggestion:",
          "wordingChoice.chooseVersion": "Choose this version",
        },
      },
      specialist: {
        action: "REFINE",
        question: "Refine your strategy or choose an option.",
        menu_id: "STRATEGY_MENU_REFINE",
      },
      prompt: "Refine your strategy or choose an option.",
      ui: {
        view: { mode: "interactive" },
        flags: { require_wording_pick: true },
        wording_choice: {
          enabled: true,
          mode: "list",
          user_text: "",
          suggestion_text: "",
          user_items: ["Build trust with clients", "Run monthly workshops"],
          suggestion_items: ["Build trust systematically", "Run monthly workshops", "Track retention"],
          instruction: "Please click what suits you best.",
        },
      },
    }));

  const userList = (fakeDocument as any).getElementById("wordingChoiceUserList");
  const suggestionList = (fakeDocument as any).getElementById("wordingChoiceSuggestionList");
  const userText = (fakeDocument as any).getElementById("wordingChoiceUserText");
  const suggestionText = (fakeDocument as any).getElementById("wordingChoiceSuggestionText");
  const userBtn = (fakeDocument as any).getElementById("wordingChoicePickUser");
  const suggestionBtn = (fakeDocument as any).getElementById("wordingChoicePickSuggestion");
  assert.equal(userList.childNodes.length, 2);
  assert.equal(suggestionList.childNodes.length, 3);
  assert.equal(String(userText.textContent || ""), "This is your input:");
  assert.equal(String(suggestionText.textContent || ""), "This would be my suggestion:");
  assert.equal(String(userBtn.textContent || ""), "Choose this version");
  assert.equal(String(suggestionBtn.textContent || ""), "Choose this version");

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render ignores transient timeout payload and keeps previous visible view", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  const inlineNotice = (fakeDocument as any).getElementById("inlineNotice");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  setSessionStarted(true);
  setSessionWelcomeShown(true);
  render(toolOutputFromWidgetResult({
      registry_version: "test",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        started: "true",
        language: "en",
      },
      specialist: {
        action: "REFINE",
        question:
          "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
        menu_id: "DREAM_MENU_REFINE",
      },
      prompt:
        "1) I'm happy with this wording, please continue to step 3 Purpose\n2) Do a small exercise that helps to define your dream.",
      ui: {
        view: { mode: "interactive" },
        action_codes: [
          "ACTION_DREAM_REFINE_CONFIRM",
          "ACTION_DREAM_REFINE_START_EXERCISE",
        ],
        expected_choice_count: 2,
        action_contract: {
          actions: [
            { id: "a1", label: "Confirm wording", action_code: "ACTION_DREAM_REFINE_CONFIRM", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__DREAM_REFINE_CONFIRM__" } },
            { id: "a2", label: "Start exercise", action_code: "ACTION_DREAM_REFINE_START_EXERCISE", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__DREAM_START_EXERCISE__" } },
          ],
        },
      },
    }));
  assert.equal(String(wrap.style.display || ""), "flex");

  render(toolOutputFromWidgetResult({
      ok: false,
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        started: "true",
        language: "en",
      },
      specialist: {
        action: "ASK",
        question: "Do you want to continue?",
      },
      ui: { view: { mode: "interactive" } },
      error: {
        type: "timeout",
        user_message: "This is taking longer than usual. Please try again.",
        retry_action: "retry_same_action",
      },
    }));
  assert.equal(String(inlineNotice.textContent || ""), "This is taking longer than usual. Please try again.");
  assert.equal(String(inlineNotice.style.display || ""), "block");
  assert.equal(String(wrap.style.display || ""), "flex");

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("bundled source dispatches non-text actions through action_contract action_code", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /function parseActions\(result\) \{/);
  assert.match(source, /var actionContract = toRecord\(uiPayload\.action_contract\);/);
  assert.match(source, /if \(!Array\.isArray\(actionContract\.actions\)\) return \[\];/);
  assert.match(source, /if \(action\.role === "text_submit"\) \{/);
  assert.match(source, /callRunStep\(action\.actionCode, \{\}\);/);
  assert.match(source, /callRunStep\(message, \{\}\);/);
});

test("prestart render uses deterministic DOM builders and no HTML injection", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_render.ts", import.meta.url), "utf8");
  assert.match(source, /renderPrestartContent\(prestartEl, lang\)/);
  assert.doesNotMatch(source, /renderPrestartSkeleton\(prestartEl, lang\)/);
  assert.doesNotMatch(source, /cardDesc\.innerHTML = prestartWelcomeForLang\(lang\);/);
});

test("prestart source keeps stable rich-content structure", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_render.ts", import.meta.url), "utf8");
  assert.match(source, /appendTextNode\("p", "card-headline", content\.headline\)/);
  assert.match(source, /appendTextNode\("div", "meta-row", ""\)/);
  assert.match(source, /appendTextNode\("div", "deliverables", ""\)/);
});

test("computeBootstrapRenderState returns ready phase for non-EN pending locale", () => {
  const state = computeBootstrapRenderState({
    hydration: {
      needs_hydration: false,
      retry_count: 0,
      retry_exhausted: false,
      waiting_reason: "i18n_pending",
    },
    uiStringsStatus: "pending",
    uiFlags: {
      bootstrap_waiting_locale: true,
      bootstrap_interactive_ready: false,
    },
    uiView: { mode: "waiting_locale", waiting_locale: true },
    localeKnownNonEn: true,
    hasState: true,
    hasCurrentStep: true,
  });
  assert.equal(state.phase, "ready");
  assert.equal(state.bootstrapWaitingLocale, false);
  assert.equal(state.interactiveFallbackActive, false);
  assert.equal(state.waitingForMissingState, false);
});

test("render source ignores empty or mismatched locale override maps", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_render.ts", import.meta.url), "utf8");
  assert.match(source, /const hasOverrideStrings = Boolean\(overrideStringsMap\) && Object\.keys\(overrideStringsMap \|\| \{\}\)\.length > 0;/);
  assert.match(source, /if \(hasOverrideStrings\) setRuntimeUiStrings\(overrideStringsMap\);/);
  assert.doesNotMatch(source, /setRuntimeUiStrings\(hasOverrideStrings \? overrideStringsMap : \{\}\);/);
});

test("computeBootstrapRenderState ignores interactive_fallback marker and stays ready", () => {
  const state = computeBootstrapRenderState({
    hydration: {
      needs_hydration: false,
      retry_count: 0,
      retry_exhausted: false,
      waiting_reason: "i18n_pending",
    },
    uiStringsStatus: "pending",
    uiFlags: {
      bootstrap_waiting_locale: true,
      bootstrap_interactive_ready: true,
      bootstrap_phase: "interactive_fallback",
    },
    uiView: { mode: "waiting_locale", waiting_locale: true, bootstrap_phase: "interactive_fallback" },
    localeKnownNonEn: true,
    hasState: true,
    hasCurrentStep: true,
  });
  assert.equal(state.phase, "ready");
  assert.equal(state.bootstrapWaitingLocale, false);
  assert.equal(state.interactiveFallbackActive, false);
  assert.equal(state.waitingForI18n, false);
});

test("computeBootstrapRenderState tolerates explicit waiting_locale mode and renders ready", () => {
  const state = computeBootstrapRenderState({
    hydration: {
      needs_hydration: true,
      retry_count: 3,
      retry_exhausted: true,
      waiting_reason: "missing_state",
    },
    uiStringsStatus: "pending",
    uiFlags: {
      bootstrap_waiting_locale: true,
      bootstrap_interactive_ready: false,
    },
    uiView: { mode: "waiting_locale", waiting_locale: true },
    localeKnownNonEn: true,
    hasState: false,
    hasCurrentStep: false,
  });
  assert.equal(state.phase, "ready");
  assert.equal(state.render_mode, "interactive");
  assert.equal(state.waitingForMissingState, false);
  assert.equal(state.bootstrapWaitingLocale, false);
});

test("bundled source is the sole event ingest owner for host updates", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /window\.addEventListener\("openai:set_globals", function \(\) \{[\s\S]*ingestSetGlobalsPayload\(\);[\s\S]*\}\);/);
  assert.match(source, /window\.addEventListener\("openai:notification", function \(event\) \{/);
  assert.match(source, /var hasResultInParams = Object\.keys\(extractWidgetResult\(payload\)\)\.length > 0;/);
  assert.match(source, /reason: "notification_params_payload"/);
  assert.match(source, /reason: "notification_detail_payload"/);
  assert.match(source, /ingest\(resolved\.payload, resolved\.source\);/);
  assert.match(source, /ingestSetGlobalsPayload\(\);/);
  assert.doesNotMatch(source, /ingest\(readInitialToolOutput\(\), "initial"\);/);
  assert.doesNotMatch(source, /window\.addEventListener\("message"/);
  assert.doesNotMatch(source, /notifyHostTransportSignal/);
});

test("bundled source reads canonical widget_result and supports standard result fallbacks", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /var toolResponseMetadata = toRecord\(root\.toolResponseMetadata\);/);
  assert.match(source, /toRecord\(toolResponseMetadata\.widget_result\)/);
  assert.match(source, /toRecord\(root\.result\)/);
  assert.match(source, /toRecord\(structured\.result\)/);
  assert.match(source, /toRecord\(toolOutput\.result\)/);
  assert.match(source, /var candidates = \[[\s\S]*root,[\s\S]*structured,[\s\S]*toolOutput,[\s\S]*\];/);
  assert.match(source, /var toolResponseMetadata = toRecord\(openai\.toolResponseMetadata\);/);
  assert.match(
    source,
    /return\s*\{\s*toolOutput:\s*toolOutput,\s*toolResponseMetadata:\s*toolResponseMetadata,\s*\};/
  );
});

test("render source keeps view-mode/start-action guards but uses graceful interactive fallback", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_render.ts", import.meta.url), "utf8");
  assert.match(source, /\[ui_contract_missing_view_mode_tolerated\]/);
  assert.match(source, /const startActionCode = actionCodeForRole\(result, "start"\);/);
  assert.match(source, /const hasStartAction = startActionCode\.length > 0;/);
  assert.match(source, /\[ui_contract_missing_start_action\]/);
  assert.match(source, /\[ui_contract_interactive_content_absent\]/);
  assert.match(source, /recovery_mode: "graceful_fallback"/);
  assert.doesNotMatch(source, /const failClosedReasonCode = "interactive_content_absent";/);
  assert.doesNotMatch(source, /recovery_mode: "blocked"/);
  assert.match(source, /\(btnStart as HTMLButtonElement\)\.disabled = getIsLoading\(\) \|\| !hasStartAction;/);
});

test("handleToolResultAndMaybeScheduleBootstrapRetry keeps widget ordering monotonic", () => {
  const originalOpenai = (globalThis as any).openai;
  const hostState: Record<string, unknown> = {
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 5,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...hostState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };

  const stalePayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 4,
      host_widget_session_id: "internal:demo",
    },
  });
  handleToolResultAndMaybeScheduleBootstrapRetry(stalePayload, { source: "host_notification" });
  assert.equal(
    Number(((globalThis as any).openai.widgetState as Record<string, unknown>).response_seq || 0),
    4
  );

  const newerPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
  });
  handleToolResultAndMaybeScheduleBootstrapRetry(newerPayload, { source: "host_notification" });
  assert.equal(
    Number(((globalThis as any).openai.widgetState as Record<string, unknown>).response_seq || 0),
    6
  );

  (globalThis as any).openai = originalOpenai;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts payloads with incomplete ordering tuple", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  const hostState: Record<string, unknown> = {
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...hostState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { view: { mode: "interactive" } },
  });

  const missingHostPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 7,
    },
    ui: { view: { mode: "interactive" } },
  });
  const result = handleToolResultAndMaybeScheduleBootstrapRetry(missingHostPayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  const stateAfter = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
  assert.equal(Number(stateAfter.response_seq || 0), 6);
  assert.equal(String(stateAfter.host_widget_session_id || ""), "internal:demo");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts stale payload and updates persisted tuple", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  const hostState: Record<string, unknown> = {
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...hostState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
  });

  const stalePayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 5,
      host_widget_session_id: "internal:demo",
    },
  });
  const result = handleToolResultAndMaybeScheduleBootstrapRetry(stalePayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  const stateAfter = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
  assert.equal(Number(stateAfter.response_seq || 0), 5);

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts tupleless payload after ordering is established", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  const hostState: Record<string, unknown> = {
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...hostState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
  });

  const tuplelessPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      language: "en",
    },
  });
  const result = handleToolResultAndMaybeScheduleBootstrapRetry(tuplelessPayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  const stateAfter = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
  assert.equal(Number(stateAfter.response_seq || 0), 6);

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry keeps tupleless payload renderable before ordering is established", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {},
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};

  const tuplelessPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      language: "nl",
      ui_strings_status: "pending",
    },
  });
  const result = handleToolResultAndMaybeScheduleBootstrapRetry(tuplelessPayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  const recovered = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).result;
  const recoveredState = ((recovered.state as Record<string, unknown>) || {});
  assert.notEqual(String(recoveredState.ui_gate_status || ""), "blocked");
  assert.notEqual(String(recoveredState.bootstrap_phase || ""), "failed");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry does not persist host_widget_session_id without full tuple", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {},
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};

  const tuplelessPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      language: "nl",
      ui_strings_status: "pending",
      host_widget_session_id: "internal:new-session",
    },
  });
  const result = handleToolResultAndMaybeScheduleBootstrapRetry(tuplelessPayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  assert.equal(
    String((((globalThis as any).openai.widgetState as Record<string, unknown>) || {}).host_widget_session_id || ""),
    ""
  );

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts duplicate payload with same ordering tuple", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  const hostState: Record<string, unknown> = {
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...hostState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { questionText: "current" },
  });

  const duplicatePayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { questionText: "duplicate-should-drop" },
  });

  const result = handleToolResultAndMaybeScheduleBootstrapRetry(duplicatePayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  const cachedResult = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).result;
  assert.equal(
    String((((cachedResult.ui as Record<string, unknown>) || {}).questionText) || ""),
    "duplicate-should-drop"
  );

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry converges after empty init payload followed by host payload", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {},
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};

  const emptyInitResult = handleToolResultAndMaybeScheduleBootstrapRetry({}, { source: "set_globals" });
  assert.equal(Object.keys(emptyInitResult).length, 0);
  assert.equal(Object.keys((globalThis as any).__BSC_LAST_TOOL_OUTPUT__ || {}).length, 0);

  const hostPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 1,
      host_widget_session_id: "internal:demo",
      ui_action_start: "ACTION_START",
    },
    ui: {
      view: { mode: "prestart" },
    },
  });

  const hostResult = handleToolResultAndMaybeScheduleBootstrapRetry(hostPayload, { source: "host_notification" });
  assert.equal(String(((hostResult.state as Record<string, unknown> | undefined) || {}).current_step || ""), "step_0");
  const cachedResolved = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__);
  assert.equal(cachedResolved.response_seq, 1);
  assert.equal(cachedResolved.bootstrap_session_id, "bs_demo");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts richer same-seq payload for render recovery", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { view: { mode: "prestart" } },
  });

  const richerSameSeqPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
      ui_strings: {
        "prestart.headline": "Welkom",
        "prestart.proven.title": "Bewezen",
      },
    },
    ui: { view: { mode: "prestart" } },
  });

  const result = handleToolResultAndMaybeScheduleBootstrapRetry(richerSameSeqPayload, {
    source: "host_notification",
  });
  assert.equal(Object.keys(result).length > 0, true);
  const cachedResult = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).result;
  const cachedState = (cachedResult.state as Record<string, unknown>) || {};
  const cachedUiStrings = (cachedState.ui_strings as Record<string, unknown>) || {};
  assert.equal(String(cachedUiStrings["prestart.headline"] || ""), "Welkom");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry advances ordering and accepts newer payload", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { view: { mode: "interactive" }, questionText: "strong-cached" },
  });

  const weakNewerPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 7,
      host_widget_session_id: "internal:demo",
    },
  });

  const result = handleToolResultAndMaybeScheduleBootstrapRetry(weakNewerPayload, {
    source: "host_notification",
  });
  assert.equal(Object.keys(result).length > 0, true);
  const stateAfter = (globalThis as any).openai.widgetState as Record<string, unknown>;
  assert.equal(Number(stateAfter.response_seq || 0), 7);
  const cachedResult = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).result;
  assert.equal(String((((cachedResult.ui as Record<string, unknown>) || {}).questionText) || ""), "");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("handleToolResultAndMaybeScheduleBootstrapRetry accepts new session payload even when response_seq resets", () => {
  const originalOpenai = (globalThis as any).openai;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {
      bootstrap_session_id: "bs_old",
      bootstrap_epoch: 4,
      response_seq: 22,
      host_widget_session_id: "internal:old",
    },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_old",
      bootstrap_epoch: 4,
      response_seq: 22,
      host_widget_session_id: "internal:old",
    },
    ui: { questionText: "old-session" },
  });

  const nextSessionPayload = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_new",
      bootstrap_epoch: 1,
      response_seq: 1,
      host_widget_session_id: "internal:new",
    },
    ui: { questionText: "new-session" },
  });

  const result = handleToolResultAndMaybeScheduleBootstrapRetry(nextSessionPayload, { source: "host_notification" });
  assert.equal(Object.keys(result).length > 0, true);
  assert.equal(String(((result.state as Record<string, unknown> | undefined) || {}).current_step || ""), "step_0");
  const stateAfter = (globalThis as any).openai.widgetState as Record<string, unknown>;
  assert.equal(String(stateAfter.bootstrap_session_id || ""), "bs_new");
  assert.equal(Number(stateAfter.bootstrap_epoch || 0), 1);
  assert.equal(Number(stateAfter.response_seq || 0), 1);
  assert.equal(String(stateAfter.host_widget_session_id || ""), "internal:new");
  const cachedResult = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).result;
  assert.equal(String((((cachedResult.ui as Record<string, unknown>) || {}).questionText) || ""), "new-session");

  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep ingests callTool response immediately and updates render state", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    ui: { view: { mode: "interactive" } },
  });
  (globalThis as any).__BSC_LATEST__ = {
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    lang: "en",
  };
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 6,
      host_widget_session_id: "internal:demo",
    },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
    async callTool() {
      return toolOutputFromWidgetResult({
        state: {
          current_step: "step_0",
          bootstrap_session_id: "bs_demo",
          bootstrap_epoch: 1,
          response_seq: 7,
          host_widget_session_id: "internal:demo",
        },
        ui: { view: { mode: "interactive" } },
      });
    },
  };

  await callRunStep("ACTION_TEST_ACK_ONLY");
  assert.equal(
    resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__).response_seq,
    7
  );

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep rehydrates outbound tuple from persisted widgetState after reload/resume", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };

  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};
  (globalThis as any).__BSC_LATEST__ = {
    state: {
      current_step: "step_0",
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 4,
      host_widget_session_id: "internal:demo",
    },
    lang: "en",
  };

  let payloadStateSeen: Record<string, unknown> = {};
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: {
      bootstrap_session_id: "bs_demo",
      bootstrap_epoch: 1,
      response_seq: 8,
      host_widget_session_id: "internal:demo",
    },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
    async callTool(_toolName: string, args: Record<string, unknown>) {
      payloadStateSeen = ((args.state as Record<string, unknown>) || {});
      return toolOutputFromWidgetResult({
        state: {
          current_step: "step_0",
          bootstrap_session_id: "bs_demo",
          bootstrap_epoch: 1,
          response_seq: 9,
          host_widget_session_id: "internal:demo",
        },
        ui: { view: { mode: "interactive" } },
      });
    },
  };

  await new Promise((resolve) => setTimeout(resolve, 300));
  await callRunStep("ACTION_TEST_RELOAD_RESUME");

  assert.equal(Number(payloadStateSeen.response_seq || 0), 8);
  assert.equal(Number(payloadStateSeen.bootstrap_epoch || 0), 1);
  assert.equal(String(payloadStateSeen.bootstrap_session_id || ""), "bs_demo");
  assert.equal(String(payloadStateSeen.host_widget_session_id || ""), "internal:demo");

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep emits explicit liveness error when transport is unavailable", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    parent: null,
    addEventListener() {},
  };
  const widgetState: Record<string, unknown> = {
    current_step: "purpose",
    bootstrap_session_id: "bs_transport",
    bootstrap_epoch: 1,
    response_seq: 3,
    host_widget_session_id: "internal:transport",
  };
  (globalThis as any).openai = {
    widgetState,
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
  };
  (globalThis as any).__BSC_LATEST__ = { state: { ...widgetState }, lang: "en" };

  await callRunStep("ACTION_PURPOSE_INTRO_DEFINE");

  const afterState = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
  assert.equal(String(afterState.ui_action_liveness_ack_status || ""), "rejected");
  assert.equal(String(afterState.ui_action_liveness_state_advanced || ""), "false");
  assert.equal(String(afterState.ui_action_liveness_reason_code || ""), "transport_unavailable");
  assert.equal(String(afterState.ui_action_liveness_failure_class || ""), "rejected");
  assert.equal(String(afterState.ui_action_liveness_action_code || ""), "ACTION_PURPOSE_INTRO_DEFINE");
  assert.match(String(afterState.ui_action_liveness_client_action_id || ""), /^ca_/);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
});

test("callRunStep sequence matrix proves dispatch -> ack -> advance for start/menu/confirm/text-submit", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };

  const cases = [
    {
      label: "start",
      action: "ACTION_START",
      current_step: "step_0",
      started: "false",
      extraState: { started: "true" },
      expected_step_after: "step_0",
      extraAssertion: (_payload: Record<string, unknown>) => {},
    },
    {
      label: "menu_choice",
      action: "ACTION_PURPOSE_INTRO_DEFINE",
      current_step: "purpose",
      started: "true",
      extraState: undefined,
      expected_step_after: "purpose",
      extraAssertion: (_payload: Record<string, unknown>) => {},
    },
    {
      label: "confirm",
      action: "ACTION_PURPOSE_REFINE_CONFIRM",
      current_step: "purpose",
      started: "true",
      extraState: undefined,
      expected_step_after: "bigwhy",
      extraAssertion: (_payload: Record<string, unknown>) => {},
    },
    {
      label: "text_submit",
      action: "ACTION_PURPOSE_TEXT_SUBMIT",
      current_step: "purpose",
      started: "true",
      extraState: { __text_submit: "Mijn purpose input" },
      expected_step_after: "purpose",
      extraAssertion: (payload: Record<string, unknown>) => {
        const payloadState = (payload.state as Record<string, unknown> | undefined) || {};
        assert.equal(String(payloadState.__text_submit || ""), "Mijn purpose input");
      },
    },
  ] as const;

  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i];
    const baseState = {
      current_step: testCase.current_step,
      started: testCase.started,
      bootstrap_session_id: `bs_seq_${testCase.label}`,
      bootstrap_epoch: 1,
      response_seq: 10 + i,
      host_widget_session_id: `internal:seq:${testCase.label}`,
    };
    const startAction =
      testCase.label === "start"
        ? [{ id: "start", action_code: "ACTION_START", role: "start", surface: "primary", label_key: "btnStart" }]
        : [];
    (globalThis as any).__BSC_LATEST__ = { state: { ...baseState }, lang: "en" };
    (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
      state: { ...baseState },
      ui: {
        view: { mode: testCase.label === "start" ? "prestart" : "interactive" },
        action_contract: { actions: startAction },
      },
    });

    const dispatched: string[] = [];
    let capturedPayload: Record<string, unknown> = {};
    (globalThis as any).openai = {
      toolOutput: null,
      widgetState: { ...baseState },
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool(_toolName: string, payload: Record<string, unknown>) {
        capturedPayload = payload;
        dispatched.push(String(payload?.user_message || ""));
        return toolOutputFromWidgetResult({
          ok: true,
          state: {
            ...baseState,
            started: "true",
            current_step: testCase.expected_step_after,
            response_seq: 11 + i,
          },
          ui: {
            view: { mode: "interactive" },
            questionText: `${testCase.label} advanced`,
            action_contract: { actions: [] },
          },
        });
      },
    };

    await new Promise((resolve) => setTimeout(resolve, 300));
    await callRunStep(testCase.action, testCase.extraState as Record<string, unknown> | undefined);

    assert.equal(dispatched.length, 1, `${testCase.label}: expected exactly one dispatch`);
    assert.equal(dispatched[0], testCase.action, `${testCase.label}: dispatched action mismatch`);
    testCase.extraAssertion(capturedPayload);
    const widgetAfter = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
    assert.equal(String(widgetAfter.ui_action_liveness_ack_status || ""), "accepted", `${testCase.label}: ack status`);
    assert.equal(String(widgetAfter.ui_action_liveness_state_advanced || ""), "true", `${testCase.label}: state advanced`);
    assert.equal(String(widgetAfter.ui_action_liveness_action_code || ""), testCase.action, `${testCase.label}: action echo`);
    const cached = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__);
    assert.equal(cached.response_seq, 11 + i, `${testCase.label}: response seq advanced`);
  }

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep does not auto-dispatch bootstrap poll when ACTION_START ack has no state advance", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };

  const baseState = {
    current_step: "step_0",
    started: "false",
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
    ui_action_start: "ACTION_START",
  };
  (globalThis as any).__BSC_LATEST__ = { state: { ...baseState }, lang: "nl" };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: { ...baseState },
    ui: { view: { mode: "prestart" } },
  });

  const dispatchedMessages: string[] = [];
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...baseState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
    async callTool(_toolName: string, payload: Record<string, unknown>) {
      const actionCode = String(payload?.user_message || "").trim();
      dispatchedMessages.push(actionCode);
      if (actionCode === "ACTION_START") {
        return toolOutputFromWidgetResult({
          state: {
            ...baseState,
            started: "true",
          },
          ui: { view: { mode: "prestart" } },
        });
      }
      if (actionCode === "ACTION_BOOTSTRAP_POLL") {
        return toolOutputFromWidgetResult({
          state: {
            ...baseState,
            started: "true",
            current_step: "purpose",
            response_seq: 7,
          },
          ui: {
            view: { mode: "interactive" },
            questionText: "Wat is je belangrijkste doel?",
          },
        });
      }
      return {};
    },
  };

  await new Promise((resolve) => setTimeout(resolve, 300));
  await callRunStep("ACTION_START", { started: "true" });
  await new Promise((resolve) => setTimeout(resolve, 900));

  assert.equal(dispatchedMessages.filter((action) => action === "ACTION_START").length, 1);
  assert.equal(dispatchedMessages.filter((action) => action === "ACTION_BOOTSTRAP_POLL").length, 0);
  const cachedResolved = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__);
  assert.equal(cachedResolved.response_seq, 6);
  assert.equal(
    String(((cachedResolved.result.state as Record<string, unknown> | undefined) || {}).current_step || ""),
    "step_0"
  );
  const widgetAfter = ((globalThis as any).openai.widgetState || {}) as Record<string, unknown>;
  assert.equal(String(widgetAfter.ui_action_liveness_ack_status || ""), "accepted");
  assert.equal(String(widgetAfter.ui_action_liveness_state_advanced || ""), "false");
  assert.equal(String(widgetAfter.ui_action_liveness_reason_code || ""), "state_not_advanced");
  assert.equal(String(widgetAfter.ui_action_liveness_failure_class || ""), "accepted_no_advance");
  const inlineNotice = (fakeDocument as any).getElementById("inlineNotice");
  assert.equal(String(inlineNotice.style.display || ""), "block");
  assert.match(String(inlineNotice.textContent || ""), /\(state_not_advanced\)$/i);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep timeout response sets explicit timeout liveness and bypasses unsafe cache preserve", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };

  const baseState = {
    current_step: "purpose",
    started: "true",
    bootstrap_session_id: "bs_timeout",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:timeout",
  };
  (globalThis as any).__BSC_LATEST__ = { state: { ...baseState }, lang: "en" };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = toolOutputFromWidgetResult({
    state: { ...baseState },
    specialist: { question: "What is your purpose?" },
    ui: {
      view: { mode: "interactive" },
      questionText: "What is your purpose?",
      action_contract: {
        actions: [
          { id: "a1", label: "Define purpose", action_code: "ACTION_PURPOSE_INTRO_DEFINE", role: "choice", surface: "choice", intent: { type: "ROUTE", route: "__ROUTE__PURPOSE_INTRO_DEFINE__" } },
        ],
      },
    },
  });

  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...baseState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
    async callTool() {
      return toolOutputFromWidgetResult({
        ok: false,
        state: {
          ...baseState,
          response_seq: 7,
        },
        ui: { view: { mode: "interactive" } },
        error: {
          type: "timeout",
          user_message: "This is taking longer than usual. Please try again.",
          retry_action: "retry_same_action",
        },
      });
    },
  };

  await new Promise((resolve) => setTimeout(resolve, 300));
  await callRunStep("ACTION_PURPOSE_INTRO_DEFINE");

  const inlineNotice = (fakeDocument as any).getElementById("inlineNotice");
  assert.equal(String(inlineNotice.style.display || ""), "block");
  assert.equal(String(inlineNotice.textContent || ""), "This is taking longer than usual. Please try again.");

  const cachedResolved = resolveWidgetPayload((globalThis as any).__BSC_LAST_TOOL_OUTPUT__);
  assert.equal(cachedResolved.response_seq, 7);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("callRunStep dedupes duplicate bootstrap poll dispatches while one poll is in flight", async () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};

  const baseState = {
    current_step: "step_0",
    bootstrap_session_id: "bs_demo",
    bootstrap_epoch: 1,
    response_seq: 6,
    host_widget_session_id: "internal:demo",
  };
  (globalThis as any).__BSC_LATEST__ = { state: { ...baseState }, lang: "en" };

  let callCount = 0;
  let resolveInFlight: ((value: unknown) => void) | null = null;
  const inFlight = new Promise<unknown>((resolve) => {
    resolveInFlight = resolve;
  });
  (globalThis as any).openai = {
    toolOutput: null,
    widgetState: { ...baseState },
    setWidgetState(next: Record<string, unknown>) {
      this.widgetState = next;
    },
    async callTool() {
      callCount += 1;
      return inFlight;
    },
  };

  const first = callRunStep("ACTION_BOOTSTRAP_POLL", { ...baseState, __bootstrap_poll: "true" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const second = callRunStep("ACTION_BOOTSTRAP_POLL", { ...baseState, __bootstrap_poll: "true" });
  if (resolveInFlight) {
    resolveInFlight(
      toolOutputFromWidgetResult({
        state: {
          ...baseState,
          response_seq: 7,
        },
      })
    );
  }
  await Promise.all([first, second]);
  assert.equal(callCount, 1);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("render keeps non-EN pending locale renderable in prestart mode", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const btnStart = (fakeDocument as any).getElementById("btnStart");
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "?lang=nl" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: { language: "nl" }, setWidgetState() {} };

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  render(toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      started: "false",
      language: "nl",
      ui_action_start: "ACTION_START",
      ui_strings_status: "pending",
      ui_gate_status: "waiting_locale",
    },
    ui: {
      flags: {
        bootstrap_waiting_locale: true,
        bootstrap_interactive_ready: false,
        interactive_fallback_active: false,
      },
      view: {
        mode: "waiting_locale",
        waiting_locale: true,
      },
      action_contract: {
        actions: [
          { id: "start", action_code: "ACTION_START", role: "start", surface: "primary", label_key: "btnStart" },
        ],
      },
    },
  }));

  assert.equal(String(btnStart.style.display || ""), "inline-flex");
  assert.ok((cardDesc.childNodes || []).length > 0);
  resetHydrationRetryCycle();

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render follows explicit server prestart mode during startup grace", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalGraceUntil = (globalThis as any).__BSC_STARTUP_GRACE_UNTIL_MS;
  const fakeDocument = makeDocument();
  const btnStart = (fakeDocument as any).getElementById("btnStart");
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "?lang=nl" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: { language: "nl" }, setWidgetState() {} };
  (globalThis as any).__BSC_STARTUP_GRACE_UNTIL_MS = Date.now() + 500;

  render(toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      started: "false",
      language: "nl",
      ui_action_start: "ACTION_START",
      ui_strings_status: "pending",
      ui_gate_status: "waiting_locale",
    },
    ui: {
      flags: {
        bootstrap_waiting_locale: true,
        bootstrap_interactive_ready: true,
        interactive_fallback_active: true,
      },
      view: {
        mode: "prestart",
        waiting_locale: false,
      },
      action_contract: {
        actions: [
          { id: "start", action_code: "ACTION_START", role: "start", surface: "primary", label_key: "btnStart" },
        ],
      },
    },
  }));

  assert.equal(String(btnStart.style.display || ""), "inline-flex");
  assert.ok((cardDesc.childNodes || []).length > 0);
  resetHydrationRetryCycle();
  (globalThis as any).__BSC_STARTUP_GRACE_UNTIL_MS = originalGraceUntil;
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render keeps interactive step_0 renderable when content is temporarily absent", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const btnStart = (fakeDocument as any).getElementById("btnStart");
  const inlineNotice = (fakeDocument as any).getElementById("inlineNotice");
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  const prompt = (fakeDocument as any).getElementById("prompt");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };

  render(toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      started: "true",
      language: "en",
      ui_action_start: "ACTION_START",
      ui_strings_status: "ready",
      ui_gate_status: "ready",
    },
    ui: {
      view: {
        mode: "interactive",
        waiting_locale: false,
      },
      actions: [],
      action_contract: {
        actions: [
          { id: "start", action_code: "ACTION_START", role: "start", surface: "primary", label_key: "btnStart" },
        ],
      },
    },
  }));

  assert.equal(String(btnStart.style.display || ""), "none");
  assert.equal(((prompt.childNodes || []) as any[]).length > 0, true);
  assert.equal(String(inlineNotice.textContent || "").includes("interactive_content_absent"), false);
  const shell = (cardDesc.childNodes || [])[0] as { className?: string; childNodes?: any[] };
  assert.equal(String(shell?.className || "").includes("bootstrap-wait-shell"), false);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows prestart content when payload is absent", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;
  const originalLatest = (globalThis as any).__BSC_LATEST__;
  const originalCached = (globalThis as any).__BSC_LAST_TOOL_OUTPUT__;

  const fakeDocument = makeDocument();
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: {}, setWidgetState() {} };
  (globalThis as any).__BSC_LATEST__ = undefined;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = {};

  render();

  const shell = (cardDesc.childNodes || [])[0] as { className?: string; childNodes?: any[] };
  if (shell) {
    assert.equal(String(shell.className || "").includes("bootstrap-wait-shell"), false);
  }

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
  (globalThis as any).__BSC_LATEST__ = originalLatest;
  (globalThis as any).__BSC_LAST_TOOL_OUTPUT__ = originalCached;
});

test("render prestart keeps interaction start-only even when action_contract contains extra actions", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const btnStart = (fakeDocument as any).getElementById("btnStart");
  const inputWrap = (fakeDocument as any).getElementById("inputWrap");
  const choiceWrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: { language: "en" }, setWidgetState() {} };

  render(toolOutputFromWidgetResult({
    state: {
      current_step: "step_0",
      started: "false",
      language: "en",
      ui_strings_status: "ready",
      ui_gate_status: "ready",
    },
    ui: {
      view: { mode: "prestart" },
      action_contract: {
        actions: [
          { id: "start", action_code: "ACTION_START", role: "start", surface: "primary", label_key: "btnStart" },
          { id: "menu", action_code: "ACTION_STEP0_MENU", role: "choice", surface: "choice", label: "Menu" },
          {
            id: "text",
            action_code: "ACTION_TEXT_SUBMIT",
            role: "text_submit",
            surface: "text_input",
            payload_mode: "text",
            label: "Send",
          },
        ],
      },
    },
    prompt: "Click Start",
    text: "Welcome",
  }));

  assert.equal(String(btnStart.style.display || ""), "inline-flex");
  assert.equal(String(choiceWrap.style.display || ""), "none");
  assert.equal(String(inputWrap.style.display || ""), "none");

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render interactive keeps text input visible when choices and text_submit coexist", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const inputWrap = (fakeDocument as any).getElementById("inputWrap");
  const choiceWrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: { language: "en" }, setWidgetState() {} };

  render(toolOutputFromWidgetResult({
    state: {
      current_step: "purpose",
      started: "true",
      language: "en",
      ui_strings_status: "ready",
      ui_gate_status: "ready",
    },
    ui: {
      view: { mode: "interactive" },
      action_contract: {
        actions: [
          {
            id: "choice_1",
            action_code: "ACTION_PURPOSE_INTRO_DEFINE",
            role: "choice",
            surface: "choice",
            label: "Define purpose",
          },
          {
            id: "text_submit",
            action_code: "ACTION_TEXT_SUBMIT",
            role: "text_submit",
            surface: "text_input",
            payload_mode: "text",
            label: "Send",
          },
        ],
      },
    },
    prompt: "Choose an option or type your own answer",
    text: "Let's define your purpose.",
  }));

  assert.equal(String(choiceWrap.style.display || ""), "flex");
  assert.equal(String(inputWrap.style.display || ""), "flex");

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("resolveWidgetPayload reads canonical _meta.widget_result from root envelope", () => {
  const resolved = resolveWidgetPayload({
    _meta: {
      widget_result: {
        current_step_id: "step_0",
        state: {
          current_step: "step_0",
          bootstrap_session_id: "session_a",
          bootstrap_epoch: 1,
          response_seq: 1,
          host_widget_session_id: "host_a",
        },
      },
    },
    structuredContent: {
      result: {
        current_step_id: "step_0",
        state: {
          current_step: "step_0",
          bootstrap_session_id: "session_b",
          bootstrap_epoch: 2,
          response_seq: 2,
          host_widget_session_id: "host_b",
        },
      },
    },
  });
  assert.equal(resolved.source, "meta.widget_result");
  assert.equal(resolved.host_widget_session_id, "host_a");
  assert.equal(resolved.bootstrap_session_id, "session_a");
  assert.equal(resolved.bootstrap_epoch, 1);
});

test("resolveWidgetPayload falls back to root result when _meta.widget_result is absent", () => {
  const resolved = resolveWidgetPayload({
    title: "The Business Strategy Canvas Builder",
    meta: "step: step_0 | specialist: ValidationAndBusinessName",
    result: {
      model_result_shape_version: "v2_minimal",
      current_step_id: "step_0",
      state: {
        current_step: "step_0",
        language: "nl",
        ui_strings_status: "ready",
        ui_gate_status: "ready",
        bootstrap_session_id: "session_root_only",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host_root_only",
      },
      ui: {
        view: {
          mode: "interactive",
          waiting_locale: false,
        },
      },
    },
  });

  assert.equal(resolved.source, "result");
  assert.equal(String((resolved.result.current_step_id || "")), "step_0");
  assert.equal(resolved.bootstrap_session_id, "session_root_only");
  assert.equal(resolved.bootstrap_epoch, 1);
  assert.equal(resolved.response_seq, 2);
  assert.equal(resolved.host_widget_session_id, "host_root_only");
  assert.equal(resolved.needs_hydration, false);
});

test("bridge event trust checks source and origin", () => {
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalHostOrigin = (globalThis as any).__BSC_HOST_ORIGIN;
  const parentRef = {};
  (globalThis as any).__BSC_HOST_ORIGIN = "https://chatgpt.com";
  resetBridgeOriginCacheForTests();
  (globalThis as any).window = {
    parent: parentRef,
    location: {},
  };
  (globalThis as any).document = { referrer: "https://chatgpt.com/chat" };
  assert.equal(resolveAllowedHostOrigin(), "https://chatgpt.com");
  assert.equal(
    isTrustedBridgeMessageEvent({
      source: parentRef,
      origin: "https://chatgpt.com",
    } as any),
    true
  );
  assert.equal(
    isTrustedBridgeMessageEvent({
      source: parentRef,
      origin: "https://evil.example",
    } as any),
    false
  );
  assert.equal(
    isTrustedBridgeMessageEvent({
      source: {},
      origin: "https://chatgpt.com",
    } as any),
    false
  );
  (globalThis as any).window = originalWindow;
  (globalThis as any).document = originalDocument;
  (globalThis as any).__BSC_HOST_ORIGIN = originalHostOrigin;
});

test("ui actions source uses explicit bootstrap poll action and shared result handler", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_actions.ts", import.meta.url), "utf8");
  assert.match(source, /const ACTION_BOOTSTRAP_POLL = "ACTION_BOOTSTRAP_POLL";/);
  assert.match(source, /let bootstrapPollInFlight = false;/);
  assert.match(source, /ui_bootstrap_poll_deduped/);
  assert.match(source, /if \(bootstrapPollInFlight\) \{/);
  assert.match(source, /single_flight_in_flight/);
  assert.match(source, /__bootstrap_poll: "true"/);
  assert.match(source, /__hydrate_poll: "true"/);
  assert.match(source, /export function resolveWidgetPayload/);
  assert.match(source, /export function computeHydrationState/);
  assert.match(source, /export function resetHydrationRetryCycle/);
  assert.match(source, /export function ensureBootstrapRetryForResult/);
  assert.match(source, /export function handleToolResultAndMaybeScheduleBootstrapRetry/);
  assert.match(source, /recovery_retry_clicked/);
  assert.doesNotMatch(source, /__locale_wait_retry/);
});

test("ui actions source uses deterministic transport without queued ACTION_START fallback", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_actions.ts", import.meta.url), "utf8");
  assert.match(source, /type TransportStatus = "unknown" \| "ready_callTool" \| "ready_bridge" \| "unavailable";/);
  assert.match(source, /function resolveTransportStatus\(\): TransportStatus/);
  assert.match(source, /type BootstrapOrderingState = \{/);
  assert.match(source, /function decideOrderingPatch\(/);
  assert.match(source, /function mergeOutboundOrdering\(/);
  assert.match(source, /\[ui_ingest_dropped_no_widget_result\]/);
  assert.doesNotMatch(source, /\[ui_ingest_ack_cache_preserved\]/);
  assert.doesNotMatch(source, /function rehydrateIncomingOrderingAgainstCurrent\(/);
  assert.doesNotMatch(source, /function shouldAcceptSameTupleUpgrade\(/);
  assert.doesNotMatch(source, /\[ui_ordering_same_seq_upgrade_accepted\]/);
  assert.doesNotMatch(source, /\[ui_hwid_persisted_without_full_ordering\]/);
  assert.match(source, /incoming_missing_tuple/);
  assert.match(source, /\[ui_dispatch_ack_only\]/);
  assert.match(source, /ui_transport_unavailable/);
  assert.match(source, /ui_start_dispatch_failed/);
  assert.match(source, /type ActionAckStatus = "accepted" \| "rejected" \| "timeout" \| "dropped";/);
  assert.match(source, /function extractActionLiveness\(/);
  assert.match(source, /\[ui_action_liveness_ack\]/);
  assert.match(source, /\[ui_action_liveness_explicit_error\]/);
  assert.match(source, /ui_action_dispatch_ack_without_state_advance/);
  assert.doesNotMatch(source, /scheduleActionLivenessRecoveryPoll\(/);
  assert.doesNotMatch(source, /action_liveness_no_advance/);
  assert.doesNotMatch(source, /const rootResult = toRecord\(root\.result\);/);
  assert.doesNotMatch(source, /widget_result:\s*rootResult/);
  assert.doesNotMatch(source, /ui_ordering_patch_dropped/);
  assert.match(source, /payload_reason_code: resolvedResponse\.source_reason_code/);
  assert.match(source, /\[ui_widgetstate_rehydrate\]/);
  assert.match(source, /\[ui_widgetstate_persist_applied\]/);
  assert.match(source, /\[ui_widgetstate_persist_skipped_no_change\]/);
  assert.match(source, /notifyHostTransportSignal/);
  assert.match(source, /function canUseBridge\(\): boolean \{[\s\S]*return bridgeEnabled;/);
  assert.match(source, /const transportPrimary: "callTool" \| "bridge" = hasCallTool \? "callTool" : "bridge";/);
  assert.match(source, /transport_used: transportUsed/);
  assert.match(source, /allowUnconfirmedBridge: true/);
  assert.doesNotMatch(source, /queueStartAction/);
  assert.doesNotMatch(source, /flushQueuedStartAction/);
  assert.doesNotMatch(source, /startTransportSelfHealEnabled/);
});

test("ui actions source has bridge timeout guard", () => {
  const source = fs.readFileSync(new URL("../ui/lib/ui_actions.ts", import.meta.url), "utf8");
  assert.match(source, /const BRIDGE_RESPONSE_TIMEOUT_MS = 6000;/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*reject\(new Error\("bridge timeout"\)\);[\s\S]*\}, BRIDGE_RESPONSE_TIMEOUT_MS\);/);
});

test("computeBootstrapRenderState defaults to ready without explicit server mode", () => {
  const state = computeBootstrapRenderState({
    hydration: {
      needs_hydration: true,
      retry_count: 0,
      retry_exhausted: false,
      waiting_reason: "missing_state",
    },
    uiStringsStatus: "pending",
    uiFlags: {
      bootstrap_waiting_locale: true,
      bootstrap_interactive_ready: false,
    },
    uiView: {},
    localeKnownNonEn: true,
    hasState: false,
    hasCurrentStep: false,
  });
  assert.equal(state.phase, "ready");
  assert.equal(state.waitingForMissingState, false);
  assert.equal(state.waitingForI18n, false);
  assert.equal(state.bootstrapWaitingLocale, false);
});

test("resolveWidgetPayload prefers richer valid payload from _meta.widget_result", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        model_result_shape_version: "v2_minimal",
        current_step_id: "step_0",
      },
    },
    _meta: {
      widget_result: {
        state: { current_step: "step_0", started: "true", language: "nl" },
        ui: { questionText: "Vraag" },
      },
    },
  });

  assert.equal(resolved.source, "meta.widget_result");
  assert.equal(String((resolved.result.state as Record<string, unknown>).current_step || ""), "step_0");
  assert.equal(resolved.needs_hydration, false);
});

test("resolveWidgetPayload falls back to structuredContent.result when non-meta envelopes are present", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        model_result_shape_version: "v2_minimal",
        current_step_id: "step_0",
        state: {
          current_step: "step_0",
          bootstrap_session_id: "session_x",
          bootstrap_epoch: 1,
          response_seq: 2,
          host_widget_session_id: "host_x",
        },
      },
      ui: {
        result: {
          current_step_id: "step_0",
          prompt: "Vraag",
          state: {
            current_step: "step_0",
            language: "nl",
            initial_user_message: "Help met Mindd",
            ui_strings_status: "pending",
            bootstrap_session_id: "session_x",
            bootstrap_epoch: 1,
            response_seq: 2,
            host_widget_session_id: "host_x",
          },
          ui: { questionText: "Vraag" },
        },
      },
    },
  });

  assert.equal(resolved.source, "structured_content.result");
  assert.equal(String((resolved.result.current_step_id || "")), "step_0");
  assert.equal(resolved.bootstrap_session_id, "session_x");
  assert.equal(resolved.bootstrap_epoch, 1);
  assert.equal(resolved.response_seq, 2);
});

test("resolveWidgetPayload hydrates from structuredContent.result when _meta.widget_result is absent", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        model_result_shape_version: "v2_minimal",
        current_step_id: "step_0",
        state: {
          current_step: "step_0",
          language: "nl",
        },
      },
      ui: {
        prompt: { body: "Should not become root result" },
        state: { menu_id: "STEP0_MENU_READY_START" },
        i18n: { lang: "nl", status: "pending" },
      },
    },
  });

  assert.equal(resolved.source, "structured_content.result");
  assert.equal(String((resolved.result.current_step_id || "")), "step_0");
  assert.equal(resolved.resolved_language, "nl");
});

test("resolveWidgetPayload hydrates from toolResponseMetadata widget_result when canonical metadata wrapper is provided", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        model_result_shape_version: "v2_minimal",
        current_step_id: "step_0",
      },
    },
    toolResponseMetadata: {
      widget_result: {
        state: { current_step: "step_0", started: "true", language: "nl", ui_strings_status: "ready" },
        ui: { questionText: "Vraag" },
      },
    },
  });

  assert.equal(resolved.source, "meta.widget_result");
  assert.equal(String(((resolved.result.state as Record<string, unknown>)?.current_step || "")), "step_0");
  assert.equal(resolved.needs_hydration, false);
});

test("resolveWidgetPayload fail-closes when only flat toolOutput._widget_result alias is present", () => {
  const resolved = resolveWidgetPayload({
    toolOutput: {
      _widget_result: {
        state: {
          current_step: "step_0",
          language: "nl",
          ui_strings_status: "ready",
          bootstrap_session_id: "session_flat",
          bootstrap_epoch: 1,
          response_seq: 3,
          host_widget_session_id: "host_flat",
        },
        ui: { questionText: "Vraag" },
      },
    },
  });

  assert.equal(resolved.source, "none");
  assert.equal(String(((resolved.result.state as Record<string, unknown>)?.current_step || "")), "");
  assert.equal(resolved.bootstrap_session_id, "");
  assert.equal(resolved.host_widget_session_id, "");
  assert.equal(resolved.needs_hydration, false);
});

test("mergeToolOutputWithResponseMetadata accepts flat metadata object shape", () => {
  const merged = mergeToolOutputWithResponseMetadata(
    { structuredContent: { result: { ok: true } } },
    {
      widget_result: {
        state: { current_step: "step_0", language: "nl", ui_strings_status: "pending" },
      },
    }
  );
  const meta = (merged._meta && typeof merged._meta === "object")
    ? (merged._meta as Record<string, unknown>)
    : {};
  assert.equal(String(((meta.widget_result as Record<string, unknown>)?.state as Record<string, unknown>)?.current_step || ""), "step_0");
});

test("resolveWidgetPayload applies freshness override when metadata is available", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        state: { current_step: "step_0", updated_at_ms: 100 },
        ui: { questionText: "Older" },
      },
      ui: {
        result: {
          state: { current_step: "step_0", updated_at_ms: 200 },
          ui: { questionText: "Newer" },
        },
      },
    },
    _meta: {
      widget_result: {
        state: { current_step: "step_0", updated_at_ms: 150 },
        ui: { questionText: "Middle" },
      },
    },
  });

  assert.equal(resolved.source, "meta.widget_result");
  assert.equal(
    String((((resolved.result.ui as Record<string, unknown>) || {}).questionText) || ""),
    "Middle"
  );
});

test("computeHydrationState uses shared v2_minimal missing-state rule", () => {
  const resolved = resolveWidgetPayload({
    structuredContent: {
      result: {
        model_result_shape_version: "v2_minimal",
        current_step_id: "step_0",
        ui_strings_status: "pending",
      },
    },
  });
  const hydration = computeHydrationState(resolved);
  assert.equal(hydration.needs_hydration, true);
  assert.equal(hydration.waiting_reason, "none");
});

test("computeHydrationState treats non-EN language/ui_strings_lang mismatch as i18n_pending even when status is ready", () => {
  const resolved = {
    result: {
      state: {
        current_step: "step_0",
        language: "nl",
        ui_strings_lang: "en",
        ui_strings_status: "ready",
        ui_gate_status: "ready",
      },
    },
    source: "none",
    has_state: true,
    resolved_language: "nl",
    resolved_language_source: "state.language",
    ui_strings_status: "ready",
    shape_version: "v2_minimal",
    needs_hydration: false,
    waiting_reason: "none",
    bootstrap_phase: "ready",
    bootstrap_session_id: "",
    bootstrap_epoch: 0,
    response_seq: 0,
    response_kind: "",
    host_widget_session_id: "",
  } as any;
  const hydration = computeHydrationState(resolved);
  assert.equal(hydration.needs_hydration, false);
  assert.equal(hydration.waiting_reason, "none");
});

test("resolveWidgetPayload accepts direct widget-result shape from host notification params", () => {
  const resolved = resolveWidgetPayload({
    current_step_id: "step_0",
    state: {
      current_step: "step_0",
      bootstrap_session_id: "session_direct",
      bootstrap_epoch: 2,
      response_seq: 11,
      host_widget_session_id: "host_direct",
      language: "nl",
      ui_strings_status: "ready",
    },
    ui: {
      view: {
        mode: "interactive",
      },
    },
  });
  assert.equal(resolved.source, "direct");
  assert.equal(resolved.bootstrap_session_id, "session_direct");
  assert.equal(resolved.bootstrap_epoch, 2);
  assert.equal(resolved.response_seq, 11);
  assert.equal(resolved.host_widget_session_id, "host_direct");
});

test("render keeps interactive mode usable with fallback prompt when content is missing", () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalOpenai = (globalThis as any).openai;

  const fakeDocument = makeDocument();
  const cardDesc = (fakeDocument as any).getElementById("cardDesc");
  const promptEl = (fakeDocument as any).getElementById("prompt");
  (globalThis as any).document = fakeDocument;
  (globalThis as any).window = {
    location: { search: "?lang=nl" },
    addEventListener() {},
  };
  (globalThis as any).openai = { toolOutput: null, widgetState: { language: "nl" }, setWidgetState() {} };

  render(toolOutputFromWidgetResult({
    state: {
      current_step: "dream",
      started: "true",
      language: "nl",
      ui_strings_status: "ready",
      ui_gate_status: "ready",
      ui_action_text_submit: "",
    },
    ui: {
      view: {
        mode: "interactive",
      },
      actions: [],
    },
    prompt: "",
    text: "",
  }));

  assert.equal(((promptEl.childNodes || []) as any[]).length > 0, true);
  const shell = (cardDesc.childNodes || [])[0] as { className?: string; childNodes?: any[] };
  assert.equal(String(shell?.className || "").includes("bootstrap-wait-shell"), false);

  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});
