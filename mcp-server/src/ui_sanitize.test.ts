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
