import test from "node:test";
import assert from "node:assert/strict";

import { parseExplicitLanguageOverride } from "./bootstrap_runtime.js";

test("ordinary business wording cannot become a language override", () => {
  assert.equal(parseExplicitLanguageOverride("We make use of creative materials."), "");
  assert.equal(parseExplicitLanguageOverride("Our role is to bring people together."), "");
  assert.equal(parseExplicitLanguageOverride("of"), "");
});

test("unambiguous language commands remain supported", () => {
  assert.equal(parseExplicitLanguageOverride("language: nl"), "nl");
  assert.equal(parseExplicitLanguageOverride("switch language to en"), "en");
  assert.equal(parseExplicitLanguageOverride("change locale to pt-BR"), "pt-BR");
});
