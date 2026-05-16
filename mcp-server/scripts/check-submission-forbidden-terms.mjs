#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = ["src", "ui", "dist"].map((entry) => path.join(root, entry));
const ignoredDirs = new Set(["node_modules", ".git", ".cache"]);
const textExts = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
]);
const blocked = [
  ["he", "ygen"].join(""),
  ["app", ".", "he", "ygen", ".", "com"].join(""),
  ["fra", "me", "Domains"].join(""),
  ["fra", "me", "_", "domains"].join(""),
  ["<", "if", "rame"].join(""),
  ["open", "External"].join(""),
  ["redirect", "_", "domains"].join(""),
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!textExts.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(full);
  }
  return files;
}

const findings = [];
for (const file of roots.flatMap((dir) => walk(dir))) {
  const text = fs.readFileSync(file, "utf8");
  const lower = text.toLowerCase();
  for (const term of blocked) {
    const index = lower.indexOf(term.toLowerCase());
    if (index === -1) continue;
    const before = text.slice(0, index);
    const line = before.split(/\r?\n/).length;
    findings.push(`${path.relative(root, file)}:${line}: ${term}`);
  }
}

if (findings.length > 0) {
  console.error("[check-submission-forbidden-terms] blocked submission terms found:");
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log("[check-submission-forbidden-terms] ok");
