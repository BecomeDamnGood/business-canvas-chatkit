#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCOPE_DIRS = [
  "mcp-server/src",
  "mcp-server/ui/lib",
];
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const EXCLUDE_PATTERNS = [
  /\.d\.ts$/i,
  /\/dist\//,
  /\/node_modules\//,
  /\/coverage\//,
  /\.snap$/i,
];

// High-signal Dutch tokens/phrases for code and tests in scope.
const DENY_PATTERNS = [
  /\bkies\b/i,
  /\bselecteer\b/i,
  /\bdoelgroep\b/i,
  /\bspelregels\b/i,
  /\bherschrijf\w*\b/i,
  /\bopnieuw\b/i,
  /\bherstart\b/i,
  /\bvoorheen\b/i,
  /\bbedrijfsnaam\b/i,
  /\bvalidatie\b/i,
  /\bje\s+presentatie\b/i,
  /\bhet\s+maken\s+van\s+de\s+presentatie\b/i,
  /\bwil\s+je\b/i,
  /\bja,\s*ik\s*ben\s*er\s*klaar\s*voor\b/i,
];

function isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function collectFiles(dir) {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) return [];
  const out = [];
  const stack = [absDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(ROOT, fullPath).replace(/\\/g, "/");
      if (isExcluded(relPath)) continue;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!FILE_EXTENSIONS.has(path.extname(entry.name))) continue;
      out.push(relPath);
    }
  }
  return out;
}

function checkFile(filePath) {
  const text = fs.readFileSync(path.join(ROOT, filePath), "utf8");
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    const isCommentOnly = /^\s*\/\//.test(line) || /^\s*\*/.test(line);
    const hasQuote = /["'`]/.test(line);
    if (!isCommentOnly && !hasQuote) continue;
    const matched = DENY_PATTERNS.find((pattern) => pattern.test(line));
    if (!matched) continue;
    violations.push({
      file: filePath,
      line: i + 1,
      pattern: String(matched),
      text: line.trim(),
    });
  }
  return violations;
}

function main() {
  const files = SCOPE_DIRS.flatMap((dir) => collectFiles(dir));
  const violations = files.flatMap((file) => checkFile(file));
  if (violations.length === 0) {
    console.log("[i18n_literal_guard] ok: no blocked non-English literals found in scoped files.");
    return;
  }

  console.error(`[i18n_literal_guard] found ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} ${v.text}`);
  }
  process.exit(1);
}

main();
