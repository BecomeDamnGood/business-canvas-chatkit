#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PHASE_ORDER = ["phase_R0", "phase_R1", "phase_R2", "phase_R3", "phase_R4"];
const PHASE_BUDGETS = Object.freeze({
  phase_R0: { maxTotalImports: 20, maxExternalImports: 2, minLocalHandlerImports: 7 },
  phase_R1: { maxTotalImports: 19, maxExternalImports: 2, minLocalHandlerImports: 7 },
  phase_R2: { maxTotalImports: 18, maxExternalImports: 2, minLocalHandlerImports: 7 },
  phase_R3: { maxTotalImports: 17, maxExternalImports: 2, minLocalHandlerImports: 8 },
  phase_R4: { maxTotalImports: 16, maxExternalImports: 2, minLocalHandlerImports: 8 },
  stretch: { maxTotalImports: 16, maxExternalImports: 2, minLocalHandlerImports: 8 },
});

const ALLOWED_LOCAL_HANDLER_IMPORTS = [
  /^\.\/(ingress|specialist_dispatch|turn_contract)\.js$/,
  /^\.\/run_step_[a-z0-9_]+\.js$/,
  /^\.\/run_step_[a-z0-9_]+\/index\.js$/,
];

const DISALLOWED_SEGMENTS = [/\/dist\//, /\/__tests__\//, /\/test\//, /\/scripts\//];

function readRequestedPhase() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--phase") return argv[i + 1] || "";
    if (argv[i].startsWith("--phase=")) return argv[i].slice("--phase=".length);
  }
  return process.env.RUN_STEP_RUNTIME_BOUNDARY_PHASE || process.env.RUN_STEP_RUNTIME_ARCH_PHASE || "phase_R0";
}

function resolveRuntimePath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return path.join(mcpServerRoot, "src", "handlers", "run_step_runtime.ts");
}

function assertBudgetOrder() {
  for (let i = 1; i < PHASE_ORDER.length; i += 1) {
    const prev = PHASE_BUDGETS[PHASE_ORDER[i - 1]];
    const cur = PHASE_BUDGETS[PHASE_ORDER[i]];
    if (cur.maxTotalImports > prev.maxTotalImports) {
      throw new Error(`Invalid runtime boundary ordering: ${PHASE_ORDER[i]}.maxTotalImports increased.`);
    }
    if (cur.maxExternalImports > prev.maxExternalImports) {
      throw new Error(`Invalid runtime boundary ordering: ${PHASE_ORDER[i]}.maxExternalImports increased.`);
    }
    if (cur.minLocalHandlerImports < prev.minLocalHandlerImports) {
      throw new Error(`Invalid runtime boundary ordering: ${PHASE_ORDER[i]}.minLocalHandlerImports decreased.`);
    }
  }
}

function parseImports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return sourceFile.statements
    .filter((node) => ts.isImportDeclaration(node))
    .map((node) => {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const moduleSpecifier = node.moduleSpecifier;
      const spec = ts.isStringLiteral(moduleSpecifier) ? moduleSpecifier.text : "";
      return { spec, line };
    });
}

function classifyImport(spec) {
  if (spec.startsWith("node:")) return "node";
  if (!spec.startsWith(".")) return "external";
  if (spec.startsWith("./")) return "local_handlers";
  if (spec.startsWith("../")) return "parent_relative";
  return "unknown_relative";
}

function main() {
  assertBudgetOrder();
  const phase = readRequestedPhase();
  const budget = PHASE_BUDGETS[phase];
  if (!budget) {
    console.error(`[run_step_runtime_boundary_check] unknown phase "${phase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const runtimePath = resolveRuntimePath();
  if (!fs.existsSync(runtimePath)) {
    console.error(`[run_step_runtime_boundary_check] missing file: ${runtimePath}`);
    process.exit(1);
  }

  const imports = parseImports(runtimePath);
  const counts = { total: imports.length, external: 0, local_handlers: 0 };
  const violations = [];

  for (const entry of imports) {
    const category = classifyImport(entry.spec);
    if (category === "external") counts.external += 1;
    if (category === "local_handlers") counts.local_handlers += 1;

    if (category === "parent_relative") {
      violations.push(`parent-relative import "${entry.spec}" at line ${entry.line} is not allowed in runtime owner`);
    }
    if (category === "unknown_relative") {
      violations.push(`unsupported relative import "${entry.spec}" at line ${entry.line}`);
    }
    if (category === "local_handlers") {
      const allowed = ALLOWED_LOCAL_HANDLER_IMPORTS.some((pattern) => pattern.test(entry.spec));
      if (!allowed) {
        violations.push(`local runtime import "${entry.spec}" at line ${entry.line} is outside allowed runtime-module patterns`);
      }
      if (entry.spec === "./run_step.js") {
        violations.push(`runtime owner import "${entry.spec}" at line ${entry.line} re-enters facade boundary`);
      }
    }
    if (DISALLOWED_SEGMENTS.some((pattern) => pattern.test(entry.spec))) {
      violations.push(`import "${entry.spec}" at line ${entry.line} crosses forbidden boundary segment`);
    }
  }

  const budgetViolations = [];
  if (counts.total > budget.maxTotalImports) {
    budgetViolations.push(`total imports ${counts.total} > ${budget.maxTotalImports}`);
  }
  if (counts.external > budget.maxExternalImports) {
    budgetViolations.push(`external imports ${counts.external} > ${budget.maxExternalImports}`);
  }
  if (counts.local_handlers < budget.minLocalHandlerImports) {
    budgetViolations.push(`local runtime imports ${counts.local_handlers} < ${budget.minLocalHandlerImports}`);
  }

  console.log(`[run_step_runtime_boundary_check] phase=${phase}`);
  console.log(
    `[run_step_runtime_boundary_check] counts: total=${counts.total}, external=${counts.external}, local_handlers=${counts.local_handlers}`
  );

  if (violations.length > 0 || budgetViolations.length > 0) {
    console.error("[run_step_runtime_boundary_check] FAIL");
    for (const violation of violations) console.error(`- ${violation}`);
    for (const violation of budgetViolations) console.error(`- budget: ${violation}`);
    console.error("[run_step_runtime_boundary_check] Action: keep runtime as local-owner composition and avoid cross-layer imports.");
    process.exit(1);
  }

  console.log("[run_step_runtime_boundary_check] PASS");
}

main();
