import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("sanitizeInlineText strips HTML tags", () => {
  const html = readFileSync(new URL("../ui/step-card.html", import.meta.url), "utf8");
  const match = html.match(/function sanitizeInlineText\(raw\)\s*\{[\s\S]*?\}/);
  assert.ok(match, "sanitizeInlineText found");
  const fnSrc = `${match[0]}; return sanitizeInlineText;`;
  const sanitizeInlineText = new Function(fnSrc)() as (input: string) => string;
  const out = sanitizeInlineText("<strong>Hi</strong>");
  assert.equal(out, "Hi");
});
