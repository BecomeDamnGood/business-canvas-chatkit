import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, "__golden__");
const RUNTIME_GOLDEN_DIR = path.join(GOLDEN_DIR, "runtime");

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

const REQUIRED_RUNTIME_FILES = [
  "prestart.json",
  "waiting_locale.json",
  "interactive.json",
  "blocked.json",
  "failed.json",
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

test("runtime golden traces: required files exist", () => {
  for (const filename of REQUIRED_RUNTIME_FILES) {
    assert.equal(fs.existsSync(path.join(RUNTIME_GOLDEN_DIR, filename)), true, `missing runtime/${filename}`);
  }
});

test("runtime golden traces: each file has required shape", () => {
  const allowedPaths = new Set(["prestart", "waiting_locale", "interactive", "blocked", "failed"]);

  for (const filename of REQUIRED_RUNTIME_FILES) {
    const raw = fs.readFileSync(path.join(RUNTIME_GOLDEN_DIR, filename), "utf8");
    const parsed = JSON.parse(raw) as any;
    assert.equal(typeof parsed.id, "string", `${filename}: id`);
    assert.equal(typeof parsed.path, "string", `${filename}: path`);
    assert.equal(allowedPaths.has(String(parsed.path || "")), true, `${filename}: path value`);
    assert.ok(parsed.input && typeof parsed.input === "object", `${filename}: input object`);
    assert.ok(parsed.expected && typeof parsed.expected === "object", `${filename}: expected object`);
    assert.ok(parsed.expected.snapshot && typeof parsed.expected.snapshot === "object", `${filename}: snapshot object`);
    assert.equal(typeof parsed.expected.snapshot.ok, "boolean", `${filename}: snapshot.ok`);
    assert.equal(typeof parsed.expected.snapshot.current_step_id, "string", `${filename}: snapshot.current_step_id`);
    assert.equal(typeof parsed.expected.snapshot.ui_view_mode, "string", `${filename}: snapshot.ui_view_mode`);
    assert.equal(typeof parsed.expected.snapshot.ui_gate_status, "string", `${filename}: snapshot.ui_gate_status`);
    assert.equal(typeof parsed.expected.snapshot.bootstrap_phase, "string", `${filename}: snapshot.bootstrap_phase`);
    assert.equal(typeof parsed.expected.snapshot.has_ui_actions, "boolean", `${filename}: snapshot.has_ui_actions`);
    assert.equal(typeof parsed.expected.snapshot.has_action_codes, "boolean", `${filename}: snapshot.has_action_codes`);
    assert.equal(typeof parsed.expected.snapshot.has_contract_id, "boolean", `${filename}: snapshot.has_contract_id`);
    assert.equal(typeof parsed.expected.snapshot.has_text_keys, "boolean", `${filename}: snapshot.has_text_keys`);
    assert.equal(typeof parsed.expected.snapshot.error_type, "string", `${filename}: snapshot.error_type`);
  }
});
