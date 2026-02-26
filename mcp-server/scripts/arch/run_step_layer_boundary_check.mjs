#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CHECK_ID = "run_step_layer_boundary_check";

const CORE_FORBIDDEN_SEGMENTS = ["../handlers/", "../adapters/", "../steps/", "../i18n/"];
const ORCHESTRATION_FORBIDDEN_SEGMENTS = ["../steps/", "../adapters/"];
const HANDLERS_FORBIDDEN_SEGMENTS = ["../adapters/"];

const ORCHESTRATION_OWNER_FILES = [
  "run_step_runtime.ts",
  "run_step_routes.ts",
  "run_step_pipeline.ts",
  "run_step_preflight.ts",
];

const RUNTIME_DEPENDENCY_HUB_SPEC = "./run_step_dependencies.js";
const MAX_RUNTIME_DEPENDENCY_HUB_IMPORTS = 70;

function resolveProjectRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..", "..");
}

function listTypeScriptFiles(dirPath) {
  const out = [];
  const queue = [dirPath];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__golden__") continue;
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.endsWith(".ts")) continue;
      if (fullPath.endsWith(".test.ts")) continue;
      out.push(fullPath);
    }
  }
  return out.sort();
}

function parseImportRefs(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refs = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) continue;
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
      refs.push({ spec: moduleSpecifier.text, line });
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
      refs.push({ spec: statement.moduleSpecifier.text, line });
    }
  }

  return refs;
}

function readNamedImportCount(filePath, targetSpecifier) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== targetSpecifier) continue;

    const clause = statement.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      return 0;
    }
    return clause.namedBindings.elements.length;
  }
  return 0;
}

function hasForbiddenPrefix(spec, forbidden) {
  return forbidden.some((prefix) => spec.startsWith(prefix));
}

function severityRank(level) {
  if (level === "HIGH") return 0;
  if (level === "MEDIUM") return 1;
  return 2;
}

function main() {
  const projectRoot = resolveProjectRoot();
  const coreDir = path.join(projectRoot, "src", "core");
  const handlersDir = path.join(projectRoot, "src", "handlers");
  const coreFiles = listTypeScriptFiles(coreDir);
  const handlerFiles = listTypeScriptFiles(handlersDir);
  const orchestrationFiles = ORCHESTRATION_OWNER_FILES.map((name) => path.join(handlersDir, name));

  const violations = [];
  const pushViolation = ({ severity, rule, filePath, line, spec, reason }) => {
    violations.push({
      severity,
      rule,
      filePath: path.relative(projectRoot, filePath).replace(/\\/g, "/"),
      line,
      spec,
      reason,
    });
  };

  for (const filePath of coreFiles) {
    const refs = parseImportRefs(filePath);
    for (const ref of refs) {
      if (!ref.spec.startsWith("..")) continue;
      if (!hasForbiddenPrefix(ref.spec, CORE_FORBIDDEN_SEGMENTS)) continue;
      pushViolation({
        severity: "HIGH",
        rule: "core_no_handler_adapter_step_i18n_imports",
        filePath,
        line: ref.line,
        spec: ref.spec,
        reason: "Core modules may not depend on handlers/adapters/steps/i18n directly.",
      });
    }
  }

  for (const filePath of orchestrationFiles) {
    if (!fs.existsSync(filePath)) {
      pushViolation({
        severity: "HIGH",
        rule: "orchestration_owner_present",
        filePath,
        line: 1,
        spec: "<missing>",
        reason: "Expected orchestration owner file is missing.",
      });
      continue;
    }
    const refs = parseImportRefs(filePath);
    for (const ref of refs) {
      if (!ref.spec.startsWith("..")) continue;
      if (!hasForbiddenPrefix(ref.spec, ORCHESTRATION_FORBIDDEN_SEGMENTS)) continue;
      pushViolation({
        severity: "HIGH",
        rule: "orchestration_no_direct_step_or_adapter_imports",
        filePath,
        line: ref.line,
        spec: ref.spec,
        reason: "Orchestration owners must consume step/adapter details through local handler modules.",
      });
    }
  }

  for (const filePath of handlerFiles) {
    const refs = parseImportRefs(filePath);
    for (const ref of refs) {
      if (!ref.spec.startsWith("..")) continue;
      if (!hasForbiddenPrefix(ref.spec, HANDLERS_FORBIDDEN_SEGMENTS)) continue;
      pushViolation({
        severity: "MEDIUM",
        rule: "handlers_no_adapter_imports",
        filePath,
        line: ref.line,
        spec: ref.spec,
        reason: "Adapter imports should not leak into handlers.",
      });
    }
  }

  const runtimePath = path.join(handlersDir, "run_step_runtime.ts");
  if (fs.existsSync(runtimePath)) {
    const namedImports = readNamedImportCount(runtimePath, RUNTIME_DEPENDENCY_HUB_SPEC);
    console.log(
      `[${CHECK_ID}] runtime_dependency_hub_imports=${namedImports}, limit=${MAX_RUNTIME_DEPENDENCY_HUB_IMPORTS}`
    );
    if (namedImports > MAX_RUNTIME_DEPENDENCY_HUB_IMPORTS) {
      pushViolation({
        severity: "MEDIUM",
        rule: "orchestration_dependency_hub_budget",
        filePath: runtimePath,
        line: 1,
        spec: RUNTIME_DEPENDENCY_HUB_SPEC,
        reason: `run_step_runtime.ts imports ${namedImports} named symbols from ${RUNTIME_DEPENDENCY_HUB_SPEC} (max ${MAX_RUNTIME_DEPENDENCY_HUB_IMPORTS}).`,
      });
    }
  }

  console.log(
    `[${CHECK_ID}] scanned core_files=${coreFiles.length}, handler_files=${handlerFiles.length}, orchestration_owners=${orchestrationFiles.length}`
  );

  if (violations.length > 0) {
    const sorted = [...violations].sort((a, b) => {
      const severityDiff = severityRank(a.severity) - severityRank(b.severity);
      if (severityDiff !== 0) return severityDiff;
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
      return a.line - b.line;
    });

    console.error(`[${CHECK_ID}] FAIL`);
    for (const violation of sorted) {
      console.error(
        `- ${violation.severity} ${violation.rule} ${violation.filePath}:${violation.line} import="${violation.spec}" reason="${violation.reason}"`
      );
    }
    process.exit(1);
  }

  console.log(`[${CHECK_ID}] PASS`);
}

main();
