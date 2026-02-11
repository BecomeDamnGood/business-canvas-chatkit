import fs from "fs";
import path from "path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const checkMode = process.argv.includes("--check");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listFiles(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, ext));
    } else if (!ext || full.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function extractActionCodes(text) {
  const matches = text.match(/ACTION_[A-Z0-9_]+/g) || [];
  return new Set(matches);
}

function extractBackendRoutes(text) {
  const routes = new Map();
  const re = /actionCode\s*===\s*"(ACTION_[A-Z0-9_]+)"\)\s*return\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

function extractStepRoutes(text) {
  const routes = new Map();
  const re = /(ACTION_[A-Z0-9_]+)[^\n]*?(?:→|->|=>)[^A-Z0-9_]*(__ROUTE__[A-Z0-9_]+__|yes)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

function extractSectionBlock(text, sectionName) {
  const start = text.indexOf(`${sectionName}: {`);
  if (start === -1) return "";
  let i = text.indexOf("{", start);
  if (i === -1) return "";
  let depth = 0;
  let end = -1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return "";
  return text.slice(text.indexOf("{", start) + 1, end);
}

function extractObjectKeys(sectionText) {
  const keys = new Set();
  const lines = sectionText.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*:/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function extractRegistryActionRoutes(text) {
  const routes = new Map();
  const re = /(ACTION_[A-Z0-9_]+)\s*:\s*\{[^}]*?route:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    routes.set(m[1], m[2]);
  }
  return routes;
}

function extractMenuIdsFromSteps(text) {
  const ids = new Set();
  const re = /menu_id\s*(?:=|:)\s*"?([A-Z0-9_]+)"?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    if (id.includes("_")) ids.add(id);
  }
  return ids;
}

function mergeMaps(maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [k, v] of m.entries()) {
      if (!out.has(k)) out.set(k, v);
    }
  }
  return out;
}

function toSortedArray(setOrArray) {
  return Array.from(setOrArray).sort();
}

const uiFiles = [path.join(repoRoot, "mcp-server/ui/step-card.html")];
const backendFiles = [path.join(repoRoot, "mcp-server/src/handlers/run_step.ts")];
const stepsFiles = listFiles(path.join(repoRoot, "mcp-server/src/steps"), ".ts");
const docsFiles = [
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "docs/button-contract.md"),
  ...listFiles(path.join(repoRoot, "mcp-server/docs"), ".md"),
];
const distFiles = listFiles(path.join(repoRoot, "mcp-server/dist"), ".js");
const registryFile = path.join(repoRoot, "mcp-server/src/core/actioncode_registry.ts");

const uiCodes = new Set();
const backendCodes = new Set();
const stepsCodes = new Set();
const docsCodes = new Set();
const distCodes = new Set();

for (const f of uiFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) uiCodes.add(c);
  }
}

for (const f of backendFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) backendCodes.add(c);
  }
}

for (const f of stepsFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) stepsCodes.add(c);
  }
}

for (const f of docsFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) docsCodes.add(c);
  }
}

for (const f of distFiles) {
  if (fs.existsSync(f)) {
    for (const c of extractActionCodes(readFile(f))) distCodes.add(c);
  }
}

const registryText = fs.existsSync(registryFile) ? readFile(registryFile) : "";
const registryActionsSection = extractSectionBlock(registryText, "actions");
const registryMenusSection = extractSectionBlock(registryText, "menus");
const registryActionKeys = extractObjectKeys(registryActionsSection);
const registryMenuIds = extractObjectKeys(registryMenusSection);
const registryActionRoutes = extractRegistryActionRoutes(registryText);
const registryMenuActionCodes = extractActionCodes(registryMenusSection);

const menuIdsFromSteps = new Set();
for (const f of stepsFiles) {
  if (!fs.existsSync(f)) continue;
  const text = readFile(f);
  for (const id of extractMenuIdsFromSteps(text)) menuIdsFromSteps.add(id);
}

const contractErrors = [];
const missingMenuIds = toSortedArray([...menuIdsFromSteps].filter((id) => !registryMenuIds.has(id)));
if (missingMenuIds.length) {
  contractErrors.push({ type: "missing_menu_ids_in_registry", items: missingMenuIds });
}
const missingActionRoutes = toSortedArray([...registryActionKeys].filter((code) => !registryActionRoutes.has(code)));
if (missingActionRoutes.length) {
  contractErrors.push({ type: "missing_routes_for_registry_actions", items: missingActionRoutes });
}
const missingMenuActionCodes = toSortedArray([...registryMenuActionCodes].filter((code) => !registryActionKeys.has(code)));
if (missingMenuActionCodes.length) {
  contractErrors.push({ type: "menu_action_missing_in_registry_actions", items: missingMenuActionCodes });
}

