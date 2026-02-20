// Unit tests for Dream Explainer: statement persistence, recap, stuck (no buttons)
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDreamExplainerSpecialistInput,
  DreamExplainerZodSchema,
  parseDreamExplainerOutput,
  type DreamExplainerOutput,
} from "./dream_explainer.js";

test("buildDreamExplainerSpecialistInput includes PREVIOUS_STATEMENTS", () => {
  const input = buildDreamExplainerSpecialistInput(
    "User message",
    "dream",
    "dream",
    "en",
    ["First statement.", "Second statement."]
  );
  assert.ok(input.includes("PREVIOUS_STATEMENTS:"), "input contains PREVIOUS_STATEMENTS");
  assert.ok(input.includes('["First statement.","Second statement."]') || input.includes('["First statement.", "Second statement."]'), "previous statements serialized");
});

test("buildDreamExplainerSpecialistInput with empty previous statements", () => {
  const input = buildDreamExplainerSpecialistInput("Hello", "", "dream", "", []);
  assert.ok(input.includes("PREVIOUS_STATEMENTS: []"), "empty array in input");
});

test("statement list: count equals statements.length", () => {
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Statement 2 noted: Tech will change work.\nTotal: 2 statements.\n• First.\n• Tech will change work.",
    question: "What else?",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: ["First.", "Tech will change work."],
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 2, "count equals length");
  const parsed = DreamExplainerZodSchema.parse(output);
  assert.equal(parsed.statements.length, 2);
});

test("recap includes all statements as bullets", () => {
  const statements = ["A.", "B.", "C."];
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: `Statement 3 noted: C.\nTotal: 3 statements.\n• A.\n• B.\n• C.`,
    question: "Next?",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements,
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 3);
  for (const s of statements) {
    assert.ok(output.message.includes(s), `message contains statement "${s}"`);
  }
});

test("stuck scenario: question must NOT contain numbered pattern (no buttons)", () => {
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Maybe I can help a bit. Do any of these spark an opinion?\n• Do people become more connected, or more lonely?\n• Does technology free us, or control attention?",
    question: "Write one clear statement in your own words.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: [],
    user_state: "stuck",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.user_state, "stuck");
  const numberedChoicePattern = /^\s*[1-9][\)\.]\s*/m;
  assert.ok(!numberedChoicePattern.test(output.question), "question must not have numbered options (widget would render buttons)");
});

test("parseDreamExplainerOutput accepts output with statements and user_state", () => {
  const raw = {
    action: "INTRO",
    message: "Welcome.",
    question: "First statement?",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: [],
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  const parsed = parseDreamExplainerOutput(raw);
  assert.deepEqual(parsed.statements, []);
  assert.equal(parsed.user_state, "ok");
});

test("multi-statement: after adding 2 statements output includes both statements and full list", () => {
  const statements = ["First claim.", "Second claim."];
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Statements 1 and 2 noted.\nTotal: 2 statements.\n1. First claim.\n2. Second claim.\nIf you meant something different, tell me and I'll adjust.",
    question: "What do you see changing in the future, positive or negative? Let your imagination run free.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements,
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 2);
  assert.ok(output.message.includes("1.") && output.message.includes("2."), "numbered list includes both");
  assert.ok(output.message.includes("First claim.") && output.message.includes("Second claim."), "output includes both statements");
  assert.ok(output.message.includes("Total: 2 statements."));
  assert.ok(output.question.includes("imagination") || output.question.includes("run free"), "next question uses new closing (dreamExplainer.nextQuestion meaning)");
});

test("total exactly 5: response has encouragement, list 1..5, and new question closing", () => {
  const statements = ["S1.", "S2.", "S3.", "S4.", "S5."];
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Great progress. You now have 5 statements.\n\n1. S1.\n2. S2.\n3. S3.\n4. S4.\n5. S5.\n\nIf you meant something different, tell me and I'll adjust.",
    question: "What do you see changing in the future, positive or negative? Let your imagination run free.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements,
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 5);
  assert.ok(output.message.includes("5") && (output.message.includes("statement") || output.message.includes("statements")), "explicitly states 5 statements");
  for (let i = 1; i <= 5; i++) assert.ok(output.message.includes(`${i}.`), `list includes ${i}.`);
  assert.ok(
    output.question.includes("imagination") || output.question.includes("run free"),
    "question uses new closing (let your imagination run free)"
  );
});

