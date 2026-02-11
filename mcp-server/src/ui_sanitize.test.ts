import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("renderInlineText builds STRONG nodes safely", () => {
  const html = readFileSync(new URL("../ui/step-card.html", import.meta.url), "utf8");
  const start = html.indexOf("function renderInlineText");
  const end = html.indexOf("function extractChoicesFromPrompt", start);
  assert.ok(start !== -1, "renderInlineText found");
  assert.ok(end !== -1, "extractChoicesFromPrompt found");

  const originalDocument = (globalThis as any).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as any[],
        appendChild(node: any) {
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
        childNodes: [] as any[],
        appendChild(node: any) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as any).document = fakeDocument;

  const fnSrc = `${html.slice(start, end)}; return renderInlineText;`;
  const renderInlineText = new Function(fnSrc)() as (el: any, input: string) => void;

  const container = {
    childNodes: [] as any[],
    get firstChild() {
      return this.childNodes.length ? this.childNodes[0] : null;
    },
    removeChild() {
      this.childNodes.shift();
    },
    appendChild(node: any) {
      this.childNodes.push(node);
      return node;
    },
  };

  renderInlineText(container, "<strong>Hi</strong> there");
  const fragment = container.childNodes[0];
  assert.ok(fragment);
  assert.equal(fragment.childNodes.length, 2);
  assert.equal(fragment.childNodes[0].tagName, "STRONG");
  assert.equal(fragment.childNodes[0].textContent, "Hi");
  assert.equal(fragment.childNodes[1].textContent, " there");

  (globalThis as any).document = originalDocument;
});

test("extractChoicesFromPrompt keeps numbering with <strong> tags and renders buttons", () => {
  const html = readFileSync(new URL("../ui/step-card.html", import.meta.url), "utf8");
  const start = html.indexOf("function stripInlineText");
  const end = html.indexOf("function ensureLanguageInState", start);
  assert.ok(start !== -1, "stripInlineText found");
  assert.ok(end !== -1, "ensureLanguageInState found");

  const originalDocument = (globalThis as any).document;
  const originalUiLang = (globalThis as any).uiLang;
  const originalT = (globalThis as any).t;
  const originalIsLoading = (globalThis as any).isLoading;

  const wrap: any = {
    childNodes: [] as any[],
    style: { display: "" },
    appendChild(node: any) {
      this.childNodes.push(node);
      return node;
    },
  };
  Object.defineProperty(wrap, "innerHTML", {
    get() { return ""; },
    set() { this.childNodes = []; },
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
        style: {} as any,
        childNodes: [] as any[],
        appendChild(node: any) {
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
        childNodes: [] as any[],
        appendChild(node: any) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };

  (globalThis as any).document = fakeDocument;
  (globalThis as any).uiLang = () => "en";
  (globalThis as any).t = () => "Options unavailable";
  (globalThis as any).isLoading = false;

  const fnSrc = `${html.slice(start, end)}; return { extractChoicesFromPrompt, renderChoiceButtons };`;
  const fns = new Function(fnSrc)() as {
    extractChoicesFromPrompt: (input: string) => { choices: Array<{ label: string; value: string }> };
    renderChoiceButtons: (choices: Array<{ label: string; value: string }>, resultData: any) => void;
  };

  const prompt = "Choose one:\n1) <strong>Alpha</strong>\n2) Beta";
  const { choices } = fns.extractChoicesFromPrompt(prompt);
  assert.equal(choices.length, 2);

  fns.renderChoiceButtons(choices, {
    specialist: { menu_id: "TEST_MENU" },
    state: { current_step: "step_0" },
    ui: { action_codes: ["ACTION_ONE", "ACTION_TWO"], expected_choice_count: 2 },
    registry_version: "test",
  });

  const buttons = wrap.childNodes.filter((node: any) => node && node.tagName === "BUTTON");
  assert.equal(buttons.length, 2);

  (globalThis as any).document = originalDocument;
  (globalThis as any).uiLang = originalUiLang;
  (globalThis as any).t = originalT;
  (globalThis as any).isLoading = originalIsLoading;
});
