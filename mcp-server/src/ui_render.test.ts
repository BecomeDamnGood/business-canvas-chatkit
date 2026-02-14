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
