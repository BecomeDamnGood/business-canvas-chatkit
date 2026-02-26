#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const MAX_FACTORY_DEPS = 12;

const FACTORY_TARGETS = [
  {
    factory: "createRunStepRouteHelpers",
    typeName: "RunStepRoutePorts",
    relativePath: ["src", "handlers", "run_step_ports.ts"],
    exception: 0,
  },
  {
    factory: "createRunStepPipelineHelpers",
    typeName: "RunStepPipelinePorts",
    relativePath: ["src", "handlers", "run_step_ports.ts"],
    exception: 0,
  },
];

function resolveProjectRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..", "..");
}

function loadSourceFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function propertyNameText(name) {
  if (!name) return "";
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return "";
}

function readTopLevelPortKeys(sourceFile, typeName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    if (statement.name.text !== typeName) continue;

    if (!ts.isTypeLiteralNode(statement.type)) {
      throw new Error(`${typeName} is not a type literal; cannot enforce DI budget.`);
    }

    return statement.type.members
      .filter((member) => ts.isPropertySignature(member))
      .map((member) => propertyNameText(member.name))
      .filter(Boolean);
  }

  throw new Error(`Type alias ${typeName} was not found.`);
}

function main() {
  const projectRoot = resolveProjectRoot();
  const violations = [];

  console.log(`[run_step_di_budget_check] max_factory_deps=${MAX_FACTORY_DEPS}`);

  for (const target of FACTORY_TARGETS) {
    const absPath = path.join(projectRoot, ...target.relativePath);
    if (!fs.existsSync(absPath)) {
      violations.push(`${target.factory}: missing file ${absPath}`);
      continue;
    }

    const sourceFile = loadSourceFile(absPath);
    const keys = readTopLevelPortKeys(sourceFile, target.typeName);
    const budget = MAX_FACTORY_DEPS + Number(target.exception || 0);

    console.log(
      `[run_step_di_budget_check] ${target.factory} -> ${target.typeName}: top_level_deps=${keys.length}, budget=${budget}, exception=${target.exception}`
    );

    if ((target.exception || 0) !== 0) {
      violations.push(`${target.factory}: exception must remain 0 (found ${target.exception}).`);
    }

    if (keys.length > budget) {
      violations.push(
        `${target.factory}: dependency budget exceeded (${keys.length} > ${budget}). keys=[${keys.join(", ")}]`
      );
    }
  }

  if (violations.length > 0) {
    console.error("[run_step_di_budget_check] FAIL");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("[run_step_di_budget_check] Action: split dependency ports into smaller service bundles.");
    process.exit(1);
  }

  console.log("[run_step_di_budget_check] PASS");
}

main();
