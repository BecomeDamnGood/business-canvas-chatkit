import test from "node:test";
import assert from "node:assert/strict";
import { renderInlineText, renderStructuredText } from "../ui/lib/ui_text.js";
import { extractChoicesFromPrompt } from "../ui/lib/ui_choices.js";
import { renderChoiceButtons } from "../ui/lib/ui_render.js";
import { setIsLoading } from "../ui/lib/ui_state.js";

test("renderInlineText builds STRONG nodes safely", () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        textContent: "",
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;

  const container = {
    childNodes: [] as unknown[],
    get firstChild() {
      return this.childNodes.length ? this.childNodes[0] : null;
    },
    removeChild() {
      this.childNodes.shift();
    },
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };

  renderInlineText(container as unknown as Element, "<strong>Hi</strong> there");
  const fragment = container.childNodes[0] as { childNodes: { tagName: string; textContent: string }[] };
  assert.ok(fragment);
  assert.equal(fragment.childNodes.length, 2);
  assert.equal(fragment.childNodes[0].tagName, "STRONG");
  assert.equal(fragment.childNodes[0].textContent, "Hi");
  assert.equal(fragment.childNodes[1].textContent, " there");

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

test("extractChoicesFromPrompt keeps numbering with <strong> tags and renders buttons", () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const wrap: {
    childNodes: unknown[];
    style: { display: string };
    appendChild: (node: unknown) => unknown;
  } = {
    childNodes: [] as unknown[],
    style: { display: "" },
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };
  Object.defineProperty(wrap, "innerHTML", {
    get() {
      return "";
    },
    set() {
      wrap.childNodes = [];
    },
  });

  const fakeDocument = {
    getElementById(id: string) {
      if (id === "choiceWrap") return wrap;
      return null;
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        type: "",
        textContent: "",
        disabled: false,
        style: {} as Record<string, string>,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
        addEventListener() {},
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };

  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  setIsLoading(false);

  const prompt = "Choose one:\n1) <strong>Alpha</strong>\n2) Beta";
  const { choices } = extractChoicesFromPrompt(prompt);
  assert.equal(choices.length, 2);

  renderChoiceButtons(choices, {
    specialist: { menu_id: "TEST_MENU" },
    state: { current_step: "step_0" },
    ui: {
      action_codes: ["ACTION_ONE", "ACTION_TWO"],
      expected_choice_count: 2,
      actions: [
        { id: "a1", label: "Alpha", action_code: "ACTION_ONE", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
        { id: "a2", label: "Beta", action_code: "ACTION_TWO", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
      ],
    },
    registry_version: "test",
  });

  const buttons = wrap.childNodes.filter(
    (node: unknown) => node && (node as { tagName?: string }).tagName === "BUTTON"
  );
  assert.equal(buttons.length, 2);

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

test("renderStructuredText groups paragraphs, ordered lists, and bullets", () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        textContent: "",
        childNodes: [] as unknown[],
        get firstChild() {
          return this.childNodes.length ? this.childNodes[0] : null;
        },
        removeChild() {
          this.childNodes.shift();
        },
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;

  const container = {
    innerHTML: "",
    childNodes: [] as unknown[],
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };

  renderStructuredText(
    container as unknown as Element,
    [
      "<strong>The Proven Standard</strong>",
      "A globally implemented strategy canvas used by teams worldwide.",
      "",
      "1. First ordered item",
      "2. Second ordered item",
      "",
      "- First bullet",
      "- Second bullet",
    ].join("\n")
  );

  assert.equal(container.childNodes.length, 3);
  assert.equal((container.childNodes[0] as { tagName: string }).tagName, "P");
  assert.equal((container.childNodes[1] as { tagName: string }).tagName, "OL");
  assert.equal((container.childNodes[2] as { tagName: string }).tagName, "UL");
  const firstParagraphFragment = (container.childNodes[0] as { childNodes: unknown[] }).childNodes[0] as {
    childNodes: { tagName: string; textContent: string }[];
  };
  assert.equal(firstParagraphFragment.childNodes[0].tagName, "STRONG");
  assert.equal(firstParagraphFragment.childNodes[0].textContent, "The Proven Standard");

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});
