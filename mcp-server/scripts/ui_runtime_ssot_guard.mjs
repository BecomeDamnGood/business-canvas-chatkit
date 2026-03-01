#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(__dirname, "..");

function fail(message, extra = []) {
  console.error(`[ui_runtime_ssot_guard] ${message}`);
  for (const line of extra) console.error(`- ${line}`);
  process.exit(1);
}

function readFile(relPath) {
  const fullPath = path.join(mcpRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    fail("required file missing", [relPath]);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    fail("required marker missing", [label, `needle: ${needle}`]);
  }
}

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    fail("forbidden marker present", [label, `needle: ${needle}`]);
  }
}

function assertNotMatch(source, pattern, label) {
  if (pattern.test(source)) {
    fail("forbidden pattern present", [label, `pattern: ${String(pattern)}`]);
  }
}

function collectTsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const bundled = readFile("ui/step-card.bundled.html");
const httpRoutes = readFile("src/server/http_routes.ts");
const transport = readFile("src/server/run_step_transport.ts");
const contractDoc = readFile("docs/ui-interface-contract.md");

assertIncludes(bundled, "function extractWidgetResult(raw)", "bundled extractor owner");
assertIncludes(bundled, "toRecord(toRecord(root._meta).widget_result)", "bundled root _meta wrapper");
assertIncludes(bundled, "toRecord(root.toolResponseMetadata)", "bundled toolResponseMetadata wrapper");
assertIncludes(
  bundled,
  "toRecord(toolResponseMetadata.widget_result)",
  "bundled toolResponseMetadata.widget_result wrapper"
);
assertIncludes(bundled, "toRecord(toRecord(structured._meta).widget_result)", "bundled structured _meta wrapper");
assertIncludes(bundled, "toRecord(toRecord(toolOutput._meta).widget_result)", "bundled toolOutput _meta wrapper");
assertIncludes(bundled, 'window.addEventListener("openai:set_globals"', "bundled openai:set_globals owner");
assertIncludes(bundled, 'window.addEventListener("openai:notification"', "bundled openai:notification owner");
assertIncludes(bundled, 'if (method !== "ui/notifications/tool-result")', "bundled notification method gate");
assertIncludes(bundled, "var toolResponseMetadata = toRecord(openai.toolResponseMetadata);", "bundled initial metadata read");
assertNotIncludes(bundled, "toRecord(root.result)", "bundled root.result non-authority");
assertNotIncludes(bundled, "toRecord(structured.result)", "bundled structured.result non-authority");
assertNotMatch(bundled, /toolOutput\._widget_result/, "bundled legacy toolOutput alias non-authority");
assertNotMatch(bundled, /root\._widget_result/, "bundled legacy root alias non-authority");
assertNotMatch(bundled, /structuredContent\._widget_result/, "bundled legacy structured alias non-authority");

assertIncludes(httpRoutes, 'filePath = path.join(uiDir, "step-card.bundled.html");', "server serves bundled runtime");
assertIncludes(transport, 'readFileSync(new URL("../../ui/step-card.bundled.html", import.meta.url), "utf-8")', "server loads bundled runtime");
assertIncludes(contractDoc, "Runtime UI source of truth: `ui/step-card.bundled.html`.", "contract SSOT declaration");

const serverDir = path.join(mcpRoot, "src", "server");
const serverTsFiles = collectTsFiles(serverDir);
const serverUiLibRefs = [];
for (const filePath of serverTsFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes("/ui/lib") || source.includes("../ui/lib") || source.includes("../../ui/lib")) {
    serverUiLibRefs.push(path.relative(mcpRoot, filePath));
  }
}
if (serverUiLibRefs.length > 0) {
  fail("server runtime imports ui/lib (forbidden for SSOT runtime ownership)", serverUiLibRefs);
}

console.log("[ui_runtime_ssot_guard] PASS checks=19");
