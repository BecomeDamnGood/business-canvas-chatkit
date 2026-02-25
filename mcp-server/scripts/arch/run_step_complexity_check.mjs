#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PHASE_ORDER = ["baseline", "phase_A", "phase_B", "phase_C", "stretch"];
const PHASE_BUDGETS = Object.freeze({
  baseline: {
    maxTopLevelFunctions: 250,
    maxRunStepLines: 2700,
    maxRunStepCyclomatic: 760,
    maxTotalTopLevelCyclomatic: 3000,
  },
  phase_A: {
    maxTopLevelFunctions: 220,
    maxRunStepLines: 2200,
    maxRunStepCyclomatic: 620,
    maxTotalTopLevelCyclomatic: 2500,
  },
  phase_B: {
    maxTopLevelFunctions: 170,
    maxRunStepLines: 1500,
    maxRunStepCyclomatic: 450,
    maxTotalTopLevelCyclomatic: 1900,
  },
  phase_C: {
    maxTopLevelFunctions: 120,
    maxRunStepLines: 1000,
    maxRunStepCyclomatic: 280,
    maxTotalTopLevelCyclomatic: 1400,
  },
  stretch: {
    maxTopLevelFunctions: 90,
    maxRunStepLines: 700,
    maxRunStepCyclomatic: 180,
    maxTotalTopLevelCyclomatic: 1000,
  },
});

function readRequestedPhase() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--phase") {
      return argv[i + 1] || "";
    }
    if (argv[i].startsWith("--phase=")) {
      return argv[i].slice("--phase=".length);
    }
  }
  return process.env.RUN_STEP_COMPLEXITY_PHASE || process.env.RUN_STEP_ARCH_PHASE || "baseline";
}

function resolveRunStepPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return path.join(mcpServerRoot, "src", "handlers", "run_step.ts");
}

function cyclomaticComplexity(node) {
  let score = 1;

  function visit(current) {
    switch (current.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        score += 1;
        break;
      default:
        break;
    }

    if (ts.isBinaryExpression(current)) {
      const operator = current.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.AmpersandAmpersandToken
        || operator === ts.SyntaxKind.BarBarToken
        || operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        score += 1;
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return score;
}

function main() {
  const phase = readRequestedPhase();
  const budget = PHASE_BUDGETS[phase];
  if (!budget) {
    console.error(`[run_step_complexity_check] unknown phase "${phase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const runStepPath = resolveRunStepPath();
  if (!fs.existsSync(runStepPath)) {
    console.error(`[run_step_complexity_check] missing file: ${runStepPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(runStepPath, "utf8");
  const sourceFile = ts.createSourceFile(runStepPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = sourceFile.statements.filter((statement) => ts.isFunctionDeclaration(statement));

  const functionMetrics = functions.map((fn) => {
    const start = sourceFile.getLineAndCharacterOfPosition(fn.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(fn.end).line + 1;
    return {
      name: fn.name?.text || "<anonymous>",
      start,
      end,
      length: end - start + 1,
      cyclomatic: cyclomaticComplexity(fn),
    };
  });

  const runStep = functionMetrics.find((fn) => fn.name === "run_step");
  if (!runStep) {
    console.error("[run_step_complexity_check] could not find top-level function run_step.");
    process.exit(1);
  }

  const totalTopLevelCyclomatic = functionMetrics.reduce((sum, fn) => sum + fn.cyclomatic, 0);

  const violations = [];
  if (functionMetrics.length > budget.maxTopLevelFunctions) {
    violations.push(`top-level function count ${functionMetrics.length} > ${budget.maxTopLevelFunctions}`);
  }
  if (runStep.length > budget.maxRunStepLines) {
    violations.push(`run_step length ${runStep.length} > ${budget.maxRunStepLines}`);
  }
  if (runStep.cyclomatic > budget.maxRunStepCyclomatic) {
    violations.push(`run_step cyclomatic ${runStep.cyclomatic} > ${budget.maxRunStepCyclomatic}`);
  }
  if (totalTopLevelCyclomatic > budget.maxTotalTopLevelCyclomatic) {
    violations.push(`total top-level cyclomatic ${totalTopLevelCyclomatic} > ${budget.maxTotalTopLevelCyclomatic}`);
  }

  console.log(`[run_step_complexity_check] phase=${phase}`);
  console.log(
    `[run_step_complexity_check] metrics: top_level_functions=${functionMetrics.length}, run_step_lines=${runStep.length}, run_step_cyclomatic=${runStep.cyclomatic}, total_top_level_cyclomatic=${totalTopLevelCyclomatic}`
  );

  if (violations.length > 0) {
    console.error("[run_step_complexity_check] FAIL");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error("[run_step_complexity_check] Action: split full subsystems out of run_step.ts and keep orchestration in facade.");
    process.exit(1);
  }

  console.log("[run_step_complexity_check] PASS");
}

main();
