import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const distMode = args.has("--dist");

const rootArgIndex = process.argv.indexOf("--root");
const repoRoot =
  rootArgIndex >= 0 && process.argv[rootArgIndex + 1]
    ? path.resolve(process.argv[rootArgIndex + 1])
    : defaultRoot;

const uiRoot = distMode ? path.join(repoRoot, "dist", "ui") : path.join(repoRoot, "ui");
const htmlPath = path.join(uiRoot, "step-card.bundled.html");
const assetsDir = path.join(uiRoot, "assets");

if (!fs.existsSync(htmlPath)) {
  throw new Error(`Missing runtime UI html: ${htmlPath}`);
}
if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
  throw new Error(`Missing runtime UI assets directory: ${assetsDir}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const matches = html.match(/(?:\/ui\/)?assets\/[A-Za-z0-9._ -]+/g) || [];
const referencedAssets = Array.from(
  new Set(
    matches
      .map((match) => match.replace(/^\/ui\//, ""))
      .filter((match) => !match.endsWith("/"))
      .map((match) => path.basename(match))
  )
).sort();

for (const assetName of referencedAssets) {
  const assetPath = path.join(assetsDir, assetName);
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    throw new Error(`Missing referenced UI asset: ${assetPath}`);
  }
}

const modeLabel = distMode ? "dist" : "source";
console.log(
  `[verify-ui-runtime-artifacts] Verified ${modeLabel} runtime UI contract (${referencedAssets.length} referenced assets): ${
    referencedAssets.join(", ") || "none"
  }`
);
