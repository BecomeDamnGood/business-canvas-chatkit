import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("contract inventory snapshot gate stays aligned with SSOT constants", () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const run = spawnSync(process.execPath, ["scripts/contract_inventory_snapshot_check.mjs"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const output = `${run.stdout || ""}\n${run.stderr || ""}`.trim();
  assert.equal(run.status, 0, output || "contract inventory snapshot gate failed");
});