const allCodes = new Set([
  ...uiCodes,
  ...backendCodes,
  ...stepsCodes,
  ...docsCodes,
  ...distCodes,
]);

const uiOnly = toSortedArray([...uiCodes].filter((c) => !backendCodes.has(c) && !stepsCodes.has(c) && !docsCodes.has(c)));
const backendOnly = toSortedArray([...backendCodes].filter((c) => !uiCodes.has(c) && !stepsCodes.has(c) && !docsCodes.has(c)));
const stepsOnly = toSortedArray([...stepsCodes].filter((c) => !uiCodes.has(c) && !backendCodes.has(c) && !docsCodes.has(c)));
const docsOnly = toSortedArray([...docsCodes].filter((c) => !uiCodes.has(c) && !backendCodes.has(c) && !stepsCodes.has(c)));

const backendRouteMaps = backendFiles.map((f) => (fs.existsSync(f) ? extractBackendRoutes(readFile(f)) : new Map()));
const stepsRouteMaps = stepsFiles.map((f) => (fs.existsSync(f) ? extractStepRoutes(readFile(f)) : new Map()));
const backendRoutes = mergeMaps(backendRouteMaps);
const stepsRoutes = mergeMaps(stepsRouteMaps);

const routeMismatch = [];
for (const code of allCodes) {
  const backendRoute = backendRoutes.get(code);
  const stepsRoute = stepsRoutes.get(code);
  if (backendRoute && stepsRoute && backendRoute !== stepsRoute) {
    routeMismatch.push({ code, backend: backendRoute, steps: stepsRoute });
  }
}
routeMismatch.sort((a, b) => a.code.localeCompare(b.code));

const srcUnion = new Set([...uiCodes, ...backendCodes, ...stepsCodes, ...docsCodes]);
const distOnly = toSortedArray([...distCodes].filter((c) => !srcUnion.has(c)));
const srcOnly = toSortedArray([...srcUnion].filter((c) => !distCodes.has(c)));

const report = {
  generated_at: new Date().toISOString(),
  sources: {
    ui: uiFiles.map((p) => path.relative(repoRoot, p)),
    backend: backendFiles.map((p) => path.relative(repoRoot, p)),
    steps: stepsFiles.map((p) => path.relative(repoRoot, p)).sort(),
    docs: docsFiles.map((p) => path.relative(repoRoot, p)).sort(),
    dist: distFiles.map((p) => path.relative(repoRoot, p)).sort(),
  },
  codes: {
    ui: toSortedArray(uiCodes),
    backend: toSortedArray(backendCodes),
    steps: toSortedArray(stepsCodes),
    docs: toSortedArray(docsCodes),
    dist: toSortedArray(distCodes),
  },
  buckets: {
    ui_only: uiOnly,
    backend_only: backendOnly,
    steps_only: stepsOnly,
    docs_only: docsOnly,
  },
  route_mismatch: routeMismatch,
  dist_drift: {
    dist_only: distOnly,
    src_only: srcOnly,
  },
  contract_checks: {
    registry_file: path.relative(repoRoot, registryFile),
    missing_menu_ids_in_registry: missingMenuIds,
    missing_routes_for_registry_actions: missingActionRoutes,
    menu_action_missing_in_registry_actions: missingMenuActionCodes,
  },
};

const outPath = path.join(repoRoot, "docs/actioncode-diff.json");
const output = JSON.stringify(report, null, 2) + "\n";

if (distOnly.length || srcOnly.length) {
  console.warn(`::warning ::dist drift detected (dist_only=${distOnly.length}, src_only=${srcOnly.length})`);
}

if (contractErrors.length) {
  console.error("Contract checks failed:", JSON.stringify(contractErrors, null, 2));
  if (checkMode) process.exit(1);
}

if (checkMode) {
  const existing = fs.existsSync(outPath) ? readFile(outPath) : "";
  if (existing !== output) {
    console.error("actioncode-diff baseline out of date. Re-run script to update docs/actioncode-diff.json.");
    process.exit(1);
  }
  console.log("actioncode-diff baseline up to date.");
} else {
  fs.writeFileSync(outPath, output);
  console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
}
