#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mcpRoot = path.join(repoRoot, "mcp-server");

function fail(message, extra = []) {
  console.error(`[agent_strict_guard] ${message}`);
  for (const line of extra) console.error(`- ${line}`);
  process.exit(1);
}

function runOrFail(cmd, args, cwd) {
  try {
    execFileSync(cmd, args, {
      cwd,
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch {
    fail(`command failed: ${[cmd, ...args].join(" ")}`);
  }
}

function assertArtifact(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    fail("artifact missing", [path.relative(repoRoot, filePath)]);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const minBytes = Number(options.minBytes || 1);
  if (Buffer.byteLength(content, "utf8") < minBytes) {
    fail("artifact too small", [`${path.relative(repoRoot, filePath)} < ${minBytes} bytes`]);
  }
  const mustInclude = String(options.mustInclude || "");
  if (mustInclude && !content.includes(mustInclude)) {
    fail("artifact content marker missing", [`${path.relative(repoRoot, filePath)} missing "${mustInclude}"`]);
  }
}

console.log("[agent_strict_guard] start");

runOrFail("npm", ["run", "typecheck"], mcpRoot);
runOrFail("node", ["--loader", "ts-node/esm", "scripts/contract-smoke.mjs"], mcpRoot);
runOrFail("npm", ["run", "contract:inventory:snapshot"], mcpRoot);

const artifacts = [
  {
    filePath: path.join(mcpRoot, "ui/step-card.bundled.html"),
    minBytes: 1024,
    mustInclude: "data-ui-version",
  },
  {
    filePath: path.join(repoRoot, "docs/inventory/contract_inventory_snapshot.json"),
    minBytes: 10,
    mustInclude: "\"ssot_versions\"",
  },
];

for (const artifact of artifacts) {
  assertArtifact(artifact.filePath, artifact);
}

console.log("[agent_strict_guard] passed");
console.log(`[agent_strict_guard] artifacts_checked=${artifacts.length}`);
