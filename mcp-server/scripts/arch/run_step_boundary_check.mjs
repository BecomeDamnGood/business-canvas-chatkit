#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PHASE_ORDER = ["baseline", "phase_A", "phase_B", "phase_C", "phase_20"];
const PHASE_BUDGETS = Object.freeze({
  baseline: {
    maxTotalImports: 40,
    maxStepImports: 14,
    maxCoreImports: 12,
    maxExternalImports: 4,
    minLocalHandlerImports: 3,
  },
  phase_A: {
    maxTotalImports: 34,
    maxStepImports: 12,
    maxCoreImports: 12,
    maxExternalImports: 4,
    minLocalHandlerImports: 3,
  },
  phase_B: {
    maxTotalImports: 28,
    maxStepImports: 10,
    maxCoreImports: 10,
    maxExternalImports: 4,
    minLocalHandlerImports: 4,
  },
  phase_C: {
    maxTotalImports: 22,
    maxStepImports: 7,
    maxCoreImports: 8,
    maxExternalImports: 4,
    minLocalHandlerImports: 5,
  },
  phase_20: {
    maxTotalImports: 14,
    maxStepImports: 4,
    maxCoreImports: 5,
    maxExternalImports: 4,
    minLocalHandlerImports: 7,
  },
  stretch: {
    maxTotalImports: 14,
    maxStepImports: 4,
    maxCoreImports: 5,
    maxExternalImports: 4,
    minLocalHandlerImports: 7,
  },
});

const ALLOWED_LOCAL_HANDLER_IMPORTS = [
  /^\.\/(ingress|turn_contract|specialist_dispatch)\.js$/,
  /^\.\/run_step_[a-z0-9_]+\.js$/,
  /^\.\/run_step_routes\/index\.js$/,
];

const DISALLOWED_SEGMENTS = [/\/dist\//, /\/__tests__\//, /\/test\//, /\/scripts\//];

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
  return process.env.RUN_STEP_BOUNDARY_PHASE || process.env.RUN_STEP_ARCH_PHASE || "baseline";
}

function resolveRunStepPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerRoot = path.resolve(scriptDir, "..", "..");
  return path.join(mcpServerRoot, "src", "handlers", "run_step.ts");
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
  if (spec.startsWith("../steps/")) return "steps";
  if (spec.startsWith("../core/")) return "core";
  if (spec.startsWith("../i18n/")) return "i18n";
  if (spec.startsWith("../adapters/")) return "adapters";
  if (spec.startsWith("../contracts/")) return "contracts";
  if (spec.startsWith("./")) return "local_handlers";
  return "unknown_relative";
}

function main() {
  const phase = readRequestedPhase();
  const budget = PHASE_BUDGETS[phase];
  if (!budget) {
    console.error(`[run_step_boundary_check] unknown phase "${phase}". Valid phases: ${PHASE_ORDER.join(", ")}`);
    process.exit(1);
  }

  const runStepPath = resolveRunStepPath();
  if (!fs.existsSync(runStepPath)) {
    console.error(`[run_step_boundary_check] missing file: ${runStepPath}`);
    process.exit(1);
  }

  const imports = parseImports(runStepPath);
  const counts = {
    total: imports.length,
    steps: 0,
    core: 0,
    external: 0,
    local_handlers: 0,
  };

  const violations = [];

  for (const entry of imports) {
    const category = classifyImport(entry.spec);
    if (Object.hasOwn(counts, category)) {
      counts[category] += 1;
    }
    if (category === "unknown_relative") {
      violations.push(`unsupported relative import "${entry.spec}" at line ${entry.line}`);
    }
    if (category === "local_handlers") {
      const allowed = ALLOWED_LOCAL_HANDLER_IMPORTS.some((pattern) => pattern.test(entry.spec));
      if (!allowed) {
        violations.push(`local handler import "${entry.spec}" at line ${entry.line} is outside allowed facade-module patterns`);
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
  if (counts.steps > budget.maxStepImports) {
    budgetViolations.push(`step imports ${counts.steps} > ${budget.maxStepImports}`);
  }
  if (counts.core > budget.maxCoreImports) {
    budgetViolations.push(`core imports ${counts.core} > ${budget.maxCoreImports}`);
  }
  if (counts.external > budget.maxExternalImports) {
    budgetViolations.push(`external imports ${counts.external} > ${budget.maxExternalImports}`);
  }
  if (counts.local_handlers < budget.minLocalHandlerImports) {
    budgetViolations.push(`local handler imports ${counts.local_handlers} < ${budget.minLocalHandlerImports}`);
  }

  console.log(`[run_step_boundary_check] phase=${phase}`);
  console.log(
    `[run_step_boundary_check] counts: total=${counts.total}, steps=${counts.steps}, core=${counts.core}, external=${counts.external}, local_handlers=${counts.local_handlers}`
  );

  if (violations.length > 0 || budgetViolations.length > 0) {
    console.error("[run_step_boundary_check] FAIL");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    for (const violation of budgetViolations) {
      console.error(`- budget: ${violation}`);
    }
    console.error("[run_step_boundary_check] Action: keep run_step.ts as facade and move domain logic behind local handler modules.");
    process.exit(1);
  }

  console.log("[run_step_boundary_check] PASS");
}

main();
