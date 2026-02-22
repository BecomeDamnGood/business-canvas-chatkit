import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const uiLibDir = path.join(repoRoot, "ui", "lib");
const uiBundlePath = path.join(repoRoot, "ui", "step-card.bundled.html");
const distBundlePath = path.join(repoRoot, "dist", "ui", "step-card.bundled.html");

const issues = [];

function pushIssue(message) {
  issues.push(message);
}

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    pushIssue(`missing file: ${filePath}`);
    return "";
  }
}

function assertIncludes(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    pushIssue(`${context} missing marker: ${needle}`);
  }
}

function assertExcludes(haystack, needle, context) {
  if (haystack.includes(needle)) {
    pushIssue(`${context} contains stale marker: ${needle}`);
  }
}

const tsFiles = fs
  .readdirSync(uiLibDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name)
  .sort();

for (const tsName of tsFiles) {
  const jsName = tsName.replace(/\.ts$/, ".js");
  const jsPath = path.join(uiLibDir, jsName);
  if (!fs.existsSync(jsPath)) {
    pushIssue(`missing JS counterpart for ${path.join("ui", "lib", tsName)}`);
  }
}

const srcRenderTs = readUtf8(path.join(uiLibDir, "ui_render.ts"));
const srcRenderJs = readUtf8(path.join(uiLibDir, "ui_render.js"));
const srcActionsTs = readUtf8(path.join(uiLibDir, "ui_actions.ts"));
const srcActionsJs = readUtf8(path.join(uiLibDir, "ui_actions.js"));
const srcMainTs = readUtf8(path.join(uiLibDir, "main.ts"));
const srcMainJs = readUtf8(path.join(uiLibDir, "main.js"));
const uiBundle = readUtf8(uiBundlePath);
const distBundle = readUtf8(distBundlePath);

assertIncludes(
  srcRenderTs,
  'ensureBootstrapRetryForResult(result, { source: "render" });',
  "ui/lib/ui_render.ts"
);
assertIncludes(srcRenderTs, "const bootstrapWaitingLocale =", "ui/lib/ui_render.ts");
assertExcludes(srcRenderTs, "pendingNonEnglishByState", "ui/lib/ui_render.ts");

assertIncludes(srcRenderJs, "ensureBootstrapRetryForResult(result, { source: \"render\" });", "ui/lib/ui_render.js");
assertIncludes(srcRenderJs, "const bootstrapWaitingLocale =", "ui/lib/ui_render.js");
assertExcludes(srcRenderJs, "pendingNonEnglishByState", "ui/lib/ui_render.js");

assertIncludes(srcActionsTs, "export function ensureBootstrapRetryForResult(", "ui/lib/ui_actions.ts");
assertIncludes(srcActionsJs, "export function ensureBootstrapRetryForResult(", "ui/lib/ui_actions.js");
assertExcludes(srcActionsTs, "__locale_wait_retry", "ui/lib/ui_actions.ts");
assertExcludes(srcActionsJs, "__locale_wait_retry", "ui/lib/ui_actions.js");

assertIncludes(
  srcMainTs,
  'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });',
  "ui/lib/main.ts"
);
assertIncludes(srcMainTs, 'callRunStep("ACTION_START", { started: "true" });', "ui/lib/main.ts");
assertExcludes(srcMainTs, "if (hasToolOutput())", "ui/lib/main.ts");
assertIncludes(
  srcMainJs,
  'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });',
  "ui/lib/main.js"
);
assertIncludes(srcMainJs, 'callRunStep("ACTION_START", { started: "true" });', "ui/lib/main.js");
assertExcludes(srcMainJs, "if (hasToolOutput())", "ui/lib/main.js");

for (const [label, content] of [
  ["ui/step-card.bundled.html", uiBundle],
  ["dist/ui/step-card.bundled.html", distBundle],
]) {
  assertIncludes(content, "ensureBootstrapRetryForResult(result, { source: \"render\" });", label);
  assertIncludes(content, 'handleToolResultAndMaybeScheduleBootstrapRetry(payload, { source: "set_globals" });', label);
  assertIncludes(content, ".skeleton-line", label);
  assertIncludes(content, "@keyframes skeletonShimmer", label);
  assertExcludes(content, "pendingNonEnglishByState", label);
  assertExcludes(content, "__locale_wait_retry", label);
}

if (uiBundle && distBundle && uiBundle !== distBundle) {
  pushIssue("bundle mismatch: ui/step-card.bundled.html differs from dist/ui/step-card.bundled.html");
}

if (issues.length > 0) {
  console.error("[ui_artifact_parity_check] failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("[ui_artifact_parity_check] passed");
