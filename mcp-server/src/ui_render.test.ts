import test from "node:test";
import assert from "node:assert/strict";
import { renderChoiceButtons } from "../ui/lib/ui_render.js";

function makeElement(tag: string) {
  return {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: "",
    type: "",
    textContent: "",
    style: {} as Record<string, string>,
    childNodes: [] as any[],
    appendChild(node: any) {
      this.childNodes.push(node);
      return node;
    },
    addEventListener() {},
    setAttribute() {},
  };
}

test("renderChoiceButtons handles missing ui without throwing", () => {
  const originalDocument = (globalThis as any).document;
  const wrap: any = makeElement("div");
  Object.defineProperty(wrap, "innerHTML", {
    get() {
      return "";
    },
    set() {
      this.childNodes = [];
    },
  });

  const fakeDocument = {
    getElementById(id: string) {
      if (id === "choiceWrap") return wrap;
      return null;
    },
    createElement(tag: string) {
      return makeElement(tag);
    },
  };
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
  const wrap: any = makeElement("div");
  Object.defineProperty(wrap, "innerHTML", {
    get() {
      return "";
    },
    set() {
      this.childNodes = [];
    },
  });

  const fakeDocument = {
    getElementById(id: string) {
      if (id === "choiceWrap") return wrap;
      return null;
    },
    createElement(tag: string) {
      return makeElement(tag);
    },
  };
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
