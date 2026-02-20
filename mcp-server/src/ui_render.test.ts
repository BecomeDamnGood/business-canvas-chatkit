import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dedupeBodyAgainstPrompt,
  render,
  renderChoiceButtons,
  stripStructuredChoiceLines,
} from "../ui/lib/ui_render.js";
import { setSessionStarted, setSessionWelcomeShown } from "../ui/lib/ui_state.js";

function makeElement(tag: string) {
  const node: any = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: "",
    type: "",
    textContent: "",
    style: {} as Record<string, string>,
    childNodes: [] as any[],
    disabled: false,
    appendChild(child: any) {
      this.childNodes.push(child);
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

test("renderChoiceButtons renders buttons when ui.actions exist for action_codes", () => {
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
      actions: [
        { id: "a1", label: "Alpha", action_code: "ACTION_ONE", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
        { id: "a2", label: "Beta", action_code: "ACTION_TWO", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
      ],
    },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
});

test("renderChoiceButtons renders structured ui.actions without numbered prompt choices", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  renderChoiceButtons([], {
    specialist: { menu_id: "DREAM_MENU_REFINE" },
    state: { current_step: "dream" },
    registry_version: "test",
    ui: {
      actions: [
        { id: "a1", label: "Action one", action_code: "ACTION_ONE", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
        { id: "a2", label: "Action two", action_code: "ACTION_TWO", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
      ],
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
  assert.equal(String(wrap.style.display || ""), "flex");

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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        language: "en",
      },
      specialist: {
        action: "ASK",
        question: "Please share your thoughts.",
        menu_id: "PURPOSE_MENU_REFINE",
      },
      prompt: "Please choose 1 or 2.",
      ui: {
        questionText: "Please share your thoughts.",
        actions: [
          { id: "a1", label: "Confirm wording", action_code: "ACTION_PURPOSE_REFINE_CONFIRM", intent: { type: "ROUTE", route: "__ROUTE__PURPOSE_REFINE_CONFIRM__" } },
          { id: "a2", label: "Adjust wording", action_code: "ACTION_PURPOSE_REFINE_ADJUST", intent: { type: "ROUTE", route: "__ROUTE__PURPOSE_REFINE_ADJUST__" } },
        ],
      },
    },
  });

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
    { value: "2", label: "I want to adjust it." },
  ];

  renderChoiceButtons(choices, {
    specialist: { menu_id: "ROLE_MENU_REFINE" },
    state: { current_step: "role" },
    registry_version: "test",
    ui: {
      action_codes: ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"],
      expected_choice_count: 2,
      actions: [
        { id: "a1", label: "I'm happy with this wording, continue to step 6 Entity.", action_code: "ACTION_ROLE_REFINE_CONFIRM", intent: { type: "ROUTE", route: "__ROUTE__ROLE_REFINE_CONFIRM__" } },
        { id: "a2", label: "I want to adjust it.", action_code: "ACTION_ROLE_REFINE_ADJUST", intent: { type: "ROUTE", route: "__ROUTE__ROLE_REFINE_ADJUST__" } },
      ],
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
    render({
      result: {
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
      },
    });
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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
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
        action_codes: [
          "ACTION_DREAM_REFINE_CONFIRM",
          "ACTION_DREAM_REFINE_START_EXERCISE",
        ],
        expected_choice_count: 2,
        actions: [
          { id: "a1", label: "I'm happy with this wording, please continue to step 3 Purpose", action_code: "ACTION_DREAM_REFINE_CONFIRM", intent: { type: "ROUTE", route: "__ROUTE__DREAM_REFINE_CONFIRM__" } },
          { id: "a2", label: "Do a small exercise that helps to define your dream.", action_code: "ACTION_DREAM_REFINE_START_EXERCISE", intent: { type: "ROUTE", route: "__ROUTE__DREAM_START_EXERCISE__" } },
        ],
      },
    },
  });

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

test("render respects explicit empty result.text and does not fall back to specialist.question", () => {
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

  render({
    result: {
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
        questionText:
          "1) Switch back to self-formulate the dream\n\nWhat more do you see changing in the future, positive or negative? Let your imagination run free.",
        action_codes: ["ACTION_DREAM_SWITCH_TO_SELF"],
        expected_choice_count: 1,
      },
    },
  });

  assert.equal(String(cardDesc.textContent || "").trim(), "");

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("render shows section title only on INTRO action for a step", () => {
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

  render({
    result: {
      text: "Purpose intro body",
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        language: "en",
        business_name: "Mindd",
      },
      specialist: {
        action: "INTRO",
        menu_id: "PURPOSE_MENU_INTRO",
      },
      prompt: "Please define your purpose.",
      ui: {
        action_codes: ["ACTION_PURPOSE_INTRO_EXPLAIN_MORE", "ACTION_PURPOSE_INTRO_DEFINE"],
        expected_choice_count: 2,
      },
    },
  });

  assert.equal(String(sectionTitle.textContent || ""), "The Purpose of Mindd");

  render({
    result: {
      text: "Purpose follow-up body",
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        language: "en",
        business_name: "Mindd",
      },
      specialist: {
        action: "ASK",
        menu_id: "PURPOSE_MENU_REFINE",
      },
      prompt: "Refine your Purpose for Mindd or choose an option.",
      ui: {
        action_codes: ["ACTION_PURPOSE_REFINE_CONFIRM", "ACTION_PURPOSE_REFINE_ADJUST"],
        expected_choice_count: 2,
      },
    },
  });

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
  assert.equal(
    stripStructuredChoiceLines(prompt),
    "Refine your Purpose or choose an option."
  );
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

  render({
    result: {
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
        language: "en",
      },
      specialist: {
        action: "ASK",
        menu_id: "DREAM_MENU_INTRO",
        question: "Define your Dream for Mindd or choose an option.",
      },
      prompt: "Define your Dream for Mindd or choose an option.",
    },
  });

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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "purpose",
        active_specialist: "Purpose",
        intro_shown_session: "true",
        intro_shown_for_step: "purpose",
        language: "en",
      },
      specialist: {
        action: "CONFIRM",
        question: "Please confirm your purpose.",
        menu_id: "PURPOSE_MENU_REFINE",
      },
      prompt: "Please confirm your purpose.",
      ui: {
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
    },
  });

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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "role",
        active_specialist: "Role",
        intro_shown_session: "true",
        intro_shown_for_step: "role",
        language: "en",
      },
      specialist: {
        action: "REFINE",
        question: "1) I'm happy with this wording, continue to step 6 Entity.\n2) I want to adjust it.",
        menu_id: "ROLE_MENU_REFINE",
      },
      prompt: "1) I'm happy with this wording, continue to step 6 Entity.\n2) I want to adjust it.",
      ui: {
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
    },
  });

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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "strategy",
        active_specialist: "Strategy",
        intro_shown_session: "true",
        intro_shown_for_step: "strategy",
        language: "en",
      },
      specialist: {
        action: "REFINE",
        question: "Refine your strategy or choose an option.",
        menu_id: "STRATEGY_MENU_REFINE",
      },
      prompt: "Refine your strategy or choose an option.",
      ui: {
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
    },
  });

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
  render({
    result: {
      registry_version: "test",
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
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
        action_codes: [
          "ACTION_DREAM_REFINE_CONFIRM",
          "ACTION_DREAM_REFINE_START_EXERCISE",
        ],
        expected_choice_count: 2,
      },
    },
  });
  assert.equal(String(wrap.style.display || ""), "flex");

  render({
    result: {
      ok: false,
      state: {
        current_step: "dream",
        active_specialist: "Dream",
        intro_shown_session: "true",
        intro_shown_for_step: "dream",
        language: "en",
      },
      specialist: {
        action: "ASK",
        question: "Do you want to continue?",
      },
      error: {
        type: "timeout",
        user_message: "This is taking longer than usual. Please try again.",
        retry_action: "retry_same_action",
      },
    },
  });
  assert.equal(String(inlineNotice.textContent || ""), "This is taking longer than usual. Please try again.");
  assert.equal(String(inlineNotice.style.display || ""), "block");
  assert.equal(String(wrap.style.display || ""), "flex");

  setSessionStarted(false);
  setSessionWelcomeShown(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});

test("btnStartDreamExercise sends Dream start-exercise actioncode", () => {
  const source = fs.readFileSync(new URL("../ui/lib/main.ts", import.meta.url), "utf8");
  const blockMatch = source.match(
    /const btnStartDreamExercise = document\.getElementById\("btnStartDreamExercise"\);[\s\S]*?if \(btnStartDreamExercise\) \{[\s\S]*?\n\}/
  );
  assert.ok(blockMatch, "Expected btnStartDreamExercise handler block in ui/lib/main.ts");
  const block = blockMatch[0];
  assert.match(block, /callRunStep\("ACTION_DREAM_INTRO_START_EXERCISE"\)/);
});
