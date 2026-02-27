import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const selfScriptRelPath = path.relative(repoRoot, fileURLToPath(import.meta.url));

const briefPath = path.join(repoRoot, "docs/hard_refactoring_2026-02-27.md");
const manifestPath = path.join(repoRoot, "docs/hard_refactoring_sweep_manifest_2026-02-27.md");
const livingPath = path.join(repoRoot, "docs/mcp_widget_regressie_living_rapport.md");

function fail(message, extra = []) {
  console.error(`[hard_refactor_gate] ${message}`);
  for (const line of extra) console.error(`- ${line}`);
  process.exit(1);
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) fail(`missing required file: ${path.relative(repoRoot, filePath)}`);
  return fs.readFileSync(filePath, "utf8");
}

function gitLsFiles(args) {
  const output = execFileSync("git", ["ls-files", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function loadManifestEntries(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);
  const re = /^\s*-\s*\[(reviewed|changed|deleted)\]\s+(.+?)\s*$/i;
  for (const line of lines) {
    const match = line.match(re);
    if (!match) continue;
    entries.push({
      status: String(match[1]).toLowerCase(),
      file: String(match[2]).trim().replace(/^`|`$/g, ""),
    });
  }
  return entries;
}

function fileContentHasPattern(file, pattern) {
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) return false;
  const text = fs.readFileSync(full, "utf8");
  return pattern.test(text);
}

const brief = readText(briefPath);
if (!brief.includes("ALL FILES Sweep Protocol")) {
  fail("briefing is missing ALL FILES Sweep Protocol section");
}

const manifest = readText(manifestPath);
if (!manifest.includes("# Hard Refactoring Sweep Manifest")) {
  fail("manifest header missing or malformed");
}

const entries = loadManifestEntries(manifest);
if (entries.length === 0) {
  fail("manifest has no status entries", ["Use lines like: - [reviewed] mcp-server/src/..."]);
}

const sweepScope = uniqueSorted([
  ...gitLsFiles(["mcp-server/server.ts"]),
  ...gitLsFiles(["mcp-server/src/**/*.ts"]),
  ...gitLsFiles(["mcp-server/ui/lib/**/*.ts"]),
  ...gitLsFiles(["mcp-server/scripts/**/*.mjs"]),
]);

if (sweepScope.length === 0) {
  fail("sweep scope resolved to zero files");
}

const filesInManifest = uniqueSorted(entries.map((entry) => entry.file));
const missingFromManifest = sweepScope.filter((file) => !filesInManifest.includes(file));
if (missingFromManifest.length > 0) {
  fail("manifest does not cover all files in scope", missingFromManifest.slice(0, 80));
}

const invalidStates = [];
for (const entry of entries) {
  const full = path.join(repoRoot, entry.file);
  const exists = fs.existsSync(full);
  if (entry.status === "deleted" && exists) {
    invalidStates.push(`${entry.file} marked deleted but still exists`);
  }
  if ((entry.status === "reviewed" || entry.status === "changed") && !exists) {
    invalidStates.push(`${entry.file} marked ${entry.status} but file does not exist`);
  }
}
if (invalidStates.length > 0) {
  fail("manifest has invalid status/file combinations", invalidStates.slice(0, 80));
}

const modeDecisionFiles = sweepScope.filter((file) =>
  fileContentHasPattern(file, /ui\.view\.mode\s*=|uiView\.mode\s*=/g)
);
if (modeDecisionFiles.length > 1) {
  fail("multiple mode-decision code paths detected", modeDecisionFiles);
}

const bannedTermPatterns = [
  { name: "interactive_missing_content", re: /interactive_missing_content/ },
  { name: "forced_prestart", re: /forced_prestart/ },
  { name: "forced_blocked", re: /forced_blocked/ },
  { name: "guard_patch_applied", re: /guard_patch_applied/ },
];

const bannedHits = [];
for (const file of sweepScope) {
  if (file === selfScriptRelPath) continue;
  for (const { name, re } of bannedTermPatterns) {
    if (fileContentHasPattern(file, re)) bannedHits.push(`${name} -> ${file}`);
  }
}
if (bannedHits.length > 0) {
  fail("legacy guard/fallback markers still present", bannedHits.slice(0, 120));
}

const living = readText(livingPath);
if (!living.includes("hard_refactoring_2026-02-27.md")) {
  fail("living report does not mention hard refactoring briefing", ["Add explicit completion/report entry in living report."]);
}

console.log(`[hard_refactor_gate] passed`);
console.log(`[hard_refactor_gate] scope files: ${sweepScope.length}`);
console.log(`[hard_refactor_gate] manifest entries: ${entries.length}`);