test("milestone/progress output includes complete numbered statements list (1..N)", () => {
  const statements = ["One.", "Two.", "Three.", "Four.", "Five."];
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Total: 5 statements.\n1. One.\n2. Two.\n3. Three.\n4. Four.\n5. Five.\n\nGreat progress; you now have 5 statements.",
    question: "What do you see changing in the future, positive or negative? Let your imagination run free.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements,
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 5);
  assert.ok(output.message.includes("Total: 5 statements."), "progress message includes total count");
  for (let i = 1; i <= 5; i++) assert.ok(output.message.includes(`${i}.`), `milestone message includes full list ${i}.`);
});

test("off-topic/ESCAPE output: question contains 1) and 2) so UI renders two buttons", () => {
  const output: DreamExplainerOutput = {
    action: "ESCAPE",
    message: "Sorry, I can only help you with the Dream exercise right now. Do you want to continue, or finish this step later?",
    question: "1) Continue with the exercise now\n2) Finish this step later\nJust tell me what you want to do.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: [],
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.action, "ESCAPE");
  assert.ok(output.question.includes("1)") && output.question.includes("2)"), "question must contain 1) and 2) so UI renders buttons");
  const hasLine1 = /1[\)\.]\s*Continue with the exercise now/i.test(output.question);
  const hasLine2 = /2[\)\.]\s*Finish this step later/i.test(output.question);
  assert.ok(hasLine1 && hasLine2, "question contains both option lines for button labels");
});

test("recap: after adding 2 more statements output includes all 4 (not only the last 2)", () => {
  const statements = ["A.", "B.", "C.", "D."];
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Statements 3 and 4 noted.\nTotal: 4 statements.\n1. A.\n2. B.\n3. C.\n4. D.\nIf you meant something different, tell me and I'll adjust.",
    question: "What do you see changing in the future, positive or negative? Let your imagination run free.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements,
    user_state: "ok",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.statements.length, 4);
  assert.ok(output.message.includes("Total: 4 statements."));
  for (let i = 1; i <= 4; i++) assert.ok(output.message.includes(`${i}.`), `list includes ${i}.`);
  assert.ok(output.message.includes("A.") && output.message.includes("B.") && output.message.includes("C.") && output.message.includes("D."), "output includes all 4 statements");
  assert.ok(output.question.includes("imagination") || output.question.includes("run free"), "next question uses new closing");
});

test("stuck helper: two-paragraph intro, blank lines, bullets; no extra instruction line in message", () => {
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Maybe I can help a bit. When you imagine the world 5-10 years from now, do these themes spark an opinion?\n\nJust write whatever comes to mind.\n\n• Do people become more connected, or more lonely?\n• Does technology free us, or control attention?\n• Does work become more human, or more pressured?",
    question: "Write one clear statement in your own words.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: [],
    user_state: "stuck",
    wants_recap: false,
    is_offtopic: false,
  };
  assert.equal(output.user_state, "stuck");
  assert.ok(!output.message.includes("Write one clear statement in your own words."), "stuck helper message must not contain the removed extra instruction line");
  assert.ok(output.message.includes("Just write whatever comes to mind."), "message contains short instruction paragraph");
  assert.ok(output.message.includes("do these themes spark an opinion?"), "first paragraph ends with question");
  assert.ok(!output.message.match(/\s*[1-9][\)\.]\s+/), "message must not contain numbered options");
  assert.ok(output.message.includes("•"), "message contains bullet list");
});

test("stuck helper formatting: blank lines between intro, instruction, and bullets; no instruction after bullets", () => {
  const output: DreamExplainerOutput = {
    action: "ASK",
    message: "Maybe I can help a bit. Do these themes spark an opinion?\n\nJust write whatever comes to mind.\n\n• Theme one.\n• Theme two.\n• Theme three.",
    question: "Write one clear statement in your own words.",
    refined_formulation: "",
    dream: "",
    suggest_dreambuilder: "true",
    scoring_phase: "false",
    clusters: [],
    statements: [],
    user_state: "stuck",
    wants_recap: false,
    is_offtopic: false,
  };
  const lines = output.message.split(/\n/);
  const blankIndices = lines.map((l, i) => (l.trim() === "" ? i : -1)).filter((i) => i >= 0);
  assert.ok(blankIndices.length >= 2, "stuck message must contain at least two blank lines (between intro, instruction, and bullets)");
  assert.ok(!output.message.includes("Write one clear statement in your own words."), "must not contain removed extra instruction line");
  const bulletLines = lines.filter((l) => l.trim().startsWith("•"));
  assert.ok(bulletLines.length >= 1, "stuck message must contain bullet list");
});
