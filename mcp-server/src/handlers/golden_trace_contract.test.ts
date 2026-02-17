import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, "__golden__");

const REQUIRED_FILES = [
  "step_0.json",
  "dream.json",
  "dream_explainer.json",
  "purpose.json",
  "bigwhy.json",
  "role.json",
  "entity.json",
  "strategy.json",
  "targetgroup.json",
  "productsservices.json",
  "rulesofthegame.json",
  "presentation.json",
  "dream_builder_statements.json",
  "dream_builder_scoring.json",
  "dream_switch_to_self.json",
];

test("golden traces: required files exist", () => {
  for (const filename of REQUIRED_FILES) {
    assert.equal(fs.existsSync(path.join(GOLDEN_DIR, filename)), true, `missing ${filename}`);
  }
});

test("golden traces: each file has required shape", () => {
  for (const filename of REQUIRED_FILES) {
    const raw = fs.readFileSync(path.join(GOLDEN_DIR, filename), "utf8");
    const parsed = JSON.parse(raw) as any;
    assert.equal(typeof parsed.id, "string", `${filename}: id`);
    assert.equal(typeof parsed.step, "string", `${filename}: step`);
    assert.ok(parsed.input && typeof parsed.input === "object", `${filename}: input object`);
    assert.ok(parsed.expected && typeof parsed.expected === "object", `${filename}: expected object`);
    assert.ok(parsed.expected.transition && typeof parsed.expected.transition === "object", `${filename}: transition object`);
    assert.ok(Array.isArray(parsed.expected.stateMutation), `${filename}: stateMutation array`);
    assert.ok(Array.isArray(parsed.expected.actions), `${filename}: actions array`);
  }
});

