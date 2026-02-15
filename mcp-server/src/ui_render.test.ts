import test from "node:test";
import assert from "node:assert/strict";
import { dedupeBodyAgainstPrompt, render, renderChoiceButtons } from "../ui/lib/ui_render.js";
import { setSessionStarted } from "../ui/lib/ui_state.js";

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

test("renderChoiceButtons renders buttons when ui.action_codes exist", () => {
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
    ui: { action_codes: ["ACTION_ONE", "ACTION_TWO"], expected_choice_count: 2 },
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
});

test("renderChoiceButtons keeps both ROLE_MENU_REFINE choices", () => {
  const originalDocument = (globalThis as any).document;
  const fakeDocument = makeDocument();
  const wrap = (fakeDocument as any).getElementById("choiceWrap");
  (globalThis as any).document = fakeDocument;

  const choices = [
    { value: "1", label: "Yes, this fits. Continue to step 6 Entity." },
    { value: "2", label: "Adjust it" },
  ];

  renderChoiceButtons(choices, {
    specialist: { menu_id: "ROLE_MENU_REFINE" },
    state: { current_step: "role" },
    registry_version: "test",
    ui: { action_codes: ["ACTION_ROLE_REFINE_CONFIRM", "ACTION_ROLE_REFINE_ADJUST"], expected_choice_count: 2 },
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
  const btnOk = (fakeDocument as any).getElementById("btnOk");
  assert.equal(String(wordingWrap.style.display || ""), "flex");
  assert.equal(String(userText.textContent || ""), "Mindd helps teams with clarity.");
  assert.equal(String(suggestionText.textContent || ""), "Mindd exists to restore focus and meaning in work.");
  assert.equal(String(suggestionBtn.textContent || ""), "This would be my suggestion");
  assert.equal(String(btnOk.style.display || ""), "none");

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
        question: "1) Yes, this fits. Continue to step 6 Entity.\n2) Adjust it",
        menu_id: "ROLE_MENU_REFINE",
      },
      prompt: "1) Yes, this fits. Continue to step 6 Entity.\n2) Adjust it",
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
  const userBtn = (fakeDocument as any).getElementById("wordingChoicePickUser");
  assert.equal(userList.childNodes.length, 2);
  assert.equal(suggestionList.childNodes.length, 3);
  assert.equal(String(userBtn.textContent || ""), "Choose this version");

  setSessionStarted(false);
  (globalThis as any).document = originalDocument;
  (globalThis as any).window = originalWindow;
  (globalThis as any).openai = originalOpenai;
});
